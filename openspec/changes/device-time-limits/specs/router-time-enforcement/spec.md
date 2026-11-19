## ADDED Requirements

### Requirement: Backend publishes the desired time state
The backend SHALL publish, per router, the complete effective time rules of all its devices with a valid MAC address as one retained MQTT message on `nethera/<routerId>/config/time` with QoS 1. The message SHALL contain the schema version `v`, a positive `version`, the router's `timezone`, `untilClockSync` (`OPEN` or `BLOCK`) and a map from lowercase MAC address to `{windows, budgets, override}`. Devices without any active rule SHALL be omitted. The backend SHALL publish after every committed change of schedules, assignments, overrides, groups, group memberships or the time settings, and once at startup. `version` SHALL only increase when the content changed.

#### Scenario: Schedule changed
- **WHEN** the owner changes a window of a schedule assigned to a group with two devices
- **THEN** after the commit the backend publishes a new version that contains the changed window for both MAC addresses

#### Scenario: Nothing changed
- **WHEN** a change is saved that does not alter the effective rules
- **THEN** the published version stays the same

#### Scenario: Rolled back request
- **WHEN** a request fails and its transaction is rolled back
- **THEN** nothing is published

#### Scenario: SSH telemetry mode
- **WHEN** the backend runs with telemetry mode `ssh`
- **THEN** no time state is published and rules are only stored

### Requirement: Agent validates and keeps the desired state
The router agent SHALL subscribe to `config/time`. It SHALL refuse a message with an unsupported schema version, a non-positive version, an unknown time zone, an invalid MAC address, an invalid time or weekday, or more than 100 devices, keep its previous state and report the error. A valid message SHALL be saved on flash and loaded at boot, so the rules apply after a power cut even without internet.

#### Scenario: Invalid MAC
- **WHEN** a message contains the key `"AA:BB:CC:DD:EE"`
- **THEN** the agent keeps the previous rules and reports an error for the received version

#### Scenario: Reboot without internet
- **WHEN** the router reboots and cannot reach the broker
- **THEN** the agent enforces the last saved rules

### Requirement: Blocking means no internet access
A blocked device SHALL NOT be able to send traffic through the router to the internet (IPv4 and IPv6), identified by its MAC address. Traffic inside the home network, DHCP and DNS to the router SHALL NOT be affected. Existing connections SHALL be interrupted when the block starts. A device that is no longer blocked SHALL regain access without reconnecting.

#### Scenario: Window starts during a video call
- **WHEN** a window starts while the device has an open connection to the internet
- **THEN** the connection stops working

#### Scenario: Printer during a block
- **WHEN** a blocked device prints on a printer in the home network
- **THEN** the print job works

### Requirement: Agent evaluates the rules itself
The agent SHALL evaluate each device's effective rule in the router's configured time zone (including daylight saving time) at least once per minute and immediately after a new valid message, using the order of `time-schedules` (manual block, manual allow, windows, budget). It SHALL NOT depend on the backend or broker being reachable to start or end a block.

#### Scenario: Window ends while the cloud is unreachable
- **WHEN** a window ends at 07:00 and the router has had no broker connection since 22:00
- **THEN** the device has internet access again at 07:00 at the latest one minute later

#### Scenario: Change takes effect quickly
- **WHEN** the owner sets "Jetzt offline" for a device and the router is connected
- **THEN** the device is blocked within a few seconds after the message arrives

#### Scenario: Daylight saving time
- **WHEN** a window from 21:00 to 07:00 is evaluated on the day after the switch to summer time
- **THEN** the block starts at 21:00 local time

#### Scenario: Override expires
- **WHEN** a `BLOCK` override with `until` 18:00 is active and the clock passes 18:00
- **THEN** the device's windows and budget apply again

### Requirement: Router counts used minutes per device
For every device with a budget, the agent SHALL count used minutes per local day. A minute SHALL count when the device sent more than a fixed traffic threshold through the router to the internet within that minute. The count SHALL reset at local midnight. Minutes during an `ALLOW` override SHALL be counted but SHALL NOT lead to a budget block. The count SHALL be saved on flash at least every 5 minutes and SHALL be restored after a reboot on the same local day.

#### Scenario: Budget used up
- **WHEN** a device with a 60-minute budget today reaches 60 used minutes
- **THEN** the agent blocks the device with reason `budget` until local midnight

#### Scenario: Phone idle in the WLAN
- **WHEN** a device is connected but sends only background traffic below the threshold
- **THEN** no minutes are counted

#### Scenario: Reboot at noon
- **WHEN** the router reboots at 12:00 after 45 counted minutes
- **THEN** counting continues from at least 40 minutes

### Requirement: Behaviour while the clock is not synchronised
Until NTP has set the router's clock after a boot, the agent SHALL NOT evaluate windows, budgets or timed overrides and SHALL NOT count minutes. With `untilClockSync` `OPEN`, only overrides with `until: null` SHALL apply. With `BLOCK`, every device that has any rule SHALL be blocked (reason `clock`), except devices with an `ALLOW` override with `until: null`.

#### Scenario: Default after power cut
- **WHEN** the router boots at night without NTP access and `untilClockSync` is `OPEN`
- **THEN** devices with a night window have internet access until the clock is synchronised

#### Scenario: Strict setting
- **WHEN** the same happens with `untilClockSync` `BLOCK`
- **THEN** these devices are blocked until the clock is synchronised

### Requirement: Removing rules removes them from the router
When a device no longer appears in the desired state, or an assignment, override or schedule is deleted or paused, the agent SHALL remove every block and counter rule it created for that device. Rules created by the agent SHALL be kept in their own files and firewall chain and SHALL NOT touch the DNS control rules.

#### Scenario: Schedule deleted during its window
- **WHEN** the owner deletes a schedule while its window blocks a device
- **THEN** the device has internet access again after the new state is applied
