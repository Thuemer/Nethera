## Why

The backend side of MQTT telemetry is merged (`mqtt-router-telemetry`), but nothing on the real router publishes yet, so in `auto` mode every stream still falls back to SSH and the stacks only show live data while the simulator runs. This change adds the agent on the Cudy WR3000S (OpenWrt 25.12.5) that implements the topic/payload contract, so the router pushes its own telemetry over one outbound connection. The target broker is the one in LeoCloud, reached over MQTT over WebSockets with TLS (`leocloud-deployment`), which the Mosquitto command-line clients in the OpenWrt feed cannot speak.

## What Changes

- Add the agent `nethera-agent` as a Go program using Eclipse Paho. It is built on a developer machine as one static `linux/arm64` file and copied to the router. It publishes the four telemetry streams (metadata, speed, dns, devices) and the status topic, following the contract in `mqtt-telemetry-ingestion` and decisions D2, D5 and D6 of `mqtt-router-telemetry`.
- Connect with one long-lived MQTT connection. The transport is configurable: `wss` (default, port 443, path `/mqtt`, for LeoCloud), `ws` and `tcp` (unencrypted, for a development broker on the LAN).
- Require TLS for `wss`: the server certificate is checked against the router's system CA bundle, or against `tls_ca` if set.
- Keep router status correct across broker restarts and network outages: the connection holds the Last Will, and the agent publishes metadata and retained `online` after every connect and reconnect.
- Collect data with the same sources as the SSH path where possible (ping sweep + `/proc/net/arp`, `/tmp/dhcp.leases`, `iw station dump`, `ubus call system board`). DNS counters come from `ubus call dnsmasq metrics`, with SIGUSR1 + `logread` as fallback. The WAN interface is the one that holds the default route, because on the test router the uplink is a Wi-Fi client interface and not the `wan` port.
- Publish speed, DNS and devices every 30 s (configurable). Publish metadata only after a connect. Hold back speed until NTP has synced.
- Configure the agent through UCI (`/etc/config/nethera`). The procd init script validates the options and passes them to the program as environment variables, so the password does not appear in the process list.
- Add a dry-run mode that prints the payloads instead of publishing, for checking a router by hand.
- Run it as a procd service. Build and install it with `scripts/router-deploy.sh` (no apk package), and keep it across `sysupgrade` through `/lib/upgrade/keep.d`.
- Add Go unit tests that run the collectors against captured router files and check the JSON against the contract.
- Out of scope: commands from backend to router, router self-registration, the broker and ingress in LeoCloud (`leocloud-deployment`).

## Capabilities

### New Capabilities
- `router-telemetry-agent`: The OpenWrt agent, covering configuration, service lifecycle, broker connection and TLS, status/Last Will handling, per-stream data collection and payloads, publish schedule, failure behavior when the broker is unreachable, dry run, and installation.

### Modified Capabilities
<!-- None in openspec/specs. Backend-side fixes found during exploration (simulator status
     self-healing, SSH DNS source) belong to the still-open change `mqtt-router-telemetry`
     and are captured there (design.md "Follow-ups from agent exploration", tasks 1.9 and 5.4). -->

## Impact

- **New code**: `router/agent/` (Go module with collectors, tests and `testdata/`), `router/files/` (rootfs layout: `etc/init.d/nethera-agent`, `etc/config/nethera`, `etc/hotplug.d/ntp/50-nethera`, `lib/upgrade/keep.d/nethera-agent`), plus `scripts/router-deploy.sh`.
- **Developer machine**: needs Go (1.27 is used) to build the agent. The build output is not committed.
- **Dependencies**: `github.com/eclipse/paho.mqtt.golang` and its WebSocket dependency `github.com/gorilla/websocket`, pinned in `go.mod`.
- **Router**: one binary of about 6 MB in `/usr/bin`, a procd service, and the package `iw`. No MQTT client package is needed any more. No changes to dnsmasq, network or firewall config.
- **Backend / broker**: no code or config changes in this change. The agent relies on the existing `router-1` user and ACL.
- **Depends on**: `leocloud-deployment` for the cloud broker and its `/mqtt` path; until that is applied, the agent is developed against a laptop broker and a development broker in a student namespace. Also `mqtt-router-telemetry` task 1.8 (SSH baseline on the Cudy) for comparison.
- **Docs**: `router/README.md` (German, like the root README) covering build, install, configuration and troubleshooting, plus a link from the root README.
