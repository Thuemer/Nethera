## Context

The application is plain HTML/CSS/JavaScript with an iframe shell and existing custom elements. Pages share `nethera-theme.css`; topology does not load it. Existing UI supports live data, explicit demo data, unavailable data and tab-local protection drafts.

## Goals / Non-Goals

Goals: quieter information hierarchy, consistent controls and spacing, readable mobile layouts, accurate missing-data feedback and reproducible review evidence.

Non-goals: redesigning topology or the public website, changing brand colors, adding sprint features, changing persistence or authentication, or claiming router enforcement without acknowledgement.

## Decisions

1. Use existing selectors and page components. Flatten repeated inner rows instead of introducing a new component system. Keep settings and edit forms in their existing locations.
2. Render routine loading/success feedback as compact text. Errors, source notices and local-only limitations stay visible. Actions must still provide immediate feedback.
3. Keep group and preset selectors as the authoritative displayed assignment in protection rows. Remove duplicate labels; retain rule/priority information and explicitly label actual local changes, including removals.
4. Unknown telemetry is neutral and uses an em dash for missing counts. A known live empty list still displays zero. Demo counts stay explicitly described as examples.
5. Test with intercepted APIs only. No test operation may mutate a real backend or router. Preview uses the existing compatible account integration because new ownership APIs are not deployed locally or on LeoCloud yet.
6. Mark demo data once in the app navigation, or with a short label on standalone pages. Suppress repeated demo explanations and read-only notices, not real errors or local-draft status. Topology only loses its redundant demo caption; its layout, colours and controls remain unchanged.

## Risks / Trade-offs

- Shared CSS affects multiple pages: check desktop and mobile screenshots, overflow and keyboard controls across them.
- Shorter notices must not imply applied router settings: assert local-draft and unconfirmed-effect text remains visible.
- Fixture tests cannot guarantee physical router behaviour or real-account login. Record these boundaries explicitly.
- Do not alter cache versions or deployment metadata until a separately approved release; local preview uses no-cache responses.

## Validation

Run existing JavaScript tests, browser smoke tests and focused presentation polish checks. Inspect screenshots for every non-topology application page and all protection tabs. Record commands, results and remaining manual checks in `verification.md`.

OpenSpec CLI is unavailable on this machine. Artifacts follow the repository's spec-driven format; CLI validation remains a separate check.
