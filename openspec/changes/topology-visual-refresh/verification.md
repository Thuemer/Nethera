# Topology integration verification

Date: 19.11.2026. Branch: `fix/frontend-presentation-polish`.

Manuel's commit `0d08547` supplied the proposal and mockup, not finished application code. Implementation of his C2 Ring and F tree plan was explicitly requested after that distinction was explained. The original proposal/mockup are preserved.

## Implemented

- Klassisch / Baum selection, remembered with storage-error fallback and a narrow-screen tree default.
- Shared model, online state, groups/connections, search, group filter, device picker and inspector. Draft changes never alter connection telemetry.
- DOM buttons and SVG connections, multiple memberships, dashed offline rings, selection without glow, drag/zoom/reset/pan in Klassisch and scrollable rows in Baum.
- Router image reused from the unchanged website assets. Classic pairs and labels are placed clear of the centre and neighbouring labels.
- Fullscreen includes the complete workspace and handles browser denial. No backend endpoints or write behaviour added.
- Cytoscape no longer loaded or shipped. Cache version: `20261119-layouts`.

## Evidence

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
