package main

import (
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

const noMAC = "00:00:00:00:00:00"

// collectDevices builds the device snapshot from the same three sources as the SSH sync:
// DHCP leases (who exists), the ARP table after a ping sweep (who is here right now) and
// the Wi-Fi station lists (who is connected wirelessly).
func collectDevices(src Sources) (devicesPayload, error) {
	payload := devicesPayload{V: schemaVersion, Leases: []lease{}, Reachable: []string{}, Wifi: []string{}}

	leases, err := os.ReadFile(src.DHCPLeases)
	if err != nil && !os.IsNotExist(err) {
		return payload, err
	}
	// dhcp.leases columns: expiry mac ip hostname client-id
	for _, line := range strings.Split(string(leases), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}
		payload.Leases = append(payload.Leases, lease{MAC: strings.ToLower(fields[1]), IP: fields[2], Hostname: fields[3]})
	}

	// The name a device announces itself is better than its DHCP name
	applyNames(payload.Leases, collectNames(src), src.KnownNames)

	// Ping every lease once, so devices that are present show up in the ARP table
	var sweep sync.WaitGroup
	for _, l := range payload.Leases {
		sweep.Add(1)
		go func(ip string) {
			defer sweep.Done()
			src.Run("ping", "-c", "1", "-W", "1", ip)
		}(l.IP)
	}
	sweep.Wait()
	src.Sleep(2 * time.Second)

	payload.Reachable = reachableMACs(src)
	payload.Wifi = wifiMACs(src)
	payload.TS = src.Now().Unix()
	return payload, nil
}

// reachableMACs returns the MACs with an answered entry in /proc/net/arp
func reachableMACs(src Sources) []string {
	data, err := os.ReadFile(src.ProcNetARP)
	if err != nil {
		return []string{}
	}
	var macs []string
	// Columns: ip, hw type, flags, mac, mask, device; flags 0x0 means no answer
	for i, line := range strings.Split(string(data), "\n") {
		fields := strings.Fields(line)
		if i == 0 || len(fields) < 4 {
			continue
		}
		if mac := strings.ToLower(fields[3]); fields[2] != "0x0" && mac != noMAC {
			macs = append(macs, mac)
		}
	}
	return sortedUnique(macs)
}

// wifiMACs returns the stations associated with any wireless interface.
// Without iw the list is empty and every device counts as LAN.
func wifiMACs(src Sources) []string {
	out, err := src.Run("iw", "dev")
	if err != nil {
		return []string{}
	}
	var macs []string
	for _, line := range strings.Split(string(out), "\n") {
		fields := strings.Fields(line)
		if len(fields) != 2 || fields[0] != "Interface" {
			continue
		}
		dump, err := src.Run("iw", "dev", fields[1], "station", "dump")
		if err != nil {
			continue
		}
		for _, stationLine := range strings.Split(string(dump), "\n") {
			station := strings.Fields(stationLine)
			if len(station) >= 2 && station[0] == "Station" {
				macs = append(macs, strings.ToLower(station[1]))
			}
		}
	}
	return sortedUnique(macs)
}

func sortedUnique(values []string) []string {
	result := []string{}
	seen := map[string]bool{}
	for _, v := range values {
		if !seen[v] {
			seen[v] = true
			result = append(result, v)
		}
	}
	sort.Strings(result)
	return result
}
