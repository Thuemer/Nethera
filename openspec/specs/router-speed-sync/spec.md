## ADDED Requirements

### Requirement: Measure WAN upload and download speed via SSH
The system SHALL connect to the router via SSH, read the `wan` interface byte counters from `/proc/net/dev` twice with a 2-second interval, and compute upload and download speeds in Mb/s using the formula `(bytes_t2 − bytes_t1) / 2 / 125000`.

#### Scenario: Successful speed measurement
- **WHEN** the router is reachable via SSH and the `wan` interface appears in `/proc/net/dev`
- **THEN** a new `SpeedStat` row is inserted with `downloadSpeed`, `uploadSpeed` (both in Mb/s, rounded to one decimal), `timestamp = now()`, and `router_id = 1`

#### Scenario: Router unreachable during speed sync
- **WHEN** the SSH connection fails for any reason
- **THEN** no `SpeedStat` row is inserted and the error is logged as a warning

### Requirement: WAN interface name is configurable
The system SHALL read the WAN interface name from `@ConfigProperty(name = "nethera.router.wan-interface")` with a default value of `"wan"`.

#### Scenario: Default interface used when not configured
- **WHEN** no `nethera.router.wan-interface` property is set
- **THEN** the system reads byte counters from the `wan` interface
