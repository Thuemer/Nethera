## ADDED Requirements

### Requirement: An account owns at most one router
The system SHALL store an optional owner `Account` on each `Router`. An account SHALL own at most one router and a router SHALL have at most one owner.

#### Scenario: Router without owner
- **WHEN** a router row is created by seed data or telemetry
- **THEN** its owner is empty until an account claims it

#### Scenario: Uniqueness enforced by the database
- **WHEN** two routers would be assigned the same owner account
- **THEN** the database rejects the second assignment

### Requirement: Claim a router with a pairing code
The system SHALL provide `POST /api/routers/claim` with body `{"pairingCode": "<code>"}` for authenticated users. The code SHALL be compared after trimming and case-insensitively. On success the caller's account becomes the router's owner and the response is the router as returned by `GET /api/routers/list`.

#### Scenario: Successful claim
- **WHEN** an authenticated user without a router posts the pairing code of an unowned router
- **THEN** the router's owner is set to the caller's account and the system returns HTTP 200

#### Scenario: Claim is idempotent
- **WHEN** the owner of a router posts that router's pairing code again
- **THEN** the system returns HTTP 200 and ownership is unchanged

#### Scenario: Unknown code
- **WHEN** an authenticated user posts a pairing code that matches no router
- **THEN** the system returns HTTP 404

#### Scenario: Router owned by someone else
- **WHEN** an authenticated user posts the pairing code of a router owned by a different account
- **THEN** the system returns HTTP 409 and ownership is unchanged

#### Scenario: Caller already owns another router
- **WHEN** an authenticated user who owns router A posts the pairing code of unowned router B
- **THEN** the system returns HTTP 409 and neither router changes owner

#### Scenario: Missing or blank code
- **WHEN** the request body is missing or `pairingCode` is blank
- **THEN** the system returns HTTP 400

### Requirement: Pairing code of the SSH router is configurable
When `nethera.router.pairing-code` is set, the system SHALL set it as the pairing code of the router identified by `nethera.router.id` at startup.

#### Scenario: Configured code is claimable
- **WHEN** the backend starts with `nethera.router.pairing-code=NETHERA-DEMO` and `nethera.router.id=1`
- **THEN** posting `nethera-demo` to `POST /api/routers/claim` claims router 1

### Requirement: Release own router
The system SHALL provide `DELETE /api/routers/mine`, which removes the caller as owner of their router. Rules and telemetry of the router SHALL be kept.

#### Scenario: Release
- **WHEN** a router owner calls `DELETE /api/routers/mine`
- **THEN** the router has no owner and the system returns HTTP 204

#### Scenario: Nothing to release
- **WHEN** a user without a router calls `DELETE /api/routers/mine`
- **THEN** the system returns HTTP 404

### Requirement: Reads return only the caller's router data
`GET /api/routers/list`, `GET /api/devices`, `GET /api/security/state`, `GET /api/configs/list` and `GET /api/device-time-limits` SHALL return only data belonging to the router owned by the caller. Data belongs to a router if it references the router directly (blocklists, groups, presets, config, devices) or through a device of that router (group members, preset assignments, time limits).

#### Scenario: Owner sees own router
- **WHEN** the owner of router 1 calls `GET /api/routers/list`
- **THEN** the response contains exactly router 1

#### Scenario: Other routers are hidden
- **WHEN** router 1 and router 2 both have devices and rules, and the owner of router 1 calls `GET /api/security/state`
- **THEN** no device, group, member, blocklist, preset, assignment or time limit of router 2 is in the response

#### Scenario: User without router
- **WHEN** a user without a router calls any of these read endpoints
- **THEN** the system returns HTTP 200 with an empty list (or, for `security/state`, empty collections)

### Requirement: Writes are restricted to the caller's router
Write endpoints under `api/security`, `api/configs` and `api/device-time-limits` SHALL accept only IDs (device, group, blocklist, preset, config) that belong to the caller's router. IDs belonging to another router SHALL be treated as not found. New groups, presets and blocklists SHALL be assigned to the caller's router; a `routerId` in the request body SHALL be ignored.

#### Scenario: Foreign device ID
- **WHEN** the owner of router 1 calls `PUT /api/device-time-limits/{id}` with the ID of a device of router 2
- **THEN** the system returns HTTP 404 and no time limit is stored

#### Scenario: Foreign group
- **WHEN** the owner of router 1 calls `DELETE /api/security/groups/{id}` for a group of router 2
- **THEN** the system returns HTTP 404 and the group still exists

#### Scenario: Membership across routers
- **WHEN** the owner of router 1 calls `PUT /api/security/groups/{groupId}/members/{deviceId}` with their own group and a device of router 2
- **THEN** the system returns HTTP 404

#### Scenario: Router ID in body is ignored
- **WHEN** the owner of router 1 posts a new blocklist with `"routerId": 2`
- **THEN** the blocklist is stored with router 1

#### Scenario: Write without router
- **WHEN** a user without a router calls any of these write endpoints
- **THEN** the system returns HTTP 404 with message "Noch kein Router verbunden"

### Requirement: Account page offers router claiming
The account page SHALL show a "Router verbinden" form with a pairing-code field when the logged-in user has no router, and SHALL show the connected router's name otherwise.

#### Scenario: Claim from the UI
- **WHEN** a logged-in user without a router enters a valid pairing code and submits
- **THEN** the page calls `POST /api/routers/claim` and afterwards shows the router name

#### Scenario: Error shown
- **WHEN** the claim returns 404 or 409
- **THEN** the page shows a German error message and keeps the form
