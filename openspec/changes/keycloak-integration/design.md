## Context

Nethera is a Quarkus REST backend exposing router telemetry (connected devices, speed stats, DNS stats, activity logs). All endpoints are currently unauthenticated. Keycloak 26.2 is already running via docker-compose on host port 8180, backed by its own PostgreSQL instance. The Quarkus application has no security extension installed yet.

## Goals / Non-Goals

**Goals:**
- Install and configure `quarkus-oidc` so Quarkus validates Bearer JWT tokens from Keycloak
- Secure all existing REST endpoints so they return HTTP 401 without a valid token
- Set up a `nethera` Keycloak realm with a backend client and a dev user
- Keep the dev workflow usable — document how to obtain a token locally

**Non-Goals:**
- User-to-router ownership or per-resource authorization (RBAC comes later)
- Production Keycloak hardening (TLS, external IdP federation, etc.)
- Frontend OIDC login flow (backend only validates tokens)
- Migrating existing tests to use test-security mocks (tests can be updated separately)

## Decisions

### 1. Use `quarkus-oidc` extension in `service` mode

**Decision**: Add `io.quarkus:quarkus-oidc` and set `quarkus.oidc.application-type=service`.

**Rationale**: `service` mode is the correct Quarkus OIDC type for a REST API that only validates incoming Bearer tokens — it does not redirect to Keycloak, does not manage a session, and does not participate in the authorization code flow. This is the idiomatic approach and handles JWKS fetching, token signature validation, and clock skew automatically.

**Alternative considered**: Manual JWT validation with `smallrye-jwt`. Rejected because it requires wiring JWKS endpoint lookups manually and doesn't integrate with Quarkus security context as cleanly.

---

### 2. Blanket `@Authenticated` on all endpoints via class-level annotation

**Decision**: Annotate each resource class with `@Authenticated` (Jakarta Security / Quarkus Security) rather than per-method annotations.

**Rationale**: All endpoints carry the same sensitivity level for now. Class-level annotation is less error-prone than per-method — a new method is secure by default. Granular RBAC (`@RolesAllowed`) can be layered on top later without changing this decision.

**Alternative considered**: Global default-deny via `quarkus.security.auth.enabled-in-dev-mode`. Rejected because class-level annotation is more explicit and survives config changes.

---

### 3. Keycloak `nethera` realm with a `public` frontend client (for token retrieval)

**Decision**: Create a `nethera` realm. For the Quarkus backend, configure the OIDC issuer URL (`quarkus.oidc.auth-server-url`). For dev-time token retrieval, create a `nethera-frontend` public client so developers can use the direct grant (`/token` with username+password) without a client secret.

**Rationale**: The backend needs only the issuer URL and JWKS to validate tokens — it does not need a client secret in `service` mode. A public client on the Keycloak side makes it easy to obtain test tokens via a `curl` command without embedding secrets in developer docs.

**Alternative considered**: Confidential client with client secret for the backend. Unnecessary overhead for a `service`-mode OIDC setup; the backend never calls Keycloak to exchange codes.

---

### 4. Realm JSON export stored in the repo

**Decision**: Export the `nethera` realm configuration as `realm-export.json` and commit it to the repository (e.g., under `db/` or `keycloak/`).

**Rationale**: Keycloak's in-memory realm state is lost on container recreation. A committed export lets any developer recreate the realm deterministically with `--import-realm` or via the admin UI. This is the standard Keycloak reproducibility pattern.

## Risks / Trade-offs

- **Keycloak must be reachable at startup** → Quarkus OIDC fetches the OIDC discovery document on boot. If Keycloak is down, the app fails to start. Mitigation: ensure `docker compose up` includes Keycloak before starting Quarkus, or add `quarkus.oidc.discovery-enabled=false` with explicit JWKS URI as a fallback during dev.

- **Dev token expiry** → Default Keycloak access tokens expire in 5 minutes. Developers running long manual tests will need to refresh. Mitigation: document the `curl` refresh command; optionally extend the realm's access token lifespan to 60 minutes for dev.

- **Existing tests will break** → `ExampleResourceTest` and `ExampleResourceIT` currently hit endpoints without tokens. After adding `@Authenticated`, these tests will return 401. Mitigation: add `quarkus-test-security` dependency and annotate tests with `@TestSecurity(authorizationEnabled = false)` or provide a mock identity — but this is out of scope for this change; tests can be fixed in a follow-up.

- **CORS not addressed** → If a browser-based frontend later calls the API with an Authorization header, CORS preflight will need the header to be allowed. Out of scope here; noted for future.

## Open Questions

- Should the realm export be auto-imported via Keycloak's `--import-realm` flag in docker-compose, or left as a manual import step? Auto-import is smoother but requires the file to be mounted into the container.
- What should the dev user's credentials be? (`dev` / `dev` is a reasonable default for a school project.)
