## Context

Today the whole stack runs from `compose.yaml` on a developer laptop. The MQTT design of `mqtt-router-telemetry` (D8) publishes Mosquitto on `0.0.0.0:1883` so the router in the same LAN can reach it, and `router-telemetry-agent` assumes "broker on a laptop in the router's LAN, port 1883, no TLS".

The target is LeoCloud, the HTL Leonding Kubernetes cluster. Its documentation (user manual, `llms.txt`, deploy guide) sets these limits:

- One namespace per student and **one hostname per namespace**: `<name>.cloud.htl-leonding.ac.at`.
- External access **only through the nginx ingress** (`ingressClassName: nginx`). The ingress has **no `tls` section**. TLS ends at the platform edge with a certificate the platform holds (Let's Encrypt, checked on `cloud.htl-leonding.ac.at`).
- Services are **`ClusterIP` only**. `NodePort`, `LoadBalancer`, `ExternalName` and `hostPort` are rejected.
- Pod Security **baseline**. PVCs up to **20 GB per namespace**. Ephemeral storage 2 GB per container by default.

Router and backend are both MQTT clients already. Only the deployment couples the broker to the laptop. The router (Cudy WR3000S, OpenWrt 25.12.5) sits behind NAT in some home or school network.

## Goals / Non-Goals

**Goals:**
- Run frontend, backend, Keycloak, databases and broker in one LeoCloud namespace, reachable under one HTTPS hostname.
- Let a router anywhere on the internet push telemetry to the cloud broker with only outbound HTTPS (443), encrypted end-to-end up to the platform edge.
- Keep the local Compose setup working unchanged for development, including SSH fallback.
- Keep backend code unchanged. Everything cloud-specific lives in configuration and manifests.
- Answer every open question about the router and the platform first, before building on assumptions.

**Non-Goals:**
- CI/CD pipeline (GitHub Actions). Deploying is a manual script for now.
- Helm charts, operators, autoscaling, high availability.
- Commands from the backend to the router (later change, uses the same `wss` connection).
- Router self-registration. Router rows and broker users are still created by hand or through the seed.
- Implementing the router agent itself. That stays in `router-telemetry-agent`, which this change only updates (D9).

## Decisions

### D1 — Whole stack in one namespace, not only backend + broker

```
                      https://<name>.cloud.htl-leonding.ac.at  (TLS at the platform edge)
                                         │
                               nginx ingress (one host)
     ┌───────────────┬───────────────────┼──────────────────┬────────────────┐
   /mqtt           /api, /q            /auth               /
     ▼               ▼                   ▼                  ▼
 mosquitto:9001   backend:8080       keycloak:8080      frontend:80
 (websockets)        │  ▲                 │
     ▲               │  │ mqtt://mosquitto:1883
     │               ▼  │                 ▼
     │          postgres:5432      keycloak-postgres:5432
     │
 router (any network, outbound 443 only)
   wss://<name>.cloud.htl-leonding.ac.at/mqtt
```

*Why:* the backend validates tokens from Keycloak, and the frontend calls the backend. With one hostname, all three on the same origin means no CORS, one certificate and one URL for the demo. *Alternative:* only backend and broker in the cloud, frontend and Keycloak local. Rejected, because a browser on another machine couldn't log in, and the issuer URL would differ between token and backend.

### D2 — Path-based ingress
`/mqtt` → `mosquitto:9001`, `/api` and `/q` → `backend:8080`, `/auth` → `keycloak:8080`, `/` → `frontend:80`. All `pathType: Prefix`. The backend's REST paths already start with `api/`, so no rewrite is needed. Keycloak gets its own path prefix (D5) instead of a rewrite.

Unverified: does Mosquitto's WebSocket listener accept `/mqtt` as request path, or does it need `/`? Most clients (Paho, mqtt.js) use `/mqtt` by default. Task 1.4 checks it. Fallback: nginx `rewrite-target` annotation, if LeoCloud allows annotations.

### D3 — MQTT over WebSockets for routers, TLS at the platform edge
Mosquitto gets a second listener:
```
listener 1883                 # backend, cluster-internal
listener 9001
protocol websockets           # routers, through the ingress
```
Both use the same `password_file` and `acl_file` (Mosquitto 2 applies global auth settings to all listeners unless `per_listener_settings` is set). The ingress forwards the WebSocket upgrade. ingress-nginx supports WebSockets without extra annotations. The router sees `wss://…:443` with the platform's Let's Encrypt certificate, so the router only needs a CA bundle, no self-signed CA.

*Alternatives:*
- Raw MQTT/TLS on 8883: impossible on LeoCloud (no `LoadBalancer`/`NodePort`).
- Router posts telemetry to a REST endpoint: works through HTTPS, but loses the Last Will (online/offline without polling) and the planned command channel over the same connection. Rejected.
- Hosted broker outside LeoCloud (e.g. HiveMQ Cloud free tier): offers 8883, but adds an external account and dependency, and the backend would leave the cluster for every message. Rejected, but kept as a fallback if WebSockets through the ingress turn out to be unusable (task 1.5).

### D4 — Backend inside the cluster: plain MQTT, mode `mqtt`
The backend connects to `mosquitto:1883` without TLS. The traffic never leaves the cluster network. `NETHERA_TELEMETRY_MODE=mqtt` and `QUARKUS_SCHEDULER_ENABLED=false`, as in Compose: the cloud backend can't reach a router behind NAT, so SSH fallback is meaningless there, and SSH attempts would only produce warnings. `auto` remains the default for local development.

Only one backend replica: the MQTT client ID `nethera-backend` is fixed (`clean-session=false`), and a second replica would kick the first off the broker.

### D5 — Keycloak in production mode under `/auth`
`start` instead of `start-dev`, because the hostname is public. Configuration: `KC_HTTP_RELATIVE_PATH=/auth`, `KC_HOSTNAME=https://<name>.cloud.htl-leonding.ac.at/auth`, `KC_PROXY_HEADERS=xforwarded`, `KC_HTTP_ENABLED=true` (TLS already ended at the edge), realm import as in Compose. The backend uses `QUARKUS_OIDC_AUTH_SERVER_URL=http://keycloak:8080/auth/realms/Nethera` (internal) and `QUARKUS_OIDC_TOKEN_ISSUER=https://<name>…/auth/realms/Nethera` (public), the same split as in Compose today. The realm export gets the cloud origin as additional redirect URI and web origin of `Nethera-frontend`. The localhost entries stay.

*Alternative:* the school's central Keycloak. Rejected, because the Nethera realm, roles and theme are ours, and we don't administer the school's server.

### D6 — Frontend config through a ConfigMap
The image stays the same as locally. A ConfigMap holding the cloud `config.js` is mounted with `subPath` over `/usr/share/nginx/html/config.js`: `API_BASE_URL: ''` (same origin), `KEYCLOAK_URL: 'https://<name>…/auth'`. No change to frontend code.

### D7 — Plain YAML plus `envsubst`, applied by a script
Manifests in `k8s/` contain two placeholders: `${NETHERA_HOST}` and `${IMAGE_TAG}`. `scripts/leocloud-deploy.sh` checks all required variables, builds and pushes the images (tag = short git SHA), creates the Secret with `kubectl create secret … --dry-run=client -o yaml | kubectl apply -f -`, renders the manifests with `envsubst` and applies them, then waits with `kubectl rollout status`.

*Alternative:* Kustomize or Helm. Kustomize is built into `kubectl` and would be fine too, but two placeholders don't justify overlays. Helm is too much for one environment.

### D8 — Secrets, storage, seed
- **Secret** `nethera-secrets`: DB password, Keycloak DB and admin password, MQTT backend and `router-1` password. `k8s/secrets.example.env` holds placeholders. The real `.env` is in `.gitignore`. The Mosquitto entrypoint already fails on a missing variable (`${…:?}`), and it is mounted through a ConfigMap together with `mosquitto.conf` and `acl`.
- **PVCs**: postgres 5 Gi, keycloak-postgres 2 Gi, mosquitto 1 Gi (8 Gi of 20).
- **Seed**: the Compose `seed` step becomes a Kubernetes `Job` that waits for the `router` table and runs `docker/seed.sql` (mounted from a ConfigMap). It is idempotent, as it is today.
- **Pod Security baseline**: the official images (`postgres:15`, `eclipse-mosquitto:2`, Keycloak, nginx, Temurin) run without privileges or host access, which baseline allows. Resource requests and limits are set on every container (Keycloak ~1 Gi, backend ~512 Mi), so that a namespace quota, if there is one, can schedule them.

### D9 — Effects on the open MQTT changes
After task group 1, the two open changes are updated in place (tasks group 2), not through delta specs, because neither has been archived into `openspec/specs/` yet:

- `router-telemetry-agent`:
  - The context assumption "broker on a laptop in the LAN" changes to "cloud broker over `wss`, laptop broker over `tcp` for development".
  - D1 (client): if `mosquitto_pub`/`mosquitto_sub` on 25.12.5 can connect over WebSockets with TLS, the shell design stays. Otherwise the agent switches to a library client with one persistent connection. Preferred: **Go + Paho** (`wss` support, single static binary, a natural fit for the later command channel; D1 already listed it as the reconsider option). Python + Paho only if Go cross-compiling turns out to be impractical.
  - D7 (UCI): new options `transport` (`tcp` | `wss`, default `wss`) and `ws_path` (default `/mqtt`). Port default becomes 443 for `wss`.
  - D9 (TLS): TLS is now required for `wss`, not deferred. The CA is the system bundle (`ca-bundle`), and `tls_ca` overrides it. NTP gating (D6) has to cover the TLS connect as well, not only speed, because certificate validation fails with a wrong clock.
- `mqtt-router-telemetry`: add a note to D8 and the risks: the broker in the cloud is reachable from the internet through TLS at the edge. The "TLS before internet-facing use" condition is met by the ingress. Plain 1883 stays LAN-only for local development.

## Risks / Trade-offs

- **[Ingress closes idle WebSockets]** → ingress-nginx's default `proxy-read-timeout` is 60 s, and the agent's keepalive is 30 s, so a keepalive always arrives in time. Task 1.5 measures this with an idle connection for 10 minutes. If the platform uses a shorter timeout, lower the keepalive.
- **[Broker reachable from the internet]** → Strong random passwords per router from the Secret (no demo defaults), ACL limits each router to its own namespace, the backend user can't publish. Brute force is possible in principle. Acceptable for a school project; revisit with client certificates if needed.
- **[Keycloak admin console public]** → Strong admin password from the Secret. Production mode. No `start-dev`.
- **[Router clock wrong after boot breaks TLS]** → The agent waits for NTP before connecting (D9). Reconnect backoff covers the remaining gap.
- **[LeoCloud down or reset during the demo]** → The local Compose stack keeps working unchanged. Switching the router back is one UCI change (`transport=tcp`, `broker=<laptop>.lan`, `port=1883`).
- **[Namespace resource quota too small for Keycloak + Java backend]** → Task 1.2 reads the namespace quota first. If it is too tight, Keycloak runs with lower heap (`JAVA_OPTS_KC_HEAP`) or the frontend nginx gets minimal requests.
- **[ghcr.io images private]** → Either make the packages public (no secrets in the images) or add an `imagePullSecret`. Task 1.3 decides.
- **[Agent client switch to Go is bigger than planned]** → The topic and payload contract stays the same. Only the transport layer of the agent changes, and nothing has been implemented on the router yet, so no code is thrown away.

## Migration Plan

1. Task group 1: probe the platform and the router. Record the answers in this design under Open Questions.
2. Task group 2: update `router-telemetry-agent` and `mqtt-router-telemetry` according to the answers.
3. Add the WebSocket listener to the local Compose broker and verify with the simulator over `ws`.
4. Write the manifests and the deploy script, deploy to the namespace, verify frontend, login, API.
5. Verify `wss` from outside the cluster with a desktop MQTT client, then with the router (once the agent supports `wss`).

Rollback: `kubectl delete -f` on the rendered manifests (the PVCs can be kept), and point the router back to the laptop broker. Nothing in the local setup depends on the cloud.

## Open Questions

To be answered in task group 1, before anything else is built:
- Namespace name and hostname, `kubectl` access, resource quota and limit ranges of the namespace.
- Are ingress annotations allowed (e.g. `nginx.ingress.kubernetes.io/proxy-read-timeout`, `rewrite-target`)? What timeouts does the platform ingress use for WebSockets?
- Does a WebSocket connection through the ingress to Mosquitto work at `/mqtt`, and does it stay open for 10 minutes with 30 s keepalives?
- Can `mosquitto_pub`/`mosquitto_sub` from the OpenWrt 25.12.5 feed (`mosquitto-client-ssl`) connect over WebSockets (`wss`)? Which version is in the feed?
- Is `ca-bundle` (or `ca-certificates`) available and installed on the Cudy, and does it validate the LeoCloud certificate (`openssl s_client` / `curl https://<name>…`)?
- Does outbound 443 from the router's network (school network, home network) to LeoCloud work without a proxy?
- ghcr.io: public packages or `imagePullSecret`?
