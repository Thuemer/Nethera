## Why

The application currently has no authentication or authorization layer. Keycloak provides a production-ready identity and access management solution that integrates natively with Quarkus via `quarkus-oidc`.

## What Changes

- `Backend/Nethera/docker-compose.yml` extended with two new services: `keycloak` and `keycloak-postgres`
- `keycloak-postgres` is a dedicated PostgreSQL 15 instance for Keycloak state (realms, users, clients)
- `keycloak` runs in `start-dev` mode on host port `8180`
- A new named volume `keycloak-pgdata` is declared alongside the existing `pgdata`

## Capabilities

### New Capabilities
- `keycloak-infrastructure`: Docker Compose services for Keycloak and its dedicated PostgreSQL database

### Modified Capabilities

## Impact

- `Backend/Nethera/docker-compose.yml` — only file modified
- No application code changes in this change
- Quarkus app and Website are unaffected; Keycloak integration (quarkus-oidc config, realm setup) is out of scope
