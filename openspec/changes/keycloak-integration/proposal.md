## Why

The Nethera REST API endpoints are currently publicly accessible with no authentication — any caller can read router data, connected devices, and network statistics. With Keycloak already running in the docker-compose stack, wiring up OIDC authentication in Quarkus is the natural next step to protect this data.

## What Changes

- Add `quarkus-oidc` extension to `pom.xml`
- Configure Quarkus to validate Bearer JWT tokens issued by a `nethera` Keycloak realm
- Annotate all REST resource endpoints (`RoutersResource`, `ConnectedDevicesResource`, `SpeedStatsResource`, `DnsStatsResource`, `ActivityLogsResource`) with `@Authenticated` so unauthenticated requests receive HTTP 401
- Create a `nethera` realm in Keycloak with a backend client and at least one dev user
- Add OIDC properties to `application.properties` pointing at Keycloak on `localhost:8180`
- Document how to obtain a token and call the API during development

## Capabilities

### New Capabilities

- `oidc-authentication`: Quarkus OIDC extension configured to validate JWT tokens from Keycloak; all REST endpoints require a valid Bearer token
- `keycloak-realm-setup`: Keycloak `nethera` realm with a confidential backend client, a `user` role, and a dev user for local testing

### Modified Capabilities

<!-- none — keycloak-infrastructure requirements are unchanged -->

## Impact

- **pom.xml**: new `quarkus-oidc` dependency
- **application.properties**: new `quarkus.oidc.*` properties (issuer URL, client-id, credentials)
- **All boundary resource classes**: `@Authenticated` annotation on class or methods
- **Keycloak**: realm configuration (can be exported as a realm JSON for reproducibility)
- **Dev workflow**: developers must obtain a JWT token from Keycloak before calling the API; dev-mode OIDC dev-services or a helper script should ease this
