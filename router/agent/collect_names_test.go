package main

import (
	"os"
	"path/filepath"
	"testing"
)

// The fixtures are the (anonymized) output of umdns on the Cudy, including its repeated
// "txt" and "ipv6" keys.
var mdnsCommands = map[string]string{
	"ubus call umdns browse": "ubus_umdns_browse.json",
	"ubus call umdns hosts":  "ubus_umdns_hosts.json",
}

func leasesFile(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "dhcp.leases")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestCollectNames(t *testing.T) {
	names := collectNames(testSources(t, mdnsCommands))

	if got := names["192.168.1.132"]; got.Name != "MacBook Air von Test" || !got.Friendly {
		t.Errorf("name = %+v, want the announced device name", got)
	}
	// Only a host name is known: readable, but not chosen by the owner
	if got := names["192.168.1.192"]; got.Name != "living room speaker" || got.Friendly {
		t.Errorf("name = %+v, want the name derived from the host name", got)
	}
}

func TestCollectNamesWithoutUmdns(t *testing.T) {
	if names := collectNames(testSources(t, nil)); len(names) != 0 {
		t.Errorf("names = %v, want none without umdns", names)
	}
}

func TestDevicesUseAnnouncedNames(t *testing.T) {
	src := testSources(t, mdnsCommands)
	src.KnownNames = map[string]mdnsName{}
	src.DHCPLeases = leasesFile(t, ""+
		"1 02:00:00:00:00:01 192.168.1.132 * 01:02\n"+ // private address: no DHCP name
		"1 02:00:00:00:00:03 192.168.1.192 speaker 01:03\n"+ // real DHCP name, only a host name announced
		"1 02:00:00:00:00:05 192.168.1.200 * 01:05\n") // announces nothing
	got, err := collectDevices(src)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"MacBook Air von Test", "speaker", "*"}
	for i, name := range want {
		if got.Leases[i].Hostname != name {
			t.Errorf("lease %d hostname = %q, want %q", i, got.Leases[i].Hostname, name)
		}
	}
}

func TestAnnouncedNameReplacesGenericDHCPName(t *testing.T) {
	src := testSources(t, mdnsCommands)
	src.DHCPLeases = leasesFile(t, "1 02:00:00:00:00:01 192.168.1.132 Mac 01:02\n")
	got, _ := collectDevices(src)
	if got.Leases[0].Hostname != "MacBook Air von Test" {
		t.Errorf("hostname = %q, want the announced name instead of \"Mac\"", got.Leases[0].Hostname)
	}
}

func TestHostNameReplacesShorterGenericDHCPName(t *testing.T) {
	names := map[string]mdnsName{"192.168.1.155": {Name: "iPhone Moritz"}, "192.168.1.192": {Name: "living room speaker"}}
	leases := []lease{
		{MAC: "02:00:00:00:00:01", IP: "192.168.1.155", Hostname: "iPhone"},
		{MAC: "02:00:00:00:00:03", IP: "192.168.1.192", Hostname: "speaker"},
	}
	applyNames(leases, names, nil)
	if leases[0].Hostname != "iPhone Moritz" {
		t.Errorf("hostname = %q, want the more specific \"iPhone Moritz\"", leases[0].Hostname)
	}
	if leases[1].Hostname != "speaker" {
		t.Errorf("hostname = %q, want the unrelated DHCP name to stay", leases[1].Hostname)
	}
}

func TestSleepingDeviceKeepsItsName(t *testing.T) {
	src := testSources(t, mdnsCommands)
	src.KnownNames = map[string]mdnsName{}
	src.DHCPLeases = leasesFile(t, "1 02:00:00:00:00:01 192.168.1.132 * 01:02\n")
	collectDevices(src)

	// The device stops announcing (asleep) and even gets another IP address
	asleep := testSources(t, nil)
	asleep.KnownNames = src.KnownNames
	asleep.DHCPLeases = leasesFile(t, "1 02:00:00:00:00:01 192.168.1.140 * 01:02\n")
	got, _ := collectDevices(asleep)
	if got.Leases[0].Hostname != "MacBook Air von Test" {
		t.Errorf("hostname = %q, want the remembered name", got.Leases[0].Hostname)
	}
}

func TestCleanName(t *testing.T) {
	if got := cleanName("  Evil\x00\nName\t von  Test "); got != "Evil Name von Test" {
		t.Errorf("cleanName = %q", got)
	}
	long := cleanName(string(make([]rune, 0)) + "ääääääääääääääääääääääääääääääääääääääääääääääääääääääääääääääääääääääää")
	if len([]rune(long)) != maxNameLength {
		t.Errorf("long name has %d characters, want %d", len([]rune(long)), maxNameLength)
	}
}
