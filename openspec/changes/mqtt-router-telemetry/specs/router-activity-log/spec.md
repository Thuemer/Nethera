## MODIFIED Requirements

### Requirement: Emit CONNECTED activity log on new device
The system SHALL write a `CONNECTED` `ActivityLog` row when a device MAC appears in a device snapshot (from SSH `syncDhcpLeases` or an MQTT devices message) and was not previously present in the database for this router.

#### Scenario: New device joins the network
- **WHEN** the shared device ingestion processes a MAC address not currently in the `device` table for this router
- **THEN** a new `ActivityLog` row is inserted with `eventType = "CONNECTED"`, `details = "<hostname> connected"`, `timestamp = now()`, `router_id` set to the snapshot's router, and `device_id` set to the newly created device's ID

#### Scenario: New device reported over MQTT
- **WHEN** an MQTT devices message for router 1 contains a lease whose MAC is in `reachable` and unknown to the database
- **THEN** the same `CONNECTED` row is written as for an SSH sync

### Requirement: Emit DISCONNECTED activity log when device goes offline
The system SHALL write a `DISCONNECTED` `ActivityLog` row when a device that was previously `isOnline = true` in the database transitions to `isOnline = false` in the current device snapshot, whatever transport delivered it.

#### Scenario: Device leaves the network
- **WHEN** the current device snapshot reports a device as not reachable (not in the ARP table over SSH, or not in `reachable` over MQTT)
- **AND** the device's previous `isOnline` state in the database was `true`
- **THEN** a new `ActivityLog` row is inserted with `eventType = "DISCONNECTED"`, `details = "<hostname> disconnected"`, `timestamp = now()`, `router_id` set to the snapshot's router, and `device_id` set to the device's ID

### Requirement: No duplicate events for unchanged state
The system SHALL NOT write an `ActivityLog` row if a device's online state has not changed since the last processed snapshot, including when consecutive snapshots come from different transports.

#### Scenario: Device remains online across syncs
- **WHEN** a device was `isOnline = true` in the DB and is still reachable in the current snapshot
- **THEN** no `ActivityLog` row is written for that device

#### Scenario: Transport switch with unchanged device
- **WHEN** the previous snapshot came over SSH, the current one over MQTT, and the device is reachable in both
- **THEN** no `ActivityLog` row is written for that device
