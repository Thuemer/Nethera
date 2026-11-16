## Why

Every authenticated user currently sees and edits every router, device, rule and configuration in the database: `Account` has no relation to `Router`, read endpoints return `findAll`, and the frontend writes `routerId: 1` into new blocklists, which the backend trusts. Before any router control can be built (`router-control-status`, issues #23–#27), the backend has to know which router belongs to the logged-in user and derive it server-side.

## What Changes

- `Router` gets an owner: a nullable, unique relation to `Account`, so each account owns at most one router and each router has at most one owner
- `Router` gets a `pairing_code` (unique, nullable), used once to claim an unowned router; the SSH router's code comes from `nethera.router.pairing-code`
- New endpoints `POST /api/routers/claim` (claim by pairing code) and `DELETE /api/routers/mine` (release own router)
- New request-scoped `CurrentRouter` service: JWT → `Account` (existing provisioning) → owned `Router`
- **BREAKING** — `GET /api/routers/list` returns only the caller's router (empty list if none)
- **BREAKING** — `GET /api/devices`, `GET /api/security/state`, `GET /api/configs/list` and `GET /api/device-time-limits` return only data of the caller's router
- **BREAKING** — All write endpoints under `api/security`, `api/configs` and `api/device-time-limits` reject IDs that do not belong to the caller's router with HTTP 404; `BlocklistDto.routerId` from the request body is ignored
- `DeviceGroup`, `SecurityPreset` and `Config` get a `router_id` column so they can be scoped (blocklists already have one; devices, members, assignments and time limits are scoped through the device)
- Account page gets a minimal "Router verbinden" form that calls the claim endpoint
- Telemetry ingestion (SSH sync, MQTT) is unchanged: it is keyed by router ID, not by user

## Capabilities

### New Capabilities

- `router-ownership`: An account owns at most one router, claimed with a pairing code. All user-facing router data is resolved from the logged-in account and isolated from other accounts.

### Modified Capabilities

<!-- none — existing specs cover telemetry sync and Keycloak setup, whose requirements do not change -->

## Impact

- **Depends on** `user-management` (`AccountsRepository.findBySub` / `provision` already exist in code)
- **Model**: `Router` (`owner`, `pairingCode`), `DeviceGroup`, `SecurityPreset`, `Config` (`routerId`)
- **New**: `services/CurrentRouter`, `services/AccountService` (provisioning moved out of `AccountsResource`)
- **Boundary**: `RoutersResource`, `ConnectedDevicesResource`, `SecurityStateResource`, `ConfigsResource`, `DeviceTimeLimitsResource`, `AccountsResource`
- **Repositories**: `RoutersRepository`, `ConnectedDevicesRepository`, `ConfigsRepository`, `DeviceTimeLimitsRepository`
- **Seed data**: `import.sql` / `import_extended.sql` get `router_id` values for groups, presets and configs
- **Frontend**: `account.js` (claim form), `security.js` (stop sending `routerId`)
- **Tests**: new `RouterOwnershipIT`; `ApiAuthenticationIT` and `BackendFixesIT` need a claimed router for the test user
- **Not touched**: `api/connections` and `api/settings` (see design non-goals)
