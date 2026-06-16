## ADDED Requirements

### Requirement: Emit CONNECTED activity log on new device
The system SHALL write a `CONNECTED` `ActivityLog` row when a device MAC appears in the DHCP lease sync result and was not previously present in the database for this router.

#### Scenario: New device joins the network
- **WHEN** `syncDhcpLeases` processes a MAC address not currently in the `device` table for this router
- **THEN** a new `ActivityLog` row is inserted with `eventType = "CONNECTED"`, `details = "<hostname> connected"`, `timestamp = now()`, `router_id = 1`, and `device_id` set to the newly created device's ID

### Requirement: Emit DISCONNECTED activity log when device goes offline
The system SHALL write a `DISCONNECTED` `ActivityLog` row when a device that was previously `isOnline = true` in the database transitions to `isOnline = false` in the current sync.

#### Scenario: Device leaves the network
- **WHEN** `syncDhcpLeases` determines a device is no longer present in the ARP table (after pinging)
- **AND** the device's previous `isOnline` state in the database was `true`
- **THEN** a new `ActivityLog` row is inserted with `eventType = "DISCONNECTED"`, `details = "<hostname> disconnected"`, `timestamp = now()`, `router_id = 1`, and `device_id` set to the device's ID

### Requirement: No duplicate events for unchanged state
The system SHALL NOT write an `ActivityLog` row if a device's online state has not changed since the last sync.

#### Scenario: Device remains online across syncs
- **WHEN** a device was `isOnline = true` in the DB and is still present in the ARP table after the current sync
- **THEN** no `ActivityLog` row is written for that device
