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

The initial DRR-only implementation was observed to classify the laptop correctly but did not own the ISP bottleneck. Replace it with an HTB aggregate-rate parent (handle 7d00:, aggregate class 7d00:1, default leaf 7d00:20), with two HTB child classes below it: preferred 7d00:10 gets two thirds of the controlled total (priority 0), normal 7d00:20 one third (priority 1), each allowed to borrow unused capacity up to the total. Shape WAN upload and routed LAN-bridge egress download, rather than separate per-port caps. Keep MAC/IP classification (skb priority 7d00:10) and fq_codel leaves; preserve all unrelated UCI, DNS, time and firewall policy. Reject foreign queues. Configurable directional caps are explicit values in kbit/s (no hard-coded ISP speed and no claim of automatic capacity detection). Versioned backend desired state includes optional bandwidth settings. Absent settings permit a router-local commissioning configuration for old backends; explicit disabled settings override that fallback. Missing shaping configuration must not confirm an effective high priority. Readback must verify actual numeric tc rates, class weights and fallback filters before applied=true.

Add one configuration table and one report column in an additive migration, expose a bandwidth form without changing Normal/Bevorzugt device choices, and extend the shared-router release adapter. First commission with clearly documented conservative 60000/10000 kbit/s caps on the current network, keep rollback artifacts and remove temporary access at completion. Tests must demonstrate aggregate bridge traffic really traverses the controlled queue and that stopping the new worker restores noqueue without changing the DNS/time services. A live client-throughput comparison remains a separate acceptance step.

## TCP scheduler follow-up

Scale HTB burst/cburst to roughly 10 ms of the directional cap (minimum 1600 bytes). Scale preferred service quantum to the numeric cap in kbit/s, bounded 3000..60000 bytes; normal quantum is half. Preserve the 2/3 and 1/3 class rates and common ceiling. Hardware TCP tests showed avoidable throughput loss with fixed 3000/1500-byte HTB quanta. Verify rates, quanta and bursts numerically; do not rewrite matching classes at every refresh. Keep the local TCP benchmark distinct from WAN/client acceptance.


## CAKE research follow-up

Official OpenWrt SQM guidance calls for controlled bottleneck rates below measured capacity; CAKE offers per-host isolation and split-GSO handling. A/B tests with two direct identical Mac HTTP transfers (temporary source-port classification inside the owned table) favored CAKE more consistently than HTB. Proxy-based tests were excluded because they split TCP congestion control. Adopt CAKE diffserv3 on owned root 7d00:, assigning normal forwarded traffic explicitly to Bulk (7d00:1) and preferred traffic to Best Effort (7d00:2). Do not rewrite DSCP or conntrack marks. This is priority sharing, not the earlier fixed 2:1 HTB reservation policy. Normal can borrow idle capacity.

Download: routed LAN bridge, ingress accounting, dual-dsthost, nonat (local destinations already visible). Upload: WAN, egress accounting, dual-srchost, nat lookup. Both: 100ms RTT profile, split-gso, 4 MiB memory limit, no ACK filtering, raw overhead (access encapsulation unknown), fwmark override disabled. Refuse foreign queues; clean up previous owned DRR/HTB roots. Read back exact rate, mode, isolation, NAT, GSO and priority policy before reporting active. No additional SQM service or UCI change.

## Latency-based adaptive controller (user authorized)

Use vendored stable cake-autorate v3.2.1 in a dedicated nethera-autorate procd service, started/stopped by the priority worker. No upstream installer or SQM service. Local /etc/nethera-priority-adaptive.json holds min/base/reflectors; maximum is the explicit local bandwidth download ceiling. Explicit backend bandwidth settings retain manual precedence. Upload remains fixed. The worker verifies controller ownership, matching generated config, fresh reflector responses and CAKE policy/rate bounds; it does not overwrite a healthy controller's rate at refresh. All-normal, disabled shaping and service shutdown stop the controller before queue cleanup. Frontend priority Normal/Bevorzugt remains unchanged; compatible bandwidth status can show the current locally adaptive rate.

Guard upstream tc writes with reserved handle 7d00:. Use a separate config.nethera-priority.sh instance/runtime directory, bounded tmpfs logs and three bound WAN reflectors. Missing/stale probes must not confirm active adaptation. This extends the initial non-goal of automatic bandwidth adaptation at the user's explicit request.


## Capacity-first follow-up (user requested)

Add opt-in local capacityFirst: initialize download at the configured ceiling instead of the low commissioning base; under clear high load probe +10% per update and recover +20% per second towards that ceiling at low load. Do not decay healthy idle rates towards 35 Mbit/s. Use 10/30 ms download OWD thresholds for earlier active-load feedback. Ignore directional latency reductions below the existing connection-active threshold; idle path jitter alone is not evidence of congestion caused by this router. Retain the bounded min/max, manual override, controller health and unchanged priority tins; normal traffic remains work-conserving. This favors capacity over the tightest latency and may overshoot on link changes. No guarantee of exact full ISP rate or universal device ratio.
