## ADDED Requirements

### Requirement: Scheduler runs all sync operations on a fixed interval
The system SHALL use a Quarkus `@Scheduled` method to trigger all router sync operations (metadata, speed, DNS, DHCP/devices) every 60 seconds.

#### Scenario: Scheduler fires on interval
- **WHEN** 60 seconds have elapsed since the last execution
- **THEN** `syncRouterMetadata`, `syncSpeed`, `syncDnsStats`, and `syncDhcpLeases` are each called for router ID 1 in sequence

#### Scenario: One sync operation fails
- **WHEN** any individual sync method throws an exception
- **THEN** the remaining sync methods still execute and the failure is logged as a warning without stopping the scheduler

### Requirement: Sync interval is configurable
The system SHALL read the scheduler interval from `@ConfigProperty(name = "nethera.sync.interval")` with a default of `"60s"`.

#### Scenario: Default interval used when not configured
- **WHEN** no `nethera.sync.interval` property is set
- **THEN** the scheduler fires every 60 seconds

### Requirement: quarkus-scheduler dependency is present
The system SHALL declare `quarkus-scheduler` as a dependency in `pom.xml` so that `@Scheduled` is available at runtime.

#### Scenario: Application starts with scheduler active
- **WHEN** the Quarkus application starts
- **THEN** the scheduler bean is registered and the first sync fires after the configured interval
