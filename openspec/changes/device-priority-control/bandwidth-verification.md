# Bandwidth verification — 2026-11-27

## Implementation

Independent priority service now shapes WAN upload and routed LAN-bridge download using HTB. Parent rate/ceil is the configured total. Preferred and normal child rates reserve 2/3 and 1/3, both borrow up to the total; fq_codel handles each leaf. Only Nethera-owned root handles are replaced/removed. Missing/disabled limits cannot confirm a preferred device as actively shaped. Explicit backend settings take precedence over router-local fallback.

The frontend adds validated global Mbit/s controls, saving feedback and pending/confirmed states. The compatible shared-router release includes both new classes and the additive bandwidth migration; existing login, DNS/time publishers and controls remain preserved. No LeoCloud deployment was performed.

## Observed router results

- Early simultaneous client results (phone/laptop): 27.06/6.39 Mbit/s at a 60 Mbit/s ceiling; 9.08/8.39 at 20 Mbit/s. These did **not** demonstrate preferred throughput.
- Revised HTB reservations were tested with two simultaneous socket-priority UDP streams routed to a private LAN host, 8 seconds at a temporary 12 Mbit/s ceiling. Preferred bytes increased 8,008,034; normal bytes 4,006,327: approximately 8/4 Mbit/s, matching 2:1. The diagnostic is `router/tests/priority-load.go`; it sends only to an explicitly selected private LAN IP, not the Internet. This verifies scheduler allocation, not classification or end-to-end speedtest performance for the actual phone/laptop pair.
- Restored 60,000/10,000 kbit/s local limits. Readback confirmed parent 60 Mbit/s, preferred 40 Mbit/s, normal 20 Mbit/s, both ceilings 60 Mbit/s. The values are commissioning limits, not measured ISP rates.
- Stop removed owned roots; restart restored them. Original agent remained running. SHA256 comparison of all `/etc/config/*`, original agent/service, DNS and time state matched the pre-change snapshot.
- Added scheduler kernel package and independent priority binary/upgrade keep-list; no unrelated UCI configuration changes. Router backup: `/root/nethera-priority-shaping-before`.

## Automated verification

- Source backend: 153 tests, no failures/errors; compatible generated cloud backend: 138, no failures/errors, including MQTT DNS/time/priority integration, explicit cap validation, fresh matching shaping acknowledgements and repeatable migration.
- Go race tests, frontend unit/browser checks and compatibility-generator checks passed.
- Remaining acceptance: repeat simultaneous real phone/laptop speedtests with the revised reservations at suitable limits. The earlier client results must not be represented as proof of device preference.

## Deployment

Deniz should generate a pinned compatible release as described in `deploy/leocloud/README.md`, back up databases/images, apply device-priority then bandwidth migrations, and deploy only updated frontend/backend images. No account/router ownership migration is required. The router implementation already runs independently of that rollout; cloud rollout enables the new settings form.

Temporary SSH key was removed from the router; a fresh authentication attempt was rejected. Local private/public temporary key files were deleted.
