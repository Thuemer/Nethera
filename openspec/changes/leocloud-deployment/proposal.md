## Why

Nethera should run in the school cloud (LeoCloud, the HTL Leonding Kubernetes cluster), not on a developer laptop. The current MQTT design assumes the broker runs in the Compose stack on a laptop in the router's LAN and is reached on port 1883. LeoCloud exposes only HTTP(S) through a shared nginx ingress on one hostname per namespace, so a router outside the cluster can't reach a plain MQTT port there. The router has to reach the broker through HTTPS (MQTT over WebSockets over TLS, port 443).

## What Changes

- Add Kubernetes manifests for the full stack in one LeoCloud namespace: frontend, backend, PostgreSQL, Keycloak with its database, and Mosquitto. Every Service is `ClusterIP`, and all manifests stay within Pod Security baseline and the 20 GB PVC limit.
- Add one ingress on `<name>.cloud.htl-leonding.ac.at` that routes by path: `/mqtt` → Mosquitto WebSocket listener, `/api` and `/q` → backend, `/auth` → Keycloak, `/` → frontend. TLS ends at the platform edge. The ingress has no `tls` section.
- Mosquitto gets a second listener with `protocol websockets` for routers (behind the ingress). The backend keeps using plain MQTT on 1883 inside the cluster. Auth and per-router ACL stay as they are. The Compose stack gets the same WebSocket listener so the `wss` path can be tested locally.
- In the cloud, the backend runs with `nethera.telemetry.mode=mqtt`. SSH fallback is impossible there because the router sits behind NAT. `auto` and `ssh` remain for local development.
- Routers only need outbound internet access on 443. Nothing on the router needs to be reachable from outside.
- Secrets (DB, Keycloak admin, MQTT passwords) live in Kubernetes Secrets and are not committed. The cloud has no demo-default passwords.
- Images for backend and frontend are built and pushed to GitHub Container Registry (`ghcr.io/thuemer/...`). A deploy script applies the manifests with `kubectl`.
- The frontend gets its cloud `config.js` (same-origin API, Keycloak under `/auth`) through a ConfigMap, with no change to frontend code. The Keycloak realm gets the cloud redirect URI.
- Open questions about the router and the platform are answered in the first task group of the implementation, before anything else is built: WebSocket support of the Mosquitto CLI client on OpenWrt 25.12.5, CA bundle, how the ingress handles WebSocket timeouts and paths, and the namespace hostname.
- The two open MQTT changes are adapted to these results: `router-telemetry-agent` (client choice D1, configuration D7, TLS D9, "broker on laptop in LAN" assumption) and `mqtt-router-telemetry` (D8 broker setup, TLS risk).

## Capabilities

### New Capabilities
- `leocloud-deployment`: Running the Nethera stack on LeoCloud, covering namespace resources, path-based ingress, MQTT over WebSockets for routers, internal MQTT for the backend, secrets, persistent storage, image registry, deploy script, cloud configuration of backend/frontend/Keycloak, and verification of a router connecting from outside the cluster.

### Modified Capabilities
<!-- None in openspec/specs. The MQTT broker and agent specs still live in the open changes
     `mqtt-router-telemetry` and `router-telemetry-agent`. They are updated there (tasks group 2),
     not through delta specs here. -->

## Impact

- **New files**: `k8s/` (manifests, ConfigMaps, Secret templates), `scripts/leocloud-deploy.sh`, cloud `config.js` for the frontend, a section on LeoCloud in the README.
- **Changed files**: `docker/mosquitto/mosquitto.conf` (WebSocket listener), `compose.yaml` (publish the WebSocket port locally), `Applikation/realm-export.json` (cloud redirect URI and web origin).
- **Backend code**: no changes expected. Configuration only, through env vars (`NETHERA_MQTT_HOST=mosquitto`, `NETHERA_TELEMETRY_MODE=mqtt`, OIDC URLs).
- **Router / agent**: the agent must speak `wss://<host>/mqtt` on port 443 with CA validation (Let's Encrypt). Depending on the probe, this keeps the shell + Mosquitto CLI design or switches the agent to a client library (Go + Paho, or Python + Paho). That decision is recorded in `router-telemetry-agent`.
- **Security**: the broker becomes reachable from the internet (via TLS). Strong per-router passwords and the existing ACL are required. Keycloak runs in production mode, not `start-dev`.
- **Dependencies**: a LeoCloud namespace with `kubectl` access (school account), and a GitHub token with `write:packages` for ghcr.io.
