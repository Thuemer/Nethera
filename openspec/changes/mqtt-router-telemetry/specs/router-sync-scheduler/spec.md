## MODIFIED Requirements

### Requirement: Scheduler runs all sync operations on a fixed interval
The system SHALL use a Quarkus `@Scheduled` method to trigger the SSH router sync operations (metadata, speed, DNS, DHCP/devices) every 60 seconds. Depending on `nethera.telemetry.mode`, each operation SHALL be skipped if MQTT already supplies that stream.

#### Scenario: Scheduler fires on interval
- **WHEN** 60 seconds have elapsed since the last execution and `nethera.telemetry.mode = ssh`
- **THEN** `syncRouterMetadata`, `syncSpeed`, `syncDnsStats`, and `syncDhcpLeases` are each called for router ID 1 in sequence

#### Scenario: One sync operation fails
- **WHEN** any individual sync method throws an exception
- **THEN** the remaining sync methods still execute and the failure is logged as a warning without stopping the scheduler

#### Scenario: Auto mode with fresh MQTT stream
- **WHEN** the scheduler fires, `nethera.telemetry.mode = auto`, and the speed stream of router 1 is fresh
- **THEN** `syncSpeed` is not called for router 1, while the other operations whose streams are stale still run over SSH

#### Scenario: Auto mode falls back to SSH
- **WHEN** the scheduler fires, `nethera.telemetry.mode = auto`, and no MQTT telemetry was ingested for router 1 within `nethera.mqtt.stale-after`
- **THEN** all four SSH sync operations run for router 1, as in `ssh` mode

#### Scenario: MQTT-only mode
- **WHEN** the scheduler fires and `nethera.telemetry.mode = mqtt`
- **THEN** no SSH connection is opened

## ADDED Requirements

### Requirement: Telemetry transport mode is configurable
The system SHALL read `nethera.telemetry.mode` with allowed values `ssh`, `mqtt` and `auto`, defaulting to `auto`. An unknown value SHALL fail application startup with a clear error message.

#### Scenario: Default mode
- **WHEN** `nethera.telemetry.mode` is not set
- **THEN** the system runs in `auto` mode

#### Scenario: Invalid mode
- **WHEN** `nethera.telemetry.mode = pigeon`
- **THEN** the application fails to start and the log names the property and its allowed values

### Requirement: Fallback transitions are logged
In `auto` mode, the system SHALL log an INFO message once each time a router stream switches between MQTT and SSH. It SHALL NOT log on every cycle.

#### Scenario: Agent stops publishing
- **WHEN** the devices stream of router 1 becomes stale while in `auto` mode
- **THEN** one INFO line like `Router 1 devices: MQTT stale, falling back to SSH` is logged, and later cycles that stay on SSH log nothing additional
