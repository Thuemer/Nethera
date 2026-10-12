## 1. Probe platform and router (before anything else)

- [ ] 1.1 Get LeoCloud access: install `kubectl` per the user manual, log in, note namespace name and hostname `<name>.cloud.htl-leonding.ac.at`; record in design.md "Open Questions"
- [ ] 1.2 Read namespace limits: `kubectl describe quota`, `kubectl describe limitrange`, Pod Security labels on the namespace; record CPU/memory limits and adjust D8 requests if needed
- [ ] 1.3 Decide ghcr.io visibility (public packages vs. `imagePullSecret`); push a test image and check that a Pod can pull it
- [ ] 1.4 Deploy a throwaway Mosquitto (`listener 9001` + `protocol websockets`, anonymous allowed, no PVC) with a ClusterIP Service and an ingress path `/mqtt`; from the laptop run `mosquitto_sub`/`mosquitto_pub` or MQTT Explorer against `wss://<host>/mqtt` on 443 and check whether path `/mqtt` works or needs `rewrite-target`
- [ ] 1.5 With the probe broker: keep an idle connection with keepalive 30 s open for 10 minutes and check it is not closed; test whether ingress annotations (`proxy-read-timeout`) are accepted; delete the probe resources afterwards
- [ ] 1.6 On the Cudy over SSH: `apk search mosquitto`, install `mosquitto-client-ssl`, `mosquitto_pub --help` (look for WebSocket options, note version); try publishing to the probe broker over `wss://<host>/mqtt`
- [ ] 1.7 On the Cudy: check `ca-bundle` / `ca-certificates` is installed or installable, and that `curl -v https://<host>/` (or `openssl s_client`) validates the LeoCloud certificate; check outbound 443 works from the network the router will be in (school/home)
- [ ] 1.8 Record all answers in design.md "Open Questions" and adjust D2, D3, D8 and D9 where an answer differs from the assumption (e.g. hosted broker fallback if WebSockets through the ingress are unusable)

## 2. Update the open MQTT changes

- [ ] 2.1 `router-telemetry-agent` design.md: change the context assumption (cloud broker over `wss`, laptop broker over `tcp` for development); update D1 with the client decision from 1.6 (shell + Mosquitto CLI if `wss` works, otherwise Go + Paho), D7 with `transport`/`ws_path`, D9 with mandatory TLS for `wss`, system CA bundle, and NTP gating before the TLS connect
- [ ] 2.2 `router-telemetry-agent` spec: add the `transport` and `ws_path` options to the configuration table, change `port` default (443 for `wss`), make `tls_ca` an override of the system CA bundle instead of "ignored", add scenarios for `wss` connect and for "clock not synced yet"
- [ ] 2.3 `router-telemetry-agent` proposal.md and tasks.md: replace "TLS out of scope", add the probe results from 1.6/1.7 to its task 1.1 notes, and rewrite the affected task groups if the client changes to Go
- [ ] 2.4 `mqtt-router-telemetry` design.md: add follow-up C under "Follow-ups from agent exploration": cloud deployment through `wss` with TLS at the ingress, 1883 stays LAN-only for local development; update the TLS risk accordingly

## 3. Broker WebSocket listener (local first)

- [ ] 3.1 Add `listener 9001` with `protocol websockets` to `docker/mosquitto/mosquitto.conf`; keep `listener 1883`; confirm the password file and ACL apply to both listeners
- [ ] 3.2 Publish the WebSocket port in `compose.yaml` (`9001:9001`)
- [ ] 3.3 Extend `scripts/mqtt-simulate-router.sh` with an option to publish over `ws://<host>:9001/mqtt` (or note why the CLI can't, per 1.6)
- [ ] 3.4 Verify locally: publish as `router-1` over `ws`, backend ingests it; wrong password is refused; `router-1` → `nethera/2/...` is dropped

## 4. Kubernetes manifests

- [ ] 4.1 Create `k8s/` with `${NETHERA_HOST}`/`${IMAGE_TAG}` placeholders: Deployment + ClusterIP Service + PVC for `postgres` (5 Gi) and `keycloak-postgres` (2 Gi), with readiness probes (`pg_isready`)
- [ ] 4.2 Mosquitto: ConfigMap with `mosquitto.conf`, `acl` and `entrypoint.sh` (same files as Compose), Deployment with PVC (1 Gi), env from `nethera-secrets`, ClusterIP Service exposing 1883 and 9001
- [ ] 4.3 Keycloak: Deployment with `start`, `KC_HTTP_RELATIVE_PATH=/auth`, `KC_HOSTNAME=https://${NETHERA_HOST}/auth`, `KC_PROXY_HEADERS=xforwarded`, `KC_HTTP_ENABLED=true`, admin and DB credentials from the Secret; realm import and theme from ConfigMaps; readiness probe on `/auth/realms/Nethera`
- [ ] 4.4 Backend: Deployment (1 replica, `ghcr.io/thuemer/nethera-backend:${IMAGE_TAG}`) with the env vars from D4/D5 (`NETHERA_TELEMETRY_MODE=mqtt`, `NETHERA_MQTT_HOST=mosquitto`, `QUARKUS_SCHEDULER_ENABLED=false`, internal OIDC URL, public issuer), readiness on `/q/health/ready` if available, otherwise TCP
- [ ] 4.5 Frontend: Deployment (`ghcr.io/thuemer/nethera-frontend:${IMAGE_TAG}`) with a ConfigMap `config.js` mounted via `subPath` (same-origin API, Keycloak at `https://${NETHERA_HOST}/auth`)
- [ ] 4.6 Seed `Job` that waits for the `router` table and runs `docker/seed.sql` from a ConfigMap
- [ ] 4.7 Ingress (`ingressClassName: nginx`, one host, no `tls`): `/mqtt` → mosquitto:9001, `/api` and `/q` → backend, `/auth` → keycloak, `/` → frontend; add annotations only if 1.4/1.5 showed they are needed and allowed
- [ ] 4.8 Set resource requests/limits on every container according to 1.2; check with `grep` that no `NodePort`/`LoadBalancer`/`ExternalName`/`hostPort` is present and that PVCs sum to ≤ 20 Gi

## 5. Keycloak realm and secrets

- [ ] 5.1 Add `https://${NETHERA_HOST}/*` as redirect URI and `https://${NETHERA_HOST}` as web origin of `Nethera-frontend` in the realm import (rendered by the deploy script for the cloud; the local `Applikation/realm-export.json` keeps only localhost entries, or gets the fixed cloud host once known)
- [ ] 5.2 Create `k8s/secrets.example.env` with placeholders for all passwords; add the real `k8s/secrets.env` to `.gitignore`

## 6. Deploy script

- [ ] 6.1 Write `scripts/leocloud-deploy.sh`: check required variables and `kubectl` context first (stop and name the missing variable without touching the cluster), build and push backend and frontend images with tag = short git SHA
- [ ] 6.2 Create/update `nethera-secrets` from `k8s/secrets.env` (`--dry-run=client -o yaml | kubectl apply -f -`), render `k8s/` with `envsubst` and apply, wait with `kubectl rollout status` for every Deployment and for the seed Job

## 7. Verify in the cloud

- [ ] 7.1 Deploy into the namespace from scratch; all Pods ready, no admission errors
- [ ] 7.2 `https://<host>/` loads the frontend; `/q/health` returns `UP`; `/auth/realms/Nethera/.well-known/openid-configuration` shows the public issuer
- [ ] 7.3 Log in through the cloud frontend and load the pages that call the API (overview, devices)
- [ ] 7.4 From the laptop (outside the cluster), publish fake telemetry as `router-1` over `wss://<host>/mqtt` (simulator or MQTT Explorer); check speed/DNS/devices rows in the cloud DB and that the backend logs no SSH attempts
- [ ] 7.5 Check auth and ACL over `wss`: wrong password refused, `router-1` → `nethera/2/...` dropped; check port 1883/8883 on the host is not reachable
- [ ] 7.6 Delete the postgres and mosquitto Pods; data and retained status/metadata survive
- [ ] 7.7 Once the agent supports `wss` (`router-telemetry-agent`): point the Cudy at the cloud, verify all streams arrive, then pull the router's power and check the Last Will `offline` arrives within about 45 s

## 8. Documentation

- [ ] 8.1 Add a German "LeoCloud-Deployment" section to the README: prerequisites (kubectl login, ghcr token), `secrets.env`, running the deploy script, URL layout, how to point the router to the cloud vs. the laptop broker, rollback
- [ ] 8.2 Update the architecture diagram in `plantUML/` (or add one) with the cloud layout from design D1
