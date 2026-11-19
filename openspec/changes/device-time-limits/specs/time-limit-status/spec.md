## ADDED Requirements

### Requirement: Agent reports the time state
The agent SHALL publish a retained message on `nethera/<routerId>/telemetry/time` after handling a `config/time` message and whenever a device's blocked state, reason or used minutes change, at most once per minute for usage changes. The message SHALL contain `v`, the router clock `ts`, the handled `version`, `applied`, `clockSynced`, an optional `error`, and per MAC address `usedMinutes`, `budgetMinutes` (today, or null), `blocked` and `reason` (`manual`, `window`, `budget`, `clock` or null).

#### Scenario: Message applied
- **WHEN** the agent applies version 1700000000123 without error
- **THEN** it publishes `applied: true` and `version: 1700000000123`

#### Scenario: Message refused
- **WHEN** the agent refuses a message
- **THEN** it publishes `applied: false` with the error and keeps reporting the previous rules' device state

### Requirement: Backend stores the latest report
The backend SHALL store the latest time report per router, including the router's timestamp, and SHALL compare its `version` with the latest published desired version. A report with an older router timestamp than the stored one SHALL be ignored.

#### Scenario: Retained old report after backend restart
- **WHEN** the backend restarts and receives a retained report for an older version
- **THEN** the time rules of that router are shown as not applied until a report for the current version arrives

### Requirement: Status endpoint exposes time limits per device
`GET /api/router-control/status` SHALL fill `timeLimits` for each device of the caller's router that has an effective rule, keyed by device ID, with `applied`, and — only when the router connection is `online`, the current version is confirmed and the device appears in the report — `blockedNow`, `reason`, `usedMinutesToday` and `budgetMinutesToday`. `applied` SHALL be true only when the router confirmed the current desired version without error. `capabilities.timeControl` SHALL be false in SSH telemetry mode.

#### Scenario: Confirmed block
- **WHEN** the router is online, confirmed the current version and reports device 12 as blocked by a window
- **THEN** `timeLimits["12"]` is `{"applied": true, "blockedNow": true, "reason": "window", "usedMinutesToday": 35, "budgetMinutesToday": 120}`

#### Scenario: Router offline
- **WHEN** the router connection is `offline`
- **THEN** `timeLimits["12"]` contains `applied` only, without `blockedNow` or usage

#### Scenario: Pending change
- **WHEN** a schedule was changed and the router has not confirmed the new version yet
- **THEN** `applied` is false for every affected device

### Requirement: Frontend shows only confirmed effects
The Internetzeiten page, the topology and the security page SHALL show a device as blocked, its reason and its used minutes only from `GET /api/router-control/status`. Until the router confirms, saved rules SHALL be marked "Nur gespeichert". Without router connection the page SHALL show "Router nicht verbunden" and keep the saved rules visible. Reasons SHALL be shown in plain German ("Sperrzeit", "Tageslimit erreicht", "Manuell offline", "Uhrzeit noch unbekannt").

#### Scenario: Budget bar
- **WHEN** the status reports `usedMinutesToday` 90 and `budgetMinutesToday` 120 for a device
- **THEN** the page shows "1 h 30 min von 2 h" for that device

#### Scenario: No confirmation endpoint
- **WHEN** `GET /api/router-control/status` returns 404 or 501
- **THEN** the page shows "Routerbestätigung noch nicht verfügbar" and no blocked state
