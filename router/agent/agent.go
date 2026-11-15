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

	// failing remembers which problems are already logged, so each one is reported
	// when it starts and when it ends instead of on every cycle
	mu      sync.Mutex
	failing map[string]bool
}

func NewAgent(cfg Config, src Sources) *Agent {
	return &Agent{cfg: cfg, src: src, started: src.Now(), connected: make(chan struct{}, 1), failing: map[string]bool{}}
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
