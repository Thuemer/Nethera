package main

import (
	"context"
	"os/exec"
	"time"
)

// Sources is everything the collectors read from the router. In production it points
// at the real system; tests point it at files under testdata and a fake command runner.
type Sources struct {
	ProcNetDev string
	DHCPLeases string
	ProcNetARP string
	// NTPFlag is created by /etc/hotplug.d/ntp/50-nethera once the clock is synchronized
	NTPFlag string

	// Run executes a command and returns its standard output
	Run func(name string, args ...string) ([]byte, error)
	Now func() time.Time
	// Sleep is replaced in tests so they don't wait
	Sleep func(time.Duration)
}

const commandTimeout = 10 * time.Second

// RouterSources reads from the running OpenWrt system
func RouterSources() Sources {
	return Sources{
		ProcNetDev: "/proc/net/dev",
		DHCPLeases: "/tmp/dhcp.leases",
		ProcNetARP: "/proc/net/arp",
		NTPFlag:    "/var/run/nethera-ntp-synced",
		Run: func(name string, args ...string) ([]byte, error) {
			ctx, cancel := context.WithTimeout(context.Background(), commandTimeout)
			defer cancel()
			return exec.CommandContext(ctx, name, args...).Output()
		},
		Now:   time.Now,
		Sleep: time.Sleep,
	}
}
