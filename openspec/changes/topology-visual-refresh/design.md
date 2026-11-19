## Context

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
- No glow, blur or pulse on nodes, pills or the router. Highlighting uses solid rings and fading only.
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

### 4. Klassisch geometry (ported from 9903b72, adjusted)
- Router image centred, width `clamp(110px, 20% of stage width, 250px)`, with a plain dark drop shadow and no mint glow.
- Group pills evenly spaced on a ring of radius `clamp(95, 0.30·min(w,h), 260)`, clamped inside the stage. Each pill shows the name and a count badge, with a background tinted by the group colour.
- Devices on a ring around their pill with radius `clamp(82, 48 + 14·n, 168)` (smaller below 720 px). Ring dots are 26 px (22 px narrow): a 1.5 px border in the group colour, a core about 22 % of the diameter, and a faint group tint inside.
- Offline devices use a dashed 1.5 px ring with no core and a softer label.
- States: hover adds a solid 2 px ring in the group colour. A selected device gets a 2 px gap plus a 1.5 px white ring, scales to 1.15 and the other devices and labels fade to 40 %. When a group filter is active, non-matching hubs fade to 14 %.
- Labels are short names (16 characters with an ellipsis) below each dot. The full name goes in `title`/`aria-label` and the inspector.
- Dragging uses pointer events with a 4 px click threshold. Dragging a group moves its devices along, and dragging a device stores an offset from its group. Positions live in memory per layout and mode. "Anordnung zurücksetzen" clears them.
- Zoom: + / − scale an inner layer with a CSS transform (0.5–2), and drag deltas are divided by the scale.

### 5. Baum geometry
Router card on the left (image, name, `n Geräte · m online`), group cards in the middle (swatch, name, count), and device rows on the right (status dot, name, connection chip, IP). Rows are 36 px high with a 22 px gap between groups. Cubic Bézier curves connect router → group → row, with the selected device's curve in full group colour. Below 640 px the columns narrow, the IP is hidden and the row keeps name + status. The stage scrolls vertically. Zoom buttons and reset are hidden in Baum, while fullscreen stays.

### 6. Layout switch and default
A segmented control `Klassisch | Baum` (`data-layout`) sits next to the existing `Gruppen | Verbindungen` control (`data-view`, unchanged). The choice is saved in `localStorage['nethera.topology.layout']` inside try/catch. Without a saved value the default is `baum` when the stage is under 700 px wide, otherwise `klassisch`. Switching layouts keeps the selected device, filters and mode.

### 7. Details stay in the side inspector
The inspector (search, device picker, details) works as today for both layouts, so rule, template, draft and connection details are not lost. The old bottom ‹ › bar is **not** brought back, because the device picker and the inspector cover that use.

### 8. Accessibility
Devices and groups are real `<button>` elements with `aria-label` (`"<Name>, <Gruppe>, online|offline"`) and `aria-pressed` for the selected device or active group. The stage keeps a text summary for screen readers, and keyboard Enter/Space selects. Focus rings use the accent outline. `prefers-reduced-motion` disables transitions.

## Risks / Trade-offs

- [Klassisch gets crowded with large networks (30+ devices or many groups)] → device ring radius grows with the count, labels are truncated, zoom and drag are available, and Baum is the fallback that is always readable.
- [Rewriting the renderer can regress features from the last sprint (drafts, online filter, fullscreen)] → keep `topology-model.js` and its unit tests as they are, and rewrite the browser test to cover every existing scenario in both layouts before deleting Cytoscape.
- [Pill positions clamped at the stage edge can overlap on very small stages] → below 600 px wide, the page opens Baum by default. Klassisch still renders but uses the smaller sizes.
- [Lines drawn as SVG under HTML nodes must stay aligned after resize or fullscreen] → a ResizeObserver on the stage triggers `fit()` (re-layout from stored offsets) and fullscreen change calls `fit()` too.

## Migration Plan

1. Implement on branch `topology-visual-refresh`, keeping `topology-model.js` changes additive until both layouts work.
2. Remove Cytoscape vendor files and the script tag once the browser test passes for both layouts.
3. Bump the `?v=` query strings and roll out to LeoCloud as a frontend-only deployment (see `AGENTS.md` and the LeoCloud instructions).
4. Rollback: revert the merge commit. There is no data or API migration.

## Open Questions

- Should Klassisch also remember dragged positions per browser (localStorage), or is reset-per-session enough? Default in this design: in-memory only.
- Should the group pill click filter (as in the mockup) or select the group in the inspector? Default: it toggles the group filter, the same as the legend chips.
