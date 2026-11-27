# Cloud integration and frontend review — 27 November 2026

## Source and compatibility

Integrated `origin/feat/router-time-schedules` at `52c9989` with priority commit `f83ad40` on main. Both histories are retained in the merge. The normal source keeps ownership checks; the existing cloud-release generator still selects the verified shared-router backend/frontend baselines.

`prepare-time-release.mjs` now selects priority entities/services, the additive migration, tests and UI changes. It applies the existing time patch followed by `priority-cloud.patch`. The new endpoint is authenticated and validates devices against configured `nethera.router.id` in this generated cloud variant. No CurrentRouter/ownership rollout is introduced there. The existing DNS publisher receives only the independent priority preparation hook; DNS content generation and global adblock selection remain on the cloud baseline.

Automatic release comparison reconstructs the old verified `52c9989` release, compares every existing frontend file outside the explicit UI/test allowlist, and checks DNS/security/time classes and properties byte-for-byte. The login file remains byte-identical with SHA-256 `8912b216f8c534c814434cc235ceb988f20bae0a0bafc41fe85473e4328a3b2f`.

## Automated results

- Source backend: **151 tests, zero failures/errors/skips**, including authenticated APIs, router scoping, migrations, DNS control, telemetry, time schedules and combined priority/time/DNS/adblock REST→MQTT→readback. Built from an isolated source snapshot because locally synced build-output duplicates were observed in the workspace target directory.
- Generated cloud backend: **136 tests, zero failures/errors/skips**. Both builds used `-Dtest='*Test,*IT,!ExampleResourceIT' test package` (the packaged hello-only ExampleResourceIT was not run). JVM packages built successfully, targeting Java 21.
- Priority migration tested twice against isolated PostgreSQL: existing accounts, DNS and time state, and already saved priority state retained; invalid foreign device reference rejected.
- Combined control test confirms priority high/normal and rejects stale acknowledgments; network domains, per-device domains, adblock desired state, preset assignment and time command/version remain unchanged. Anonymous priority write is 401. Invalid modes are 400 and unknown device IDs 404.
- Found and fixed the initial priority-insert defect: non-null mode is now set before JPA persist. This was discovered by the new real PostgreSQL/MQTT test, not merely by mocking the API.
- Go `go test -race ./...`: passed with merged time-control implementation and independent priority worker. No deployed router binary was replaced.
- Frontend: **125 tests in source; 120 applicable tests in generated cloud variant**, all pass. Five ownership-account UI tests intentionally apply only to the source, not the unchanged cloud login.
- Release generator invariant test passed. OpenSpec strict validation and whitespace checks passed.

## Frontend / UI / UX coverage

Browsers used isolated mocked API responses; no test writes reached a live backend or router. The final compatible frontend was also built into an Nginx **linux/amd64** image and served only on loopback for QA.

- **83 browser scenarios** over overview, devices, network status, topology, time limits, security, traffic and configuration, including demo, empty, unavailable, server/authentication failures and 1440/768/390/320-pixel layouts. Public homepage, instructions and support routes checked as well.
- Presentation/navigation tests: normal/demo test accounts, explicit demo toggle, logout cleanup, live/offline transitions, mobile legend and no stale local draft shown as live topology. Updated an outdated test that still expected a local draft to override live topology, contrary to the already deployed behavior.
- Topology tests: classic/tree selection, search/filter, layout persistence, online controls, fullscreen, error/empty states, multiple group memberships and four viewport sizes.
- Time-control browser tests: save, version/readback state, router-reported usage, focus/details persistence, pause/delete, daily budget and four viewports.
- Priority/group browser test: priority save waits for readback; existing adblock and domain writes remain live; choosing Kinder creates/assigns a GROUP list without changing the network list; inline success and server-failure messages visible; failed entry retained; retry button re-enabled. Desktop/mobile checked.
- **144 local asset/navigation references** checked in generated app/website HTML, no missing files.
- Mobile and desktop screenshots inspected for dashboard, devices, security, configuration and website-group feedback; no horizontal page overflow found by the responsive scenarios.

## UI changes from the review

All protection forms now show saving and completion/failure feedback beside the form as well as the existing general status. Website rules explicitly say successfully saved and separately awaiting router confirmation. Incomplete multi-request writes are not described as fully successful.

Website scope explains how to create a Kinder group and select it under Eine Gruppe. The address hint explains domain versus individual-link blocking. Automatic category tokens currently lack an actual domain source: this is stated visibly, and those category toggles are disabled in live mode instead of implying functioning category filtering. Individual group domains remain editable.

## Deployment and live limits

**No cloud rollout, cloud database migration, image push or physical-router change was performed in this integration session.** Existing cloud deployment and router state remain untouched. No new physical test or reboot was performed; earlier priority-only Cudy checks are in verification.md, Deniz's time checks remain in device-time-limits/verification.md.

The user's TikTok-access report on the existing cloud was not reproduced on the actual phone/router. Successful storage/readback of a domain configuration does not prove that every app endpoint or pre-existing connection is blocked. After deployment test the intended phone on the intended router/network with fresh requests, router confirmation and suitable comparison devices. Category filtering and guaranteed ISP bandwidth are not implemented.

Deniz must generate the release from the pushed integrated commit using the updated script, back up both databases and current image digests, apply only the additive priority migration and replace only backend/frontend images. Do not use the full source backend directly for this shared-router rollout; do not reapply the full stack, replace Keycloak, run a seed/ownership migration or reinstall the router agent. See deploy/leocloud/README.md.
