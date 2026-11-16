package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// testSources reads the files captured from the Cudy WR3000S (anonymized) in testdata.
// commands maps a command line to the fixture file with its output; anything else fails.
func testSources(t *testing.T, commands map[string]string) Sources {
	t.Helper()
	return Sources{
		ProcNetDev: "testdata/proc_net_dev",
		DHCPLeases: "testdata/dhcp.leases",
		ProcNetARP: "testdata/proc_net_arp",
		NTPFlag:    filepath.Join(t.TempDir(), "ntp-synced"),
		Run: func(name string, args ...string) ([]byte, error) {
			line := strings.Join(append([]string{name}, args...), " ")
			if name == "ping" || name == "kill" {
				return nil, nil
			}
			file, ok := commands[line]
			if !ok {
				return nil, errors.New("command not available: " + line)
			}
			return os.ReadFile(filepath.Join("testdata", file))
		},
		Now:   func() time.Time { return time.Unix(1791890000, 0) },
		Sleep: func(time.Duration) {},
	}
}

// routerCommands is what the test router answers
var routerCommands = map[string]string{
	"ubus call system board":           "ubus_system_board.json",
	"ubus call dnsmasq metrics":        "ubus_dnsmasq_metrics.json",
	"ubus call network.interface dump": "ubus_network_interface_dump.json",
	"iw dev":                           "iw_dev.txt",
	"iw dev phy0-ap0 station dump":     "iw_station_dump_phy0-ap0.txt",
	"iw dev phy1-sta0 station dump":    "iw_station_dump_phy1-sta0.txt",
	"logread -e queries forwarded":     "logread_dnsmasq.txt",
	"pidof dnsmasq":                    "pidof_dnsmasq.txt",
}

func without(commands map[string]string, removed ...string) map[string]string {
	result := map[string]string{}
	for k, v := range commands {
		result[k] = v
	}
	for _, k := range removed {
		delete(result, k)
	}
	return result
}

func TestCollectMetadata(t *testing.T) {
	got, err := collectMetadata(testSources(t, routerCommands))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Model != "Cudy WR3000S v1" {
		t.Errorf("model = %q, want Cudy WR3000S v1", got.Model)
	}
	if !strings.HasPrefix(got.Firmware, "OpenWrt 25.12.5") {
		t.Errorf("firmware = %q, want it to start with OpenWrt 25.12.5", got.Firmware)
	}
}

func TestWANInterface(t *testing.T) {
	// On the test router the uplink is the Wi-Fi client interface; the wan port is down
	iface, err := wanInterface(testSources(t, routerCommands), "")
	if err != nil || iface != "phy1-sta0" {
		t.Errorf("wifi uplink: got %q, %v, want phy1-sta0", iface, err)
	}

	cabled := without(routerCommands)
	cabled["ubus call network.interface dump"] = "ubus_network_interface_dump_wan.json"
	iface, err = wanInterface(testSources(t, cabled), "")
	if err != nil || iface != "wan" {
		t.Errorf("cabled uplink: got %q, %v, want wan", iface, err)
	}

	iface, err = wanInterface(testSources(t, nil), "pppoe-wan")
	if err != nil || iface != "pppoe-wan" {
		t.Errorf("configured: got %q, %v, want pppoe-wan without asking ubus", iface, err)
	}
}

func TestCollectSpeed(t *testing.T) {
	got, err := collectSpeed(testSources(t, routerCommands), "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := speedPayload{V: 1, TS: 1791890000, Iface: "phy1-sta0", RxBytes: 84811546, TxBytes: 18572413}
	if got != want {
		t.Errorf("speed = %+v, want %+v", got, want)
	}

	if _, err := collectSpeed(testSources(t, routerCommands), "eth9"); err == nil {
		t.Error("expected an error for an interface that is not in /proc/net/dev")
	}
}

func TestCollectDNS(t *testing.T) {
	want := dnsPayload{V: 1, TS: 1791890000, Forwarded: 723, AnsweredLocally: 263}

	got, err := collectDNS(testSources(t, routerCommands))
	if err != nil || got != want {
		t.Errorf("ubus: got %+v, %v, want %+v", got, err, want)
	}

	// Without the ubus method, the newest statistics line of the system log is used
	got, err = collectDNS(testSources(t, without(routerCommands, "ubus call dnsmasq metrics")))
	if err != nil || got != want {
		t.Errorf("logread fallback: got %+v, %v, want %+v", got, err, want)
	}

	if _, err := collectDNS(testSources(t, without(routerCommands, "ubus call dnsmasq metrics", "logread -e queries forwarded"))); err == nil {
		t.Error("expected an error when neither source has the counters")
	}
}

func TestCollectDevices(t *testing.T) {
	got, err := collectDevices(testSources(t, routerCommands))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	wantLeases := []lease{
		{MAC: "02:00:00:00:00:01", IP: "192.168.1.132", Hostname: "device-1"},
		{MAC: "02:00:00:00:00:03", IP: "192.168.1.192", Hostname: "device-2"},
	}
	if len(got.Leases) != len(wantLeases) {
		t.Fatalf("leases = %+v, want %+v", got.Leases, wantLeases)
	}
	for i := range wantLeases {
		if got.Leases[i] != wantLeases[i] {
			t.Errorf("lease %d = %+v, want %+v", i, got.Leases[i], wantLeases[i])
		}
	}
	// Both devices answered; the third ARP entry is the upstream gateway
	for _, mac := range []string{"02:00:00:00:00:01", "02:00:00:00:00:03"} {
		if !contains(got.Reachable, mac) {
			t.Errorf("reachable %v lacks %s", got.Reachable, mac)
		}
	}
	// Only device-1 is associated with the router's access point. The second station is
	// the upstream access point seen by the client interface; it holds no lease.
	wantWifi := []string{"02:00:00:00:00:01", "02:00:00:00:00:07"}
	if strings.Join(got.Wifi, ",") != strings.Join(wantWifi, ",") {
		t.Errorf("wifi = %v, want %v", got.Wifi, wantWifi)
	}
}

func TestCollectDevicesWithoutIwAndLeases(t *testing.T) {
	src := testSources(t, nil)
	src.DHCPLeases = filepath.Join(t.TempDir(), "no-leases")
	got, err := collectDevices(src)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// The contract needs the three arrays to be present, also when they are empty
	data, _ := json.Marshal(got)
	for _, want := range []string{`"leases":[]`, `"wifi":[]`} {
		if !strings.Contains(string(data), want) {
			t.Errorf("payload %s lacks %s", data, want)
		}
	}
}

func TestDevicesPayloadEscapesHostnames(t *testing.T) {
	leases := filepath.Join(t.TempDir(), "dhcp.leases")
	os.WriteFile(leases, []byte(`1791932542 AA:BB:CC:00:11:22 192.168.1.50 Evil"Ho\st 01:aa`+"\n"), 0o600)
	src := testSources(t, routerCommands)
	src.DHCPLeases = leases

	got, err := collectDevices(src)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	data, err := json.Marshal(got)
	if err != nil {
		t.Fatalf("payload is not encodable: %v", err)
	}
	var back devicesPayload
	if err := json.Unmarshal(data, &back); err != nil {
		t.Fatalf("payload is not valid JSON: %v", err)
	}
	if back.Leases[0].Hostname != `Evil"Ho\st` || back.Leases[0].MAC != "aa:bb:cc:00:11:22" {
		t.Errorf("lease = %+v, want the hostname unchanged and the MAC in lower case", back.Leases[0])
	}
}

// TestPayloadsMatchContract checks field names and JSON types against what the backend's
// TelemetryPayloadParser requires (schema version 1).
func TestPayloadsMatchContract(t *testing.T) {
	src := testSources(t, routerCommands)
	metadata, _ := collectMetadata(src)
	speed, _ := collectSpeed(src, "")
	dns, _ := collectDNS(src)
	devices, _ := collectDevices(src)

	tests := []struct {
		name     string
		payload  any
		integers []string
		strings  []string
		arrays   []string
	}{
		{"metadata", metadata, nil, []string{"model", "firmware"}, nil},
		{"speed", speed, []string{"rxBytes", "txBytes"}, []string{"iface"}, nil},
		{"dns", dns, []string{"forwarded", "answeredLocally"}, nil, nil},
		{"devices", devices, nil, nil, []string{"leases", "reachable", "wifi"}},
	}
	for _, tt := range tests {
		data, err := json.Marshal(tt.payload)
		if err != nil {
			t.Fatalf("%s: %v", tt.name, err)
		}
		var fields map[string]any
		if err := json.Unmarshal(data, &fields); err != nil {
			t.Fatalf("%s: not a JSON object: %v", tt.name, err)
		}
		if fields["v"] != float64(1) {
			t.Errorf("%s: v = %v, want 1", tt.name, fields["v"])
		}
		for _, key := range append([]string{"ts"}, tt.integers...) {
			number, ok := fields[key].(float64)
			if !ok || number != float64(int64(number)) {
				t.Errorf("%s: %s = %v, want an integer", tt.name, key, fields[key])
			}
		}
		for _, key := range tt.strings {
			if _, ok := fields[key].(string); !ok {
				t.Errorf("%s: %s = %v, want a string", tt.name, key, fields[key])
			}
		}
		for _, key := range tt.arrays {
			if _, ok := fields[key].([]any); !ok {
				t.Errorf("%s: %s = %v, want an array", tt.name, key, fields[key])
			}
		}
	}
}

func TestClockSyncedWaitsForNTPOrGracePeriod(t *testing.T) {
	src := testSources(t, routerCommands)
	now := time.Unix(1791890000, 0)
	src.Now = func() time.Time { return now }
	agent := NewAgent(Config{RouterID: 1}, src)

	if agent.clockSynced() {
		t.Error("speed must wait while NTP has not synchronized")
	}
	now = now.Add(ntpGrace + time.Second)
	if !agent.clockSynced() {
		t.Error("speed must be published after the grace period, also without NTP")
	}

	fresh := NewAgent(Config{RouterID: 1}, src)
	now = fresh.started
	os.WriteFile(src.NTPFlag, nil, 0o600)
	if !fresh.clockSynced() {
		t.Error("speed must be published as soon as the NTP flag exists")
	}
}

func TestDryRunPrintsAllStreams(t *testing.T) {
	var out bytes.Buffer
	agent := NewAgent(Config{RouterID: 1}, testSources(t, routerCommands))
	if !agent.DryRun(&out) {
		t.Errorf("dry run reported a failure:\n%s", out.String())
	}
	for _, topic := range []string{"metadata", "speed", "dns", "devices"} {
		if !strings.Contains(out.String(), "nethera/1/telemetry/"+topic+" {") {
			t.Errorf("dry run output lacks %s:\n%s", topic, out.String())
		}
	}
}

func contains(values []string, want string) bool {
	for _, v := range values {
		if v == want {
			return true
		}
	}
	return false
}
