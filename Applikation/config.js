// Zentrale Nethera-Konfiguration
// API_ENABLED bleibt in der lokalen Demo bewusst false, damit ohne Backend keine CORS-Fehler entstehen.
// Wenn das Quarkus-Backend sauber mit CORS/JWT läuft, auf true setzen.
window.NETHERA_CONFIG = {
  API_ENABLED: false,
  API_BASE_URL: 'http://localhost:8080',
  ROUTERS_PATH: '/api/routers/list',
  KEYCLOAK_URL: 'http://localhost:8081',
  KEYCLOAK_REALM: 'Nethera',
  KEYCLOAK_CLIENT_ID: 'Nethera-frontend'
};
