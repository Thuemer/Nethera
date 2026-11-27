## Context
Frontend priority is boolean; DNS control already runs on the Cudy. Existing router configuration must remain unchanged.

## Goals / Non-Goals
Goals: isolated weighted egress scheduling and versioned status for the existing two modes.
Non-goals: fixed Mbps, percentage guarantees, automatic ISP capacity estimation, changing DNS or network settings.

## Decisions
Run a second binary/process using existing MQTT configuration with a unique client ID and separate config/priority and telemetry/priority topics. Never replace the existing deployed agent.
Use DRR classes with high quantum 3000 and normal quantum 1500 and fq_codel leaves. This is a class weight, not a guaranteed ratio per device. Discover WAN and LAN bridge members dynamically. Match upload by MAC and download by current IPv4/IPv6 neighbor addresses. Own only handle 7e00 and table inet nethera_priority. Do not overwrite foreign root qdiscs; fail closed if flow offloading is enabled. Normal-only state removes owned queues and table. A periodic refresh reads back rules, queues and device addresses and retries after reboot/interface changes.
Keep separate backend state/version/freshness; stale, mismatching or failed acknowledgments never confirm the UI. Existing after-commit events also trigger priority publication without changing DNS content. A separate device_priority override and dedicated endpoint keep a direct priority change independent of preset assignment and pause state.

## Risks / Trade-offs
ISP bottleneck outside the router → disclose local scheduling scope and require load testing on target network.
Foreign QoS → refuse activation, keep other settings.
Package installation → snapshot installed packages and hashes; add dependencies without upgrade.
MAC randomization and unknown IPv6 neighbors → report incomplete device mapping rather than claiming full application.

## Migration Plan
Snapshot existing settings and binaries, install only required packages, add standalone service, test high/normal and rollback, verify old hashes and running service. Backend migration adds one table; deploy separately under hosting instructions. Remove temporary authorized key and local private key at completion.

## Open Questions
End-to-end cloud activation depends on deployment access and existing MQTT ACLs.
