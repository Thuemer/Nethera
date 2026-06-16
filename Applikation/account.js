(function () {
  const config = window.NETHERA_CONFIG || {};

  const KEYCLOAK_CONFIG = {
    url: config.KEYCLOAK_URL || 'http://localhost:8081',
    realm: config.KEYCLOAK_REALM || 'Nethera',
    clientId: config.KEYCLOAK_CLIENT_ID || 'Nethera-frontend'
  };

  const API_BASE_URL = config.API_BASE_URL || 'http://localhost:8080';
  const ME_API_URL = `${API_BASE_URL}/api/accounts/me`;
  const SETTINGS_API_URL = `${API_BASE_URL}/api/settings`;

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
      .account-field select { width: 100%; padding: 12px 34px 12px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,.08); outline: 0; color: #fff; background: rgba(255,255,255,.05); font-family: inherit; font-weight: 750; appearance: none; }
      .account-field .nethera-select-button { min-height: 44px; font-size: 14px; }
      .account-field input[readonly] { opacity: .88; }
      .account-config-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px; border: 1px solid rgba(255,255,255,.08); border-radius: 12px; background: rgba(255,255,255,.035); }
      .account-config-row small { display: block; color: #b8c0bd; margin-top: 4px; }
      .account-config-row input { width: 18px; height: 18px; accent-color: #2fb09a; }
      .account-settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .account-data-list { display: grid; gap: 12px; }
      .account-data-card { display: flex; align-items: center; gap: 14px; padding: 14px; border: 1px solid rgba(255,255,255,.08); border-radius: 14px; background: rgba(255,255,255,.035); }
      .account-mini-avatar { width: 42px; height: 42px; flex: 0 0 42px; border-radius: 13px; display: grid; place-items: center; font-weight: 850; background: linear-gradient(135deg, #144659, #2fb09a); }
      .account-data-main { display: grid; gap: 8px; min-width: 0; width: 100%; }
      .account-one-line { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .account-badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 5px 9px; font-size: 12px; font-weight: 750; background: rgba(255,255,255,.07); color: #fff; }
      .account-badge.admin { color: #bbf7d0; background: rgba(34,197,94,.12); }
      .account-badge.user { color: #dbeafe; background: rgba(96,165,250,.14); }
      .account-badge.maintainer { color: #fde68a; background: rgba(245,158,11,.14); }
      .account-status { padding: 12px 14px; border-radius: 12px; color: #b8c0bd; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); }
      .account-status.success { color: #bbf7d0; background: rgba(34,197,94,.10); border-color: rgba(34,197,94,.2); }
      .account-status.error { color: #fecaca; background: rgba(239,68,68,.12); border-color: rgba(239,68,68,.25); }
      .account-status.warning { color: #fde68a; background: rgba(245,158,11,.10); border-color: rgba(245,158,11,.25); }
      @media (max-width: 900px) { .account-view { padding: 16px; } .account-hero { flex-direction: column; align-items: flex-start; } .account-two-grid, .account-settings-grid { grid-template-columns: 1fr; } }
      @media (max-width: 560px) { .account-view { padding: 12px; } .account-data-card { align-items: flex-start; } .account-one-line { white-space: normal; } }
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

  async function apiFetch(url, options = {}) {
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

  async function authFetch(url, options = {}) {
    if (!keycloak?.authenticated) {
      throw new Error('Nicht angemeldet');
    }
    return apiFetch(url, options);
  }

  async function loadCurrentBackendUser() {
    if (!keycloak?.authenticated) return null;
    const response = await authFetch(ME_API_URL);
    if (!response.ok) throw new Error(`API ${response.status}`);
    lastBackendUser = await response.json();
    return lastBackendUser;
  }

  async function loadSettings() {
    const response = await apiFetch(SETTINGS_API_URL);
    if (!response.ok) throw new Error(`Settings API ${response.status}`);
    const data = await response.json();
    return Object.fromEntries((Array.isArray(data) ? data : []).map(item => [item.key, item.value]));
  }

  async function saveSetting(key, value) {
    const response = await apiFetch(`${SETTINGS_API_URL}/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: String(value) })
    });
    if (!response.ok) throw new Error(`Settings API ${response.status}`);
    return response.json();
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
              <h1>Mein Account</h1>
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
              <div class="account-card-header"><h2>App-Einstellungen</h2></div>
              <div class="account-settings-grid">
                <label class="account-field"><span>Standardseite</span><select data-setting="account.defaultPage"><option>Dashboard</option><option>Clients</option><option>Zeitlimits</option><option>Schutz</option></select></label>
                <label class="account-field"><span>Router-Sync</span><select data-setting="account.routerSync"><option value="manual">Manuell</option><option value="startup">Beim Start</option><option value="interval">Regelmäßig</option></select></label>
                <label class="account-field"><span>Design</span><select data-setting="account.theme"><option value="dark">Dunkel</option><option value="contrast">Kontrast</option></select></label>
                <label class="account-field"><span>Sprache</span><select data-setting="account.language"><option value="de">Deutsch</option><option value="en">English</option></select></label>
              </div>
              <label class="account-config-row"><span><strong>Kompakter Modus</strong><small>Dichtere Listen für kleinere Bildschirme</small></span><input data-setting="account.compactMode" type="checkbox"></label>
              <label class="account-config-row"><span><strong>Erweiterte Hinweise</strong><small>Kurze Hilfetexte in Formularen anzeigen</small></span><input data-setting="account.showHelp" type="checkbox" checked></label>
            </section>
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
    try {
      if (keycloak?.authenticated) {
        await loadCurrentBackendUser();
      }
      const settings = await loadSettings();
      document.querySelectorAll('[data-setting]').forEach(control => {
        const value = settings[control.dataset.setting];
        if (control.type === 'checkbox') control.checked = value === 'true';
        else if (value != null) control.value = value;
      });
      window.NetheraSelect?.refreshAll(document);
      setStatus(keycloak?.authenticated ? 'Login aktiv. Einstellungen wurden aus der DB geladen.' : 'Gastmodus. Einstellungen wurden aus der DB geladen.', keycloak?.authenticated ? 'success' : 'info');
    } catch (error) {
      setStatus(`Backend nicht verfügbar: ${error.message}.`, 'warning');
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

    document.querySelectorAll('[data-setting]').forEach(control => {
      control.addEventListener('change', async () => {
        const value = control.type === 'checkbox' ? control.checked : control.value;
        try {
          await saveSetting(control.dataset.setting, value);
          setStatus('Einstellung gespeichert.', 'success');
        } catch (error) {
          setStatus(`Einstellung konnte nicht gespeichert werden: ${error.message}`, 'error');
        }
      });
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
    window.NetheraSelect?.enhanceAll(container);
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
