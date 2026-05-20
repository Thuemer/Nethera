## Why

Authentication is handled by Keycloak, but the backend has no way to identify which local account belongs to a given JWT. The `Account` entity carries dead weight (password hash, name, role, notification flags) that duplicates data Keycloak already owns. This change strips the entity to the minimum the backend actually needs — a stable link between a Keycloak subject ID and the rest of the application — and enables self-service user registration via Keycloak's built-in registration flow.

## What Changes

- **BREAKING** — `Account` entity reduced to `id`, `keycloak_sub` (unique), `email`; columns `password_hash`, `name`, `rolle`, `security`, `traffic`, `weekly` are dropped
- `GET /api/accounts/me` rewritten to extract `sub` + `email` from the Bearer JWT and auto-provision an `Account` row on first call
- `GET /api/accounts/list` removed (no longer meaningful without extra profile data)
- Keycloak `nethera` realm: "User Registration" enabled so users can self-register without backend involvement
- `AccountsRepository` updated: find-by-keycloak-sub, upsert on first login

## Capabilities

### New Capabilities

- `account-provisioning`: On the first authenticated request, the backend auto-creates a local `Account` row from the JWT claims (`sub`, `email`). Subsequent calls return the existing row. No explicit registration endpoint is needed.

### Modified Capabilities

<!-- none — keycloak-infrastructure requirements are unchanged -->

## Impact

- **`Account.java`**: entity fields reduced to `id`, `keycloak_sub`, `email`
- **`AccountsRepository.java`**: replace `getFirstAccount` / `getAllAccounts` with `findBySub` and `provision`
- **`AccountsResource.java`**: rewrite `/me` to use `SecurityIdentity`; remove `/list`
- **`import.sql`**: remove any account seed data
- **Keycloak**: enable User Registration on the `nethera` realm
- **Schema**: `drop-and-create` handles the column removal automatically in dev
