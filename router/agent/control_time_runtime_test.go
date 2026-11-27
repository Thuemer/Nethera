package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"
)

const timeTestMAC = "02:00:00:00:00:01"

type fakeTimeFirewall struct {
	state                          timeFirewall
	failCheck, failApply, failRead bool
	writes                         int
	scripts                        []string
}

func (f *fakeTimeFirewall) run(name string, args ...string) ([]byte, error) {
	if name != "nft" {
		return nil, errors.New("unexpected command: " + name)
	}
	if len(args) > 0 && args[0] == "-j" {
		if f.failRead {
			return nil, errors.New("read failed")
		}
		items := []any{map[string]any{"table": map[string]any{"name": "fw4", "family": "inet"}}}
		if f.state.chain {
			items = append(items, map[string]any{"chain": map[string]any{"name": "nethera_time"}})
		}
		if f.state.set {
			items = append(items, map[string]any{"set": map[string]any{"name": timeBlockedSet, "elem": sortedTimeMACs(f.state.blocked)}})
		}
		if f.state.offloaded {
			items = append(items, map[string]any{"flowtable": map[string]any{"name": "ft"}})
		}
		for _, c := range f.state.counters {
			items = append(items, map[string]any{"counter": c})
		}
		return json.Marshal(map[string]any{"nftables": items})
	}
	if args[0] == "-c" {
		if f.failCheck {
			return nil, errors.New("nft syntax error")
		}
		return nil, nil
	}
	if f.failApply {
		return nil, errors.New("nft apply error")
	}
	data, err := os.ReadFile(args[len(args)-1])
	if err != nil {
		return nil, err
	}
	script := string(data)
	f.writes++
	f.scripts = append(f.scripts, script)
	if strings.Contains(script, "table inet fw4 {") {
		old := f.state.counters
		f.state.counters = map[string]timeFirewallCounter{}
		for _, m := range regexp.MustCompile(`counter (nethera_time_[a-f0-9]{12}) \{`).FindAllStringSubmatch(script, -1) {
			c := old[m[1]]
			c.Name = m[1]
			f.state.counters[m[1]] = c
		}
		f.state.chain, f.state.set = true, true
	}
	f.state.blocked = map[string]bool{}
	for _, line := range strings.Split(script, "\n") {
		if strings.HasPrefix(line, "add element inet fw4 "+timeBlockedSet) {
			for _, mac := range regexp.MustCompile(`(?:[a-f0-9]{2}:){5}[a-f0-9]{2}`).FindAllString(line, -1) {
				f.state.blocked[mac] = true
			}
		}
	}
	return nil, nil
}

func timeFixture(t *testing.T) (Sources, *fakeTimeFirewall, *time.Time) {
	t.Helper()
	dir := t.TempDir()
	now := time.Date(2026, 11, 23, 10, 0, 0, 0, time.UTC)
	fw := &fakeTimeFirewall{state: timeFirewall{blocked: map[string]bool{}, counters: map[string]timeFirewallCounter{}}}
	src := Sources{NftDir: filepath.Join(dir, "nft"), NTPFlag: filepath.Join(dir, "ntp"), TimeControlFile: filepath.Join(dir, "control.json"), TimeUsageFile: filepath.Join(dir, "usage.json"), Now: func() time.Time { return now }, Run: fw.run}
	if err := os.WriteFile(src.NTPFlag, nil, 0600); err != nil {
		t.Fatal(err)
	}
	return src, fw, &now
}

func timeRuleControl(rule timeDeviceRule) timeControl {
	return timeControl{V: 1, Version: 1, Timezone: "UTC", UntilClockSync: "OPEN", Devices: map[string]timeDeviceRule{timeTestMAC: rule}}
}

func TestTimeRuntimeWindowWithoutBudgetCreatesFirewall(t *testing.T) {
	src, fw, now := timeFixture(t)
	rt := newTimeRuntime()
	c := timeRuleControl(timeDeviceRule{Windows: []timeWindow{{Days: []string{"MO"}, From: "09:00", Until: "11:00"}}})
	r, err := rt.applyTimeControl(src, c)
	if err != nil || !r.Applied || !fw.state.blocked[timeTestMAC] {
		t.Fatalf("first rule failed: %+v, %v", r, err)
	}
	*now = now.Add(time.Hour)
	r, _ = rt.tickTimeControl(src)
	if !r.Applied || len(fw.state.blocked) != 0 {
		t.Fatalf("window did not end: %+v", r)
	}
	for _, script := range fw.scripts {
		if strings.Contains(script, "flush table") || strings.Contains(script, "nethera_block") {
			t.Fatalf("touches other rules: %s", script)
		}
	}
}

func timeAgentFixture(t *testing.T) (*Agent, *fakeTimeFirewall) {
	t.Helper()
	src, fw, _ := timeFixture(t)
	cfg := Config{RouterID: 1, Broker: "broker.invalid", Transport: TransportTCP, Port: 1883}
	a := NewAgent(cfg, src)
	var err error
	a.conn, err = NewConnection(cfg, nil) // Never connect; test only the message handler.
	if err != nil {
		t.Fatal(err)
	}
	return a, fw
}

func TestTimeAgentRejectsMessagesWithoutChangingSavedOrLiveRules(t *testing.T) {
	a, fw := timeAgentFixture(t)
	c := timeRuleControl(timeDeviceRule{Block: &timeOverrideEnd{}})
	c.Version = 10
	data, _ := json.Marshal(c)
	a.handleTimeControl(data)
	before, err := os.ReadFile(a.src.TimeControlFile)
	if err != nil || !fw.state.blocked[timeTestMAC] {
		t.Fatalf("initial rule not saved and applied: %v", err)
	}
	writes := fw.writes
	for _, invalid := range []string{
		`{"v":1,"version":11,"timezone":"UTC","untilClockSync":"OPEN"}`,
		`{"v":1,"version":9,"timezone":"UTC","untilClockSync":"OPEN","devices":{}}`,
		`{"v":1,"version":10,"timezone":"UTC","untilClockSync":"OPEN","devices":{}}`,
	} {
		a.handleTimeControl([]byte(invalid))
		after, err := os.ReadFile(a.src.TimeControlFile)
		if err != nil || string(after) != string(before) || fw.writes != writes || !fw.state.blocked[timeTestMAC] {
			t.Fatalf("rejected message changed state: %s, %v", invalid, err)
		}
	}
}

func TestTimeAgentDoesNotApplyUnsavedRules(t *testing.T) {
	a, fw := timeAgentFixture(t)
	if err := os.Mkdir(a.src.TimeControlFile, 0700); err != nil {
		t.Fatal(err)
	}
	data, _ := json.Marshal(timeRuleControl(timeDeviceRule{Block: &timeOverrideEnd{}}))
	a.handleTimeControl(data)
	if fw.writes != 0 || a.timeRT.hasControl {
		t.Fatal("unsaved rule reached the firewall")
	}
}

func TestTimeAgentReloadSignalsRefreshOnlyAfterSuccessfulDNSReload(t *testing.T) {
	src, _, _ := timeFixture(t)
	fail := false
	src.Run = func(string, ...string) ([]byte, error) {
		if fail {
			return nil, errors.New("reload failed")
		}
		return nil, nil
	}
	a := NewAgent(Config{}, src)
	a.src.Run("fw4", "reload")
	select {
	case <-a.timeRefresh:
	default:
		t.Fatal("successful DNS reload did not trigger time refresh")
	}
	fail = true
	a.src.Run("fw4", "reload")
	select {
	case <-a.timeRefresh:
		t.Fatal("failed reload triggered time refresh")
	default:
	}
}

func TestTimeRuntimeFirewallFailuresAreNotConfirmedAndRetry(t *testing.T) {
	for _, fault := range []string{"read", "check", "apply"} {
		t.Run(fault, func(t *testing.T) {
			src, fw, _ := timeFixture(t)
			fw.failRead, fw.failCheck, fw.failApply = fault == "read", fault == "check", fault == "apply"
			rt := newTimeRuntime()
			r, err := rt.applyTimeControl(src, timeRuleControl(timeDeviceRule{Block: &timeOverrideEnd{}}))
			if err == nil || r.Applied || r.Error == "" {
				t.Fatalf("false confirmation: %+v %v", r, err)
			}
			if fw.writes != 0 {
				t.Fatal("changed firewall despite failure")
			}
			fw.failRead, fw.failCheck, fw.failApply = false, false, false
			r, _ = rt.tickTimeControl(src)
			if !r.Applied || !fw.state.blocked[timeTestMAC] {
				t.Fatalf("no recovery: %+v", r)
			}
		})
	}
}

func TestTimeRuntimeExternalReloadAndRemovedDevice(t *testing.T) {
	src, fw, _ := timeFixture(t)
	rt := newTimeRuntime()
	c := timeRuleControl(timeDeviceRule{Block: &timeOverrideEnd{}})
	if _, err := rt.applyTimeControl(src, c); err != nil {
		t.Fatal(err)
	}
	fw.state.blocked = map[string]bool{}
	r, _ := rt.tickTimeControl(src)
	if !r.Applied || !fw.state.blocked[timeTestMAC] {
		t.Fatal("did not restore externally cleared set")
	}
	c.Version++
	c.Devices = map[string]timeDeviceRule{}
	r, err := rt.applyTimeControl(src, c)
	if err != nil || !r.Applied || len(fw.state.blocked) != 0 {
		t.Fatalf("delete did not release: %+v %v", r, err)
	}
}

func TestTimeRuntimeRestoresUsageAfterNTPInConfiguredZone(t *testing.T) {
	src, fw, now := timeFixture(t)
	if err := saveUsage(src.TimeUsageFile, usageFile{Date: "2026-11-23", Minutes: map[string]int{timeTestMAC: 45}}); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(src.NTPFlag); err != nil {
		t.Fatal(err)
	}
	*now = time.Date(2026, 11, 20, 10, 0, 0, 0, time.UTC)
	rt := newTimeRuntime()
	c := timeRuleControl(timeDeviceRule{Budgets: map[string]int{"MO": 60}})
	c.Timezone = "Pacific/Auckland"
	if _, err := rt.applyTimeControl(src, c); err != nil {
		t.Fatal(err)
	}
	*now = now.Add(10 * time.Minute)
	rt.tickTimeControl(src)
	if loadUsage(src.TimeUsageFile, "2026-11-23").Minutes[timeTestMAC] != 45 {
		t.Fatal("unsynced boot overwrote usage")
	}
	*now = time.Date(2026, 11, 22, 23, 30, 0, 0, time.UTC) // Monday in Auckland, Sunday in Vienna.
	if err := os.WriteFile(src.NTPFlag, nil, 0600); err != nil {
		t.Fatal(err)
	}
	r, _ := rt.tickTimeControl(src)
	if !r.Applied || r.Devices[timeTestMAC].UsedMinutes != 45 || fw.state.blocked[timeTestMAC] {
		t.Fatalf("lost saved usage: %+v", r)
	}
}

func TestTimeUsageBudgetResetAndFlashWriteInterval(t *testing.T) {
	src, fw, now := timeFixture(t)
	rt := newTimeRuntime()
	c := timeRuleControl(timeDeviceRule{Budgets: map[string]int{"MO": 1}})
	if _, err := rt.applyTimeControl(src, c); err != nil {
		t.Fatal(err)
	}
	name := counterName(timeTestMAC)
	fw.state.counters[name] = timeFirewallCounter{Name: name, Bytes: usageThresholdBytes + 1}
	*now = now.Add(time.Minute)
	r, _ := rt.tickTimeControl(src)
	if !r.Applied || r.Devices[timeTestMAC].UsedMinutes != 1 || !fw.state.blocked[timeTestMAC] {
		t.Fatalf("budget failed: %+v", r)
	}
	if loadUsage(src.TimeUsageFile, "2026-11-23").Minutes[timeTestMAC] != 1 {
		t.Fatal("budget boundary not persisted")
	}
	info, _ := os.Stat(src.TimeUsageFile)
	*now = now.Add(time.Minute)
	rt.tickTimeControl(src)
	after, _ := os.Stat(src.TimeUsageFile)
	if !after.ModTime().Equal(info.ModTime()) {
		t.Fatal("unchanged budget block rewrites flash")
	}
	*now = time.Date(2026, 11, 24, 0, 0, 0, 0, time.UTC)
	r, _ = rt.tickTimeControl(src)
	if r.Devices[timeTestMAC].UsedMinutes != 0 || fw.state.blocked[timeTestMAC] {
		t.Fatalf("midnight failed: %+v", r)
	}
}

func TestTimeUsageMinuteTickerJitterDoesNotDropUsage(t *testing.T) {
	src, fw, now := timeFixture(t)
	rt := newTimeRuntime()
	if _, err := rt.applyTimeControl(src, timeRuleControl(timeDeviceRule{Budgets: map[string]int{"MO": 60}})); err != nil {
		t.Fatal(err)
	}
	name := counterName(timeTestMAC)
	for i := 1; i <= 3; i++ {
		fw.state.counters[name] = timeFirewallCounter{Name: name, Bytes: uint64(i) * (usageThresholdBytes + 1)}
		*now = now.Add(time.Minute - time.Millisecond)
		r, _ := rt.tickTimeControl(src)
		if !r.Applied || r.Devices[timeTestMAC].UsedMinutes != i {
			t.Fatalf("ticker jitter lost a usage minute: %+v", r)
		}
	}
}

func TestTimeUsageCounterResetDoesNotChargeAndAllowStillCounts(t *testing.T) {
	src, fw, now := timeFixture(t)
	rt := newTimeRuntime()
	c := timeRuleControl(timeDeviceRule{Budgets: map[string]int{"MO": 1}, Allow: &timeOverrideEnd{}})
	if _, err := rt.applyTimeControl(src, c); err != nil {
		t.Fatal(err)
	}
	name := counterName(timeTestMAC)
	for _, bytes := range []uint64{50000, 1, 50000} {
		fw.state.counters[name] = timeFirewallCounter{Name: name, Bytes: bytes}
		*now = now.Add(time.Minute)
		rt.tickTimeControl(src)
	}
	r := rt.report(src)
	if r.Devices[timeTestMAC].UsedMinutes != 2 || fw.state.blocked[timeTestMAC] {
		t.Fatalf("counter/reset/allow: %+v", r)
	}
}

func TestTimeRuntimeRejectsRollbackAndVersionReuse(t *testing.T) {
	src, fw, _ := timeFixture(t)
	rt := newTimeRuntime()
	c := timeRuleControl(timeDeviceRule{Block: &timeOverrideEnd{}})
	c.Version = 10
	if _, err := rt.applyTimeControl(src, c); err != nil {
		t.Fatal(err)
	}
	for _, version := range []int64{9, 10} {
		other := c
		other.Version = version
		other.Devices = map[string]timeDeviceRule{}
		r, err := rt.applyTimeControl(src, other)
		if err == nil || r.Applied || !fw.state.blocked[timeTestMAC] {
			t.Fatalf("version accepted: %+v", r)
		}
	}
}

func TestTimeFlowOffloadFailsExplicitlyWithoutChangingSettings(t *testing.T) {
	src, fw, _ := timeFixture(t)
	fw.state.offloaded = true
	r, err := newTimeRuntime().applyTimeControl(src, timeRuleControl(timeDeviceRule{Block: &timeOverrideEnd{}}))
	if err == nil || r.Applied || !strings.Contains(r.Error, "offloading") || fw.writes != 0 {
		t.Fatalf("offloading: %+v %v", r, err)
	}
}

func TestTimeValidationCannotAccidentallyClearRules(t *testing.T) {
	for _, payload := range []string{
		`{"v":1,"version":1,"timezone":"UTC","untilClockSync":"OPEN"}`,
		`{"v":1,"version":1,"timezone":"UTC","untilClockSync":"OPEN","devices":null}`,
		`{"v":1,"version":1,"timezone":"","untilClockSync":"OPEN","devices":{}}`,
		`{"v":1,"version":1,"timezone":"Local","untilClockSync":"OPEN","devices":{}}`,
		`{"v":1,"version":1,"timezone":"UTC","untilClockSync":"OPEN","devices":{},"device":{}}`,
		`{"v":1,"version":1,"timezone":"UTC","untilClockSync":"OPEN","devices":{}} {}`,
		`{"v":1,"version":1,"timezone":"UTC","untilClockSync":"OPEN","devices":{"AA:BB:CC:DD:EE:01":{},"aa:bb:cc:dd:ee:01":{}}}`,
		`{"v":1,"version":1,"timezone":"UTC","untilClockSync":"OPEN","devices":{"aa:bb:cc:dd:ee:01":{"budgets":{"MO":2,"mo":3}}}}`,
	} {
		if _, err := parseTimeControl([]byte(payload)); err == nil {
			t.Fatalf("accepted %s", payload)
		}
	}
}

func TestTimeWindowRepeatedDSTHour(t *testing.T) {
	loc := mustLocation(t, "Europe/Vienna")
	w := timeWindow{Days: []string{"SU"}, From: "02:15", Until: "02:45"}
	for _, hour := range []int{0, 1} {
		now := time.Date(2026, 10, 25, hour, 30, 0, 0, time.UTC).In(loc)
		if !windowActive(w, now) {
			t.Fatalf("second occurrence differs: %s", now)
		}
	}
}

func TestTimeRefreshSignalDoesNotDuplicateUsage(t *testing.T) {
	src, fw, now := timeFixture(t)
	rt := newTimeRuntime()
	if _, err := rt.applyTimeControl(src, timeRuleControl(timeDeviceRule{Budgets: map[string]int{"MO": 60}})); err != nil {
		t.Fatal(err)
	}
	name := counterName(timeTestMAC)
	fw.state.counters[name] = timeFirewallCounter{Name: name, Bytes: 50000}
	*now = now.Add(time.Minute)
	for i := 0; i < 3; i++ {
		if _, err := rt.refresh(src, false); err != nil {
			t.Fatal(err)
		}
	}
	r, _ := rt.tickTimeControl(src)
	if r.Devices[timeTestMAC].UsedMinutes != 1 {
		t.Fatalf("refresh charged usage: %+v", r)
	}
}
