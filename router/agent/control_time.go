package main

// Time control (issue #27 "Gruppe Kinder → offline → Zeitplan").
//
// The backend publishes the effective rules per MAC as one retained message on
// nethera/<id>/config/time. The agent evaluates every minute in the router's time zone
// and blocks matching devices through its own nftables file. Usage minutes are counted
// on the router from an upload threshold, not reported by the browser. The applied state
// is published retained on nethera/<id>/telemetry/time.

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	maxTimeDevices      = 100
	maxWindowsPerDevice = 20

	nftTimeFileName   = "91-nethera-time.nft"
	timeBlockedSet    = "nethera_time_blocked"
	timeCounterPrefix = "nethera_time_"

	// A minute counts as used when the device sent more than this many bytes to the
	// internet. Initial value; hardware calibration is still required (design D4).
	usageThresholdBytes uint64 = 20 * 1024

	usageSaveInterval = 5 * time.Minute

	untilClockSyncOpen  = "OPEN"
	untilClockSyncBlock = "BLOCK"

	reasonManual = "manual"
	reasonWindow = "window"
	reasonBudget = "budget"
	reasonClock  = "clock"
)

var (
	weekdayCodes = [...]string{"SU", "MO", "TU", "WE", "TH", "FR", "SA"}
	weekdaySet   = map[string]bool{"MO": true, "TU": true, "WE": true, "TH": true, "FR": true, "SA": true, "SU": true}
	timePattern  = regexp.MustCompile(`^([01][0-9]|2[0-3]):([0-5][0-9])$`)
)

// timeControl is the desired state sent by the backend (schema D5)
type timeControl struct {
	V              int                       `json:"v"`
	Version        int64                     `json:"version"`
	Timezone       string                    `json:"timezone"`
	UntilClockSync string                    `json:"untilClockSync"`
	Devices        map[string]timeDeviceRule `json:"devices"`
}

// timeDeviceRule is the combined rule for one MAC: windows, per-weekday budgets and
// the current overrides. Either override may be nil; both may be present.
type timeDeviceRule struct {
	Windows []timeWindow     `json:"windows"`
	Budgets map[string]int   `json:"budgets"`
	Block   *timeOverrideEnd `json:"block"`
	Allow   *timeOverrideEnd `json:"allow"`
}

type timeWindow struct {
	Days  []string `json:"days"`
	From  string   `json:"from"`
	Until string   `json:"until"`
}

// timeOverrideEnd carries the Unix seconds when the override expires, or null for "until switched off"
type timeOverrideEnd struct {
	Until *int64 `json:"until"`
}

// timePayload is the agent's answer on telemetry/time
type timePayload struct {
	V           int                         `json:"v"`
	TS          int64                       `json:"ts"`
	Version     int64                       `json:"version"`
	Applied     bool                        `json:"applied"`
	ClockSynced bool                        `json:"clockSynced"`
	Error       string                      `json:"error,omitempty"`
	Devices     map[string]timeDeviceReport `json:"devices"`
}

type timeDeviceReport struct {
	UsedMinutes   int    `json:"usedMinutes"`
	BudgetMinutes *int   `json:"budgetMinutes"`
	Blocked       bool   `json:"blocked"`
	Reason        string `json:"reason,omitempty"`
}

// parseTimeControl checks a message. The agent writes the result into firewall rules, so
// anything unexpected is refused and the previous state is kept.
func parseTimeControl(data []byte) (timeControl, error) {
	var c timeControl
	if len(data) > 256*1024 {
		return c, errors.New("time message exceeds 256 KiB")
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&c); err != nil {
		return timeControl{}, fmt.Errorf("invalid JSON: %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return c, errors.New("expected one JSON object")
	}
	if c.V != schemaVersion {
		return timeControl{}, fmt.Errorf("unsupported schema version %d", c.V)
	}
	if c.Version <= 0 {
		return timeControl{}, errors.New("version must be a positive number")
	}
	if _, err := time.LoadLocation(c.Timezone); err != nil || c.Timezone == "" || c.Timezone == "Local" {
		return timeControl{}, fmt.Errorf("unknown time zone %q", c.Timezone)
	}
	switch c.UntilClockSync {
	case untilClockSyncOpen, untilClockSyncBlock:
	default:
		return timeControl{}, fmt.Errorf("untilClockSync %q is not OPEN or BLOCK", c.UntilClockSync)
	}
	if len(c.Devices) > maxTimeDevices {
		return timeControl{}, fmt.Errorf("more than %d devices", maxTimeDevices)
	}
	if c.Devices == nil {
		return c, errors.New("devices must be an object; use {} to remove all time rules")
	}
	devices := map[string]timeDeviceRule{}
	for mac, rule := range c.Devices {
		mac = strings.ToLower(strings.TrimSpace(mac))
		if !macPattern.MatchString(mac) {
			return timeControl{}, fmt.Errorf("invalid MAC address %q", mac)
		}
		if _, exists := devices[mac]; exists {
			return c, fmt.Errorf("duplicate normalized MAC %s", mac)
		}
		cleaned, err := cleanRule(rule)
		if err != nil {
			return timeControl{}, fmt.Errorf("device %s: %w", mac, err)
		}
		devices[mac] = cleaned
	}
	c.Devices = devices
	return c, nil
}

// cleanRule checks one device's rule and leaves out empty parts
func cleanRule(r timeDeviceRule) (timeDeviceRule, error) {
	if len(r.Windows) > maxWindowsPerDevice {
		return r, fmt.Errorf("more than %d windows", maxWindowsPerDevice)
	}
	windows := make([]timeWindow, 0, len(r.Windows))
	for _, w := range r.Windows {
		if len(w.Days) == 0 {
			return r, errors.New("window without weekday")
		}
		seen := map[string]bool{}
		days := make([]string, 0, len(w.Days))
		for _, d := range w.Days {
			d = strings.ToUpper(strings.TrimSpace(d))
			if !weekdaySet[d] {
				return r, fmt.Errorf("unknown weekday %q", d)
			}
			if !seen[d] {
				seen[d] = true
				days = append(days, d)
			}
		}
		if !timePattern.MatchString(w.From) {
			return r, fmt.Errorf("invalid time %q", w.From)
		}
		if !timePattern.MatchString(w.Until) {
			return r, fmt.Errorf("invalid time %q", w.Until)
		}
		if w.From == w.Until {
			return r, fmt.Errorf("window from and until are both %s", w.From)
		}
		windows = append(windows, timeWindow{Days: days, From: w.From, Until: w.Until})
	}
	budgets := map[string]int{}
	for day, minutes := range r.Budgets {
		day = strings.ToUpper(strings.TrimSpace(day))
		if !weekdaySet[day] {
			return r, fmt.Errorf("unknown weekday %q in budget", day)
		}
		if minutes < 0 || minutes > 1440 {
			return r, fmt.Errorf("budget minutes %d out of 0..1440", minutes)
		}
		if _, exists := budgets[day]; exists {
			return r, fmt.Errorf("duplicate budget weekday %s", day)
		}
		budgets[day] = minutes
	}
	if err := checkOverride(r.Block); err != nil {
		return r, fmt.Errorf("block: %w", err)
	}
	if err := checkOverride(r.Allow); err != nil {
		return r, fmt.Errorf("allow: %w", err)
	}
	r.Windows = windows
	r.Budgets = budgets
	return r, nil
}

func checkOverride(o *timeOverrideEnd) error {
	if o == nil || o.Until == nil {
		return nil
	}
	if *o.Until <= 0 {
		return errors.New("until must be a positive Unix time or null")
	}
	return nil
}

// weekdayCode turns a Go weekday into MO..SU
func weekdayCode(d time.Weekday) string { return weekdayCodes[int(d)] }

func parseHM(s string) (int, int) {
	h, _ := strconv.Atoi(s[:2])
	m, _ := strconv.Atoi(s[3:])
	return h, m
}

// windowActive checks whether now is inside the window on its current or previous weekday.
// A window with until < from belongs to the weekday on which it starts.
func windowActive(w timeWindow, now time.Time) bool {
	fromH, fromM := parseHM(w.From)
	untilH, untilM := parseHM(w.Until)
	// Both occurrences of an autumn DST hour use the same local wall-clock rule.
	minute := now.Hour()*60 + now.Minute()
	from, until := fromH*60+fromM, untilH*60+untilM
	today := weekdayCode(now.Weekday())
	yesterday := weekdayCode(now.AddDate(0, 0, -1).Weekday())
	if from < until {
		return containsDay(w.Days, today) && minute >= from && minute < until
	}
	return (containsDay(w.Days, today) && minute >= from) || (containsDay(w.Days, yesterday) && minute < until)
}

func containsDay(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

func overrideActive(o *timeOverrideEnd, now time.Time) bool {
	if o == nil {
		return false
	}
	if o.Until == nil {
		return true
	}
	return now.Unix() < *o.Until
}

func hasAnyRule(r timeDeviceRule) bool {
	return len(r.Windows) > 0 || len(r.Budgets) > 0 || r.Block != nil || r.Allow != nil
}

// evalResult carries the decision for one device at one point in time
type evalResult struct {
	Blocked    bool
	Reason     string
	Budget     int
	HasBudget  bool
	CountUsage bool
}

// evaluate decides whether a device is blocked now. Order: manual block, manual allow,
// windows, budget. Without a synchronised clock only indefinite overrides apply, and the
// untilClockSync setting decides what happens to devices with a rule.
func evaluate(rule timeDeviceRule, now time.Time, used int, clockSynced bool, untilClockSync string) evalResult {
	if !clockSynced {
		if rule.Block != nil && rule.Block.Until == nil {
			return evalResult{Blocked: true, Reason: reasonManual}
		}
		if rule.Allow != nil && rule.Allow.Until == nil {
			return evalResult{}
		}
		if untilClockSync == untilClockSyncBlock && hasAnyRule(rule) {
			return evalResult{Blocked: true, Reason: reasonClock}
		}
		return evalResult{}
	}

	budget, hasBudget := rule.Budgets[weekdayCode(now.Weekday())]
	res := evalResult{Budget: budget, HasBudget: hasBudget, CountUsage: true}

	if overrideActive(rule.Block, now) {
		res.Blocked = true
		res.Reason = reasonManual
		return res
	}
	if overrideActive(rule.Allow, now) {
		return res
	}
	for _, w := range rule.Windows {
		if windowActive(w, now) {
			res.Blocked = true
			res.Reason = reasonWindow
			return res
		}
	}
	if hasBudget && used >= budget {
		res.Blocked = true
		res.Reason = reasonBudget
	}
	return res
}

// counterName is the nft counter for one MAC. nft does not allow ':' in names.
func counterName(mac string) string {
	return timeCounterPrefix + strings.ReplaceAll(mac, ":", "")
}

// counterMACs lists the MACs that need a per-device counter (devices with a budget)
func counterMACs(c timeControl) []string {
	var macs []string
	for mac, rule := range c.Devices {
		if len(rule.Budgets) > 0 {
			macs = append(macs, mac)
		}
	}
	sort.Strings(macs)
	return macs
}

// nftTimeConfig is included by fw4 inside "table inet fw4". The named counters measure
// outgoing bytes per device; the set holds the MACs currently blocked. Priority is just
// before the DNS control chain so time blocks also cut existing connections.
func nftTimeConfig(macs []string) string {
	if len(macs) == 0 {
		// Still ship the set so set element commands do not fail when a block is added
		// before the first device with a budget appears.
		return "# Generated by nethera-agent, do not edit\n" +
			"set " + timeBlockedSet + " { type ether_addr; }\n" +
			"chain nethera_time {\n" +
			"\ttype filter hook forward priority filter - 6; policy accept;\n" +
			"\tether saddr @" + timeBlockedSet + " counter reject\n" +
			"}\n"
	}
	var b strings.Builder
	b.WriteString("# Generated by nethera-agent, do not edit\n")
	fmt.Fprintf(&b, "set %s { type ether_addr; }\n", timeBlockedSet)
	for _, mac := range macs {
		fmt.Fprintf(&b, "counter %s { }\n", counterName(mac))
	}
	b.WriteString("chain nethera_time {\n\ttype filter hook forward priority filter - 6; policy accept;\n")
	// Blocked retry traffic must not consume additional budget minutes.
	fmt.Fprintf(&b, "\tether saddr @%s counter reject\n", timeBlockedSet)
	for _, mac := range macs {
		fmt.Fprintf(&b, "\tether saddr %s counter name %s\n", mac, counterName(mac))
	}
	b.WriteString("}\n")
	return b.String()
}

// nftCountersOutput is the "nft -j list counters ..." shape we care about
type nftCountersOutput struct {
	Nftables []map[string]json.RawMessage `json:"nftables"`
}

type nftCounter struct {
	Name  string `json:"name"`
	Bytes uint64 `json:"bytes"`
}

// readCounters returns the bytes counter per MAC that has a nethera_time_* counter
func readCounters(src Sources) (map[string]uint64, error) {
	out, err := src.Run("nft", "-j", "list", "counters", "table", "inet", "fw4")
	if err != nil {
		return nil, err
	}
	var resp nftCountersOutput
	if err := json.Unmarshal(out, &resp); err != nil {
		return nil, fmt.Errorf("nft counters JSON: %w", err)
	}
	result := map[string]uint64{}
	for _, item := range resp.Nftables {
		raw, ok := item["counter"]
		if !ok {
			continue
		}
		var c nftCounter
		if err := json.Unmarshal(raw, &c); err != nil {
			continue
		}
		if !strings.HasPrefix(c.Name, timeCounterPrefix) {
			continue
		}
		mac := unsanitizeMAC(strings.TrimPrefix(c.Name, timeCounterPrefix))
		if mac == "" {
			continue
		}
		result[mac] = c.Bytes
	}
	return result, nil
}

func unsanitizeMAC(s string) string {
	if len(s) != 12 {
		return ""
	}
	s = strings.ToLower(s)
	var b strings.Builder
	for i := 0; i < 12; i += 2 {
		if i > 0 {
			b.WriteByte(':')
		}
		b.WriteString(s[i : i+2])
	}
	mac := b.String()
	if !macPattern.MatchString(mac) {
		return ""
	}
	return mac
}

// usageFile persists today's used minutes per MAC on flash
type usageFile struct {
	Date    string         `json:"date"`
	Minutes map[string]int `json:"minutes"`
}

func newUsage(date string) usageFile {
	return usageFile{Date: date, Minutes: map[string]int{}}
}

func loadUsage(path, today string) usageFile {
	data, err := os.ReadFile(path)
	if err != nil {
		return newUsage(today)
	}
	var u usageFile
	if err := json.Unmarshal(data, &u); err != nil || u.Date != today {
		return newUsage(today)
	}
	if u.Minutes == nil {
		u.Minutes = map[string]int{}
	}
	return u
}

func saveUsage(path string, u usageFile) error {
	data, err := json.Marshal(u)
	if err != nil {
		return err
	}
	_, err = writeIfChanged(path, string(data)+"\n")
	return err
}

// timeRuntime is the agent's time control state, held in memory between messages and ticks
type timeRuntime struct {
	control        timeControl
	hasControl     bool
	appliedVersion int64
	applied        bool
	lastError      string

	location *time.Location

	usage        usageFile
	lastSave     time.Time
	lastCounters map[string]uint64

	usageLoaded   bool
	budgetBlocked map[string]bool
}

func newTimeRuntime() *timeRuntime {
	loc, _ := time.LoadLocation("Europe/Vienna")
	return &timeRuntime{
		location:      loc,
		usage:         newUsage(""),
		budgetBlocked: map[string]bool{},
	}
}

func (rt *timeRuntime) localNow(src Sources) time.Time {
	return src.Now().In(rt.location)
}

func clockSynced(src Sources) bool {
	_, err := os.Stat(src.NTPFlag)
	return err == nil
}

// setControl remembers the desired state. The actual firewall is checked on every tick.
func (rt *timeRuntime) setControl(src Sources, c timeControl) error {
	loc, err := time.LoadLocation(c.Timezone)
	if err != nil {
		return err
	}
	rt.location = loc
	rt.control = c
	rt.hasControl = true

	return nil
}

func equalStringSets(a, b map[string]bool) bool {
	if len(a) != len(b) {
		return false
	}
	for k := range a {
		if !b[k] {
			return false
		}
	}
	return true
}

// evaluateAll decides for every device of the current control what should happen now and
// returns the report. Minute counting has to be done by the caller before this.
func (rt *timeRuntime) evaluateAll(src Sources, now time.Time, synced bool) timePayload {
	report := timePayload{
		V:           schemaVersion,
		TS:          src.Now().Unix(),
		Version:     rt.appliedVersion,
		Applied:     rt.applied,
		ClockSynced: synced,
		Error:       rt.lastError,
		Devices:     map[string]timeDeviceReport{},
	}
	for mac, rule := range rt.control.Devices {
		used := rt.usage.Minutes[mac]
		r := evaluate(rule, now, used, synced, rt.control.UntilClockSync)
		dev := timeDeviceReport{
			UsedMinutes: used,
			Blocked:     r.Blocked,
			Reason:      r.Reason,
		}
		if r.HasBudget {
			b := r.Budget
			dev.BudgetMinutes = &b
		}
		report.Devices[mac] = dev
	}
	return report
}

// applyBlocks adjusts the firewall set to match the report
func (rt *timeRuntime) applyBlocks(src Sources, report timePayload) error {
	want := map[string]bool{}
	for mac, dev := range report.Devices {
		if dev.Blocked {
			want[mac] = true
		}
	}
	return reconcileTimeFirewall(src, rt.control, want)
}

// countMinutes compares the current counters against the last snapshot and increments
// used minutes for devices that sent more than the threshold in this interval. A counter
// going backwards means a reload reset it; the snapshot restarts.
func (rt *timeRuntime) countMinutes(src Sources) error {
	counters, err := readCounters(src)
	if err != nil {
		return err
	}
	for _, mac := range counterMACs(rt.control) {
		if _, ok := counters[mac]; !ok {
			return fmt.Errorf("missing usage counter for %s", mac)
		}
		curr := counters[mac]
		// Called only by the minute ticker. Rechecking elapsed wall time here
		// would drop intervals when consecutive ticks have slightly different lag.
		if rt.lastCounters != nil {
			prev, had := rt.lastCounters[mac]
			if had && curr >= prev && curr-prev > usageThresholdBytes {
				if rt.usage.Minutes[mac] < 1440 {
					rt.usage.Minutes[mac]++
				}
			}
		}
	}
	rt.lastCounters = counters
	return nil
}

// resetUsageIfNewDay forgets yesterday's minutes at local midnight
func (rt *timeRuntime) resetUsageIfNewDay(now time.Time) bool {
	today := now.Format("2006-01-02")
	if rt.usage.Date == today {
		return false
	}
	rt.usage = newUsage(today)
	rt.lastCounters = nil
	return true
}

func (rt *timeRuntime) checkVersion(c timeControl) error {
	if rt.hasControl && c.Version < rt.control.Version {
		return errors.New("stale time-control version")
	}
	if rt.hasControl && c.Version == rt.control.Version {
		old, _ := json.Marshal(rt.control)
		incoming, _ := json.Marshal(c)
		if !bytes.Equal(old, incoming) {
			return errors.New("same version has different time rules")
		}
	}
	return nil
}

func (rt *timeRuntime) rejected(src Sources, version int64, err error) (timePayload, error) {
	r := rt.report(src)
	r.Version, r.Applied, r.Error = version, false, err.Error()
	return r, err
}

func (rt *timeRuntime) applyTimeControl(src Sources, c timeControl) (timePayload, error) {
	if err := rt.checkVersion(c); err != nil {
		return rt.rejected(src, c.Version, err)
	}
	if err := rt.setControl(src, c); err != nil {
		return rt.rejected(src, c.Version, err)
	}
	rt.appliedVersion = c.Version
	return rt.refresh(src, false)
}

// A reload refresh does not consume an extra minute. Usage is restored only after
// NTP, in the selected timezone, so a boot with yesterday's clock cannot erase it.
func (rt *timeRuntime) refresh(src Sources, count bool) (timePayload, error) {
	now, synced := rt.localNow(src), clockSynced(src)
	if synced && !rt.usageLoaded {
		rt.usage = loadUsage(src.TimeUsageFile, now.Format("2006-01-02"))
		rt.usageLoaded = true
		rt.lastSave = src.Now()
	}
	dayChanged := false
	if synced {
		dayChanged = rt.resetUsageIfNewDay(now)
	}
	var problems []error
	if synced && count {
		if err := rt.countMinutes(src); err != nil {
			problems = append(problems, fmt.Errorf("usage: %w", err))
		}
	} else if !synced {
		rt.lastCounters = nil
	}
	report := rt.evaluateAll(src, now, synced)
	if err := rt.applyBlocks(src, report); err != nil {
		problems = append(problems, err)
	}
	if synced && rt.lastCounters == nil {
		if counters, err := readCounters(src); err == nil {
			rt.lastCounters = counters
		}
	}
	newBudgetBlocks := map[string]bool{}
	justBlocked := false
	for mac, d := range report.Devices {
		if d.Blocked && d.Reason == reasonBudget {
			newBudgetBlocks[mac] = true
			if !rt.budgetBlocked[mac] {
				justBlocked = true
			}
		}
	}
	if synced && (dayChanged || justBlocked || src.Now().Sub(rt.lastSave) >= usageSaveInterval) {
		if err := saveUsage(src.TimeUsageFile, rt.usage); err != nil {
			problems = append(problems, fmt.Errorf("save usage: %w", err))
		} else {
			rt.lastSave = src.Now()
			rt.budgetBlocked = newBudgetBlocks
		}
	} else if !justBlocked {
		rt.budgetBlocked = newBudgetBlocks
	}
	err := errors.Join(problems...)
	rt.applied = err == nil
	rt.lastError = ""
	if err != nil {
		rt.lastError = err.Error()
	}
	return rt.report(src), err
}

// tickTimeControl runs once per minute: counts usage, re-evaluates, adjusts the set.
// Also returns an unchanged report as a freshness heartbeat for the backend.
func (rt *timeRuntime) tickTimeControl(src Sources) (timePayload, bool) {
	if !rt.hasControl {
		return timePayload{}, false
	}
	report, _ := rt.refresh(src, true)
	return report, true
}

func (rt *timeRuntime) report(src Sources) timePayload {
	return rt.evaluateAll(src, rt.localNow(src), clockSynced(src))
}

// loadSavedTimeControl reads the message saved on flash, if any
func loadSavedTimeControl(path string) (timeControl, bool) {
	data, err := os.ReadFile(path)
	if err != nil {
		return timeControl{}, false
	}
	c, err := parseTimeControl(data)
	return c, err == nil
}

func saveTimeControl(path string, data []byte) error {
	// Trim trailing newlines and whitespace, then add one for readability
	data = bytes.TrimSpace(data)
	_, err := writeIfChanged(path, string(data)+"\n")
	return err
}
