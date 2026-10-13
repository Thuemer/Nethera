## Context

`mqtt-router-telemetry` delivered the backend side: Mosquitto in Compose, one MQTT consumer for `nethera/#`, shared ingestors, per-stream freshness and `auto` mode with SSH fallback. The interface for this change is fixed by that change:

- `specs/mqtt-telemetry-ingestion/spec.md`: topics, JSON payloads, status semantics
- D2: send cumulative WAN byte counters, the backend computes the rate from Δbytes/Δts
- D5: topic layout, QoS and retained flags
- D6: long-lived connection holding the Last Will `offline`, then retained `online`
- `scripts/mqtt-simulate-router.sh`: reference publisher whose payloads are the fixtures

Target: one Cudy WR3000S (MediaTek MT7981, aarch64) on OpenWrt 25.12.5 with `apk`. Flash and RAM are not a tight constraint (41.6 MB free on `/overlay`), but there is no Java or Python runtime in the default image.

The broker the router has to reach is the one in LeoCloud (`leocloud-deployment`): MQTT over WebSockets on port 443, path `/mqtt`, TLS ending at the platform edge with a Let's Encrypt certificate. A broker on a developer laptop in the router's LAN (`tcp` on 1883, or `ws` on 9001) stays as the development target. Auth and ACL are the same in both: user `router-1`, `write nethera/1/#`, `read nethera/1/status`.

The assumptions about 25.12.5 were checked on the router. The results are under "Probe results" at the end and are the basis for D1, D4 and D6.

## Goals / Non-Goals

**Goals:**
- The real router publishes all four streams and the status topic to the LeoCloud broker over `wss`, and to a LAN broker during development.
- Status stays correct across router power loss, broker restarts and network outages without manual action.
- The data matches what the SSH path collects, so a transport switch does not cause device flapping or count jumps.
- The agent can be checked on the router by hand, and its collectors can be tested on a laptop without a router.

**Non-Goals:**
- Commands from the backend to the router, router self-registration or provisioning UI.
- Better device detection than the SSH path (`ip neigh` states, hostapd ubus). This is a later change, and it must change both transports together.
- An apk package or package feed.
- Supporting more than one router per setup beyond what `router_id` already allows.

## Decisions

### D1 — Go + Paho, one static binary, one connection

```
procd ─▶ /usr/bin/nethera-agent                    (Go, static linux/arm64)
          │
          ├─ one Paho client   wss | ws | tcp, keepalive 30 s
          │    Last Will: retained "offline", QoS 1, on nethera/<id>/status
          │    auto-reconnect with backoff 5 → 60 s
          │    on every connect: publish metadata, then retained "online"
          │
          └─ ticker every $interval (start to start)
               speed   → publish QoS 0         ┐ each publish waits at most
               dns     → publish QoS 1         │ 10 s; a failure is logged
               devices → publish QoS 1         ┘ and the cycle continues
          SIGTERM/SIGINT: publish retained "offline" → disconnect → exit
```

*Why:* the cloud broker is only reachable as `wss`, and the probe showed that the Mosquitto command-line clients in the feed (2.0.22) have no WebSocket transport. Paho for Go supports `tcp`, `ws` and `wss`, the Last Will and automatic reconnect in one library. A static Go build needs nothing installed on the router, which was confirmed with a 5.3 MB test program that connected from the Cudy over `wss` to LeoCloud. One persistent connection also replaces the separate status connection and watcher of the shell design, and fits a later command channel.

*Alternatives:*
- Shell + Mosquitto CLI (the earlier design of this change): cannot speak `wss`. Mosquitto 2.1 clients have `--ws`, but neither the 25.12.5 feed nor the snapshot feed packages them, and building an own package needs the OpenWrt SDK.
- Shell agent plus a small local TCP-to-WebSocket forwarder: keeps the shell collectors, but adds a second program and still opens one connection per publish.
- Python + Paho: `python3-light` and `python3-paho-mqtt` are in the feed and fit in the free space, and the code could be edited on the router. Not chosen because the packages are dropped by `sysupgrade`, the reduced standard library of `python3-light` is unverified for Paho with TLS, and the team had already planned Go.
- Lua (`lua-mosquitto`): built on the same 2.0.22 library, so no WebSockets either.

The price: every change needs a build on a developer machine and a copy to the router. The dry-run mode (D12) and the fixture tests (D3) keep most debugging off the router.

### D2 — Status follows the connection
The Last Will (retained `offline`, QoS 1) is set on the one connection. Paho's on-connect handler runs after the first connect and after every reconnect, and publishes metadata and then retained `online`. That covers a broker restart and an outage longer than the keepalive: the Last Will can only have fired if the connection was lost, and getting it back triggers the handler.

On a graceful stop the agent publishes retained `offline` itself and then disconnects cleanly, so the broker does not send the Last Will a second time.

*Why this is simpler than the shell design:* there, `mosquitto_sub` reconnected on its own but could not republish `online`, so the agent had to subscribe to its own status topic and watch for `offline`. With one client that owns the connection, the reconnect event itself is the trigger. The agent does not subscribe to anything in this change; the ACL line `read nethera/<id>/status` is no longer needed by it but does no harm.

If the first connect fails (broker down, no route, certificate not valid yet), the agent does not exit. It retries with the same backoff. procd's respawn (`respawn 3600 5 0`) is only the outer safety net for a crash; the `0` (unlimited retries) matters, because procd's default gives up after 5 quick crashes.

### D3 — Collectors are plain functions over injectable sources
Each collector is a Go function that gets its inputs through a small `Sources` value: file paths (`/proc/net/dev`, `/tmp/dhcp.leases`, `/proc/net/arp`, the NTP flag file) and one function that runs a command and returns its output (`ubus`, `iw`, `ping`, `logread`). In production these point at the real system. In tests they point at files under `testdata/` and at a fake command runner, so `go test` runs on a laptop with no router and no container. Payloads are structs encoded with `encoding/json`, which escapes hostnames correctly and keeps field names and types in one place.

### D4 — Data sources
| Stream | Source | Fallback / note |
|---|---|---|
| metadata | `ubus call system board` → `model`, `release.description` | — |
| speed | `/proc/net/dev` line of the WAN interface | interface = UCI `wan_iface`, else the `l3_device` of the interface that holds the IPv4 default route in `ubus call network.interface dump` |
| dns | `ubus call dnsmasq metrics` → `dns_queries_forwarded`, `dns_local_answered` | if the method is missing: `SIGUSR1` to dnsmasq, wait 1 s, newest matching line from `logread` |
| devices | ping sweep over lease IPs + `/proc/net/arp`, `/tmp/dhcp.leases`, `iw dev` / `station dump` | same commands and filters as `RouterSyncService` |

*WAN interface:* the earlier design read `network.interface.wan`. On the test router the uplink is the 5 GHz radio in client mode (`phy1-sta0`, logical interface `wwan`) and the `wan` port has no link, so that lookup would report zero traffic. The interface with the default route is what OpenWrt's own `network_find_wan` uses, and it gives `wan` again as soon as a cable is plugged in, or `pppoe-wan` for PPPoE.

*DNS:* the probe confirmed that `ubus call dnsmasq metrics` exists and returns both counters. They are the same numbers dnsmasq prints on SIGUSR1, so the values match the SSH path without a signal and without log parsing (on this router each signal wrote the statistics block twice). `/var/log/messages` does not exist on stock OpenWrt, which is a backend issue tracked in `mqtt-router-telemetry` (task 1.9).

*Devices:* the semantics stay identical to SSH on purpose. Different "reachable" rules on the two transports would produce CONNECTED/DISCONNECTED flaps every time `auto` mode switches transport. `iw` is not part of the default image, so the deploy script installs it; without it the `wifi` list is empty.

### D5 — Schedule
- speed, dns, devices: every `interval` (default 30 s). 30 s halves DISCONNECTED latency compared with the SSH 60 s cycle and leaves 6 missed cycles before the backend's `stale-after = 180s`.
- metadata: after every connect (D2), retained. Model and firmware only change across a reboot or sysupgrade, which restarts the agent, and backend metadata freshness is tied to status, not message age.
- The cycle takes about 3 s (ping sweep 2 s, publishes). The next cycle starts `interval` seconds after the previous one *started*, so drift stays bounded. While the client is not connected, the cycle is skipped.

### D6 — The clock: speed waits for NTP, TLS retries
After boot, OpenWrt sets the clock to the newest file timestamp under `/etc`, and `sysntpd` later jumps it forward.

- *Speed:* the backend tolerates backward jumps, but a forward jump would produce one `SpeedStat` row with a huge Δt and a rate near 0. A hotplug script `/etc/hotplug.d/ntp/50-nethera` creates `/var/run/nethera-ntp-synced` on the first `ACTION=stratum` event, and the agent publishes speed only once that file exists. If the file has not appeared 5 minutes after the agent started (NTP disabled, or the event does not fire on this release), the agent logs one warning and publishes speed anyway.
- *TLS:* certificate validation fails while the clock is before the certificate's start date. No extra gate is needed for that: the connect fails, D2's backoff retries it, and it succeeds once the clock is right. The agent logs the certificate error once per outage, so a wrong clock is visible in `logread`.

DNS and devices don't use `ts` for calculation, so they are not gated.

### D7 — Configuration in UCI, handed over as environment
`/etc/config/nethera`, section `agent` (options in the spec). New compared with the shell design: `transport` (`wss` | `ws` | `tcp`, default `wss`) and `ws_path` (default `/mqtt`); the default port follows the transport (443, 9001, 1883); `tls_ca` overrides the system CA bundle.

The init script reads the section with `config_load`, validates it with `uci_validate_section`, and starts the binary with the settings as `NETHERA_*` environment variables (`procd_set_param env`). It calls `procd_add_reload_trigger nethera`.

*Why environment variables:* the Go program then needs no UCI parser, it runs unchanged on a laptop for tests, and the password is not in the argument list that `ps` shows. *Alternative:* the binary calls `uci get` itself. Rejected because it ties the program to OpenWrt for no gain.

The cloud broker is addressed by its public host name. A laptop broker should be addressed by host name too (for example `<laptop>.lan`, resolved by the router's own dnsmasq from the laptop's DHCP lease), because the laptop's IP changes.

### D8 — Build on a developer machine, install by copying files
```
router/
  agent/                                  Go module
    main.go  config.go  mqtt.go  collect_*.go  *_test.go
    testdata/…                            captured router files (anonymized)
  files/etc/init.d/nethera-agent
  files/etc/config/nethera                (template, enabled=0)
  files/etc/hotplug.d/ntp/50-nethera
  files/lib/upgrade/keep.d/nethera-agent
  README.md
scripts/router-deploy.sh <host>   go test → build linux/arm64 → scp -O binary and files
                                  → apk add iw → keep existing config → enable → restart
```
Build: `GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -ldflags "-s -w"`. `CGO_ENABLED=0` gives a static binary that does not depend on the router's C library. The build output is not committed. `scp` needs `-O`, because Dropbear has no SFTP server.

`keep.d` lists `/usr/bin/nethera-agent`, `/etc/init.d/nethera-agent`, `/etc/hotplug.d/ntp/50-nethera` and the `/etc/rc.d` enable symlinks. Without it, `sysupgrade` keeps `/etc/config/nethera` but deletes the agent. The `iw` package is not kept by sysupgrade, so after an upgrade the deploy script has to be run again; until then devices are published with an empty `wifi` list.

*Alternative:* an apk package built with the OpenWrt SDK. It would handle dependencies and upgrades properly, but the SDK setup and apk v3 signing are too much work for one device. The `router/files` layout can be dropped into an SDK feed later.

### D9 — TLS is required for `wss`
For `transport=wss` the agent verifies the server certificate and host name. Trust comes from the system bundle `/etc/ssl/certs/ca-certificates.crt` (package `ca-bundle`, part of the default image), which Go reads on its own; `tls_ca` replaces it with one PEM file, for a broker with a private CA. There is no option to skip verification.

`ws` and `tcp` are unencrypted and meant for a development broker on the LAN. The agent logs one warning at start when it is not using `wss`.

### D10 — Bounded publishes, no buffering
Every publish waits at most 10 s for its result (`WaitTimeout`), and the client has a connect timeout of 15 s and a write timeout of 10 s. This replaces the `timeout 10` wrapper of the shell design; BusyBox on the router has no `timeout` applet. The client uses a clean session and no persistent store, and the agent does not publish while disconnected, so no backlog builds up. That is safe because speed and DNS are cumulative and devices is a full snapshot.

### D11 — Logging
The agent writes plain lines to standard error. procd forwards them to the system log (`procd_set_param stderr 1`), where `logread -e nethera-agent` shows them. Repeating failures (broker unreachable, missing interface) are logged when they start and when they end, not every cycle.

### D12 — Dry run
`nethera-agent -dry-run` runs every collector once, prints one `<topic> <payload>` line per message and exits, without connecting to a broker. It gives the person at the router the same quick check that reading a shell script used to give, and it is the first thing to run when a router "sends nothing".

## Risks / Trade-offs

- **[A build step for every change]** → `scripts/router-deploy.sh` does test, build, copy and restart in one command. Dry run and fixture tests cover most debugging without the router.
- **[Developers need Go]** → One install (`brew install go`); the Paho version is pinned in `go.mod`.
- **[Binary of about 6 MB per deploy]** → The router has 41.6 MB free; the copy takes about a second on the LAN.
- **[Password readable on the router]** → It is in `/etc/config/nethera` and in the process environment, both root-only. With `wss` it is encrypted in transit. On `ws`/`tcp` it can be sniffed on the LAN, and an attacker could then only fake router 1's telemetry, because of the ACL.
- **[Clock wrong after boot blocks TLS]** → D6: connect retries with backoff until NTP has set the clock; the reason is logged.
- **[Ping sweep every 30 s]** → One ICMP per lease every 30 s, same as the SSH path every 60 s. That's negligible for a home network.
- **[Laptop firewall or IP change blocks a development broker]** → Host name instead of IP. The README covers allowing the port through the macOS firewall.
- **[procd restart loop if config is invalid]** → Validation happens in the init script before `procd_open_instance`, so an invalid config never starts an instance.
- **[sysupgrade drops `iw`]** → Devices are published with an empty `wifi` list, so every device shows as LAN until the deploy script is run again. The agent logs `iw not found` once.
- **[NTP hotplug event unverified on 25.12]** → The 5-minute fallback in D6 keeps speed from staying silent; task 1.2 checks the event.

## Migration Plan

1. Finish the router probe and capture fixtures (task group 1).
2. Build the collectors against the fixtures, then the connection and the main loop (groups 2 to 5).
3. Deploy to the Cudy against the laptop broker (`tcp`), backend in `auto`: streams switch to MQTT one by one, as shown in the backend INFO logs.
4. Point the Cudy at a `wss` broker: first the development broker in a student namespace, then the Nethera broker once `leocloud-deployment` group 4 is applied.
5. Run the failure drills (task group 8).

Rollback: `uci set nethera.agent.enabled=0; uci commit nethera; /etc/init.d/nethera-agent stop`. The backend falls back to SSH per stream after `stale-after` where SSH is configured. No backend changes need to be reverted.

## Open Questions

- Does `/etc/hotplug.d/ntp` fire `ACTION=stratum` on 25.12's `sysntpd`? (task 1.2; fallback in D6)
- Should the binary later be shipped in a Nethera firmware image, so a flashed router reports in on its own?

### Probe results (2026-10-12/13, Cudy WR3000S, OpenWrt 25.12.5)

- **Mosquitto CLI over WebSockets: no.** `mosquitto_pub version 2.0.22 running on libmosquitto 2.0.22`; `--help` lists no WebSocket option. The feed has `mosquitto-client-nossl-2.0.22-r2`, `mosquitto-client-ssl-2.0.22-r2` and `lua-mosquitto-0.4.1-r1`, all on the same library. Mosquitto 2.1.2 clients do have `--ws`, but neither the release feed nor the snapshot feed packages 2.1.
- **Go + Paho on the router over `wss`: works.** A 5.3 MB static `linux/arm64` Paho program connected from the Cudy to a broker behind the LeoCloud ingress, with a retained Last Will registered, validated the certificate with the system CA bundle, and completed a round trip, first anonymously and then as `router-1` with a password.
- **Free space:** 41.6 MB on `/overlay`.
- **CA bundle:** `/etc/ssl/certs/ca-certificates.crt` exists (182 kB). `uclient-fetch` also validates the LeoCloud certificate. `curl` and `openssl` are not installed.
- **`ubus call dnsmasq metrics`: yes.** It returns `dns_queries_forwarded` and `dns_local_answered`. The router runs dnsmasq 2.93.
- **`/var/log/messages`: no.** Only `logd` + `logread`. The SIGUSR1 fallback works: `logread -e 'queries forwarded'` shows `dnsmasq[1]: queries forwarded 1110, queries answered locally 5270`. Each signal wrote the statistics block twice.
- **WAN device: not `wan` on the test setup.** The uplink is `phy1-sta0`; the `wan` port's counters stay at 0. The default-route lookup (`network_find_wan` + `network_get_device`) returned `phy1-sta0` with rising counters. `ubus call network.interface dump` shows the same: `wan` and `wan6` are down with no `l3_device`, and the logical interface `wwan` is up with `l3_device` `phy1-sta0` and the only route to `0.0.0.0/0`.
- **`iw`: not installed by default.** `apk add iw` works.
- **`timeout`: no.** `command -v timeout` prints nothing.
- **NTP hotplug:** the directory `/etc/hotplug.d/ntp` exists. Whether `ACTION=stratum` fires is not observed yet.
- `jsonfilter` is present. `scp` to the router needs `-O`.

A shell prototype built before this design is kept locally in `router/local-draft/shell-prototype/` (not committed). Its dry run produced all four payloads on the router, and the backend ingested metadata and a devices snapshot from it through a laptop broker over `tcp`. It is the reference for which commands and files deliver which values; it is not part of this change.
