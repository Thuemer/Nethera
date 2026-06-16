## ADDED Requirements

### Requirement: Collect DNS query stats from dnsmasq via SIGUSR1
The system SHALL send `SIGUSR1` to the dnsmasq process on the router, wait 1 second, then read the latest stats block from `/var/log/messages` to extract `queries forwarded` and `queries answered locally` values.

#### Scenario: Successful DNS stats collection
- **WHEN** dnsmasq is running and `/var/log/messages` contains a stats block with a timestamp within the last 5 seconds
- **THEN** `total_queries = forwarded + answered_locally`, `blocked_queries = answered_locally`, `trackers_detected = 0` are computed and a `DnsStat` row is inserted with the delta since the previous snapshot

#### Scenario: Stale or missing stats block
- **WHEN** the parsed stats timestamp in `/var/log/messages` is older than 5 seconds, or no stats block is found
- **THEN** no `DnsStat` row is inserted and a warning is logged

#### Scenario: Router unreachable during DNS sync
- **WHEN** the SSH connection fails for any reason
- **THEN** no `DnsStat` row is inserted and the error is logged as a warning

### Requirement: DNS stats are stored as deltas
The system SHALL compute the difference between the current dnsmasq cumulative counters and the values from the previous sync cycle, and store only the delta as a `DnsStat` row.

#### Scenario: First sync cycle after startup
- **WHEN** no previous snapshot exists (first run since backend start)
- **THEN** no `DnsStat` row is inserted; the current cumulative values are saved as the baseline for the next cycle

#### Scenario: Subsequent sync cycle
- **WHEN** a previous snapshot exists
- **THEN** the delta `(current − previous)` is inserted as a new `DnsStat` row with `timestamp = now()`

### Requirement: Negative deltas are discarded
The system SHALL discard a delta if any counter decreased (indicating dnsmasq restarted and counters reset).

#### Scenario: dnsmasq restarted between snapshots
- **WHEN** the current cumulative value is less than the previously stored value
- **THEN** no `DnsStat` row is inserted and the current value replaces the stored baseline
