package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"sync"
	"time"
)

// ntpGrace is how long speed waits for the NTP flag before it is published anyway
const ntpGrace = 5 * time.Minute

// Agent collects the telemetry and publishes it through the connection
type Agent struct {
	cfg     Config
	src     Sources
	conn    *Connection
	started time.Time
	// connected is signalled after every connect, so the first cycle does not wait a full interval
	connected chan struct{}
	// control holds the newest DNS control message; an older one that was not applied yet is dropped
	control chan []byte

	// failing remembers which problems are already logged, so each one is reported
	// when it starts and when it ends instead of on every cycle
	mu      sync.Mutex
	failing map[string]bool
}

func NewAgent(cfg Config, src Sources) *Agent {
	return &Agent{cfg: cfg, src: src, started: src.Now(), connected: make(chan struct{}, 1), control: make(chan []byte, 1), failing: map[string]bool{}}
}

// report logs a problem once when it appears and once when it is gone
func (a *Agent) report(what string, err error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err != nil && !a.failing[what] {
		log.Printf("%s: %v", what, err)
	}
	if err == nil && a.failing[what] {
		log.Printf("%s: working again", what)
	}
	a.failing[what] = err != nil
}

// publish encodes one payload and sends it; the error is reported under the stream's name
func (a *Agent) publish(stream string, qos byte, retained bool, payload any, collectErr error) {
	if collectErr != nil {
		a.report(stream, collectErr)
		return
	}
	data, err := json.Marshal(payload)
	if err == nil {
		err = a.conn.Publish("telemetry/"+stream, qos, retained, data)
	}
	a.report(stream, err)
}

// PublishMetadata runs after every connect. Model and firmware only change across a
// reboot or upgrade, so they are sent retained and not on every cycle.
func (a *Agent) PublishMetadata() {
	payload, err := collectMetadata(a.src)
	a.publish("metadata", 1, true, payload, err)
	select {
	case a.connected <- struct{}{}:
	default:
	}
}

// clockSynced reports whether speed may be published: NTP has set the clock, or the
// grace period is over (NTP disabled, or the hotplug event does not exist on this release).
func (a *Agent) clockSynced() bool {
	if _, err := os.Stat(a.src.NTPFlag); err == nil {
		return true
	}
	if a.src.Now().Sub(a.started) < ntpGrace {
		return false
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if !a.failing["ntp"] {
		log.Printf("no NTP synchronization seen after %s, publishing speed anyway", ntpGrace)
		a.failing["ntp"] = true
	}
	return true
}

// Cycle publishes speed, dns and devices once. A stream that fails does not stop the others.
func (a *Agent) Cycle() {
	if a.clockSynced() {
		speed, err := collectSpeed(a.src, a.cfg.WANIface)
		a.publish("speed", 0, false, speed, err)
	}
	dns, err := collectDNS(a.src)
	a.publish("dns", 1, false, dns, err)

	devices, err := collectDevices(a.src)
	a.publish("devices", 1, false, devices, err)
}

// Run publishes a cycle every interval, measured from start to start, until ctx is
// cancelled. While the broker connection is down the cycle is skipped: nothing is queued.
func (a *Agent) Run(ctx context.Context) {
	ticker := time.NewTicker(a.cfg.Interval)
	defer ticker.Stop()
	for {
		select {
		case <-a.connected:
			ticker.Reset(a.cfg.Interval)
		case <-ticker.C:
		case <-ctx.Done():
			return
		}
		if a.conn.Connected() {
			a.Cycle()
		}
	}
}

// DryRun collects every stream once and prints "<topic> <payload>" lines instead of
// publishing. It reports whether every collector worked.
func (a *Agent) DryRun(w io.Writer) bool {
	ok := true
	print := func(stream string, payload any, err error) {
		if err != nil {
			fmt.Fprintf(w, "# %s: %v\n", stream, err)
			ok = false
			return
		}
		data, _ := json.Marshal(payload)
		fmt.Fprintf(w, "%s %s\n", a.cfg.Topic("telemetry/"+stream), data)
	}
	metadata, err := collectMetadata(a.src)
	print("metadata", metadata, err)
	speed, err := collectSpeed(a.src, a.cfg.WANIface)
	print("speed", speed, err)
	dns, err := collectDNS(a.src)
	print("dns", dns, err)
	devices, err := collectDevices(a.src)
	print("devices", devices, err)
	return ok
}

// SubscribeControl runs after every connect. The broker then sends the retained desired
// state at once, so the router catches up with changes made while it was offline.
func (a *Agent) SubscribeControl() {
	a.report("control subscribe", a.conn.Subscribe("config/dns", a.receiveControl))
}

// receiveControl is called by the MQTT library. Applying can take minutes (installing
// adblock-fast), so the message is only handed over to RunControl here.
func (a *Agent) receiveControl(data []byte) {
	for {
		select {
		case a.control <- data:
			return
		default:
			// Drop the older message that is still waiting; only the newest state matters
			select {
			case <-a.control:
			default:
			}
		}
	}
}

// RunControl first applies the state saved on flash, so blocks are active after a power
// cut even without internet. Then it applies every message until ctx is cancelled.
func (a *Agent) RunControl(ctx context.Context) {
	if saved, ok := loadSavedControl(a.src.ControlFile); ok {
		result := applyDNSControl(a.src, saved)
		a.report("control", resultError(result))
	}
	for {
		select {
		case data := <-a.control:
			a.handleControl(data)
		case <-ctx.Done():
			return
		}
	}
}

// handleControl checks one message, applies it, saves it on flash and reports the result
func (a *Agent) handleControl(data []byte) {
	c, err := parseDNSControl(data)
	if err != nil {
		a.report("control", err)
		a.publish("control", 1, true, controlPayload{V: schemaVersion, TS: a.src.Now().Unix(), Error: err.Error()}, nil)
		return
	}
	result := applyDNSControl(a.src, c)
	a.report("control", resultError(result))

	// The checked state is saved even if a part failed, so the next start tries again
	if normalized, err := json.Marshal(c); err == nil {
		a.report("control save", saveControl(a.src.ControlFile, normalized))
	}
	a.publish("control", 1, true, result, nil)
}

func resultError(result controlPayload) error {
	if result.Error == "" {
		return nil
	}
	return fmt.Errorf("%s", result.Error)
}
