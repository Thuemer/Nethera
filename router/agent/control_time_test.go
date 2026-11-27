package main

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func mustLocation(t *testing.T, name string) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation(name)
	if err != nil {
		t.Fatalf("load location %s: %v", name, err)
	}
	return loc
}

func withLoc(t *testing.T, loc *time.Location, y int, m time.Month, d, h, mn int) time.Time {
	t.Helper()
	return time.Date(y, m, d, h, mn, 0, 0, loc)
}

func TestParseTimeControlAccepts(t *testing.T) {
	data := []byte(`{
		"v": 1, "version": 10,
		"timezone": "Europe/Vienna", "untilClockSync": "OPEN",
		"devices": {"AA:BB:CC:DD:EE:01": {
			"windows": [{"days": ["MO","FR"], "from": "21:00", "until": "07:00"}],
			"budgets": {"MO": 60, "SA": 240},
			"block": null, "allow": null
		}}
	}`)
	c, err := parseTimeControl(data)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if c.Version != 10 || c.UntilClockSync != "OPEN" {
		t.Fatalf("fields not kept: %+v", c)
	}
	rule, ok := c.Devices["aa:bb:cc:dd:ee:01"]
	if !ok {
		t.Fatalf("MAC not lowercased: %v", c.Devices)
	}
	if len(rule.Windows) != 1 || rule.Windows[0].From != "21:00" {
		t.Fatalf("window missing: %+v", rule.Windows)
	}
	if rule.Budgets["MO"] != 60 || rule.Budgets["SA"] != 240 {
		t.Fatalf("budgets wrong: %+v", rule.Budgets)
	}
}

func TestParseTimeControlRejects(t *testing.T) {
	tests := []struct {
		name    string
		payload string
		want    string
	}{
		{"bad JSON", "not json", "invalid JSON"},
		{"schema version", `{"v": 2, "version": 1, "timezone": "Europe/Vienna", "untilClockSync": "OPEN"}`, "schema"},
		{"non-positive version", `{"v": 1, "version": 0, "timezone": "Europe/Vienna", "untilClockSync": "OPEN"}`, "version"},
		{"bad timezone", `{"v": 1, "version": 1, "timezone": "Mars/Olympus", "untilClockSync": "OPEN"}`, "time zone"},
		{"bad untilClockSync", `{"v": 1, "version": 1, "timezone": "UTC", "untilClockSync": "MAYBE"}`, "OPEN or BLOCK"},
		{"bad MAC", `{"v": 1, "version": 1, "timezone": "UTC", "untilClockSync": "OPEN", "devices": {"AA:BB:CC:DD:EE": {}}}`, "MAC"},
		{"unknown weekday", `{"v": 1, "version": 1, "timezone": "UTC", "untilClockSync": "OPEN", "devices": {"aa:bb:cc:dd:ee:01": {"windows": [{"days": ["XY"], "from": "08:00", "until": "09:00"}]}}}`, "weekday"},
		{"bad time", `{"v": 1, "version": 1, "timezone": "UTC", "untilClockSync": "OPEN", "devices": {"aa:bb:cc:dd:ee:01": {"windows": [{"days": ["MO"], "from": "25:00", "until": "09:00"}]}}}`, "time"},
		{"equal from/until", `{"v": 1, "version": 1, "timezone": "UTC", "untilClockSync": "OPEN", "devices": {"aa:bb:cc:dd:ee:01": {"windows": [{"days": ["MO"], "from": "08:00", "until": "08:00"}]}}}`, "both"},
		{"budget out of range", `{"v": 1, "version": 1, "timezone": "UTC", "untilClockSync": "OPEN", "devices": {"aa:bb:cc:dd:ee:01": {"budgets": {"MO": 2000}}}}`, "budget"},
		{"bad override until", `{"v": 1, "version": 1, "timezone": "UTC", "untilClockSync": "OPEN", "devices": {"aa:bb:cc:dd:ee:01": {"block": {"until": -5}}}}`, "Unix"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := parseTimeControl([]byte(tc.payload))
			if err == nil {
				t.Fatalf("expected error for %s", tc.name)
			}
			if !strings.Contains(strings.ToLower(err.Error()), strings.ToLower(tc.want)) {
				t.Fatalf("want error about %q, got %v", tc.want, err)
			}
		})
	}
}

func TestEvaluateFridayNightWindow(t *testing.T) {
	loc := mustLocation(t, "Europe/Vienna")
	rule := timeDeviceRule{Windows: []timeWindow{{Days: []string{"MO", "TU", "WE", "TH", "FR"}, From: "21:00", Until: "07:00"}}}

	// Saturday 02:00 → still blocked by Friday's window
	now := withLoc(t, loc, 2026, 11, 21, 2, 0) // 2026-11-21 is a Saturday
	r := evaluate(rule, now, 0, true, "OPEN")
	if !r.Blocked || r.Reason != reasonWindow {
		t.Fatalf("Saturday 02:00 should be blocked, got %+v", r)
	}

	// Saturday 07:00 → just unblocked
	now = withLoc(t, loc, 2026, 11, 21, 7, 0)
	r = evaluate(rule, now, 0, true, "OPEN")
	if r.Blocked {
		t.Fatalf("Saturday 07:00 should be open, got %+v", r)
	}

	// Friday 21:00 → start of window
	now = withLoc(t, loc, 2026, 11, 20, 21, 0)
	r = evaluate(rule, now, 0, true, "OPEN")
	if !r.Blocked || r.Reason != reasonWindow {
		t.Fatalf("Friday 21:00 should be blocked, got %+v", r)
	}

	// Monday 02:00 → no window for Sunday, so not blocked
	now = withLoc(t, loc, 2026, 11, 23, 2, 0) // 2026-11-23 is Monday
	r = evaluate(rule, now, 0, true, "OPEN")
	if r.Blocked {
		t.Fatalf("Monday 02:00 should be open (no Sunday window), got %+v", r)
	}
}

func TestEvaluateBudgetReachedAndResets(t *testing.T) {
	loc := mustLocation(t, "Europe/Vienna")
	rule := timeDeviceRule{Budgets: map[string]int{"MO": 60}}

	// Monday 10:00 after 59 used minutes → still open
	now := withLoc(t, loc, 2026, 11, 23, 10, 0)
	r := evaluate(rule, now, 59, true, "OPEN")
	if r.Blocked {
		t.Fatalf("59 of 60 should be open, got %+v", r)
	}
	// After 60 minutes → budget block
	r = evaluate(rule, now, 60, true, "OPEN")
	if !r.Blocked || r.Reason != reasonBudget {
		t.Fatalf("60 of 60 should be blocked, got %+v", r)
	}
	// Tuesday → no budget entry → open
	now = withLoc(t, loc, 2026, 11, 24, 10, 0)
	r = evaluate(rule, now, 999, true, "OPEN")
	if r.Blocked {
		t.Fatalf("Tuesday without budget should be open, got %+v", r)
	}
}

func TestEvaluateAllowSuspendsBudgetButCountsUsage(t *testing.T) {
	loc := mustLocation(t, "Europe/Vienna")
	allowOpen := &timeOverrideEnd{Until: nil}
	rule := timeDeviceRule{
		Budgets: map[string]int{"MO": 60},
		Allow:   allowOpen,
	}
	now := withLoc(t, loc, 2026, 11, 23, 10, 0)
	r := evaluate(rule, now, 120, true, "OPEN")
	if r.Blocked {
		t.Fatalf("allow should suspend budget, got %+v", r)
	}
	if !r.CountUsage {
		t.Fatalf("usage still counts under allow, got %+v", r)
	}
}

func TestEvaluateBlockBeatsAllow(t *testing.T) {
	loc := mustLocation(t, "Europe/Vienna")
	rule := timeDeviceRule{
		Block: &timeOverrideEnd{Until: nil},
		Allow: &timeOverrideEnd{Until: nil},
	}
	r := evaluate(rule, withLoc(t, loc, 2026, 11, 23, 10, 0), 0, true, "OPEN")
	if !r.Blocked || r.Reason != reasonManual {
		t.Fatalf("block beats allow, got %+v", r)
	}
}

func TestEvaluateOverrideExpiry(t *testing.T) {
	loc := mustLocation(t, "Europe/Vienna")
	now := withLoc(t, loc, 2026, 11, 23, 10, 0)
	expired := now.Add(-1 * time.Minute).Unix()
	future := now.Add(1 * time.Hour).Unix()

	ruleExpired := timeDeviceRule{Block: &timeOverrideEnd{Until: &expired}}
	if evaluate(ruleExpired, now, 0, true, "OPEN").Blocked {
		t.Fatalf("expired block should not apply")
	}
	ruleActive := timeDeviceRule{Block: &timeOverrideEnd{Until: &future}}
	if !evaluate(ruleActive, now, 0, true, "OPEN").Blocked {
		t.Fatalf("active block with future until should apply")
	}
}

func TestEvaluateClockNotSynced(t *testing.T) {
	loc := mustLocation(t, "Europe/Vienna")
	now := withLoc(t, loc, 2026, 11, 21, 2, 0) // would be blocked by Friday-night window
	rule := timeDeviceRule{Windows: []timeWindow{{Days: []string{"FR"}, From: "21:00", Until: "07:00"}}}

	// OPEN: no evaluation before NTP → open, no counting
	r := evaluate(rule, now, 0, false, "OPEN")
	if r.Blocked || r.CountUsage {
		t.Fatalf("OPEN without clock should open and not count, got %+v", r)
	}
	// BLOCK: devices with any rule are blocked with reason clock
	r = evaluate(rule, now, 0, false, "BLOCK")
	if !r.Blocked || r.Reason != reasonClock {
		t.Fatalf("BLOCK without clock should block, got %+v", r)
	}
	// Indefinite allow overrides even BLOCK
	ruleAllow := timeDeviceRule{Windows: rule.Windows, Allow: &timeOverrideEnd{Until: nil}}
	r = evaluate(ruleAllow, now, 0, false, "BLOCK")
	if r.Blocked {
		t.Fatalf("indefinite allow should keep device open without clock, got %+v", r)
	}
	// Indefinite block always blocks
	ruleBlock := timeDeviceRule{Block: &timeOverrideEnd{Until: nil}}
	r = evaluate(ruleBlock, now, 0, false, "OPEN")
	if !r.Blocked || r.Reason != reasonManual {
		t.Fatalf("indefinite block without clock should block, got %+v", r)
	}
}

func TestEvaluateDSTSpringForward(t *testing.T) {
	loc := mustLocation(t, "Europe/Vienna")
	// 2026-03-29 is the last Sunday of March; clocks jump 02:00 → 03:00.
	// A window "21:00-07:00 on Saturday" crosses the DST switch.
	rule := timeDeviceRule{Windows: []timeWindow{{Days: []string{"SA"}, From: "21:00", Until: "07:00"}}}

	// Saturday 22:00 before the switch → blocked
	before := time.Date(2026, 3, 28, 22, 0, 0, 0, loc)
	if !evaluate(rule, before, 0, true, "OPEN").Blocked {
		t.Fatalf("Saturday 22:00 before DST should be blocked")
	}
	// Sunday 04:00 (after the forward jump) → still blocked until 07:00
	after := time.Date(2026, 3, 29, 4, 0, 0, 0, loc)
	if !evaluate(rule, after, 0, true, "OPEN").Blocked {
		t.Fatalf("Sunday 04:00 after spring-forward should still be blocked")
	}
	// Sunday 07:00 → open
	end := time.Date(2026, 3, 29, 7, 0, 0, 0, loc)
	if evaluate(rule, end, 0, true, "OPEN").Blocked {
		t.Fatalf("Sunday 07:00 should be open")
	}
}

func TestEvaluateDSTFallBack(t *testing.T) {
	loc := mustLocation(t, "Europe/Vienna")
	// 2026-10-25 is the last Sunday of October; clocks jump 03:00 → 02:00.
	rule := timeDeviceRule{Windows: []timeWindow{{Days: []string{"SA"}, From: "21:00", Until: "07:00"}}}
	// Sunday 06:00 (after the second 02:00) → still blocked
	after := time.Date(2026, 10, 25, 6, 0, 0, 0, loc)
	if !evaluate(rule, after, 0, true, "OPEN").Blocked {
		t.Fatalf("Sunday 06:00 on fall-back day should still be blocked")
	}
}

func TestCounterNameRoundTrip(t *testing.T) {
	name := counterName("aa:bb:cc:dd:ee:01")
	if name != "nethera_time_aabbccddee01" {
		t.Fatalf("unexpected counter name %s", name)
	}
	if mac := unsanitizeMAC("aabbccddee01"); mac != "aa:bb:cc:dd:ee:01" {
		t.Fatalf("round trip failed: %s", mac)
	}
	if unsanitizeMAC("short") != "" {
		t.Fatalf("too short string must return empty")
	}
}

func TestNftTimeConfigStable(t *testing.T) {
	macs := []string{"aa:bb:cc:dd:ee:02", "aa:bb:cc:dd:ee:01"}
	// counterMACs sorts, so the generator must receive a sorted list to be stable
	sorted := []string{macs[1], macs[0]}
	got := nftTimeConfig(sorted)
	if !strings.Contains(got, "set nethera_time_blocked") {
		t.Fatalf("set missing: %s", got)
	}
	if !strings.Contains(got, "ether saddr aa:bb:cc:dd:ee:01 counter name nethera_time_aabbccddee01") {
		t.Fatalf("counter rule missing: %s", got)
	}
	if !strings.Contains(got, "priority filter - 6") {
		t.Fatalf("priority missing: %s", got)
	}
	// Empty list still produces a file with the set so set-element commands work
	empty := nftTimeConfig(nil)
	if !strings.Contains(empty, "set nethera_time_blocked") {
		t.Fatalf("empty file must still declare the set: %s", empty)
	}
}

func TestReadCountersParsesNftJSON(t *testing.T) {
	payload := map[string]any{
		"nftables": []map[string]any{
			{"metainfo": map[string]any{"version": "1.0"}},
			{"counter": map[string]any{"name": "nethera_time_aabbccddee01", "bytes": 12345, "packets": 10}},
			{"counter": map[string]any{"name": "something_else", "bytes": 1}},
		},
	}
	data, _ := json.Marshal(payload)
	src := Sources{Run: func(name string, args ...string) ([]byte, error) { return data, nil }}
	got, err := readCounters(src)
	if err != nil {
		t.Fatalf("readCounters: %v", err)
	}
	if got["aa:bb:cc:dd:ee:01"] != 12345 || len(got) != 1 {
		t.Fatalf("unexpected counters: %+v", got)
	}
}

func TestUsageFileRoundTrip(t *testing.T) {
	path := t.TempDir() + "/usage.json"
	u := usageFile{Date: "2026-11-21", Minutes: map[string]int{"aa:bb:cc:dd:ee:01": 42}}
	if err := saveUsage(path, u); err != nil {
		t.Fatalf("save: %v", err)
	}
	// Same date → restored
	loaded := loadUsage(path, "2026-11-21")
	if loaded.Minutes["aa:bb:cc:dd:ee:01"] != 42 {
		t.Fatalf("not restored: %+v", loaded)
	}
	// Different date → reset
	loaded = loadUsage(path, "2026-11-22")
	if len(loaded.Minutes) != 0 || loaded.Date != "2026-11-22" {
		t.Fatalf("new day must reset: %+v", loaded)
	}
}
