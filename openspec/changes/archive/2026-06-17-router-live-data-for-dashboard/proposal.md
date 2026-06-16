## Why

The Nethera dashboard currently displays static seed data loaded from `import_extended.sql` on every backend restart — nothing on the speed chart, DNS stats, or activity log reflects the real router. This makes the dashboard meaningless for actual use and blocks any demo or handover to real users.

## What Changes

- A background scheduler (`RouterSyncScheduler`) runs every 60 seconds and triggers three new sync operations against the router via SSH.
- A new `RouterMetricsSyncService` handles speed measurement (WAN byte-count diff), DNS stats (dnsmasq `SIGUSR1` dump parsed from `/var/log/messages`), and router metadata (`ubus call system board`).
- The existing `RouterSyncService.syncDhcpLeases()` is extended to emit `ActivityLog` rows as a side effect when devices connect or disconnect.
- `quarkus-scheduler` is added to `pom.xml`.
- The WAN interface name and scheduler interval are made configurable via `@ConfigProperty`.
- Seed data in `import_extended.sql` is reduced to the bare minimum (one router row only) — speed stats, DNS stats, activity logs, and devices are no longer hardcoded.

## Capabilities

### New Capabilities
- `router-speed-sync`: Periodically reads WAN byte counters from `/proc/net/dev` (two readings 2 s apart), computes upload/download in Mb/s, and inserts a `SpeedStat` row.
- `router-dns-sync`: Periodically triggers dnsmasq stats via `SIGUSR1`, parses `/var/log/messages` for the delta since the previous snapshot, and inserts a `DnsStat` row. `blocked_queries` is populated with `queries answered locally` (DNS-blocked domains are served locally by dnsmasq `address=` directives).
- `router-metadata-sync`: Reads `ubus call system board` and updates `router.model`, `router.firmware`, `router.lastSeen`, and `router.isOnline` on each sync cycle.
- `router-activity-log`: Extends the existing DHCP sync to compare the incoming device list against the DB state and write `CONNECTED` / `DISCONNECTED` `ActivityLog` rows for changes.
- `router-sync-scheduler`: Quarkus `@Scheduled` entry point that orchestrates all sync operations every 60 seconds.

### Modified Capabilities
_(none — no existing spec-level requirements change)_

## Impact

- **Backend — new files**: `RouterMetricsSyncService.java`, `RouterSyncScheduler.java`
- **Backend — modified**: `RouterSyncService.java` (activity log side-effect), `import_extended.sql` (stripped down), `pom.xml` (`quarkus-scheduler` dependency), `application.properties` (`nethera.router.wan-interface`, `nethera.sync.interval`)
- **Frontend**: No changes — existing dashboard cards already consume `speedStats`, `dnsStats`, `activityLogs` from the `/api/routers/list` response.
- **Database**: Schema unchanged; `speed_stat` and `dns_stat` now accumulate real rows over time instead of being pre-seeded.
