package main

// Independent device-priority worker. It never invokes DNS control or rewrites UCI.
import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	mqtt "github.com/eclipse/paho.mqtt.golang"
	"log"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

const priorityStateFile = "/etc/nethera-priority.json"
const priorityHandle = "7e00:"

var interfacePattern = regexp.MustCompile(`^[a-zA-Z0-9_.:-]{1,15}$`)

type priorityControl struct {
	Bandwidth *priorityBandwidth `json:"bandwidth,omitempty"`
	V         int                `json:"v"`
	Version   int64              `json:"version"`
	Devices   map[string]string  `json:"devices"`
}
type priorityStatus struct {
	Bandwidth priorityBandwidthReport `json:"bandwidth"`
	V         int                     `json:"v"`
	TS        int64                   `json:"ts"`
	Version   int64                   `json:"version"`
	Applied   bool                    `json:"applied"`
	Devices   map[string]string       `json:"devices"`
	Error     string                  `json:"error,omitempty"`
}
type priorityWorker struct {
	run      func(string, ...string) ([]byte, error)
	read     func(string) ([]byte, error)
	glob     func(string) ([]string, error)
	adaptive *priorityAdaptive
}

func newPriorityWorker() priorityWorker {
	w := priorityWorker{run: func(name string, args ...string) ([]byte, error) {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		out, err := exec.CommandContext(ctx, name, args...).CombinedOutput()
		if err != nil {
			return out, fmt.Errorf("%s: %w: %s", name, err, strings.TrimSpace(string(out)))
		}
		return out, nil
	}, read: os.ReadFile, glob: filepath.Glob}
	w.adaptive = newPriorityAdaptive(w.run)
	return w
}
func parsePriority(data []byte) (priorityControl, error) {
	var c priorityControl
	if len(data) > 16384 {
		return c, errors.New("priority message too large")
	}
	if err := json.Unmarshal(data, &c); err != nil {
		return c, err
	}
	if c.V != schemaVersion || c.Version <= 0 || c.Devices == nil || len(c.Devices) > maxDevices {
		return c, errors.New("invalid priority schema, version or devices")
	}
	normalized := map[string]string{}
	for mac, mode := range c.Devices {
		mac = strings.ToLower(strings.TrimSpace(mac))
		if !macPattern.MatchString(mac) || (mode != "high" && mode != "normal") {
			return c, errors.New("invalid MAC or priority mode")
		}
		b, _ := net.ParseMAC(mac)
		if b[0]&1 != 0 || mac == "00:00:00:00:00:00" {
			return c, errors.New("MAC must be unicast")
		}
		if _, exists := normalized[mac]; exists {
			return c, errors.New("duplicate normalized MAC")
		}
		normalized[mac] = mode
	}
	if c.Bandwidth != nil {
		if err := c.Bandwidth.validate(); err != nil {
			return c, err
		}
	}
	c.Devices = normalized
	return c, nil
}
func (w priorityWorker) command(name string, args ...string) error {
	_, err := w.run(name, args...)
	return err
}
func (w priorityWorker) discover() ([]string, []string, error) {
	raw, err := w.run("ubus", "call", "network.interface.wan", "status")
	if err != nil {
		return nil, nil, err
	}
	var wan struct {
		Up     bool   `json:"up"`
		Device string `json:"l3_device"`
	}
	if err = json.Unmarshal(raw, &wan); err != nil {
		return nil, nil, err
	}
	if !wan.Up || !interfacePattern.MatchString(wan.Device) {
		return nil, nil, errors.New("WAN is not ready")
	}
	raw, err = w.run("ubus", "call", "network.interface.lan", "status")
	if err != nil {
		return nil, nil, err
	}
	var lan struct {
		Device string `json:"l3_device"`
	}
	if err = json.Unmarshal(raw, &lan); err != nil {
		return nil, nil, err
	}
	if !interfacePattern.MatchString(lan.Device) {
		return nil, nil, errors.New("LAN is not ready")
	}
	return []string{wan.Device, lan.Device}, []string{lan.Device}, nil
}
func (w priorityWorker) qdisc(dev string) (string, error) {
	out, err := w.run("tc", "qdisc", "show", "dev", dev)
	return string(out), err
}
func ownsPriorityQueue(out string) bool { return ownedPriorityRoot(out) != "" }
func freePriorityQueue(out string) bool {
	for _, line := range strings.Split(out, "\n") {
		if strings.Contains(" "+strings.TrimSpace(line)+" ", " root ") && !strings.HasPrefix(line, "qdisc noqueue 0:") {
			return false
		}
	}
	return true
}
func (w priorityWorker) ownedInterfaces() ([]string, error) {
	raw, err := w.run("tc", "qdisc", "show")
	if err != nil {
		return nil, err
	}
	result := []string{}
	for _, line := range strings.Split(string(raw), "\n") {
		if strings.HasPrefix(line, "qdisc drr 7e00: dev ") || strings.HasPrefix(line, "qdisc htb 7d00: dev ") || strings.HasPrefix(line, "qdisc cake 7d00: dev ") {
			f := strings.Fields(line)
			if len(f) > 4 && interfacePattern.MatchString(f[4]) {
				result = append(result, f[4])
			}
		}
	}
	return result, nil
}
func (w priorityWorker) cleanup() error {
	if w.adaptive != nil {
		if err := w.adaptive.stop(); err != nil {
			return err
		}
	}
	// Inspect before deleting; never flush fw4 or delete a foreign qdisc.
	raw, err := w.run("nft", "list", "tables")
	if err != nil {
		return err
	}
	if strings.Contains(string(raw), "table inet nethera_priority\n") {
		if err = w.command("nft", "delete", "table", "inet", "nethera_priority"); err != nil {
			return err
		}
	}
	devices, err := w.ownedInterfaces()
	if err != nil {
		return err
	}
	for _, dev := range devices {
		if err = w.deleteOwnedQueue(dev); err != nil {
			return err
		}
	}
	return nil
}

// Neighbor entries reflect DHCP, static IPv4 and IPv6 addresses, and expire naturally.
func (w priorityWorker) addresses() (map[string][]string, error) {
	result := map[string][]string{}
	for _, family := range []string{"-4", "-6"} {
		raw, err := w.run("ip", family, "neigh", "show")
		if err != nil {
			return nil, err
		}
		for _, line := range strings.Split(string(raw), "\n") {
			f := strings.Fields(line)
			if len(f) < 5 || strings.Contains(line, "FAILED") || strings.Contains(line, "INCOMPLETE") {
				continue
			}
			ip := net.ParseIP(f[0])
			if ip == nil {
				continue
			}
			for i := 1; i+1 < len(f); i++ {
				if f[i] == "lladdr" {
					mac := strings.ToLower(f[i+1])
					if macPattern.MatchString(mac) {
						result[mac] = append(result[mac], ip.String())
					}
				}
			}
		}
	}
	return result, nil
}
func priorityRules(c priorityControl, addresses map[string][]string) string {
	var b strings.Builder
	b.WriteString("table inet nethera_priority {\n chain classify {\n type filter hook forward priority -149; policy accept;\n")
	// Pin normal traffic to Bulk, then promote selected devices to Best Effort.
	// Never rewrite DSCP or conntrack marks.
	b.WriteString(" meta priority set 0x7d000001\n")
	for _, mac := range sortedPriorityMACs(c) {
		if c.Devices[mac] != "high" {
			continue
		}
		fmt.Fprintf(&b, " ether saddr %s counter meta priority set 0x7d000002\n", mac)
		for _, ip := range addresses[mac] {
			family := "ip6"
			if net.ParseIP(ip).To4() != nil {
				family = "ip"
			}
			fmt.Fprintf(&b, " %s daddr %s counter meta priority set 0x7d000002\n", family, ip)
		}
	}
	b.WriteString(" }\n}\n")
	return b.String()
}
func sortedPriorityMACs(c priorityControl) []string {
	macs := []string{}
	for mac := range c.Devices {
		macs = append(macs, mac)
	}
	sort.Strings(macs)
	return macs
}
func (w priorityWorker) reconcile(c priorityControl) priorityStatus {
	result := priorityStatus{V: 1, TS: time.Now().Unix(), Version: c.Version, Devices: c.Devices}
	read := w.read
	if read == nil {
		read = os.ReadFile
	}
	bandwidth, source, err := resolvePriorityBandwidth(c, read)
	result.Bandwidth = priorityBandwidthReport{priorityBandwidth: bandwidth, Source: source}
	if err == nil {
		err = w.applyPriority(c, bandwidth)
	}
	if w.adaptive != nil {
		if p, e := w.adaptive.plan(c, bandwidth); e == nil && p != nil {
			result.Bandwidth.Adaptive = true
			result.Bandwidth.MinDownloadKbit = p.MinDownloadKbit
			if devices, _, e := w.discover(); e == nil && len(devices) > 1 {
				result.Bandwidth.CurrentDownloadKbit, _ = w.cakeRateReadback(devices[1], p.MinDownloadKbit, bandwidth.DownloadKbit, true)
			}
		}
	}
	result.Bandwidth.Active = err == nil && bandwidth.Enabled && hasHighPriority(c)
	if err != nil {
		result.Error = err.Error()
	} else {
		result.Applied = true
	}
	return result
}
func hasHighPriority(c priorityControl) bool {
	for _, mode := range c.Devices {
		if mode == "high" {
			return true
		}
	}
	return false
}
func (w priorityWorker) applyPriority(c priorityControl, bandwidth priorityBandwidth) error {
	if !hasHighPriority(c) {
		return w.cleanup()
	}
	if !bandwidth.Enabled {
		if err := w.cleanup(); err != nil {
			return err
		}
		return errors.New("Bandbreitensteuerung fehlt oder ist deaktiviert; Anschlussraten einstellen")
	}
	for _, option := range []string{"flow_offloading", "flow_offloading_hw"} {
		out, _ := w.run("uci", "-q", "get", "firewall.@defaults[0]."+option)
		if strings.TrimSpace(string(out)) == "1" {
			return errors.New("flow offloading enabled; existing configuration left unchanged")
		}
	}
	devices, _, err := w.discover()
	if err != nil {
		return err
	}
	// Preflight every interface before creating any queue.
	for _, dev := range devices {
		out, e := w.qdisc(dev)
		if e != nil {
			return e
		}
		if !ownsPriorityQueue(out) && !freePriorityQueue(out) {
			return fmt.Errorf("foreign root qdisc on %s; left unchanged", dev)
		}
	}
	addresses, err := w.addresses()
	if err != nil {
		return err
	}
	var unmapped []string
	for _, mac := range sortedPriorityMACs(c) {
		if c.Devices[mac] == "high" && len(addresses[mac]) == 0 {
			unmapped = append(unmapped, mac)
		}
	}
	var adaptivePlan *priorityAdaptiveConfig
	adaptiveRunning := false
	if w.adaptive != nil {
		adaptivePlan, err = w.adaptive.plan(c, bandwidth)
		if err != nil {
			_ = w.adaptive.stop()
			return err
		}
		if adaptivePlan == nil {
			if err = w.adaptive.stop(); err != nil {
				return err
			}
		} else {
			adaptiveRunning, err = w.adaptive.prepare(*adaptivePlan, bandwidth, devices[0], devices[1])
			if err != nil {
				return err
			}
		}
	}
	for i, dev := range devices {
		rate := bandwidth.UploadKbit
		if i == 1 {
			rate = bandwidth.DownloadKbit
		}
		if i == 1 && adaptivePlan != nil {
			if adaptiveRunning {
				if _, e := w.cakeRateReadback(dev, adaptivePlan.MinDownloadKbit, bandwidth.DownloadKbit, true); e == nil {
					continue
				}
				if err = w.adaptive.stop(); err != nil {
					return err
				}
			}
			rate = adaptivePlan.BaseDownloadKbit
		}
		if err = w.ensureShapedQueue(dev, rate, i == 1); err != nil {
			return err
		}
	}
	existing, err := w.ownedInterfaces()
	if err != nil {
		return err
	}
	for _, old := range existing {
		found := false
		for _, dev := range devices {
			found = found || dev == old
		}
		if !found {
			if err = w.deleteOwnedQueue(old); err != nil {
				return err
			}
		}
	}
	rules := priorityRules(c, addresses)
	tables, err := w.run("nft", "list", "tables")
	if err != nil {
		return err
	}
	script := rules
	if strings.Contains(string(tables), "table inet nethera_priority\n") {
		script = "delete table inet nethera_priority\n" + rules
	}
	// nft executes the batch atomically; syntax errors preserve the previous rules.
	f, err := os.CreateTemp("/tmp", "nethera-priority-*.nft")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if _, err = f.WriteString(script); err != nil {
		f.Close()
		return err
	}
	f.Close()
	if err = w.command("nft", "-c", "-f", f.Name()); err != nil {
		return err
	}
	if err = w.command("nft", "-f", f.Name()); err != nil {
		return err
	}
	out, err := w.run("nft", "list", "table", "inet", "nethera_priority")
	if err != nil {
		return err
	}
	if !strings.Contains(string(out), "meta priority set 7d00:1") {
		return errors.New("normal CAKE tin readback failed")
	}
	for _, mac := range sortedPriorityMACs(c) {
		if c.Devices[mac] == "high" {
			if !strings.Contains(string(out), "ether saddr "+mac) || !strings.Contains(string(out), "meta priority set 7d00:2") {
				return fmt.Errorf("priority rule readback failed for %s", mac)
			}
			for _, ip := range addresses[mac] {
				if !strings.Contains(string(out), "daddr "+ip+" ") {
					return fmt.Errorf("priority address readback failed for %s", mac)
				}
			}
		}
	}
	if len(unmapped) > 0 {
		return fmt.Errorf("no current IP neighbor for %s; waiting for device", strings.Join(unmapped, ", "))
	}
	if adaptivePlan != nil {
		return w.adaptive.start()
	}
	return nil
}
func runPriority(ctx context.Context, cfg Config) error {
	worker := newPriorityWorker()
	defer worker.adaptive.stop()
	messages := make(chan []byte, 1)
	connected := make(chan struct{}, 1)
	options := mqtt.NewClientOptions().AddBroker(cfg.BrokerURL()).SetClientID(fmt.Sprintf("nethera-priority-%d", cfg.RouterID)).SetUsername(cfg.Username).SetPassword(cfg.Password).SetAutoReconnect(true).SetConnectRetry(true).SetConnectRetryInterval(10 * time.Second).SetKeepAlive(30 * time.Second).SetConnectTimeout(15 * time.Second).SetWriteTimeout(10 * time.Second)
	if cfg.Transport == TransportWSS {
		tls, err := newTLSConfig(cfg.TLSCA)
		if err != nil {
			return err
		}
		options.SetTLSConfig(tls)
	}
	options.SetOnConnectHandler(func(client mqtt.Client) {
		token := client.Subscribe(cfg.Topic("config/priority"), 1, func(_ mqtt.Client, m mqtt.Message) {
			data := append([]byte(nil), m.Payload()...)
			select {
			case <-messages:
			default:
			}
			messages <- data
		})
		if token.WaitTimeout(10*time.Second) && token.Error() == nil {
			log.Print("priority MQTT subscription ready")
			select {
			case connected <- struct{}{}:
			default:
			}
		} else {
			log.Print("priority subscription failed")
		}
	})
	client := mqtt.NewClient(options)
	client.Connect()
	defer client.Disconnect(250)
	var current *priorityControl
	if data, err := os.ReadFile(priorityStateFile); err == nil {
		if c, err := parsePriority(data); err == nil {
			current = &c
		}
	}
	tick := time.NewTicker(30 * time.Second)
	defer tick.Stop()
	apply := func() {
		if current == nil {
			return
		}
		result := worker.reconcile(*current)
		data, _ := json.Marshal(result)
		if result.Error != "" {
			log.Print(result.Error)
		}
		if client.IsConnectionOpen() {
			token := client.Publish(cfg.Topic("telemetry/priority"), 1, true, data)
			token.WaitTimeout(10 * time.Second)
		}
	}
	apply()
	for {
		select {
		case data := <-messages:
			c, err := parsePriority(data)
			if err != nil {
				log.Printf("priority rejected: %v", err)
				continue
			}
			if current != nil && c.Version < current.Version {
				log.Print("stale priority message ignored")
				continue
			}
			if current != nil && c.Version == current.Version {
				old, _ := json.Marshal(current)
				next, _ := json.Marshal(c)
				if string(old) != string(next) {
					log.Print("conflicting priority version ignored")
					continue
				}
			}
			normalized, _ := json.Marshal(c)
			if err = saveControl(priorityStateFile, normalized); err != nil {
				log.Printf("priority persist failed: %v", err)
				continue
			}
			current = &c
			apply()
		case <-tick.C:
			apply()
		case <-connected:
			apply()
		case <-ctx.Done():
			return nil
		}
	}
}
