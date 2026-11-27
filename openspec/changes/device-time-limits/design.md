## Context

Time limits are stored but never enforced. `DeviceTimeLimit` holds one daily window (`blockedFrom`/`blockedUntil` as strings), a budget and a browser-supplied `usedMinutesToday` per device; `Schedule.java` is an unused POJO; `SecurityPreset` carries its own time fields that the frontend copies into a time limit when a preset is applied. `GET /api/router-control/status` always returns an empty `timeLimits` map.

Adblock and website blocking (#23, #25) already reach the router through a pattern that this change reuses:

```
REST write ─▶ commit ─▶ CDI RouterControlChanged (AFTER_SUCCESS)
          ─▶ RouterControlPublisher: full desired state per router, version bump only on change
          ─▶ MQTT retained nethera/<id>/config/dns
          ─▶ agent control_dns.go: validate, write own files, save on flash
          ─▶ MQTT retained nethera/<id>/telemetry/control {version, applied, error}
          ─▶ ControlIngestor ─▶ RouterControlState ─▶ /api/router-control/status
```

The Mosquitto ACL already lets the backend write `nethera/+/config/#` and each router write `nethera/<id>/telemetry/#`. The agent already knows when NTP has set the clock (`/var/run/nethera-ntp-synced`). The Cudy has no battery-backed clock; after a power cut OpenWrt starts with the time of the newest file on flash.

## Goals / Non-Goals

**Goals:**
- Reusable schedules with weekday windows and per-weekday budgets, assigned to devices and groups
- Instant "Jetzt offline" / "Jetzt freigeben" with duration
- Enforcement on the router that works without cloud connection, across reboots and daylight saving time
- Usage counted by the router, not the browser
- Honest status: only what the router confirmed is shown as effective

**Non-Goals:**
- Mobile app (separate repository, ignored for now)
- Automatic schedules for new or unknown devices
- Allow-lists ("Schulplattform bleibt erreichbar") during a block
- A user-adjustable traffic threshold
- Changing the DNS control message or its confirmation
- Time control in SSH telemetry mode

## Decisions

### D1: The router enforces, the backend only describes
The backend sends the complete effective rules per MAC; the agent decides every minute whether a MAC is blocked.

*Alternative:* a backend scheduler publishes "block"/"unblock" at the window boundaries. Rejected: a block would fail whenever the cloud or the router's uplink is down, the desired version would change twice a day per rule, and budgets would need per-minute round trips.

### D2: Agent evaluates in Go; nftables only holds the result
The agent computes the blocked set itself in the router's time zone and writes it into an nft set. It does **not** translate windows into `meta hour`/`meta day` rules.

*Alternative:* nft time matching or fw4 UCI rules with `weekdays`/`start_time`. Rejected: nft converts local times to UTC when the rules are loaded, so a window shifts by one hour after a DST switch until the next reload; midnight-crossing windows, budgets and overrides would need the Go logic anyway. One evaluation path in Go is testable with a fake clock.

The binary embeds the time zone database (`import _ "time/tzdata"`, ~450 KB), because OpenWrt ships no zoneinfo files and Go cannot use OpenWrt's POSIX `TZ` string. The time zone is a backend setting (`Config.timezone`) sent in every message, so the router's own system time zone setting does not matter.

### D3: Firewall layout
Own file `/usr/share/nftables.d/table-post/91-nethera-time.nft`, included by fw4 into `table inet fw4`:

```
set nethera_time_blocked { type ether_addr; }
counter nethera_time_<mac> { }                   # one per MAC with a budget
chain nethera_time {
    type filter hook forward priority filter - 6; policy accept;
    ether saddr @nethera_time_blocked counter reject
    ether saddr <mac> counter name nethera_time_<mac>     # per MAC with a budget
}
```

- The forward hook only sees routed traffic. Traffic inside the LAN bridge (printer, Chromecast), DHCP and DNS to the router (input hook) are unaffected.
- Priority `filter - 6` runs before fw4's own forward chain (which accepts established connections), so a block also stops running connections. It runs before the DNS control chain (`filter - 5`); both only reject, so the order between them does not matter.
- Blocking by source MAC stops IPv4 and IPv6 alike. Replies from the internet still arrive but the device cannot answer, so connections die.
- The boot include changes only when the budget MACs change or it is first created. Live changes use a checked, atomic nft transaction affecting only `nethera_time`, `nethera_time_blocked` and its named counters. A time update never calls `fw4 reload`, because that would clear populated DNS sets belonging to #25. Existing named counter values are preserved when rebuilding the time objects.
- Each refresh reads actual kernel objects, not a cached blocked set. A successful DNS-triggered `fw4 reload` signals an immediate refresh without charging another usage minute; external reloads are repaired by the minute tick. A failed read/check/apply returns `applied: false` and is retried.
- Flow offloading can bypass forward-hook rules and counters. With active flowtables, time control reports an error and does not change the router's global offload setting. Enabling time control on such a router needs an explicit, separately reviewed offload change. The Cudy checked on 22 November has no flowtables.
- A window without a daily budget also creates the chain and set. Blocked retries are rejected before the usage counters and do not consume further budget.

### D4: Usage minute = upload above a threshold
Every minute the agent reads the named counters (`nft -j list counters table inet fw4`). A minute counts when the bytes sent by the device to the internet grew by more than `usageThresholdBytes` (constant, initial value 20 KB, calibrated on the Cudy). Counting upload is enough: every real use (page loads, video, games) produces outgoing requests and acknowledgements, while an idle phone sends little.

*Alternative:* counting "connected" minutes from ARP/WLAN. Rejected: a phone lying in the WLAN at night would use up the budget. Counting download would need the device's current IPv4/IPv6 addresses in the rules.

Usage is stored in `/etc/nethera/time-usage.json` with the local date, written every 5 minutes when changed, at a local-day change, and when a budget block starts. After a reboot it is restored only after NTP synchronization, in the configured time zone. Unsynchronized boots must not overwrite the saved day. On the same date the agent continues from the stored values; up to 5 minutes may be lost on power loss. The initial 20 KB threshold still requires idle/active hardware calibration; it is not a proven measurement of screen time.

### D5: Desired state message (`config/time`, schema v1)
The backend resolves groups, pauses and the "strictest rule wins" combination, so the router never sees groups or schedules:

```json
{
  "v": 1, "version": 1763560000123,
  "timezone": "Europe/Vienna", "untilClockSync": "OPEN",
  "devices": {
    "aa:bb:cc:dd:ee:01": {
      "windows": [{"days": ["MO","TU","WE","TH","FR"], "from": "14:00", "until": "16:00"},
                  {"days": ["MO","TU","WE","TH","FR","SA","SU"], "from": "21:00", "until": "07:00"}],
      "budgets": {"MO": 60, "TU": 60, "WE": 60, "TH": 60, "FR": 60, "SA": 240},
      "block": {"until": 1763563600},
      "allow": null
    }
  }
}
```

- `windows`: union of all windows of active assignments of the device and its groups, de-duplicated.
- `budgets`: per weekday the smallest budget of those schedules; missing weekday = no budget.
- `block` / `allow`: the device's and its groups' overrides of that mode combined; `until` is the latest end (Unix seconds), `{"until": null}` means indefinite, `null` means none. Expired overrides are left out. Sending both lets the agent fall back to an allow override when a block expires.
- Evaluation order on the router: block, allow, windows, budget (spec `time-schedules`).
- The router requires an explicit `devices` object (`{}` clears all time rules), rejects unknown fields and messages over 256 KiB, and rejects older versions or changed content reusing the current version. Saving must succeed before changing live rules. Errors never produce a successful confirmation.
- Windows compare local wall-clock minutes, including both occurrences of a repeated hour when summer time ends. Overnight windows belong to their starting weekday.

`TimeDesiredState.build(...)` is a pure function like `DnsDesiredState.build(...)` and gets the unit tests for the combination rules.

### D6: Separate topic, separate state, shared trigger
Time rules get their own topic, their own `TimeControlPublisher` and their own `time_control_state` row per router (desired/applied version, error, clockSynced, checked_at, last report as JSON).

*Alternative:* add the rules to `config/dns`. Rejected: one version for both would mark time limits "not applied" when a DNS list fails (e.g. missing `dnsmasq-full`), and it would change a working, hardware-verified message.

Both publishers observe the same `RouterControlChanged` event. Every endpoint that already fires it (groups, members, devices, config) therefore also refreshes the time state; the new endpoints fire it as well. A publish that does not change the content does not bump the version, so the extra recomputation is harmless.

### D7: Clock not synchronised
Until the NTP flag exists, the agent uses only indefinite overrides (`OPEN`) or blocks every device that has any rule (`BLOCK`, except indefinite allow), and counts nothing. The 5-minute grace that the telemetry streams use (`ntpGrace`) does **not** apply here: with a wrong clock, a guessed time is worse than either explicit setting. The report contains `clockSynced`, so the UI can say "Uhrzeit noch unbekannt".

### D8: Data model
```
schedule            id, router_id, name
schedule_window     schedule_id, weekdays ("MO,TU,…"), from_time, until_time   (@ElementCollection)
schedule_budget     schedule_id, weekdays, minutes                             (@ElementCollection)
schedule_assignment id, schedule_id, target_type DEVICE|GROUP, target_id, status, UNIQUE(schedule_id, target_type, target_id)
time_override       id, router_id, target_type, target_id, mode BLOCK|ALLOW, until_ts NULL, UNIQUE(target_type, target_id)
time_control_state  router_id PK, desired_version, desired_content, applied_version, applied, clock_synced, error, checked_at, report
config              + timezone (default 'Europe/Vienna'), + time_limits_until_clock_sync (default 'OPEN')
```
`target_id` is polymorphic (device or group), so it has no foreign key; ownership checks go through `CurrentRouter`, and deleting a group or schedule deletes dependent rows in the same transaction. Windows and budgets are value objects of a schedule (`@ElementCollection` of `@Embeddable`), replaced as a whole on `PUT`.

`DeviceTimeLimit` (entity, repository, resource, DTO) and the POJO `Schedule.java` are removed from the code. The table `device_time_limit` stays in the database (migrations are additive) and is no longer read.

### D9: API
- `GET/POST /api/schedules`, `PUT/DELETE /api/schedules/{id}`
- `POST /api/schedule-assignments`, `PUT/DELETE /api/schedule-assignments/{id}`
- `PUT/DELETE /api/time-overrides/{targetType}/{targetId}`
- `GET /api/security/state`: `timeLimits` replaced by `schedules`, `scheduleAssignments`, `timeOverrides` (topology and security page already load this endpoint)
- `GET /api/router-control/status`: `timeLimits` per device ID and `capabilities.timeControl`

All resources are `@Authenticated`, scoped with `CurrentRouter` and validated in `RequestValidation`. "bis morgen früh" is computed by the frontend as the next 07:00 in the router's time zone (`Intl.DateTimeFormat`) and sent as an instant, so the API only knows instants.

### D10: Presets lose their time role
Presets keep their columns (`time_limit_minutes`, `blocked_from`, `blocked_until`) but the frontend no longer offers or copies them. A preset is about content filtering and priority; mixing a second, unenforced time model into it would contradict "one effective rule per device".

## Risks / Trade-offs

### D11: Compatible daily-rule bridge before the reusable-schedule redesign

Cloud packaging exception (approved 22 November): production still runs the
pre-ownership backend, so its release uses the reproducible selection in
`deploy/leocloud/prepare-time-release.mjs` and the narrowly scoped compatibility
patch. Only time endpoints use the configured shared router; the main branch
implementation retains CurrentRouter ownership. Existing Cloud login and DNS
control code are preserved. Ownership rollout remains a separate change.
Time retries use a Vert.x timer dispatching to a worker, independent of the
globally disabled scheduler; the timer is cancelled on shutdown.

For the user's backend-connection request on 22 November, retain the deployed
`DeviceTimeLimit` API and frontend. D8-D10 and the shared-event portion of D6 are
the later Phase B design, not requirements to break the current app immediately.

The bridge adds `router_enforcement` default false and `time_control_state` via
`20261122_time_control_bridge.sql`. Existing rows and usage history remain intact;
only a successful explicit PUT opts a rule into enforcement. Preset assignment
keeps its existing time-rule PUT, without client counters. Only own devices with
`data_source=ROUTER` enter the wire payload. Active daily windows map to all seven
weekdays; API budget zero maps to an omitted budget. Europe/Vienna and OPEN are
fixed until router timezone settings are implemented.

`TimeControlChanged` is a separate AFTER_SUCCESS event, so saving/pause/delete
does not resend or alter DNS state. A router-row lock serialises writes and desired
version preparation. Preparing within the save transaction invalidates an old ACK
before the response returns; publication happens only after commit. Startup and
60-second retries publish only routers that already have a time-control state.

Reports do not refresh router presence. Future timestamps beyond five seconds,
older reports and lower versions at equal timestamps are ignored. Confirmation
requires online presence, a report no older than 180 seconds, matching desired
content/version, no error and matching device keys. `timeApplied` confirms the
whole set, including removal; per-device usage requires a synchronised clock.
`timeError` is independent of the DNS error field. UI polls every five seconds,
preserving expanded details and keyboard focus, and never infers a live block
from browser time or database usage counters.

Phase A rollout: backup, additive bridge migration, backend, frontend, then
explicitly save one approved test-device rule and verify the physical result.
No broker ACL change is needed. Rollback is not simply clearing retention: the
agent also persists its desired rules. First pause/delete rules with the new
backend and obtain an empty-rule ACK while online, then restore old app/backend
images; keep additive columns/tables. If the router is unreachable, keep the new
control path available and report pending removal rather than claim unblocking.

### General risks

- [iPhones and Android use a private MAC per WLAN; "Netzwerk ignorieren" creates a new one] → The device appears as a new device without schedules. Documented as known limitation; the page shows schedules per device so the owner can reassign.
- [Threshold too low counts background traffic, too high misses light use] → Constant in the agent, calibrated on the Cudy with an idle and an active phone before release; the hardware acceptance records the chosen value.
- [Flash wear from usage files] → Write at most every 5 minutes and only when a value changed; `writeIfChanged` already writes atomically.
- [`fw4 reload` resets counters and set elements] → Time updates use their own nft transaction, preserving DNS objects. Reconcile after a DNS reload and handle counter resets; covered by Go and isolated real-nft tests.
- [Binary grows by ~450 KB through embedded tzdata] → Acceptable on the WR3000S (flash and RAM headroom noted in the project context).
- [Agent down → no blocks change] → Existing init script respawns the agent; the last applied set elements stay in nft until the next reload, so a crash does not lift an active block.
- [A child pulls the plug to bypass the night window] → With `OPEN` the gap lasts until NTP answers (seconds with internet). Parents who want no gap switch to `BLOCK`.
- [Backend publishes on every `RouterControlChanged`, now for two topics] → Content comparison keeps versions stable; the work is a few queries per router.

## Migration Plan

1. Back up the database (as for `20261116_router_control.sql`).
2. Run the new additive script `Backend/Nethera/migrations/20261120_time_schedules.sql`: create the new tables, add the two `config` columns with defaults, copy `device_time_limit` rows into schedules/assignments (D8, spec "Existing time limits are migrated"). The script is idempotent (`IF NOT EXISTS`, skips devices that already have a migrated schedule).
3. Deploy the backend. It publishes `config/time` at startup; old agents ignore the topic.
4. Deploy the new agent with `scripts/router-deploy.sh` and verify on the Cudy (hardware acceptance below).
5. Deploy the frontend.

Rollback: redeploy the previous backend, frontend and agent. The new tables and columns stay unused; `device_time_limit` was not modified. The retained `config/time` message can be cleared with an empty retained publish; the old agent never subscribes to it. Removing `91-nethera-time.nft` and running `fw4 reload` lifts all time blocks.

Hardware acceptance on the Cudy (like #23/#25, recorded in `deploy/leocloud/README.md`):
- window across midnight, weekday boundary (Sunday night not blocked)
- budget reached, reset at midnight, reboot during the day
- "Jetzt offline" / "Jetzt freigeben" with duration and expiry
- power cut at night with `OPEN` and with `BLOCK`, broker unreachable
- printer/Chromecast reachable while blocked; schedule deleted during an active block
- threshold calibration (idle vs. active phone)

## Open Questions

- Exact `usageThresholdBytes`: starts at 20 KB per minute, final value after calibration on the Cudy.
- Should the Internetzeiten page also show yesterday's usage? Not part of this change; the report only contains today.
