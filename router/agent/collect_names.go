package main

// Device names from mDNS (Bonjour).
//
// Apple devices with a private Wi-Fi address send no useful name over DHCP ("*" or just
// "iPhone"). But they announce the name their owner gave them, e.g. "MacBook Air von
// Moritz", to the local network. umdns collects these announcements; the agent reads
// them and uses them instead of the DHCP name.

import (
	"encoding/json"
	"strings"
	"unicode"
)

const maxNameLength = 63

// Services whose instance name is the device name itself, best first. Other services
// are named after a function or carry an ID, so they are not used.
var nameServices = []string{
	"_companion-link._tcp", // Apple devices
	"_airplay._tcp",
	"_device-info._tcp",
	"_smb._tcp",
	"_sftp-ssh._tcp",
	"_rfb._tcp",
	"_ipp._tcp", // printers
	"_ipps._tcp",
	"_printer._tcp",
	"_raop._tcp", // "<id>@<name>"
}

// mdnsName is what the network says about one IP address
type mdnsName struct {
	Name string
	// Friendly = chosen by the owner. Otherwise it is only derived from the host name
	// ("MacBook-Air-von-Moritz.local") and a real DHCP name is the better choice.
	Friendly bool
}

type mdnsRecord struct {
	Host string `json:"host"`
	IPv4 string `json:"ipv4"`
}

// collectNames returns the announced name per IPv4 address. Without umdns the result is
// empty and the devices keep their DHCP names.
func collectNames(src Sources) map[string]mdnsName {
	names := map[string]mdnsName{}
	// Ask the devices again; the answers arrive later and are there in the next cycle
	src.Run("ubus", "call", "umdns", "update")

	if out, err := src.Run("ubus", "call", "umdns", "hosts"); err == nil {
		var hosts map[string]mdnsRecord
		if json.Unmarshal(out, &hosts) == nil {
			for host, record := range hosts {
				if name := cleanName(strings.ReplaceAll(strings.TrimSuffix(host, ".local"), "-", " ")); name != "" && record.IPv4 != "" {
					names[record.IPv4] = mdnsName{Name: name}
				}
			}
		}
	}

	out, err := src.Run("ubus", "call", "umdns", "browse")
	if err != nil {
		return names
	}
	var services map[string]map[string]mdnsRecord
	if json.Unmarshal(out, &services) != nil {
		return names
	}
	// Worst service first, so the best one is written last and wins
	for i := len(nameServices) - 1; i >= 0; i-- {
		for instance, record := range services[nameServices[i]] {
			if nameServices[i] == "_raop._tcp" {
				_, instance, _ = strings.Cut(instance, "@")
			}
			if name := cleanName(instance); name != "" && record.IPv4 != "" {
				names[record.IPv4] = mdnsName{Name: name, Friendly: true}
			}
		}
	}
	return names
}

// cleanName keeps a name printable and short; it comes from any device on the network
func cleanName(name string) string {
	name = strings.Join(strings.FieldsFunc(name, func(r rune) bool {
		return unicode.IsSpace(r) || unicode.IsControl(r)
	}), " ")
	if runes := []rune(name); len(runes) > maxNameLength {
		name = strings.TrimSpace(string(runes[:maxNameLength]))
	}
	return name
}

// applyNames replaces DHCP names by announced names. known remembers the last name per
// MAC address, because a sleeping phone stops announcing but should keep its name.
func applyNames(leases []lease, names map[string]mdnsName, known map[string]mdnsName) {
	for i := range leases {
		l := &leases[i]
		if found, ok := names[l.IP]; ok {
			if known != nil {
				known[l.MAC] = found
			}
		} else if remembered, ok := known[l.MAC]; ok {
			found = remembered
			names[l.IP] = found
		}
		found, ok := names[l.IP]
		if !ok {
			continue
		}
		noDHCPName := l.Hostname == "" || l.Hostname == "*"
		// "iPhone Moritz" (from the host name) says more than the DHCP name "iPhone"
		moreSpecific := len(found.Name) > len(l.Hostname) &&
			strings.HasPrefix(strings.ToLower(found.Name), strings.ToLower(l.Hostname))
		if found.Friendly || noDHCPName || moreSpecific {
			l.Hostname = found.Name
		}
	}
}
