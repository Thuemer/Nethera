## ADDED Requirements

### Requirement: quarkus-oidc extension installed and configured
The application SHALL include the `quarkus-oidc` extension and `application.properties` SHALL contain `quarkus.oidc.auth-server-url`, `quarkus.oidc.client-id`, and `quarkus.oidc.application-type=service` pointing at the `nethera` Keycloak realm.

#### Scenario: OIDC discovery succeeds on startup
- **WHEN** Quarkus starts with Keycloak running on port 8180
- **THEN** the application fetches the OIDC discovery document without errors and starts successfully

#### Scenario: OIDC misconfiguration detected at startup
- **WHEN** Quarkus starts with an incorrect `quarkus.oidc.auth-server-url`
- **THEN** the application fails to start and logs an OIDC configuration error

### Requirement: All REST endpoints require a valid Bearer token
Every endpoint in `RoutersResource`, `ConnectedDevicesResource`, `SpeedStatsResource`, `DnsStatsResource`, and `ActivityLogsResource` SHALL reject requests that do not carry a valid Bearer JWT in the `Authorization` header.

#### Scenario: Request without Authorization header is rejected
- **WHEN** a GET request is sent to `/api/routers/list` with no `Authorization` header
- **THEN** the response status is 401 Unauthorized

#### Scenario: Request with invalid token is rejected
- **WHEN** a GET request is sent with `Authorization: Bearer <tampered-or-expired-token>`
- **THEN** the response status is 401 Unauthorized

#### Scenario: Request with valid token succeeds
- **WHEN** a GET request is sent with `Authorization: Bearer <valid-token-from-keycloak>`
- **THEN** the response status is 200 and the expected JSON body is returned

### Requirement: Token validation uses Keycloak JWKS
The application SHALL validate token signatures using the JWKS endpoint published by the Keycloak `nethera` realm, without hardcoding any secrets.

#### Scenario: Token signed by expected realm is accepted
- **WHEN** a token issued by the `nethera` realm on `localhost:8180` is presented
- **THEN** the token signature validates successfully and the request is processed

#### Scenario: Token signed by unknown issuer is rejected
- **WHEN** a self-signed JWT from a different issuer is presented
- **THEN** the response status is 401 Unauthorized
