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
	for _, want := range []string{"ether saddr 02:00:00:00:00:01", "ip daddr 192.168.1.5", "ip6 daddr 2001:db8::5", "0x7e000001"} {
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
		if err := w.ensureQueue("wan"); err == nil {
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
	if len(calls) != 4 {
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
	if err := w.verifyQueue("wan"); err == nil {
		t.Fatal("confirmed without default class")
	}
}
