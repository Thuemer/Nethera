package main

import (
	"errors"
	"strings"
	"testing"
)

func TestPriorityValidation(t *testing.T) {
	for _, payload := range []string{
		`{"v":1,"version":1,"devices":{"02:00:00:00:00:01":"high"}}`,
		`{"v":1,"version":2,"devices":{}}`,
	} {
		if _, err := parsePriority([]byte(payload)); err != nil {
			t.Fatal(err)
		}
	}
	for _, payload := range []string{
		`{"v":2,"version":1,"devices":{}}`, `{"v":1,"version":0,"devices":{}}`,
		`{"v":1,"version":1}`, `{"v":1,"version":1,"devices":{"ff:ff:ff:ff:ff:ff":"high"}}`,
		`{"v":1,"version":1,"devices":{"02:00:00:00:00:01; reboot":"high"}}`,
		`{"v":1,"version":1,"devices":{"02:00:00:00:00:01":"urgent"}}`,
	} {
		if _, err := parsePriority([]byte(payload)); err == nil {
			t.Errorf("accepted %s", payload)
		}
	}
}
func TestPriorityRulesIPv4IPv6AndNormalRemoval(t *testing.T) {
	c := priorityControl{V: 1, Version: 1, Devices: map[string]string{"02:00:00:00:00:01": "high", "02:00:00:00:00:02": "normal"}}
	rules := priorityRules(c, map[string][]string{"02:00:00:00:00:01": {"192.168.1.5", "2001:db8::5"}})
	for _, want := range []string{"ether saddr 02:00:00:00:00:01", "ip daddr 192.168.1.5", "ip6 daddr 2001:db8::5", "0x7d000002"} {
		if !strings.Contains(rules, want) {
			t.Fatal(want)
		}
	}
	for _, forbidden := range []string{"02:00:00:00:00:02", "fw4", "dscp", "ct mark"} {
		if strings.Contains(rules, forbidden) {
			t.Fatal(forbidden)
		}
	}
}
func TestPriorityForeignQueuesUntouched(t *testing.T) {
	for _, out := range []string{"qdisc cake 1: root bandwidth 10Mbit", "qdisc fq_codel 0: root", "qdisc mq 0: root"} {
		calls := 0
		w := priorityWorker{run: func(name string, args ...string) ([]byte, error) {
			calls++
			if calls > 1 {
				t.Fatal("mutated foreign queue")
			}
			return []byte(out), nil
		}}
		if err := w.ensureShapedQueue("wan", 10000, false); err == nil {
			t.Fatal("accepted foreign queue")
		}
	}
}
func TestPriorityNormalCleanupPreservesForeignQueues(t *testing.T) {
	calls := []string{}
	w := priorityWorker{run: func(name string, args ...string) ([]byte, error) {
		cmd := name + " " + strings.Join(args, " ")
		calls = append(calls, cmd)
		switch cmd {
		case "nft list tables":
			return []byte("table inet fw4\ntable inet nethera_priority\n"), nil
		case "tc qdisc show":
			return []byte("qdisc cake 1: dev other root\nqdisc drr 7e00: dev wan root\n"), nil
		case "tc qdisc show dev wan":
			return []byte("qdisc drr 7e00: root"), nil
		case "nft delete table inet nethera_priority", "tc qdisc del dev wan root handle 7e00:":
			return nil, nil
		default:
			return nil, errors.New("unexpected command: " + cmd)
		}
	}}
	result := w.reconcile(priorityControl{V: 1, Version: 5, Devices: map[string]string{}})
	if !result.Applied {
		t.Fatal(result.Error)
	}
	if len(calls) != 5 {
		t.Fatal(calls)
	}
}
func TestPriorityReadbackRequiresFallback(t *testing.T) {
	w := priorityWorker{run: func(name string, args ...string) ([]byte, error) {
		if len(args) > 0 && args[0] == "qdisc" {
			return []byte("qdisc drr 7e00: root\nqdisc fq_codel 7e01: parent 7e00:1\nqdisc fq_codel 7e02: parent 7e00:2"), nil
		}
		if args[0] == "class" {
			return []byte("class drr 7e00:1 quantum 3000\nclass drr 7e00:2 quantum 1500"), nil
		}
		return nil, nil
	}}
	if err := w.verifyShapedQueue("wan", 10000, false); err == nil {
		t.Fatal("confirmed without default class")
	}
}

func TestPriorityBandwidthValidationAndFallback(t *testing.T) {
	for _, payload := range []string{
		`{"v":1,"version":1,"devices":{},"bandwidth":{"enabled":true,"downloadKbit":0,"uploadKbit":1000}}`,
		`{"v":1,"version":1,"devices":{},"bandwidth":{"enabled":true,"downloadKbit":60000,"uploadKbit":1000001}}`,
		`{"v":1,"version":1,"devices":{},"bandwidth":{"enabled":false,"downloadKbit":60000,"uploadKbit":1000}}`,
	} {
		if _, err := parsePriority([]byte(payload)); err == nil {
			t.Fatal("accepted invalid shaping rates")
		}
	}
	local := func(string) ([]byte, error) {
		return []byte(`{"enabled":true,"downloadKbit":60000,"uploadKbit":10000}`), nil
	}
	b, source, err := resolvePriorityBandwidth(priorityControl{}, local)
	if err != nil || source != "local" || b.DownloadKbit != 60000 {
		t.Fatal(b, source, err)
	}
	disabled := priorityBandwidth{}
	b, source, err = resolvePriorityBandwidth(priorityControl{Bandwidth: &disabled}, local)
	if err != nil || source != "backend" || b.Enabled {
		t.Fatal("explicit disabled state must override local commissioning settings")
	}
}

// Captured tc JSON schema: bandwidth is bytes/s, not kbit/s.
const matchingPriorityTestCake = `[{"kind":"cake","handle":"7d00:","root":true,"options":{"bandwidth":1250000,"diffserv":"diffserv3","flowmode":"dual-srchost","nat":true,"wash":false,"ingress":false,"ack-filter":"disabled","split_gso":true,"rtt":100000,"raw":true,"overhead":0,"memlimit":4194304,"fwmark":"0"}}]`

func TestCakeReadbackRejectsWrongRateIsolationOrTinPolicy(t *testing.T) {
	for _, tc := range []struct{ name, from, to string }{
		{"rate", "1250000", "2500000"}, {"policy", "diffserv3", "besteffort"}, {"hosts", "dual-srchost", "flows"},
		{"nat", `"nat":true`, `"nat":false`}, {"direction", `"ingress":false`, `"ingress":true`},
		{"gso", `"split_gso":true`, `"split_gso":false`}, {"rtt", "100000,", "300000,"},
		{"mark", `"fwmark":"0"`, `"fwmark":"255"`}, {"foreign", "7d00:", "1:"},
		{"missing", `"nat":true,`, ""},
		{"native autorate", `"fwmark":"0"`, `"fwmark":"0","autorate":"ingress"`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := priorityWorker{run: func(string, ...string) ([]byte, error) {
				return []byte(strings.Replace(matchingPriorityTestCake, tc.from, tc.to, 1)), nil
			}}
			if err := w.verifyShapedQueue("wan", 10000, false); err == nil {
				t.Fatal("confirmed mismatching queue")
			}
		})
	}
}
func TestMatchingCakeIsNotRewritten(t *testing.T) {
	w := priorityWorker{run: func(name string, args ...string) ([]byte, error) {
		cmd := name + " " + strings.Join(args, " ")
		switch cmd {
		case "tc qdisc show dev wan":
			return []byte("qdisc cake 7d00: root bandwidth 10Mbit diffserv3 dual-srchost nat egress"), nil
		case "tc -j qdisc show dev wan":
			return []byte(matchingPriorityTestCake), nil
		default:
			t.Fatalf("unexpected mutation: %s", cmd)
			return nil, errors.New("unexpected")
		}
	}}
	if err := w.ensureShapedQueue("wan", 10000, false); err != nil {
		t.Fatal(err)
	}
}
func TestCakeDownloadRequiresDestinationHostsAndIngress(t *testing.T) {
	data := strings.ReplaceAll(matchingPriorityTestCake, "dual-srchost", "dual-dsthost")
	data = strings.ReplaceAll(data, `"nat":true`, `"nat":false`)
	data = strings.ReplaceAll(data, `"ingress":false`, `"ingress":true`)
	w := priorityWorker{run: func(string, ...string) ([]byte, error) { return []byte(data), nil }}
	if err := w.verifyShapedQueue("br-lan", 10000, true); err != nil {
		t.Fatal(err)
	}
	if err := w.verifyShapedQueue("br-lan", 10000, false); err == nil {
		t.Fatal("accepted download policy for upload")
	}
}
func TestNormalTinBeforePreferredOverride(t *testing.T) {
	r := priorityRules(priorityControl{Devices: map[string]string{"02:00:00:00:00:01": "high"}}, map[string][]string{"02:00:00:00:00:01": {"192.0.2.1"}})
	n, h := strings.Index(r, "meta priority set 0x7d000001"), strings.Index(r, "meta priority set 0x7d000002")
	if n < 0 || h < n {
		t.Fatal("normal default overrides preferred selection")
	}
}
func TestLegacyHTBAndCakeAreOwnedButForeignCakeIsNot(t *testing.T) {
	for _, s := range []string{"qdisc htb 7d00: root", "qdisc cake 7d00: root", "qdisc drr 7e00: root"} {
		if !ownsPriorityQueue(s) {
			t.Fatal(s)
		}
	}
	if ownsPriorityQueue("qdisc cake 1: root") {
		t.Fatal("claimed foreign CAKE")
	}
}

func TestNormalCleanupPreservesForeignCake(t *testing.T) {
	w := priorityWorker{run: func(name string, args ...string) ([]byte, error) {
		cmd := name + " " + strings.Join(args, " ")
		switch cmd {
		case "nft list tables":
			return []byte("table inet fw4\n"), nil
		case "tc qdisc show":
			return []byte("qdisc cake 1: dev guest root\nqdisc cake 7d00: dev wan root\n"), nil
		case "tc qdisc show dev wan":
			return []byte("qdisc cake 7d00: root bandwidth 10Mbit"), nil
		case "tc qdisc del dev wan root handle 7d00:":
			return nil, nil
		default:
			t.Fatalf("touched foreign state: %s", cmd)
			return nil, errors.New("unexpected")
		}
	}}
	if err := w.cleanup(); err != nil {
		t.Fatal(err)
	}
}
