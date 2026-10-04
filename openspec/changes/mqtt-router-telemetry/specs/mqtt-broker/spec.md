## ADDED Requirements

### Requirement: Mosquitto broker in the Compose stack
The root `compose.yaml` SHALL include a `mosquitto` service based on `eclipse-mosquitto:2`. It SHALL listen on port 1883, persist its data in a named volume, and have the backend depend on it.

#### Scenario: Broker starts with the stack
- **WHEN** `docker compose up -d --build` is run
- **THEN** the `mosquitto` service is running and accepts MQTT connections on host port 1883

#### Scenario: Backend reaches the broker by service name
- **WHEN** the backend container starts
- **THEN** it connects to the broker at host `mosquitto`, port 1883, and logs a successful MQTT connection

### Requirement: Anonymous access is disabled
The broker SHALL reject clients that do not authenticate with a username and password from its password file.

#### Scenario: Anonymous client rejected
- **WHEN** a client connects without credentials
- **THEN** the broker refuses the connection with a "not authorized" reason code

#### Scenario: Backend authenticates
- **WHEN** the backend connects with the credentials from `NETHERA_MQTT_BACKEND_PASSWORD` (default for local demo only)
- **THEN** the connection is accepted

### Requirement: Per-router topic ACL
The broker SHALL use an ACL file in which router user `router-<id>` may only publish to `nethera/<id>/#`, and the backend user may only subscribe to `nethera/+/#`.

#### Scenario: Router publishes to its own namespace
- **WHEN** user `router-1` publishes to `nethera/1/telemetry/speed`
- **THEN** the broker accepts and delivers the message

#### Scenario: Router publishes to another router's namespace
- **WHEN** user `router-1` publishes to `nethera/2/telemetry/speed`
- **THEN** the broker drops the message and no subscriber receives it

#### Scenario: Backend cannot publish telemetry
- **WHEN** the backend user publishes to `nethera/1/telemetry/speed`
- **THEN** the broker drops the message
