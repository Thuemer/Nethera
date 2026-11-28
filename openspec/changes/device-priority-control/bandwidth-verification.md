# Bandwidth verification — 2026-11-27

Current runtime: `priority-cake-20261127-v4`. On the user’s later request, download was raised from the 20000 kbit/s diagnostic ceiling to 1000000 kbit/s (verified 1-Gbit/s WAN port); upload remains 10000 kbit/s. HTB/DRR sections below are historical trials, superseded by the CAKE follow-up at the end.

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


## User-requested removal of the 20 Mbit/s ceiling

Before the change, the user confirmed both real-device directions at 20 Mbit/s: preferred laptop 12.97 vs normal phone 6.59; after swapping preference, preferred phone 15.39 vs normal laptop 1.05. This confirms that the working limited profile follows the frontend choice.

The user then explicitly requested maximum performance and autonomous retesting. Verified WAN speed 1000 Mbit/s, backed up the local bandwidth file to `/root/nethera-priority-research-before/bandwidth-before-unlimit.json`, and changed only local downloadKbit to 1000000. Upload remains 10000; desired device modes/version are unchanged. This is a physical-port ceiling, not a measured ISP rate or a claim of 1 Gbit/s Internet service. CAKE readback reports 1Gbit; no software/firmware change was needed.

- Four bounded direct Internet downloads averaged 18.72 Mbit/s combined in that run. The attempted priority pair then returned HTTP 429. The failed pair was discarded, and further requests to that server stopped.
- macOS download-only networkQuality (20 s bound) reported 19.84 Mbit/s; received bytes / phase duration averaged 17.86 Mbit/s. This is a current workload observation, not the contract speed or proof of a remaining 20 Mbit/s cap.
- Local router-to-Mac normal-tin transfer: 100,000,000 bytes / 4.050029 s = 197.53 Mbit/s, proving that the removed 20 Mbit/s ceiling no longer constrains that path.
- Two concurrent bounded local socket-classified transfers: preferred 100,000,000 bytes / 2.134911 s = 374.72 Mbit/s; normal 100,000,000 bytes / 4.630617 s = 172.76 Mbit/s. Both were on the Mac, not the actual phone/laptop pair. Completion averages include the period after the faster flow finished; do not add them to infer simultaneous Internet capacity.

Conclusion: download is released up to the port maximum and local scheduling still differentiates test queues. Internet priority under the new high ceiling is **not reliably verified**: a shaper above the upstream bottleneck cannot be assumed to control it. Do not equate local results or applied=true with a guaranteed Internet speedtest advantage. A limit near the real connection rate, rather than the old arbitrary 20 Mbit/s, remains the standard approach if strong Internet QoS is required. The current maximum-download setting is retained as requested; no silent return to 20 Mbit/s.

Temporary local test rules/executables were removed. Original configuration/agent/DNS/time hashes remain intact; the priority worker is resumed and the original agent remains running. Diagnostic SSH access remains until the final bandwidth-policy acceptance is settled.


## Adaptive download commissioning, 28 November 2026

Installed `priority-adaptive-20261128-v2`: stable cake-autorate v3.2.1 pinned to 7157e2fe3e90e5feee78d55fee8593d08a56f3a1; dedicated service, no upstream installer/SQM, WAN-bound fping, download only. Local bounds 1/35/1000 Mbit/s min/base/max; fixed upload 10. The base is an idle/start value, not a cap. No foreign root, UCI, original agent or existing DNS/time service was replaced.

Eight direct preferred HTTPS downloads for 30 s all returned HTTP 200 with valid bounded durations. Payload aggregate was about 16.84 Mbit/s; actual CAKE rate rose from 35 to approximately 55 Mbit/s. Two priority reconciliations during load preserved the same controller PID and did not reset its rate. Rate and goodput are distinct measurements.

Identical direct Apple HTTPS downloads, controlled normal port exceptions only, production preferred MAC/IP rules, 30 s:

| Workload | Preferred aggregate Mbit/s | Normal aggregate Mbit/s |
| --- | ---: | ---: |
| One TCP flow per group, 25 s | 7.355 | 8.566 |
| Four flows per group, first run | 12.153 | 7.614 |
| Four flows per group, repeat | 14.153 | 6.426 |

During the repeat, sampled CAKE rates ranged 35.499–67.080 Mbit/s. Both tins had backlog in several samples (e.g. normal 226338 bytes / preferred 113620 bytes), and the highest sampled normal/preferred average queue delays were 187478/60712 microseconds. This is a positive controlled contention result, not evidence of consistently low latency or guaranteed physical-device throughput. Do not omit the single-flow counterexample. Real phone/laptop acceptance and swapping preference remain open.

Lifecycle hardware checks: explicit temporary manual 60/10 config stopped adaptation; all-normal removed owned queues; restoring the unchanged saved desired state restarted adaptation. Full priority-service stop/start removed and restored queues/controller cleanly. Original nethera-agent PID 2665 remained unchanged. All /etc/config/*, original agent binary/init, DNS and time state hashes matched `/root/nethera-adaptive-before/hashes`. The desired device/version JSON was unchanged. Installer rollback had previously restored the old binary at its safety timeout; the tested v2 was then reinstalled intentionally and that pending marker cleared.

The diagnostic watchdog was corrected: this BusyBox has neither nohup nor timeout. The portable detached shell with ignored HUP and closed standard descriptors was verified across SSH disconnect; a stopped worker resumed and reconciled successfully after the 2 s proof timer. Earlier nohup-based interruption coverage was not valid; ordinary finally restoration had succeeded. The diagnostic now accepts `--streams 4`, rejects failed HTTP/timing samples, restores saved wishes and never persists test device assignments.

Software checks: Go race tests (including config roundtrip/no-reset, manual override, stale/wrong-PID health, foreign service and rate bounds), 125 frontend unit tests, isolated priority/time browser fixture with fresh/stale adaptive feedback, compatibility release preservation test and shell/Bash syntax. No cloud rollout. Temporary diagnostic SSH access remains only for the unfinished physical-device acceptance; remove the exact key and local key files when that diagnosis ends.


## Capacity-first follow-up, 28 November 2026

User clarified that preferred must not mean a fixed low speed and normal devices must remain usable. Observed the prior controller at about 2.6 Mbit/s following latency events, with slow default recovery. Added optional local capacityFirst profile: initialize/base at configured maximum, +10% high-load probing, +20% low-load recovery per decay interval, no low idle decay; 10/30 ms download OWD thresholds. Idle (<1000 kbit/s in that direction) latency alone cannot request reduction. Bounds/manual precedence, original CAKE tins and host isolation remain unchanged. This trades tighter latency for faster capacity access, not universal throughput guarantees.

Installed `priority-capacity-20261128-v2`, capacityFirst=true, 1–1000 Mbit/s download bounds and unchanged fixed 10 Mbit/s upload. Backup `/root/nethera-capacity-before/` holds the previously working binary/controller/local config and original setting hashes. An initial 15-minute installation rollback expired while diagnostics continued; its affected comparison was discarded. The new binary, config and local controller patch were then explicitly verified before the valid v2 runs. A repeat that overlapped another workload was also discarded, including the overlapping final baseline phase; do not count it as acceptance evidence.

Valid v2 controlled direct 30 s four-vs-four TCP result: preferred 15.684 / normal 7.571 Mbit/s. Initial CAKE rate was 1000 Mbit/s, final 301.962 Mbit/s. These application flows did not demonstrate continuous saturation of a 300-Mbit/s shared link, so their ratio alone does not prove universal priority at that capacity.

Separate v2 spare-capacity sequence, identical four direct 20 s downloads:

| Phase | Aggregate payload Mbit/s | Queue rate at end Mbit/s |
| --- | ---: | ---: |
| All normal, own queues removed (before) | 20.877 | none |
| Preferred test group alone | 16.170 | 810.000 |
| Normal test group alone, other preferred device idle | 19.574 | 708.580 |

Requests all had valid HTTP 200, received bytes and approximately 20 s durations. This confirms no low static normal/preferred rate ceiling in these runs; varying application results do not prove exact full-link utilization. The overlapping after-baseline is excluded. Saved device wishes were restored without persistence changes. No real 300-Mbit/s ISP acceptance is claimed.

Deterministic tests execute the actual vendored Bash decision block (not a duplicate algorithm): idle jitter cannot lower rates, active congestion still reduces, clear high load probes up, low idle rates recover and configured 10/60/300/1000 Mbit/s ceilings hold. Go tests verify rendering/initialization at those ceilings and preserve the legacy profile and explicit manual overrides. System macOS Bash 3 cannot execute associative-array code; these tests passed using the installed OpenWrt Bash over SSH, without network load or configuration mutations.


Valid independent v2 repeat, four TCP flows per group over 30 s: preferred **10.458**, normal **13.044 Mbit/s**, ratio 0.802; final CAKE rate **750.000 Mbit/s**. Include this negative comparison. The approximately 23.5-Mbit/s payload did not establish saturation of that configured shaper. Thus capacity-first fixes the low startup/idle policy but reliable Internet preference with near-full utilization remains **unverified**. Do not advertise the positive first comparison as a general solution or promise that a preferred device must always win a speedtest.

Final v2 binary includes validation allowing capacity-first ceilings below the legacy commissioning base (e.g. 10 Mbit/s), because that base is unused in this mode. Go race tests, five real-Bash policy tests and strict OpenSpec/shell syntax passed. Priority service restart/manual override/all-normal lifecycle and original-config hash checks are recorded separately; temporary diagnostic access remains for unfinished physical acceptance.
