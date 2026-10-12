## Context

`mqtt-router-telemetry` delivered the backend side: Mosquitto in Compose, one MQTT consumer for `nethera/#`, shared ingestors, per-stream freshness and `auto` mode with SSH fallback. The interface for this change is fixed by that change:

- `specs/mqtt-telemetry-ingestion/spec.md`: topics, JSON payloads, status semantics
- D2: send cumulative WAN byte counters, the backend computes the rate from Δbytes/Δts
- D5: topic layout, QoS and retained flags
- D6: long-lived connection holding the Last Will `offline`, then retained `online`
- `scripts/mqtt-simulate-router.sh`: reference publisher whose payloads are the fixtures

Target: one Cudy WR3000S (MediaTek MT7981, aarch64) on OpenWrt 25.12.5 with `apk`. Flash and RAM are not a tight constraint, but there is no Java runtime. The broker runs on a developer laptop on the router's LAN (`1883`, password auth, ACL `router-1` → `write nethera/1/#`, `read nethera/1/status`, no TLS).

Several facts about 25.12.5 are **not verified yet** because the router was not reachable during exploration. Task group 1 checks them before any agent code is written. Each assumption has a fallback (see D4 and Open Questions).

## Goals / Non-Goals

**Goals:**
- The real router publishes all four streams and the status topic, so in `auto` mode the backend stops using SSH per stream.
- Status stays correct across router power loss, broker restarts and LAN outages without manual action.
- The data matches what the SSH path collects, so a transport switch does not cause device flapping or count jumps.
- The agent can be debugged on the router with standard tools, and its collectors can be tested on a laptop.

**Non-Goals:**
- TLS, commands from the backend to the router, router self-registration or provisioning UI.
- Better device detection than the SSH path (`ip neigh` states, hostapd ubus). This is a later change, and it must change both transports together.
- An apk package or package feed.
- Supporting more than one router per laptop setup beyond what UCI `router_id` already allows.

## Decisions

### D1 — POSIX shell + `mosquitto-client`, not Lua or Go

```
procd ─▶ /usr/bin/nethera-agent                     (ash)
          │
          ├─ status keeper  (child, restarted with backoff 5→60 s)
          │    mosquitto_sub -t S --will-topic S --will-payload offline
          │                  --will-retain --will-qos 1 -k 30
          │      │ (own status topic)
          │      └─▶ while read msg: offline → pub metadata; pub -r online
          │
          └─ main loop every $interval
               collect_speed   → pub -q 0         ┐ each pub wrapped in
               collect_dns     → pub -q 1         │ `timeout 10`, failure =
               collect_devices → pub -q 1         ┘ log + continue
          trap TERM/INT: kill keeper → pub -r offline → exit
```

*Why:* the backend contract makes buffering unnecessary. Speed and DNS are cumulative and devices is a full snapshot, so a lost message is covered by the next one. That removes the main advantage of a single persistent client with an outbox. The remaining weakness of separate short-lived publishes is that `online` must be republished after the Last Will fires, and the watcher loop handles that. Shell keeps parity with the commands the SSH services already run (D9 of the backend change), can be edited and traced (`sh -x`) on the router, and needs only one extra package.

*Alternatives:* Lua with `lua-mosquitto` + `libubus-lua` gives one connection with an `on_connect` callback and native ubus calls, but it's a new language for the team and the packages are unverified in the 25.12 feed. A Go binary (paho) has the best reconnect semantics and unit tests, but needs a cross-compile toolchain, rebuild-to-debug and about 7 MB per deploy. Reconsider Go when the command channel needs real subscribe/ack handling.

### D2 — Status self-healing through the agent's own status subscription
The status connection subscribes to `nethera/<id>/status`, the topic it holds the Last Will on. After a reconnect it receives the retained value. If that value is `offline`, the Last Will has fired (broker restart, outage longer than 45 s) while the agent kept running, so the agent publishes retained `online` again, together with metadata. The agent also receives its own `online`, and ignores it.

*Why:* `mosquitto_sub` reconnects on its own after a lost connection and registers the Last Will again, but it never republishes `online`. Without D2, the backend would show the router offline until the agent restarts. Metadata freshness depends on status (backend D7), so that would also force SSH metadata fallback. *Alternative:* republish `online` every cycle. Simpler, but each publish refreshes `lastSeen` on the backend, and it hides a broken status connection.

Graceful-stop order matters: kill the keeper **before** publishing `offline`. Otherwise the watcher sees `offline` and republishes `online`.

Initial connect failure: `mosquitto_sub` exits when the first connect fails. The agent restarts it with backoff. procd's own respawn (`respawn 3600 5 0`) is only the outer safety net for the agent process itself. The `0` (unlimited retries) matters, because procd's default gives up after 5 quick crashes.

### D3 — Collector functions are pure over overridable paths
Each collector is a shell function that reads from variables such as `PROC_NET_DEV=/proc/net/dev`, `DHCP_LEASES=/tmp/dhcp.leases`, `PROC_NET_ARP=/proc/net/arp`, and from wrapper functions for `ubus` and `iw`. Tests override these with fixture files and stub functions, source the script without starting the main loop (`NETHERA_AGENT_LIB=1`), and run inside `busybox` (`docker run busybox`/`alpine`) so ash and BusyBox `awk` behave as on the router. JSON is built with `jshn` (`json_init`/`json_add_*`/`json_dump`) on the router. That avoids hand-escaping hostnames, and `jshn` is part of base OpenWrt. *Alternative:* `printf` JSON with a custom escaper. Lighter in tests, but hostname escaping is easy to get wrong. If `jshn` is awkward to run in the test container, tests use the OpenWrt `rootfs` Docker image (`openwrt/rootfs:aarch64_cortex-a53-25.12.5` or x86_64) instead of plain BusyBox.

### D4 — Data sources
| Stream | Source | Fallback / note |
|---|---|---|
| metadata | `ubus call system board` → `model`, `release.description` | — |
| speed | `/proc/net/dev` line of WAN iface | iface = UCI `wan_iface`, else `ubus call network.interface.wan status` → `l3_device` (DSA `wan`, or `pppoe-wan` for PPPoE) |
| dns | `ubus call dnsmasq metrics` → `dns_queries_forwarded`, `dns_local_answered` | if the method is missing: `kill -USR1 $(pidof dnsmasq)`, sleep 1, newest matching line from `logread` |
| devices | ping sweep over lease IPs + `/proc/net/arp`, `/tmp/dhcp.leases`, `iw dev`/`station dump` | same commands and filters as `RouterSyncService` |

*DNS:* dnsmasq ≥ 2.81 prints exactly `metrics[METRIC_DNS_QUERIES_FORWARDED]` and `metrics[METRIC_DNS_LOCAL_ANSWERED]` in its SIGUSR1 log line, and OpenWrt exposes the same array through ubus. So the values match the SSH path while avoiding a signal (which also dumps the whole cache into syslog) and log parsing. The SSH path's `/var/log/messages` does not exist on stock OpenWrt (only `logd` + `logread`) unless `system.log_file` is set. That is a backend issue, tracked in `mqtt-router-telemetry` (task 1.9).

*Devices:* the semantics stay identical to SSH on purpose. Different "reachable" rules on the two transports would produce CONNECTED/DISCONNECTED flaps every time `auto` mode switches transport.

### D5 — Schedule
- speed, dns, devices: every `interval` (default 30 s). 30 s halves DISCONNECTED latency compared with the SSH 60 s cycle and leaves 6 missed cycles before the backend's `stale-after = 180s`.
- metadata: on start and on every `online` republish (D2), retained. Model and firmware only change across a reboot or sysupgrade, which restarts the agent, and backend metadata freshness is tied to status, not message age.
- The cycle takes about 3 s (ping sweep 2 s, publishes). The next cycle starts `interval` seconds after the previous one *started*, so drift stays bounded.

### D6 — Speed waits for NTP
After boot, OpenWrt sets the clock to the newest file timestamp under `/etc`, and `sysntpd` later jumps it forward. The backend tolerates backward jumps, but a forward jump would produce one `SpeedStat` row with a huge Δt and a rate near 0. A hotplug script `/etc/hotplug.d/ntp/50-nethera` creates `/var/run/nethera-ntp-synced` on the first `ACTION=stratum` event. The agent publishes speed only once that file exists. DNS and devices don't use `ts` for calculation, so they are not gated. If NTP is disabled in UCI, the agent logs one warning and publishes speed anyway after 5 minutes, so it can't stay silent forever.

### D7 — Configuration in UCI
`/etc/config/nethera`, section `agent` (options in the spec). The init script reads it with `config_load`, validates it with `uci_validate_section`, and calls `procd_add_reload_trigger nethera`. The broker is addressed by host name (for example `<laptop>.lan`, resolved by the router's own dnsmasq from the laptop's DHCP lease), because the laptop's IP changes. The password is passed to `mosquitto_pub`/`mosquitto_sub` through a generated client config file in `/var/run/nethera-agent/` (mode 600), not on the command line, so it doesn't show up in `ps`.

*Alternative:* environment file under `/etc/nethera-agent.env`. Rejected because UCI is the OpenWrt convention, survives sysupgrade as a conffile, and can later be edited from LuCI or by a backend command.

### D8 — Install by copying files
```
router/
  files/usr/bin/nethera-agent
  files/etc/init.d/nethera-agent
  files/etc/config/nethera                  (template, enabled=0)
  files/etc/hotplug.d/ntp/50-nethera
  files/lib/upgrade/keep.d/nethera-agent
  test/fixtures/…   test/run.sh
  README.md
scripts/router-deploy.sh <host>   scp files → apk add mosquitto-client-ssl
                                  → keep existing config → enable → restart
```
`keep.d` lists `/usr/bin/nethera-agent`, `/etc/init.d/nethera-agent`, `/etc/hotplug.d/ntp/50-nethera` and the `/etc/rc.d` enable symlink. Without it, `sysupgrade` keeps `/etc/config/nethera` but deletes the agent. The `apk` package is not kept by sysupgrade, so after an upgrade the deploy script has to be run again. Its output says so.

*Alternative:* an apk package built with the OpenWrt SDK. It would handle dependencies and upgrades properly, but the SDK setup and apk v3 signing are too much work for one device. The `router/files` layout can be dropped into an SDK feed later.

### D9 — TLS deferred, client prepared
Install `mosquitto-client-ssl` (same CLI as `-nossl`, adds `--cafile`). The `tls_ca` UCI option exists but is ignored. Turning TLS on later then changes the broker config, plus one `--cafile`/`-p 8883` branch in the agent. The command-channel change must not ship without TLS (see `mqtt-router-telemetry` Risks).

## Risks / Trade-offs

- **[Assumptions about 25.12.5 unverified]** → Task group 1 probes the router before any agent code. Every assumption in D4 has a fallback, and the tasks name what changes if a fallback is needed.
- **[Separate TCP connect per publish]** → About 3 connects per 30 s on the LAN, which is negligible. The cost is that QoS 1 is only "at least once" per short connection, and there is no outbox. That's acceptable because of the cumulative contract.
- **[Password readable on the router and sniffable on the LAN]** → The router is root-only. On the LAN, an attacker who sniffs the password can only fake router 1's telemetry, because of the ACL. TLS comes with the command channel.
- **[Ping sweep every 30 s]** → One ICMP per lease every 30 s, same as the SSH path every 60 s. That's negligible for a home network.
- **[`jshn` not available in the test container]** → Use the OpenWrt rootfs Docker image for tests (D3).
- **[Laptop firewall or IP change blocks the broker]** → Host name instead of IP. The README covers allowing 1883 through the macOS firewall.
- **[procd restart loop if config is invalid]** → Validation happens in the init script before `procd_open_instance`, so an invalid config never starts an instance.
- **[sysupgrade drops the MQTT client package]** → The agent logs `mosquitto_pub not found` once per minute, and the backend falls back to SSH in `auto` mode. The deploy script reinstalls it.

## Migration Plan

1. Probe the router (task group 1) and record the results in this design.
2. Finish `mqtt-router-telemetry` task 1.8 (SSH-only baseline on the Cudy) and 1.9 (SSH DNS source), so there is a known-good SSH reference.
3. Build and test the collectors against fixtures captured in step 1.
4. Deploy the agent with `enabled=1`, backend in `auto`: streams switch to MQTT one by one, as shown in the backend INFO logs.
5. Run the failure drills (task group 6).

Rollback: `uci set nethera.agent.enabled=0; uci commit nethera; /etc/init.d/nethera-agent stop`. The backend falls back to SSH per stream after `stale-after`. No backend changes need to be reverted.

## Open Questions

To be answered by the probe (task 1.1), with the fallback if the answer is "no":
- Does `ubus call dnsmasq metrics` exist on 25.12.5, and does it contain `dns_queries_forwarded` / `dns_local_answered`? → otherwise SIGUSR1 + `logread`
- Is `/var/log/messages` present (is `system.log_file` set)? → decides how task 1.9 of the backend change fixes the SSH path
- WAN `l3_device` on the Cudy (`wan` expected) → `wan_iface` override
- Is `iw` installed by default? → otherwise `apk add iw` in the deploy script
- Package names in the 25.12 feed: `mosquitto-client-ssl` / `-nossl`? → adjust the deploy script
- Does `/etc/hotplug.d/ntp` fire `ACTION=stratum` on 25.12's `sysntpd`? → otherwise poll `ubus call system info`/`ntpd` state
- Does `timeout` exist in BusyBox on the image? → otherwise a background-kill wrapper
