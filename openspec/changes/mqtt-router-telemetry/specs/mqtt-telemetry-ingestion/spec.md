## ADDED Requirements

### Requirement: Telemetry topic layout
The backend SHALL subscribe to these topics, where `<id>` is the numeric `Router` primary key:

| Topic | Content | Retained |
|---|---|---|
| `nethera/<id>/status` | `online` or `offline` (plain text) | yes |
| `nethera/<id>/telemetry/metadata` | router board info | yes |
| `nethera/<id>/telemetry/speed` | cumulative WAN byte counters | no |
| `nethera/<id>/telemetry/dns` | cumulative dnsmasq counters | no |
| `nethera/<id>/telemetry/devices` | DHCP leases + reachability snapshot | no |

#### Scenario: Message for a known router
- **WHEN** a valid message arrives on `nethera/1/telemetry/speed` and a `Router` with ID 1 exists
- **THEN** the message is ingested for router 1

#### Scenario: Message for an unknown router
- **WHEN** a message arrives on `nethera/99/telemetry/speed` and no `Router` with ID 99 exists
- **THEN** the message is discarded, a warning is logged, and no rows are written

### Requirement: JSON telemetry payloads
Every telemetry payload SHALL be a JSON object containing `v` (schema version, integer, currently `1`) and `ts` (router Unix time in seconds), plus these stream-specific fields:

- metadata: `model` (string, optional), `firmware` (string, optional; a missing or empty field keeps the stored value)
- speed: `iface` (string), `rxBytes` (integer), `txBytes` (integer)
- dns: `forwarded` (integer), `answeredLocally` (integer)
- devices: `leases` (array of `{mac, ip, hostname}`), `reachable` (array of MAC strings), `wifi` (array of MAC strings)

MAC addresses SHALL be normalized to lowercase by the backend.

#### Scenario: Valid devices payload
- **WHEN** a devices payload with `v = 1`, `ts`, and the three arrays arrives
- **THEN** the backend passes the leases, reachable MACs and Wi-Fi MACs to the shared device ingestion

#### Scenario: Malformed payload
- **WHEN** a payload is not valid JSON, is missing a required field, or has an unsupported `v`
- **THEN** the message is acknowledged and discarded, a warning naming the topic is logged, and the consumer keeps processing later messages

### Requirement: Router status via Last Will
The backend SHALL set `router.isOnline` from the `status` topic. The publishing client (router agent or simulator) is expected to register `offline` as its retained MQTT Last Will and to publish a retained `online` after it connects.

#### Scenario: Agent connects
- **WHEN** `online` is received on `nethera/1/status`
- **THEN** `router.isOnline` is set to `true` and `router.lastSeen` is set to now

#### Scenario: Agent disconnects ungracefully
- **WHEN** the broker publishes the Last Will `offline` on `nethera/1/status`
- **THEN** `router.isOnline` is set to `false` and `router.lastSeen` is left unchanged

### Requirement: Telemetry freshness tracking
The backend SHALL record, per router and per stream (speed, dns, devices), the time the last valid MQTT message was ingested. A stream counts as **fresh** if that time is within `nethera.mqtt.stale-after` (default `180s`). The metadata stream is published rarely and retained, so it SHALL count as fresh exactly while the router's MQTT status is `online`, whatever the age of the last metadata message.

#### Scenario: Stream is fresh
- **WHEN** a valid speed message for router 1 was ingested 30 seconds ago
- **THEN** the speed stream of router 1 is reported as fresh

#### Scenario: Metadata fresh while router is online
- **WHEN** the last status for router 1 was `online` and the last metadata message arrived 600 seconds ago
- **THEN** the metadata stream of router 1 is reported as fresh

#### Scenario: Metadata stale after Last Will
- **WHEN** `offline` is received on `nethera/1/status`, or no status has been received since backend start
- **THEN** the metadata stream of router 1 is reported as stale

#### Scenario: Stream goes stale
- **WHEN** the last valid DNS message for router 1 was ingested more than 180 seconds ago, or none has been received since backend start
- **THEN** the DNS stream of router 1 is reported as stale

### Requirement: Valid telemetry refreshes router lastSeen
Every valid telemetry message (metadata, speed, dns, devices) SHALL set `router.lastSeen` to now for the router in its topic, just as a successful SSH sync did. Invalid payloads SHALL NOT change `lastSeen`.

#### Scenario: Speed message keeps lastSeen current
- **WHEN** a valid speed message for router 1 is ingested
- **THEN** `router.lastSeen` of router 1 is set to now

#### Scenario: Invalid payload
- **WHEN** a payload for router 1 fails validation
- **THEN** `router.lastSeen` of router 1 is unchanged

### Requirement: MQTT ingestion can be disabled
The backend SHALL NOT connect to the broker when `nethera.telemetry.mode = ssh`.

#### Scenario: SSH-only mode
- **WHEN** the backend starts with `nethera.telemetry.mode = ssh`
- **THEN** no MQTT connection is attempted and startup does not fail if no broker is available

### Requirement: Development router simulator
The repository SHALL contain `scripts/mqtt-simulate-router.sh <id>`. It publishes valid telemetry following the contract above for the given router ID, by running `mosquitto_pub` in a Docker container on the Compose network, so neither a router nor a local MQTT client install is needed. It SHALL publish retained `online` on start and `offline` when stopped.

#### Scenario: Simulating router 1 against the Compose stack
- **WHEN** the developer runs `scripts/mqtt-simulate-router.sh 1` with the stack running
- **THEN** `SpeedStat`, `DnsStat` and `ConnectedDevice` rows for router 1 appear in the database within two publish cycles

#### Scenario: Simulated device goes offline
- **WHEN** the simulator drops a previously reachable MAC from `reachable`
- **THEN** a `DISCONNECTED` `ActivityLog` row is written for that device
