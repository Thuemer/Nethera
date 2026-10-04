## 1. Extract shared ingestion (no behavior change)

- [x] 1.1 Create package `at.htlleonding.telemetry` with records `MetadataSample(model, firmware)`, `SpeedSample(downloadMbps, uploadMbps)`, `CounterSample(rxBytes, txBytes, ts)`, `DnsSample(forwarded, answeredLocally)`, `DeviceSnapshot(leases, reachableMacs, wifiMacs)` and enum `TelemetryStream { METADATA, SPEED, DNS, DEVICES }`
- [x] 1.2 Create `MetadataIngestor` with the router update logic from `syncRouterMetadata` (model/firmware/isOnline/lastSeen, null fields left unchanged)
- [x] 1.3 Create `DnsIngestor` with a per-router `Map<Long, DnsBaseline>` and the delta / first-run / negative-delta rules from `syncDnsStats`
- [x] 1.4 Create `SpeedIngestor` with `ingestRate(router, SpeedSample)` for SSH and `ingestCounters(router, CounterSample)` with a per-router baseline, Δbytes/Δt, and the reset / `ts_now ≤ ts_prev` rules
- [x] 1.5 Create `DeviceIngestor` with the lease upsert + CONNECTED/DISCONNECTED logic from `parseAndSaveLeases`, `findExistingDevice` and `emitActivityLog`
- [x] 1.6 Write unit tests for the four ingestors that cover every scenario in `router-dns-sync`, `router-speed-sync`, `router-metadata-sync` and `router-activity-log` (including the transport-switch scenarios)
- [x] 1.7 Rewire `RouterMetricsSyncService` and `RouterSyncService` to only run SSH commands + parse text into the samples, then call the ingestors; remove the `prevForwarded`/`prevAnsweredLocally` fields
- [ ] 1.8 Manually verify the SSH sync against the real router: `SpeedStat`, `DnsStat`, devices and activity logs are written as before

## 2. Transport mode and freshness

- [x] 2.1 Add a `@ConfigMapping` for `nethera.telemetry.mode` (`ssh|mqtt|auto`, default `auto`) and `nethera.mqtt.stale-after` (default `180s`); an invalid mode fails startup with a message listing the allowed values
- [x] 2.2 Create `TelemetryFreshness` (`markIngested(routerId, stream)`, `setStatus(routerId, online)`, `isFresh(routerId, stream)`); metadata is fresh only while status is online
- [x] 2.3 Change `RouterSyncScheduler` to sync the router configured by `nethera.router.id` (default 1, the router the SSH IP/key belong to) instead of a hard-coded 1, and per stream skip SSH when mode is `mqtt` or (`auto` and fresh); MQTT ingestion handles any router ID
- [x] 2.4 Log one INFO line per router+stream when the transport switches between MQTT and SSH
- [x] 2.5 Make the SSH metadata path leave `isOnline` alone while the MQTT metadata stream is fresh (covered by the scheduler: SSH metadata never runs while that stream is fresh)
- [x] 2.6 Unit-test the scheduler decisions for `ssh`, `mqtt`, `auto`+fresh, `auto`+stale and partially fresh streams (mock collectors + freshness)

## 3. Broker

- [x] 3.1 Add `docker/mosquitto/mosquitto.conf` (listener 1883, `allow_anonymous false`, `password_file`, `acl_file`, persistence)
- [x] 3.2 Add `docker/mosquitto/acl`: backend user `read nethera/+/#`, user `router-1` `write nethera/1/#` (+ `read nethera/1/status` for the LWT subscriber)
- [x] 3.3 Add an entrypoint step that builds the password file from `NETHERA_MQTT_BACKEND_PASSWORD` and `NETHERA_MQTT_ROUTER1_PASSWORD` (demo defaults) with `mosquitto_passwd -b`
- [x] 3.4 Add the `mosquitto` service + `mosquitto-data` volume to `compose.yaml`, publish `1883:1883`, make `backend` depend on it, and set `NETHERA_TELEMETRY_MODE=mqtt` plus MQTT host and credentials on the backend
- [ ] 3.5 Verify: an anonymous client is rejected, `router-1` cannot publish to `nethera/2/...`, and the backend user cannot publish

## 4. MQTT consumers

- [x] 4.1 Add `io.quarkus:quarkus-messaging-mqtt` to `pom.xml`
- [x] 4.2 Configure one incoming channel `router-telemetry` on `nethera/#` in `application.properties` (QoS 1 subscription, fixed client ID `nethera-backend`, `auto-clean-session=false`, `failure-strategy=ignore`, `max-message-size=65536`); `TelemetryModeConfigInterceptor` disables it when the mode is `ssh`
- [x] 4.3 Create payload DTOs in `at.htlleonding.mqtt` with validation (`v == 1`, required fields, MAC lowercase normalization)
- [x] 4.4 Implement `MqttTelemetryConsumer` (`@Incoming @Blocking`, always acks) and `TelemetryMessageHandler` (`@Transactional`): read router ID from the topic, look up `Router` (unknown → warn + drop), parse to samples, call the ingestor, call `TelemetryFreshness.markIngested`
- [x] 4.5 Implement the status handler: `online` → `isOnline=true`, `lastSeen=now`; `offline` → `isOnline=false`; update `TelemetryFreshness`
- [x] 4.6 Catch and log malformed JSON / validation errors per message so the channel keeps running
- [ ] 4.7 Integration test with Quarkus Dev Services (or a Testcontainers Mosquitto): publish one valid message per stream and assert rows; publish a malformed one and assert the next valid message is still processed
- [x] 4.8 Confirm `nethera.telemetry.mode=ssh` starts without a broker and makes no MQTT connection attempt

## 5. Simulator and end-to-end check

- [x] 5.1 Write `scripts/mqtt-simulate-router.sh <id>` (Dockerized `mosquitto_pub` on the Compose network, rising counters, devices toggling online/offline, retained metadata + `online` status, `offline` on Ctrl+C)
- [ ] 5.2 Run the simulator against `docker compose up` and confirm dashboard data and activity logs update within two cycles
- [ ] 5.3 With the backend in `auto` mode: start the simulator and confirm the scheduler stops SSH per stream; stop it and confirm `isOnline` flips and SSH fallback resumes after `stale-after`

## 6. Documentation

- [x] 6.1 Update the root `README.md` (Mosquitto in the stack, port 1883, new password env vars, simulator usage, telemetry modes)
- [x] 6.2 Add a short MQTT section to `Backend/Nethera/README.md` (topic table, payload examples, how to switch modes)
- [ ] 6.3 Hand the topic/payload contract to the router-side owner so they can start the `router-telemetry-agent` change
