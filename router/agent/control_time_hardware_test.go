//go:build linux

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Opt-in, one explicitly approved device, no cloud writes or persistent rules.
// Refuses any router with existing time-control state. Run this test alone.
func TestTimeHardwareWindow(t *testing.T) {
	if os.Getenv("NETHERA_TIME_HARDWARE") != "1" {
		t.Skip("requires an approved physical test device")
	}
	mac, admin := os.Getenv("NETHERA_TIME_TEST_MAC"), os.Getenv("NETHERA_TIME_ADMIN_MAC")
	if !macPattern.MatchString(mac) || !macPattern.MatchString(admin) || mac == admin {
		t.Fatal("separate valid test and administration MACs required")
	}
	src := RouterSources()
	if !clockSynced(src) {
		t.Fatal("router clock is not synchronized")
	}
	if _, err := os.Stat(src.TimeControlFile); !os.IsNotExist(err) {
		t.Fatal("existing time control: refusing hardware test")
	}
	if _, err := os.Stat(filepath.Join(src.NftDir, nftTimeFileName)); !os.IsNotExist(err) {
		t.Fatal("existing time include: refusing hardware test")
	}
	state, err := readTimeFirewall(src)
	if err != nil || state.chain || state.set || len(state.counters) > 0 || state.offloaded {
		t.Fatalf("unsafe initial firewall: %+v %v", state, err)
	}
	leases, err := os.ReadFile(src.DHCPLeases)
	if err != nil || !strings.Contains(string(leases), " "+mac+" ") || !strings.Contains(string(leases), " "+admin+" ") {
		t.Fatal("both devices must be present in DHCP leases")
	}
	cleanup := "nft flush chain inet fw4 nethera_time 2>/dev/null; nft delete chain inet fw4 nethera_time 2>/dev/null; nft delete set inet fw4 nethera_time_blocked 2>/dev/null"
	// Independent watchdog removes only our initially absent objects even if the
	// SSH session or test binary disappears. No router restart or fw4 reload.
	guard := exec.Command("sh", "-c", "sleep 180; "+cleanup)
	if err := guard.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = exec.Command("sh", "-c", cleanup).Run()
		_ = guard.Process.Kill()
		_ = guard.Wait()
	})
	dir := t.TempDir()
	src.NftDir = dir
	src.TimeUsageFile = filepath.Join(dir, "usage.json")
	loc := mustLocation(t, "Europe/Vienna")
	now := time.Now().In(loc)
	end := now.Truncate(time.Minute).Add(2 * time.Minute)
	c := timeControl{V: 1, Version: 1, Timezone: "Europe/Vienna", UntilClockSync: "OPEN", Devices: map[string]timeDeviceRule{
		mac: {Windows: []timeWindow{{Days: []string{weekdayCode(now.Weekday()), weekdayCode(now.AddDate(0, 0, -1).Weekday())}, From: now.Add(-time.Minute).Format("15:04"), Until: end.Format("15:04")}}},
	}}
	rt := newTimeRuntime()
	r, err := rt.applyTimeControl(src, c)
	if err != nil || !r.Applied || !r.Devices[mac].Blocked {
		t.Fatalf("window not applied: %+v %v", r, err)
	}
	fmt.Printf("IPHONE_BLOCKED_UNTIL=%s\n", end.Format(time.RFC3339))
	for time.Now().Before(end.Add(time.Second)) {
		time.Sleep(time.Second)
		if _, err := rt.refresh(src, false); err != nil {
			t.Fatal(err)
		}
	}
	r, err = rt.refresh(src, false)
	if err != nil || !r.Applied || r.Devices[mac].Blocked {
		t.Fatalf("window did not expire: %+v %v", r, err)
	}
	state, err = readTimeFirewall(src)
	if err != nil || state.blocked[mac] {
		t.Fatalf("kernel still blocks device: %+v %v", state, err)
	}
	fmt.Println("IPHONE_RELEASED_AUTOMATICALLY")
	chain := nftTestCommand(t, "-j", "list", "chain", "inet", "fw4", "nethera_time")
	fmt.Printf("TIME_CHAIN_READBACK=%s\n", chain)
	c.Version++
	c.Devices = map[string]timeDeviceRule{}
	if _, err := rt.applyTimeControl(src, c); err != nil {
		t.Fatal(err)
	}
}
