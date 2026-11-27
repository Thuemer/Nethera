# Verification — 27 November 2026

## Completed

- `go test ./...` passed in router/agent, including five new priority validation/classification/foreign-queue/cleanup/readback tests. Linux arm64 cross-build passed.
- 24 selected backend unit tests passed: PriorityDesiredStateTest, PriorityControlServiceTest, DnsDesiredStateTest, TelemetryPayloadParserTest. Quarkus JVM package built successfully with Java 25 targeting Java 21.
- All 125 frontend unit/regression tests passed. Vite production build passed. Generated dist changes were discarded because the deployment image copies the source pages directly and those bundled changes were unrelated.
- OpenSpec strict validation and git diff whitespace check passed.
- Real Cudy WR3000S/OpenWrt 25.12.5: tc-full, kmod-sched-core, kmod-sched-drr installed with dependencies; no package/firmware upgrade.
- Separate nethera-priority service installed and enabled. Existing nethera-agent binary and init script were not replaced or restarted.
- Applied high priority to the connected development Mac. nft counters increased in both directions; preferred-class tc counters showed 315477 bytes on WAN and 630541 bytes on the Wi-Fi egress during the observed test. Normal class also transmitted packets.
- Returned test device to normal: own table and all handle 7e00 queues disappeared; fw4 remained.
- Persisted test high state and restarted only the new service: rules/classes restored. Stopping service removed its rules/classes. Restarted with normal state, verified cleanup, and removed the temporary test state.
- New service logged `priority MQTT subscription ready` against the existing cloud broker.
- SHA-256 verification passed for every pre-existing /etc/config file, /usr/bin/nethera-agent and /etc/init.d/nethera-agent after installation and tests.
- Temporary router authorized-key line removed, preserving all other lines. Fresh SSH authentication with that key was then rejected. Local private/public key files and temporary key directory were removed.

## Not claimed

No LeoCloud backend/frontend rollout was performed (no Kubernetes context on this Mac). No live frontend → new backend → cloud MQTT → router end-to-end test was possible. No guaranteed ISP bandwidth or saturation/latency gain was measured; target-network load testing remains required. No full router reboot was performed. The source changes are delivered through Git; this does not activate the cloud deployment.

Deployment handoff: Documentation/device-priority.md. The colleague can deploy from GitHub without having the router physically present; final functional verification needs the router online.
