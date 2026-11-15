// Kleine API-Hilfsfunktionen für alle Seiten
const NetheraApi = (() => {
  const config = window.NETHERA_CONFIG || { API_BASE_URL: 'http://localhost:8080', ROUTERS_PATH: '/api/routers/list' };

  function routerUrl() {
    return `${config.API_BASE_URL}${config.ROUTERS_PATH}`;
  }

  async function getAuthHeader() {
    const account = window.parent?.NetheraAccount ?? window.NetheraAccount;
    return (await account?.getAuthHeader?.()) ?? {};
  }

  async function getRouters() {
    const authHeader = await getAuthHeader();
    const response = await fetch(routerUrl(), {
      headers: { Accept: 'application/json', ...authHeader },
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

  async function getRouterControlStatus() {
    const response = await fetch(`${config.API_BASE_URL}/api/router-control/status`, {
      headers: { Accept: 'application/json', ...await getAuthHeader() },
      cache: 'no-store'
    });
    if (response.status === 404 || response.status === 501) return null;
    if (!response.ok) throw new Error(`Routerstatus antwortet mit ${response.status}`);
    const status = await response.json();
    if (!status || typeof status !== 'object' || Array.isArray(status)) {
      throw new Error('Routerstatus ist ungültig');
    }
    return status;
  }

  async function installAdblock() {
    const response = await fetch(`${config.API_BASE_URL}/api/router-control/adblock/install`, {
      method: 'POST',
      headers: { Accept: 'application/json', ...await getAuthHeader() }
    });
    if (!response.ok) throw new Error(`Adblock-Installation antwortet mit ${response.status}`);
    return response.json();
  }

  function userMessage(error) {
    const message = String(error?.message || '');
    if (/\b(401|403)\b/.test(message)) return 'Bitte melde dich erneut an, um diese Daten zu sehen.';
    if (message === 'Keine Routerdaten gefunden') return 'Noch kein Router verbunden.';
    return 'Daten konnten nicht geladen werden. Bitte versuche es erneut.';
  }

  return { getRouters, getPrimaryRouter, getRouterControlStatus, installAdblock, getAuthHeader, routerUrl, userMessage };
})();
