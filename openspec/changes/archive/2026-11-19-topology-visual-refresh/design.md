## Context

Revision, 19.11.2026: after reviewing the first implementation the user explicitly requested the C2 Ring / F mockup design itself. The original mockup remains unchanged. The revision restores its asset, geometry, surfaces and device bar. The user approved the filled local preview and a frontend-only commit/push/deployment; the verified release is recorded in verification.md.

`/topologie` (`Applikation/topologie_custom.html`) is loaded in the app iframe. Since ae64dfb it renders with Cytoscape:

```
api.js ──▶ topology-model.js ──▶ graphElements() ──▶ cytoscape (canvas)
security-draft.js ─┘  buildModel / onlineOnly /             + legend, inspector,
                      matchingDevices                         fullscreen, notices
```

`topology-model.js` is already pure and covered by `tests/topology.test.cjs`, including multiple group memberships, unknown rule state, draft overlays and the online window. `topologie_custom.js` owns loading, draft refresh, legend, inspector, fullscreen and the Cytoscape graph.

The chosen look comes from the mockup in this change (`mockup.html`, options **C2 → Ring** and **F**). Constraints: vanilla HTML/CSS/JS, no framework, no build step, German UI strings, Nethera palette (`/website/css/palette.css`), and it must work inside the iframe and in fullscreen.

## Goals / Non-Goals

**Goals:**
- Two layouts, **Klassisch** and **Baum**, drawn from the same model, with a remembered switch.
- Match C2 Ring and F, including the original embedded router image and F's subtle router/status shadows. Classic rings and pills do not glow or pulse; selection uses solid rings and fading. This replaces the first plan's broader no-glow restriction at the user's explicit request for the actual mockup.
- Every feature that exists today keeps working in both layouts (see spec).
- Remove Cytoscape and keep the page readable and dependency-free.

**Non-Goals:**
- Device-type icons (the router does not report device types; the mockup's "Icon" dot style is out of scope).
- Saving dragged positions across reloads or devices.
- Orbit (D) and Cluster (E) layouts.
- Any backend or API change.

## Decisions

### 1. Custom DOM + SVG instead of a styled Cytoscape
Klassisch needs a large `router.png`, HTML pills with text and badges, CSS-styled ring dots and DOM labels. Cytoscape's canvas can only approximate these and makes accessibility and tests harder (the browser test currently reaches into `_cyreg`). Baum is plain HTML rows anyway. Both layouts therefore render into one `.topology-stage` element:
- an absolutely positioned `<svg>` for connection lines and curves (bottom layer),
- HTML elements (`<button>` for devices and groups) above it.

*Alternative:* restyle Cytoscape. Rejected because pills, image size and labels fight the canvas renderer, and Baum would still need a second engine.

### 2. One renderer module per layout behind a small interface
```
topologie_custom.js        (state, loading, drafts, legend, inspector, fullscreen, switch)
  ├─ topology-classic.js   render(stage, view) → { select(id), fit(), reset(), destroy() }
  └─ topology-tree.js      render(stage, view) → { select(id), fit(), reset(), destroy() }
```
`view` is `{ model, hubs, mode, groupFilter, query, selectedId, onSelect, onHubClick }`. Both are IIFE modules on `window` (project convention). The page re-renders the active layout on data, mode, filter or resize changes and calls `select()` for selection-only changes, so drag positions survive a selection.

### 3. Layout-neutral hub list in the model
`graphElements()` becomes `topologyHubs(model, mode)`, which returns `[{ id, name, color, kind: 'group'|'connection', devices: [device…] }]` without empty hubs. For multiple memberships a device appears in every matching hub's `devices`, and `device.groups[0]` is its **primary** hub in group mode.
- Klassisch places a device once, under its primary hub, and draws an extra thin dashed line to each secondary group pill.
- Baum lists the device as a row under every hub it belongs to. Selecting one row highlights all rows of that device.

### 4. Klassisch geometry (C2 Ring from mockup.html)
- Router image extracted byte-for-byte to `Applikation/topology-router.png`; existing app/website assets are untouched. Width is `max(small ? 110 : 140, min(w * .2, small ? 170 : 250))`, centred with the reference's 14 px narrow-layout offset.
- Group pills evenly spaced on a ring of radius `clamp(95, 0.30·min(w,h-40), 260) * 1.04`, clamped inside the stage. Each pill shows the name and a count badge, with the exact group-tinted blue gradient from C2.
- Devices on a ring around their pill with radius `clamp(82, 48 + 14·n, 168)` (smaller below 720 px). Ring dots are 26 px (22 px narrow): a 1.5 px border in the group colour, a core about 22 % of the diameter, and a faint group tint inside.
- Offline devices use a dashed 1.5 px ring with no core and a softer label.
- States: hover adds a solid 2 px ring in the group colour. A selected device gets a 2 px gap plus a 1.5 px white ring, scales to 1.15 and the other devices and labels fade to 40 %. When a group filter is active, non-matching hubs fade to 14 %.
- Labels are short names (16 characters with an ellipsis) below each dot. The full name goes in `title`/`aria-label` and the inspector.
- Dragging uses pointer events with a 4 px click threshold. Dragging a group moves its devices along, and dragging a device stores an offset from its group. Positions live in memory per layout and mode. "Anordnung zurücksetzen" clears them.
- Zoom: + / − scale an inner layer with a CSS transform (0.5–2), and drag deltas are divided by the scale.

Device rings start vertically above the group, as in the mockup, rather than rotating each group's ring. Labels remain below the dots; the selected dot shows the reference tooltip. The background has the exact 26 px dot grid. Dragging empty graph space pans; reset clears the camera offset. For very narrow stages a minimum logical width of 680 px is fitted to the viewport; zoom/pan remain available and Baum is still the default.

### 5. Baum geometry
Router card on the left (image, name, `n Geräte · m online`), group cards in the middle (swatch, name, count), and device rows on the right (status dot, name, connection chip, IP). Rows are 30 px high on 36 px tracks with a 22 px gap between groups. The reference desktop x positions are 16 / 250 / 500 px and widths 170 / 180 / up to 440 px. Below 640 px they become 16 / 128 / 268 px and 96 / 120 / at least 184 px. Cubic Bezier curves, colours, borders, green status dots and router shadows match F. IP appears when the device row is at least 300 px wide. The stage scrolls in both axes on narrow screens without overflowing the page. Zoom buttons and reset are hidden in Baum, while fullscreen stays.

### 6. Layout switch and default
A segmented control `Klassisch | Baum` (`data-layout`) sits next to the existing `Gruppen | Verbindungen` control (`data-view`, unchanged). The choice is saved in `localStorage['nethera.topology.layout']` inside try/catch. Without a saved value the default is `baum` when the stage is under 700 px wide, otherwise `klassisch`. Switching layouts keeps the selected device, filters and mode.

### 7. Full-width graph and on-demand details
The permanent side inspector is removed. C2's bottom device bar with previous/next buttons and selected tooltip is restored. Selecting its summary opens a detail overlay; F opens the mockup's detail card on row selection. The app retains a search/picker popover and all rule/draft information under an expandable detail section. The added app controls (reload, search, online filter, fullscreen and zoom) retain their functionality; the mockup's English option tabs and explanatory notes are not copied into the product. Group filters remain available in both layouts. For narrow tree views they stay above the scrollable canvas.

### 8. Accessibility
Devices and groups are real `<button>` elements with `aria-label` (`"<Name>, <Gruppe>, online|offline"`) and `aria-pressed` for the selected device or active group. The stage keeps a text summary for screen readers, and keyboard Enter/Space selects. Focus rings use the accent outline. `prefers-reduced-motion` disables transitions.

## Risks / Trade-offs

- [Klassisch gets crowded with large networks (30+ devices or many groups)] → device ring radius grows with the count, labels are truncated, zoom and drag are available, and Baum is the fallback that is always readable.
- [Rewriting the renderer can regress features from the last sprint (drafts, online filter, fullscreen)] → keep `topology-model.js` and its unit tests as they are, and rewrite the browser test to cover every existing scenario in both layouts before deleting Cytoscape.
- [Pill positions clamped at the stage edge can overlap on very small stages] → below 600 px wide, the page opens Baum by default. Klassisch still renders but uses the smaller sizes.
- [Lines drawn as SVG under HTML nodes must stay aligned after resize or fullscreen] → a ResizeObserver on the stage triggers `fit()` (re-layout from stored offsets) and fullscreen change calls `fit()` too.

## Migration Plan

1. Implement alongside the approved polish on `fix/frontend-presentation-polish` (integration explicitly requested on 19.11.2026), keeping model changes additive until both layouts work.
2. Remove Cytoscape vendor files and the script tag once the browser test passes for both layouts.
3. The first integration was deployed as recorded in verification.md. The subsequently approved mockup-fidelity revision uses `20261119-mockup` for both asset queries and the app iframe version. Build only the frontend, preserve the compatible account.js overlay, and verify protected resources before/after rollout.
4. Rollback: restore the previous frontend image digest. There is no data or API migration and no Git history needs rewriting.

## Open Questions

- Should Klassisch also remember dragged positions per browser (localStorage), or is reset-per-session enough? Default in this design: in-memory only.
- Should the group pill click filter (as in the mockup) or select the group in the inspector? Default: it toggles the group filter, the same as the legend chips.
