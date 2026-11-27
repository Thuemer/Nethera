# Router verification, 22 November 2026

## Scope and source

- Branch: `feat/router-time-schedules`, separate worktree `Nethera-time-schedules`.
- Base: `origin/leocloud-deployment` at `f38f620`; re-fetched before and after work.
  No newer remote commits appeared during the final check. `origin/main` was
  `f64fe05`. No merge, commit or push was performed.
- Reuses Moritz's time-control implementation `b46710a`; no competing time model.
- Existing application/website, backend, cloud deployment, accounts, databases,
  router credentials and network settings were not modified.
- The original worktree's two existing dirty deployment files were left intact.

## Changes verified

- First-time windows work without a budget; named nft counters use valid syntax.
- Time updates use atomic, checked transactions for their own objects only.
  They do not reload all of fw4 or clear populated device DNS sets.
- Read/check/apply and persistence failures cannot produce `applied: true`.
  Failed enforcement is retried; older or reused conflicting versions are refused.
- Missing/null devices, unknown fields, oversized payloads and duplicate
  normalized keys are rejected rather than accidentally clearing rules.
- NTP, local-day restoration, midnight, repeated DST hours, budget transitions,
  counter resets and timer jitter have deterministic tests.
- A DNS-triggered fw4 reload requests a fresh time reconciliation without
  counting an extra usage minute. External resets are repaired next tick.
- Flow offloading is reported as unsupported without changing global settings.

## Automated checks

Final run: **79 passing cases including subtests**, race detector enabled. The
separate opt-in physical test is skipped in this run, as intended.

```sh
cd router/agent
docker build -f test.Dockerfile -t nethera-time27-tests:local .
docker run --rm --network none --cap-add NET_ADMIN \
  -e NETHERA_NFT_INTEGRATION=1 \
  -v "$PWD:/workspace:ro" -w /workspace \
  -v nethera-time27-go-mod:/go/pkg/mod \
  -v nethera-time27-go-build:/root/.cache/go-build \
  nethera-time27-tests:local go test -race -count=1 ./...
```

Go 1.27.2 matches `go.mod`. The disposable test image supplies nftables. The
module/build caches were populated before the network-isolated run.

The real-nft test uses an otherwise empty container network namespace, creates
its own fw4 table, and applies the actual #25 device-rule generator. IPv4 and
IPv6 sets keep their populated addresses and the DNS chain stays identical while
time windows/budgets are added, changed and removed. Existing AdBlocker, network
blocking and device-blocking unit tests also pass. This is not a browser/phone
test of every possible DNS-blocking scenario.

## Physical Cudy test

Device: Cudy WR3000S v1, OpenWrt 25.12.5, nftables 1.1.6. NTP synchronized,
no active flowtables. Initially installed agent: `ac29b02-dirty`, with no time
state or time firewall objects. Its MQTT connection was working.

The user authorized a separate iPhone as the test target and disabled cellular
data. The administration Mac was explicitly excluded. The opt-in hardware test:

1. Refused pre-existing time state and checked both DHCP leases.
2. Used a temporary nft include and usage path, with an independent 180-second
   cleanup watchdog. The old agent continued running throughout this test.
3. Applied a window without a daily budget. The user confirmed that a new Safari
   page stopped loading. The Mac still received HTTP 200 from LeoCloud.
4. Automatically released the iPhone at **21:31 CET**, without a Wi-Fi reconnect.
   The user confirmed the page loaded again with cellular data still off.
5. Read 3,268 rejected packets / 1,784,148 bytes, passed in 77.85 seconds, and
   removed its test chain/set. No persistent time-control file was created.

The hardware window test preceded the final timer-jitter budget fix; that later
fix is covered by the automated minute-ticker test, not a new physical budget test.

## Installed agent and preservation checks

After explicit approval, only the agent binary was replaced and its own
sysupgrade keep-list gained `91-nethera-time.nft`. The existing init script and
UCI configuration were retained. No packages were installed, no whole-router
reboot was performed and no cloud deployment was changed.

- Final binary version: `f38f620-time27-worktree-20261122-r2` (uncommitted worktree).
- SHA-256: `66c2551c769813c5850a7742e1973edce10d82516054b9162e99c0f6201c581d`.
- MQTT reconnected at 21:43:47 CET. The pre-install read-only dry run produced
  metadata, speed, DNS and devices. The ordinary collection interval stays 30 s.
- Seven file checksums are identical before and after: nethera, DHCP, firewall,
  adblock-fast configuration, saved DNS desired state, generated DNS include and
  the active AdBlocker domain list.
- All **85 existing firewall objects** compare equal after removing only volatile
  handles/counters/expiry values. No time objects remain without configured rules.
- Existing network block `tiktok.com` returns NXDOMAIN before and after.
- `accounts.doubleclick.net`, selected from the active AdBlocker list, returns
  NXDOMAIN before and after. Adblock-fast still reports **242,058 blocked domains**.
- Its pre-existing optional-package warning was not changed. The list does not
  block every possible ad-related hostname; `doubleclick.net` itself resolved
  before installation and was not used as a successful blocking check.
- There were no saved per-device DNS assignments on this Cudy during this check.
  Their regression coverage is the unit/real-nft tests above, not a claimed live
  test of a previously active per-device assignment.

Private backup `NetheraBackups/20261122-time27/router-before.tar.gz` contains the
original binary and configuration. It was verified readable (29 entries,
2,689,237 bytes), SHA-256
`e0db65ba9e674860801ee89f60db2260383724852393e7dd0962701b50be7db2`.
Backup and local test logs are outside Git and access-restricted. Restore only
the required agent/keep-list files during rollback, not the whole router config.

Temporary session SSH key removed by its exact key/comment, preserving other
authorized keys and the file's existing permissions. A subsequent connection
using only that key failed with `Permission denied`, confirming revocation.
Local private/public key files and the named remote test/staging files were
removed. The original agent backup remains only in the protected local archive.
Final source and built binary were also archived outside Git for reproducibility.

## Handoff after router-only implementation (earlier on 22 November)

**#27 is not complete end to end.** Tasks 5.1-5.7 are implemented (7/41). The
backend still needs the schedule model/migration/API, MAC/group desired-state
resolver, `config/time` publisher, `telemetry/time` ingestion and confirmed status.
The existing frontend `device-time-limits` save path does not send these rules.
No live schedules were left enabled as a substitute for that missing integration.

Use [the agent contract](../../../router/agent/README.md) and design D5 without
inventing a second schema. In particular, `block` and `allow` are separate fields,
timestamps are Unix seconds, empty `devices` clears rules and status requires a
matching desired version plus fresh online telemetry. A failed report's device
fields are not proof of enforcement.

Still open: backend/UI implementation and tests, full MQTT round trip, real idle
versus active usage-threshold calibration, physical budget exhaustion, midnight
and weekday boundaries, power-loss OPEN/BLOCK, explicit IPv6/client/LAN acceptance,
rule deletion during a block, and reviewed cloud rollout. Software boundary tests
do not replace these hardware acceptance tasks. No claim of 100% reliability.

## Phase A backend bridge (later on 22 November 2026)

Continued on `feat/router-time-schedules` in the existing worktree. Remote fetch
before work and again before completion found no newer commits; the branch base
and `origin/leocloud-deployment` are still `f38f620` (`origin/main`: `f64fe05`).
The separate presentation worktree and its two dirty deployment files were not
modified. No commit, push, cloud migration or deployment was performed here.

Implemented the compatibility phase described in design D11, not the entire
reusable-schedule redesign. The daily device editor now has a transactional
desired-state adapter, its own MQTT publisher, validated reports and fresh
version-specific confirmation. Pause/delete remove MAC rules; deletion has a
whole-set acknowledgement. Budget-only rules remain budget-only on reload.
Zero API budget stays unlimited; browser usage is ignored. Existing presets keep
their time assignment behavior without sending fabricated usage. Old stored rules
remain inactive until explicitly saved. No DNS publisher or agent change was
needed for this backend phase.

### Verified locally

- **142 backend tests, 0 failures/errors/skips** in isolated PostgreSQL 15 and
  Mosquitto containers, Java 21. Includes existing authentication/ownership,
  telemetry and DNS tests. The old `/hello` test now also uses disposable Postgres
  instead of implicitly trying a developer database on localhost:5432.
- `TimeControlIT`: real REST write -> database -> retained MQTT config -> synthetic
  router report -> REST status. Checks pending/confirmed/error/offline/stale/
  future/missing-MAC reports, usage, unsynchronised clock, invalid input, stable
  version on identical saves, pause, delete and unlimited-budget encoding.
  The retained DNS payload is exactly unchanged across these time writes.
- `TimeMigrationTest`: executes the actual additive SQL twice on a separate
  PostgreSQL schema; retains legacy rule contents, account sentinel, explicit
  activation and desired/applied versions. No production data was used.
- **122 JavaScript tests pass**; preset, security, topology and data-source
  regressions remain covered. Saved counters cannot produce a live usage bar.
- Playwright with all APIs intercepted: save, ACK, pause, delete, budget-only
  save/reload, focus/detail preservation, no uncaught errors. Viewports 1440, 768,
  390 and 320 px have no clipped controls/page overflow. Desktop/mobile screenshots
  inspected. Browser timezone America/New_York does not alter the Wien preview.
- Router `go test -race -count=1 ./...` passes again with nftables and NET_ADMIN
  inside a **network-isolated** container. The opt-in physical test is intentionally
  not run again; no connection to or modification of the Cudy in this phase.
- Production-profile backend package builds without the test OIDC override;
  OpenSpec strict validation and `git diff --check` pass.

Reproduce backend tests from `Backend/Nethera` (Docker Desktop required):

```sh
docker run --rm \
  -v "$PWD:/workspace" -v "$HOME/.m2:/root/.m2" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal \
  -w /workspace maven:3.9-eclipse-temurin-21 \
  mvn -q -Dquarkus.oidc.enabled=false '-Dtest=*Test,*IT,!ExampleResourceIT' test
docker run --rm -v "$PWD:/workspace" -v "$HOME/.m2:/root/.m2" \
  -w /workspace maven:3.9-eclipse-temurin-21 mvn -q -DskipTests package
```

OIDC is disabled **only for the JUnit test invocation**, which uses TestSecurity
and includes unauthenticated/foreign-router checks. The production package keeps
normal OIDC configuration. The packaged `/hello` smoke wrapper (`ExampleResourceIT`)
and an actual Keycloak login were not run; its underlying REST test was run.

Frontend: `node --test Applikation/tests/*.test.cjs`; serve the worktree using
`scripts/serve-local.py`, then run `Applikation/tests/time-control-browser.cjs`
with `NETHERA_TEST_URL` pointing to that local port and Playwright available.
Optional `NETHERA_BROWSER_PATH` selects an installed Chromium executable;
`NETHERA_SCREENSHOTS` selects an output directory. The browser test never writes
to a real backend. Screenshots alone are not physical router evidence.

### Before use on LeoCloud

1. Review this worktree and back up the database. Keep existing images/config.
2. Run `20261122_time_control_bridge.sql` **before** the new backend; keep schema
   generation non-destructive and do not re-import demo data.
3. Deploy backend and frontend only after approval. Existing broker ACL already
   permits `config/#` and `telemetry/#`; no new credentials are required.
4. Explicitly save one approved test-device window from the website, verify the
   fresh ACK plus physical block/release, then pause/delete and verify removal.
   Do not use the administrative Mac as the blocked test client.
5. Recheck network/device website blocking and AdBlocker against the running stack.

Do not clear only MQTT retention for rollback: the agent persists its rules.
First remove/pause the rules through the new control path and obtain the empty
set ACK, then restore previous application/backend images if needed. Leave the
additive schema intact. An unreachable router means removal is pending, not done.

Still open: deployment/physical website-to-router acceptance, usage calibration
and full hardware matrix, plus Phase B reusable groups/weekdays/instant overrides.
The earlier iPhone test proves the agent's daily window, not this whole cloud path.

## Cloud release preparation (22 November 2026)

Fresh fetch of all origin branches/tags: no newer team commits; base remains
`f38f6204` on leocloud-deployment and `f64fe05` on main. No merge or force-push.
Preflight identified that the live backend deliberately predates ownership.
The user approved retaining shared authenticated router access and the exact
live account.js while adding only the time bridge. Reproducible build selection
and compatibility patch are in `deploy/leocloud/prepare-time-release.mjs`.

Cloud-compatible backend: **127 tests pass**, including real REST/MQTT time
flow and the existing DNS/adblock/authentication suites. Retained time recovery
is tested with the general Quarkus scheduler disabled, as it is in production.
The bridge now uses a bounded independent timer with worker-thread DB access.
Cloud-compatible frontend: **117 tests pass**; the five ownership-login tests
do not apply to the deliberately preserved login. Full branch: **122 JS tests
pass**, including those five. No test authentication override enters the image.

Both live databases backed up outside Git in
`~/NetheraBackups/20261122-213800-time27-cloud/`, permissions restricted to the
local user. Both custom-format dumps fully parsed by pg_restore. Configuration,
DNS desired state, accounts and credentials fingerprinted for after-rollout
comparison. Seven accounts and seven credential rows existed before rollout.
No passwords, dump contents or tokens belong in the repository.

### Cloud rollout and physical website test completed

Implementation commit `e08d1db`, final frontend recipe `6e7bc1d`, both pushed
without merge or force. Migration restored/tested twice on the actual backup,
then applied transactionally on LeoCloud before either image replacement.
Full branch rerun: 142 backend and 122 JS tests pass. Compatible release: 127
backend and 117 applicable JS tests pass. Independent retry succeeds even with
the global scheduler disabled. Go race/nft integration tests pass again.

Backend image `20261122-214210`:
`sha256:e0ed3ff5d4251bbc877d02174aa36269565202c96ef66505200d67364baede15`.
Frontend image `20261122-214620`:
`sha256:3597f1a58e333ce67d107467ae3e4acb1fd78d587e66337b1c5bd2665f1528a1`.
Registry and running pod digests verified; only deployment image fields changed.
No Keycloak, broker, secret or volume change. Website and discovery 200;
unauthenticated router/time/control API requests 401. Existing user session still
works after reload. All 82 served files compared: only the five expected time
integration/cache files differ, including byte-identical account.js.

Actual user-approved test from the authenticated Cloud Internetzeiten form:

1. Selected only device 24 (the authorised iPhone); the administrative Mac was
   never targeted. No pre-existing rule for this device.
2. Saved daily window 22:50-22:53 Europe/Vienna, no budget, around 22:51.
   Website showed a fresh confirmed router block; user confirmed that new pages
   did not load with cellular data disabled.
3. Clicked "Regel ausschalten" before the window ended. Router confirmed pause;
   user confirmed internet worked again, still without cellular data.
4. Removed exactly the test rule via the website. Confirmed empty desired/actual
   time device set, matching version `1795384312622`, applied true, synchronised
   clock, no error. No activated rules remain; original paused legacy row intact.

After cleanup all 13 protected table fingerprints match the backup, including
seven accounts and seven credentials. Original DNS desired/applied versions,
content and adblock state match. `tiktok.com` and `accounts.doubleclick.net`
return NXDOMAIN before and after; `example.com` resolves normally. Device-specific
DNS assignments were not changed for this test; regression covered in existing
backend/agent suites, not claimed as a new physical per-device DNS acceptance.

Private rollout logs, schema test proof, snapshots and fingerprints remain with
the protected backups, not in Git. Digests and rollback instructions are recorded
in `deploy/leocloud/README.md`. Phase A task 8.8 is complete; usage calibration,
the remaining hardware matrix and the Phase B model/UI remain open.
