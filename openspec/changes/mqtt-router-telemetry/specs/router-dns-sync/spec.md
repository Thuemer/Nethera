## MODIFIED Requirements

### Requirement: DNS stats are stored as deltas
The system SHALL compute the difference between the current dnsmasq cumulative counters and the values from the previous sync cycle, and store only the delta as a `DnsStat` row. This applies to counters obtained over SSH and over MQTT. The previous-snapshot baseline SHALL be kept per router and shared by both transports.

#### Scenario: First sync cycle after startup
- **WHEN** no previous snapshot exists for the router (first run since backend start)
- **THEN** no `DnsStat` row is inserted; the current cumulative values are saved as the baseline for the next cycle

#### Scenario: Subsequent sync cycle
- **WHEN** a previous snapshot exists for the router
- **THEN** the delta `(current − previous)` is inserted as a new `DnsStat` row with `timestamp = now()`

#### Scenario: Transport switches between cycles
- **WHEN** the previous snapshot of router 1 came over SSH and the current counters arrive over MQTT (or the reverse)
- **THEN** the delta is computed against that previous snapshot, exactly as if both had come from the same transport

## ADDED Requirements

### Requirement: Collect DNS query stats from MQTT payloads
For DNS messages received over MQTT, the system SHALL compute `total_queries = forwarded + answered_locally`, `blocked_queries = answered_locally` and `trackers_detected = 0` from the payload's `forwarded` and `answeredLocally` fields, and apply the delta and negative-delta rules.

#### Scenario: Valid DNS message
- **WHEN** a DNS message for router 1 arrives and a baseline exists with lower counters
- **THEN** a `DnsStat` row with the deltas is inserted for router 1

#### Scenario: dnsmasq restarted
- **WHEN** a DNS message arrives with `forwarded` lower than the baseline
- **THEN** no `DnsStat` row is inserted and the payload values replace the baseline
