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

- [ ] 4.1 Set `"registrationAllowed": true` in `Applikation/realm-export.json` (the file `compose.yaml` imports into realm `Nethera`). Edit the JSON directly; don't re-export from the admin console, because a partial export omits users and would drop the `demo` user
- [ ] 4.2 Apply it to a running Keycloak: `--import-realm` skips realms that already exist, so either enable it by hand in the admin console (`http://localhost:8081`, `admin` / `admin` → realm `Nethera` → Realm settings → Login → User registration) or recreate Keycloak's database (`docker compose rm -sf keycloak keycloak-postgres && docker volume rm nethera_keycloak-pgdata && docker compose up -d`; this deletes all Keycloak users except the imported `demo`)
- [ ] 4.3 Verify the "Register" link appears on the Keycloak login page (frontend `http://localhost:5500` → Account → "Mit Nethera anmelden")

## 5. Verification

- [ ] 5.1 Start the stack (`docker compose up -d --build`) and confirm `GET http://localhost:8080/api/accounts/me` without a token returns HTTP 401
- [ ] 5.2 Obtain a token for the `demo` user (`demo` / `nethera-demo`, password grant on client `Nethera-frontend`, command in `Backend/Nethera/README.md`) and confirm `GET /api/accounts/me` returns an `Account` whose `keycloakSub` equals the token's `sub` and whose `email` is `demo@nethera.local`
- [ ] 5.3 Call `GET /api/accounts/me` a second time and confirm no duplicate row is inserted (`docker compose exec postgres psql -U nethera -d nethera -c "select keycloak_sub, count(*) from account group by keycloak_sub"`)
- [ ] 5.4 Register a new user via the Keycloak registration page, obtain a token, call `/me`, and confirm a new `account` row is provisioned
