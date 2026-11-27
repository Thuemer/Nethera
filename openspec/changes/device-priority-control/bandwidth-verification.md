# Bandwidth verification — 2026-11-27

Current runtime: `priority-cake-20261127-v4`, diagnostic limits 20000/10000 kbit/s. HTB/DRR sections below are historical trials, superseded by the CAKE follow-up at the end.

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


## Autonomous TCP follow-up (v3)

The reported actual phone/laptop results remained 25.12/8.01 Mbit/s at 60 Mbit/s, then 9.01/8.52 at 20 Mbit/s. Sampling showed laptop traffic in the preferred class. At 60 Mbit/s, aggregate download was mostly 29–40 Mbit/s with mostly empty queues. At 20 Mbit/s some saturated intervals measured preferred about 12.5 and normal about 7.6, but the full client-test result still did not show a stable laptop advantage.

Automated Mac IPv4 Cloudflare downloads removed the need for repeated manual speedtests. A single 25 MB Mac download averaged 9.90 Mbit/s at the temporary 20 Mbit/s cap; the same-size router download averaged 46.97 Mbit/s. Multi-connection Internet results also varied, including when priority was disabled, so these are observations rather than proof of a particular WAN/WLAN cause.

A bounded local TCP server then excluded the Internet. It serves zero bytes to one allowed private LAN client, tags only its own socket as preferred/normal, and exits after one request or a timeout. It does not test forward-hook device classification; that was checked separately through production nft rules and counters. Source: `router/tests/priority-tcp-load/main.go`.

The fixed tiny HTB quanta/burst budgets caused avoidable TCP throughput loss in these local trials. Rate-scaled burst/cburst and bounded 2:1 quanta were installed as `priority-shaping-20261127-v3`. Matching classes are now read back without redundant class changes every 30 seconds. Class rates and ceilings remain unchanged.

| Installed-version local TCP test | Preferred | Normal |
| --- | ---: | ---: |
| Two concurrent transfers, 20 Mbit/s parent (20 MB / 10 MB) | 10.09 Mbit/s | 5.35 Mbit/s |
| Preferred alone, 20 Mbit/s parent (20 MB) | 13.43 Mbit/s | — |
| Preferred alone, restored 60 Mbit/s parent (50 MB) | 42.37 Mbit/s | — |

The former v2 local 50 MB/60 Mbit/s test averaged 35.44 Mbit/s. The final v3 result improves this observed case but does not reach the full ceiling. Earlier manual tuning trials reached 49.28 Mbit/s; do not represent that as the final installed-version measurement. Tests prove approximately 1.9:1 local TCP allocation in this controlled contention case, not an actual phone/laptop WAN throughput guarantee.

Reproduction on this test router (Linux arm64): build `GOOS=linux GOARCH=arm64 go build -o /tmp/priority-tcp-load router/tests/priority-tcp-load/main.go`, copy the binary temporarily, then run two instances on ports 49727/high and 49728/normal with arguments `<allowed-client-IPv4> <bytes> <port> <mode>`. Start bounded curl downloads to both ports concurrently. It binds only 192.168.1.1 and admits only the specified client IP. Compare with preferred alone under the same limit; restore commissioning limits afterward. No listener persists after the test.

Final readback restored 60000/10000 kbit/s; original agent remains running, and all original configuration/agent/DNS/time hashes match. Go race/regression tests pass, including old burst rejection and no mutation of matching classes. No cloud deployment or new migration is needed for this router-only follow-up.

The current diagnostic key remains temporary and active because actual phone/laptop acceptance is still open; revoke it once that diagnosis finishes. The earlier key-removal entries describe previous completed access sessions.


## Internet research and installed CAKE v4

References: [OpenWrt SQM](https://openwrt.org/docs/guide-user/network/traffic-shaping/sqm), [OpenWrt SQM details](https://openwrt.org/docs/guide-user/network/traffic-shaping/sqm-details), [iproute2 CAKE manual](https://man7.org/linux/man-pages/man8/tc-cake.8.html). OpenWrt recommends limits below actual capacity. CAKE provides directional host isolation, explicit priority tins and GSO splitting. It was tested without adding an SQM service or changing UCI/offloading/WLAN. Official kmod-sched-cake and diagnostic tcpdump-mini/libpcap packages were added without upgrades.

Initial proxy comparisons were excluded as device acceptance evidence: a proxy splits TCP congestion control. Cloudflare requests returning HTTP 403 and the unusable Hetzner response were not counted as throughput. Subsequent A/B trials used identical direct IPv4 HTTP/1.1 downloads from the public OVH test endpoint. Temporary source-port exceptions in the owned table made one connection normal. These are controlled comparisons on one physical Mac, not a phone acceptance test.

| Direct 10 MiB pair | Preferred | Normal |
| --- | ---: | ---: |
| HTB v3 trial 1 | 5.55 Mbit/s | 4.60 Mbit/s |
| CAKE 100 ms trial 1 | 6.60 Mbit/s | 3.07 Mbit/s |
| HTB v3 trial 2 | 5.32 Mbit/s | 3.41 Mbit/s |
| CAKE 100 ms trial 2 | 10.51 Mbit/s | 3.83 Mbit/s |
| Installed v4 pair 1 | 6.33 Mbit/s | 5.29 Mbit/s |
| Installed v4 pair 2 | 4.89 Mbit/s | 3.35 Mbit/s |

Normal-only v4: 12.33 Mbit/s average for the same object. This demonstrates access to spare capacity, not a fixed per-device ratio or full-link goodput.

Longer direct downloads used the 100 MiB object and an intentional duration limit. Curl exit 28 was expected; HTTP 200 and received bytes were checked:

- 25 s scheduler check: preferred 9.45 Mbit/s, normal 1.97 Mbit/s. Both sockets were explicitly classified, so this checks scheduler behavior only.
- 25 s production classification: preferred 4.22 Mbit/s, normal 2.54 Mbit/s. Only the normal test connection was overridden; preferred used unchanged production MAC/IP rules.
- Reusable diagnostic, 15 s, production classification: preferred 15,316,462 bytes / 15.005919 s = 8.166 Mbit/s; normal 3,519,982 bytes / 15.001756 s = 1.877 Mbit/s. Ratio 4.351. No extra preferred marking was used.

The first metadata capture failed because BusyBox lacks `timeout`; it was discarded. A shell-timer-bounded capture succeeded on WAN/LAN, restricted to the two test ports, without displaying payload. About 20.6%/22.5% of incoming data bytes overlapped previously observed TCP sequence ranges; median repeated-segment delays were 174/230 ms. LAN overlap was similar. This demonstrates retransmission activity, not its cause or a WLAN fault; intentional AQM drops also occur. Raw metadata remains outside Git. These data do not justify altering existing WLAN settings.

A bounded 20 s upload-only networkQuality run exercised WAN queues. Its application-reported throughput was not used as ISP capacity: forced duration and buffering can differ from actual transmitted bytes at the configured shaper.

Selected profile: diffserv3; normal Bulk 7d00:1; preferred Best Effort 7d00:2; download dual-dsthost/nonat/ingress; upload dual-srchost/nat/egress; split-GSO; 100 ms RTT; 4 MiB memory per direction; no ACK filtering; raw overhead; fwmark override disabled. A 300 ms RTT proxy trial was inconclusive and not selected. Structural/numeric readback verifies policy and rates before active=true. Matching queues are not rewritten every refresh. Legacy owned DRR/HTB cleanup and refusal of foreign schedulers remain covered by regression tests.

Reproduce with `python3 router/tests/priority-wan-check.py --client-ip <private IPv4> --ssh-key <key>`. The script was run successfully against installed v4. It requires an already-preferred client, temporarily makes only one test connection normal, and restores original desired state through finally plus a router-side watchdog. It is not a guarantee about arbitrary applications or the actual phone/laptop pair.

Stop/start testing removed only the owned queues/table and restored active readback. All original configuration, original agent/service and DNS/time hashes still match; the original agent stayed running. Current limits remain **20/10 Mbit/s for ongoing diagnosis**. Actual phone/laptop acceptance and eventual temporary-key removal remain open. No cloud deployment or additional migration is required for this router-only scheduler follow-up.


Final housekeeping removed only our temporary diagnostic/staging executables from router RAM storage. MemAvailable rose from 28,732 to 71,176 KiB; no claim is made that memory pressure caused the earlier results. A final rerun of the reusable 15 s production-classification test after cleanup measured preferred **6.053 Mbit/s** (11,351,534 bytes / 15.00253 s) and normal **3.781 Mbit/s** (7,091,694 bytes / 15.005776 s), ratio **1.601**. This lower advantage is included rather than selecting only the best run. Test exceptions were removed; active CAKE readback remains at 20/10 Mbit/s. Original settings, original running agent and DNS/time state still match the baseline. Overlay has 19.7 MiB free. Temporary SSH access is retained solely for the unfinished actual-device acceptance.
