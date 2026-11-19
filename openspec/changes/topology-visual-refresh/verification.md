# Topology integration verification

Date: 19.11.2026. Branch: `fix/frontend-presentation-polish`.

## Current local revision: actual mockup design

The user requested the visual design from C2 Ring and F directly after reviewing the first release, then approved the filled local preview and a frontend-only release. The release recorded below still describes the earlier interpretation until the new rollout is verified.

- Extracted the reference PNG byte-for-byte (`0f6c6c0822c76bd6dc662b26492c1f91495bc13395ea55750710a9adc64afce4`) as `Applikation/topology-router.png`; did not edit any existing website image.
- Restored the C2 dot-grid background, tinted gradient pills/count badges, original ring arrangement, below-dot labels, selected tooltip and previous/next device bar. Removed the permanent side column.
- Restored F's fixed column positions, 30 px rows on 36 px tracks, connection chips, group swatches, curves and reference shadows. Full details appear on demand, with existing rule/draft information retained.
- `tests/topology-mockup-browser.cjs` compares the unchanged original mockup with both renderers using exactly the same 15 devices, five groups and 1246 x 718 px drawing area. Every device/hub position and size matches within 1.1 px; backgrounds and borders match exactly. Router asset bytes are identical. Comparison screenshots: `/private/tmp/nethera-mockup-comparison/`.
- 122 unit tests, 83 general browser scenarios, 42 polish scenarios, presentation regression and the extended topology suite passed. Topology checks include device-bar wraparound, details, search/picker, drag/zoom/reset, online/group filters, multiple memberships, keyboard selection, fullscreen/error recovery, 320/390/768/1440 px and narrow-tree scrolling. Both layouts and selected-device details were also inspected in the in-app preview. No test writes reached a backend.
- App integration differences are deliberate and visible: existing navigation/reload/search/fullscreen controls, expandable rule details, group filtering above the tree, and a fitted/zoomable classic canvas on narrow screens. The mockup's gallery/English design notes are not application content. Text tracking remains zero per the app convention. This is a reference-port verification, not a claim that the entire application shell is pixel-identical to the standalone mockup.
- Preview: `http://127.0.0.1:5501/index.html?entry=website&demo=1` (Topologie). The isolated preview uses existing demo data and has no real-account/router connection. App screenshots: `/private/tmp/nethera-mockup-local/`.
- OpenSpec CLI remains unavailable. Real-account/router end-to-end verification remains open. No deployment files, backend/API logic, accounts, databases or router settings were changed.
- The approved release must include `topology-router.png` in its isolated build allowlist. The existing Dockerfile's PNG copy already covers it. Both the app iframe version and topology asset queries use `20261119-mockup` to avoid cached older pages. The compatible login overlay must remain unchanged.

## Earlier deployed integration

Manuel's commit `0d08547` supplied the proposal and mockup, not finished application code. Implementation of his C2 Ring and F tree plan was explicitly requested after that distinction was explained. The original proposal/mockup are preserved.

### Implemented in the earlier release

- Klassisch / Baum selection, remembered with storage-error fallback and a narrow-screen tree default.
- Shared model, online state, groups/connections, search, group filter, device picker and inspector. Draft changes never alter connection telemetry.
- DOM buttons and SVG connections, multiple memberships, dashed offline rings, selection without glow, drag/zoom/reset/pan in Klassisch and scrollable rows in Baum.
- Router image reused from the unchanged website assets. Classic pairs and labels are placed clear of the centre and neighbouring labels.
- Fullscreen includes the complete workspace and handles browser denial. No backend endpoints or write behaviour added.
- Cytoscape no longer loaded or shipped. Cache version: `20261119-layouts`.

### Evidence for the earlier release

- `npm test`: 122/122 successful.
- `tests/topology-browser.cjs`: both layouts, DOM/keyboard selection, filters/modes, online-only, drag/zoom/reset, fullscreen/exit/denial, reload error/recovery, storage persistence/failure, four viewport widths (320, 390, 768, 1440), multiple memberships, offline rings, untrusted labels and empty renderers passed.
- `tests/presentation-browser.cjs`: source changes, normal/demo account routing and local draft changes passed; no API writes.
- `tests/presentation-polish-browser.cjs`: 42 scenarios passed; no API writes.
- `tests/browser-smoke.cjs`: 83 scenarios passed after integration; no API writes.
- Demo screenshots at `/private/tmp/nethera-topology-layouts/` and local in-app inspection of both layouts. Narrow default is Baum; Klassisch additionally offers zoom and pan.

Tests use the existing local Chromium runtime, `NETHERA_TEST_URL=http://127.0.0.1:5500/presentation-preview` and API fixtures. These are not physical-router end-to-end tests.

## Still open

- Manual visual check with an authenticated real-router account. No usable session is currently open in the review browser; no accounts or credentials have been changed.
- OpenSpec CLI validation (CLI not installed).

## Deployed frontend

Commit `8382f01` was built as private amd64 image `ghcr.io/denizbernecker/nethera-frontend:20261119-105348`, digest `sha256:38d71664abbb1104e8f40f7af1e34a4f68f3d4725590ad2df9a02213effbe506`. The compatible account.js overlay is byte-identical to the previous release. All 81 deployed asset hashes match, no extra mock-auth files are present. The general browser suite passed against the image; the topology suite also passed against the actual cloud assets with intercepted API fixtures.

Only the frontend deployment image changed. Protected resource specifications, identities, restart counts and secret metadata were compared before/after and remained unchanged. Public asset checksums and HTTP health passed; login discovery is reachable and `/api/routers/list` still requires authentication. Details and rollback: [deployment log](../../../deploy/leocloud/README.md).
