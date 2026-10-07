// Lokal nutzt Compose eigene Ports; hinter einem Proxy teilen sich die Dienste eine Adresse.
const netheraLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
window.NETHERA_CONFIG = {
  API_BASE_URL: netheraLocal ? 'http://localhost:8080' : window.location.origin,
  ROUTERS_PATH: '/api/routers/list',
  ROUTER_IP: '192.168.1.1',
  KEYCLOAK_URL: netheraLocal ? 'http://localhost:8081' : window.location.origin,
  KEYCLOAK_REALM: 'Nethera',
  KEYCLOAK_CLIENT_ID: 'Nethera-frontend'
};
