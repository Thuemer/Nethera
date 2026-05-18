(function () {
  const config = window.NETHERA_CONFIG || {};

  const KEYCLOAK_CONFIG = {
    url: config.KEYCLOAK_URL || 'http://localhost:8081',
    realm: config.KEYCLOAK_REALM || 'Nethera',
    clientId: config.KEYCLOAK_CLIENT_ID || 'Nethera-frontend'
  };

  const API_BASE_URL = config.API_BASE_URL || 'http://localhost:8080';
  const API_ENABLED = config.API_ENABLED === true;
  const ACCOUNT_API_URL = `${API_BASE_URL}/api/accounts/list`;
  const ME_API_URL = `${API_BASE_URL}/api/accounts/me`;

  const DEMO_ACCOUNTS = [
    { name: 'Admin Alpha', email: 'admin@network.local', rolle: 'ADMIN', security: true, traffic: true, weekly: true },
    { name: 'User Beta', email: 'beta@home.de', rolle: 'USER', security: false, traffic: true, weekly: false },
    { name: 'Support Gamma', email: 'support@isp.com', rolle: 'MAINTAINER', security: true, traffic: false, weekly: true }
  ];

  let keycloak = null;
  let initPromise = null;
  let lastBackendUser = null;

  function injectStyles() {
    if (document.getElementById('nethera-account-styles')) return;
    const style = document.createElement('style');
    style.id = 'nethera-account-styles';
    style.textContent = `
      .account-view { height: 100%; overflow-y: auto; padding: 28px; color: #fff; background: radial-gradient(1000px 500px at 10% -10%, rgba(47,176,154,.20), transparent 55%), radial-gradient(900px 400px at 100% 0%, rgba(20,70,89,.25), transparent 58%), #212121; font-family: "Avenir Next", "Segoe UI", sans-serif; box-sizing: border-box; }
      .account-view * { box-sizing: border-box; min-width: 0; }
      .account-page { display: grid; gap: 18px; max-width: 1400px; margin: 0 auto; }
      .account-card { background: linear-gradient(155deg, #1c1f1e, #232826); border: 1px solid rgba(255,255,255,.08); border-radius: 14px; box-shadow: 0 10px 28px rgba(0,0,0,.35); }
      .account-hero { padding: 20px 22px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
      .account-eyebrow { margin: 0; letter-spacing: .08em; text-transform: uppercase; color: #b8c0bd; font-size: 12px; }
      .account-hero h1 { margin: 4px 0 2px; font-size: clamp(28px, 4vw, 38px); }
      .account-subline, .account-muted { margin: 0; color: #b8c0bd; }
      .account-grid { display: grid; gap: 14px; }
      .account-two-grid { grid-template-columns: 1.3fr .7fr; }
      .account-panel { padding: 20px; display: grid; gap: 14px; }
      .account-panel h2 { margin: 0; font-size: 18px; }
      .account-card-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 2px; }
      .account-auth-card { padding: 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; border: 1px solid rgba(47,176,154,.20); }
      .account-auth-title { margin: 0 0 5px; font-size: 18px; font-weight: 850; }
      .account-actions { display: flex; gap: 10px; flex-wrap: wrap; }
      .account-btn { border: 0; padding: 11px 16px; border-radius: 12px; color: #fff; background: linear-gradient(135deg, #144659, #2fb09a); font-weight: 800; cursor: pointer; font-family: inherit; }
      .account-btn:hover { transform: translateY(-1px); }
      .account-btn.secondary { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); color: #fff; }
      .account-btn.danger { background: rgba(239,68,68,.16); border: 1px solid rgba(239,68,68,.28); color: #fecaca; }
      .account-profile-box { display: flex; gap: 16px; align-items: center; }
      .account-avatar { width: 62px; height: 62px; border-radius: 18px; background: linear-gradient(135deg, #144659, #2fb09a); display: grid; place-items: center; font-size: 26px; font-weight: 900; flex: 0 0 62px; }
      .account-field { display: grid; gap: 7px; color: #b8c0bd; font-size: 13px; font-weight: 650; }
      .account-field input { width: 100%; padding: 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,.08); outline: 0; color: #fff; background: rgba(255,255,255,.05); font-family: inherit; }
      .account-field input[readonly] { opacity: .88; }
      .account-config-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px; border: 1px solid rgba(255,255,255,.08); border-radius: 12px; background: rgba(255,255,255,.035); }
      .account-config-row small { display: block; color: #b8c0bd; margin-top: 4px; }
      .account-config-row input { width: 18px; height: 18px; accent-color: #2fb09a; }
      .account-data-list { display: grid; gap: 12px; }
      .account-data-card { display: flex; align-items: center; gap: 14px; padding: 14px; border: 1px solid rgba(255,255,255,.08); border-radius: 14px; background: rgba(255,255,255,.035); }
      .account-mini-avatar { width: 42px; height: 42px; flex: 0 0 42px; border-radius: 13px; display: grid; place-items: center; font-weight: 850; background: linear-gradient(135deg, #144659, #2fb09a); }
      .account-data-main { display: grid; gap: 8px; min-width: 0; width: 100%; }
      .account-data-title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; }
      .account-one-line { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .account-badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 5px 9px; font-size: 12px; font-weight: 750; background: rgba(255,255,255,.07); color: #fff; }
      .account-badge.admin { color: #bbf7d0; background: rgba(34,197,94,.12); }
      .account-badge.user { color: #dbeafe; background: rgba(96,165,250,.14); }
      .account-badge.maintainer { color: #fde68a; background: rgba(245,158,11,.14); }
      .account-kpi-row { display: flex; flex-wrap: wrap; gap: 8px; }
      .account-kpi-row span { padding: 6px 8px; border-radius: 10px; color: #b8c0bd; background: rgba(255,255,255,.045); font-size: 12px; }
      .account-kpi-row b { color: #fff; }
      .account-status { padding: 12px 14px; border-radius: 12px; color: #b8c0bd; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); }
      .account-status.success { color: #bbf7d0; background: rgba(34,197,94,.10); border-color: rgba(34,197,94,.2); }
      .account-status.error { color: #fecaca; background: rgba(239,68,68,.12); border-color: rgba(239,68,68,.25); }
      .account-status.warning { color: #fde68a; background: rgba(245,158,11,.10); border-color: rgba(245,158,11,.25); }
      .account-dev-note { color: #b8c0bd; font-size: 13px; line-height: 1.45; }
      .account-dev-note code { color: #bbf7d0; }
      @media (max-width: 900px) { .account-view { padding: 16px; } .account-hero { flex-direction: column; align-items: flex-start; } .account-two-grid { grid-template-columns: 1fr; } }
      @media (max-width: 560px) { .account-view { padding: 12px; } .account-data-card { align-items: flex-start; } .account-data-title-row { align-items: flex-start; flex-direction: column; gap: 7px; } .account-one-line { white-space: normal; } }
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function initials(name) {
    return String(name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() || '')
      .join('') || '?';
  }

  function roleLabel(role) {
    const value = String(role || '').toUpperCase();
    if (value === 'ADMIN') return 'Admin';
    if (value === 'MAINTAINER') return 'Maintainer';
    if (value === 'USER') return 'User';
    return role || 'Unbekannt';
  }

  function boolLabel(value) {
    return value ? 'Aktiv' : 'Aus';
  }

  function getTokenUser() {
    const token = keycloak?.tokenParsed || {};
    const username = token.preferred_username || token.name || 'Nethera Benutzer';
    const name = token.name || [token.given_name, token.family_name].filter(Boolean).join(' ') || username;
    const email = token.email || '';
    const roles = token.realm_access?.roles || [];
    return { username, name, email, roles };
  }

  async function initKeycloak() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      if (!window.Keycloak) {
        throw new Error('Keycloak-Adapter wurde nicht geladen. Prüfe die Script-Reihenfolge in index.html.');
      }

      keycloak = new Keycloak(KEYCLOAK_CONFIG);
      await keycloak.init({
        onLoad: 'check-sso',
        pkceMethod: 'S256',
        checkLoginIframe: false
      });
      return keycloak;
    })();

    return initPromise;
  }

  async function getAuthHeader() {
    if (!keycloak?.authenticated) return {};
    await keycloak.updateToken(30);
    return { Authorization: `Bearer ${keycloak.token}` };
  }

  async function authFetch(url, options = {}) {
    if (!API_ENABLED) {
      throw new Error('Backend-API ist in config.js deaktiviert. Demo-Daten werden verwendet.');
    }
    if (!keycloak?.authenticated) {
      throw new Error('Nicht angemeldet');
    }
    const authHeader = await getAuthHeader();
    return fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...authHeader,
        Accept: 'application/json'
      },
      cache: 'no-store'
    });
  }

  async function loadCurrentBackendUser() {
    if (!API_ENABLED || !keycloak?.authenticated) return null;
    const response = await authFetch(ME_API_URL);
    if (!response.ok) throw new Error(`API ${response.status}`);
    lastBackendUser = await response.json();
    return lastBackendUser;
  }

  async function loadAccounts() {
    if (!API_ENABLED || !keycloak?.authenticated) return DEMO_ACCOUNTS;
    const response = await authFetch(ACCOUNT_API_URL);
    if (!response.ok) throw new Error(`API ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data : DEMO_ACCOUNTS;
  }

  function renderAccounts(list, accounts) {
    if (!list) return;
    if (!accounts.length) {
      list.innerHTML = '<div class="account-status">Es wurden keine Account-Daten gefunden.</div>';
      return;
    }

    list.innerHTML = accounts.map(account => `
      <article class="account-data-card">
        <div class="account-mini-avatar">${escapeHtml(initials(account.name))}</div>
        <div class="account-data-main">
          <div class="account-data-title-row">
            <strong class="account-one-line">${escapeHtml(account.name || 'Unbekannter Account')}</strong>
            <span class="account-badge ${escapeHtml(String(account.rolle || '').toLowerCase())}">${escapeHtml(roleLabel(account.rolle))}</span>
          </div>
          <p class="account-muted account-one-line">${escapeHtml(account.email || 'Keine E-Mail')}</p>
          <div class="account-kpi-row">
            <span>Security: <b>${boolLabel(account.security)}</b></span>
            <span>Traffic: <b>${boolLabel(account.traffic)}</b></span>
            <span>Weekly: <b>${boolLabel(account.weekly)}</b></span>
          </div>
        </div>
      </article>
    `).join('');
  }

  function accountMarkup() {
    const authenticated = Boolean(keycloak?.authenticated);
    const tokenUser = authenticated ? getTokenUser() : null;
    const displayName = tokenUser?.name || 'Nethera Benutzer';
    const email = tokenUser?.email || 'Noch nicht angemeldet';
    const roles = tokenUser?.roles?.filter(role => !['default-roles-nethera', 'offline_access', 'uma_authorization'].includes(role)) || [];

    return `
      <div class="account-view">
        <main class="account-page">
          <section class="account-card account-hero">
            <div>
              <p class="account-eyebrow">Nethera Account</p>
              <h1>Account</h1>
              <p class="account-subline">Anmelden, Rechte prüfen und Benutzerprofil verwalten.</p>
            </div>
            <div class="account-actions">
              ${authenticated
                ? '<button class="account-btn danger" id="netheraLogoutButton" type="button">Abmelden</button>'
                : '<button class="account-btn" id="netheraLoginButton" type="button">Mit Nethera anmelden</button>'}
            </div>
          </section>

          <section class="account-card account-auth-card">
            <div>
              <p class="account-auth-title">${authenticated ? `Angemeldet als ${escapeHtml(tokenUser.username)}` : 'Nicht angemeldet'}</p>
              <p class="account-muted">${authenticated ? 'JWT von Keycloak erhalten und bereit für Backend-Requests.' : 'Klicke auf „Mit Nethera anmelden“, um dich über Keycloak zu authentifizieren.'}</p>
            </div>
            <span class="account-badge ${authenticated ? 'admin' : ''}">${authenticated ? 'Authentifiziert' : 'Gastmodus'}</span>
          </section>

          <section class="account-grid account-two-grid">
            <section class="account-card account-panel">
              <div class="account-card-header"><h2>Profil</h2></div>
              <div class="account-profile-box">
                <div class="account-avatar">${escapeHtml(initials(displayName))}</div>
                <div>
                  <h2>${escapeHtml(displayName)}</h2>
                  <p class="account-muted">${authenticated ? escapeHtml(email || tokenUser.username) : 'Noch nicht angemeldet'}</p>
                </div>
              </div>
              <label class="account-field"><span>Anzeigename</span><input id="accountDisplayName" type="text" value="${escapeHtml(displayName)}" readonly></label>
              <label class="account-field"><span>E-Mail</span><input id="accountEmail" type="text" value="${escapeHtml(authenticated ? (email || '') : '')}" placeholder="Erst nach Login verfügbar" readonly></label>
              <label class="account-field"><span>Rollen</span><input type="text" value="${escapeHtml(roles.length ? roles.join(', ') : (authenticated ? 'Keine Fachrolle gesetzt' : 'Nicht angemeldet'))}" readonly></label>
            </section>

            <section class="account-card account-panel">
              <div class="account-card-header"><h2>Benachrichtigungen</h2></div>
              <label class="account-config-row"><span><strong>Security Warnungen</strong><small>Bei geblockten Domains und neuen Clients informieren</small></span><input type="checkbox" checked></label>
              <label class="account-config-row"><span><strong>Traffic Warnungen</strong><small>Bei ungewöhnlich hohem Datenverkehr informieren</small></span><input type="checkbox" checked></label>
              <label class="account-config-row"><span><strong>Wöchentlicher Bericht</strong><small>Kurze Zusammenfassung am Wochenende</small></span><input type="checkbox"></label>
            </section>
          </section>

          <section class="account-card account-panel">
            <div class="account-card-header">
              <h2>Accounts aus Backend / Demo</h2>
              <span class="account-badge">${API_ENABLED ? 'Backend aktiv' : 'Demo-Modus'}</span>
            </div>
            <div id="accountList" class="account-data-list" aria-live="polite"></div>
            <p class="account-dev-note">
              Für das Backend-Team: Das Frontend sendet bei aktivierter API den Header
              <code>Authorization: Bearer &lt;JWT&gt;</code> an <code>/api/accounts/me</code> und <code>/api/accounts/list</code>.
            </p>
          </section>

          <div id="accountStatus" class="account-status">Bereit.</div>
        </main>
      </div>
    `;
  }

  function setStatus(text, state = 'info') {
    const status = document.getElementById('accountStatus');
    if (!status) return;
    status.textContent = text;
    status.className = `account-status ${state}`;
  }

  async function refreshAccountData() {
    const list = document.getElementById('accountList');
    try {
      if (keycloak?.authenticated && API_ENABLED) {
        await loadCurrentBackendUser();
      }
      const accounts = await loadAccounts();
      renderAccounts(list, accounts);
      setStatus(keycloak?.authenticated ? 'Login aktiv. JWT ist für Backend-Requests verfügbar.' : 'Gastmodus aktiv. Demo-Daten werden angezeigt.', keycloak?.authenticated ? 'success' : 'info');
    } catch (error) {
      renderAccounts(list, DEMO_ACCOUNTS);
      setStatus(`Backend nicht verfügbar: ${error.message}. Demo-Daten werden angezeigt.`, 'warning');
    }
  }

  function bindAccountActions() {
    document.getElementById('netheraLoginButton')?.addEventListener('click', () => {
      if (!keycloak) {
        setStatus('Keycloak ist noch nicht bereit. Prüfe, ob der Container läuft.', 'error');
        return;
      }
      keycloak.login({ redirectUri: `${window.location.origin}${window.location.pathname}?screen=account` });
    });

    document.getElementById('netheraLogoutButton')?.addEventListener('click', () => {
      if (!keycloak) return;
      keycloak.logout({ redirectUri: `${window.location.origin}${window.location.pathname}?screen=account` });
    });
  }

  async function render(container) {
    injectStyles();
    if (!keycloak) {
      try {
        await initKeycloak();
      } catch (error) {
        console.error(error);
      }
    }

    container.innerHTML = accountMarkup();
    bindAccountActions();
    await refreshAccountData();
  }

  window.NetheraAccount = {
    init: initKeycloak,
    render,
    get keycloak() { return keycloak; },
    get token() { return keycloak?.token || null; },
    get authenticated() { return Boolean(keycloak?.authenticated); },
    getAuthHeader
  };
})();
