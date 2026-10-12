## Context

`deploy/leocloud/stack.yaml` already runs Nethera in namespace `student-it220208` under `https://it220208.cloud.htl-leonding.ac.at/`: `nethera-frontend`, `nethera-backend`, `nethera-keycloak`, `nethera-db`, `nethera-keycloak-db`, a seed Job and one ingress (`/api` → backend, `/realms`, `/resources`, `/admin` → Keycloak, `/` → frontend). Secrets live in `nethera-runtime`. The backend runs with `NETHERA_TELEMETRY_MODE=ssh` and `QUARKUS_SCHEDULER_ENABLED=false`, so it shows demo data only. The README states that real router telemetry needs "a separately reachable, secured transport" later. This change is that transport.

The MQTT design of `mqtt-router-telemetry` (D8) publishes Mosquitto on `0.0.0.0:1883` so the router in the same LAN can reach it, and `router-telemetry-agent` assumes "broker on a laptop in the router's LAN, port 1883, no TLS".

LeoCloud limits (user manual, `.claude/skills/leocloud/SKILL.md`):
- One namespace per student and one hostname per namespace.
- External access only through the nginx ingress (`ingressClassName: nginx`), no `tls` section. TLS ends at the platform edge (Let's Encrypt).
- Services are `ClusterIP` only. `NodePort`, `LoadBalancer`, `ExternalName` and `hostPort` are rejected.
- Pod Security baseline. PVCs up to 20 GB per namespace.

Router and backend are both MQTT clients already. Only the deployment couples the broker to the laptop. The router (Cudy WR3000S, OpenWrt 25.12.5) sits behind NAT in some home or school network.

## Goals / Non-Goals

**Goals:**
- Run Mosquitto next to the existing stack and let the cloud backend ingest real telemetry over MQTT.
- Let a router anywhere on the internet push telemetry to the cloud broker with only outbound HTTPS (443), encrypted up to the platform edge.
- Keep the local Compose setup working unchanged for development, including SSH fallback.
- Keep backend code unchanged. Everything cloud-specific lives in `stack.yaml`.
- Answer every open question about the router and the platform first, before building on assumptions.

**Non-Goals:**
- Anything the existing LeoCloud setup already covers: other manifests, images, Keycloak, realm, seed, deploy procedure.
- CI/CD, Helm, autoscaling, high availability.
- Commands from the backend to the router (later change, uses the same `wss` connection).
- Router self-registration. Router rows and broker users are still created by hand or through the seed.
- Implementing the router agent itself. That stays in `router-telemetry-agent`, which this change only updates (D6).

## Decisions

### D1 — Broker joins the existing stack
```
                    https://it220208.cloud.htl-leonding.ac.at  (TLS at the platform edge)
                                         │
                               nginx ingress (existing)
     ┌───────────────┬───────────────────┼──────────────────────┬──────────────┐
   /mqtt (new)     /api        /realms, /resources, /admin       /
     ▼               ▼                   ▼                       ▼
 nethera-mosquitto  nethera-backend   nethera-keycloak     nethera-frontend
   :9001 (ws)         │  ▲
     ▲                │  │ mqtt://nethera-mosquitto:1883
     │                ▼  │
     │           nethera-db
     │
 router (any network, outbound 443 only)
   wss://it220208.cloud.htl-leonding.ac.at/mqtt
```
New resources follow the existing naming (`nethera-mosquitto`) and live in `stack.yaml`, not in a separate file, so one `kubectl apply -f deploy/leocloud/stack.yaml` still deploys everything. Mosquitto runs `eclipse-mosquitto:2` with `strategy: Recreate` (one PVC, one writer) and a PVC `nethera-mosquitto-data` (1 Gi, total 5 Gi of 20).

`mosquitto.conf`, `acl` and `entrypoint.sh` come from a ConfigMap `nethera-mosquitto` created from `docker/mosquitto/` (`kubectl create configmap --from-file … --dry-run=client -o yaml | kubectl apply -f -`), the same way the README creates `nethera-theme` and `nethera-seed`. Compose and cloud share one set of files.

### D2 — Path `/mqtt` on the existing ingress
One more rule `/mqtt` → `nethera-mosquitto:9001`, `pathType: Prefix`. It doesn't collide with existing paths.

Unverified: does Mosquitto's WebSocket listener accept `/mqtt` as request path, or does it need `/`? Most clients (Paho, mqtt.js) use `/mqtt` by default. Task 1.2 checks it. Fallback: nginx `rewrite-target` annotation, if LeoCloud allows annotations.

### D3 — MQTT over WebSockets for routers, TLS at the platform edge
Mosquitto gets a second listener:
```
listener 1883                 # backend, cluster-internal
listener 9001
protocol websockets           # routers, through the ingress
```
Both use the same `password_file` and `acl_file` (Mosquitto 2 applies global auth settings to all listeners unless `per_listener_settings` is set). ingress-nginx forwards the WebSocket upgrade without extra annotations. The router sees `wss://…:443` with the platform's Let's Encrypt certificate, so it only needs a CA bundle, no self-signed CA.

*Alternatives:*
- Raw MQTT/TLS on 8883: impossible on LeoCloud (no `LoadBalancer`/`NodePort`).
- Router posts telemetry to a REST endpoint: works through HTTPS, but loses the Last Will (online/offline without polling) and the planned command channel over the same connection. Rejected.
- Hosted broker outside LeoCloud (e.g. HiveMQ Cloud free tier): offers 8883, but adds an external account and dependency. Rejected, but kept as a fallback if WebSockets through the ingress turn out to be unusable (task 1.3).

### D4 — Backend inside the cluster: plain MQTT, mode `mqtt`
The backend connects to `nethera-mosquitto:1883` without TLS; the traffic never leaves the cluster network. In `stack.yaml`, `NETHERA_TELEMETRY_MODE` changes from `ssh` to `mqtt`, plus `NETHERA_MQTT_HOST=nethera-mosquitto`, `NETHERA_MQTT_PORT=1883`, `NETHERA_MQTT_USERNAME=nethera-backend` and `NETHERA_MQTT_PASSWORD` from the Secret. `QUARKUS_SCHEDULER_ENABLED=false` stays: the cloud backend can't reach a router behind NAT, so SSH fallback is meaningless there.

Only one backend replica (already the case): the MQTT client ID `nethera-backend` is fixed (`clean-session=false`), and a second replica would kick the first off the broker.

The deployed backend image (`20261006-144848`) has to contain the MQTT ingestion. Task 1.1 checks this; if not, a new image is built and pushed following the README.

### D5 — Secrets
`nethera-runtime` gets two keys: `mqtt-backend-password` and `mqtt-router1-password`, random values set by the namespace owner. The Mosquitto entrypoint already fails on a missing variable (`${…:?}`), so a missing key stops the broker instead of falling back to the Compose demo defaults. The README lists the keys.

### D6 — Effects on the open MQTT changes
After task group 1, the two open changes are updated in place (tasks group 2), not through delta specs, because neither has been archived into `openspec/specs/` yet:

- `router-telemetry-agent`:
  - The context assumption "broker on a laptop in the LAN" changes to "cloud broker over `wss`, laptop broker over `tcp` for development".
  - D1 (client): if `mosquitto_pub`/`mosquitto_sub` on 25.12.5 can connect over WebSockets with TLS, the shell design stays. Otherwise the agent switches to a library client with one persistent connection. Preferred: **Go + Paho** (`wss` support, single static binary, fits the later command channel).
  - D7 (UCI): new options `transport` (`tcp` | `wss`, default `wss`) and `ws_path` (default `/mqtt`). Port default becomes 443 for `wss`.
  - D9 (TLS): TLS is required for `wss`, not deferred. The CA is the system bundle (`ca-bundle`), and `tls_ca` overrides it. NTP gating has to cover the TLS connect as well, because certificate validation fails with a wrong clock.
- `mqtt-router-telemetry`: add a note to D8 and the risks: the cloud broker is reachable from the internet through TLS at the edge. The "TLS before internet-facing use" condition is met by the ingress. Plain 1883 stays LAN-only for local development.

## Risks / Trade-offs

- **[Ingress closes idle WebSockets]** → ingress-nginx's default `proxy-read-timeout` is 60 s, and the agent's keepalive is 30 s. Task 1.3 measures this with an idle connection for 10 minutes. If the platform uses a shorter timeout, lower the keepalive.
- **[Broker reachable from the internet]** → Strong random passwords per router from the Secret, ACL limits each router to its own namespace, the backend user can't publish. Acceptable for a school project; revisit with client certificates if needed.
- **[Router clock wrong after boot breaks TLS]** → The agent waits for NTP before connecting (D6). Reconnect backoff covers the remaining gap.
- **[Cloud demo data and real telemetry mix]** → The seed creates router 1 with demo stats. Real telemetry for `router-1` is appended to the same router. Acceptable; a reset of the demo data is a separate decision.
- **[Namespace belongs to a teammate]** → Only the owner can `kubectl apply` and set Secret keys. Tasks that touch the cluster are done by or with the owner.
- **[LeoCloud down during the demo]** → The local Compose stack keeps working unchanged. Switching the router back is one UCI change (`transport=tcp`, `broker=<laptop>.lan`, `port=1883`).
- **[Agent client switch to Go is bigger than planned]** → The topic and payload contract stays the same. Only the transport layer of the agent changes, and nothing has been implemented on the router yet.

## Migration Plan

1. Task group 1: probe the platform and the router. Record the answers under Open Questions.
2. Task group 2: update `router-telemetry-agent` and `mqtt-router-telemetry` according to the answers.
3. Add the WebSocket listener to the local Compose broker and verify with the simulator over `ws`.
4. Add Mosquitto to `stack.yaml`, set the Secret keys, switch the backend to `mqtt`, apply.
5. Verify `wss` from outside the cluster with a desktop MQTT client, then with the router (once the agent supports `wss`).

Rollback: set `NETHERA_TELEMETRY_MODE` back to `ssh`, remove the `/mqtt` path and the Mosquitto resources (the PVC can be kept), apply. Point the router back to the laptop broker.

## Open Questions

To be answered in task group 1, before anything else is built:
- Does the deployed backend image contain the MQTT ingestion, or is a new image needed?
- Are ingress annotations allowed (e.g. `nginx.ingress.kubernetes.io/proxy-read-timeout`, `rewrite-target`)? What timeouts does the platform ingress use for WebSockets?
- Does a WebSocket connection through the ingress to Mosquitto work at `/mqtt`, and does it stay open for 10 minutes with 30 s keepalives?
- Can `mosquitto_pub`/`mosquitto_sub` from the OpenWrt 25.12.5 feed (`mosquitto-client-ssl`) connect over WebSockets (`wss`)? Which version is in the feed?
- Is `ca-bundle` (or `ca-certificates`) available on the Cudy, and does it validate the LeoCloud certificate?
- Does outbound 443 from the router's network (school network, home network) to LeoCloud work without a proxy?
