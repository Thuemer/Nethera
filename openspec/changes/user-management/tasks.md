## 1. Slim Down the Account Entity

- [x] 1.1 Remove fields `name`, `passwordHash`, `rolle`, `security`, `traffic`, `weekly` from `Account.java`
- [x] 1.2 Add field `keycloakSub` (mapped to column `keycloak_sub`, unique, not null) to `Account.java`
- [x] 1.3 Ensure `email` column is annotated `nullable = false`
- [x] 1.4 Remove any account seed rows from `import.sql`

## 2. Update AccountsRepository

- [x] 2.1 Replace `getAllAccounts` and `getFirstAccount` with a `findBySub(String sub)` method returning `Optional<Account>`
- [x] 2.2 Add a `provision(String sub, String email)` method that persists a new `Account` and returns it (use `@Transactional`)
- [x] 2.3 Add a named query `Account.findBySub` to `Account.java` used by `findBySub`

## 3. Rewrite AccountsResource

- [x] 3.1 Inject `SecurityIdentity` into `AccountsResource`
- [x] 3.2 Rewrite `GET /api/accounts/me`: extract `sub` from `identity.getPrincipal().getName()` and `email` from `identity.getAttribute("email")`, call `findBySub`, provision if absent, return the account
- [x] 3.3 Remove the `GET /api/accounts/list` endpoint
- [x] 3.4 Add `@Authenticated` to `AccountsResource` class (if not already present)

## 4. Enable Keycloak User Registration

- [ ] 4.1 In the Keycloak admin console (`http://localhost:8180`), go to `nethera` realm → Realm Settings → Login tab → enable "User Registration"
- [ ] 4.2 Re-export the updated `nethera` realm JSON and overwrite `keycloak/nethera-realm-export.json` in the repository
- [ ] 4.3 Verify the registration link appears on the Keycloak login page

## 5. Verification

- [ ] 5.1 Start the stack and confirm `GET /api/accounts/me` without a token returns HTTP 401
- [ ] 5.2 Obtain a token for the existing `dev` user and confirm `GET /api/accounts/me` returns an `Account` with the correct `keycloakSub` and `email`
- [ ] 5.3 Call `GET /api/accounts/me` a second time and confirm no duplicate row is inserted (check DB or log)
- [ ] 5.4 Register a new user via the Keycloak registration page, obtain a token, call `/me`, and confirm a new `Account` row is provisioned
