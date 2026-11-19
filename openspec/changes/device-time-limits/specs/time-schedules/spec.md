## ADDED Requirements

### Requirement: Reusable schedules per router
The system SHALL store schedules per router. A schedule SHALL have a name, a list of blocked windows and a list of daily budgets. A window SHALL consist of one or more weekdays (`MO`, `TU`, `WE`, `TH`, `FR`, `SA`, `SU`), a start time `from` and an end time `until` in `HH:mm`. A budget SHALL consist of one or more weekdays and a number of minutes between 0 and 1440. A schedule SHALL be usable by any number of assignments.

#### Scenario: Create a schedule
- **WHEN** a router owner posts `{"name": "Lernzeit", "windows": [{"weekdays": ["MO","TU","WE","TH","FR"], "from": "14:00", "until": "16:00"}], "budgets": []}` to `POST /api/schedules`
- **THEN** the system stores the schedule for the caller's router and returns it with its ID and HTTP 201

#### Scenario: Schedule with budget per weekday
- **WHEN** a schedule has the budgets `{"weekdays": ["MO","TU","WE","TH","FR"], "minutes": 120}` and `{"weekdays": ["SA","SU"], "minutes": 240}`
- **THEN** the schedule allows 120 minutes on weekdays and 240 minutes on weekends

#### Scenario: Update and delete
- **WHEN** the owner calls `PUT /api/schedules/{id}` with a changed window, or `DELETE /api/schedules/{id}`
- **THEN** the system replaces the schedule's windows and budgets, or deletes the schedule together with all its assignments

### Requirement: Schedule input is validated
The system SHALL reject a schedule with HTTP 400 when the name is blank or longer than 60 characters, when it has neither a window nor a budget, when it has more than 20 windows, when a window has no weekday, an unknown weekday, a time not in `HH:mm` or the same `from` and `until`, when a budget is outside 0–1440 minutes, or when a weekday appears in more than one budget of the same schedule.

#### Scenario: Window with equal start and end
- **WHEN** a window has `"from": "08:00"` and `"until": "08:00"`
- **THEN** the system returns HTTP 400 and stores nothing

#### Scenario: Weekday in two budgets
- **WHEN** a schedule has the budgets `{"weekdays": ["MO"], "minutes": 60}` and `{"weekdays": ["MO","TU"], "minutes": 90}`
- **THEN** the system returns HTTP 400

### Requirement: Assign schedules to devices and groups
The system SHALL provide `POST /api/schedule-assignments` with `{"scheduleId", "targetType": "DEVICE" | "GROUP", "targetId", "status": "active" | "paused"}`, `PUT /api/schedule-assignments/{id}` to change the status and `DELETE /api/schedule-assignments/{id}`. The same schedule SHALL be assigned to the same target at most once. A paused assignment SHALL have no effect.

#### Scenario: Assign to a group
- **WHEN** the owner assigns schedule "Nachtruhe" to group "Kinder"
- **THEN** every device that is a member of "Kinder" is subject to "Nachtruhe", including devices added to the group later

#### Scenario: Duplicate assignment
- **WHEN** the owner assigns a schedule to a target that already has this schedule
- **THEN** the system returns HTTP 409

#### Scenario: Pause an assignment
- **WHEN** the owner sets an assignment to `paused`
- **THEN** the assignment is kept but no longer affects the target

#### Scenario: Group deleted
- **WHEN** a device group is deleted
- **THEN** its schedule assignments and its instant action are deleted as well

### Requirement: Instant block and allow
The system SHALL provide `PUT /api/time-overrides/{targetType}/{targetId}` with `{"mode": "BLOCK" | "ALLOW", "until": <ISO-8601 instant or null>}` and `DELETE /api/time-overrides/{targetType}/{targetId}`. A target SHALL have at most one override; a new one replaces the old one. `until: null` SHALL mean "until switched off". An `until` that is not in the future SHALL be rejected with HTTP 400. An expired override SHALL have no effect.

#### Scenario: Jetzt offline for one hour
- **WHEN** the owner puts `{"mode": "BLOCK", "until": "<now + 1h>"}` for device 12
- **THEN** device 12 has no internet access for one hour, regardless of its schedules

#### Scenario: Jetzt freigeben until switched off
- **WHEN** the owner puts `{"mode": "ALLOW", "until": null}` for group "Kinder"
- **THEN** windows and budgets do not block the group's devices until the override is deleted

### Requirement: Router time settings
The router settings (`PUT /api/configs/{id}`) SHALL include `timezone` (an IANA time zone, default `Europe/Vienna`) and `timeLimitsUntilClockSync` (`OPEN` or `BLOCK`, default `OPEN`). An unknown time zone or value SHALL be rejected with HTTP 400. The settings page SHALL offer both, with `timeLimitsUntilClockSync` shown as the switch "Zeitpläne nach Neustart sofort durchsetzen".

#### Scenario: Default settings
- **WHEN** a router has never changed these settings
- **THEN** its time zone is `Europe/Vienna` and `timeLimitsUntilClockSync` is `OPEN`

#### Scenario: Invalid time zone
- **WHEN** the owner saves `"timezone": "Mars/Olympus"`
- **THEN** the system returns HTTP 400

### Requirement: Effective rule per device
For each device of a router the system SHALL combine all active assignments of the device and of every group the device belongs to, and all non-expired overrides of the device and of these groups, into one effective rule:
1. If any applicable override has mode `BLOCK`, the device SHALL be blocked (reason `manual`).
2. Otherwise, if any applicable override has mode `ALLOW`, the device SHALL NOT be blocked by windows or budgets.
3. Otherwise the device SHALL be blocked during every window of every applicable schedule (reason `window`).
4. Otherwise, when a budget exists for the current weekday, the device SHALL be blocked once its used minutes reach the smallest applicable budget of that weekday (reason `budget`).

#### Scenario: Two schedules on one device
- **WHEN** a device gets "Nachtruhe" (21:00–07:00) directly and "Lernzeit" (14:00–16:00) through its group
- **THEN** the device is blocked from 14:00 to 16:00 and from 21:00 to 07:00

#### Scenario: Smallest budget wins
- **WHEN** a device's group schedule allows 120 minutes on Monday and its own schedule allows 60 minutes on Monday
- **THEN** the device is blocked on Monday after 60 used minutes

#### Scenario: Block beats allow
- **WHEN** a device has an `ALLOW` override and its group has a `BLOCK` override
- **THEN** the device is blocked

### Requirement: A window belongs to the weekday it starts on
A window whose `until` is earlier than its `from` SHALL run from `from` on each selected weekday to `until` on the following day. Weekdays SHALL refer to the router's configured time zone.

#### Scenario: Friday night
- **WHEN** a window has weekdays `MO`–`FR`, `from` 21:00 and `until` 07:00
- **THEN** the device is blocked from Friday 21:00 to Saturday 07:00

#### Scenario: Sunday night not selected
- **WHEN** the same window is evaluated on Monday at 02:00
- **THEN** the device is not blocked by this window, because no window started on Sunday

### Requirement: Only scheduled data of the caller's router
All endpoints of this capability SHALL be authenticated and SHALL act only on the caller's router (`router-ownership`). Schedule, assignment, device and group IDs of another router SHALL be treated as not found (HTTP 404). `GET /api/schedules` and `GET /api/security/state` SHALL return the caller's schedules, assignments and active overrides; `GET /api/security/state` SHALL no longer contain `timeLimits`.

#### Scenario: Foreign group
- **WHEN** the owner of router 1 assigns a schedule to a group of router 2
- **THEN** the system returns HTTP 404 and stores nothing

### Requirement: Clients cannot report usage
The API SHALL NOT accept used minutes from clients. Used minutes SHALL only come from the router (`time-limit-status`).

#### Scenario: Old field sent
- **WHEN** a client sends `usedMinutesToday` in any request of this capability
- **THEN** the field is ignored

### Requirement: Existing time limits are migrated
Each existing `device_time_limit` row SHALL become one schedule named after the device, with one window on all weekdays from `blocked_from` to `blocked_until` (if both are set and differ), one budget on all weekdays with `daily_limit_minutes` (if greater than 0), and one assignment to the device with the old status. Rows without a window and without a budget SHALL be skipped.

#### Scenario: Migrated night rule
- **WHEN** device 12 had `blocked_from` 21:00, `blocked_until` 07:00, `daily_limit_minutes` 120 and status `paused`
- **THEN** after migration a schedule with that window on all weekdays and a 120-minute budget exists, assigned to device 12 with status `paused`

### Requirement: Presets no longer create time limits
Applying a preset SHALL NOT create or change schedules, assignments or overrides. The preset fields `blockedFrom`, `blockedUntil` and `timeLimitMinutes` SHALL no longer be offered in the frontend.

#### Scenario: Apply a preset with old time fields
- **WHEN** a preset that still has `blockedFrom` 21:00 is applied to a device
- **THEN** the device's schedules are unchanged

### Requirement: Internetzeiten page
The page "Internetzeiten" SHALL let the owner create, edit and delete schedules with a weekday/time editor and a weekly preview, assign schedules to devices and groups, pause assignments, and trigger "Jetzt offline" and "Jetzt freigeben" for a device or group with the durations "1 Stunde", "bis morgen früh" (next 07:00 in the router's time zone) and "bis ich es wieder einschalte". The presets "Nachtruhe" (21:00–07:00, every day) and "Lernzeit" (14:00–16:00, Monday to Friday) SHALL prefill the editor. All texts SHALL be German and avoid technical terms.

#### Scenario: Create from preset
- **WHEN** the owner clicks "Nachtruhe" and saves
- **THEN** a schedule with one window from 21:00 to 07:00 on all weekdays is created

#### Scenario: Group offline from the page
- **WHEN** the owner selects group "Kinder" and clicks "Jetzt offline" with "1 Stunde"
- **THEN** the page sends one `BLOCK` override for the group with `until` one hour from now
