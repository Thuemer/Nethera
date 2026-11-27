## ADDED Requirements

### Requirement: Existing device modes
The system SHALL accept Normal and Bevorzugt using device MAC addresses and SHALL reject invalid addresses, versions and modes before applying commands.
#### Scenario: Return to normal
- **WHEN** all device priorities return to normal
- **THEN** only priority-owned queues and rules are removed

### Requirement: Preserve existing router features
The service MUST NOT rewrite network, wireless, DNS, firewall configuration or the existing agent binary. It SHALL refuse foreign root queues and enabled flow offload.
#### Scenario: Foreign scheduler
- **WHEN** an interface has an unrelated root queue
- **THEN** activation fails without replacing that queue

### Requirement: Truthful versioned confirmation
The backend SHALL expose only current, fresh, router-specific readback as applied. The service SHALL persist checked desired state and periodically reconcile mappings and queues.
#### Scenario: Stale or wrong acknowledgment
- **WHEN** an acknowledgment is stale or has another version
- **THEN** the frontend cannot show the current priority as confirmed

### Requirement: Network-independent scheduling
The router SHALL weight preferred traffic above normal traffic without a fixed connection bandwidth and SHALL document that this does not guarantee ISP bandwidth or bufferbloat control.
#### Scenario: Changed network
- **WHEN** WAN or LAN interfaces change
- **THEN** the service re-discovers interfaces and does not assume a previous connection rate
