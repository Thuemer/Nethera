# Nethera Keycloak Integration

## Ziel
Die originale Nethera-App-Shell bleibt erhalten. Der Account-Bereich wird wie ein normaler Tab in der linken Navigation geöffnet. Keycloak wird nicht in einem iframe geladen, sondern nur beim Klick auf „Mit Nethera anmelden“ als Top-Level-Redirect geöffnet.

## Frontend-Verhalten
- `index.html` bleibt die zentrale App mit linker Navigation.
- Dashboard, Clients, Topologie, Datenverkehr und Konfiguration laufen wie bisher im iframe.
- Account wird bewusst **nicht** als iframe geladen, weil Keycloak-Loginseiten aus Sicherheitsgründen nicht in Frames geladen werden dürfen.
- Beim Klick auf Account wird der Account-Screen direkt im rechten App-Bereich gerendert.
- Es gibt keinen automatischen Login beim Öffnen des Account-Tabs.
- Login passiert erst über den Button `Mit Nethera anmelden`.
- Nach Login/Logout landet man wieder auf `index.html?screen=account`.

## Keycloak-Konfiguration
Realm:
```text
Nethera
```

Client:
```text
Nethera-frontend
```

Client-Einstellungen:
```text
Client authentication: OFF
Standard flow: ON
Implicit flow: OFF
Direct access grants: optional ON
```

Valid Redirect URIs:
```text
http://localhost:5500/*
http://127.0.0.1:5500/*
```

Web Origins:
```text
http://localhost:5500
http://127.0.0.1:5500
```

## Backend-Team
Wenn `API_ENABLED` in `Applikation/config.js` auf `true` gesetzt wird, sendet das Frontend bei Account-Requests:

```http
Authorization: Bearer <JWT>
```

Geplante Endpoints:
```text
GET /api/accounts/me
GET /api/accounts/list
```

Bis das Backend CORS/JWT/Endpoints vollständig unterstützt, bleibt `API_ENABLED: false`, damit lokal keine roten CORS-Fehler entstehen.
