// Kleine API-Hilfsfunktionen für alle Seiten
const NetheraApi = (() => {
  const config = window.NETHERA_CONFIG || { API_BASE_URL: 'http://localhost:8080', ROUTERS_PATH: '/api/routers/list' };
  let currentRouter = null;
  let primaryRequest = null;
  let sourceWatcher = null;

  function demoRouter(router = {}) {
    const timestamp = new Date().toISOString();
    return {
      id: router.id ?? null, name: 'Demo-Netzwerk', model: 'Beispielrouter', firmware: null,
      ipAddress: '192.0.2.1', isOnline: false, connection: 'offline', dataMode: 'demo',
      checkedAt: router.checkedAt ?? null, lastSeen: null,
      devices: [
        { id: -1, hostname: 'Demo-Laptop', macAddress: '02:00:00:00:00:01', ipAddress: '192.0.2.10', connectionType: 'wifi', lastSeen: timestamp },
        { id: -2, hostname: 'Demo-Smartphone', macAddress: '02:00:00:00:00:02', ipAddress: '192.0.2.11', connectionType: 'wifi', lastSeen: timestamp },
        { id: -3, hostname: 'Demo-TV', macAddress: '02:00:00:00:00:03', ipAddress: '192.0.2.12', connectionType: 'lan', lastSeen: timestamp }
      ],
      speedStats: [18, 23, 20, 28, 25].map((downloadSpeed, i) => ({ timestamp: new Date(Date.now() - (4 - i) * 60000).toISOString(), downloadSpeed, uploadSpeed: 3 + i })),
      dnsStats: [{ timestamp, totalQueries: 1200, blockedQueries: 85, trackersDetected: 12 }],
      activityLogs: [{ timestamp, eventType: 'CONNECTED', details: 'Demo-Laptop verbunden' }],
      wifiNetworks: [{ ssid: 'Demo-WLAN', bssid: '02:00:00:00:01:01', type: 'router', signal: -48, channel: 6, frequency: '2.4 GHz', encryption: 'WPA3', known: true }]
    };
  }

  function selectDataSource(router) {
    if (router.dataMode === 'demo' && router.connection === 'offline') return demoRouter(router);
    if (router.dataMode === 'live' && router.connection === 'online') {
      return { ...router, isOnline: true,
        devices: Array.isArray(router.devices) ? router.devices : [],
        speedStats: Array.isArray(router.speedStats) ? router.speedStats : [],
        dnsStats: Array.isArray(router.dnsStats) ? router.dnsStats : [],
        activityLogs: Array.isArray(router.activityLogs) ? router.activityLogs : [],
        wifiNetworks: Array.isArray(router.wifiNetworks) ? router.wifiNetworks : [] };
    }
    // Legacy/malformed API responses cannot certify the origin of their rows.
    return { id: router.id, name: router.name || 'Nethera Router', dataMode: 'unavailable',
      connection: 'unknown', isOnline: null, lastSeen: null, devices: [], speedStats: [], dnsStats: [], activityLogs: [], wifiNetworks: [] };
  }

  function showDataSource(router) {
    if (typeof document === 'undefined') return;
    let notice = document.getElementById('dataSourceNotice');
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'dataSourceNotice';
      notice.className = 'data-source-notice';
      notice.setAttribute('role', 'status');
      (document.querySelector('main') || document.body).prepend(notice);
    }
    notice.dataset.mode = router?.dataMode || 'unavailable';
    notice.textContent = router?.dataMode === 'live' ? 'Routerdaten · Verbunden'
      : router?.dataMode === 'demo' ? 'Demo · Kein Router verbunden. Beispieldaten, nur Ansicht.'
        : 'Routerstatus unbekannt · Keine bestätigten Routerdaten verfügbar.';
  }

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

    return data.map(selectDataSource);
  }

  async function getPrimaryRouter() {
    if (primaryRequest) return primaryRequest;
    primaryRequest = (async () => {
      try {
        const routers = await getRouters();
        currentRouter = routers.find(router => router.dataMode === 'live')
          || routers.find(router => router.connection === 'unknown')
          || routers[0] || demoRouter();
        showDataSource(currentRouter);
        return currentRouter;
      } catch (error) {
        currentRouter = null;
        showDataSource(null);
        throw error;
      } finally { primaryRequest = null; }
    })();
    return primaryRequest;
  }

  function isLive() { return currentRouter?.dataMode === 'live'; }

  async function requireLive() {
    const router = await getPrimaryRouter();
    if (router.dataMode !== 'live') throw new Error('Änderungen sind nur mit bestätigter Routerverbindung möglich.');
    return router;
  }

  async function readJson(path) {
    const response = await fetch(`${config.API_BASE_URL}${path}`, {
      headers: { Accept: 'application/json', ...await getAuthHeader() }, cache: 'no-store'
    });
    if (!response.ok) throw new Error(`Backend antwortet mit ${response.status}`);
    return response.json();
  }

  async function getSecurityState(router) {
    router ||= await getPrimaryRouter();
    if (router.dataMode !== 'live') return { devices: router.devices, groups: [], members: [], blocklists: [], presets: [], assignments: [], timeLimits: [], dataMode: router.dataMode };
    const data = await readJson('/api/security/state');
    const ids = new Set(router.devices.map(device => Number(device.id)));
    // Keep saved configuration, but never reintroduce seeded devices through another endpoint.
    return { ...data, dataMode: 'live', devices: router.devices,
      members: (data.members || []).filter(item => ids.has(Number(item.deviceId))),
      assignments: (data.assignments || []).filter(item => ids.has(Number(item.deviceId))),
      timeLimits: (data.timeLimits || []).filter(item => ids.has(Number(item.deviceId))) };
  }

  async function getConnections(router) {
    router ||= await getPrimaryRouter();
    if (router.dataMode === 'demo') return router.devices.map((device, i) => ({ client: device.hostname, ip: device.ipAddress, protocol: 'HTTPS', download: 4 + i, upload: 1 }));
    if (router.dataMode !== 'live') return [];
    const rows = await readJson('/api/connections/list');
    // The existing endpoint has no router/source metadata yet, so its old rows stay hidden.
    return Array.isArray(rows) ? rows.filter(row => row.dataSource === 'ROUTER' && String(row.routerId) === String(router.id)) : [];
  }

  function watchSource(reload) {
    if (sourceWatcher) clearInterval(sourceWatcher);
    let previous = currentRouter ? `${currentRouter.id}:${currentRouter.dataMode}` : null;
    sourceWatcher = setInterval(async () => {
      let next;
      try { const router = await getPrimaryRouter(); next = `${router.id}:${router.dataMode}`; }
      catch { next = 'unavailable'; }
      if (next !== previous) { previous = next; await reload(); }
    }, 15000);
    window.addEventListener('pagehide', () => clearInterval(sourceWatcher), { once: true });
  }

  async function getRouterControlStatus() {
    if (currentRouter && currentRouter.dataMode !== 'live') return { connection: currentRouter.connection };
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
    await requireLive();
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

  return { getRouters, getPrimaryRouter, getRouterControlStatus, installAdblock, getAuthHeader, routerUrl, userMessage,
    getSecurityState, getConnections, selectDataSource, isLive, requireLive, watchSource };
})();
