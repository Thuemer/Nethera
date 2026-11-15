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

	// DNS control (control_dns.go)
	DnsmasqDirGlob string // dnsmasq's include directory, its name has a random part
	NftDir         string // fw4 includes these files inside "table inet fw4"
	ControlFile    string // last desired state, on flash so it survives a power cut
	AdblockInit    string // init script of adblock-fast, exists once it is installed

	// Run executes a command and returns its standard output
	Run func(name string, args ...string) ([]byte, error)
	// RunLong is Run with more time, for installing packages
	RunLong func(name string, args ...string) ([]byte, error)
	Now     func() time.Time
	// Sleep is replaced in tests so they don't wait
	Sleep func(time.Duration)
}

const (
	commandTimeout     = 10 * time.Second
	longCommandTimeout = 5 * time.Minute
)

// runner executes commands with a time limit
func runner(timeout time.Duration) func(string, ...string) ([]byte, error) {
	return func(name string, args ...string) ([]byte, error) {
		ctx, cancel := context.WithTimeout(context.Background(), timeout)
		defer cancel()
		return exec.CommandContext(ctx, name, args...).Output()
	}
}

// RouterSources reads from the running OpenWrt system
func RouterSources() Sources {
	return Sources{
		ProcNetDev: "/proc/net/dev",
		DHCPLeases: "/tmp/dhcp.leases",
		ProcNetARP: "/proc/net/arp",
		NTPFlag:    "/var/run/nethera-ntp-synced",

		DnsmasqDirGlob: "/tmp/dnsmasq*.d",
		NftDir:         "/usr/share/nftables.d/table-post",
		ControlFile:    "/etc/nethera/dns-control.json",
		AdblockInit:    "/etc/init.d/adblock-fast",

		Run:     runner(commandTimeout),
		RunLong: runner(longCommandTimeout),
		Now:     time.Now,
		Sleep:   time.Sleep,
	}
}
