## 1. Model

- [ ] 1.1 Add `topologyHubs(model, mode)` to `Applikation/topology-model.js` (hubs with `devices`, no empty hubs, devices listed under every membership, connection hubs in Verbindungen mode) and export it next to the existing functions
- [ ] 1.2 Add unit tests in `tests/topology.test.cjs` for `topologyHubs`: both modes, multiple memberships, primary group = `device.groups[0]`, empty network, online-only model

## 2. Page shell

- [ ] 2.1 Restructure `topologie_custom.html`: add the `Klassisch | Baum` switch (`data-layout`), replace `#network-graph` with a `.topology-stage` container, and keep legend, online filter, inspector, notices and controls
- [ ] 2.2 In `topologie_custom.js`, add layout state with load/save via `localStorage['nethera.topology.layout']` (try/catch) and the width-based default (Baum under 700 px)
- [ ] 2.3 Define the renderer interface (`render(stage, view)` → `select`, `fit`, `reset`, `destroy`) and wire data, mode, filter, search and online changes to re-render while selection only calls `select()`
- [ ] 2.4 Keep the inspector, device picker, search, draft refresh, reload/error/empty states, fullscreen and ResizeObserver working against the new stage

## 3. Klassisch layout

- [ ] 3.1 Create `Applikation/topology-classic.js`: router image, pills on a ring, devices on rings around their primary hub, SVG lines, dashed secondary-membership lines
- [ ] 3.2 Style ring dots in `topologie.css`: 1.5 px group-colour ring, small core, faint tint, dashed offline ring with no core, short labels, and no glow/blur/animation anywhere (router uses a plain dark drop shadow)
- [ ] 3.3 Highlighting: solid ring on hover/focus, white ring + scale for the selected device, fading of other devices to 40 %, group filter fading to 14 %, emphasised selected line
- [ ] 3.4 Pointer dragging for pills and devices (4 px threshold, in-memory offsets per mode), zoom via CSS transform (0.5–2), reset, and `fit()` on resize/fullscreen
- [ ] 3.5 Devices and pills as `<button>` elements with `aria-label`/`aria-pressed`, keyboard selection, and a group pill click toggling the group filter

## 4. Baum layout

- [ ] 4.1 Create `Applikation/topology-tree.js`: router card, group cards, device rows (status dot, name, connection chip, IP), Bézier curves, vertical scrolling
- [ ] 4.2 Selection highlights every row of the device and its curves, and filters fade or hide non-matching rows
- [ ] 4.3 Narrow-screen variant (under 640 px: narrower columns, IP hidden) and hidden zoom/reset controls in Baum

## 5. Remove Cytoscape

- [ ] 5.1 Remove the Cytoscape script tag, `graphElements()` usage, `vendor/cytoscape.min.js` and `vendor/LICENSE.cytoscape`, and update `vendor/README.md`
- [ ] 5.2 Remove the Cytoscape import and Cytoscape-based assertions from `tests/topology.test.cjs`

## 6. Tests and verification

- [ ] 6.1 Rewrite `tests/topology-browser.cjs` to run its existing scenarios (picker selection, node click via DOM, mode switch, zoom/reset, fullscreen with inspector, permission failure, reload failure/recovery, 390/768/1440 px without horizontal scroll) in both layouts
- [ ] 6.2 Add browser checks for the layout switch persistence, the narrow-screen default and the absence of glow (`box-shadow`/`filter` without blur on dots, pills and router)
- [ ] 6.3 Run `node --test tests/*.test.cjs` and `npm run test:topology` and fix failures
- [ ] 6.4 Check both layouts manually against `mockup.html` (C2 Ring, F) with demo data and a real router account

## 7. Rollout

- [ ] 7.1 Bump the `?v=` cache-busting query strings for the changed CSS/JS files
- [ ] 7.2 Deploy frontend-only to LeoCloud following the LeoCloud instructions in `AGENTS.md`, and record the rollout like previous frontend deployments
