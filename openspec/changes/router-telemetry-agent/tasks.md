## 1. Router probe (before any agent code)

- [ ] 1.1 Run a read-only probe on the Cudy over SSH and record the results under "Open Questions" in design.md: `ubus call system board`, `ls /var/log`, `uci -q get system.@system[0].log_file`, `logread | tail`, `ubus list | grep dnsmasq`, `ubus call dnsmasq metrics`, `dnsmasq --version`, `ubus call network.interface.wan status` (`l3_device`), WAN line in `/proc/net/dev`, `command -v iw jsonfilter timeout`, `iw dev`, `ls /etc/hotplug.d`, `apk search mosquitto`, `uname -m`
- [ ] 1.2 Capture fixtures into `router/test/fixtures/`: `/proc/net/dev`, `/proc/net/arp`, `/tmp/dhcp.leases`, `ubus call system board`, `ubus call dnsmasq metrics`, `ubus call network.interface.wan status`, `iw dev` and one `station dump`, and one `logread` excerpt with a dnsmasq stats line. Anonymize MACs, hostnames and the public IP
- [ ] 1.3 Update D4/D6 in design.md and the specs if a fallback is needed (no ubus metrics, no NTP hotplug, other package names)
- [ ] 1.4 Do `mqtt-router-telemetry` tasks 1.8 and 1.9 (SSH baseline + SSH DNS source) with the backend in `quarkus:dev`, `nethera.telemetry.mode=ssh`, scheduler enabled; note the observed SpeedStat/DnsStat/device values as a reference

## 2. Agent skeleton and configuration

- [ ] 2.1 Create the `router/files/` layout and `router/files/etc/config/nethera` template (`enabled=0`, all options from the spec)
- [ ] 2.2 Write `router/files/etc/init.d/nethera-agent` (procd, `USE_PROCD=1`, `START=99`): validate config with `uci_validate_section`, refuse to start and log the missing option, `procd_set_param respawn 3600 5 0`, `procd_add_reload_trigger nethera`
- [ ] 2.3 Write the `nethera-agent` script structure: config loading, topic prefix, syslog logging via `logger -t nethera-agent`, library mode (`NETHERA_AGENT_LIB=1` = define functions only), main loop with start-to-start interval
- [ ] 2.4 Generate the mosquitto client config file with credentials in `/var/run/nethera-agent/` (mode 600) and use it for every `mosquitto_pub`/`mosquitto_sub` call; wrap every publish in `timeout 10`

## 3. Status connection

- [ ] 3.1 Implement the status keeper: `mosquitto_sub` with retained QoS 1 Last Will `offline`, keepalive 30, subscribed to its own status topic, piped into a watcher that publishes metadata + retained `online` when it reads `offline`
- [ ] 3.2 Supervise the keeper with 5 s → 60 s backoff, including the case where the first connect fails
- [ ] 3.3 Publish metadata + retained `online` after start; implement graceful stop (trap TERM/INT: kill keeper, publish retained `offline`, exit)

## 4. Collectors

- [ ] 4.1 Metadata collector from `ubus call system board` (`jsonfilter`/`jshn`), payload via `jshn`
- [ ] 4.2 WAN interface resolution (UCI `wan_iface`, else `l3_device`) and speed collector from `/proc/net/dev`; skip with a warning if the interface is missing
- [ ] 4.3 NTP gate: `router/files/etc/hotplug.d/ntp/50-nethera` creates `/var/run/nethera-ntp-synced` on `ACTION=stratum`; speed publishes only when the flag exists, with a 5-minute fallback and one warning if NTP is disabled
- [ ] 4.4 DNS collector: `ubus call dnsmasq metrics`, fallback SIGUSR1 + newest stats line from `logread`
- [ ] 4.5 Devices collector: parallel ping sweep over lease IPs + 2 s wait, `/proc/net/arp` filter (flags ≠ `0x0`, MAC ≠ zeros), `/tmp/dhcp.leases`, `iw` station dump over all wireless interfaces; lowercase MACs; JSON via `jshn`
- [ ] 4.6 Wire the collectors into the main loop with QoS/retain flags per D5 of the backend change; one failing collector must not skip the others

## 5. Off-router tests

- [ ] 5.1 Write `router/test/run.sh`: runs the agent in library mode inside the OpenWrt rootfs Docker image (or BusyBox if `jshn` works there), with fixture paths and stubbed `ubus`/`iw`/`ping`
- [ ] 5.2 Assert each payload is valid JSON with the field names and types `TelemetryPayloadParser` requires; compare the shape with `scripts/mqtt-simulate-router.sh` payloads
- [ ] 5.3 Cover edge cases: hostname with `"` and `\`, empty leases file, no `iw`, missing WAN interface, ubus metrics missing → logread fallback, logread without a stats line
- [ ] 5.4 Publish test: run the agent in library mode against the Compose Mosquitto (`router-1` credentials) and check with `mosquitto_sub` as `nethera-backend` that all topics arrive with the right retained flags

## 6. Deploy and end-to-end verification

- [ ] 6.1 Write `router/files/lib/upgrade/keep.d/nethera-agent` (agent, init script, hotplug script, rc.d symlink)
- [ ] 6.2 Write `scripts/router-deploy.sh <host>`: scp files, `apk add mosquitto-client-ssl` (and `iw` if 1.1 found it missing), keep an existing `/etc/config/nethera`, `enable` + `restart`, print the next steps on first install
- [ ] 6.3 Deploy to the Cudy, set `router_id=1`, broker host name and password, `enabled=1`; check the macOS firewall allows inbound 1883
- [ ] 6.4 With the backend in `auto`: confirm one INFO "transport switched" line per stream and that SpeedStat/DnsStat/devices values are plausible compared with the 1.4 baseline
- [ ] 6.5 Partial failure: make `iw` unavailable on the router → devices still published with empty `wifi`; stop the agent's DNS source → only DNS falls back to SSH after `stale-after`
- [ ] 6.6 Power loss: unplug the router (or `kill -9` the agent and keeper) → `offline` within about 45 s, `isOnline=false`; on return → `online` and metadata again
- [ ] 6.7 Broker restart: `docker compose restart mosquitto` for longer than 45 s → the keeper sees the retained `offline` and republishes `online` without restarting the agent
- [ ] 6.8 Graceful stop: `/etc/init.d/nethera-agent stop` → retained `offline` stays (no `online` republished afterwards)
- [ ] 6.9 Reboot: speed starts only after NTP sync; no SpeedStat row with an implausible rate after the clock jump

## 7. Documentation

- [ ] 7.1 Write `router/README.md` (German): requirements, deploy, UCI options, logs (`logread -e nethera-agent`), troubleshooting (broker unreachable, firewall, sysupgrade reinstall)
- [ ] 7.2 Link the agent from the root `README.md` telemetry section and mark the open question "who owns the agent change" in `mqtt-router-telemetry/design.md` as resolved
