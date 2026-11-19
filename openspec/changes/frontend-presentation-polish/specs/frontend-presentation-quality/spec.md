## ADDED Requirements

### Requirement: Consistent existing workflows
The frontend SHALL preserve Nethera branding and existing page navigation while providing readable controls and content at desktop and mobile widths.

#### Scenario: Narrow viewport
- **WHEN** an existing application screen is viewed at 320px, 390px, 768px or 1440px
- **THEN** text and controls remain within their containers without horizontal page overflow
- **AND** forms, tabs and detail controls remain usable

### Requirement: Truthful status feedback
The frontend SHALL distinguish unknown data, an empty live result, demo data and a local draft without implying confirmed router effects.

#### Scenario: Router telemetry is unavailable
- **WHEN** the data mode is unavailable and no online state is known
- **THEN** the router state is neutral and unknown, the device count is missing rather than zero, and no successful router update is claimed

#### Scenario: Live router has no WLAN clients
- **WHEN** the live response has an empty device list
- **THEN** the WLAN device count is zero

#### Scenario: Local assignments are edited
- **WHEN** a user edits or removes a device's group or preset in the local protection draft
- **THEN** the row identifies the local change and the local-only notice remains visible
- **AND** no backend write is sent

### Requirement: Focused information hierarchy
The frontend SHALL keep essential feedback while avoiding duplicate assignment labels and oversized routine status panels.

#### Scenario: Protection device list
- **WHEN** devices are displayed
- **THEN** group and preset values are shown through the existing selectors without repeating those values in surrounding prose
- **AND** unchanged rows are not individually labelled as edited local drafts

#### Scenario: An action fails
- **WHEN** a request fails
- **THEN** an explicit readable error remains visible and entered values are not silently discarded

#### Scenario: Demo data is displayed
- **WHEN** an application page displays demo data
- **THEN** the shell uses one concise Demo label instead of repeated explanatory notices in the content
- **AND** standalone pages retain a concise source label, while real errors and local-draft states remain visible
- **AND** returning to live data removes the Demo label without changing write permissions

### Requirement: Safe scope and review
The change SHALL remain local until separately approved and SHALL not modify topology design or behaviour, backend, authentication, router settings or deployment resources. Removing the redundant demo caption in topology is within the requested text cleanup.

#### Scenario: Presentation review
- **WHEN** local implementation is ready
- **THEN** verification evidence and a preview are available before commit or deployment
