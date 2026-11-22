Phase A (compatible daily-rule bridge) is tracked in section 8. The original
reusable-schedule redesign below remains Phase B; unchecked tasks are not claimed
complete by connecting the existing API. See design D11.

## 1. Data model and migration

- [ ] 1.1 Replace the POJO `model/Schedule.java` with an entity `Schedule` (`id`, `routerId`, `name`) implementing `RouterScoped`, with `@ElementCollection` of `@Embeddable ScheduleWindow` (`weekdays`, `fromTime`, `untilTime`) and `ScheduleBudget` (`weekdays`, `minutes`) and a `findByRouter` named query
- [ ] 1.2 Add entities `ScheduleAssignment` (`scheduleId`, `targetType`, `targetId`, `status`, unique on schedule+target) and `TimeOverride` (`routerId`, `targetType`, `targetId`, `mode`, `untilTs`, unique on target) with named queries by router / schedule / target
- [x] 1.3 Add entity `TimeControlState` (`routerId` PK, desired/applied version, desired content, applied, clockSynced, error, checkedAt, report as text) with `versionConfirmed()`
- [ ] 1.4 Add `timezone` (default `Europe/Vienna`) and `timeLimitsUntilClockSync` (default `OPEN`) to `Config`
- [ ] 1.5 Remove `DeviceTimeLimit`, `DeviceTimeLimitsRepository`, `DeviceTimeLimitDto` and `DeviceTimeLimitsResource`; fix all compile references (`SecurityStateResource`, tests)
- [ ] 1.6 Write `Backend/Nethera/migrations/20261120_time_schedules.sql` (additive, idempotent): new tables, config columns with defaults, copy of `device_time_limit` rows as in the spec "Existing time limits are migrated"
- [ ] 1.7 Update `import.sql` / `import_extended.sql`: replace time-limit seeds with seeded schedules and assignments for router 1

## 2. Schedule API

- [ ] 2.1 Add validation helpers to `RequestValidation`: weekday lists, `HH:mm` with `from != until`, budget minutes, unique weekday per budget list, name length, max 20 windows, IANA time zone, `OPEN`/`BLOCK`, future instant
- [ ] 2.2 `SchedulesResource`: `GET`, `POST` (201), `PUT /{id}` (replace windows/budgets), `DELETE /{id}` (cascade assignments); scoped with `CurrentRouter`, fires `RouterControlChanged`
- [ ] 2.3 `ScheduleAssignmentsResource`: `POST` (target ownership check for DEVICE/GROUP, 409 on duplicate), `PUT /{id}` (status), `DELETE /{id}`; fires `RouterControlChanged`
- [ ] 2.4 `TimeOverridesResource`: `PUT/DELETE /{targetType}/{targetId}` (replace existing, reject past `until`); fires `RouterControlChanged`
- [ ] 2.5 Group deletion in `SecurityStateResource` also deletes the group's assignments and override
- [ ] 2.6 `GET /api/security/state`: replace `timeLimits` with `schedules`, `scheduleAssignments` and active `timeOverrides`; ignore `usedMinutesToday` everywhere
- [ ] 2.7 `ConfigsResource`: read, validate and save `timezone` and `timeLimitsUntilClockSync`

## 3. Desired state and publishing

- [ ] 3.1 `control/TimeDesiredState.build(...)`: pure function resolving active assignments of device and groups, union of windows, smallest budget per weekday, combined block/allow overrides (latest end, null = indefinite, expired dropped), devices with valid MAC only, sorted for stable JSON
- [ ] 3.2 Unit tests for `TimeDesiredState`: two schedules on one device, group + device budget, paused assignment, block beats allow, expired override, device in two groups, foreign router data ignored
- [ ] 3.3 `control/TimeControlPublisher`: observes `RouterControlChanged` (AFTER_SUCCESS) and startup, builds the v1 message (design D5), bumps the version only on content change, publishes retained QoS 1 on `nethera/<id>/config/time`; disabled in SSH mode
- [x] 3.4 Add the outgoing channel configuration for `config/time` in `application.properties` (dev, test, Compose, LeoCloud env if needed)

## 4. Router report and status

- [x] 4.1 `TelemetryMessageHandler` / `TelemetryPayloadParser`: accept stream `time` (design payload), reject invalid payloads like the other streams
- [x] 4.2 `telemetry/TimeIngestor`: store the report in `TimeControlState`, ignore reports with an older router timestamp
- [x] 4.3 `RouterControlResource.status`: fill `timeLimits` per device ID (`applied`; `blockedNow`, `reason`, `usedMinutesToday`, `budgetMinutesToday` only when online, confirmed and reported) and add `capabilities.timeControl`
- [ ] 4.4 Integration tests: ownership (404 for foreign schedule/group/device), validation (400 cases from the spec), duplicate assignment (409), cascade on schedule and group delete, published message content and version stability, status with confirmed / pending / offline report

## 5. Router agent

- [x] 5.1 `control_time.go`: types for the v1 message and report, `parseTimeControl` with all validations (schema, version, time zone via embedded `time/tzdata`, MAC, weekdays, times, max 100 devices)
- [x] 5.2 Evaluation function `evaluate(rule, now, used, clockSynced, untilClockSync)` returning blocked + reason; window owned by its start day, midnight crossing, budgets per local weekday, block/allow expiry
- [x] 5.3 Go tests for evaluation: Friday night into Saturday, Sunday night not selected, DST switch days in `Europe/Vienna`, budget reached and reset at midnight, allow suspends budget but counts, clock not synced with `OPEN` and `BLOCK`, override expiry
- [x] 5.4 nft boot file `91-nethera-time.nft` (set, named counters, chain at `filter - 6`); checked atomic transactions for own objects, no full fw4 reload, preserve DNS sets, restore blocks after external reloads and report failures
- [x] 5.5 Usage counting: read counters every minute, count a minute above `usageThresholdBytes`, handle counter resets, persist `/etc/nethera/time-usage.json` every 5 minutes when changed and on budget block/day change, restore after NTP on same local date (threshold calibration remains 7.3)
- [x] 5.6 Wire into the agent: subscribe to `config/time`, keep newest message only, save valid message on flash (`/etc/nethera/time-control.json`), load at boot, minute ticker, publish retained `telemetry/time` after messages and as minute heartbeat; reject stale/reused versions and persistence failures
- [x] 5.7 Keep the new files on sysupgrade (`router/files/lib/upgrade/keep.d/nethera-agent`) and document the topic in the agent README / `router/files` comments

Router implementation verified on 22 November: see [verification.md](verification.md).
The physical iPhone window test is only part of 7.4. Phase A backend publishing
and UI are now covered by section 8; physical MQTT end-to-end acceptance,
calibration and the full reboot/boundary matrix remain open.

## 6. Frontend

- [ ] 6.1 `api.js`: helpers for schedules, assignments and overrides; demo fixtures converted to schedules/assignments/overrides with negative IDs
- [ ] 6.2 Rebuild `time-limits.html/.js/.css`: schedule list, editor with weekday chips, windows, per-weekday budget and weekly preview, presets "Nachtruhe" and "Lernzeit", assignment to devices and groups with pause, delete confirmations
- [ ] 6.3 Instant actions "Jetzt offline" / "Jetzt freigeben" for device or group with "1 Stunde", "bis morgen früh" (next 07:00 in the router's time zone) and "bis ich es wieder einschalte", plus "Aufheben"
- [ ] 6.4 Status per device from `GET /api/router-control/status`: "Nur gespeichert", "Router nicht verbunden", "Routerbestätigung noch nicht verfügbar", blocked reason in plain German, budget bar from router values only
- [ ] 6.5 `configuration.html/.js`: time zone select and switch "Zeitpläne nach Neustart sofort durchsetzen" with help text
- [ ] 6.6 `security.js` / `security-draft.js`: remove preset time fields from the form and stop copying them into time limits; `topology-model.js`: read schedules/overrides instead of `timeLimits`
- [ ] 6.7 Update frontend tests (`rules`, `security-draft`, `topology`, `data-source`, `browser-smoke`) and add tests for the schedule editor validation and the "bis morgen früh" calculation

## 7. Rollout and acceptance

- [ ] 7.1 Run backend unit and integration tests, Go tests and `node --test Applikation/tests/*.test.cjs`
- [ ] 7.2 Local end-to-end with Compose (backend, broker, agent dry run): create schedule, assign to group, check published `config/time` and status
- [ ] 7.3 Calibrate `usageThresholdBytes` on the Cudy with an idle and an active phone and record the value
- [ ] 7.4 Hardware acceptance on the Cudy as listed in design "Migration Plan" (midnight, weekday boundary, budget, overrides, power cut with OPEN/BLOCK, LAN devices reachable, delete during block)
- [ ] 7.5 LeoCloud rollout after review: backup, run `20261120_time_schedules.sql`, deploy backend, agent and frontend; record digests and acceptance in `deploy/leocloud/README.md`

## 8. Phase A: compatible daily-rule backend bridge

- [x] 8.1 Keep the existing API and data; add idempotent `20261122_time_control_bridge.sql`, with existing rules inactive until explicit re-save
- [x] 8.2 Validate daily windows/status/budgets, ignore browser counters, scope writes to the account's router and prepare the desired version transactionally
- [x] 8.3 Publish own live-device MAC rules after commit on a separate time event/channel; fixed Europe/Vienna and OPEN, API zero budget stays unlimited; retry existing configurations on startup/every minute
- [x] 8.4 Validate/read time reports, reject stale/future reports, expose complete fresh version confirmation, consumption and separate time errors without altering DNS status
- [x] 8.5 Connect current Internetzeiten editor including pause/delete/preset compatibility; poll ACKs and preserve expanded details/focus; use router counters only
- [x] 8.6 Test actual REST -> isolated PostgreSQL/MQTT -> readback/status, version stability, invalid input, migration twice, and unchanged retained DNS state; run frontend regressions and responsive browser checks
- [x] 8.7 Update README, meta-spec, frontend contract, OpenSpec and verification with the compatibility boundary and rollout/rollback order
- [ ] 8.8 Review and deploy Phase A migration/backend/frontend, then repeat an approved real-device window/pause/delete test through the website; leave accounts/data/DNS rules intact
