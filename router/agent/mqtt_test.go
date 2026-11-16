package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestNextBackoffGrowsFromFiveToSixtySeconds(t *testing.T) {
	want := []time.Duration{5, 10, 20, 40, 60, 60}
	current := time.Duration(0)
	for i, seconds := range want {
		current = nextBackoff(current)
		if current != seconds*time.Second {
			t.Errorf("attempt %d: backoff = %v, want %v", i+1, current, seconds*time.Second)
		}
	}
}

func TestNewTLSConfigUsesSystemBundleByDefault(t *testing.T) {
	cfg, err := newTLSConfig("")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.RootCAs != nil {
		t.Error("RootCAs should be nil, so that Go uses the system CA bundle")
	}
	if cfg.InsecureSkipVerify {
		t.Error("certificate verification must stay on")
	}
}

func TestNewTLSConfigRejectsBadCAFile(t *testing.T) {
	if _, err := newTLSConfig(filepath.Join(t.TempDir(), "missing.pem")); err == nil {
		t.Error("expected an error for a missing CA file")
	}

	notACert := filepath.Join(t.TempDir(), "empty.pem")
	if err := os.WriteFile(notACert, []byte("not a certificate"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := newTLSConfig(notACert); err == nil {
		t.Error("expected an error for a CA file without a certificate")
	}
}

func TestPublishWithoutConnectionIsRefused(t *testing.T) {
	conn, err := NewConnection(Config{RouterID: 1, Broker: "broker.invalid", Transport: TransportTCP, Port: 1883}, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := conn.Publish("status", 1, true, []byte("online")); err != errNotConnected {
		t.Errorf("Publish = %v, want errNotConnected", err)
	}
}
