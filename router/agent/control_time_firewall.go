package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type timeFirewall struct {
	chain, set, offloaded bool
	blocked               map[string]bool
	counters              map[string]timeFirewallCounter
}

type timeFirewallCounter struct {
	Name    string `json:"name"`
	Bytes   uint64 `json:"bytes"`
	Packets uint64 `json:"packets"`
}

// Inspect the kernel, not an in-memory cache: fw4 can be reloaded externally.
func readTimeFirewall(src Sources) (timeFirewall, error) {
	state := timeFirewall{blocked: map[string]bool{}, counters: map[string]timeFirewallCounter{}}
	out, err := src.Run("nft", "-j", "list", "table", "inet", "fw4")
	if err != nil {
		return state, fmt.Errorf("read firewall: %w", err)
	}
	var response nftCountersOutput
	if err := json.Unmarshal(out, &response); err != nil {
		return state, fmt.Errorf("read firewall JSON: %w", err)
	}
	if response.Nftables == nil {
		return state, errors.New("missing nftables response")
	}
	for _, item := range response.Nftables {
		if _, ok := item["flowtable"]; ok {
			state.offloaded = true
		}
		if raw, ok := item["chain"]; ok {
			var chain struct{ Name string }
			if err := json.Unmarshal(raw, &chain); err != nil {
				return state, err
			}
			if chain.Name == "nethera_time" {
				state.chain = true
			}
		}
		if raw, ok := item["counter"]; ok {
			var counter timeFirewallCounter
			if err := json.Unmarshal(raw, &counter); err != nil {
				return state, err
			}
			if strings.HasPrefix(counter.Name, timeCounterPrefix) && unsanitizeMAC(strings.TrimPrefix(counter.Name, timeCounterPrefix)) != "" {
				state.counters[counter.Name] = counter
			}
		}
		if raw, ok := item["set"]; ok {
			var set struct {
				Name string
				Elem []string
			}
			var name struct{ Name string }
			if err := json.Unmarshal(raw, &name); err != nil {
				return state, err
			}
			if name.Name != timeBlockedSet {
				continue
			}
			if err := json.Unmarshal(raw, &set); err != nil {
				return state, fmt.Errorf("read blocked set: %w", err)
			}
			state.set = true
			for _, mac := range set.Elem {
				mac = strings.ToLower(mac)
				if !macPattern.MatchString(mac) {
					return state, errors.New("invalid MAC in time set")
				}
				state.blocked[mac] = true
			}
		}
	}
	return state, nil
}

func sortedTimeMACs(set map[string]bool) []string {
	keys := make([]string, 0, len(set))
	for key := range set {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func timeSetElements(blocked map[string]bool) string {
	if len(blocked) == 0 {
		return ""
	}
	return fmt.Sprintf("add element inet fw4 %s { %s }\n", timeBlockedSet, strings.Join(sortedTimeMACs(blocked), ", "))
}

// Replace only Nethera's time objects in one nft transaction. A full fw4 reload
// would erase the populated DNS sets of #25, including their cached addresses.
func timeFirewallTransaction(old timeFirewall, macs []string, blocked map[string]bool, rebuild bool) string {
	var script strings.Builder
	if rebuild {
		if old.chain {
			script.WriteString("flush chain inet fw4 nethera_time\ndelete chain inet fw4 nethera_time\n")
		}
		if old.set {
			fmt.Fprintf(&script, "delete set inet fw4 %s\n", timeBlockedSet)
		}
		names := make([]string, 0, len(old.counters))
		for name := range old.counters {
			names = append(names, name)
		}
		sort.Strings(names)
		for _, name := range names {
			fmt.Fprintf(&script, "delete counter inet fw4 %s\n", name)
		}
		config := nftTimeConfig(macs)
		for _, mac := range macs {
			name := counterName(mac)
			if counter, ok := old.counters[name]; ok {
				config = strings.Replace(config, "counter "+name+" { }", fmt.Sprintf("counter %s { packets %d bytes %d }", name, counter.Packets, counter.Bytes), 1)
			}
		}
		script.WriteString("table inet fw4 {\n" + config + "}\n")
	} else {
		fmt.Fprintf(&script, "flush set inet fw4 %s\n", timeBlockedSet)
	}
	script.WriteString(timeSetElements(blocked))
	return script.String()
}

func runTimeTransaction(src Sources, content string) error {
	file, err := os.CreateTemp("", "nethera-time-*.nft")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	_, writeErr := file.WriteString(content)
	closeErr := file.Close()
	if err := errors.Join(writeErr, closeErr); err != nil {
		return err
	}
	if _, err := src.Run("nft", "-c", "-f", file.Name()); err != nil {
		return fmt.Errorf("check time firewall: %w", err)
	}
	if _, err := src.Run("nft", "-f", file.Name()); err != nil {
		return fmt.Errorf("apply time firewall: %w", err)
	}
	return nil
}

func reconcileTimeFirewall(src Sources, control timeControl, blocked map[string]bool) error {
	old, err := readTimeFirewall(src)
	if err != nil {
		return err
	}
	if old.offloaded && len(control.Devices) > 0 {
		return errors.New("time control requires flow offloading to be disabled; router settings were not changed")
	}
	macs := counterMACs(control)
	path := filepath.Join(src.NftDir, nftTimeFileName)
	before, readErr := os.ReadFile(path)
	if readErr != nil && !os.IsNotExist(readErr) {
		return readErr
	}
	if len(before) > 0 && !strings.HasPrefix(string(before), "# Generated by nethera-agent, do not edit\n") {
		return errors.New("refusing to replace unrecognized time firewall file")
	}
	config := nftTimeConfig(macs)
	rebuild := string(before) != config || !old.chain || !old.set || len(old.counters) != len(macs)
	for _, mac := range macs {
		if _, ok := old.counters[counterName(mac)]; !ok {
			rebuild = true
		}
	}
	if !rebuild && equalStringSets(old.blocked, blocked) {
		return nil
	}
	// Persist only structural changes, not every set update. On failure restore the
	// previous boot include; nft's atomic transaction keeps the live rules unchanged.
	if _, err := writeIfChanged(path, config); err != nil {
		return fmt.Errorf("save time firewall: %w", err)
	}
	if err := runTimeTransaction(src, timeFirewallTransaction(old, macs, blocked, rebuild)); err != nil {
		_, restoreErr := writeIfChanged(path, string(before))
		return errors.Join(err, restoreErr)
	}
	return nil
}
