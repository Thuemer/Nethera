package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"log"
	"os"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

const (
	keepAlive      = 30 * time.Second
	connectTimeout = 15 * time.Second
	publishTimeout = 10 * time.Second
	minBackoff     = 5 * time.Second
	maxBackoff     = 60 * time.Second

	statusOnline  = "online"
	statusOffline = "offline"
)

var errNotConnected = errors.New("not connected to the broker")

// Connection owns the one long-lived MQTT connection of the agent. It keeps the
// connection up, reports the router online after every connect, and leaves the Last
// Will "offline" with the broker for the case that the router disappears.
type Connection struct {
	cfg    Config
	client mqtt.Client
	// lost receives the reason whenever the broker connection drops
	lost chan error
	// onConnect runs after every successful connect, before "online" is published
	onConnect func(*Connection)
}

// NewConnection prepares the client. Nothing is sent until Run is called.
func NewConnection(cfg Config, onConnect func(*Connection)) (*Connection, error) {
	c := &Connection{cfg: cfg, lost: make(chan error, 1), onConnect: onConnect}

	opts := mqtt.NewClientOptions().
		AddBroker(cfg.BrokerURL()).
		SetClientID(fmt.Sprintf("nethera-router-%d", cfg.RouterID)).
		SetUsername(cfg.Username).
		SetPassword(cfg.Password).
		SetKeepAlive(keepAlive).
		SetConnectTimeout(connectTimeout).
		SetWriteTimeout(publishTimeout).
		SetCleanSession(true).
		// Reconnecting is done in Run, so that the backoff and the logging are in one place
		SetAutoReconnect(false).
		SetConnectRetry(false).
		// The broker publishes this for us if the connection dies without a goodbye
		SetWill(cfg.Topic("status"), statusOffline, 1, true).
		SetConnectionLostHandler(func(_ mqtt.Client, err error) {
			select {
			case c.lost <- err:
			default:
			}
		})

	if cfg.Transport == TransportWSS {
		tlsConfig, err := newTLSConfig(cfg.TLSCA)
		if err != nil {
			return nil, err
		}
		opts.SetTLSConfig(tlsConfig)
	} else {
		log.Printf("warning: transport %s is not encrypted, use it only for a development broker", cfg.Transport)
	}

	c.client = mqtt.NewClient(opts)
	return c, nil
}

// newTLSConfig verifies the broker certificate against the system CA bundle, or against
// the PEM file caFile if one is configured. Verification cannot be switched off.
func newTLSConfig(caFile string) (*tls.Config, error) {
	cfg := &tls.Config{MinVersion: tls.VersionTLS12}
	if caFile == "" {
		return cfg, nil
	}
	pem, err := os.ReadFile(caFile)
	if err != nil {
		return nil, fmt.Errorf("tls_ca: %w", err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(pem) {
		return nil, fmt.Errorf("tls_ca: %s contains no certificate", caFile)
	}
	cfg.RootCAs = pool
	return cfg, nil
}

// nextBackoff doubles the waiting time between connect attempts up to maxBackoff
func nextBackoff(current time.Duration) time.Duration {
	if current < minBackoff {
		return minBackoff
	}
	if next := current * 2; next < maxBackoff {
		return next
	}
	return maxBackoff
}

// Run keeps the connection up until ctx is cancelled. It never gives up: a broker that
// is down, a wrong password or a certificate that is not valid yet are retried with a
// growing pause. Each new kind of failure is logged once, not on every attempt.
func (c *Connection) Run(ctx context.Context) {
	backoff := time.Duration(0)
	lastError := ""

	for ctx.Err() == nil {
		token := c.client.Connect()
		token.Wait()

		if err := token.Error(); err != nil {
			if err.Error() != lastError {
				log.Printf("cannot connect to %s: %v (retrying)", c.cfg.BrokerURL(), err)
				lastError = err.Error()
			}
			backoff = nextBackoff(backoff)
			if !sleep(ctx, backoff) {
				return
			}
			continue
		}

		log.Printf("connected to %s as %s", c.cfg.BrokerURL(), c.cfg.Username)
		backoff, lastError = 0, ""
		if c.onConnect != nil {
			c.onConnect(c)
		}
		if err := c.Publish("status", 1, true, []byte(statusOnline)); err != nil {
			log.Printf("could not publish online: %v", err)
		}

		select {
		case err := <-c.lost:
			log.Printf("connection lost: %v (reconnecting)", err)
		case <-ctx.Done():
			return
		}
	}
}

// sleep waits for d and reports false if ctx was cancelled in the meantime
func sleep(ctx context.Context, d time.Duration) bool {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-timer.C:
		return true
	case <-ctx.Done():
		return false
	}
}

// Connected reports whether messages can be published right now
func (c *Connection) Connected() bool {
	return c.client.IsConnectionOpen()
}

// Publish sends one message below the router's topic prefix and waits at most
// publishTimeout for the result. Nothing is queued while the connection is down.
func (c *Connection) Publish(suffix string, qos byte, retained bool, payload []byte) error {
	if !c.Connected() {
		return errNotConnected
	}
	token := c.client.Publish(c.cfg.Topic(suffix), qos, retained, payload)
	if !token.WaitTimeout(publishTimeout) {
		return fmt.Errorf("publish to %s timed out after %s", c.cfg.Topic(suffix), publishTimeout)
	}
	return token.Error()
}

// Close reports the router offline and ends the connection cleanly, so the broker does
// not send the Last Will on top of it.
func (c *Connection) Close() {
	if c.Connected() {
		if err := c.Publish("status", 1, true, []byte(statusOffline)); err != nil {
			log.Printf("could not publish offline: %v", err)
		}
	}
	c.client.Disconnect(250)
}
