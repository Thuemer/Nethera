## ADDED Requirements

### Requirement: UCI configuration
The agent SHALL read its settings from the UCI section `nethera.agent` in `/etc/config/nethera`:

| Option | Default | Meaning |
|---|---|---|
| `enabled` | `0` | service only starts when `1` |
| `router_id` | — (required) | numeric `Router` ID used in topics |
| `broker` | — (required) | broker host name or IP |
| `port` | `1883` | broker port |
| `username` | `router-<router_id>` | MQTT user |
| `password` | — (required) | MQTT password |
| `interval` | `30` | seconds between speed/dns/devices publishes (minimum 10) |
| `wan_iface` | empty | WAN netdev; empty means `l3_device` of `network.interface.wan` |
| `tls_ca` | empty | reserved for TLS; MUST be ignored in this version |

#### Scenario: Valid configuration
- **WHEN** `enabled=1` and `router_id`, `broker` and `password` are set
- **THEN** the service starts and uses topic prefix `nethera/<router_id>/`

#### Scenario: Missing required option
- **WHEN** `router_id`, `broker` or `password` is empty
- **THEN** the service does not start and logs an error naming the missing option to syslog

#### Scenario: Configuration changed
- **WHEN** `/etc/config/nethera` is changed and `reload_config` runs
- **THEN** procd restarts the agent with the new settings

### Requirement: procd service lifecycle
The agent SHALL run as the procd service `nethera-agent`, start at boot after the network, and be restarted by procd without a retry limit if it exits.

#### Scenario: Router boots
- **WHEN** the router boots with the service enabled
- **THEN** the agent starts and publishes retained `online` once the broker is reachable

#### Scenario: Graceful stop
- **WHEN** the service is stopped (`/etc/init.d/nethera-agent stop` or a reboot)
- **THEN** the agent stops its status connection first, then publishes retained `offline` on `nethera/<id>/status`, then exits

### Requirement: Status connection with Last Will
The agent SHALL keep one long-lived MQTT connection that registers retained `offline` (QoS 1) as Last Will on `nethera/<id>/status` with a 30 s keepalive, subscribes to that topic, and publishes retained `online` (QoS 1) after it connects. Whenever this connection receives `offline` on its own status topic while the agent is running, the agent SHALL publish retained `online` again. The agent SHALL restart the status connection with backoff (5 s doubling up to 60 s) when it exits, including when the initial connect fails.

#### Scenario: Agent starts
- **WHEN** the status connection is established
- **THEN** retained `online` is published on `nethera/<id>/status`

#### Scenario: Router loses power
- **WHEN** the router stops without a graceful stop
- **THEN** the broker publishes the Last Will `offline` within about 45 s

#### Scenario: Broker restarts or network outage longer than the keepalive
- **WHEN** the broker has published the Last Will `offline` and the status connection reconnects
- **THEN** the connection receives the retained `offline` and the agent publishes retained `online` again

#### Scenario: Broker unreachable at start
- **WHEN** the broker is not reachable when the agent starts
- **THEN** the agent keeps retrying the status connection with backoff and does not exit

### Requirement: Metadata stream
The agent SHALL publish `{"v":1,"ts":<unix>,"model":…,"firmware":…}` retained with QoS 1 on `nethera/<id>/telemetry/metadata`, taking `model` and `release.description` from `ubus call system board`. It SHALL publish metadata on start and each time it republishes `online`, and not periodically.

#### Scenario: Agent connects
- **WHEN** the agent publishes `online`
- **THEN** a metadata message with the board's model and firmware description is published retained before or right after it

### Requirement: Speed stream
Every interval the agent SHALL publish `{"v":1,"ts":<unix>,"iface":<name>,"rxBytes":<n>,"txBytes":<n>}` with QoS 0, not retained, on `nethera/<id>/telemetry/speed`. The values are the cumulative receive and transmit byte counters of the WAN interface from `/proc/net/dev`. The WAN interface is `wan_iface` if set, otherwise the `l3_device` of `network.interface.wan`. The agent SHALL NOT publish speed until the system clock has been synchronized by NTP since boot.

#### Scenario: Normal cycle
- **WHEN** the clock is NTP-synchronized and the WAN interface exists in `/proc/net/dev`
- **THEN** a speed message with that interface's cumulative counters is published

#### Scenario: PPPoE WAN
- **WHEN** `wan_iface` is empty and `network.interface.wan` reports `l3_device = pppoe-wan`
- **THEN** counters are read from `pppoe-wan` and `iface` is `pppoe-wan`

#### Scenario: Clock not yet synchronized
- **WHEN** the router has booted and NTP has not synchronized yet
- **THEN** no speed message is published, while status, metadata, dns and devices are published as usual

#### Scenario: WAN interface missing
- **WHEN** the resolved WAN interface is not in `/proc/net/dev`
- **THEN** no speed message is published for this cycle and a warning is logged

### Requirement: DNS stream
Every interval the agent SHALL publish `{"v":1,"ts":<unix>,"forwarded":<n>,"answeredLocally":<n>}` with QoS 1, not retained, on `nethera/<id>/telemetry/dns`, using the cumulative dnsmasq counters `dns_queries_forwarded` and `dns_local_answered` from `ubus call dnsmasq metrics`. If that ubus method is not available, the agent SHALL send `SIGUSR1` to dnsmasq and parse the newest `queries forwarded …, queries answered locally …` line from `logread`.

#### Scenario: ubus metrics available
- **WHEN** `ubus call dnsmasq metrics` returns both counters
- **THEN** a dns message with those values is published and no signal is sent to dnsmasq

#### Scenario: Fallback to logread
- **WHEN** the ubus method is not available and `logread` contains a stats line written after the signal
- **THEN** a dns message with the parsed values is published

#### Scenario: No DNS data
- **WHEN** neither source yields both counters
- **THEN** no dns message is published for this cycle and a warning is logged

### Requirement: Devices stream
Every interval the agent SHALL publish `{"v":1,"ts":<unix>,"leases":[{"mac","ip","hostname"}…],"reachable":[…],"wifi":[…]}` with QoS 1, not retained, on `nethera/<id>/telemetry/devices`, using the same sources and rules as the SSH device sync:
- `leases`: every line of `/tmp/dhcp.leases` (MAC, IP, hostname; `*` kept as given)
- `reachable`: after pinging every lease IP once (1 s timeout, in parallel) and waiting 2 s, every MAC in `/proc/net/arp` with flags other than `0x0` and not `00:00:00:00:00:00`
- `wifi`: station MACs from `iw dev <if> station dump` for every wireless interface

MACs SHALL be lowercase. The payload SHALL be valid JSON even when hostnames contain quotes or backslashes.

#### Scenario: Normal cycle
- **WHEN** the router has leases, ARP entries and Wi-Fi stations
- **THEN** a devices message containing all three lists is published

#### Scenario: No Wi-Fi tool
- **WHEN** `iw` is not installed or reports no interfaces
- **THEN** the devices message is published with an empty `wifi` array

#### Scenario: Hostname with special characters
- **WHEN** a lease hostname contains `"` or `\`
- **THEN** the published payload is still valid JSON with the hostname escaped

### Requirement: Failure isolation and no buffering
A failing collector or publish SHALL NOT stop the agent or the other streams. The agent SHALL NOT queue messages while the broker is unreachable, because speed and DNS are cumulative and devices is a full snapshot, so the next successful message covers the gap. Each `mosquitto_pub` call SHALL be bounded by a timeout (10 s), so an unreachable broker cannot block the cycle.

#### Scenario: One collector fails
- **WHEN** the DNS collector yields no data in a cycle
- **THEN** speed and devices are still published in that cycle

#### Scenario: Broker down for several cycles
- **WHEN** publishes fail for several cycles and the broker becomes reachable again
- **THEN** the next cycle publishes current values, and no backlog of old messages is sent

#### Scenario: Broker host does not answer
- **WHEN** a publish hangs because the broker host drops packets
- **THEN** the publish is aborted after 10 s and the cycle continues

### Requirement: Payload contract conformance
Every payload the agent publishes SHALL satisfy the `mqtt-telemetry-ingestion` contract (`v = 1`, integer `ts`, the required stream fields with the stated JSON types). The collectors SHALL be testable off the router by pointing them at fixture files instead of `/proc`, `/tmp` and command output.

#### Scenario: Fixture test
- **WHEN** the collector tests run in a BusyBox container against captured router fixtures
- **THEN** each produced payload parses as JSON and has the fields and types that the backend's `TelemetryPayloadParser` requires

### Requirement: Installation and upgrade persistence
The repository SHALL contain `scripts/router-deploy.sh <router-host>` that copies the agent files to the router over SSH, installs the MQTT client package with `apk`, keeps an existing `/etc/config/nethera`, and enables and restarts the service. The agent files SHALL be listed in `/lib/upgrade/keep.d/nethera-agent` so they survive `sysupgrade`.

#### Scenario: First install
- **WHEN** the deploy script runs against a router without the agent
- **THEN** the files are installed, a template `/etc/config/nethera` with `enabled=0` is created, and the script tells the user which options to set

#### Scenario: Update
- **WHEN** the deploy script runs against a router that already has the agent configured
- **THEN** the agent files are replaced, `/etc/config/nethera` is unchanged, and the service is restarted

#### Scenario: Firmware upgrade
- **WHEN** the router is upgraded with `sysupgrade` keeping settings
- **THEN** the agent files and config are still present afterwards; only the MQTT client package has to be reinstalled
