## Why

Time limits are a core Nethera feature ("Gruppe Kinder → offline → Zeitplan"), but today they only exist in PostgreSQL: `DeviceTimeLimit` stores one daily window and a budget per device, nothing is sent to the router, and `usedMinutesToday` is typed in by the browser. Adblock and website blocking (#23, #25) now reach the Cudy through the MQTT desired-state mechanism, so issue #27 can use the same path and finally make schedules take effect on the router.

## What Changes

### Delivery phases (22 November 2026)

The immediate request is to connect the **existing** Internetzeiten page while
preserving current features. Phase A therefore keeps `DeviceTimeLimit`, its API,
security presets and topology data shape. It adds an opt-in daily-rule adapter,
MQTT publisher/readback, an additive migration and frontend confirmation polling.
Only explicitly re-saved rules are sent; legacy rows remain inactive. API budget
zero remains unlimited. Timezone is Europe/Vienna and unsynchronised-clock policy
is OPEN in this phase. Preset assignment still copies a chosen daily rule, but
never writes a browser usage counter.

The reusable schedule/group/override model and the breaking changes listed below
are **Phase B, not part of the completed compatibility bridge**. Their tasks stay
open. See design D11 and tasks section 8 for the tested Phase A scope.

### Target architecture (Phase B)

- New reusable **schedules** per router: a name, any number of blocked windows with weekdays (windows may cross midnight) and a daily internet budget per weekday
- Schedules are **assigned** to devices or device groups; an assignment can be paused
- New **instant actions** per device or group: "Jetzt offline" (block) and "Jetzt freigeben" (allow), each for a duration or until switched off
- Fixed evaluation rules: manual block beats everything, manual allow suspends windows and budgets, otherwise the strictest rule wins (union of windows, smallest budget); a window belongs to the weekday it starts on; only internet access is blocked, the home network stays reachable
- New router setting: what happens while the router does not know the time after a reboot (default: no time rules until the clock is synchronised; optional: block scheduled devices). The router's time zone becomes a setting too (default `Europe/Vienna`)
- The backend resolves schedules, groups and overrides into effective rules per MAC address and publishes them as a retained, versioned desired state on `nethera/<id>/config/time`
- The router agent enforces windows, budgets and overrides itself, so they keep working without cloud connection and after a reboot. It counts internet usage per MAC (a minute counts when the device caused noticeable traffic) and reports usage, block reason and the applied version on `nethera/<id>/telemetry/time`
- `GET /api/router-control/status` fills `timeLimits` per device from that report (`applied`, `blockedNow`, `reason`, `usedMinutesToday`)
- Frontend "Internetzeiten" is rebuilt around schedules, assignments and instant actions; the settings page gets the two new router settings
- **BREAKING** — `api/device-time-limits` is removed and replaced by `api/schedules`, `api/schedule-assignments` and `api/time-overrides`; `timeLimits` in `GET /api/security/state` is replaced by schedule data
- **BREAKING** — `usedMinutesToday` can no longer be written by a client; only the router reports it
- Existing `device_time_limit` rows are migrated into schedules with one device assignment each
- Applying a preset no longer copies its `blockedFrom`/`blockedUntil`/`timeLimitMinutes` into a time limit; time rules live only in schedules
- Out of scope: the mobile app, automatic schedules for new devices, allow-lists during a block, a user-adjustable traffic threshold

## Capabilities

### New Capabilities

- `time-schedules`: Managing reusable schedules (windows with weekdays, budget per weekday), assigning them to devices and groups, instant block/allow overrides, router time settings, and the rules that combine all of these into one effective rule per device
- `router-time-enforcement`: Transport of the effective rules to the router and their enforcement by the agent: blocking internet access per MAC during windows, budget counting and blocking, overrides, behaviour without synchronised clock, persistence across reboots
- `time-limit-status`: The router's confirmation and live state (applied version, blocked now, reason, used minutes today) and how it is exposed to the frontend

### Modified Capabilities

<!-- none — openspec/specs/ has no spec for time limits or router control. The active change router-ownership lists api/device-time-limits; its ownership rules are carried over to the new endpoints here. -->

## Impact

- **Depends on** `router-ownership` (`CurrentRouter`), `router-telemetry-agent` (agent on the Cudy, MQTT connection) and the existing router control (`RouterControlPublisher`, `RouterControlState`, `control_dns.go`)
- **Backend model**: new `Schedule`, `ScheduleWindow`, `ScheduleBudget`, `ScheduleAssignment`, `TimeOverride`, `TimeControlState`; `Config` gets `timezone` and `timeLimitsUntilClockSync`; `DeviceTimeLimit` and the unused POJO `Schedule.java` are replaced
- **Backend boundary/services**: new `SchedulesResource`, `ScheduleAssignmentsResource`, `TimeOverridesResource`, `TimeDesiredState`, `TimeControlPublisher`, `TimeIngestor`; changes in `RouterControlResource`, `SecurityStateResource`, `ConfigsResource`, `TelemetryMessageHandler`; `DeviceTimeLimitsResource` removed
- **Migration**: new additive SQL script in `Backend/Nethera/migrations/` (new tables, config columns, copy of `device_time_limit`); `import.sql` / `import_extended.sql` seeds updated
- **Router agent**: new `control_time.go` (parse, evaluate every minute, nft set and counters, usage file on flash), subscription to `config/time`, embedded time zone data
- **Broker**: no ACL change (`config/#` and `telemetry/#` are already allowed)
- **Frontend**: `time-limits.html/.js/.css` rebuilt; `configuration.html/.js`, `security.js` (preset time fields), `security-draft.js`, `topology-model.js`, `api.js` (demo fixtures) adapted
- **Tests**: new backend ITs for schedules, ownership, desired state and status; Go tests for evaluation (midnight, weekdays, budget, overrides, clock); frontend tests updated
- **Not supported in SSH telemetry mode**: like DNS control, time control needs MQTT
