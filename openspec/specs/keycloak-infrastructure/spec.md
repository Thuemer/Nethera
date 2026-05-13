## ADDED Requirements

### Requirement: Keycloak service in docker-compose
The docker-compose stack SHALL include a Keycloak 26.2 service accessible on host port 8180, backed by a dedicated PostgreSQL 15 database.

#### Scenario: Keycloak starts successfully
- **WHEN** `docker compose up -d` is run
- **THEN** Keycloak is reachable at `http://localhost:8180` and the admin console is accessible

#### Scenario: Keycloak admin login
- **WHEN** the user navigates to `http://localhost:8180` and logs in with `admin` / `admin`
- **THEN** the Keycloak admin console is displayed

### Requirement: Dedicated Keycloak database
The docker-compose stack SHALL include a `keycloak-postgres` PostgreSQL 15 service that is the sole database backend for Keycloak.

#### Scenario: Keycloak database is isolated from app database
- **WHEN** both `postgres` and `keycloak-postgres` are running
- **THEN** each service has its own named volume and the `nethera` database is unaffected by Keycloak schema changes

#### Scenario: Keycloak database reachable from host
- **WHEN** `keycloak-postgres` is running
- **THEN** it is accessible from the host on port 5433

### Requirement: Existing postgres service unchanged
The existing `postgres` service (db: `nethera`, port: `5432`) SHALL remain functionally identical after the change.

#### Scenario: App database unaffected
- **WHEN** the updated docker-compose.yml is applied
- **THEN** the `nethera` Postgres service continues to start on port 5432 with the same credentials and volume
