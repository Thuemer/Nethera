## ADDED Requirements

### Requirement: Update router metadata from MQTT
For metadata messages received over MQTT, the system SHALL update `router.model` and `router.firmware` from the payload's `model` and `firmware` fields and set `router.lastSeen = now()`. Null or empty fields SHALL leave the stored value unchanged.

#### Scenario: Retained metadata on backend start
- **WHEN** the backend subscribes and the broker delivers the retained metadata message for router 1
- **THEN** `router.model` and `router.firmware` of router 1 are updated

#### Scenario: Metadata without firmware
- **WHEN** a metadata message arrives with `model` set and `firmware` missing or empty
- **THEN** only `router.model` and `router.lastSeen` are updated

### Requirement: Online state is driven by the active transport
When the metadata stream is fresh over MQTT, `router.isOnline` SHALL follow the MQTT status topic and SHALL NOT be changed by SSH. When the metadata stream is stale or the mode is `ssh`, the existing SSH behavior SHALL apply (success → online, failure → offline).

#### Scenario: Agent offline in auto mode
- **WHEN** `offline` is received on `nethera/1/status` in `auto` mode
- **THEN** `router.isOnline` is set to `false`, the metadata stream becomes stale, and on the next scheduler cycle the SSH metadata sync runs and sets `isOnline` from its result
