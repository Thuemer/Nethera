## Context

Nethera is a Quarkus REST backend. Keycloak authentication is already wired up via `quarkus-oidc` in `service` mode — all endpoints require a valid Bearer JWT from the `nethera` Keycloak realm. The `Account` entity currently carries `password_hash`, `name`, `rolle`, `security`, `traffic`, and `weekly` columns that predate the Keycloak integration and are now orphaned. There is no link between a Keycloak identity and a local `Account` row. The `/api/accounts/me` endpoint returns a hardcoded first row rather than the authenticated user.

## Goals / Non-Goals

**Goals:**
- Slim `Account` to the minimal backend-owned data: internal PK, Keycloak `sub`, and email
- Link the authenticated JWT identity to a local `Account` row via the `sub` claim
- Auto-provision an `Account` row on the user's first authenticated request (no explicit registration endpoint)
- Enable self-service registration via Keycloak's built-in User Registration feature

**Non-Goals:**
- RBAC / role-based authorization (roles live in Keycloak; enforcement can be added later with `@RolesAllowed`)
- Admin user management API (create/delete users on behalf of others)
- Profile data beyond sub and email
- Production Keycloak hardening (TLS, email verification flow, etc.)

## Decisions

### 1. Store only `keycloak_sub` and `email` — no local profile data

**Decision**: `Account` holds `id` (internal PK), `keycloak_sub` (unique, not null), and `email` (not null). No other columns.

**Rationale**: Keycloak is the single source of truth. Storing anything else (name, roles, preferences) creates a synchronization problem — those values can change in Keycloak without the backend knowing. The `sub` claim is the stable, immutable identifier for a Keycloak user; `email` is included because it is the human-readable identity used throughout the application.

**Alternative considered**: Mirror more fields (first name, last name, roles). Rejected — creates stale-data risk and contradicts the stated design principle.

---

### 2. Auto-provision `Account` on first authenticated request

**Decision**: `GET /api/accounts/me` checks for an existing row by `keycloak_sub`. If none exists, it inserts one using `sub` and `email` from the JWT, then returns it.

**Rationale**: No separate registration endpoint is needed on the backend. The Keycloak registration flow already handles credential creation; the backend just needs to record that this identity has been seen. The `/me` endpoint is the natural trigger — it is the first call any client makes after login.

**Alternative considered**: A dedicated `POST /api/accounts` provisioning endpoint. Rejected — introduces an extra round-trip and a race condition if the client calls `/me` before `/register`.

---

### 3. Keycloak User Registration enabled in realm settings

**Decision**: Enable "User Registration" in the `nethera` realm (Realm Settings → Login → User Registration ON). No backend endpoint is added for registration.

**Rationale**: Consistent with Keycloak as source of truth. Keycloak handles the registration form, email/password validation, and optional email verification. The backend is not in the credential-management business.

**Alternative considered**: Backend-proxied registration via Keycloak Admin REST API. Rejected — requires a privileged service account, adds API surface, and duplicates functionality Keycloak already provides natively.

---

### 4. `SecurityIdentity` as the source for JWT claims

**Decision**: Inject `io.quarkus.security.identity.SecurityIdentity` in `AccountsResource`. Extract `sub` from `identity.getPrincipal().getName()` and `email` from `identity.getAttribute("email")`.

**Rationale**: Quarkus OIDC in `service` mode populates `SecurityIdentity` from the validated JWT automatically. This is the idiomatic, type-safe way to read claims without parsing the raw token. No additional dependencies are needed.

## Risks / Trade-offs

- **Email claim may be absent** → Keycloak includes `email` in the token by default, but only if the user has set one and the client has the `email` scope. Mitigation: ensure the `nethera-frontend` client has the `email` scope mapped; handle null email gracefully in the provisioning logic.

- **`sub` changes on user deletion + re-creation** → If an admin deletes and recreates a Keycloak user, a new `sub` is issued, leaving an orphaned `Account` row. Acceptable for the current scope; cleanup can be handled manually or via a future admin API.

- **`drop-and-create` schema** → The dev schema is regenerated on each restart, so column removal is automatic. This is fine for development but must be replaced with a proper migration (Flyway/Liquibase) before any persistent environment is set up.

## Open Questions

- Should `email` updates in Keycloak be reflected in the local `Account` row? The `/me` endpoint could upsert `email` on each call, or leave it as set at provisioning time. An upsert is safer but adds a write on every authenticated request.
