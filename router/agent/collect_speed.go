package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// wanInterface returns the device that carries the internet traffic: the configured one,
// or the device of the logical interface that holds the IPv4 default route. On a router
// whose uplink is a Wi-Fi client, that is the radio (phy1-sta0) and not the wan port.
func wanInterface(src Sources, configured string) (string, error) {
	if configured != "" {
		return configured, nil
	}
	out, err := src.Run("ubus", "call", "network.interface", "dump")
	if err != nil {
		return "", fmt.Errorf("ubus call network.interface dump: %w", err)
	}
	var dump struct {
		Interface []struct {
			Up       bool   `json:"up"`
			Device   string `json:"device"`
			L3Device string `json:"l3_device"`
			Route    []struct {
				Target string `json:"target"`
				Mask   int    `json:"mask"`
			} `json:"route"`
		} `json:"interface"`
	}
	if err := json.Unmarshal(out, &dump); err != nil {
		return "", fmt.Errorf("ubus call network.interface dump: %w", err)
	}
	for _, iface := range dump.Interface {
		if !iface.Up {
			continue
		}
		for _, route := range iface.Route {
			if route.Target == "0.0.0.0" && route.Mask == 0 {
				if iface.L3Device != "" {
					return iface.L3Device, nil
				}
				return iface.Device, nil
			}
		}
	}
	return "", fmt.Errorf("no interface with a default route")
}

// collectSpeed reads the cumulative byte counters of the WAN interface from /proc/net/dev
func collectSpeed(src Sources, configuredIface string) (speedPayload, error) {
	iface, err := wanInterface(src, configuredIface)
	if err != nil {
		return speedPayload{}, err
	}
	data, err := os.ReadFile(src.ProcNetDev)
	if err != nil {
		return speedPayload{}, err
	}
	// Line format: "<iface>: <rx bytes> <7 more rx fields> <tx bytes> ..."
	for _, line := range strings.Split(string(data), "\n") {
		name, counters, found := strings.Cut(line, ":")
		if !found || strings.TrimSpace(name) != iface {
			continue
		}
		fields := strings.Fields(counters)
		if len(fields) < 9 {
			break
		}
		rx, errRx := strconv.ParseUint(fields[0], 10, 64)
		tx, errTx := strconv.ParseUint(fields[8], 10, 64)
		if errRx != nil || errTx != nil {
			break
		}
		return speedPayload{V: schemaVersion, TS: src.Now().Unix(), Iface: iface, RxBytes: rx, TxBytes: tx}, nil
	}
	return speedPayload{}, fmt.Errorf("interface %s has no counters in %s", iface, src.ProcNetDev)
}
