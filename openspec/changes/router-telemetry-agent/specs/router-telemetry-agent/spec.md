## ADDED Requirements

### Requirement: UCI configuration
The agent SHALL be configured through the UCI section `nethera.agent` in `/etc/config/nethera`:

| Option | Default | Meaning |
|---|---|---|
| `enabled` | `0` | service only starts when `1` |
| `router_id` | — (required) | numeric `Router` ID used in topics |
| `broker` | — (required) | broker host name or IP |
| `transport` | `wss` | `wss` (MQTT over WebSockets with TLS), `ws` (WebSockets without TLS) or `tcp` (plain MQTT) |
| `port` | by transport: `443` for `wss`, `9001` for `ws`, `1883` for `tcp` | broker port |
| `ws_path` | `/mqtt` | request path for `wss` and `ws`; ignored for `tcp` |
| `username` | `router-<router_id>` | MQTT user |
| `password` | — (required) | MQTT password |
| `interval` | `30` | seconds between speed/dns/devices publishes (minimum 10) |
| `wan_iface` | empty | WAN netdev; empty means the device of the interface that holds the default route |
| `tls_ca` | empty | PEM file that replaces the system CA bundle for `wss` |

The init script SHALL validate the section and hand the settings to the agent as environment variables, so the password is not part of the command line.

#### Scenario: Valid configuration
- **WHEN** `enabled=1` and `router_id`, `broker` and `password` are set
- **THEN** the service starts, connects to `wss://<broker>:443/mqtt` and uses topic prefix `nethera/<router_id>/`

#### Scenario: Development broker on the LAN
- **WHEN** `transport=tcp` and `port` is not set
- **THEN** the agent connects with plain MQTT on port 1883 and logs one warning that the connection is not encrypted

#### Scenario: Missing required option
- **WHEN** `router_id`, `broker` or `password` is empty
- **THEN** the service does not start and logs an error naming the missing option to syslog

#### Scenario: Unknown transport
- **WHEN** `transport` is not one of `wss`, `ws`, `tcp`
- **THEN** the service does not start and logs an error naming the allowed values

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
- **THEN** the agent publishes retained `offline` on `nethera/<id>/status`, disconnects cleanly and exits

### Requirement: Broker connection and TLS
The agent SHALL keep one long-lived MQTT connection with a 30 s keepalive over the configured transport. For `wss` it SHALL verify the server certificate and host name against the system CA bundle, or against `tls_ca` if set, and SHALL NOT offer a way to skip that verification. When the connection is lost or cannot be established, the agent SHALL keep retrying with a backoff from 5 s up to 60 s and SHALL NOT exit.

#### Scenario: Cloud broker
- **WHEN** `broker` is the LeoCloud host and `transport=wss`
- **THEN** the agent connects on port 443 with path `/mqtt`, the certificate is validated with the router's CA bundle, and the login as `router-<id>` succeeds

#### Scenario: Wrong password
- **WHEN** the broker refuses the login
- **THEN** the agent logs the refusal once, keeps retrying with backoff and does not exit

#### Scenario: Certificate cannot be validated
- **WHEN** the server certificate is not trusted, or does not match the host name
- **THEN** the connection is not established and the reason is logged

#### Scenario: Clock not synchronized yet
- **WHEN** the router has just booted and its clock is before the certificate's start date
- **THEN** the connect fails with a certificate error, the agent retries with backoff, and it connects once NTP has set the clock

#### Scenario: Broker unreachable at start
- **WHEN** the broker is not reachable when the agent starts
- **THEN** the agent keeps retrying with backoff and does not exit

### Requirement: Status with Last Will
The connection SHALL register retained `offline` (QoS 1) as Last Will on `nethera/<id>/status`. After every successful connect, including every reconnect, the agent SHALL publish retained `online` (QoS 1) on that topic.

#### Scenario: Agent starts
- **WHEN** the connection is established
- **THEN** retained `online` is published on `nethera/<id>/status`

#### Scenario: Router loses power
- **WHEN** the router stops without a graceful stop
- **THEN** the broker publishes the Last Will `offline` within about 45 s

#### Scenario: Broker restarts or network outage longer than the keepalive
- **WHEN** the broker has published the Last Will `offline` and the agent reconnects
- **THEN** the agent publishes retained `online` again without being restarted

### Requirement: Metadata stream
The agent SHALL publish `{"v":1,"ts":<unix>,"model":…,"firmware":…}` retained with QoS 1 on `nethera/<id>/telemetry/metadata`, taking `model` and `release.description` from `ubus call system board`. It SHALL publish metadata after every connect, before `online`, and not periodically.

#### Scenario: Agent connects
- **WHEN** the agent connects or reconnects
- **THEN** a retained metadata message with the board's model and firmware description is published, followed by `online`

#### Scenario: Test router
- **WHEN** the agent runs on the Cudy WR3000S with OpenWrt 25.12.5
- **THEN** `model` is `Cudy WR3000S v1` and `firmware` starts with `OpenWrt 25.12.5`

### Requirement: Speed stream
Every interval the agent SHALL publish `{"v":1,"ts":<unix>,"iface":<name>,"rxBytes":<n>,"txBytes":<n>}` with QoS 0, not retained, on `nethera/<id>/telemetry/speed`. The values are the cumulative receive and transmit byte counters of the WAN interface from `/proc/net/dev`. The WAN interface is `wan_iface` if set, otherwise the `l3_device` of the logical interface that holds the IPv4 default route. The agent SHALL NOT publish speed until the system clock has been synchronized by NTP since boot, or 5 minutes have passed since the agent started.

#### Scenario: Normal cycle
- **WHEN** the clock is NTP-synchronized and the WAN interface exists in `/proc/net/dev`
- **THEN** a speed message with that interface's cumulative counters is published

#### Scenario: Uplink over a Wi-Fi client interface
- **WHEN** `wan_iface` is empty and the default route goes through `phy1-sta0`, while the `wan` port has no link
- **THEN** counters are read from `phy1-sta0` and `iface` is `phy1-sta0`

#### Scenario: PPPoE WAN
- **WHEN** `wan_iface` is empty and the default route goes through `pppoe-wan`
- **THEN** counters are read from `pppoe-wan` and `iface` is `pppoe-wan`

#### Scenario: Clock not yet synchronized
- **WHEN** the agent has been running for less than 5 minutes and NTP has not synchronized yet
- **THEN** no speed message is published, while status, metadata, dns and devices are published as usual

#### Scenario: NTP never reports
- **WHEN** 5 minutes have passed since the agent started without an NTP synchronization event
- **THEN** the agent logs one warning and publishes speed from then on

#### Scenario: WAN interface missing
- **WHEN** no WAN interface can be resolved, or the resolved one is not in `/proc/net/dev`
- **THEN** no speed message is published for this cycle and a warning is logged once

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
- **THEN** no dns message is published for this cycle and a warning is logged once

### Requirement: Devices stream
Every interval the agent SHALL publish `{"v":1,"ts":<unix>,"leases":[{"mac","ip","hostname"}…],"reachable":[…],"wifi":[…]}` with QoS 1, not retained, on `nethera/<id>/telemetry/devices`, using the same sources and rules as the SSH device sync:
- `leases`: every line of `/tmp/dhcp.leases` (MAC, IP, hostname; `*` kept as given)
- `reachable`: after pinging every lease IP once (1 s timeout, in parallel) and waiting 2 s, every MAC in `/proc/net/arp` with flags other than `0x0` and not `00:00:00:00:00:00`
- `wifi`: station MACs from `iw dev <if> station dump` for every wireless interface

MACs SHALL be lowercase. The three lists SHALL always be present as JSON arrays, also when empty. The payload SHALL be valid JSON even when hostnames contain quotes or backslashes.

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
A failing collector or publish SHALL NOT stop the agent or the other streams. The agent SHALL NOT queue messages while the broker is unreachable, because speed and DNS are cumulative and devices is a full snapshot, so the next successful message covers the gap. Each publish SHALL be bounded by a timeout (10 s), so an unresponsive broker cannot block the cycle.

#### Scenario: One collector fails
- **WHEN** the DNS collector yields no data in a cycle
- **THEN** speed and devices are still published in that cycle

#### Scenario: Broker down for several cycles
- **WHEN** the connection is down for several cycles and comes back
- **THEN** the next cycle publishes current values, and no backlog of old messages is sent

#### Scenario: Broker does not answer
- **WHEN** a publish gets no result because the broker host drops packets
- **THEN** the publish is given up after 10 s and the cycle continues

### Requirement: Payload contract conformance
Every payload the agent publishes SHALL satisfy the `mqtt-telemetry-ingestion` contract (`v = 1`, integer `ts`, the required stream fields with the stated JSON types). The collectors SHALL be testable off the router by pointing them at fixture files and a fake command runner instead of `/proc`, `/tmp` and real commands.

#### Scenario: Fixture test
- **WHEN** `go test` runs in `router/agent` on a developer machine against captured router fixtures
- **THEN** each produced payload parses as JSON and has the fields and types that the backend's `TelemetryPayloadParser` requires

### Requirement: Dry run
`nethera-agent -dry-run` SHALL run every collector once, print one `<topic> <payload>` line per message to standard output, connect to no broker, and exit with status 0. It SHALL work with only `router_id` configured.

#### Scenario: Checking a router by hand
- **WHEN** `nethera-agent -dry-run` is run on the router
- **THEN** lines for metadata, speed, dns and devices are printed, each payload is valid JSON, and no broker receives anything

### Requirement: Build, installation and upgrade persistence
The agent SHALL be built as one static `linux/arm64` binary that needs no additional package to run. The repository SHALL contain `scripts/router-deploy.sh <router-host>` that runs the tests, builds the binary, copies it and the service files to the router over SSH, installs `iw` with `apk`, keeps an existing `/etc/config/nethera`, and enables and restarts the service. The agent files SHALL be listed in `/lib/upgrade/keep.d/nethera-agent` so they survive `sysupgrade`.

#### Scenario: First install
- **WHEN** the deploy script runs against a router without the agent
- **THEN** the files are installed, a template `/etc/config/nethera` with `enabled=0` is created, and the script tells the user which options to set

#### Scenario: Update
- **WHEN** the deploy script runs against a router that already has the agent configured
- **THEN** the binary and service files are replaced, `/etc/config/nethera` is unchanged, and the service is restarted

#### Scenario: Tests fail
- **WHEN** `go test` fails
- **THEN** the deploy script stops before copying anything to the router

#### Scenario: Firmware upgrade
- **WHEN** the router is upgraded with `sysupgrade` keeping settings
- **THEN** the binary, the service files and the config are still present afterwards and the agent connects again; only `iw` has to be reinstalled
