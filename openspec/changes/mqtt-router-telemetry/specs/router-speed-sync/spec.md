## ADDED Requirements

### Requirement: Compute WAN speed from pushed byte counters
For speed messages received over MQTT, the system SHALL compute download and upload speed in Mb/s from two consecutive cumulative counter samples of the same router: `(bytes_now − bytes_prev) / (ts_now − ts_prev) / 125000`, rounded to one decimal. `ts` is the router-supplied timestamp.

#### Scenario: First sample after backend start
- **WHEN** the first speed message for router 1 arrives and no previous sample is held
- **THEN** no `SpeedStat` row is inserted and the sample is stored as the baseline

#### Scenario: Consecutive samples
- **WHEN** a speed message arrives with `ts` 30 seconds after the baseline, `rxBytes` 37,500,000 higher and `txBytes` 3,750,000 higher
- **THEN** a `SpeedStat` row is inserted with `downloadSpeed = 10.0`, `uploadSpeed = 1.0`, `timestamp = now()` and the matching `router_id`, and the new sample becomes the baseline

#### Scenario: Counter reset or invalid interval
- **WHEN** either counter is lower than the baseline (router reboot or counter wrap), or `ts_now ≤ ts_prev`
- **THEN** no `SpeedStat` row is inserted and the new sample replaces the baseline
