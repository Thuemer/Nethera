package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// controlSources points the DNS control at temporary directories and records every command.
// nftset says whether the fake dnsmasq is dnsmasq-full.
func controlSources(t *testing.T, nftset bool) (Sources, *[]string) {
	t.Helper()
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "dnsmasq.cfg01411c.d"), 0o755); err != nil {
		t.Fatal(err)
	}
	var commands []string
	run := func(name string, args ...string) ([]byte, error) {
		line := strings.Join(append([]string{name}, args...), " ")
		commands = append(commands, line)
		switch line {
		case "dnsmasq --version":
			if nftset {
				return []byte("Compile time options: IPv6 GNU-getopt no-DBus UBus no-i18n nftset auth"), nil
			}
			return []byte("Compile time options: IPv6 GNU-getopt no-DBus UBus no-i18n no-nftset auth"), nil
		case "uci -q get adblock-fast.config.enabled":
			return []byte("0\n"), nil
		}
		return nil, nil
	}
	return Sources{
		DnsmasqDirGlob: filepath.Join(dir, "dnsmasq*.d"),
		NftDir:         filepath.Join(dir, "nftables.d"),
		ControlFile:    filepath.Join(dir, "etc", "dns-control.json"),
		AdblockInit:    filepath.Join(dir, "adblock-fast"),
		Run:            run,
		RunLong:        run,
		Now:            func() time.Time { return time.Unix(1791890000, 0) },
	}, &commands
}

func ran(commands []string, want string) bool {
	for _, c := range commands {
		if c == want {
			return true
		}
	}
	return false
}

func TestParseDNSControl(t *testing.T) {
	c, err := parseDNSControl([]byte(`{"v":1,"version":7,"adblock":true,
		"network":["TikTok.com","tiktok.com.","instagram.com"],
		"devices":{"AA:BB:CC:DD:EE:01":["youtube.com"]}}`))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(c.Network, ",") != "instagram.com,tiktok.com" {
		t.Errorf("network = %v, want sorted, lowercase, without duplicates", c.Network)
	}
	if got := c.Devices["aa:bb:cc:dd:ee:01"]; len(got) != 1 || got[0] != "youtube.com" {
		t.Errorf("devices = %v, want the MAC in lowercase", c.Devices)
	}
}

func TestParseDNSControlRefusesUnsafeValues(t *testing.T) {
	bad := map[string]string{
		"newline in domain": `{"v":1,"version":1,"network":["a.com\nserver=1.2.3.4"]}`,
		"slash in domain":   `{"v":1,"version":1,"network":["a.com/#"]}`,
		"category word":     `{"v":1,"version":1,"network":["adult"]}`,
		"bad MAC":           `{"v":1,"version":1,"devices":{"aa:bb; reboot":["a.com"]}}`,
		"no version":        `{"v":1,"network":["a.com"]}`,
		"wrong schema":      `{"v":2,"version":1}`,
		"not JSON":          `block everything`,
	}
	for name, data := range bad {
		if _, err := parseDNSControl([]byte(data)); err == nil {
			t.Errorf("%s: accepted, want an error", name)
		}
	}
}

func TestGeneratedFiles(t *testing.T) {
	c := dnsControl{
		Network: []string{"tiktok.com"},
		Devices: map[string][]string{"aa:bb:cc:dd:ee:01": {"youtube.com"}},
	}
	dnsmasq := dnsmasqConfig(c)
	for _, want := range []string{
		"address=/tiktok.com/\n",
		"nftset=/youtube.com/4#inet#fw4#nethera_aabbccddee01_4,6#inet#fw4#nethera_aabbccddee01_6\n",
	} {
		if !strings.Contains(dnsmasq, want) {
			t.Errorf("dnsmasq config misses %q:\n%s", want, dnsmasq)
		}
	}
	nft := nftConfig(c)
	for _, want := range []string{
		"set nethera_aabbccddee01_4 { type ipv4_addr;",
		"ether saddr aa:bb:cc:dd:ee:01 ip daddr @nethera_aabbccddee01_4 reject",
		"ether saddr aa:bb:cc:dd:ee:01 ip6 daddr @nethera_aabbccddee01_6 reject",
	} {
		if !strings.Contains(nft, want) {
			t.Errorf("nft config misses %q:\n%s", want, nft)
		}
	}
	if nftConfig(dnsControl{Network: []string{"a.com"}}) != "" {
		t.Error("nft config should be empty without device blocks")
	}
}

func TestApplyNetworkBlocksRestartsDnsmasqOnlyOnChange(t *testing.T) {
	src, commands := controlSources(t, false)
	c := dnsControl{Version: 3, Network: []string{"tiktok.com"}}

	result := applyDNSControl(src, c)
	if !result.Applied || result.Error != "" || result.Version != 3 {
		t.Fatalf("result = %+v, want applied version 3", result)
	}
	file, _ := filepath.Glob(filepath.Join(filepath.Dir(src.DnsmasqDirGlob), "dnsmasq*.d", dnsmasqFileName))
	if len(file) != 1 {
		t.Fatal("dnsmasq file was not written")
	}
	if !ran(*commands, "/etc/init.d/dnsmasq restart") {
		t.Error("dnsmasq was not restarted after the first apply")
	}

	*commands = nil
	applyDNSControl(src, c)
	if ran(*commands, "/etc/init.d/dnsmasq restart") {
		t.Error("dnsmasq was restarted although nothing changed")
	}
}

func TestApplyDeviceBlocksNeedsDnsmasqFull(t *testing.T) {
	c := dnsControl{Version: 1, Devices: map[string][]string{"aa:bb:cc:dd:ee:01": {"youtube.com"}}}

	src, _ := controlSources(t, false)
	result := applyDNSControl(src, c)
	if result.Applied || !strings.Contains(result.Error, "dnsmasq-full") {
		t.Errorf("without nftset: result = %+v, want not applied with a dnsmasq-full hint", result)
	}

	src, commands := controlSources(t, true)
	result = applyDNSControl(src, c)
	if !result.Applied {
		t.Fatalf("with nftset: result = %+v, want applied", result)
	}
	if !ran(*commands, "fw4 reload") {
		t.Error("firewall was not reloaded for the new device sets")
	}
}

func TestApplyAdblockInstallsWhenWanted(t *testing.T) {
	src, commands := controlSources(t, false)
	applyDNSControl(src, dnsControl{Version: 1, Adblock: true})
	for _, want := range []string{"apk update", "apk add adblock-fast"} {
		if !ran(*commands, want) {
			t.Errorf("%q was not run", want)
		}
	}

	// Switching off while it is not installed must not install it
	src, commands = controlSources(t, false)
	applyDNSControl(src, dnsControl{Version: 1, Adblock: false})
	if ran(*commands, "apk add adblock-fast") {
		t.Error("adblock-fast was installed although it is not wanted")
	}
}

func TestSavedControlSurvivesRestart(t *testing.T) {
	src, _ := controlSources(t, false)
	data := []byte(`{"v":1,"version":5,"adblock":false,"network":["tiktok.com"],"devices":{}}`)
	if err := saveControl(src.ControlFile, data); err != nil {
		t.Fatal(err)
	}
	c, ok := loadSavedControl(src.ControlFile)
	if !ok || c.Version != 5 || c.Network[0] != "tiktok.com" {
		t.Errorf("loaded %+v (ok=%v), want version 5 with tiktok.com", c, ok)
	}
	if _, ok := loadSavedControl(filepath.Join(t.TempDir(), "missing.json")); ok {
		t.Error("a missing file should not give a state")
	}
}
