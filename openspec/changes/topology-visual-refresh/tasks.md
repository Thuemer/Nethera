## 1. Model

- [x] 1.1 Add `topologyHubs(model, mode)` to `Applikation/topology-model.js` (hubs with `devices`, no empty hubs, devices listed under every membership, connection hubs in Verbindungen mode) and export it next to the existing functions
- [x] 1.2 Add unit tests in `tests/topology.test.cjs` for `topologyHubs`: both modes, multiple memberships, primary group = `device.groups[0]`, empty network, online-only model

## 2. Page shell

- [x] 2.1 Restructure `topologie_custom.html`: add the `Klassisch | Baum` switch (`data-layout`), replace `#network-graph` with a `.topology-stage` container, and keep legend, online filter, inspector, notices and controls
- [x] 2.2 In `topologie_custom.js`, add layout state with load/save via `localStorage['nethera.topology.layout']` (try/catch) and the width-based default (Baum under 700 px)
- [x] 2.3 Define the renderer interface (`render(stage, view)` → `select`, `fit`, `reset`, `destroy`) and wire data, mode, filter, search and online changes to re-render while selection only calls `select()`
- [x] 2.4 Keep the inspector, device picker, search, draft refresh, reload/error/empty states, fullscreen and ResizeObserver working against the new stage

## 3. Klassisch layout

- [x] 3.1 Create `Applikation/topology-classic.js`: router image, pills on a ring, devices on rings around their primary hub, SVG lines, dashed secondary-membership lines
- [x] 3.2 Style ring dots in `topologie.css`: 1.5 px group-colour ring, small core, faint tint, dashed offline ring with no core and short labels; revision 8 restores the original router image/shadows while classic dots and pills remain without glow
- [x] 3.3 Highlighting: solid ring on hover/focus, white ring + scale for the selected device, fading of other devices to 40 %, group filter fading to 14 %, emphasised selected line
- [x] 3.4 Pointer dragging for pills and devices (4 px threshold, in-memory offsets per mode), zoom via CSS transform (0.5–2), reset, and `fit()` on resize/fullscreen
- [x] 3.5 Devices and pills as `<button>` elements with `aria-label`/`aria-pressed`, keyboard selection, and a group pill click toggling the group filter

## 4. Baum layout

- [x] 4.1 Create `Applikation/topology-tree.js`: router card, group cards, device rows (status dot, name, connection chip, IP), Bézier curves, vertical scrolling
- [x] 4.2 Selection highlights every row of the device and its curves, and filters fade or hide non-matching rows
- [x] 4.3 Narrow-screen variant (under 640 px: narrower columns, IP hidden) and hidden zoom/reset controls in Baum

## 5. Remove Cytoscape

- [x] 5.1 Remove the Cytoscape script tag, `graphElements()` usage, `vendor/cytoscape.min.js` and `vendor/LICENSE.cytoscape`, and update `vendor/README.md`
- [x] 5.2 Remove the Cytoscape import and Cytoscape-based assertions from `tests/topology.test.cjs`

## 6. Tests and verification

- [x] 6.1 Rewrite `tests/topology-browser.cjs` to run its existing scenarios (picker selection, node click via DOM, mode switch, zoom/reset, fullscreen with inspector, permission failure, reload failure/recovery, 390/768/1440 px without horizontal scroll) in both layouts
- [x] 6.2 Add browser checks for the layout switch persistence, narrow-screen default and reference styling; revision 8 verifies no glow on classic dots/pills and preserves the mockup's router/tree shadows
- [x] 6.3 Run `node --test tests/*.test.cjs` and `npm run test:topology` and fix failures
- [ ] 6.4 Check both layouts manually against `mockup.html` (C2 Ring, F) with demo data and a real router account

## 7. Rollout

- [x] 7.1 Bump the `?v=` cache-busting query strings for the changed CSS/JS files
- [x] 7.2 Deploy frontend-only to LeoCloud following the LeoCloud instructions in `AGENTS.md`, and record the rollout like previous frontend deployments

Verified: 122 unit tests, 83 general browser scenarios, both topology layouts (320/390/768/1440 px), presentation regression and 42 polish checks pass. Topology tests also pass against the built image and the cloud-served assets with intercepted API fixtures. Source scan has no remaining Cytoscape imports. Task 6.4 remains open: demo views were inspected, but no authenticated real-router visual check has been completed. Frontend rollout and preservation checks passed; see verification.md and deploy/leocloud/README.md.

## 8. Mockup fidelity revision (19.11.2026)

The user requested the actual C2 Ring / F mockup design, not another interpretation of the plan. The filled local preview has now been reviewed and approved for a frontend-only release.

- [x] 8.1 Port the reference asset, classic geometry, surfaces, chips, selected tooltip and bottom device bar from mockup.html
- [x] 8.2 Port F tree geometry, row styling and selected detail overlay; retain live data, drafts, filters, keyboard access and fullscreen
- [x] 8.3 Compare both renderers against the original mockup with identical fixtures and dimensions, run regression tests and inspect desktop/mobile screenshots
- [x] 8.4 Update existing documentation and open the filled local preview for review

- [x] 8.5 Commit and push on the existing branch after fetching teammates; build, test and deploy only the approved frontend, then verify hashes and protected resources

Verification completed: reference comparison, 122 unit tests, 83 general browser scenarios, 42 polish scenarios, presentation regression and extended topology suite passed. Both layouts and a device detail were inspected in the in-app preview. All browser suites passed against the built image; cloud topology checks, all 82 asset hashes and protected resource comparisons passed after rollout. Source: `6444fed`. Task 6.4's real-router account check is still open.
