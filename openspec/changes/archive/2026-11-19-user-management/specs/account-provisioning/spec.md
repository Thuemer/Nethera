## ADDED Requirements

### Requirement: Account auto-provisioned on first authenticated request
When an authenticated user calls `GET /api/accounts/me` for the first time, the system SHALL create a local `Account` row using the `sub` and `email` claims from the Bearer JWT. On subsequent calls, the existing row SHALL be returned without modification.

#### Scenario: First login creates account
- **WHEN** an authenticated user calls `GET /api/accounts/me` and no `Account` row exists for their Keycloak `sub`
- **THEN** the system creates an `Account` with `keycloak_sub` = JWT `sub` and `email` = JWT `email` claim, and returns it with HTTP 200

#### Scenario: Repeat login returns existing account
- **WHEN** an authenticated user calls `GET /api/accounts/me` and an `Account` row already exists for their `sub`
- **THEN** the system returns the existing `Account` with HTTP 200 without inserting a new row

#### Scenario: Unauthenticated request rejected
- **WHEN** a request to `GET /api/accounts/me` is made without a valid Bearer token
- **THEN** the system returns HTTP 401

### Requirement: Account entity contains only identity-link data
The `Account` entity SHALL contain exactly three fields: an internal primary key (`id`), the Keycloak subject identifier (`keycloak_sub`, unique, not null), and the user's email address (`email`, not null). No password, role, or preference data SHALL be stored in `Account`.

#### Scenario: Account fields match JWT claims
- **WHEN** an `Account` is provisioned for a user
- **THEN** `keycloak_sub` equals the JWT `sub` claim and `email` equals the JWT `email` claim

#### Scenario: keycloak_sub is unique per account
- **WHEN** two provisioning requests arrive with the same JWT `sub`
- **THEN** only one `Account` row exists after both requests complete

### Requirement: Self-service user registration via Keycloak
The system SHALL support self-service user registration without a backend registration endpoint. Users SHALL register through Keycloak's built-in User Registration flow. The backend SHALL NOT expose a `POST /api/accounts` endpoint for account creation.

#### Scenario: User registers via Keycloak
- **WHEN** a new user completes the Keycloak registration form and receives a JWT
- **THEN** calling `GET /api/accounts/me` with that JWT provisions a backend `Account` automatically

#### Scenario: No registration endpoint exists
- **WHEN** a client sends `POST /api/accounts` with any payload
- **THEN** the system returns HTTP 404 or 405
