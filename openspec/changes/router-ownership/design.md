## Context

Authentication works (Keycloak, `@Authenticated`, `Account` auto-provisioned by `sub`), but authorization does not exist. Every resource queries `findAll`; `SecurityStateResource.saveBlocklist` defaults `routerId` to `1`; `Config`, `DeviceGroup` and `SecurityPreset` have no router at all. Telemetry already supports several routers (MQTT topic `nethera/<routerId>/...`, `nethera.router.id` for SSH), so the data side is multi-router while the user side is not.

Ownership chain today vs. target:

```
today:   JWT ──▶ Account            Router 1 ◀── everyone
target:  JWT ──▶ Account ◀──owner── Router ──▶ devices ──▶ members / assignments / time limits
                                       ├──▶ blocklists, groups, presets
                                       └──▶ config
```

## Goals / Non-Goals

**Goals:**
- One router per account, one owner per router
- Router identity is derived server-side for every user-facing endpoint; the browser never chooses a router ID
- A user can claim a router without database access
- Cross-account access to IDs returns 404 (no information leak about other routers)

**Non-Goals:**
- Several routers per account or shared routers (household members) — the schema keeps that path open, nothing more
- Admin role / admin UI for assigning routers
- `api/connections` (no documented semantics yet, see router-control contract) and `api/settings` (per-user, not per-router; separate change)
- Changes to telemetry ingestion, SSH sync or MQTT
- Router-side effects of rules (that is `router-control-status` and later work)

## Decisions

### D1: Owner FK lives on `router` (`owner_account_id UNIQUE NULL`)
`@OneToOne Account owner` on `Router`. The unique constraint enforces "one router per account"; nullable means unclaimed routers exist (telemetry may arrive before anyone claims).
*Alternative*: `router_id` on `account`. Rejected: `Account` was deliberately reduced to identity data in `user-management`, and putting the FK on the router keeps a later move to a join table (multi-router) local to the router side.

### D2: Claim via pairing code
`Router.pairingCode` (unique, nullable). `POST /api/routers/claim {"pairingCode": "..."}`:
- unknown code → 404
- router owned by another account → 409
- caller already owns a different router → 409
- caller already owns this router → 200 (idempotent)

At startup a bean sets the pairing code of router `nethera.router.id` from `nethera.router.pairing-code` if the property is set. Codes are compared case-insensitively after trimming.
*Alternatives*: auto-assign the first unowned router to the first account (insecure as soon as registration is open, see `user-management` 4.1); assign by email via config (works for `demo` but not for self-registered users and couples config to identities). The pairing code is also what a real product would print on the device.

`DELETE /api/routers/mine` releases ownership (204, or 404 if none). Needed for testing and for moving a router to another account. Rules stay attached to the router.

### D3: `CurrentRouter` request-scoped service
```java
@RequestScoped class CurrentRouter {
  Account account();          // provisions if needed (shared with /me)
  Optional<Router> router();
  Router require();           // NotFoundException("Noch kein Router verbunden")
  ConnectedDevice device(Long id);   // 404 unless device.router == require()
  <T> T owned(Class<T> type, Long id); // for BlockList, DeviceGroup, SecurityPreset, Config
}
```
Provisioning moves from `AccountsResource` into `AccountService` so `/me` and `CurrentRouter` share one code path.
*Alternative*: a JAX-RS filter that sets a router ID on the request. Rejected: the service is easier to test and the resources still need typed lookups.

### D4: Scope through the device where possible
Only tables without a device relation get a new `router_id`: `device_group`, `security_preset`, `config` (`blocklists.router_id` already exists). Members, preset assignments and time limits are filtered by `deviceId IN (devices of my router)`. Group membership additionally requires group and device to belong to the same router.
*Alternative*: `router_id` on every table. Rejected: duplicated data that can disagree with the device's router.

### D5: Reads return empty, not 404, when no router is claimed
`GET /api/routers/list` returns `[]`, which the frontend already shows as "Noch kein Router verbunden". `security/state`, `configs/list`, `devices`, `device-time-limits` return empty collections. Writes return 404 "Noch kein Router verbunden". This keeps the existing frontend working for new users without changes.

### D6: Cross-router IDs → 404, never 403
Lookups use `CurrentRouter.owned(...)` / `device(...)`, which treat "exists but belongs to someone else" the same as "does not exist".

### D7: One `Config` per router
`config.router_id` unique. `GET /api/configs/list` keeps its list shape (0 or 1 item) so the frontend does not change; `PUT /api/configs/{id}` checks ownership.

## Risks / Trade-offs

- [Existing tests assume global data] → test profile seeds router 1 with a known pairing code; a shared test helper claims it for the test user before each class
- [Demo user must claim after every `drop-and-create`] → set `nethera.router.pairing-code` in the dev profile and Compose, and document it next to the `demo` login in `Backend/Nethera/README.md`
- [Pairing code in config/README is not secret] → acceptable for a single school router; codes for real devices would be generated per device
- [LeoCloud deployment shows no data until someone claims] → rollout step in tasks; claiming is one request from the account page
- [Unowned router still receives telemetry] → intended; data appears once claimed

## Migration Plan

Only the test profile and `quarkus:dev` use `drop-and-create`. LeoCloud runs `validate` and the Compose stack runs `update`, so `migrations/20261116_router_ownership.sql` (additive, idempotent) is applied before deploying. It adds the columns and attaches existing groups, presets and the first config to the oldest router; without that backfill those rows would be invisible to every account.

Rollout: back up the database, run the migration, deploy backend and frontend together (the frontend `routerId` removal is harmless against the old backend), set `NETHERA_ROUTER_PAIRING_CODE`, then log in as `demo` and claim the router. Rollback: redeploy the previous images; the new columns are ignored by the old code.

## Open Questions

- Should releasing a router also delete its rules, or keep them for the next owner? (Current decision: keep.)
- Does LeoCloud need a different pairing code than local dev? (Probably yes, via a secret/env var `NETHERA_ROUTER_PAIRING_CODE`.)
