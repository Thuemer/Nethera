## Context

The dashboard reads all data from a single `GET /api/routers/list` response. That response is built from the `router` entity and its four `@OneToMany` collections: `connectedDevices`, `activityLogs`, `speedStats`, `dnsStats`. Currently all rows in those tables are pre-seeded static SQL. Connected devices already have a live path (SSH on every HTTP request via `RouterSyncService`). The three remaining data types — speed, DNS, activity — have no live ingestion at all.

The router is an OpenWrt 22.03.7 device (Comtime, aarch64) reachable via SSH at `192.168.1.1`. Confirmed available: `/proc/net/dev` (WAN interface is `wan`), `ubus call system board`, dnsmasq 2.88 responding to `SIGUSR1` with stats written to `/var/log/messages`.

## Goals / Non-Goals

**Goals:**
- Insert a real `SpeedStat` row every 60 s from live WAN byte counters
- Insert a real `DnsStat` row every 60 s from dnsmasq stats (delta since last snapshot)
- Update `router.model`, `router.firmware`, `router.isOnline`, `router.lastSeen` from `ubus` on every sync
- Emit `ActivityLog` rows (`CONNECTED` / `DISCONNECTED`) as side-effects of the existing DHCP sync
- No frontend changes required

**Non-Goals:**
- Per-query DNS logging (would require reconfiguring dnsmasq with `--log-queries`)
- Precise "blocked queries" counter (not exposed by dnsmasq without query logging)
- Data retention / pruning (out of scope for prototype)
- Multi-router support (router ID is hardcoded to `1`, matching existing pattern)

## Decisions

### D1 — Background scheduler over on-demand SSH

**Decision:** Use Quarkus `@Scheduled` to run sync every 60 s in the background.

**Alternatives considered:**
- *On-demand per HTTP request* (current pattern for devices): makes dashboard load slow (~3–5 s per SSH round-trip), and the dashboard already makes one request that triggers all cards. Not viable for 3 additional SSH operations.
- *Client-driven polling endpoint*: moves latency to the client, still blocks on SSH.

**Rationale:** Background sync means reads are always fast (DB only). Stale data (router offline) is tolerable and already handled by the frontend's offline warning.

### D2 — Speed via two `/proc/net/dev` reads in a single SSH session

**Decision:** One SSH session executes `cat /proc/net/dev | grep "^ *wan:"; sleep 2; cat /proc/net/dev | grep "^ *wan:"`. Java parses both lines, computes `(bytes_t2 − bytes_t1) / 2 / 125000` for Mb/s.

**Alternatives considered:**
- *Two separate SSH connections with `Thread.sleep()` in Java*: two connection setups, more overhead, no benefit.
- *Track last byte count in memory*: fragile across restarts, requires instance state.

**Rationale:** Single-session approach is self-contained and matches the on-demand pattern already used in `RouterSyncService`.

### D3 — DNS stats via SIGUSR1 delta

**Decision:** Each sync cycle:
1. Send `kill -USR1 $(pidof dnsmasq)`
2. Sleep 1 s
3. Parse the last stats block from `/var/log/messages` (lines timestamped after the signal)
4. Compute delta from values stored in memory since the previous snapshot
5. Store delta as a `DnsStat` row: `total_queries = forwarded + answered_locally`, `blocked_queries = answered_locally`, `trackers_detected = 0`

**Alternatives considered:**
- *Store raw cumulative totals*: the dashboard currently sums all rows, so cumulative storage would double-count. Delta storage gives "queries in last 60 s" per row, which sums correctly to "queries today."
- *Enable `--log-queries` on dnsmasq*: requires modifying router config outside Nethera's control, and log volume would be enormous.
- *True "blocked" counter*: impossible without per-query logging. `answered_locally` is the closest proxy — domains blocked via `address=.../0.0.0.0` are answered locally by dnsmasq.

**Rationale:** Delta + `answered_locally` as blocked proxy is the most accurate approach available on minimal OpenWrt without router reconfiguration.

### D4 — Router metadata via `ubus call system board`

**Decision:** On every sync cycle, parse `ubus call system board` JSON to update `router.model` (from `model` field), `router.firmware` (from `release.description`), set `router.isOnline = true`, `router.lastSeen = now()`. If SSH fails, set `router.isOnline = false`.

**Rationale:** `ubus` is confirmed available and returns clean JSON. `/etc/openwrt_release` is an alternative but requires shell parsing. `ubus` is idiomatic for OpenWrt and already used in the router docs.

### D5 — Activity logs as DHCP sync side-effect

**Decision:** `RouterSyncService.syncDhcpLeases()` after upserting each device compares the new `isOnline` value against the previous DB state and writes an `ActivityLog` row on change. No new SSH commands required.

**Rationale:** All device state is already computed during DHCP sync (ARP + DHCP lease parse). Emitting events here avoids a separate SSH round-trip and keeps all device state changes in one transaction.

### D6 — Previous DNS snapshot stored in service instance memory

**Decision:** `RouterMetricsSyncService` holds `long prevForwarded` and `long prevAnsweredLocally` as instance fields (initialized to `−1` to signal "no previous reading"). On the first sync, no `DnsStat` row is inserted (delta undefined); subsequent syncs insert the delta.

**Alternatives considered:**
- *Persist last snapshot to DB*: extra table or column, more complexity.
- *Read last row from `dns_stat` table*: works across restarts but requires a query and complicates startup.

**Rationale:** For a prototype with `drop-and-create`, the DB resets on restart anyway. Instance memory is sufficient and keeps the code simple.

## Risks / Trade-offs

- **Router unreachable during sync** → each sync method catches `Exception`, logs a warning, and skips the insert. `router.isOnline` is set to `false`. The scheduler continues on the next cycle.
- **`/var/log/messages` rotation** → if the log rotates between SIGUSR1 and the read, the grep may return stale or empty data. Mitigation: check the timestamp of parsed lines; if older than 5 s, skip the insert rather than storing stale delta.
- **60 s sleep blocks a Quarkus worker thread** → the `sleep 2` inside the speed SSH session is 2 s, not 60 s. The scheduler fires and blocks for ~3–5 s total (SSH connect + 2 s sleep + parse). This is acceptable for a 60 s interval.
- **`drop-and-create` resets data on every restart** → expected for dev/demo; in-memory DNS snapshot state resets too, so first sync after restart produces no DNS row (acceptable).
- **Accumulation without pruning** → `speed_stat` grows ~1440 rows/day. No pruning planned. Fine for a prototype.

## Migration Plan

1. Add `quarkus-scheduler` to `pom.xml`
2. Add `nethera.router.wan-interface` and `nethera.sync.interval` to `application.properties`
3. Deploy new service and scheduler classes
4. Strip `import_extended.sql` to router row only — existing `drop-and-create` will rebuild schema cleanly on next start
5. No API changes; no frontend changes; rollback = revert Java files and restore `import_extended.sql`
