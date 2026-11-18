const appConfig = window.NETHERA_CONFIG || {};
const API_BASE_URL = appConfig.API_BASE_URL || 'http://localhost:8083';
const SECURITY_API = `${API_BASE_URL}/api/security`;

const state = {
  loaded: false,
  rulesKnown: false,
  dataMode: 'unavailable',
  devices: [],
  groups: [],
  members: [],
  blocklists: [],
  presets: [],
  assignments: [],
  timeLimits: [],
  routerControl: null,
  routerControlError: null,
  wifiNetworks: []
};
let localDraft = null, draftBase = null, draftKey = null;
const canEditRules = () => state.preview || state.rulesKnown;

function renderDraft() {
  const discard = document.getElementById('discardDraft');
  if (discard) discard.disabled = !localDraft?.dirty && !state.draftError;
  const confirmed = (draftBase?.blocklists || []).filter(item => item.confirmationSource === 'ROUTER_ACK');
  const section = document.getElementById('confirmedRules');
  if (section) section.hidden = !confirmed.length || state.dataMode !== 'live';
  const list = document.getElementById('confirmedRulesList');
  if (list) list.innerHTML = confirmed.map(item => `<dt>${escapeText(item.name)}</dt><dd>${blocklistDomains(item).map(escapeText).join(', ')}</dd>`).join('');
}

function useDraft() {
  Object.assign(state, localDraft.snapshot(draftBase), { preview: true });
  renderAll();
  renderRouterControlStatus();
  renderDraft();
}

async function discardDraft() {
  if (!window.confirm('Lokale Änderungen in diesem Tab verwerfen? Der Router bleibt unverändert.')) return;
  window.sessionStorage.removeItem(draftKey);
  localDraft = null;
  await loadSecurityState(true);
  await loadAdProtection();
  setStatus('Lokaler Entwurf verworfen. Routereinstellungen unverändert.', 'info');
}

function escapeText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function sanitizeDomain(value) {
  try {
    const input = String(value || '').trim();
    if (!input || /\s/.test(input)) return '';
    const url = new URL(input.includes('://') ? input : `https://${input}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return '';
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host) ? host : '';
  } catch { return ''; }
}

function setStatus(text, tone = 'info') {
  if (state.preview && tone === 'success') text = 'Im lokalen Entwurf gespeichert. Nicht an den Router gesendet.';
  const status = document.getElementById('statusBox');
  status?.setAttribute('text', text);
  status?.setAttribute('state', tone);
}

async function apiJson(url, options = {}) {
  if (options.method && options.method !== 'GET') {
    if (state.preview) {
      if (!state.loaded || !localDraft) throw new Error('Lokaler Entwurf nicht geladen.');
      return localDraft.request(draftBase, new URL(url).pathname, options);
    }
    await NetheraApi.requireLive();
    if (!state.rulesKnown && (url.startsWith(`${SECURITY_API}/`) || url.startsWith(`${API_BASE_URL}/api/device-time-limits/`))) {
      throw new Error('Regeln wurden noch nicht vollständig vom Router gemeldet. Bestehende Einstellungen bleiben unverändert.');
    }
  }
  const account = window.parent?.NetheraAccount ?? window.NetheraAccount;
  const authHeader = (await account?.getAuthHeader?.()) ?? {};
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...authHeader,
      ...(options.headers || {})
    },
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  if (response.status === 204) return null;
  return response.json();
}

async function loadSecurityState(refresh = false) {
  if (!refresh && localDraft && state.preview && state.loaded) { useDraft(); return; }
  try {
    const router = await NetheraApi.getPrimaryRouter();
    const data = await NetheraApi.getSecurityState(router);
    Object.assign(state, {
      loaded: router.dataMode !== 'unavailable',
      dataMode: router.dataMode,
      rulesKnown: data.rulesKnown === true,
      draftError: false,
      routerControl: data.routerControl || null,
      routerControlError: data.routerControlError || null,
      wifiNetworks: router.wifiNetworks || [],
      devices: data.devices || [],
      groups: data.groups || [],
      members: data.members || [],
      blocklists: data.blocklists || [],
      presets: data.presets || [],
      assignments: data.assignments || [],
      timeLimits: data.timeLimits || []
    });
    const account = window.parent?.NetheraAccount ?? window.NetheraAccount;
    const owner = account?.keycloak?.tokenParsed?.sub || 'local-preview';
    const key = NetheraSecurityDraft.keyFor(API_BASE_URL, owner, router);
    draftBase = { ...data, loaded: router.dataMode !== 'unavailable', wifiNetworks: router.wifiNetworks || [] };
    if (key !== draftKey || !localDraft) {
      draftKey = key;
      localDraft = NetheraSecurityDraft.create(window.sessionStorage, key);
    }
    useDraft();
    setStatus(router.dataMode === 'unavailable' ? 'Gerätedaten nicht verfügbar. Lokale Entwürfe bleiben erhalten.'
      : localDraft.dirty ? 'Lokaler Entwurf geladen. Routereinstellungen unverändert.' : 'Gerätedaten geladen. Änderungen werden nur in diesem Tab gespeichert.', 'info');
  } catch (error) {
    Object.assign(state, { loaded: false, preview: true, draftError: true, rulesKnown: false, dataMode: 'unavailable', routerControl: null, routerControlError: error, devices: [], groups: [], members: [], blocklists: [], presets: [], assignments: [], timeLimits: [], wifiNetworks: [] });
    renderAll();
    setStatus(`Vorschau nicht geladen: ${error.message}. Bereits gespeicherte Entwürfe bleiben erhalten.`, 'error');
  }
  renderRouterControlStatus();
  renderDraft();
  updateReadOnlyControls();
}

function updateReadOnlyControls() {
  document.querySelectorAll('form input, form select, form textarea, form button, [data-device-group], [data-device-preset], [data-group-name], [data-group-blocklist], [data-save-group], [data-edit-domain], [data-remove-domain]').forEach(control => {
    const readOnly = state.preview ? !state.loaded : !NetheraApi.isLive() || (!state.rulesKnown && !control.closest('#adProtectionForm'));
    if (readOnly && !control.disabled) { control.dataset.sourceDisabled = 'true'; control.disabled = true; }
    else if (!readOnly && control.dataset.sourceDisabled) { control.disabled = false; delete control.dataset.sourceDisabled; }
  });
}

function routerEffect(entry) {
  if (state.dataMode === 'demo') return 'Beispiel';
  if (state.routerControl?.connection === 'online' && entry?.applied === true) return 'Am Router bestätigt';
  if (entry?.error) return 'Routerfehler';
  return 'Nur gespeichert';
}

function renderRouterControlStatus() {
  const control = state.routerControl;
  const connection = control?.connection;
  const summary = document.getElementById('routerControlStatus');
  if (summary) summary.textContent = state.dataMode === 'demo'
    ? 'Demo-Netzwerk: Alle Regeln sind Beispiele und wirken nicht auf deinen Router.'
    : state.routerControlError
    ? 'Routerstatus konnte nicht geladen werden. Gespeicherte Regeln sind nicht als wirksam bestätigt.'
    : !control
      ? 'Routerbestätigung derzeit nicht verfügbar. Keine bestätigte Routerwirkung.'
      : connection === 'online'
        ? `Router erreichbar · zuletzt geprüft: ${control.checkedAt ? new Date(control.checkedAt).toLocaleString('de-AT') : 'gerade eben'}`
        : 'Router nicht erreichbar oder Status unbekannt. Regeln sind nicht als wirksam bestätigt.';

  const adblock = control?.adblock;
  const adblockText = document.getElementById('adblockActual');
  if (adblockText) adblockText.textContent = state.dataMode === 'demo'
    ? 'Beispiel: Werbefilter eingeschaltet. Keine Installation oder Aktivierung am echten Router.'
    : connection !== 'online'
    ? 'Installation und Aktivierung am Router können derzeit nicht bestätigt werden.'
    : adblock?.installed === false
      ? 'Adblock ist am Router nicht installiert.'
      : adblock?.installed !== true
        ? 'Installationsstatus am Router unbekannt.'
        : adblock?.applied === true && adblock?.enabled === true
          ? 'Adblock ist installiert und am Router aktiv.'
          : adblock?.applied === true && adblock?.enabled === false
            ? 'Adblock ist installiert, aber am Router ausgeschaltet.'
            : 'Adblock ist installiert; die Aktivierung ist noch nicht bestätigt.';

  const install = document.getElementById('installAdblock');
  if (install) {
    install.disabled = state.preview ? !state.loaded || adblock?.installed === true || localDraft?.adblock.installRequested === true
      : connection !== 'online' || !control?.capabilities?.adblockInstall || adblock?.installed !== false;
    if (state.preview) install.textContent = localDraft?.adblock.installRequested ? 'Installation lokal vorgemerkt' : 'Installation vormerken';
  }

  const blocklistNote = document.getElementById('blocklistActual');
  if (blocklistNote) blocklistNote.textContent = state.preview
    ? 'Entwurf für Websitesperren. Bestätigte Routerregeln bleiben unverändert.' : state.dataMode === 'demo'
    ? 'Beispiel-Sperrlisten für Geräte, Gruppen und das gesamte Netzwerk. Keine echte Sperrwirkung.'
    : !state.rulesKnown
    ? 'Netzwerksperren erscheinen mit der Übernahmebestätigung des Routers. Unbestätigte Geräte- und Gruppenzuweisungen bleiben verborgen.'
    : control?.connection === 'online'
    ? 'Jede Blockliste zeigt ihren bestätigten Routerstatus einzeln an.'
    : 'Sperrlisten sind gespeichert; die Wirkung am Router ist nicht bestätigt.';
  const priorityNote = document.getElementById('priorityActual');
  if (priorityNote) priorityNote.textContent = state.preview
    ? 'Lokale Prioritätswünsche. Keine Änderung an der Bandbreite oder am Router.' : state.dataMode === 'demo'
    ? 'Beispiel-Prioritäten · Keine Änderung am Router.'
    : !state.rulesKnown
    ? 'Gerätezuweisungen sind nicht vollständig vom Router gemeldet. Bestehende Prioritäten bleiben unverändert.'
    : control?.connection === 'online'
    ? 'Die Übernahme wird für jedes Gerät getrennt bestätigt.'
    : 'Prioritäten sind gespeichert; die Wirkung am Router ist nicht bestätigt.';

  renderManualDomains();
  renderPriorityList();
  updatePriorityPreview();
  updateReadOnlyControls();
}

async function loadRouterControlStatus() {
  // Reload lists and confirmation together; an old ACK must not survive a status refresh.
  await loadSecurityState(true);
}

async function requestAdblockInstallation() {
  const button = document.getElementById('installAdblock');
  if (state.preview) {
    if (!localDraft || !state.loaded) return;
    try {
      localDraft.setAdblock(true, true);
      await loadAdProtection();
      renderRouterControlStatus(); renderDraft();
      setStatus('Installation nur lokal vorgemerkt. Es wurde kein Installationsbefehl gesendet.', 'info');
    } catch (error) { setStatus(`Nicht vorgemerkt: ${error.message}`, 'error'); }
    return;
  }
  if (state.routerControl?.connection !== 'online' || !state.routerControl.capabilities?.adblockInstall || state.routerControl.adblock?.installed !== false) return;
  button.disabled = true;
  try {
    await NetheraApi.installAdblock();
    setStatus('Installation angefordert. Prüfe den Routerstatus, bevor du Adblock als aktiv betrachtest.', 'info');
    await loadRouterControlStatus();
  } catch (error) {
    setStatus(`Installation nicht bestätigt: ${error.message}`, 'error');
    button.disabled = false;
  }
}

function blocklistDomains(blocklist) {
  return String(blocklist?.urlPattern || '').split('|').map(item => item.trim()).filter(Boolean);
}

function packageNames(blocklist) {
  const text = String(blocklist?.urlPattern || '').toLowerCase();
  return [
    text.includes('gambling') ? 'Glücksspiel' : '',
    text.includes('adult') ? '18+' : '',
    text.includes('social') || text.includes('instagram') || text.includes('tiktok') ? 'Social' : '',
    text.includes('ads') || text.includes('tracker') ? 'Werbung' : ''
  ].filter(Boolean);
}

function groupForDevice(deviceId) {
  const member = state.members.find(item => Number(item.deviceId) === Number(deviceId));
  return state.groups.find(group => Number(group.id) === Number(member?.groupId)) || null;
}

function assignmentForDevice(deviceId) {
  return state.assignments.find(item => Number(item.deviceId) === Number(deviceId)) || null;
}

function presetForDevice(deviceId) {
  const assignment = assignmentForDevice(deviceId);
  return state.presets.find(preset => Number(preset.id) === Number(assignment?.presetId)) || null;
}

function groupOptions(selectedId = '') {
  return [
    `<option value="">${canEditRules() ? 'Keine Gruppe im Entwurf' : 'Nicht gemeldet'}</option>`,
    ...state.groups.map(group => `<option value="${group.id}" ${Number(group.id) === Number(selectedId) ? 'selected' : ''}>${escapeText(group.name)}</option>`)
  ].join('');
}

function presetOptions(selectedId = '') {
  return [
    `<option value="">${canEditRules() ? 'Keine Vorlage' : 'Nicht gemeldet'}</option>`,
    ...state.presets.map(preset => `<option value="${preset.id}" ${Number(preset.id) === Number(selectedId) ? 'selected' : ''}>${escapeText(preset.name)}</option>`)
  ].join('');
}

function blocklistOptions(selectedId = '') {
  return [
    `<option value="">${canEditRules() ? 'Keine Blockliste' : 'Nicht gemeldet'}</option>`,
    ...state.blocklists.map(blocklist => `<option value="${blocklist.id}" ${Number(blocklist.id) === Number(selectedId) ? 'selected' : ''}>${escapeText(blocklist.name)}</option>`)
  ].join('');
}

function renderStats() {
  if (!state.loaded || !canEditRules()) {
    ['statPackages', 'statManual', 'statAds', 'statPresets'].forEach(id => {
      document.getElementById(id)?.setAttribute('value', '—');
    });
    return;
  }
  const domainCount = state.blocklists.reduce((sum, blocklist) => sum + blocklistDomains(blocklist).length, 0);
  document.getElementById('statPackages')?.setAttribute('value', String(state.blocklists.length));
  document.getElementById('statManual')?.setAttribute('value', String(domainCount));
  document.getElementById('statAds')?.setAttribute('value', String(new Set(state.blocklists.filter(item => item.sourceType === 'DNS').flatMap(blocklistDomains)).size));
  document.getElementById('statPresets')?.setAttribute('value', String(state.presets.length));
  const adPercent = document.getElementById('adPercent');
  if (adPercent) adPercent.textContent = '—';
}

function renderGroupControls() {
  const select = document.getElementById('groupBlocklistSelect');
  if (select) {
    select.innerHTML = state.groups.map(group => `<option value="${group.id}">${escapeText(group.name)}</option>`).join('');
  }
  renderGroupBlocklistForm();
}

function renderGroupBlocklistForm() {
  const groupId = Number(document.getElementById('groupBlocklistSelect')?.value || state.groups[0]?.id || 0);
  const group = state.groups.find(item => Number(item.id) === groupId);
  const blocklist = state.blocklists.find(item => Number(item.id) === Number(group?.blocklistId));
  const entries = blocklistDomains(blocklist);
  document.getElementById('groupPkgGambling').checked = entries.includes('gambling');
  document.getElementById('groupPkgAdult').checked = entries.includes('adult');
  document.getElementById('groupPkgSocial').checked = entries.includes('social');
}

function renderGroupDevices() {
  const list = document.getElementById('groupDeviceList');
  if (!list) return;
  if (!state.devices.length) {
    list.innerHTML = '<empty-state title="Keine Geräte" text="Noch keine Geräte verfügbar."></empty-state>';
    return;
  }

  const search = String(document.getElementById('groupDeviceSearch').value || '').toLowerCase();
  const devices = state.devices.filter(device => `${device.hostname} ${device.ipAddress}`.toLowerCase().includes(search));
  list.innerHTML = devices.map(device => {
    const group = groupForDevice(device.id);
    const preset = presetForDevice(device.id);
    const assignment = assignmentForDevice(device.id);
    const groupBlocklist = state.blocklists.find(item => Number(item.id) === Number(group?.blocklistId));
    const presetBlocklist = state.blocklists.find(item => Number(item.id) === Number(preset?.blocklistId));
    const ruleCount = new Set([...blocklistDomains(groupBlocklist), ...blocklistDomains(presetBlocklist),
      ...state.blocklists.filter(item => item.sourceType === 'NETWORK').flatMap(blocklistDomains)]).size;
    const presetState = state.preview ? 'Lokaler Entwurf' : preset ? (assignment?.status === 'paused' ? 'Vorlage pausiert' : 'Vorlage zugewiesen') : state.rulesKnown ? 'Keine Vorlage' : 'Zuweisung nicht gemeldet';
    const presetClass = assignment?.status === 'paused' ? 'warn' : '';
    return `
      <article class="device-group-item">
        <div class="device-group-main">
          <div class="device-title-row">
            <strong>${escapeText(device.hostname || 'Unbekanntes Gerät')}</strong>
            <span class="badge ${presetClass}">${escapeText(presetState)}</span>
          </div>
          <span>${escapeText(device.ipAddress || 'Keine IP')} · ${escapeText(device.connectionType || 'unbekannt')} · Gruppe: ${escapeText(group?.name || (canEditRules() ? 'Nicht zugewiesen' : 'Nicht gemeldet'))}</span>
          <span class="preset-line">Vorlage: <b>${escapeText(preset?.name || (canEditRules() ? 'Keine' : 'Nicht gemeldet'))}</b> · ${canEditRules() ? ruleCount : '—'} Regeln · Priorität: ${!preset && !canEditRules() ? 'Unbekannt' : preset?.priorityMode ? 'Bevorzugt' : 'Normal'}</span>
        </div>
        <div class="device-group-actions">
          <label><span>Gruppe</span><select aria-label="Gruppe für ${escapeText(device.hostname)}" data-device-group="${device.id}">${groupOptions(group?.id)}</select></label>
          <label><span>Vorlage</span><select aria-label="Vorlage für ${escapeText(device.hostname)}" data-device-preset="${device.id}">${presetOptions(preset?.id)}</select></label>
        </div>
      </article>
    `;
  }).join('') || '<empty-state title="Keine passenden Geräte" text="Keine Treffer für diese Suche."></empty-state>';
  updateReadOnlyControls();
}

function devicesForGroup(groupId) {
  const deviceIds = state.members
    .filter(member => Number(member.groupId) === Number(groupId))
    .map(member => Number(member.deviceId));
  return state.devices.filter(device => deviceIds.includes(Number(device.id)));
}

function renderGroupOverview() {
  const list = document.getElementById('groupOverviewList');
  if (!list) return;
  if (!state.groups.length) {
    list.innerHTML = canEditRules() ? '<empty-state title="Noch keine Gruppen im Entwurf" text="Lege eine Gruppe an und ordne deine Geräte zu."></empty-state>' : '<empty-state title="Keine gemeldeten Gruppen" text="Der Router hat noch keine verifizierten Gruppen geliefert."></empty-state>';
    return;
  }

  list.innerHTML = state.groups.map(group => {
    const blocklist = state.blocklists.find(item => Number(item.id) === Number(group.blocklistId));
    const devices = devicesForGroup(group.id);
    const rules = blocklistDomains(blocklist);
    return `
      <article class="group-overview-item">
        <div class="group-overview-fields">
          <label class="field compact-field">
            <span>Gruppenname</span>
            <input type="text" value="${escapeText(group.name)}" data-group-name="${group.id}">
          </label>
          <label class="field compact-field">
            <span>Blocklist für Gruppe</span>
            <select data-group-blocklist="${group.id}">${blocklistOptions(group.blocklistId)}</select>
          </label>
          <button class="small-btn" type="button" data-save-group="${group.id}">Name speichern</button>
        </div>
        <div class="group-summary-line">
          <span class="badge">${devices.length} ${canEditRules() ? 'Geräte' : 'gemeldete Geräte'}</span>
          <span class="badge">${rules.length} Regeln</span>
          <span class="muted">${escapeText(devices.map(device => device.hostname).filter(Boolean).join(', ') || (canEditRules() ? 'Noch keine Geräte' : 'Zuweisungen nicht gemeldet'))}</span>
        </div>
      </article>
    `;
  }).join('');
}

function renderManualDomains() {
  const list = document.getElementById('manualDomainsList');
  if (!list) return;
  if (!state.blocklists.length) {
    list.innerHTML = canEditRules() ? '<empty-state title="Keine Blocklisten im Entwurf" text="Füge die erste Website hinzu."></empty-state>' : '<empty-state title="Keine bestätigten Blocklisten" text="Es liegen noch keine verifizierten Sperrlisten oder Übernahmebestätigungen vor. Bestehende Routerregeln bleiben unverändert."></empty-state>';
    return;
  }

  list.innerHTML = state.blocklists.map(blocklist => {
    const domains = blocklistDomains(blocklist);
    const tags = packageNames(blocklist);
    return `
      <article class="rule-item">
        <div class="rule-main">
          <strong>${escapeText(blocklist.name)}</strong>
          <span>${escapeText(blocklistScope(blocklist))} · ${domains.length} Einträge${tags.length ? ` · ${escapeText(tags.join(', '))}` : ''}</span>
          <div class="domain-entries">${domains.map(domain => `<div class="priority-row" data-domain-row><span>${escapeText(({adult:'18+ Inhalte',gambling:'Glücksspiele',social:'Social Media',violence:'Gewalt'})[domain] || domain)}</span><div class="domain-actions">${!['adult', 'gambling', 'social', 'violence'].includes(domain) ? `<button class="small-btn ghost" type="button" data-edit-domain="${escapeText(domain)}" data-blocklist="${blocklist.id}" aria-label="${escapeText(domain)} bearbeiten">Bearbeiten</button>` : ''}<button class="small-btn ghost" type="button" data-remove-domain="${escapeText(domain)}" data-blocklist="${blocklist.id}" aria-label="${escapeText(domain)} aus ${escapeText(blocklist.name)} entfernen">Entfernen</button></div></div>`).join('') || '<span>Keine Einträge</span>'}</div>
        </div>
        <span class="badge ${!blocklist.localDraft && routerEffect(state.routerControl?.blocklists?.[blocklist.id]) === 'Am Router bestätigt' ? 'ok' : ''}">${blocklist.localDraft ? 'Lokaler Entwurf' : routerEffect(state.routerControl?.blocklists?.[blocklist.id])}</span>
      </article>
    `;
  }).join('');
}

function renderAdDomains() {
  const list = document.getElementById('adDomainsList');
  if (!list) return;
  const entries = state.blocklists.filter(item => item.sourceType === 'DNS')
    .flatMap(blocklist => blocklistDomains(blocklist).map(domain => ({ domain, blocklist })));
  list.innerHTML = entries.map(({ domain, blocklist }) => `
    <article class="rule-item">
      <div class="rule-main">
        <strong>${escapeText(domain)}</strong>
        <span>${state.dataMode === 'demo' && !blocklist.localDraft ? 'Beispiel für eine Werbefilter-Liste' : escapeText(blocklist.name)}</span>
      </div>
      <span class="badge ${!blocklist.localDraft && blocklist.confirmationSource === 'ROUTER_ACK' ? 'ok' : ''}">${blocklist.localDraft ? 'Lokaler Entwurf' : state.dataMode === 'demo' ? 'Beispiel' : blocklist.confirmationSource === 'ROUTER_ACK' ? 'Am Router aktiv' : routerEffect(state.routerControl?.blocklists?.[blocklist.id])}</span>
    </article>
  `).join('') || (canEditRules() ? '<empty-state title="Keine Werbe-Domains im Entwurf" text="Noch keine DNS-Blockliste vorhanden."></empty-state>' : '<empty-state title="Keine bestätigten Werbe-Domains" text="Keine aktuell bestätigte Domain-Liste. Der Adblock-Status wird separat angezeigt."></empty-state>');
}

function renderPresetDeviceOptions() {
  const select = document.getElementById('presetDevice');
  const blocklistSelect = document.getElementById('presetBlocklist');
  const applyPresetSelect = document.getElementById('applyPresetSelect');
  const applyPresetDevice = document.getElementById('applyPresetDevice');
  if (select) {
    select.innerHTML = state.devices.map(device => `<option value="${device.id}">${escapeText(device.hostname || 'Unbekanntes Gerät')}</option>`).join('');
  }
  if (applyPresetDevice) {
    applyPresetDevice.innerHTML = state.devices.map(device => `<option value="${device.id}">${escapeText(device.hostname || 'Unbekanntes Gerät')}</option>`).join('');
  }
  if (applyPresetSelect) {
    applyPresetSelect.innerHTML = state.presets.map(preset => `<option value="${preset.id}">${escapeText(preset.name)}</option>`).join('') || `<option value="">${canEditRules() ? 'Noch keine Vorlage vorhanden' : 'Keine gemeldete Vorlage'}</option>`;
  }
  if (blocklistSelect) {
    blocklistSelect.innerHTML = blocklistOptions();
  }
}

function renderPresets() {
  const list = document.getElementById('presetList');
  if (!list) return;
  if (!state.presets.length) {
    list.innerHTML = canEditRules() ? '<empty-state title="Keine Vorlagen im Entwurf" text="Noch keine Vorlage gespeichert."></empty-state>' : '<empty-state title="Keine gemeldeten Vorlagen" text="Es liegen noch keine Vorlagen mit bestätigter Router-Herkunft vor."></empty-state>';
    return;
  }

  list.innerHTML = state.presets.map(preset => {
    const blocklist = state.blocklists.find(item => Number(item.id) === Number(preset.blocklistId));
    const devices = state.assignments
      .filter(assignment => Number(assignment.presetId) === Number(preset.id))
      .map(assignment => state.devices.find(device => Number(device.id) === Number(assignment.deviceId))?.hostname)
      .filter(Boolean);
    const tags = [
      preset.parentalMode ? 'Kinderschutz' : '',
      preset.priorityMode ? 'Priorität' : '',
      preset.timeLimitMinutes ? `${preset.timeLimitMinutes} min` : '',
      preset.blockedFrom && preset.blockedUntil ? `${preset.blockedFrom}-${preset.blockedUntil}` : ''
    ].filter(Boolean).join(' · ') || 'Basis';

    return `
      <article class="preset-item">
        <div class="preset-main">
          <div class="preset-heading"><strong>${escapeText(preset.name)}</strong><span class="badge">${devices.length} ${canEditRules() ? '' : 'gemeldete '}${devices.length === 1 && canEditRules() ? 'Gerät' : 'Geräte'}</span></div>
          <span class="preset-settings">${escapeText(tags)}</span>
          <span>Blockliste: ${escapeText(blocklist?.name || 'Keine')}</span>
          <span>Zugewiesen: ${escapeText(devices.join(', ') || (canEditRules() ? 'keinem Gerät' : 'Nicht gemeldet'))}</span>
        </div>
      </article>
    `;
  }).join('');
}

function signalQuality(signal) {
  const clamped = Math.min(Math.max(Number(signal), -90), -35);
  return Math.round(((clamped + 90) / 55) * 100);
}

function signalLabel(signal) {
  if (signal >= -55) return 'Sehr stark';
  if (signal >= -67) return 'Stark';
  if (signal >= -75) return 'Okay';
  return 'Schwach';
}

function filteredWifiNetworks() {
  const search = String(document.getElementById('wifiSearch')?.value || '').trim().toLowerCase();
  const filter = document.getElementById('wifiFilter')?.value || 'all';
  return state.wifiNetworks
    .filter(network => filter === 'router' ? network.type === 'router' : filter === 'accessPoint' ? network.type === 'accessPoint' : filter === 'strong' ? network.signal >= -67 : true)
    .filter(network => !search || `${network.ssid} ${network.bssid}`.toLowerCase().includes(search))
    .sort((a, b) => b.signal - a.signal);
}

function renderWifi() {
  const source = document.getElementById('wifiDataSource');
  if (source) source.textContent = state.dataMode === 'demo' ? 'Beispieldaten · kein Live-Scan'
    : state.wifiNetworks.length ? 'WLAN-Messwerte vom Router' : 'Keine WLAN-Messwerte';
  const bestBox = document.getElementById('bestWifiBox');
  const list = document.getElementById('wifiList');
  if (!bestBox || !list) return;

  const networks = filteredWifiNetworks();
  const best = [...state.wifiNetworks].sort((a, b) => b.signal - a.signal)[0];
  bestBox.innerHTML = best ? `
    <div class="wifi-main">
      <strong>Bestes Signal: ${escapeText(best.ssid)}</strong>
      <span>${escapeText(best.type === 'router' ? 'Router' : 'Access Point')} · ${best.signal} dBm · Kanal ${best.channel}</span>
    </div>
    <span class="badge ok">Empfehlung</span>
  ` : '';

  list.innerHTML = networks.map(network => `
    <article class="wifi-item">
      <div class="wifi-main">
        <strong>${escapeText(network.ssid)}</strong>
        <span>${escapeText(network.bssid)} · ${escapeText(network.frequency)} · ${escapeText(network.encryption)}</span>
      </div>
      <div class="wifi-side">
        <span class="badge ${network.signal >= -67 ? 'ok' : network.signal >= -75 ? 'warn' : 'danger'}">${signalLabel(network.signal)}</span>
        <div class="signal-meter" aria-hidden="true"><span style="--signal: ${signalQuality(network.signal)}%"></span></div>
        <span class="muted">${network.signal} dBm · Kanal ${network.channel}</span>
      </div>
    </article>
  `).join('') || (state.wifiNetworks.length
    ? '<empty-state title="Keine Treffer" text="Keine WLAN-Netze entsprechen dem Filter."></empty-state>'
    : '<empty-state title="Keine WLAN-Messwerte" text="Der Router hat keine WLAN-Analyse geliefert."></empty-state>');
}

function renderAll() {
  renderStats();
  renderGroupControls();
  renderGroupDevices();
  renderGroupOverview();
  renderManualDomains();
  renderAdDomains();
  renderPresetDeviceOptions();
  renderPresets();
  renderWifi();
  renderDomainTargets();
  renderPriorityControls();
  updateApplyPresetPreview();
  updateReadOnlyControls();
}

function updateApplyPresetPreview() {
  if (!canEditRules()) {
    document.getElementById('applyPresetPreview').textContent = 'Zuweisungen sind noch nicht vollständig vom Router gemeldet. Keine Änderung möglich.';
    return;
  }
  const preset = state.presets.find(item => Number(item.id) === Number(document.getElementById('applyPresetSelect').value));
  const device = state.devices.find(item => Number(item.id) === Number(document.getElementById('applyPresetDevice').value));
  const current = device ? presetForDevice(device.id) : null;
  document.getElementById('applyPresetPreview').textContent = `${preset?.name || 'Keine Vorlage'} → ${device?.hostname || 'Kein Gerät'}${current && current.id !== preset?.id ? ` · ersetzt „${current.name}“` : ''}${preset?.blockedFrom ? ` · Sperrzeit ${preset.blockedFrom}–${preset.blockedUntil}` : ' · bestehende Internetzeiten bleiben unverändert'}`;
}

function blocklistScope(blocklist) {
  if (blocklist.sourceType === 'NETWORK') return 'Gesamtes Netzwerk';
  if (blocklist.sourceType === 'DNS') return 'Werbefilter · Netzwerk';
  const groups = state.groups.filter(group => Number(group.blocklistId) === Number(blocklist.id)).map(group => group.name);
  const presets = state.presets.filter(preset => Number(preset.blocklistId) === Number(blocklist.id));
  const devices = state.assignments.filter(a => presets.some(p => Number(p.id) === Number(a.presetId)))
    .map(a => state.devices.find(d => Number(d.id) === Number(a.deviceId))?.hostname).filter(Boolean);
  return [...groups.map(name => `Gruppe: ${name}`), ...devices].join(', ') || (state.rulesKnown ? 'Noch nicht zugewiesen' : 'Zuweisung nicht gemeldet');
}

function renderDomainTargets() {
  const scope = document.getElementById('domainScope').value;
  document.getElementById('domainTargetField').hidden = scope === 'network';
  document.getElementById('domainTargetLabel').textContent = scope === 'group' ? 'Gruppe' : 'Gerät';
  const options = scope === 'group' ? state.groups : state.devices;
  document.getElementById('domainTarget').innerHTML = options.map(item => `<option value="${item.id}">${escapeText(item.name || item.hostname)}</option>`).join('');
  updateDomainPreview();
}

function updateDomainPreview() {
  const scope = document.getElementById('domainScope').value;
  const id = Number(document.getElementById('domainTarget').value);
  const group = state.groups.find(item => Number(item.id) === id);
  const device = state.devices.find(item => Number(item.id) === id);
  const target = scope === 'network' ? 'Gesamtes Netzwerk' : scope === 'group' ? group?.name : device?.hostname;
  const count = scope === 'network' ? state.devices.length : scope === 'group' ? devicesForGroup(id).length : device ? 1 : 0;
  const domain = sanitizeDomain(document.getElementById('manualDomainInput').value);
  document.getElementById('domainPreview').textContent = `${domain || 'Website'} → ${target || 'Kein Ziel vorhanden'}`;
  document.getElementById('domainScopeSummary').innerHTML = `<strong>${escapeText(target || 'Kein Ziel vorhanden')}</strong><p>${count} ${count === 1 ? 'Gerät betroffen' : 'Geräte betroffen'}</p><span>${scope === 'network' ? 'Netzwerkweite Regel' : 'Andere Geräte bleiben unverändert'}</span>`;
}

async function saveDeviceProfile(deviceId, changes) {
  const device = state.devices.find(item => Number(item.id) === Number(deviceId));
  if (!device) throw new Error('Kein Gerät ausgewählt');
  const previous = presetForDevice(deviceId);
  const privateProfile = previous?.description === 'Nethera: Geräteeinstellungen' && state.assignments.filter(a => Number(a.presetId) === Number(previous.id)).length === 1;
  // Copy shared presets so a device-specific edit cannot affect other devices.
  const preset = await apiJson(`${SECURITY_API}/presets`, {
    method: 'POST',
    body: JSON.stringify({ ...previous, id: privateProfile ? previous.id : null,
      name: `Geräteprofil · ${device.hostname}`, description: 'Nethera: Geräteeinstellungen', ...changes })
  });
  await apiJson(`${SECURITY_API}/devices/${deviceId}/preset/${preset.id}`, { method: 'PUT' });
  return preset;
}

function renderPriorityControls() {
  const select = document.getElementById('priorityDevice');
  select.innerHTML = state.devices.map(device => `<option value="${device.id}">${escapeText(device.hostname)}</option>`).join('');
  updatePrioritySelection();
  renderPriorityList();
}

function renderPriorityList() {
  const list = document.getElementById('priorityList');
  if (!list) return;
  list.innerHTML = state.devices.map(device => {
    if (!canEditRules() && !presetForDevice(device.id)) {
      return `<div class="priority-row"><span>${escapeText(device.hostname)}</span><span class="badge">Priorität nicht gemeldet</span></div>`;
    }
    const desired = presetForDevice(device.id)?.priorityMode ? 'high' : 'normal';
    const actual = state.routerControl?.priority?.[device.id];
    const confirmed = !state.preview && state.routerControl?.connection === 'online' && actual?.applied === true && actual?.mode === desired;
    return `<div class="priority-row"><span>${escapeText(device.hostname)} · ${desired === 'high' ? 'Bevorzugt' : 'Normal'}</span><span class="badge ${confirmed ? 'ok' : ''}">${state.preview ? 'Lokaler Entwurf' : state.dataMode === 'demo' ? 'Beispiel' : confirmed ? 'Am Router bestätigt' : 'Nur gespeichert'}</span></div>`;
  }).join('');
}

function updatePrioritySelection() {
  const deviceId = Number(document.getElementById('priorityDevice').value);
  const select = document.getElementById('priorityMode');
  select.value = presetForDevice(deviceId)?.priorityMode ? 'high' : 'normal';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  updatePriorityPreview();
}

function updatePriorityPreview() {
  if (!canEditRules()) {
    document.getElementById('priorityPreview').textContent = 'Zuweisungen sind noch nicht vollständig vom Router gemeldet. Keine Änderung möglich.';
    return;
  }
  const device = state.devices.find(item => Number(item.id) === Number(document.getElementById('priorityDevice').value));
  const high = document.getElementById('priorityMode').value === 'high';
  const actual = state.routerControl?.priority?.[device?.id];
  const confirmed = state.routerControl?.connection === 'online' && actual?.applied === true && actual?.mode === (high ? 'high' : 'normal');
  document.getElementById('priorityPreview').textContent = `${device?.hostname || 'Kein Gerät'} · ${high ? 'Bevorzugt bei hoher Netzauslastung' : 'Keine Bevorzugung'} · ${state.preview ? 'Lokaler Entwurf' : state.dataMode === 'demo' ? 'Beispiel' : confirmed ? 'Am Router bestätigt' : 'Routerbestätigung ausstehend'}`;
}

async function savePriority(event) {
  event.preventDefault();
  await saveDeviceProfile(Number(document.getElementById('priorityDevice').value), { priorityMode: document.getElementById('priorityMode').value === 'high' });
  await loadSecurityState();
  setStatus('Gerätepriorität gespeichert. Den Routerstatus siehst du bei der Geräteübersicht.', 'success');
}

let activeRouterConfig = null;
async function loadAdProtection() {
  if (state.preview) {
    const enabled = localDraft?.adblock.enabled ?? state.routerControl?.adblock?.enabled ?? false;
    document.getElementById('adProtectionEnabled').checked = enabled;
    document.getElementById('adProtectionEnabled').disabled = !state.loaded;
    document.getElementById('saveAdProtection').disabled = !state.loaded;
    document.getElementById('saveAdProtection').textContent = 'Im Entwurf speichern';
    return;
  }
  try {
    const router = await NetheraApi.getPrimaryRouter();
    activeRouterConfig = await NetheraApi.getConfiguration(router);
    document.getElementById('adProtectionEnabled').checked = Boolean(activeRouterConfig?.dnsBlocking ?? activeRouterConfig?.dns_blocking);
    const readOnly = router.dataMode !== 'live' || !activeRouterConfig;
    document.getElementById('adProtectionEnabled').disabled = readOnly;
    document.getElementById('saveAdProtection').disabled = readOnly;
    document.getElementById('saveAdProtection').textContent = 'Einstellung speichern';
  } catch {
    activeRouterConfig = null;
    document.getElementById('adProtectionEnabled').checked = false;
    document.getElementById('adProtectionEnabled').disabled = true;
    document.getElementById('saveAdProtection').disabled = true;
    document.getElementById('saveAdProtection').textContent = 'Werbeschutz nicht geladen';
  }
}

async function saveAdProtection(event) {
  event.preventDefault();
  if (state.preview) {
    if (!localDraft || !state.loaded) throw new Error('Lokaler Entwurf nicht geladen.');
    localDraft.setAdblock(document.getElementById('adProtectionEnabled').checked);
    renderDraft();
    setStatus('Werbeschutz lokal gespeichert.', 'success');
    return;
  }
  if (!activeRouterConfig) throw new Error('Router-Einstellung nicht geladen');
  const enabled = document.getElementById('adProtectionEnabled').checked;
  await apiJson(`${API_BASE_URL}/api/configs/${activeRouterConfig.id}`, { method: 'PUT', body: JSON.stringify({ ...activeRouterConfig, dnsBlocking: enabled }) });
  activeRouterConfig.dnsBlocking = enabled;
  await loadRouterControlStatus();
  const actual = state.routerControl?.adblock;
  const confirmed = state.routerControl?.connection === 'online' && actual?.applied === true && actual?.enabled === enabled;
  setStatus(`Werbeschutz-Einstellung gespeichert. ${confirmed ? 'Am Router bestätigt.' : 'Routerbestätigung für diese Einstellung ausstehend.'}`, 'success');
}

async function applyPresetToDevice(deviceId, preset) {
  if (preset.blockedFrom && preset.blockedUntil) {
    const current = state.timeLimits.find(item => Number(item.deviceId) === Number(deviceId));
    await apiJson(`${API_BASE_URL}/api/device-time-limits/${deviceId}`, { method: 'PUT', body: JSON.stringify({
      deviceId, dailyLimitMinutes: preset.timeLimitMinutes || 0, blockedFrom: preset.blockedFrom,
      blockedUntil: preset.blockedUntil, usedMinutesToday: current?.usedMinutesToday || 0,
      status: 'active', note: `Preset: ${preset.name}`
    }) });
  }
  await apiJson(`${SECURITY_API}/devices/${deviceId}/preset/${preset.id}`, { method: 'PUT' });
}

async function addGroup(event) {
  event.preventDefault();
  const input = document.getElementById('groupNameInput');
  const name = input.value.trim();
  if (!name) return setStatus('Bitte Gruppennamen eingeben.', 'error');
  await apiJson(`${SECURITY_API}/groups`, {
    method: 'POST',
    body: JSON.stringify({ name, description: 'Manuell angelegt', color: '#2fb09a' })
  });
  input.value = '';
  await loadSecurityState();
  setStatus(`Gruppe "${name}" gespeichert.`, 'success');
}

async function saveGroupBlocklist(event) {
  event.preventDefault();
  const groupId = Number(document.getElementById('groupBlocklistSelect').value);
  const group = state.groups.find(item => Number(item.id) === groupId);
  if (!group) return setStatus('Bitte Gruppe wählen.', 'error');

  const domainInput = document.getElementById('groupDomainInput').value.trim();
  const domain = sanitizeDomain(domainInput);
  if (domainInput && !domain) return setStatus('Bitte eine gültige Website-Adresse eingeben, z. B. youtube.com.', 'error');
  const existing = state.blocklists.find(item => Number(item.id) === Number(group.blocklistId));
  const existingDomains = blocklistDomains(existing).filter(item => !['gambling', 'adult', 'social'].includes(item));
  const parts = [
    document.getElementById('groupPkgGambling').checked ? 'gambling' : '',
    document.getElementById('groupPkgAdult').checked ? 'adult' : '',
    document.getElementById('groupPkgSocial').checked ? 'social' : '',
    ...existingDomains, domain
  ].filter(Boolean);

  const blocklist = await apiJson(`${SECURITY_API}/blocklists`, {
    method: 'POST',
    body: JSON.stringify({
      id: null,
      name: `${group.name} Blockliste`,
      sourceType: 'GROUP',
      urlPattern: [...new Set(parts)].join('|')
    })
  });

  await apiJson(`${SECURITY_API}/groups`, {
    method: 'POST',
    body: JSON.stringify({ ...group, blocklistId: blocklist.id })
  });

  document.getElementById('groupDomainInput').value = '';
  await loadSecurityState();
  setStatus(`Regeln für "${group.name}" gespeichert.`, 'success');
}

async function saveGroupName(groupId) {
  const group = state.groups.find(item => Number(item.id) === Number(groupId));
  const input = document.querySelector(`[data-group-name="${groupId}"]`);
  if (!group || !input) return;
  const name = input.value.trim();
  if (!name) return setStatus('Bitte Gruppennamen eingeben.', 'error');
  await apiJson(`${SECURITY_API}/groups`, {
    method: 'POST',
    body: JSON.stringify({ ...group, name })
  });
  await loadSecurityState();
  setStatus(`Gruppe "${name}" gespeichert.`, 'success');
}

async function saveGroupBlocklistSelection(groupId, blocklistId) {
  const group = state.groups.find(item => Number(item.id) === Number(groupId));
  if (!group) return;
  await apiJson(`${SECURITY_API}/groups`, {
    method: 'POST',
    body: JSON.stringify({ ...group, blocklistId: Number(blocklistId) || null })
  });
  await loadSecurityState();
  setStatus(`Blocklist für "${group.name}" gespeichert.`, 'success');
}

async function addManualDomain(event) {
  event.preventDefault();
  const input = document.getElementById('manualDomainInput');
  const domain = sanitizeDomain(input.value);
  if (!domain) return setStatus('Keine gültige Website-Adresse. Beispiel: youtube.com', 'error');
  const scope = document.getElementById('domainScope').value;
  const targetId = Number(document.getElementById('domainTarget').value);
  const group = state.groups.find(item => Number(item.id) === targetId);
  const device = state.devices.find(item => Number(item.id) === targetId);
  if (scope === 'group' && !group || scope === 'device' && !device) throw new Error('Kein Ziel ausgewählt');
  const preset = scope === 'device' ? presetForDevice(targetId) : null;
  const previous = scope === 'network' ? state.blocklists.find(item => item.sourceType === 'NETWORK')
    : state.blocklists.find(item => Number(item.id) === Number(scope === 'group' ? group.blocklistId : preset?.blocklistId));
  if (blocklistDomains(previous).includes(domain)) return setStatus(`${domain} steht bereits in dieser Blockliste.`, 'info');
  const target = scope === 'network' ? 'Gesamtes Netzwerk' : scope === 'group' ? group.name : device.hostname;
  const blocklist = await apiJson(`${SECURITY_API}/blocklists`, {
    method: 'POST',
    body: JSON.stringify({ id: scope === 'network' ? previous?.id : null,
      name: `Websites · ${target}`, sourceType: scope === 'network' ? 'NETWORK' : scope === 'group' ? 'GROUP' : 'DEVICE',
      urlPattern: [...new Set([...blocklistDomains(previous), domain])].join('|') })
  });
  if (scope === 'group') await apiJson(`${SECURITY_API}/groups`, { method: 'POST', body: JSON.stringify({ ...group, blocklistId: blocklist.id }) });
  if (scope === 'device') await saveDeviceProfile(targetId, { blocklistId: blocklist.id });
  input.value = '';
  await loadSecurityState();
  setStatus(`${domain} · ${target}: Sperrregel gespeichert. Router-Anwendung ausstehend.`, 'success');
}

async function addAdDomain(event) {
  event.preventDefault();
  const input = document.getElementById('adDomainInput');
  const domain = sanitizeDomain(input.value);
  if (!domain) return setStatus('Bitte eine gültige Werbe-Domain eingeben.', 'error');
  const dns = state.blocklists.find(item => item.sourceType === 'DNS');
  if (blocklistDomains(dns).includes(domain)) return setStatus(`${domain} steht bereits im Werbefilter.`, 'info');
  const domains = [...new Set([...blocklistDomains(dns), domain])];
  await apiJson(`${SECURITY_API}/blocklists`, {
    method: 'POST',
    body: JSON.stringify({ id: dns?.id, name: dns?.name || 'Werbung & Tracker', sourceType: 'DNS', urlPattern: domains.join('|') })
  });
  input.value = '';
  await loadSecurityState();
  setStatus(`${domain} zum Werbefilter hinzugefügt. Routerwirkung noch nicht bestätigt.`, 'success');
}

async function updateBlocklistDomain(blocklistId, previousDomain, nextValue) {
  const blocklist = state.blocklists.find(item => Number(item.id) === Number(blocklistId));
  if (!blocklist) throw new Error('Blockliste nicht gefunden');
  const nextDomain = sanitizeDomain(nextValue);
  if (!nextDomain) throw new Error('Bitte eine gültige Website-Adresse eingeben.');
  const domains = blocklistDomains(blocklist);
  if (!domains.includes(previousDomain)) throw new Error('Eintrag nicht mehr vorhanden. Bitte neu laden.');
  if (nextDomain !== previousDomain && domains.includes(nextDomain)) throw new Error('Die Domain steht bereits in dieser Blockliste.');
  if (nextDomain === previousDomain) return false;
  await apiJson(`${SECURITY_API}/blocklists`, { method: 'POST', body: JSON.stringify({ ...blocklist,
    urlPattern: domains.map(domain => domain === previousDomain ? nextDomain : domain).join('|') }) });
  await loadSecurityState();
  return true;
}

async function createPreset(event) {
  event.preventDefault();
  const name = document.getElementById('presetName').value.trim();
  const deviceId = Number(document.getElementById('presetDevice').value);
  if (!name) return setStatus('Bitte einen Namen für die Vorlage eingeben.', 'error');
  if (!deviceId) return setStatus('Bitte Gerät wählen.', 'error');
  const schedule = document.getElementById('presetTimeLimit').checked;
  const from = document.getElementById('presetFrom').value;
  const until = document.getElementById('presetUntil').value;
  if (schedule && (!from || !until || from === until)) return setStatus('Bitte unterschiedliche Start- und Endzeiten wählen.', 'error');

  const preset = await apiJson(`${SECURITY_API}/presets`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      description: 'Manuell erstellt',
      blocklistId: Number(document.getElementById('presetBlocklist')?.value || 0) || null,
      timeLimitMinutes: schedule ? Number(document.getElementById('presetDaily').value) : null,
      blockedFrom: schedule ? from : null,
      blockedUntil: schedule ? until : null,
      parentalMode: document.getElementById('presetParental').checked,
      priorityMode: document.getElementById('presetPriority').checked
    })
  });
  await applyPresetToDevice(deviceId, preset);
  document.getElementById('presetName').value = '';
  await loadSecurityState();
  setStatus(`Vorlage "${name}" gespeichert und zugewiesen.`, 'success');
}

async function applyExistingPreset(event) {
  event.preventDefault();
  const presetId = Number(document.getElementById('applyPresetSelect')?.value);
  const deviceId = Number(document.getElementById('applyPresetDevice')?.value);
  const preset = state.presets.find(item => Number(item.id) === presetId);
  const device = state.devices.find(item => Number(item.id) === deviceId);
  if (!presetId || !preset) return setStatus('Bitte zuerst eine Vorlage auswählen.', 'error');
  if (!deviceId || !device) return setStatus('Bitte ein Gerät auswählen.', 'error');

  await applyPresetToDevice(deviceId, preset);
  await loadSecurityState();
  setStatus(`"${preset.name}" wurde "${device.hostname || 'Gerät'}" zugewiesen. Router-Anwendung ausstehend.`, 'success');
}

function setupTabs() {
  const tabs = [...document.querySelectorAll('.security-tabs button')];
  const activate = selected => {
    tabs.forEach(button => {
      const active = button === selected;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      const panel = document.getElementById(`tab-${button.dataset.tab}`);
      panel?.classList.toggle('active', active);
      if (panel) panel.hidden = !active;
    });
  };
  tabs.forEach((button, index) => {
    button.id = `section-${button.dataset.tab}`;
    button.setAttribute('aria-controls', `tab-${button.dataset.tab}`);
    const panel = document.getElementById(`tab-${button.dataset.tab}`);
    panel?.setAttribute('role', 'tabpanel');
    panel?.setAttribute('aria-labelledby', button.id);
    button.addEventListener('click', () => activate(button));
    button.addEventListener('keydown', event => {
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : event.key === 'ArrowRight' ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : null;
      if (target == null) return;
      event.preventDefault(); activate(tabs[target]); tabs[target].focus();
    });
  });
  activate(tabs.find(button => button.classList.contains('active')) || tabs[0]);
  window.lucide?.createIcons({ attrs: { 'aria-hidden': 'true', 'stroke-width': 1.8 } });
}

function setupEvents() {
  setupTabs();
  document.getElementById('groupDeviceSearch').addEventListener('input', renderGroupDevices);
  document.querySelectorAll('[data-group-view]').forEach(button => button.addEventListener('click', () => {
    const devices = button.dataset.groupView === 'devices';
    document.getElementById('group-devices-panel').hidden = !devices;
    document.getElementById('group-management-panel').hidden = devices;
    document.querySelectorAll('[data-group-view]').forEach(item => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
  }));
  document.querySelector('app-hero')?.addEventListener('hero-click', async () => { await loadSecurityState(true); await loadAdProtection(); });
  document.getElementById('discardDraft')?.addEventListener('click', () => discardDraft().catch(error => setStatus(error.message, 'error')));
  document.getElementById('refreshRouterControl')?.addEventListener('click', loadRouterControlStatus);
  document.getElementById('installAdblock')?.addEventListener('click', requestAdblockInstallation);
  const forms = { groupForm: addGroup, groupBlocklistForm: saveGroupBlocklist, manualDomainForm: addManualDomain,
    adDomainForm: addAdDomain, presetForm: createPreset, applyPresetForm: applyExistingPreset,
    priorityForm: savePriority, adProtectionForm: saveAdProtection };
  Object.entries(forms).forEach(([id, handler]) => {
    document.getElementById(id).addEventListener('submit', async event => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('[type="submit"]');
      button.disabled = true;
      try { await handler(event); }
      catch (error) { setStatus(`Änderung nicht vollständig gespeichert: ${error.message}. Bitte neu laden und prüfen.`, 'error'); }
      finally { button.disabled = state.preview ? !state.loaded : !NetheraApi.isLive(); }
    });
  });
  document.getElementById('groupBlocklistSelect')?.addEventListener('change', renderGroupBlocklistForm);
  document.getElementById('domainScope').addEventListener('change', renderDomainTargets);
  document.getElementById('domainTarget').addEventListener('change', updateDomainPreview);
  document.getElementById('manualDomainInput').addEventListener('input', updateDomainPreview);
  document.getElementById('priorityDevice').addEventListener('change', updatePrioritySelection);
  document.getElementById('priorityMode').addEventListener('change', updatePriorityPreview);
  document.getElementById('presetTimeLimit').addEventListener('change', event => { document.getElementById('presetSchedule').hidden = !event.target.checked; });
  document.getElementById('applyPresetSelect').addEventListener('change', updateApplyPresetPreview);
  document.getElementById('applyPresetDevice').addEventListener('change', updateApplyPresetPreview);
  document.getElementById('wifiSearch')?.addEventListener('input', renderWifi);
  document.getElementById('wifiFilter')?.addEventListener('change', renderWifi);

  document.addEventListener('change', async event => {
    try {
    const groupBlocklistSelect = event.target.closest('[data-group-blocklist]');
    if (groupBlocklistSelect) {
      await saveGroupBlocklistSelection(Number(groupBlocklistSelect.dataset.groupBlocklist), Number(groupBlocklistSelect.value));
      return;
    }

    const groupSelect = event.target.closest('[data-device-group]');
    if (groupSelect) {
      const deviceId = Number(groupSelect.dataset.deviceGroup);
      const groupId = Number(groupSelect.value);
      if (state.preview) {
        localDraft.assignGroup(draftBase, deviceId, groupId || null);
        useDraft();
        return setStatus('Gerätegruppe lokal gespeichert.', 'success');
      }
      const oldGroup = groupForDevice(deviceId);
      if (oldGroup) await apiJson(`${SECURITY_API}/groups/${oldGroup.id}/members/${deviceId}`, { method: 'DELETE' });
      if (groupId) await apiJson(`${SECURITY_API}/groups/${groupId}/members/${deviceId}`, { method: 'PUT' });
      await loadSecurityState();
      return setStatus('Gerätegruppe gespeichert.', 'success');
    }

    const presetSelect = event.target.closest('[data-device-preset]');
    if (presetSelect) {
      const deviceId = Number(presetSelect.dataset.devicePreset);
      const presetId = Number(presetSelect.value);
      if (presetId) {
        await applyPresetToDevice(deviceId, state.presets.find(item => Number(item.id) === presetId));
      } else {
        await apiJson(`${SECURITY_API}/devices/${deviceId}/preset`, { method: 'DELETE' });
      }
      await loadSecurityState();
      return setStatus('Gerätevorlage gespeichert.', 'success');
    }
    } catch (error) {
      setStatus(`Änderung nicht vollständig gespeichert: ${error.message}. Bitte neu laden und prüfen.`, 'error');
    }
  });

  document.addEventListener('click', event => {
    const edit = event.target.closest('[data-edit-domain]');
    if (edit) {
      const row = edit.closest('[data-domain-row]');
      row.innerHTML = `<label class="field domain-edit-field"><span>Website-Adresse</span><input type="text" value="${escapeText(edit.dataset.editDomain)}" data-domain-input autocomplete="off"></label><div class="domain-actions"><button class="small-btn" type="button" data-update-domain="${escapeText(edit.dataset.editDomain)}" data-blocklist="${edit.dataset.blocklist}">Speichern</button><button class="small-btn ghost" type="button" data-cancel-domain>Abbrechen</button></div>`;
      row.querySelector('[data-domain-input]').focus();
      return;
    }
    if (event.target.closest('[data-cancel-domain]')) {
      renderManualDomains();
      return;
    }
    const update = event.target.closest('[data-update-domain]');
    if (update) {
      const input = update.closest('[data-domain-row]').querySelector('[data-domain-input]');
      update.disabled = true;
      updateBlocklistDomain(Number(update.dataset.blocklist), update.dataset.updateDomain, input.value)
        .then(changed => {
          if (!changed) renderManualDomains();
          setStatus(changed ? 'Sperrlisten-Eintrag gespeichert. Routerwirkung noch nicht bestätigt.' : 'Keine Änderung an der Domain.', changed ? 'success' : 'info');
        })
        .catch(error => { update.disabled = false; setStatus(error.message, 'error'); });
      return;
    }
    const remove = event.target.closest('[data-remove-domain]');
    if (remove) {
      const blocklist = state.blocklists.find(item => Number(item.id) === Number(remove.dataset.blocklist));
      remove.disabled = true;
      apiJson(`${SECURITY_API}/blocklists`, { method: 'POST', body: JSON.stringify({ ...blocklist,
        urlPattern: blocklistDomains(blocklist).filter(domain => domain !== remove.dataset.removeDomain).join('|') }) })
        .then(loadSecurityState)
        .then(() => setStatus('Eintrag aus der Blockliste entfernt. Routerwirkung noch nicht bestätigt.', 'success'))
        .catch(error => { remove.disabled = false; setStatus(`Nicht entfernt: ${error.message}`, 'error'); });
    }
    const saveButton = event.target.closest('[data-save-group]');
    if (saveButton) {
      saveGroupName(Number(saveButton.dataset.saveGroup)).catch(error => setStatus(`Gruppe konnte nicht gespeichert werden: ${error.message}`, 'error'));
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  setupEvents();
  await loadSecurityState();
  await loadAdProtection();
  NetheraApi.watchSource(async () => { await loadSecurityState(true); await loadAdProtection(); });
});
