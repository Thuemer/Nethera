## Why

Since the Cytoscape rewrite (ae64dfb, 15.11.) and the polish in 0366b88 (18.11.), `/topologie` looks like a generic graph tool. The router became a small circle, the devices became flat dots and a lot of interface surrounds a small graph. The team preferred the earlier look (until 9903b72, 19.10.): a large router image, pill-shaped groups and devices placed around their group. However, that version could not show group colours, online state, filters, local drafts or rule details. We compared seven styles in an interactive mockup (`mockup.html` in this change) and chose two:

- **Classic (C2, ring dots):** the layout of the old version with today's features and thin ring dots, without any glow.
- **Tree (F):** a left-to-right hierarchy of router, groups and device rows that is easy to read on any screen size.

Users switch between these two layouts on the topology page.

## What Changes

- Replace the Cytoscape graph in `topologie_custom.html/.js` with two custom-rendered layouts (plain DOM + SVG, no new library):
  - **Klassisch:** router image in the centre, group pills on a ring, devices on a small ring around their group. Devices are thin coloured rings with a small solid core. Offline devices are dashed rings without a core. Devices show a short name label, and groups and devices can be dragged. There are no glow or pulse effects.
  - **Baum:** router card on the left, then group cards, then one row per device with status, name, connection type and IP. Curves connect the columns and the view scrolls vertically.
- Add a layout switch **Klassisch | Baum** in the topology header. The choice is remembered per browser. Without a saved choice the page opens in Klassisch on wide screens and in Baum on narrow screens.
- New highlighting in Klassisch: a solid ring in the group colour on hover. A selected device gets a white ring and the other devices fade.
- Keep all existing behaviour in both layouts: the Gruppen/Verbindungen grouping, group filter chips, "Nur online", search, device picker, inspector with template, rules and connection details, the local draft notice, demo captions, fullscreen, reload and error states.
- **BREAKING (internal):** remove `vendor/cytoscape.min.js` and `vendor/LICENSE.cytoscape` and the Cytoscape dependency in `tests/topology.test.cjs`. `graphElements()` in `topology-model.js` is replaced by a layout-neutral structure that both layouts use.

## Capabilities

### New Capabilities
- `network-topology-view`: How the topology page draws the user's network (Klassisch and Baum layouts), the switch between them, selection and highlighting, filtering, offline display, the details panel, and the behaviour on narrow screens.

### Modified Capabilities
<!-- None: no existing spec covers the topology page. -->

## Impact

- **Frontend:** `Applikation/topologie_custom.html`, `topologie_custom.js` and `topologie.css` are largely rewritten. `topology-model.js` gets a layout-neutral `topologyHubs()` in place of `graphElements()`, and `buildModel`, `onlineOnly`, `matchingDevices` and the draft overlay stay unchanged.
- **Assets:** reuses `router.png`. Cytoscape vendor files are removed and lucide stays.
- **Tests:** update `tests/topology.test.cjs` (no Cytoscape) and rewrite `tests/topology-browser.cjs` to cover both layouts. The canvas-node click becomes a click on a DOM element.
- **Backend / API:** none. Router telemetry and security data are read exactly as today.
- **Deployment:** frontend-only rollout to LeoCloud (bump the `?v=` cache-busting query strings).
