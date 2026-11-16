package main

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var dnsmasqStatsLine = regexp.MustCompile(`queries forwarded (\d+), queries answered locally (\d+)`)

// collectDNS reads the cumulative dnsmasq counters. It asks ubus first; if dnsmasq does
// not offer its metrics there, it makes dnsmasq write them to the system log (SIGUSR1)
// and reads the newest line.
func collectDNS(src Sources) (dnsPayload, error) {
	if payload, err := dnsFromUbus(src); err == nil {
		return payload, nil
	}
	return dnsFromLog(src)
}

func dnsFromUbus(src Sources) (dnsPayload, error) {
	out, err := src.Run("ubus", "call", "dnsmasq", "metrics")
	if err != nil {
		return dnsPayload{}, err
	}
	var metrics struct {
		Forwarded *uint64 `json:"dns_queries_forwarded"`
		Local     *uint64 `json:"dns_local_answered"`
	}
	if err := json.Unmarshal(out, &metrics); err != nil {
		return dnsPayload{}, err
	}
	if metrics.Forwarded == nil || metrics.Local == nil {
		return dnsPayload{}, fmt.Errorf("ubus dnsmasq metrics lack the dns counters")
	}
	return dnsPayload{V: schemaVersion, TS: src.Now().Unix(), Forwarded: *metrics.Forwarded, AnsweredLocally: *metrics.Local}, nil
}

func dnsFromLog(src Sources) (dnsPayload, error) {
	pids, err := src.Run("pidof", "dnsmasq")
	if err != nil || len(strings.Fields(string(pids))) == 0 {
		return dnsPayload{}, fmt.Errorf("dnsmasq is not running")
	}
	if _, err := src.Run("kill", append([]string{"-USR1"}, strings.Fields(string(pids))...)...); err != nil {
		return dnsPayload{}, fmt.Errorf("signal dnsmasq: %w", err)
	}
	src.Sleep(time.Second)

	out, err := src.Run("logread", "-e", "queries forwarded")
	if err != nil {
		return dnsPayload{}, fmt.Errorf("logread: %w", err)
	}
	matches := dnsmasqStatsLine.FindAllStringSubmatch(string(out), -1)
	if len(matches) == 0 {
		return dnsPayload{}, fmt.Errorf("no dnsmasq statistics in the system log")
	}
	newest := matches[len(matches)-1]
	forwarded, _ := strconv.ParseUint(newest[1], 10, 64)
	local, _ := strconv.ParseUint(newest[2], 10, 64)
	return dnsPayload{V: schemaVersion, TS: src.Now().Unix(), Forwarded: forwarded, AnsweredLocally: local}, nil
}
