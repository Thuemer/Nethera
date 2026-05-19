## 1. Keycloak Realm Setup

- [x] 1.1 Start the docker-compose stack (`docker compose up -d`) and log into the Keycloak admin console at `http://localhost:8180` with `admin` / `admin`
- [x] 1.2 Create a new realm named `nethera`
- [x] 1.3 Create a public client named `nethera-frontend` in the `nethera` realm with Direct Access Grants (Resource Owner Password) enabled
- [x] 1.4 Create a user `dev` with password `dev` (non-temporary) in the `nethera` realm
- [x] 1.5 Verify OIDC discovery is reachable: `curl http://localhost:8180/realms/nethera/.well-known/openid-configuration`
- [x] 1.6 Export the `nethera` realm as JSON from the admin console and save it to `keycloak/nethera-realm-export.json` in the repository

## 2. Add quarkus-oidc Dependency

- [x] 2.1 Add `io.quarkus:quarkus-oidc` to `pom.xml` under `<dependencies>` (no version needed — managed by Quarkus BOM)

## 3. Configure OIDC in application.properties

- [x] 3.1 Add `quarkus.oidc.auth-server-url=http://localhost:8180/realms/nethera`
- [x] 3.2 Add `quarkus.oidc.client-id=nethera-frontend`
- [x] 3.3 Add `quarkus.oidc.application-type=service`

## 4. Secure REST Endpoints

- [x] 4.1 Add `@Authenticated` annotation to `RoutersResource` class (import `io.quarkus.security.Authenticated`)
- [x] 4.2 Add `@Authenticated` annotation to `ConnectedDevicesResource` class
- [x] 4.3 Add `@Authenticated` annotation to `SpeedStatsResource` class
- [x] 4.4 Add `@Authenticated` annotation to `DnsStatsResource` class
- [x] 4.5 Add `@Authenticated` annotation to `ActivityLogsResource` class

## 5. Verification

- [x] 5.1 Start Quarkus in dev mode and confirm it starts without OIDC discovery errors in the log
- [x] 5.2 Confirm `GET /api/routers/list` without a token returns HTTP 401
- [x] 5.3 Obtain a token: `curl -s -X POST http://localhost:8180/realms/nethera/protocol/openid-connect/token -d "client_id=nethera-frontend&grant_type=password&username=dev&password=dev" | jq -r .access_token`
- [x] 5.4 Confirm `GET /api/routers/list` with the token in `Authorization: Bearer <token>` returns HTTP 200
- [x] 5.5 Add the token retrieval `curl` command to `README.md` under a "Development" or "Authentication" section
