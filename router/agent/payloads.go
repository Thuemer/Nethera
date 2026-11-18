package main

// Payloads of the telemetry contract (schema version 1). Field names and types have to
// match what the backend's TelemetryPayloadParser reads.

const schemaVersion = 1

type metadataPayload struct {
	V        int    `json:"v"`
	TS       int64  `json:"ts"`
	Model    string `json:"model"`
	Firmware string `json:"firmware"`
}

// speedPayload carries cumulative byte counters; the backend computes Mbit/s from two messages
type speedPayload struct {
	V       int    `json:"v"`
	TS      int64  `json:"ts"`
	Iface   string `json:"iface"`
	RxBytes uint64 `json:"rxBytes"`
	TxBytes uint64 `json:"txBytes"`
}

// dnsPayload carries the cumulative dnsmasq counters
type dnsPayload struct {
	V               int    `json:"v"`
	TS              int64  `json:"ts"`
	Forwarded       uint64 `json:"forwarded"`
	AnsweredLocally uint64 `json:"answeredLocally"`
}

type lease struct {
	MAC      string `json:"mac"`
	IP       string `json:"ip"`
	Hostname string `json:"hostname"`
}

type devicesPayload struct {
	V         int      `json:"v"`
	TS        int64    `json:"ts"`
	Leases    []lease  `json:"leases"`
	Reachable []string `json:"reachable"`
	Wifi      []string `json:"wifi"`
}
