package main

import (
	"strings"
	"testing"
	"time"
)

// env turns a map into the getenv function LoadConfig expects
func env(values map[string]string) func(string) string {
	return func(key string) string { return values[key] }
}

func TestLoadConfigDefaults(t *testing.T) {
	cfg, err := LoadConfig(env(map[string]string{
		"NETHERA_ROUTER_ID": "1",
		"NETHERA_BROKER":    "it220208.cloud.htl-leonding.ac.at",
		"NETHERA_PASSWORD":  "secret",
	}), false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.Transport != TransportWSS || cfg.Port != 443 || cfg.WSPath != "/mqtt" {
		t.Errorf("transport defaults = %s %d %s, want wss 443 /mqtt", cfg.Transport, cfg.Port, cfg.WSPath)
	}
	if cfg.Username != "router-1" {
		t.Errorf("username = %q, want router-1", cfg.Username)
	}
	if cfg.Interval != 30*time.Second {
		t.Errorf("interval = %v, want 30s", cfg.Interval)
	}
	if got, want := cfg.BrokerURL(), "wss://it220208.cloud.htl-leonding.ac.at:443/mqtt"; got != want {
		t.Errorf("BrokerURL = %q, want %q", got, want)
	}
	if got, want := cfg.Topic("telemetry/speed"), "nethera/1/telemetry/speed"; got != want {
		t.Errorf("Topic = %q, want %q", got, want)
	}
}

func TestLoadConfigTransports(t *testing.T) {
	tests := []struct {
		transport, port, wantURL string
	}{
		{"tcp", "", "tcp://broker.lan:1883"},
		{"ws", "", "ws://broker.lan:9001/mqtt"},
		{"wss", "8443", "wss://broker.lan:8443/mqtt"},
	}
	for _, tt := range tests {
		cfg, err := LoadConfig(env(map[string]string{
			"NETHERA_ROUTER_ID": "7",
			"NETHERA_BROKER":    "broker.lan",
			"NETHERA_PASSWORD":  "secret",
			"NETHERA_TRANSPORT": tt.transport,
			"NETHERA_PORT":      tt.port,
		}), false)
		if err != nil {
			t.Fatalf("%s: unexpected error: %v", tt.transport, err)
		}
		if got := cfg.BrokerURL(); got != tt.wantURL {
			t.Errorf("%s: BrokerURL = %q, want %q", tt.transport, got, tt.wantURL)
		}
	}
}

func TestLoadConfigIntervalMinimum(t *testing.T) {
	cfg, err := LoadConfig(env(map[string]string{
		"NETHERA_ROUTER_ID": "1",
		"NETHERA_BROKER":    "broker.lan",
		"NETHERA_PASSWORD":  "secret",
		"NETHERA_INTERVAL":  "3",
	}), false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Interval != 10*time.Second {
		t.Errorf("interval = %v, want the minimum of 10s", cfg.Interval)
	}
}

func TestLoadConfigRejects(t *testing.T) {
	valid := map[string]string{
		"NETHERA_ROUTER_ID": "1",
		"NETHERA_BROKER":    "broker.lan",
		"NETHERA_PASSWORD":  "secret",
	}
	tests := []struct {
		name, key, value, wantInError string
	}{
		{"missing router id", "NETHERA_ROUTER_ID", "", "router_id"},
		{"router id not a number", "NETHERA_ROUTER_ID", "abc", "router_id"},
		{"missing broker", "NETHERA_BROKER", "", "broker"},
		{"missing password", "NETHERA_PASSWORD", "", "password"},
		{"unknown transport", "NETHERA_TRANSPORT", "mqtts", "wss, ws or tcp"},
		{"bad port", "NETHERA_PORT", "99999", "port"},
		{"bad interval", "NETHERA_INTERVAL", "soon", "interval"},
		{"path without slash", "NETHERA_WS_PATH", "mqtt", "ws_path"},
	}
	for _, tt := range tests {
		values := map[string]string{}
		for k, v := range valid {
			values[k] = v
		}
		values[tt.key] = tt.value

		_, err := LoadConfig(env(values), false)
		if err == nil {
			t.Errorf("%s: expected an error", tt.name)
			continue
		}
		if !strings.Contains(err.Error(), tt.wantInError) {
			t.Errorf("%s: error %q does not name %q", tt.name, err, tt.wantInError)
		}
	}
}

func TestLoadConfigDryRunNeedsOnlyRouterID(t *testing.T) {
	cfg, err := LoadConfig(env(map[string]string{"NETHERA_ROUTER_ID": "1"}), true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.RouterID != 1 {
		t.Errorf("router id = %d, want 1", cfg.RouterID)
	}

	if _, err := LoadConfig(env(map[string]string{}), true); err == nil {
		t.Error("expected an error without a router id, also in a dry run")
	}
}
