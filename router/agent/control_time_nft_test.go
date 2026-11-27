package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func nftTestCommand(t *testing.T, args ...string) []byte {
	t.Helper()
	out, err := exec.Command("nft", args...).CombinedOutput()
	if err != nil {
		t.Fatalf("nft %v: %v\n%s", args, err, out)
	}
	return out
}

// Run only inside the disposable --network none container, never on the Cudy.
func TestTimeNftIntegrationPreservesDNS(t *testing.T) {
	if os.Getenv("NETHERA_NFT_INTEGRATION") != "1" {
		t.Skip("requires isolated NET_ADMIN container")
	}
	if _, err := os.Stat("/.dockerenv"); err != nil {
		t.Fatal("integration test must run inside disposable Docker container")
	}
	if _, err := exec.Command("nft", "list", "table", "inet", "fw4").Output(); err == nil {
		t.Fatal("refusing to replace an existing fw4 table")
	}
	nftTestCommand(t, "add", "table", "inet", "fw4")
	t.Cleanup(func() { nftTestCommand(t, "delete", "table", "inet", "fw4") })
	nftTestCommand(t, "add", "set", "inet", "fw4", "nethera_dns_sentinel", "{ type ipv4_addr; }")
	nftTestCommand(t, "add", "element", "inet", "fw4", "nethera_dns_sentinel", "{ 203.0.113.4 }")
	nftTestCommand(t, "add", "chain", "inet", "fw4", "nethera_block", "{ type filter hook forward priority -5; }")
	nftTestCommand(t, "add", "rule", "inet", "fw4", "nethera_block", "ip", "daddr", "@nethera_dns_sentinel", "reject")
	before := string(nftTestCommand(t, "list", "set", "inet", "fw4", "nethera_dns_sentinel"))
	dir := t.TempDir()
	// Add the actual #25 generator output, not only a sentinel set.
	nftTestCommand(t, "flush", "chain", "inet", "fw4", "nethera_block")
	nftTestCommand(t, "delete", "chain", "inet", "fw4", "nethera_block")
	dnsFile := filepath.Join(dir, "dns.nft")
	dns := dnsControl{Devices: map[string][]string{timeTestMAC: {"example.com"}}}
	if err := os.WriteFile(dnsFile, []byte("table inet fw4 {\n"+nftConfig(dns)+"}\n"), 0600); err != nil {
		t.Fatal(err)
	}
	nftTestCommand(t, "-f", dnsFile)
	nftTestCommand(t, "add", "element", "inet", "fw4", setName(timeTestMAC, 4), "{ 203.0.113.4 }")
	nftTestCommand(t, "add", "element", "inet", "fw4", setName(timeTestMAC, 6), "{ 2001:db8::4 }")
	dnsChain := string(nftTestCommand(t, "list", "chain", "inet", "fw4", "nethera_block"))
	checkDeviceDNS := func() {
		t.Helper()
		if string(nftTestCommand(t, "list", "chain", "inet", "fw4", "nethera_block")) != dnsChain {
			t.Fatal("per-device DNS chain changed")
		}
		for family, address := range map[int]string{4: "203.0.113.4", 6: "2001:db8::4"} {
			if !strings.Contains(string(nftTestCommand(t, "list", "set", "inet", "fw4", setName(timeTestMAC, family))), address) {
				t.Fatalf("per-device IPv%d DNS address lost", family)
			}
		}
	}
	src := RouterSources()
	src.NftDir = dir
	src.TimeUsageFile = filepath.Join(dir, "usage.json")
	src.NTPFlag = filepath.Join(dir, "ntp")
	if err := os.WriteFile(src.NTPFlag, nil, 0600); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 11, 23, 10, 0, 0, 0, time.UTC)
	src.Now = func() time.Time { return now }
	rt := newTimeRuntime()
	c := timeRuleControl(timeDeviceRule{Windows: []timeWindow{{Days: []string{"MO"}, From: "09:00", Until: "11:00"}}})
	for _, budget := range []int{-1, 60, 120, -1} {
		c.Version++
		rule := c.Devices[timeTestMAC]
		rule.Budgets = nil
		if budget >= 0 {
			rule.Budgets = map[string]int{"MO": budget}
		}
		c.Devices[timeTestMAC] = rule
		r, err := rt.applyTimeControl(src, c)
		if err != nil || !r.Applied {
			t.Fatalf("apply: %+v %v", r, err)
		}
		state, err := readTimeFirewall(src)
		if err != nil || !state.blocked[timeTestMAC] {
			t.Fatalf("missing block: %+v %v", state, err)
		}
		if got := string(nftTestCommand(t, "list", "set", "inet", "fw4", "nethera_dns_sentinel")); got != before {
			t.Fatal("DNS set changed")
		}
		checkDeviceDNS()
	}
	// An external reload clears dynamic elements. The next tick must restore them.
	nftTestCommand(t, "flush", "set", "inet", "fw4", timeBlockedSet)
	rt.tickTimeControl(src)
	state, _ := readTimeFirewall(src)
	if !state.blocked[timeTestMAC] {
		t.Fatal("external reload not recovered")
	}
	c.Version++
	c.Devices = map[string]timeDeviceRule{}
	r, err := rt.applyTimeControl(src, c)
	if err != nil || !r.Applied {
		t.Fatalf("clear: %+v %v", r, err)
	}
	state, _ = readTimeFirewall(src)
	if len(state.blocked) != 0 || len(state.counters) != 0 {
		t.Fatal("obsolete device remains")
	}
	if got := string(nftTestCommand(t, "list", "set", "inet", "fw4", "nethera_dns_sentinel")); got != before {
		t.Fatal("DNS lost after clearing time rules")
	}
	checkDeviceDNS()
}
