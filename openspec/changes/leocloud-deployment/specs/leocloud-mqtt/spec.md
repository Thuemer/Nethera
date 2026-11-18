## ADDED Requirements

### Requirement: Broker runs in the LeoCloud namespace within platform limits
`deploy/leocloud/stack.yaml` SHALL contain a Mosquitto Deployment, a `ClusterIP` Service exposing ports 1883 and 9001, and a PersistentVolumeClaim for broker data, next to the existing Nethera resources. The broker Pod SHALL NOT use `hostPort`, `hostNetwork`, `hostPath` or privileged mode. Broker configuration, ACL and entrypoint SHALL be the same files as in the Compose stack. The sum of all PVCs in `stack.yaml` SHALL stay at or below 20 GB.

#### Scenario: Broker is admitted
- **WHEN** `kubectl apply -f deploy/leocloud/stack.yaml` is run against the namespace
- **THEN** the Mosquitto resources are created without admission errors, and the Deployment reaches `Available`

#### Scenario: Forbidden service type is never used
- **WHEN** `stack.yaml` is searched for `type: NodePort`, `type: LoadBalancer`, `type: ExternalName` and `hostPort`
- **THEN** none is found

#### Scenario: Storage within quota
- **WHEN** the `storage` requests of all PVCs in `stack.yaml` are summed
- **THEN** the sum is at most 20 GiB

### Requirement: Routers reach the broker through MQTT over secure WebSockets
The existing ingress SHALL route the path `/mqtt` to the Mosquitto WebSocket listener, so that it is reachable from outside the cluster as `wss://it220208.cloud.htl-leonding.ac.at/mqtt` on port 443. TLS SHALL end at the platform edge. Authentication and the per-router ACL SHALL apply to the WebSocket listener exactly as to the TCP listener. A router SHALL NOT need any inbound reachability: all connections are opened by the router. Existing ingress paths SHALL keep working.

#### Scenario: Router publishes from outside the cluster
- **WHEN** a client outside the cluster connects to `wss://it220208.cloud.htl-leonding.ac.at/mqtt` as `router-1` with its password and publishes to `nethera/1/telemetry/speed`
- **THEN** the backend receives and ingests the message

#### Scenario: Router behind NAT
- **WHEN** the router sits behind NAT with no port forwarding and only outbound access on 443
- **THEN** it can connect, publish and hold its status connection

#### Scenario: Wrong password over WebSockets
- **WHEN** a client connects over `wss` with a wrong password
- **THEN** the broker refuses the connection

#### Scenario: ACL applies over WebSockets
- **WHEN** `router-1` publishes to `nethera/2/telemetry/speed` over `wss`
- **THEN** the broker drops the message

#### Scenario: Plain MQTT port not exposed
- **WHEN** a client outside the cluster tries to connect to `it220208.cloud.htl-leonding.ac.at` on port 1883 or 8883
- **THEN** the connection fails

#### Scenario: Existing paths unaffected
- **WHEN** the `/mqtt` path has been added
- **THEN** `/`, `/api` and `/realms` still reach frontend, backend and Keycloak

### Requirement: Status connection survives the ingress
A connection over `wss` that sends MQTT keepalives every 30 s SHALL stay open through the ingress for at least 10 minutes without traffic other than keepalives. The Last Will SHALL fire only when the router actually disappears.

#### Scenario: Idle status connection stays up
- **WHEN** the router's status connection is open over `wss` and only keepalives flow for 10 minutes
- **THEN** the connection is not closed, and the retained status stays `online`

#### Scenario: Router disappears
- **WHEN** the router loses power while connected over `wss`
- **THEN** the broker publishes the Last Will `offline` within about 45 s

### Requirement: Backend uses internal MQTT and MQTT-only telemetry in the cloud
In the cloud, the backend SHALL connect to the broker through the in-cluster Service `nethera-mosquitto` on port 1883 (no TLS, cluster network only), and SHALL run with `nethera.telemetry.mode=mqtt`. It SHALL NOT try to open SSH connections to routers.

#### Scenario: Backend connects internally
- **WHEN** the backend Pod starts
- **THEN** it logs a successful MQTT connection to `nethera-mosquitto:1883`

#### Scenario: No SSH attempts
- **WHEN** the backend runs in the cloud and a telemetry stream is stale
- **THEN** no SSH connection is attempted, and no SSH warning is logged

### Requirement: Broker secrets are not committed and have no defaults in the cloud
The MQTT passwords SHALL come from the existing Kubernetes Secret `nethera-runtime`. The repository SHALL NOT contain the cloud MQTT passwords. The broker SHALL fail to start when a password key is missing, instead of falling back to a demo default.

#### Scenario: No cloud passwords in the repository
- **WHEN** the repository is searched for the cloud MQTT passwords
- **THEN** none is found

#### Scenario: Missing secret
- **WHEN** `mqtt-router1-password` is not set in `nethera-runtime`
- **THEN** the Mosquitto Pod does not become ready, and its log names the missing variable

### Requirement: Broker data persists across Pod restarts
Mosquitto SHALL store its persistence data on a PersistentVolumeClaim.

#### Scenario: Broker Pod restarted
- **WHEN** the Mosquitto Pod is deleted and recreated
- **THEN** retained status and metadata messages are still delivered to a new subscriber

### Requirement: Broker WebSocket listener available locally
The Compose stack SHALL expose the same Mosquitto WebSocket listener locally, so that the `ws` transport can be tested without the cloud. The local setup SHALL otherwise work as before.

#### Scenario: Local WebSocket publish
- **WHEN** a client publishes over `ws://localhost:9001/mqtt` as `router-1`
- **THEN** the local backend ingests the message as it does over port 1883

#### Scenario: Local setup unchanged
- **WHEN** `docker compose up -d --build` is run locally
- **THEN** frontend, backend, Keycloak and the broker on 1883 work as before
