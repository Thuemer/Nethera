// Kleine API-Hilfsfunktionen für alle Seiten
const NetheraApi = (() => {
  const config = window.NETHERA_CONFIG || { API_BASE_URL: 'http://localhost:8080', ROUTERS_PATH: '/api/routers/list' };

  function routerUrl() {
    return `${config.API_BASE_URL}${config.ROUTERS_PATH}`;
  }

  async function getRouters() {
    const response = await fetch(routerUrl(), {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Backend antwortet mit ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('Antwort ist keine Router-Liste');
    }

    return data;
  }

  async function getPrimaryRouter() {
    const routers = await getRouters();
    if (!routers.length) {
      throw new Error('Keine Routerdaten gefunden');
    }
    return routers[0];
  }

  return { getRouters, getPrimaryRouter, routerUrl };
})();
