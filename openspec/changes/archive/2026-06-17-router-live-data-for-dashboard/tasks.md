## 1. Dependencies & Configuration

- [x] 1.1 Add `quarkus-scheduler` dependency to `Backend/Nethera/pom.xml`
- [x] 1.2 Add `nethera.router.wan-interface=wan` to `application.properties`
- [x] 1.3 Add `nethera.sync.interval=60s` to `application.properties`

## 2. RouterMetricsSyncService — Speed

- [x] 2.1 Create `at.htlleonding.services.RouterMetricsSyncService` as `@ApplicationScoped`
- [x] 2.2 Inject `EntityManager`, `@ConfigProperty nethera.router.ip`, `nethera.router.ssh-key-path`, `nethera.router.wan-interface`
- [x] 2.3 Implement `syncSpeed(Router router)`: open one SSH session, run `cat /proc/net/dev | grep "^ *<wan>:"; sleep 2; cat /proc/net/dev | grep "^ *<wan>:"`, parse both lines, compute Mb/s
- [x] 2.4 Persist a new `SpeedStat` entity (`downloadSpeed`, `uploadSpeed`, `timestamp = LocalDateTime.now()`, `router`) inside a `@Transactional` call
- [x] 2.5 Catch all exceptions in `syncSpeed`, log a warning, and return without inserting

## 3. RouterMetricsSyncService — DNS Stats

- [x] 3.1 Add `long prevForwarded = -1` and `long prevAnsweredLocally = -1` instance fields to `RouterMetricsSyncService`
- [x] 3.2 Implement `syncDnsStats(Router router)`: SSH session runs `kill -USR1 $(pidof dnsmasq); sleep 1; tail -40 /var/log/messages`
- [x] 3.3 Parse output: find the most recent block containing `"queries forwarded"` and `"queries answered locally"`, extract both long values, verify timestamp is within 5 s of now
- [x] 3.4 If `prevForwarded == -1` (first run), store current values as baseline and return without inserting
- [x] 3.5 If either delta is negative (dnsmasq restarted), update baseline and return without inserting
- [x] 3.6 Otherwise persist a new `DnsStat` entity (`totalQueries = deltaForwarded + deltaAnswered`, `blockedQueries = deltaAnswered`, `trackersDetected = 0`, `timestamp = now()`, `router`)
- [x] 3.7 Catch all exceptions in `syncDnsStats`, log a warning, and return without inserting

## 4. RouterMetricsSyncService — Router Metadata

- [x] 4.1 Implement `syncRouterMetadata(Router router)`: SSH session runs `ubus call system board`
- [x] 4.2 Parse the JSON response using Jackson (`ObjectMapper` or manual string parse) to extract `model` and `release.description`
- [x] 4.3 Update `router.setModel(...)`, `router.setFirmware(...)`, `router.setOnline(true)`, `router.setLastSeen(now())` inside a `@Transactional` call
- [x] 4.4 On SSH failure, set `router.setOnline(false)` in a `@Transactional` call, log a warning

## 5. RouterSyncService — Activity Log Side-Effect

- [x] 5.1 In `RouterSyncService.syncDhcpLeases()`, before calling `deviceRepository.syncDevice(...)`, query the DB for the device's current `isOnline` state
- [x] 5.2 After `syncDevice` completes, compare old vs new `isOnline`: if `false → true`, insert a `CONNECTED` `ActivityLog` row; if `true → false`, insert a `DISCONNECTED` `ActivityLog` row
- [x] 5.3 For new devices (not yet in DB), insert a `CONNECTED` `ActivityLog` row after the device is persisted
- [x] 5.4 Ensure `ActivityLog` inserts share the same `@Transactional` scope as the device upsert

## 6. RouterSyncScheduler

- [x] 6.1 Create `at.htlleonding.services.RouterSyncScheduler` as `@ApplicationScoped`
- [x] 6.2 Inject `RouterSyncService`, `RouterMetricsSyncService`, and `EntityManager`
- [x] 6.3 Implement `@Scheduled(every = "${nethera.sync.interval}") void syncAll()` method
- [x] 6.4 Inside `syncAll()`: load `Router` with ID 1 via `EntityManager`, then call `syncRouterMetadata`, `syncSpeed`, `syncDnsStats`, `syncDhcpLeases` in sequence, each wrapped in individual try/catch so one failure does not stop the others

## 7. Seed Data Cleanup

- [x] 7.1 Edit `import_extended.sql`: remove all `INSERT` statements for `speed_stat`, `dns_stat`, `activity_log`, and `device` tables
- [x] 7.2 Keep only the single `INSERT INTO router` row so the scheduler has a valid entity to reference on first run
- [x] 7.3 Remove stale `Account`, `Config`, `Connection` inserts that reference the old schema (columns no longer exist on those entities)

## 8. Verification

- [x] 8.1 Start the backend; confirm no startup errors and the scheduler fires after 60 s
- [x] 8.2 After one cycle, query `SELECT * FROM speed_stat` — verify one row with non-zero values
- [x] 8.3 After two cycles, query `SELECT * FROM dns_stat` — verify a delta row (may be all zeros if no DNS traffic, but no error)
- [ ] 8.4 Open the dashboard — confirm Speed card shows a line, DNS card shows numbers, Router card shows real model/firmware
- [ ] 8.5 Connect a new device to the router's network; after the next sync cycle confirm a `CONNECTED` activity log row appears in the dashboard
