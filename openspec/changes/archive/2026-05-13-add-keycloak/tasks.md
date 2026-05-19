## 1. Update docker-compose.yml

- [x] 1.1 Add `keycloak-postgres` service (postgres:15, db/user/password: keycloak, port 5433:5432, volume keycloak-pgdata)
- [x] 1.2 Add `keycloak` service (keycloak:26.2, start-dev, port 8180:8080, KC_DB env vars, depends_on keycloak-postgres)
- [x] 1.3 Declare `keycloak-pgdata` named volume alongside existing `pgdata`

## 2. Verify

- [x] 2.1 Run `docker compose up -d` and confirm all three services start without errors
- [x] 2.2 Confirm Keycloak admin console is reachable at http://localhost:8180 and login works with admin/admin
- [x] 2.3 Confirm existing `nethera` Postgres is still reachable on port 5432
