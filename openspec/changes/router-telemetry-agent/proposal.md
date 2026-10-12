## Why

The backend side of MQTT telemetry is merged (`mqtt-router-telemetry`), but nothing on the real router publishes yet, so in `auto` mode every stream still falls back to SSH and the Docker stack only shows live data while the simulator runs. This change adds the OpenWrt-side agent on the Cudy WR3000S (OpenWrt 25.12.5) that implements the topic/payload contract, so the router pushes its own telemetry over one outbound connection.

## What Changes

- Add a POSIX shell agent `nethera-agent` for OpenWrt that publishes the four telemetry streams (metadata, speed, dns, devices) and the status topic with `mosquitto_pub`/`mosquitto_sub`, following the contract in `mqtt-telemetry-ingestion` and decisions D2, D5 and D6 of `mqtt-router-telemetry`.
- Keep router status correct across broker restarts and network outages: a supervised status connection holds the Last Will and republishes retained `online` whenever it sees `offline` on its own status topic while it is connected.
- Collect data with the same sources as the SSH path where possible (ping sweep + `/proc/net/arp`, `/tmp/dhcp.leases`, `iw station dump`, `ubus call system board`). DNS counters come from `ubus call dnsmasq metrics`, with SIGUSR1 + `logread` as fallback. The WAN interface is resolved from `network.interface.wan` (`l3_device`).
- Publish speed, DNS and devices every 30 s (configurable). Publish metadata only on start and after a reconnect. Hold back speed until NTP has synced.
- Configure the agent through UCI (`/etc/config/nethera`): router ID, broker host, port, credentials, interval, optional WAN interface and optional TLS CA (not used yet).
- Run it as a procd service. Install it by copying files with `scripts/router-deploy.sh` (no apk package), and keep it across `sysupgrade` through `/lib/upgrade/keep.d`.
- Add fixture-based tests that run the collectors in a BusyBox container against captured router files and check the JSON against the contract.
- Out of scope: TLS on the broker (deferred to the command-channel change; the agent installs the TLS-capable client and has an unused `tls_ca` option), commands from backend to router, router self-registration.

## Capabilities

### New Capabilities
- `router-telemetry-agent`: The OpenWrt agent, covering configuration, service lifecycle, status/Last Will handling, per-stream data collection and payloads, publish schedule, failure behavior when the broker is unreachable, and installation.

### Modified Capabilities
<!-- None in openspec/specs. Backend-side fixes found during exploration (simulator status
     self-healing, SSH DNS source) belong to the still-open change `mqtt-router-telemetry`
     and are captured there (design.md "Follow-ups from agent exploration", tasks 1.9 and 5.4). -->

## Impact

- **New code**: `router/` (rootfs layout: `files/usr/bin/nethera-agent`, `files/etc/init.d/nethera-agent`, `files/etc/config/nethera`, `files/etc/hotplug.d/ntp/…`, `files/lib/upgrade/keep.d/nethera-agent`, `test/`), plus `scripts/router-deploy.sh`.
- **Router**: installs `mosquitto-client-ssl` with `apk` and a procd service. No changes to dnsmasq, network or firewall config.
- **Backend / broker**: no code or config changes in this change. The agent relies on the existing `router-1` user and ACL (`write nethera/1/#`, `read nethera/1/status`).
- **Depends on**: `mqtt-router-telemetry` task 1.8 (SSH baseline on the Cudy) for comparison, and on the router probe (task 1 here) to confirm assumptions about OpenWrt 25.12.5.
- **Docs**: `router/README.md` (German, like the root README) covering install, configuration and troubleshooting, plus a link from the root README.
