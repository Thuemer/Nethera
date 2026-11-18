package main

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// Transports the agent can use to reach the broker
const (
	TransportWSS = "wss" // MQTT over WebSockets with TLS (LeoCloud)
	TransportWS  = "ws"  // MQTT over WebSockets without TLS (development broker)
	TransportTCP = "tcp" // plain MQTT (development broker)
)

const minInterval = 10 * time.Second

// Config holds the settings of the agent. The init script reads them from the UCI
// section nethera.agent and hands them over as NETHERA_* environment variables.
type Config struct {
	RouterID  int
	Broker    string
	Transport string
	Port      int
	WSPath    string
	Username  string
	Password  string
	Interval  time.Duration
	WANIface  string
	TLSCA     string
}

// LoadConfig reads the settings through getenv (os.Getenv in production), applies the
// defaults and rejects invalid values. A dry run only needs the router ID.
func LoadConfig(getenv func(string) string, dryRun bool) (Config, error) {
	cfg := Config{
		Broker:    strings.TrimSpace(getenv("NETHERA_BROKER")),
		Transport: strings.TrimSpace(getenv("NETHERA_TRANSPORT")),
		WSPath:    strings.TrimSpace(getenv("NETHERA_WS_PATH")),
		Username:  getenv("NETHERA_USERNAME"),
		Password:  getenv("NETHERA_PASSWORD"),
		WANIface:  strings.TrimSpace(getenv("NETHERA_WAN_IFACE")),
		TLSCA:     strings.TrimSpace(getenv("NETHERA_TLS_CA")),
	}

	id, err := strconv.Atoi(strings.TrimSpace(getenv("NETHERA_ROUTER_ID")))
	if err != nil || id <= 0 {
		return Config{}, fmt.Errorf("router_id is missing or not a positive number")
	}
	cfg.RouterID = id

	if cfg.Transport == "" {
		cfg.Transport = TransportWSS
	}
	defaultPort, ok := map[string]int{TransportWSS: 443, TransportWS: 9001, TransportTCP: 1883}[cfg.Transport]
	if !ok {
		return Config{}, fmt.Errorf("transport %q is not allowed, use wss, ws or tcp", cfg.Transport)
	}

	cfg.Port = defaultPort
	if port := strings.TrimSpace(getenv("NETHERA_PORT")); port != "" {
		cfg.Port, err = strconv.Atoi(port)
		if err != nil || cfg.Port < 1 || cfg.Port > 65535 {
			return Config{}, fmt.Errorf("port %q is not a number between 1 and 65535", port)
		}
	}

	if cfg.WSPath == "" {
		cfg.WSPath = "/mqtt"
	}
	if !strings.HasPrefix(cfg.WSPath, "/") {
		return Config{}, fmt.Errorf("ws_path %q has to start with /", cfg.WSPath)
	}

	if cfg.Username == "" {
		cfg.Username = fmt.Sprintf("router-%d", cfg.RouterID)
	}

	cfg.Interval = 30 * time.Second
	if interval := strings.TrimSpace(getenv("NETHERA_INTERVAL")); interval != "" {
		seconds, err := strconv.Atoi(interval)
		if err != nil || seconds <= 0 {
			return Config{}, fmt.Errorf("interval %q is not a positive number of seconds", interval)
		}
		cfg.Interval = time.Duration(seconds) * time.Second
	}
	if cfg.Interval < minInterval {
		cfg.Interval = minInterval
	}

	if !dryRun {
		if cfg.Broker == "" {
			return Config{}, fmt.Errorf("broker is missing")
		}
		if cfg.Password == "" {
			return Config{}, fmt.Errorf("password is missing")
		}
	}
	return cfg, nil
}

// BrokerURL is the address Paho connects to, for example wss://host:443/mqtt
func (c Config) BrokerURL() string {
	if c.Transport == TransportTCP {
		return fmt.Sprintf("tcp://%s:%d", c.Broker, c.Port)
	}
	return fmt.Sprintf("%s://%s:%d%s", c.Transport, c.Broker, c.Port, c.WSPath)
}

// Topic returns a topic below this router's prefix, for example nethera/1/status
func (c Config) Topic(suffix string) string {
	return fmt.Sprintf("nethera/%d/%s", c.RouterID, suffix)
}
