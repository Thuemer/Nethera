Good picture now. Let me sketch the proposal.

---

## What we know

```
Nethera/
├── Backend/Nethera/
│   ├── docker-compose.yml     ← starts postgres:15 on :5432, db "nethera"
│   ├── src/                   ← Quarkus app
│   └── pom.xml                ← quarkus-rest, quarkus-hibernate-orm, quarkus-jdbc-postgresql
└── Website/
    └── html/css/js            ← plain frontend, no build tooling
```

The backend is **Quarkus** (not Spring), which has first-class Keycloak/OIDC support via `quarkus-oidc`.

---

## Proposed: `docker-compose.keycloak.yml`

Place it alongside the existing compose file at `Backend/Nethera/`:

```yaml
version: '3.8'

services:
  keycloak-postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: keycloak
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: keycloak
    volumes:
      - keycloak-pgdata:/var/lib/postgresql/data

  keycloak:
    image: quay.io/keycloak/keycloak:26.2
    command: start-dev
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://keycloak-postgres:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: keycloak
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
    ports:
      - "8180:8080"
    depends_on:
      - keycloak-postgres

volumes:
  keycloak-pgdata:
```

Started with:
```bash
docker compose -f docker-compose.keycloak.yml up -d
```

---

## Key decisions in this proposal

| Decision         | Choice                               | Reasoning                                              |
| ---------------- | ------------------------------------ | ------------------------------------------------------ |
| Port             | `8180` (host) → `8080` (container)   | Quarkus default is also `:8080` — avoids collision     |
| Keycloak mode    | `start-dev`                          | No TLS required for dev; admin console enabled         |
| DB isolation     | Separate service `keycloak-postgres` | Keeps Keycloak data fully independent from app data    |
| DB port          | Not exposed externally               | Keycloak reaches it by service name; no need to expose |
| Keycloak version | `26.2` (latest stable)               | Current latest as of May 2026                          |

---

## One thing to decide

Should `keycloak-postgres` be on the **same Docker network** as the app's `postgres`?

```
Option A — Completely separate (default)
────────────────────────────────────────
  [docker-compose.yml]          [docker-compose.keycloak.yml]
  nethera-postgres :5432        keycloak-postgres (internal only)
       ↑                              ↑
  Quarkus app                    Keycloak :8180
  
  → Cleanest isolation. Backend talks to Keycloak via localhost:8180.

Option B — Shared network
─────────────────────────
  Both compose files join a named network "nethera-net"
  → Needed only if Quarkus validates tokens server-side 
    using the container hostname (e.g., in a containerized Quarkus)
```

For now, since Quarkus likely runs **outside Docker** (dev mode), Option A is fine. If you ever containerize Quarkus, you'd want Option B.

---

Want to go ahead and create this file, or do you want to adjust anything first — port, Keycloak version, credentials, placement?