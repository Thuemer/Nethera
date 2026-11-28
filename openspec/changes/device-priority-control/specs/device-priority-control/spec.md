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


### Requirement: Explicit total-bandwidth shaping
The router SHALL apply configured download and upload caps at the shared routed LAN/WAN boundary before weighting preferred/normal classes. No ISP rate SHALL be assumed in code. Readback SHALL verify actual caps; missing configuration SHALL NOT confirm high priority.
#### Scenario: Shared bottleneck
- **WHEN** preferred and normal routed traffic compete under configured caps
- **THEN** both classes share the same directional total-rate parent and normal traffic can still transmit
#### Scenario: Existing backend
- **WHEN** an older command omits bandwidth and a router-local commissioning setting exists
- **THEN** the worker uses and reports the explicit local caps without changing DNS/time commands


### Requirement: Device fairness and priority with CAKE
The router SHALL isolate hosts within configured priority levels and assign normal/preferred traffic without rewriting DSCP or conntrack marks. Download SHALL use destination-host isolation and ingress accounting; upload SHALL use source-host isolation with NAT lookup. Active readback SHALL verify bandwidth and scheduler policy. No fixed per-device throughput ratio SHALL be promised.
#### Scenario: Normal device alone
- **WHEN** only normal traffic requests significant bandwidth
- **THEN** it can use spare capacity up to the configured total, without a permanent low per-device cap
#### Scenario: Autonomous WAN verification
- **WHEN** two identical direct downloads are classified normal/preferred on a preferred client
- **THEN** the diagnostic measures both, leaves preferred production classification unchanged, and restores temporary normal-flow rules through finally and a router-side watchdog


### Requirement: Capacity-first adaptive download
An enabled local capacity-first profile SHALL start at its configured download ceiling, recover from transient reductions without a fixed low idle rate, and SHALL NOT reduce a direction solely because of reflector latency while that direction is below its activity threshold. Normal traffic SHALL remain able to borrow unused capacity. Explicit manual bandwidth settings SHALL retain precedence.
#### Scenario: Fast connection after idle
- **WHEN** capacity-first starts or a reduced rate recovers without congestion
- **THEN** it uses or probes towards the configured maximum instead of a hard-coded ISP rate
#### Scenario: Idle reflector delay
- **WHEN** only reflector latency is elevated and download is below the configured activity threshold
- **THEN** that observation alone does not reduce the download shaper
