// Kleine API-Hilfsfunktionen für alle Seiten
const NetheraApi = (() => {
  const config = window.NETHERA_CONFIG || { API_BASE_URL: 'http://localhost:8080', ROUTERS_PATH: '/api/routers/list' };
  let currentRouter = null;
  let primaryRequest = null;
  let sourceWatcher = null;

  function demoRouter(router = {}) {
    const now = Date.now();
    const timestamp = new Date(now).toISOString();
    return {
      id: router.id ?? null, name: 'Demo-Netzwerk', model: 'Beispielrouter', firmware: 'Demo',
      ipAddress: '192.0.2.1', isOnline: false, connection: 'offline', dataMode: 'demo',
      checkedAt: router.checkedAt ?? null, lastSeen: null,
      devices: [
        ['Laptop', 'wifi'], ['Smartphone', 'wifi'], ['TV', 'lan'], ['Tablet', 'wifi'],
        ['Gaming-PC', 'lan'], ['Lautsprecher', 'wifi'], ['Drucker', 'wifi'], ['NAS', 'lan']
      ].map(([name, connectionType], i) => ({ id: -(i + 1), hostname: `Demo-${name}`,
        macAddress: `02:00:00:00:00:0${i + 1}`, ipAddress: `192.0.2.${10 + i}`, connectionType, lastSeen: timestamp })),
      speedStats: [18, 23, 20, 28, 25, 32, 29, 37, 35, 40, 43].map((downloadSpeed, i) => ({
        timestamp: new Date(now - (10 - i) * 60000).toISOString(), downloadSpeed, uploadSpeed: [3, 4, 3, 5, 4, 6, 5, 7, 6, 7, 8][i] })),
      dnsStats: [{ timestamp, totalQueries: 17910, blockedQueries: 1627, trackersDetected: 567 }],
      activityLogs: ['Demo-Laptop', 'Demo-Gaming-PC', 'Demo-Tablet', 'Demo-NAS'].map((name, i) => ({
        timestamp: new Date(now - i * 180000).toISOString(), eventType: 'CONNECTED', details: `${name} verbunden` })),
      wifiNetworks: [
        { ssid: 'Demo-WLAN', bssid: '02:00:00:00:01:01', type: 'router', signal: -48, channel: 36, frequency: '5 GHz', encryption: 'WPA3', known: true },
        { ssid: 'Demo-Gastnetz', bssid: '02:00:00:00:01:02', type: 'router', signal: -56, channel: 6, frequency: '2.4 GHz', encryption: 'WPA2', known: true },
        { ssid: 'Demo-Arbeitszimmer', bssid: '02:00:00:00:01:03', type: 'accessPoint', signal: -68, channel: 11, frequency: '2.4 GHz', encryption: 'WPA3', known: true }
      ]
    };
  }

  // One relational fixture for every demo page. Negative IDs never refer to database rows.
  function demoSecurity(router) {
    return {
      dataMode: 'demo', rulesKnown: true, devices: router.devices,
      groups: [
        { id: -1, name: 'Familie', description: 'Smartphone und Tablet', blocklistId: -1, color: '#69c5b6' },
        { id: -2, name: 'Arbeit & Schule', description: 'Arbeitsplatz und Drucker', blocklistId: -2, color: '#6c9fdf' },
        { id: -3, name: 'Unterhaltung', description: 'TV, Gaming und Musik', blocklistId: -3, color: '#d6ad67' }
      ],
      members: [{ deviceId: -1, groupId: -2 }, { deviceId: -2, groupId: -1 }, { deviceId: -3, groupId: -3 },
        { deviceId: -4, groupId: -1 }, { deviceId: -5, groupId: -3 }, { deviceId: -6, groupId: -3 }, { deviceId: -7, groupId: -2 }],
      blocklists: [
        { id: -1, name: 'Social-Media-Pause', sourceType: 'CUSTOM', urlPattern: 'tiktok.com|instagram.com|snapchat.com' },
        { id: -2, name: 'Lernzeit', sourceType: 'CUSTOM', urlPattern: 'youtube.com|twitch.tv|discord.com' },
        { id: -3, name: 'Werbung & Tracker', sourceType: 'DNS', urlPattern: 'ads.example.net|tracker.example.com' },
        { id: -4, name: 'Netzwerkfilter', sourceType: 'NETWORK', urlPattern: 'blocked.example.org' }
      ],
      presets: [
        { id: -1, name: 'Abendruhe', description: 'Beispiel für Smartphone und Tablet', blocklistId: -1, timeLimitMinutes: 120, blockedFrom: '20:30', blockedUntil: '06:30', parentalMode: true, priorityMode: false },
        { id: -2, name: 'Schultag', description: 'Beispiel für konzentriertes Arbeiten', blocklistId: -2, timeLimitMinutes: 180, blockedFrom: '21:00', blockedUntil: '07:00', parentalMode: false, priorityMode: false },
        { id: -3, name: 'Gaming', description: 'Beispiel für ein bevorzugtes Gerät', blocklistId: -3, timeLimitMinutes: 240, blockedFrom: '23:00', blockedUntil: '08:00', parentalMode: false, priorityMode: true }
      ],
      assignments: [{ deviceId: -1, presetId: -2, status: 'active' }, { deviceId: -2, presetId: -1, status: 'active' },
        { deviceId: -4, presetId: -1, status: 'paused' }, { deviceId: -5, presetId: -3, status: 'active' }],
      timeLimits: [
        { id: -1, deviceId: -1, dailyLimitMinutes: 180, usedMinutesToday: 65, blockedFrom: '21:00', blockedUntil: '07:00', status: 'active', note: 'Beispiel: Schultag' },
        { id: -2, deviceId: -2, dailyLimitMinutes: 120, usedMinutesToday: 45, blockedFrom: '20:30', blockedUntil: '06:30', status: 'active', note: 'Beispiel: Abendruhe' },
        { id: -3, deviceId: -4, dailyLimitMinutes: 120, usedMinutesToday: 20, blockedFrom: '20:30', blockedUntil: '06:30', status: 'paused', note: 'Beispiel: pausierte Regel' },
        { id: -4, deviceId: -5, dailyLimitMinutes: 240, usedMinutesToday: 90, blockedFrom: '23:00', blockedUntil: '08:00', status: 'active', note: 'Beispiel: Gaming' }
      ]
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
    notice.textContent = isTemporaryDemo() ? 'Temporäre Demo · Beispieldaten nur in diesem Tab. Beenden über die Seitenleiste.' : router?.dataMode === 'live' ? 'Routerdaten · Verbunden'
      : router?.dataMode === 'demo' ? document.body?.dataset.localDraft === 'true'
        ? 'Demo-Geräte · Kein Router verbunden. Lokale Vorschau.'
        : 'Demo · Kein Router verbunden. Beispieldaten, nur Ansicht.'
        : 'Routerstatus unbekannt · Keine bestätigten Routerdaten verfügbar.';
  }

  function routerUrl() {
    return `${config.API_BASE_URL}${config.ROUTERS_PATH}`;
  }

  async function getAuthHeader() {
    const account = window.parent?.NetheraAccount ?? window.NetheraAccount;
    return (await account?.getAuthHeader?.()) ?? {};
  }

  function isTemporaryDemo() {
    try {
      const host = window.parent || window;
      return host.NETHERA_DEMO_PREVIEW === true && host.NetheraAccount?.authenticated === true
        && host.NetheraAccount.keycloak?.tokenParsed?.preferred_username === 'demo';
    } catch { return false; }
  }

  async function getRouters() {
    if (isTemporaryDemo()) return [demoRouter()];
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
    if (router.dataMode === 'demo') return demoSecurity(router);
    if (router.dataMode !== 'live') return { devices: router.devices, groups: [], members: [], blocklists: [], presets: [], assignments: [], timeLimits: [], dataMode: router.dataMode, rulesKnown: false };
    const data = await readJson('/api/security/state');
    let routerControl = null, routerControlError = null;
    try { routerControl = await getRouterControlStatus(router); }
    catch (error) { routerControlError = error.message; }
    const validId = value => (typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
      || (typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)));
    const fromRouter = row => row?.dataSource === 'ROUTER' && validId(row.routerId)
      && validId(router.id) && String(row.routerId) === String(router.id);
    const rows = key => Array.isArray(data?.[key]) ? data[key] : [];
    const ids = items => new Set(items.filter(item => validId(item?.id)).map(item => String(item.id)));
    const deviceIds = ids(router.devices);
    // The deployed API confirms the applied desired version, even for lists originally saved in Nethera.
    // Its legacy status endpoint controls router 1; future multi-router responses must identify their router.
    const statusRouterId = routerControl?.routerId ?? 1;
    const confirmedStatus = routerControl?.connection === 'online' && !routerControl.error
      && validId(statusRouterId) && String(statusRouterId) === String(router.id)
      && typeof routerControl.checkedAt === 'string' && Number.isFinite(Date.parse(routerControl.checkedAt));
    const confirmedNetworkList = item => confirmedStatus && validId(item?.id) && validId(item.routerId)
      && String(item.routerId) === String(router.id) && routerControl.blocklists?.[item.id]?.applied === true
      && !routerControl.blocklists[item.id].error && (item.sourceType === 'NETWORK'
        || (item.sourceType === 'DNS' && routerControl.adblock?.installed === true
          && routerControl.adblock.enabled === true && routerControl.adblock.applied === true));
    // The backend scopes /api/security/state to the account's router and publishes every change to it
    // (RouterControlPublisher → DnsDesiredState). Its rows are the router's desired state, so they are shown
    // and editable. Per-list ACKs from /api/router-control/status say whether the router took them over.
    const forThisRouter = item => item?.routerId == null || String(item.routerId) === String(router.id);
    const blocklists = rows('blocklists').flatMap(item => {
      if (!validId(item?.id) || !forThisRouter(item)) return [];
      if (fromRouter(item)) return [item];
      return [confirmedNetworkList(item) ? { ...item, confirmationSource: 'ROUTER_ACK' } : item];
    });
    const blocklistIds = ids(blocklists);
    const hasBlocklist = item => item.blocklistId == null || (validId(item.blocklistId) && blocklistIds.has(String(item.blocklistId)));
    const groups = rows('groups').filter(item => validId(item?.id) && forThisRouter(item) && hasBlocklist(item));
    const presets = rows('presets').filter(item => validId(item?.id) && forThisRouter(item) && hasBlocklist(item));
    const groupIds = ids(groups);
    const presetIds = ids(presets);
    const members = rows('members').filter(item => validId(item?.deviceId) && validId(item.groupId)
      && deviceIds.has(String(item.deviceId)) && groupIds.has(String(item.groupId)));
    const assignments = rows('assignments').filter(item => validId(item?.deviceId) && validId(item.presetId)
      && deviceIds.has(String(item.deviceId)) && presetIds.has(String(item.presetId)));
    const rules = { blocklists, groups, presets, members, assignments };
    // Live router: the saved backend state is the source of truth for what the router should enforce.
    const rulesKnown = true;
    return { ...rules, rulesKnown, routerControl, routerControlError, dataMode: 'live', devices: router.devices,
      timeLimits: rows('timeLimits').filter(item => item && deviceIds.has(String(item.deviceId))) };
  }

  // Match DnsDesiredState.domains: category tokens are not part of the router's DNS rules.
  function routerDomains(pattern) {
    const domain = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
    return [...new Set(String(pattern || '').split(/[|,;\s]+/)
      .map(value => value.toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[/:?#].*$/, '').replace(/\.$/, ''))
      .filter(value => value.length <= 253 && domain.test(value)))].sort();
  }

  async function getConnections(router) {
    router ||= await getPrimaryRouter();
    if (router.dataMode === 'demo') return router.devices.map((device, i) => ({ client: device.hostname, ip: device.ipAddress,
      protocol: i === 7 ? 'SMB' : 'HTTPS', download: [9, 3, 12, 2, 10, 1, 0, 6][i], upload: [2, .5, .2, .4, 1.5, .1, 0, 3.3][i] }));
    if (router.dataMode !== 'live') return [];
    const rows = await readJson('/api/connections/list');
    // The existing endpoint has no router/source metadata yet, so its old rows stay hidden.
    return Array.isArray(rows) ? rows.filter(row => row.dataSource === 'ROUTER' && String(row.routerId) === String(router.id)) : [];
  }

  async function getConfiguration(router) {
    router ||= await getPrimaryRouter();
    if (router.dataMode === 'demo') return { id: -1, routerName: router.name, mode: 'GATEWAY', updates: true,
      dnsBlocking: true, lanIp: router.ipAddress, gatewayIp: router.ipAddress, guestNetwork: true, profiling: false };
    if (router.dataMode !== 'live') return null;
    const configs = await readJson('/api/configs/list');
    return Array.isArray(configs) ? configs[0] || null : null;
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

  async function getRouterControlStatus(router = currentRouter) {
    if (router && router.dataMode !== 'live') return { connection: router.connection };
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
    getSecurityState, getConnections, getConfiguration, selectDataSource, isLive, requireLive, watchSource };
})();
