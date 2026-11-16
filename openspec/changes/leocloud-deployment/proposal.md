## Why

Nethera already runs on LeoCloud (`deploy/leocloud/stack.yaml`, https://it220208.cloud.htl-leonding.ac.at/): frontend, backend, Keycloak and both databases. The broker is missing there, so the cloud backend runs with `NETHERA_TELEMETRY_MODE=ssh`, the scheduler off, and shows only demo data. A real router can't feed it: LeoCloud exposes only HTTP(S) through a shared nginx ingress on one hostname per namespace, so a router outside the cluster can't reach a plain MQTT port there. The router has to reach the broker through HTTPS (MQTT over WebSockets over TLS, port 443).

## What Changes

- Add Mosquitto to `deploy/leocloud/stack.yaml`: Deployment, ClusterIP Service (1883 + 9001), PVC (1 Gi), config/ACL/entrypoint from a ConfigMap (same files as Compose), MQTT passwords from the existing Secret `nethera-runtime`.
- Mosquitto gets a second listener with `protocol websockets`. The existing ingress gets one more path `/mqtt` → Mosquitto port 9001. TLS ends at the platform edge as for the other paths. The Compose stack gets the same WebSocket listener so the `ws` path can be tested locally.
- Switch the cloud backend to `NETHERA_TELEMETRY_MODE=mqtt` with `NETHERA_MQTT_*` pointing to the in-cluster broker. SSH fallback is impossible in the cloud because the router sits behind NAT.
- Routers only need outbound internet access on 443. Nothing on the router needs to be reachable from outside.
- Open questions about the router and the platform are answered in the first task group of the implementation, before anything else is built: WebSocket support of the Mosquitto CLI client on OpenWrt 25.12.5, CA bundle, how the ingress handles WebSocket timeouts and paths.
- The two open MQTT changes are adapted to these results: `router-telemetry-agent` (client choice, configuration, TLS, "broker on laptop in LAN" assumption) and `mqtt-router-telemetry` (D8 broker setup, TLS risk).
- Out of scope: everything the existing LeoCloud setup already covers (manifests for frontend/backend/Keycloak/DBs, ghcr images, Keycloak paths, realm, seed, deploy procedure). This change only adds to it.

## Capabilities

### New Capabilities
- `leocloud-mqtt`: MQTT on LeoCloud, covering the broker in the namespace, MQTT over WebSockets through the ingress for routers, internal MQTT for the backend, broker secrets and storage, and verification of a router connecting from outside the cluster.

### Modified Capabilities
<!-- None in openspec/specs. The MQTT broker and agent specs still live in the open changes
     `mqtt-router-telemetry` and `router-telemetry-agent`. They are updated there (tasks group 2),
     not through delta specs here. -->

## Impact

- **Changed files**: `deploy/leocloud/stack.yaml` (Mosquitto resources, ingress path, backend env), `deploy/leocloud/README.md` (MQTT section, Secret keys), `docker/mosquitto/mosquitto.conf` (WebSocket listener), `compose.yaml` (publish the WebSocket port locally).
- **Secret** `nethera-runtime`: two new keys `mqtt-backend-password` and `mqtt-router1-password`, set by the namespace owner.
- **Backend code**: no changes expected. A new backend image is only needed if the deployed tag predates the MQTT code.
- **Router / agent**: the agent must speak `wss://it220208.cloud.htl-leonding.ac.at/mqtt` on port 443 with CA validation (Let's Encrypt). Depending on the probe, this keeps the shell + Mosquitto CLI design or switches the agent to a client library (Go + Paho). That decision is recorded in `router-telemetry-agent`.
- **Security**: the broker becomes reachable from the internet (via TLS). Strong per-router passwords and the existing ACL are required.
- **Dependencies**: `kubectl` access to namespace `student-it220208` (owned by a teammate, who applies the changes or grants access).
