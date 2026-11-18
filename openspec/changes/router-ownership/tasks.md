## 1. Model

- [x] 1.1 `Router`: add `@OneToOne Account owner` (`owner_account_id`, unique, nullable) and `pairingCode` (`pairing_code`, unique, nullable) with getters/setters; add named queries `Router.findByOwner` and `Router.findByPairingCode`
- [x] 1.2 Add `routerId` (`router_id`) to `DeviceGroup`, `SecurityPreset` and `Config` (unique on `Config`); update their `QUERY_FIND_ALL` queries or add `findByRouter` variants
- [x] 1.3 Update `import_extended.sql` (the active load script) so seeded groups and presets reference router 1 (no config row is seeded)
- [x] 1.4 Add `migrations/20261116_router_ownership.sql` for databases that are not recreated (LeoCloud runs `validate`, Compose runs `update`): add columns, attach existing groups/presets/config to the oldest router

## 2. Current-router resolution

- [x] 2.1 Create `services/AccountService` with `current()` (JWT `sub`/`email` → `findBySub` or `provision`), moving the logic out of `AccountsResource.getCurrentAccount`; `/me` uses it
- [x] 2.2 Create `@RequestScoped services/CurrentRouter` with `account()`, `router()`, `require()`, `device(Long)` and `owned(Class, Long)` as in design D3
- [x] 2.3 Startup bean: if `nethera.router.pairing-code` is set, write it (trimmed, upper-case) to router `nethera.router.id`; add the property to the dev and test profiles in `application.properties` and `NETHERA_ROUTER_PAIRING_CODE` to the Compose backend

## 3. Claim and release

- [x] 3.1 `POST /api/routers/claim` with record `ClaimDto(String pairingCode)`: 400 / 404 / 409 / 200 rules from the spec
- [x] 3.2 `DELETE /api/routers/mine`: 204 or 404
- [x] 3.3 Extract the router → `RouterDto` mapping in `RoutersResource` into a method so `claim` returns the same shape as `list`

## 4. Scope reads

- [x] 4.1 `GET /api/routers/list`: return `[]` or the caller's router only
- [x] 4.2 `GET /api/devices`: devices of the caller's router (repository method `findByRouter`)
- [x] 4.3 `GET /api/security/state`: filter devices, groups, blocklists and presets by router; members, assignments and time limits by the router's device IDs
- [x] 4.4 `GET /api/configs/list` and `GET /api/device-time-limits`: filter by router
- [x] 4.5 Return empty results when the caller has no router (design D5)

## 5. Scope writes

- [x] 5.1 `SecurityStateResource`: groups, members, blocklists, presets and preset assignments use `CurrentRouter.owned/device`; new entities get the caller's router ID; ignore `BlocklistDto.routerId`
- [x] 5.2 Membership: require group and device to belong to the same (caller's) router
- [x] 5.3 `ConfigsResource.save` and `DeviceTimeLimitsResource.save/delete`: ownership check through `CurrentRouter`
- [x] 5.4 Add `@Authenticated` to `ConfigsResource`, `ConnectionsResource`, `DeviceTimeLimitsResource` and `SecurityStateResource` explicitly (matches project convention; `ApiAuthenticationIT` stays green)

## 6. Frontend

- [x] 6.1 `security.js`: stop sending `routerId: 1` for new blocklists
- [x] 6.2 `account.js`: add "Router verbinden" form (pairing code input + button) shown when `NetheraApi.getRouters()` returns no router; show router name otherwise; German error texts for 404 ("Code unbekannt") and 409 ("Router ist bereits verbunden")
- [x] 6.3 `account.js`: add `loadOwnRouter()` / `claimRouter(code)` using the page's own authenticated `apiFetch` (account.js does not load `api.js`)

## 7. Tests

- [x] 7.1 Test helper that claims router 1 for the test user; use it in `ApiAuthenticationIT`, `BackendFixesIT` and `RouterDataSourceIT`
- [x] 7.2 `RouterOwnershipIT`: claim success, idempotent claim, unknown code, owned by other account, caller already owns another router, blank code, release
- [x] 7.3 `RouterOwnershipIT`: two routers with data, two users — each sees only their own data in all read endpoints
- [x] 7.4 `RouterOwnershipIT`: foreign IDs on every write endpoint return 404; `routerId` in blocklist body ignored; cross-router membership rejected
- [x] 7.5 Frontend test in `Applikation/tests/` for the claim form states (no router, success, 404, 409)
- [x] 7.6 Run `./mvnw verify -DskipITs=false` and `node --test Applikation/tests/*.cjs` and confirm both pass

## 8. Rollout

- [x] 8.1 Document the pairing code next to the `demo` login in `Backend/Nethera/README.md`
- [ ] 8.2 Set `NETHERA_ROUTER_PAIRING_CODE` for the LeoCloud backend (follow the leocloud skill), deploy backend and frontend, log in as `demo`, claim the router and confirm the dashboard shows data again
