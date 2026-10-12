## 1. Probe platform and router (before anything else)

- [ ] 1.1 With the namespace owner: confirm `kubectl` access to `student-it220208`; check whether the deployed backend image (`nethera-backend:20261006-144848`) contains the MQTT ingestion (e.g. `NETHERA_MQTT_*` config or `smallrye-mqtt` in the image); note whether a new image is needed
- [ ] 1.2 Deploy a throwaway Mosquitto (`listener 9001` + `protocol websockets`, anonymous allowed, no PVC) with a ClusterIP Service and a temporary ingress path `/mqtt-probe`; from the laptop publish/subscribe against `wss://it220208.cloud.htl-leonding.ac.at/mqtt-probe` on 443 and check whether a non-root path works or needs `rewrite-target`
- [ ] 1.3 With the probe broker: keep an idle connection with keepalive 30 s open for 10 minutes and check it is not closed; test whether ingress annotations (`proxy-read-timeout`) are accepted; delete the probe resources afterwards
- [ ] 1.4 On the Cudy over SSH: `apk search mosquitto`, install `mosquitto-client-ssl`, `mosquitto_pub --help` (look for WebSocket options, note version); try publishing to the probe broker over `wss`
- [ ] 1.5 On the Cudy: check `ca-bundle` / `ca-certificates` is installed or installable, and that `curl -v https://it220208.cloud.htl-leonding.ac.at/` (or `openssl s_client`) validates the certificate; check outbound 443 works from the network the router will be in (school/home)
- [ ] 1.6 Record all answers in design.md "Open Questions" and adjust D2, D3 and D6 where an answer differs from the assumption (e.g. hosted broker fallback if WebSockets through the ingress are unusable)

## 2. Update the open MQTT changes

- [ ] 2.1 `router-telemetry-agent` design.md: change the context assumption (cloud broker over `wss`, laptop broker over `tcp` for development); update D1 with the client decision from 1.4 (shell + Mosquitto CLI if `wss` works, otherwise Go + Paho), D7 with `transport`/`ws_path`, D9 with mandatory TLS for `wss`, system CA bundle, and NTP gating before the TLS connect
- [ ] 2.2 `router-telemetry-agent` spec: add `transport` and `ws_path` to the configuration table, change `port` default (443 for `wss`), make `tls_ca` an override of the system CA bundle instead of "ignored", add scenarios for `wss` connect and for "clock not synced yet"
- [ ] 2.3 `router-telemetry-agent` proposal.md and tasks.md: replace "TLS out of scope", add the probe results from 1.4/1.5 to its task 1.1 notes, and rewrite the affected task groups if the client changes to Go
- [ ] 2.4 `mqtt-router-telemetry` design.md: add a follow-up "cloud deployment through `wss` with TLS at the ingress, 1883 stays LAN-only for local development"; update the TLS risk accordingly

## 3. Broker WebSocket listener (local first)

- [ ] 3.1 Add `listener 9001` with `protocol websockets` to `docker/mosquitto/mosquitto.conf`; keep `listener 1883`; confirm the password file and ACL apply to both listeners
- [ ] 3.2 Publish the WebSocket port in `compose.yaml` (`9001:9001`)
- [ ] 3.3 Extend `scripts/mqtt-simulate-router.sh` with an option to publish over `ws://<host>:9001/mqtt` (or note why the CLI can't, per 1.4)
- [ ] 3.4 Verify locally: publish as `router-1` over `ws`, backend ingests it; wrong password is refused; `router-1` → `nethera/2/...` is dropped

## 4. Broker in `deploy/leocloud/stack.yaml`

- [ ] 4.1 Add PVC `nethera-mosquitto-data` (1 Gi), Deployment `nethera-mosquitto` (`eclipse-mosquitto:2`, `Recreate`, entrypoint and config from ConfigMap `nethera-mosquitto`, `NETHERA_MQTT_*_PASSWORD` from `nethera-runtime`, TCP readiness on 1883) and ClusterIP Service exposing 1883 and 9001
- [ ] 4.2 Add ingress path `/mqtt` → `nethera-mosquitto:9001`; add annotations only if 1.2/1.3 showed they are needed and allowed
- [ ] 4.3 Backend: set `NETHERA_TELEMETRY_MODE=mqtt`, `NETHERA_MQTT_HOST=nethera-mosquitto`, `NETHERA_MQTT_PORT=1883`, `NETHERA_MQTT_USERNAME=nethera-backend`, `NETHERA_MQTT_PASSWORD` from the Secret; keep the scheduler off; new image tag if 1.1 requires it
- [ ] 4.4 Check with `grep` that no `NodePort`/`LoadBalancer`/`ExternalName`/`hostPort` is present and that PVCs sum to ≤ 20 Gi
- [ ] 4.5 Namespace owner: add `mqtt-backend-password` and `mqtt-router1-password` to `nethera-runtime`, create ConfigMap `nethera-mosquitto` from `docker/mosquitto/`, `kubectl apply -f deploy/leocloud/stack.yaml`, wait for rollouts

## 5. Verify in the cloud

- [ ] 5.1 Backend logs a successful MQTT connection to `nethera-mosquitto:1883` and no SSH attempts; existing pages (overview, devices) still load
- [ ] 5.2 From the laptop (outside the cluster), publish fake telemetry as `router-1` over `wss://it220208.cloud.htl-leonding.ac.at/mqtt` (simulator or MQTT Explorer); check speed/DNS/devices rows in the cloud DB
- [ ] 5.3 Check auth and ACL over `wss`: wrong password refused, `router-1` → `nethera/2/...` dropped; check port 1883/8883 on the host is not reachable
- [ ] 5.4 Delete the Mosquitto Pod; retained status/metadata survive
- [ ] 5.5 Once the agent supports `wss` (`router-telemetry-agent`): point the Cudy at the cloud, verify all streams arrive, then pull the router's power and check the Last Will `offline` arrives within about 45 s

## 6. Documentation

- [ ] 6.1 Extend `deploy/leocloud/README.md`: MQTT section (broker, `/mqtt` path, new Secret keys, ConfigMap `nethera-mosquitto`), how to point the router to the cloud vs. the laptop broker; replace the note "Scheduler und MQTT-Empfang sind dort aus"
- [ ] 6.2 Update the architecture diagram in `plantUML/` (or add one) with the cloud layout from design D1
