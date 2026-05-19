## ADDED Requirements

### Requirement: nethera realm exists in Keycloak
Keycloak SHALL contain a realm named `nethera` that is the identity provider for the Nethera application.

#### Scenario: Realm is reachable
- **WHEN** a GET request is made to `http://localhost:8180/realms/nethera/.well-known/openid-configuration`
- **THEN** the response is HTTP 200 with a valid OIDC discovery document

### Requirement: nethera-frontend public client for dev token retrieval
The `nethera` realm SHALL contain a public OAuth2 client named `nethera-frontend` with the Direct Access Grants flow enabled, so developers can obtain tokens via username and password without a client secret.

#### Scenario: Developer obtains a token via curl
- **WHEN** a POST is made to `http://localhost:8180/realms/nethera/protocol/openid-connect/token` with `client_id=nethera-frontend`, `grant_type=password`, and valid dev user credentials
- **THEN** the response contains an `access_token` JWT

#### Scenario: Token from nethera-frontend is accepted by the backend
- **WHEN** the `access_token` obtained from the above scenario is used as a Bearer token against a Nethera API endpoint
- **THEN** the backend returns HTTP 200

### Requirement: Dev user exists in the nethera realm
The `nethera` realm SHALL contain at least one user with username `dev` and password `dev` that can be used for local development and testing.

#### Scenario: Dev user can log in
- **WHEN** a token is requested with credentials `dev` / `dev` against the `nethera-frontend` client
- **THEN** a valid access token is returned

### Requirement: Realm configuration is exportable as JSON
The `nethera` realm configuration SHALL be exportable as a JSON file and committed to the repository so any developer can recreate the realm deterministically.

#### Scenario: Realm export file present in repository
- **WHEN** a developer checks out the repository
- **THEN** a realm export JSON file exists and can be imported into a fresh Keycloak instance to recreate the `nethera` realm

#### Scenario: Import from export recreates the realm
- **WHEN** the realm export JSON is imported into a fresh Keycloak instance
- **THEN** the `nethera` realm, `nethera-frontend` client, and `dev` user are all present and functional
