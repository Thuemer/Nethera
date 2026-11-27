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
Snapshot existing settings and binaries, install only required packages, add standalone service, test high/normal and rollback, verify old hashes and running service. Backend migration adds two tables; deploy separately under hosting instructions. Remove temporary authorized key and local private key at completion.

## Open Questions
End-to-end cloud activation depends on deployment access and existing MQTT ACLs.

## Compatible cloud integration (27 November)

Merge origin/feat/router-time-schedules at 52c9989. Keep live AdBlock/domain/device writes in security.js and the separate time publisher and status. The core source retains its ownership model; the established prepare-time-release.mjs build selects the verified shared-router bases and applies a narrow priority-cloud.patch after the existing time patch. The adapter checks devices against configured nethera.router.id and preserves the current authenticated shared access without adding ownership tables or replacing Keycloak/account.js. Test the generated release as well as the source branch. Do not deploy or modify the physical router during this integration.

## Controlled bandwidth follow-up

The initial DRR-only implementation was observed to classify the laptop correctly but did not own the ISP bottleneck. Replace it with an HTB aggregate-rate parent (handle 7d00:, default class 7d00:1), with two HTB child classes below it: preferred 7d00:10 gets two thirds of the controlled total (priority 0), normal 7d00:20 one third (priority 1), each allowed to borrow unused capacity up to the total. Shape WAN upload and routed LAN-bridge egress download, rather than separate per-port caps. Keep MAC/IP classification (skb priority 7d00:10) and fq_codel leaves; preserve all unrelated UCI, DNS, time and firewall policy. Reject foreign queues. Configurable directional caps are explicit values in kbit/s (no hard-coded ISP speed and no claim of automatic capacity detection). Versioned backend desired state includes optional bandwidth settings. Absent settings permit a router-local commissioning configuration for old backends; explicit disabled settings override that fallback. Missing shaping configuration must not confirm an effective high priority. Readback must verify actual numeric tc rates, class weights and fallback filters before applied=true.

Add one configuration table and one report column in an additive migration, expose a bandwidth form without changing Normal/Bevorzugt device choices, and extend the shared-router release adapter. First commission with clearly documented conservative 60000/10000 kbit/s caps on the current network, keep rollback artifacts and remove temporary access at completion. Tests must demonstrate aggregate bridge traffic really traverses the controlled queue and that stopping the new worker restores noqueue without changing the DNS/time services. A live client-throughput comparison remains a separate acceptance step.
