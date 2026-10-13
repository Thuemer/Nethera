## 1. Router probe (before any agent code)

- [x] 1.1 Run a read-only probe on the Cudy over SSH and record the results in design.md ("Probe results"): board info, log setup, dnsmasq ubus metrics, WAN device, `iw`, `jsonfilter`, `timeout`, hotplug directories, Mosquitto packages, CA bundle, free space
- [ ] 1.2 Check whether `/etc/hotplug.d/ntp` receives `ACTION=stratum` on this release (drop a test script there, restart `sysntpd`, check `logread`) and add the result to design.md
- [x] 1.3 Capture fixtures into `router/agent/testdata/`: `/proc/net/dev`, `/proc/net/arp`, `/tmp/dhcp.leases`, and the output of `ubus call system board`, `ubus call dnsmasq metrics`, `ubus call network.interface dump`, `iw dev`, one `iw dev <if> station dump`, and one `logread` excerpt with a dnsmasq stats line. Anonymize MACs, hostnames and public IPs
- [x] 1.4 Prove the toolchain: build a small Paho program as static `linux/arm64`, run it on the Cudy, and complete a round trip over `wss` to a broker behind the LeoCloud ingress with certificate validation and a login
- [ ] 1.5 Do `mqtt-router-telemetry` tasks 1.8 and 1.9 (SSH baseline + SSH DNS source) with the backend in `quarkus:dev`, `nethera.telemetry.mode=ssh`, scheduler enabled; note the observed SpeedStat/DnsStat/device values as a reference (backend owner)

## 2. Module skeleton and configuration

- [ ] 2.1 Create the Go module in `router/agent/` (`go mod init`, pin `github.com/eclipse/paho.mqtt.golang`), add the build output and `router/build/` to `.gitignore`
- [ ] 2.2 Write `config.go`: read the `NETHERA_*` environment variables into a config struct, apply the defaults (transport `wss`, port by transport, `ws_path` `/mqtt`, username `router-<id>`, interval 30 with minimum 10), reject missing `router_id`/`broker`/`password` and an unknown transport with a message naming the problem; unit-test the defaults and each rejection
- [ ] 2.3 Write `main.go`: flags `-dry-run` and `-version`, logging to standard error with the prefix `nethera-agent`, load the config, exit non-zero with the config error
- [ ] 2.4 Create `router/files/etc/config/nethera` (template with `enabled=0` and all options from the spec as comments or defaults)
- [ ] 2.5 Write `router/files/etc/init.d/nethera-agent` (procd, `USE_PROCD=1`, `START=99`): validate with `uci_validate_section`, refuse to start and log the missing option, pass the options as `NETHERA_*` with `procd_set_param env`, `procd_set_param stderr 1`, `procd_set_param respawn 3600 5 0`, `procd_add_reload_trigger nethera`

## 3. Connection and status

- [ ] 3.1 Write `mqtt.go`: build the broker URL from transport, host, port and `ws_path`; Paho options with client ID `nethera-router-<id>`, keepalive 30 s, connect timeout 15 s, write timeout 10 s, clean session, auto-reconnect and connect-retry with an interval growing from 5 s to 60 s
- [ ] 3.2 TLS for `wss`: system CA pool by default, `tls_ca` PEM file as replacement, host name verification on; log one warning when the transport is `ws` or `tcp`
- [ ] 3.3 Last Will: retained `offline`, QoS 1, on `nethera/<id>/status`; on-connect handler publishes metadata (group 4) and then retained `online`; connection-lost handler logs the reason once
- [ ] 3.4 Graceful stop on SIGTERM/SIGINT: publish retained `offline`, disconnect, exit 0
- [ ] 3.5 Publish helper with `WaitTimeout(10 s)` that returns an error on timeout or failure, and skips publishing while the client is not connected

## 4. Collectors

- [ ] 4.1 Write the `Sources` type (file paths, command runner, clock) with the real implementation and a test implementation that reads `testdata/` and returns canned command output
- [ ] 4.2 Payload structs for metadata, speed, dns and devices with JSON tags matching the contract; a helper that encodes them with `encoding/json`
- [ ] 4.3 Metadata collector from `ubus call system board`; test with the fixture (model `Cudy WR3000S v1`)
- [ ] 4.4 WAN interface resolution: `wan_iface` if set, else the `l3_device` of the interface with the IPv4 default route in `ubus call network.interface dump`; test with the fixture where the uplink is `phy1-sta0`, and with one where it is `wan`
- [ ] 4.5 Speed collector from `/proc/net/dev`; test: counters of the resolved interface, missing interface gives an error
- [ ] 4.6 NTP gate: `router/files/etc/hotplug.d/ntp/50-nethera` creates `/var/run/nethera-ntp-synced` on `ACTION=stratum`; the agent publishes speed only when the flag exists or 5 minutes have passed since start, and logs one warning in the second case; test both branches with a fake clock
- [ ] 4.7 DNS collector: `ubus call dnsmasq metrics`, fallback SIGUSR1 + newest stats line from `logread`; test: ubus path, fallback path, no data
- [ ] 4.8 Devices collector: parallel ping sweep over lease IPs + 2 s wait, `/proc/net/arp` filter (flags ≠ `0x0`, MAC ≠ zeros), `/tmp/dhcp.leases`, `iw` station dump over all wireless interfaces; lowercase MACs; empty lists as `[]`; test: normal case, hostname with `"` and `\`, empty leases file, no `iw`

## 5. Main loop and dry run

- [ ] 5.1 Main loop with a ticker (start-to-start interval): skip the cycle while disconnected; run speed, dns and devices; one failing collector or publish must not skip the others; log a repeating failure when it starts and when it ends
- [ ] 5.2 Dry run: run every collector once, print `<topic> <payload>` lines, connect to nothing, exit 0; works with only `NETHERA_ROUTER_ID` set
- [ ] 5.3 Contract test: for each stream, check field names and JSON types against what `TelemetryPayloadParser` requires, and compare the shape with the payloads in `scripts/mqtt-simulate-router.sh`

## 6. Local end-to-end tests (developer machine)

- [ ] 6.1 Run the agent on the developer machine with the test sources against the Compose Mosquitto over `tcp` (`router-1` credentials); check with `mosquitto_sub` as `nethera-backend` that all topics arrive with the right retained flags and that the backend writes rows
- [ ] 6.2 Run it against a `wss` broker (the development broker in a student namespace): login, round trip of all streams, wrong password is logged and retried without exit
- [ ] 6.3 Stop and start the broker while the agent runs: one "connection lost" line, reconnect with backoff, metadata and `online` republished, no backlog

## 7. Deploy to the router

- [ ] 7.1 Write `router/files/lib/upgrade/keep.d/nethera-agent` (binary, init script, hotplug script, rc.d symlinks)
- [ ] 7.2 Write `scripts/router-deploy.sh <host>`: `go test`, build static `linux/arm64`, `scp -O` binary and files, `apk add iw`, keep an existing `/etc/config/nethera`, `enable` + `restart`, print the next steps on first install; stop before copying if the tests fail
- [ ] 7.3 Deploy to the Cudy; run `nethera-agent -dry-run` on the router and compare the four payloads with the router's real state
- [ ] 7.4 Configure `transport=tcp` and the laptop broker, `enabled=1`; check the macOS firewall allows the port; all streams arrive and the dashboard shows the real router
- [ ] 7.5 Configure `transport=wss` and the development broker in LeoCloud; all streams arrive over `wss`

## 8. End-to-end verification

- [ ] 8.1 With the backend in `auto`: confirm one INFO "transport switched" line per stream and that SpeedStat/DnsStat/devices values are plausible compared with the 1.5 baseline
- [ ] 8.2 Partial failure: remove `iw` on the router → devices still published with empty `wifi`; make the DNS source unavailable → only DNS falls back to SSH after `stale-after`
- [ ] 8.3 Power loss: unplug the router (or `kill -9` the agent) → `offline` within about 45 s, `isOnline=false`; on return → metadata and `online` again
- [ ] 8.4 Broker restart for longer than 45 s → the agent reconnects and republishes `online` without being restarted
- [ ] 8.5 Graceful stop: `/etc/init.d/nethera-agent stop` → retained `offline` stays
- [ ] 8.6 Reboot: the agent connects once the clock is set (no manual action after a certificate error), speed starts only after NTP sync, and there is no SpeedStat row with an implausible rate after the clock jump
- [ ] 8.7 Wrong clock: set the router's date back by a year, restart the agent → certificate error logged, retries, connects after the clock is corrected
- [ ] 8.8 After `leocloud-deployment` group 4 is applied: point the Cudy at `wss://it220208.cloud.htl-leonding.ac.at/mqtt` and repeat 8.3 there (`leocloud-deployment` task 5.5)

## 9. Documentation

- [ ] 9.1 Write `router/README.md` (German): requirements (Go on the developer machine), build and deploy, UCI options, the three transports, logs (`logread -e nethera-agent`), dry run, troubleshooting (broker unreachable, wrong password, certificate/clock, firewall, sysupgrade reinstall of `iw`)
- [ ] 9.2 Link the agent from the root `README.md` telemetry section and mark the open question "who owns the agent change" in `mqtt-router-telemetry/design.md` as resolved
