## Context

The existing `Backend/Nethera/docker-compose.yml` starts a single PostgreSQL 15 instance for the Nethera application on host port 5432. There is no identity provider in the stack. Keycloak requires a relational database backend; using a dedicated instance avoids coupling Keycloak's schema to the application database.

## Goals / Non-Goals

**Goals:**
- Add Keycloak 26.2 as an identity provider to the local dev stack
- Give Keycloak its own isolated PostgreSQL 15 database
- Keep the existing `postgres` service unchanged

**Non-Goals:**
- Quarkus `quarkus-oidc` configuration
- Keycloak realm / client / user setup
- Production-grade TLS or hardened credentials
- Containerizing the Quarkus application

## Decisions

**Single docker-compose.yml** — Extend the existing file rather than a separate `docker-compose.keycloak.yml`.
- Rationale: simpler dev workflow (`docker compose up` starts everything); the file is already the single source of truth for the local stack.

**Dedicated `keycloak-postgres` service** — Not sharing the `nethera` database.
- Rationale: Keycloak manages its own schema migrations. Mixing databases risks version conflicts and makes cleanup harder.
- Alternative considered: single Postgres with multiple databases — rejected because it complicates credential management and database lifecycle.

**`start-dev` mode** — Keycloak development mode.
- Rationale: enables admin console, disables strict TLS checks, acceptable for local development.
- Alternative: `start` (production mode) — rejected for dev; requires valid certificates.

**Port 8180 for Keycloak** — Quarkus default is 8080; mapping Keycloak to 8180 avoids collision.

**Port 5433 for `keycloak-postgres`** — Exposed for local DB inspection tools; container port remains 5432 so Keycloak's JDBC URL is standard.

## Risks / Trade-offs

- `start-dev` must not be used in production → Mitigation: document clearly; switch to `start` with proper config for any deployed environment.
- Default credentials (`admin`/`admin`) are weak → Mitigation: acceptable for local dev only; environment variables make them easy to override.

## Migration Plan

1. Stop any running compose stack: `docker compose down`
2. Apply the updated `docker-compose.yml`
3. Start: `docker compose up -d`
4. Verify Keycloak admin console at `http://localhost:8180`

Rollback: revert `docker-compose.yml` and run `docker compose down -v` if volume cleanup is needed.
