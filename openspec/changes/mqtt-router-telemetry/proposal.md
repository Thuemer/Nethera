## Why

The backend currently pulls all router telemetry by opening four root SSH sessions to the router every 60 seconds. This only works when the backend can reach the router directly. It also depends on a private key path that exists on a single developer machine, so router sync is disabled in the Docker Compose stack and the dashboard shows only seed data. Moving telemetry to MQTT reverses the direction: the router pushes data to a broker over an outbound connection. That removes the need for inbound SSH access, works behind NAT, and lets the Docker stack show live data. This is the "MQTT statt SSH" item from the sprint outlook.

## What Changes

- Add an Eclipse Mosquitto broker service to `compose.yaml` with password authentication and a per-router topic ACL.
- Add `quarkus-messaging-mqtt` to the backend and implement consumers for four telemetry streams per router: metadata, speed (WAN byte counters), DNS (dnsmasq counters) and devices (DHCP leases, reachable MACs, Wi-Fi MACs). Add a status topic that uses MQTT Last Will for online/offline.
- Extract the persistence and diffing logic (speed calculation, DNS deltas, device upsert, activity-log emission) out of the SSH services into shared ingestion components. SSH and MQTT then produce identical database results.
- Add a transport mode setting `nethera.telemetry.mode` = `ssh` | `mqtt` | `auto`. In `auto` (the new default), the scheduler skips the SSH sync for any telemetry stream that received an MQTT message recently. **SSH stays as the fallback** for routers without the agent or when the agent stops publishing.
- Add a host-side router simulator script that publishes valid telemetry, so the backend can be built, tested and demoed without a physical router.
- Scope: **backend only**. The OpenWrt agent that publishes telemetry from the real router is a separate change (`router-telemetry-agent`) for whoever owns the router side. The topic and payload contract in `mqtt-telemetry-ingestion` is the interface between the two changes.
- Scope: **telemetry only**. Nothing is sent from the backend to the router. Configuration commands (block lists, time limits, QoS) are out of scope.

## Capabilities

### New Capabilities
- `mqtt-broker`: Mosquitto service in the Compose stack, credentials for backend and router, topic ACL that limits each router to its own namespace.
- `mqtt-telemetry-ingestion`: Topic layout and JSON payload contract (the interface the router agent must implement), backend consumers, payload validation, router status via Last Will, per-stream freshness tracking, and a development simulator.

### Modified Capabilities
- `router-sync-scheduler`: The scheduler respects `nethera.telemetry.mode` and skips SSH sync for streams with fresh MQTT telemetry.
- `router-speed-sync`: Adds speed calculation from pushed cumulative WAN counters (Δbytes / Δt), alongside the existing SSH two-sample measurement.
- `router-dns-sync`: DNS delta and reset rules also apply to counters received over MQTT. The baseline is shared across transports and kept per router.
- `router-metadata-sync`: Router metadata and online state can come from MQTT (metadata topic + Last Will on the status topic).
- `router-activity-log`: CONNECTED/DISCONNECTED events are emitted by the shared device ingestion, whichever transport delivered the snapshot.

## Impact

- **Backend code**: `RouterSyncService`, `RouterMetricsSyncService` and `RouterSyncScheduler` are refactored. New packages `at.htlleonding.telemetry` (ingestors, freshness tracker) and `at.htlleonding.mqtt` (consumers, payload DTOs).
- **Dependencies**: `io.quarkus:quarkus-messaging-mqtt` is added. `sshj` stays.
- **Config**: new `mp.messaging.incoming.*` channels, `nethera.telemetry.mode`, `nethera.mqtt.stale-after`, broker host and credentials.
- **Infrastructure**: new `mosquitto` service plus `docker/mosquitto/` (config, ACL, password file). Port 1883 must be reachable from the router's LAN, not only from localhost.
- **Router**: not touched by this change. Until the separate agent change ships, `auto` mode behaves exactly like today (all streams stale → SSH).
- **No REST API or frontend changes**: the dashboard keeps reading the same tables.
