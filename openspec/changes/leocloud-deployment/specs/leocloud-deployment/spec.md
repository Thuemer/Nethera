## ADDED Requirements

### Requirement: Stack runs in one LeoCloud namespace within platform limits
The repository SHALL contain Kubernetes manifests under `k8s/` that run frontend, backend, PostgreSQL, Keycloak, the Keycloak database and Mosquitto in one LeoCloud namespace. All Services SHALL be of type `ClusterIP`. No Pod SHALL use `hostPort`, `hostNetwork`, `hostPath` or privileged mode, so the namespace's Pod Security baseline admits every Pod. The sum of all PersistentVolumeClaims SHALL stay at or below 20 GB.

#### Scenario: Manifests are admitted
- **WHEN** `kubectl apply` is run with the manifests against the namespace
- **THEN** every resource is created without admission errors, and all Deployments reach `Available`

#### Scenario: Forbidden service type is never used
- **WHEN** the manifests are searched for `type: NodePort`, `type: LoadBalancer`, `type: ExternalName` and `hostPort`
- **THEN** none is found

#### Scenario: Storage within quota
- **WHEN** the `storage` requests of all PVCs in `k8s/` are summed
- **THEN** the sum is at most 20 GiB

### Requirement: One ingress routes by path
The namespace SHALL have one Ingress with `ingressClassName: nginx`, a single host `<name>.cloud.htl-leonding.ac.at` and no `tls` section. It SHALL route `/mqtt` to the Mosquitto WebSocket listener, `/api` and `/q` to the backend, `/auth` to Keycloak, and every other path to the frontend.

#### Scenario: Frontend over HTTPS
- **WHEN** a browser opens `https://<name>.cloud.htl-leonding.ac.at/`
- **THEN** the Nethera frontend loads with a valid certificate

#### Scenario: Backend over HTTPS
- **WHEN** a client requests `https://<name>.cloud.htl-leonding.ac.at/q/health`
- **THEN** the backend answers with status `UP`

#### Scenario: Keycloak over HTTPS
- **WHEN** a client requests `https://<name>.cloud.htl-leonding.ac.at/auth/realms/Nethera/.well-known/openid-configuration`
- **THEN** Keycloak answers, and the `issuer` in the response is `https://<name>.cloud.htl-leonding.ac.at/auth/realms/Nethera`

### Requirement: Routers reach the broker through MQTT over secure WebSockets
Mosquitto SHALL offer a WebSocket listener that is reachable from outside the cluster as `wss://<name>.cloud.htl-leonding.ac.at/mqtt` on port 443. TLS SHALL end at the platform edge. Authentication and the per-router ACL SHALL apply to the WebSocket listener exactly as to the TCP listener. A router SHALL NOT need any inbound reachability: all connections are opened by the router.

#### Scenario: Router publishes from outside the cluster
- **WHEN** a client outside the cluster connects to `wss://<name>.cloud.htl-leonding.ac.at/mqtt` as `router-1` with its password and publishes to `nethera/1/telemetry/speed`
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
- **WHEN** a client outside the cluster tries to connect to `<name>.cloud.htl-leonding.ac.at` on port 1883 or 8883
- **THEN** the connection fails

### Requirement: Status connection survives the ingress
A connection over `wss` that sends MQTT keepalives every 30 s SHALL stay open through the ingress for at least 10 minutes without traffic other than keepalives. The Last Will SHALL fire only when the router actually disappears.

#### Scenario: Idle status connection stays up
- **WHEN** the router's status connection is open over `wss` and only keepalives flow for 10 minutes
- **THEN** the connection is not closed, and the retained status stays `online`

#### Scenario: Router disappears
- **WHEN** the router loses power while connected over `wss`
- **THEN** the broker publishes the Last Will `offline` within about 45 s

### Requirement: Backend uses internal MQTT and MQTT-only telemetry in the cloud
In the cloud, the backend SHALL connect to the broker through the in-cluster Service `mosquitto` on port 1883 (no TLS, cluster network only), and SHALL run with `nethera.telemetry.mode=mqtt`. It SHALL NOT try to open SSH connections to routers.

#### Scenario: Backend connects internally
- **WHEN** the backend Pod starts
- **THEN** it logs a successful MQTT connection to `mosquitto:1883`

#### Scenario: No SSH attempts
- **WHEN** the backend runs in the cloud and a telemetry stream is stale
- **THEN** no SSH connection is attempted, and no SSH warning is logged

### Requirement: Secrets are not committed and have no defaults in the cloud
Database, Keycloak admin and MQTT passwords SHALL be provided as Kubernetes Secrets created from local values at deploy time. The repository SHALL contain only a template without real values. The cloud deployment SHALL fail to start a component whose secret is missing, instead of falling back to a demo default.

#### Scenario: Secret template only
- **WHEN** the repository is searched for the cloud passwords
- **THEN** only placeholder values in a template file are found

#### Scenario: Missing secret
- **WHEN** the MQTT router password is not set in the Secret
- **THEN** the Mosquitto Pod does not become ready, and its log names the missing variable

### Requirement: Data persists across Pod restarts
PostgreSQL, the Keycloak database and Mosquitto SHALL store their data on PersistentVolumeClaims.

#### Scenario: Database Pod restarted
- **WHEN** the PostgreSQL Pod is deleted and recreated
- **THEN** routers, devices and stats written before are still present

#### Scenario: Broker Pod restarted
- **WHEN** the Mosquitto Pod is deleted and recreated
- **THEN** retained status and metadata messages are still delivered to a new subscriber

### Requirement: Cloud configuration of frontend and Keycloak
The frontend SHALL get a cloud `config.js` with same-origin API base URL and Keycloak at `https://<name>.cloud.htl-leonding.ac.at/auth`, without changing frontend source files. Keycloak SHALL run in production mode (`start`, not `start-dev`) behind the proxy under the path `/auth`. The realm SHALL allow the cloud origin as redirect URI and web origin for the frontend client.

#### Scenario: Login in the cloud
- **WHEN** a user opens the cloud frontend and logs in
- **THEN** Keycloak redirects back to the frontend, and API calls with the token succeed

#### Scenario: Local setup unchanged
- **WHEN** `docker compose up -d --build` is run locally
- **THEN** frontend, backend and Keycloak work on their localhost ports as before

### Requirement: Images and deploy script
Backend and frontend images SHALL be built from the existing Dockerfiles and pushed to `ghcr.io`. The repository SHALL contain `scripts/leocloud-deploy.sh` that builds and pushes the images, creates or updates the Secrets from local environment variables, applies the manifests and waits for all Deployments to roll out.

#### Scenario: Deploy from scratch
- **WHEN** the script runs against an empty namespace with all required environment variables set
- **THEN** the full stack is running and reachable under the ingress host

#### Scenario: Missing variable
- **WHEN** a required environment variable is not set
- **THEN** the script stops before changing anything in the cluster and names the variable

### Requirement: Broker WebSocket listener available locally
The Compose stack SHALL expose the same Mosquitto WebSocket listener locally, so that the `ws` transport can be tested without the cloud.

#### Scenario: Local WebSocket publish
- **WHEN** a client publishes over `ws://localhost:<ws-port>/mqtt` as `router-1`
- **THEN** the local backend ingests the message as it does over port 1883
