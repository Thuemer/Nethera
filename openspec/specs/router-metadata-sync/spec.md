## ADDED Requirements

### Requirement: Update router metadata from ubus on every sync
The system SHALL run `ubus call system board` on the router via SSH and update the `router` entity with the returned `model` and `release.description` (used as firmware string), set `isOnline = true`, and set `lastSeen = now()`.

#### Scenario: Successful metadata fetch
- **WHEN** the router is reachable and `ubus call system board` returns valid JSON
- **THEN** `router.model`, `router.firmware`, `router.isOnline`, and `router.lastSeen` are updated in the database within the same sync transaction

#### Scenario: Router unreachable
- **WHEN** the SSH connection to the router fails
- **THEN** `router.isOnline` is set to `false` and `router.lastSeen` is left unchanged, and no other fields are modified
