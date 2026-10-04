## Context

Today all router data reaches the backend by pulling over SSH:

```
RouterSyncScheduler (@Scheduled every nethera.sync.interval = 60s, router ID 1 hard-coded)
 ├─ RouterMetricsSyncService.syncRouterMetadata  → SSH: ubus call system board
 ├─ RouterMetricsSyncService.syncSpeed           → SSH: /proc/net/dev, sleep 2, /proc/net/dev
 ├─ RouterMetricsSyncService.syncDnsStats        → SSH: kill -USR1 dnsmasq; tail /var/log/messages
 └─ RouterSyncService.syncDhcpLeases             → SSH: ping sweep + /proc/net/arp, dhcp.leases, iw station dump
```

Each method opens its own `SSHClient` as `root` with `PromiscuousVerifier` and a key from `nethera.router.ssh-key-path`, which points to one developer's home directory. In each method, transport (SSH + shell command), parsing and persistence (speed math, DNS delta baseline, device upsert, activity log) are mixed together. The Docker stack sets `QUARKUS_SCHEDULER_ENABLED=false`, so the demo never shows live data.

Constraints: Quarkus 3.31 / Java 21, PostgreSQL 15, a one-command `docker compose up`, a school-project team where the backend owner does not own the router side (this change is backend only), and OpenWrt routers with limited flash (no Python/Java runtime).

## Goals / Non-Goals

**Goals:**
- The router pushes telemetry over an outbound MQTT connection. The backend never initiates a connection to the router for these streams.
- SSH keeps working and is used automatically for any stream MQTT does not currently supply.
- Database rows are identical whichever transport delivered the data. Existing dashboards and REST endpoints are untouched.
- The Docker stack shows live data when a router or the simulator publishes.
- MQTT data is keyed by the router ID from the topic instead of a hard-coded `1`, so a second router with an agent needs no code change.

**Non-Goals:**
- Commands from backend to router (block lists, time limits, QoS, firewall). This is a later change.
- TLS on the broker (see Open Questions).
- Removing SSH or `sshj`.
- Frontend changes, new REST endpoints, real-time push to the browser.
- Router discovery or self-registration. The `Router` row must already exist.

## Decisions

### D1 — Split transport from ingestion

```
            ┌──────────────── transport ────────────────┐   ┌──────── ingestion (shared) ────────┐
 SSH  ───▶  │ SshRouterCollector (exec + parse to DTO)  │──▶│ MetadataIngestor                   │
            └───────────────────────────────────────────┘   │ SpeedIngestor   (counter baseline) │──▶ DB
 MQTT ───▶  │ MqttTelemetryConsumer (JSON → same DTOs)  │──▶│ DnsIngestor     (delta baseline)   │
            └───────────────────────────────────────────┘   │ DeviceIngestor  (upsert + ActivityLog)
                                                            └──────────┬─────────────────────────┘
                                                                       ▼
                                                            TelemetryFreshness (routerId, stream) → Instant
```

New package `at.htlleonding.telemetry` holds transport-neutral input records (`MetadataSample`, `CounterSample`, `DnsSample`, `DeviceSnapshot`) and one `@ApplicationScoped` ingestor per stream with the database logic now found in the SSH services. The SSH services keep only SSH calls and text parsing, produce the same records, and call the ingestors.

*Why:* it's the only way to guarantee identical rows and activity logs across transports, and it makes the ingestion logic unit-testable without SSH or a broker. *Alternative:* add MQTT handlers next to the SSH code and duplicate the logic. Rejected because the activity-log edge cases (new / online→offline / offline→online) would drift between the two copies.

### D2 — Speed: router sends cumulative counters, backend computes the rate
The agent publishes raw `rxBytes`/`txBytes` with its own `ts`. `SpeedIngestor` keeps the last sample per router and computes Δbytes/Δt. The SSH path stays as it is: it takes two samples 2 s apart inside one call and sends the computed rate straight to the ingestor.

*Why:* the agent stays a few lines of `awk`, the measurement window becomes the whole publish interval (an average instead of a 2-second snapshot), and the counter-reset rule matches the one already used for DNS. *Alternative:* the agent samples twice and sends Mb/s. Rejected because it puts calculation logic in shell and hides counter resets from the backend.

### D3 — DNS baseline per router, shared across transports
Move `prevForwarded`/`prevAnsweredLocally` from fields on `RouterMetricsSyncService` into a `Map<Long, DnsBaseline>` in `DnsIngestor`. This removes the single-router assumption and makes SSH↔MQTT switches seamless, as the spec requires. The agent still triggers `SIGUSR1` and reads the syslog line. That stays the same, it just runs locally.

### D4 — Library: `quarkus-messaging-mqtt` (SmallRye Reactive Messaging)
A single channel `router-telemetry` subscribes to `nethera/#`, and `TelemetryMessageHandler` dispatches by topic (`nethera/<id>/status`, `nethera/<id>/telemetry/<stream>`). The router ID comes from `ReceivingMqttMessageMetadata#getTopic`. *Why one channel:* every SmallRye MQTT channel opens its own client connection, so five channels would need five client IDs and five persistent sessions. One subscription gives one connection and one session, which keeps queued QoS 1 messages consistent across a backend restart. The consumer is `@Blocking` and always acks. Parsing, ingestion and freshness happen in one `@Transactional` handler call, so an invalid payload rolls back and writes nothing. `failure-strategy=ignore` is set as a second safety net. `max-message-size` is raised from the 8 KB default to 64 KB for large device snapshots.

*Alternative:* Eclipse Paho directly. Rejected because it means managing connection, reconnect and threading by hand, while the Quarkus extension handles that, offers health checks, and matches the rest of the stack.

Disabling: `TelemetryModeConfigInterceptor` (a SmallRye `ConfigSourceInterceptor`) returns `false` for `mp.messaging.incoming.router-telemetry.enabled` when the mode is `ssh`, so no client is created. Plain property expressions can't express that condition.

### D5 — Topic layout and QoS
```
nethera/<routerId>/status              retained, QoS 1   "online" | "offline" (LWT)
nethera/<routerId>/telemetry/metadata  retained, QoS 1
nethera/<routerId>/telemetry/speed              QoS 0
nethera/<routerId>/telemetry/dns                QoS 1
nethera/<routerId>/telemetry/devices            QoS 1
```
These are the publish QoS levels. The backend subscribes with QoS 1, so each message is delivered at the level it was published with. Speed uses QoS 0 because losing one sample only widens the next Δt. DNS and devices use QoS 1 because a lost devices snapshot could delay a DISCONNECTED event. Duplicates are harmless: device ingestion is idempotent, and a duplicate DNS message produces a zero delta. Metadata and status are retained so a freshly started backend learns router state immediately. The backend uses a fixed client ID with `clean-session=false` so QoS 1 messages queued while it restarts are delivered.

The router ID in the topic is the `Router` primary key. *Alternative:* the router's MAC or a serial number. More robust, but it needs a lookup column and a provisioning flow, which is out of scope. The migration path is just a mapping table later.

### D6 — Online/offline through a long-lived Last Will connection (contract for the agent)
The backend only consumes the status topic. The behavior below is what the separate agent change must implement, and the simulator mimics it. `mosquitto_pub` calls are short-lived, so a Last Will on them would never fire. The agent therefore starts one background `mosquitto_sub -t nethera/<id>/status --will-topic nethera/<id>/status --will-payload offline --will-retain -k 30`, then publishes retained `online`. If the router dies, the broker publishes `offline` after about 45 s (1.5× keepalive). This gives "router went away" detection without polling.

### D7 — Fallback: per-stream freshness, decided by the scheduler
`TelemetryFreshness` stores `lastMqttIngest[routerId][stream]`. In `auto` mode `RouterSyncScheduler` calls the SSH collector for a stream only if it is stale. SSH settings (`nethera.router.ip`, key) describe exactly one router, so the scheduler syncs only the router named by `nethera.router.id` (default 1). Looping over all routers would write that one router's data into every router row. MQTT ingestion is not limited this way and handles any router ID from the topic. Default `stale-after = 180s` = 3 missed 60-second cycles. That tolerates a lost message without flapping between transports. Metadata is the exception: it's retained and published rarely (the agent sends it every few minutes), so a message-age test would mark it stale almost all the time. The SSH metadata sync would then run every cycle and, if SSH is unreachable, set `isOnline=false` for a router that's online over MQTT. Verification found exactly this. So metadata counts as fresh exactly while the MQTT status is `online`. The status is backed by the agent's Last Will connection, which is a more accurate liveness signal than message age. Because MQTT can now replace SSH as the liveness source, every valid telemetry message also refreshes `router.lastSeen`, as a successful SSH sync did. Transitions are logged once (track the previous decision per router+stream).

*Why per-stream:* an agent that publishes speed but has a broken `iw` should still get devices over SSH. *Alternative:* all-or-nothing per router. Simpler, but it hides partial agent failures.

Routers that have no SSH key configured (the Docker case) simply fail the SSH attempt as they do today, which is logged as a warning. To avoid noisy logs in Docker, Compose sets `nethera.telemetry.mode=mqtt`.

### D8 — Broker setup
`eclipse-mosquitto:2` in `compose.yaml`, with `docker/mosquitto/mosquitto.conf` (`allow_anonymous false`, `password_file`, `acl_file`, `persistence true`). The ACL uses Mosquitto's `pattern` with `%u`. Because usernames are `router-<id>`, a router-namespace rule can't be expressed with `%u` alone, so the ACL lists one `user router-<id>` block per router. That's fine at our scale. The password file is generated on first start by a small entrypoint step from env vars (`NETHERA_MQTT_BACKEND_PASSWORD`, `NETHERA_MQTT_ROUTER1_PASSWORD`, demo defaults), following how the README already handles DB/Keycloak passwords.

Port 1883 is published on `0.0.0.0` (not `127.0.0.1` like the other services) because the router sits on the LAN. Mitigations are listed under Risks.

### D9 — Backend-only scope: simulator in, agent out
The OpenWrt agent (shell script + procd service on the router) is **not** part of this change. It belongs to a follow-up change `router-telemetry-agent` owned by whoever handles the router side. The interface between the two is the topic/payload contract in `specs/mqtt-telemetry-ingestion` plus D2, D5 and D6. For a reference implementation, the agent can reuse the shell commands the SSH services already run today.

This change ships only the backend-side test tool:
- `scripts/mqtt-simulate-router.sh <id>`: runs `eclipse-mosquitto` as a throwaway container on the Compose network and publishes fake but consistent telemetry (rising counters, a few devices going on/offline). This lets the backend work be finished and demonstrated without the router side.

## Risks / Trade-offs

- **[Broker port exposed on LAN, no TLS]** → Password auth plus per-router ACL. Telemetry is read-only data, and no commands flow to the router in this change. Document that TLS (8883) is required before any internet-facing use. The command-channel change must not ship without it.
- **[Router clock wrong (no NTP yet after boot)]** → Speed uses only the *difference* of router `ts` values, so a constant offset doesn't matter. A backward jump is handled by the `ts_now ≤ ts_prev` rule. Stored timestamps use backend `now()`, as today.
- **[Two transports both active for one stream during a transition]** → Possible for one cycle around the stale threshold. Device ingestion is idempotent and DNS uses a shared baseline, so the worst case is one extra `SpeedStat` row from the SSH path. Accepted.
- **[In-memory baselines lost on backend restart]** → Same as today: the first sample after start is used as the baseline. Retained metadata and status restore router state immediately.
- **[Router-side work has no owner]** → The simulator makes the backend testable and demo-able on its own. Until the agent change ships, `auto` mode is identical to today's SSH behavior, so nothing regresses while waiting.
- **[Contract drift between backend and agent]** → The payload contract lives in this change's spec. Payloads carry `v`, and the backend rejects unknown versions loudly. The agent change should reuse the simulator's payloads as fixtures.
- **[Transactional consumer blocking the event loop]** → `@Blocking` puts ingestion on worker threads. Volume is tiny (≈4 msgs / 30 s / router).
- **[Refactor regresses the current SSH sync]** → Ingestors get unit tests built from the scenarios in the existing specs *before* the SSH services are rewired. The SSH path is then verified against the real router once.

## Migration Plan

1. Refactor (D1–D3) with no behavior change. The SSH-only path must pass the new ingestor tests and a manual sync against the router.
2. Add the broker to Compose and the MQTT consumers with mode defaulting to `auto`. Without an agent, every stream is stale, so behavior is identical to today.
3. Verify with the simulator in Compose (`nethera.telemetry.mode=mqtt`).
4. (Follow-up, after `router-telemetry-agent` ships) Run against the real router in `auto` and verify per-stream switching and SSH fallback.

Rollback: set `nethera.telemetry.mode=ssh`. The broker can stay running unused. There are no schema changes, so no DB rollback is needed.

## Open Questions

- Who owns the follow-up `router-telemetry-agent` change? (Router-side questions such as flash space for `mosquitto-client-nossl` and `logread` vs `/var/log/messages` belong there.)
- Is 30 s the right publish interval, or should it match the current 60 s for comparable dashboard charts?
- Should broker TLS be added in this change, given that port 1883 is now exposed on the LAN?
