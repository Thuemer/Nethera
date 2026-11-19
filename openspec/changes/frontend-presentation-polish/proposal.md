## Why

Best of Projects needs a consistent, readable frontend without another redesign. Repeated notices, nested row panels and ambiguous unknown states make routine workflows harder to scan. This change implements the usability and error-state requirements in `Documentation/meta-spec.md`, sections 13 and 14.

## What Changes

- Keep Nethera colors, navigation, page structure and existing functionality.
- Reduce repeated visual framing and information in protection, time limits, configuration and status.
- Distinguish missing telemetry from zero devices or a confirmed offline router.
- Add repeatable browser checks, screenshots and a presentation checklist.

## Capabilities

### New Capabilities
- `frontend-presentation-quality`: readable, responsive existing workflows with truthful status feedback.

### Modified Capabilities
- None. No API or router capability changes.

## Impact

Branch: `fix/frontend-presentation-polish`. Local review only; no commit, push or deployment in this change's implementation phase.

Scope: application presentation, focused frontend status logic, tests and documentation. Topology is owned by Manu and excluded, including its shared data contracts. Website, authentication, backend, router, accounts, database and deployment resources remain unchanged.

The working tree already contains the previous frontend rollout's changes in `index.html`, two topology files, the presentation checklist, two deployment files and `tests/presentation-browser.cjs`. Preserve these separately; do not treat them as new polish work or stage them implicitly.
