const appConfig = window.NETHERA_CONFIG || {};
const API_BASE_URL = appConfig.API_BASE_URL || 'http://localhost:8083';
const SECURITY_API = `${API_BASE_URL}/api/security`;

const state = {
  devices: [],
  groups: [],
  members: [],
  blocklists: [],
  presets: [],
  assignments: [],
  timeLimits: [],
  wifiNetworks: [
    { ssid: 'Nethera', bssid: 'A4:20:11:8C:90:01', type: 'router', signal: -48, channel: 6, frequency: '2.4 GHz', encryption: 'WPA3', known: true },
    { ssid: 'Nethera-5G', bssid: 'A4:20:11:8C:90:02', type: 'accessPoint', signal: -56, channel: 44, frequency: '5 GHz', encryption: 'WPA3', known: true },
    { ssid: 'HTL-Gast', bssid: 'D0:C1:23:44:81:10', type: 'accessPoint', signal: -70, channel: 11, frequency: '2.4 GHz', encryption: 'WPA2', known: false },
    { ssid: 'Nachbar-WLAN', bssid: '74:83:C2:13:AA:90', type: 'router', signal: -78, channel: 1, frequency: '2.4 GHz', encryption: 'WPA2', known: false }
  ]
};

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
  const status = document.getElementById('statusBox');
  status?.setAttribute('text', text);
  status?.setAttribute('state', tone);
}

async function apiJson(url, options = {}) {
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

async function loadSecurityState() {
  try {
    const data = await apiJson(`${SECURITY_API}/state`);
    Object.assign(state, {
      devices: data.devices || [],
      groups: data.groups || [],
      members: data.members || [],
      blocklists: data.blocklists || [],
      presets: data.presets || [],
      assignments: data.assignments || [],
      timeLimits: data.timeLimits || []
    });
    renderAll();
    setStatus('Daten aus der Datenbank geladen.', 'success');
  } catch (error) {
    renderAll();
    setStatus('Backend nicht erreichbar. Starte Docker und lade neu.', 'error');
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
    '<option value="">Keine Gruppe</option>',
    ...state.groups.map(group => `<option value="${group.id}" ${Number(group.id) === Number(selectedId) ? 'selected' : ''}>${escapeText(group.name)}</option>`)
  ].join('');
}

function presetOptions(selectedId = '') {
  return [
    '<option value="">Kein Preset</option>',
    ...state.presets.map(preset => `<option value="${preset.id}" ${Number(preset.id) === Number(selectedId) ? 'selected' : ''}>${escapeText(preset.name)}</option>`)
  ].join('');
}

function blocklistOptions(selectedId = '') {
  return [
    '<option value="">Keine Blockliste</option>',
    ...state.blocklists.map(blocklist => `<option value="${blocklist.id}" ${Number(blocklist.id) === Number(selectedId) ? 'selected' : ''}>${escapeText(blocklist.name)}</option>`)
  ].join('');
}

function renderStats() {
  const assignedPresets = state.assignments.filter(item => item.status === 'active').length;
  const domainCount = state.blocklists.reduce((sum, blocklist) => sum + blocklistDomains(blocklist).length, 0);
  document.getElementById('statPackages')?.setAttribute('value', String(state.blocklists.length));
  document.getElementById('statManual')?.setAttribute('value', String(domainCount));
  document.getElementById('statAds')?.setAttribute('value', String(blocklistDomains(state.blocklists.find(item => item.sourceType === 'DNS')).length));
  document.getElementById('statPresets')?.setAttribute('value', String(assignedPresets));
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
    list.innerHTML = '<empty-state title="Keine Geräte" text="Keine Geräte in der Datenbank gefunden."></empty-state>';
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
    const presetState = preset ? (assignment?.status === 'paused' ? 'Pausiert' : 'Aktiv') : 'Kein Preset';
    const presetClass = preset ? (assignment?.status === 'paused' ? 'warn' : 'ok') : '';
    return `
      <article class="device-group-item">
        <div class="device-group-main">
          <div class="device-title-row">
            <strong>${escapeText(device.hostname || 'Unbekanntes Gerät')}</strong>
            <span class="badge ${presetClass}">${escapeText(presetState)}</span>
          </div>
          <span>${escapeText(device.ipAddress || 'Keine IP')} · ${escapeText(device.connectionType || 'unbekannt')} · Gruppe: ${escapeText(group?.name || 'Keine')}</span>
          <span class="preset-line">Preset: <b>${escapeText(preset?.name || 'Keines')}</b> · ${ruleCount} Regeln · Priorität: ${preset?.priorityMode ? 'Bevorzugt' : 'Normal'}</span>
        </div>
        <div class="device-group-actions">
          <label><span>Gruppe</span><select aria-label="Gruppe für ${escapeText(device.hostname)}" data-device-group="${device.id}">${groupOptions(group?.id)}</select></label>
          <label><span>Preset</span><select aria-label="Preset für ${escapeText(device.hostname)}" data-device-preset="${device.id}">${presetOptions(preset?.id)}</select></label>
        </div>
      </article>
    `;
  }).join('') || '<empty-state title="Keine passenden Geräte" text="Keine Treffer für diese Suche."></empty-state>';
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
    list.innerHTML = '<empty-state title="Keine Gruppen" text="Lege zuerst eine Gruppe an."></empty-state>';
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
          <span class="badge ok">${devices.length} Geräte</span>
          <span class="badge">${rules.length} Regeln</span>
          <span class="muted">${escapeText(devices.map(device => device.hostname).filter(Boolean).join(', ') || 'Noch keine Geräte')}</span>
        </div>
      </article>
    `;
  }).join('');
}

function renderManualDomains() {
  const list = document.getElementById('manualDomainsList');
  if (!list) return;
  if (!state.blocklists.length) {
    list.innerHTML = '<empty-state title="Keine Blocklisten" text="Erstelle eine Domain-Regel, um sie in der Datenbank zu speichern."></empty-state>';
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
          <div class="domain-entries">${domains.map(domain => `<div class="priority-row"><span>${escapeText(({adult:'18+ Inhalte',gambling:'Glücksspiele',social:'Social Media',violence:'Gewalt'})[domain] || domain)}</span><button class="small-btn ghost" type="button" data-remove-domain="${escapeText(domain)}" data-blocklist="${blocklist.id}" aria-label="${escapeText(domain)} aus ${escapeText(blocklist.name)} entfernen">Entfernen</button></div>`).join('') || '<span>Keine Einträge</span>'}</div>
        </div>
        <span class="badge">Gespeichert</span>
      </article>
    `;
  }).join('');
}

function renderAdDomains() {
  const list = document.getElementById('adDomainsList');
  if (!list) return;
  const dns = state.blocklists.find(item => item.sourceType === 'DNS');
  const domains = blocklistDomains(dns);
  list.innerHTML = domains.map((domain, index) => `
    <article class="rule-item">
      <div class="rule-main">
        <strong>${escapeText(domain)}</strong>
        <span>In der Werbefilter-Liste gespeichert</span>
      </div>
      <span class="badge danger">Adblock</span>
    </article>
  `).join('') || '<empty-state title="Keine Werbe-Domains" text="Noch keine DNS-Blockliste vorhanden."></empty-state>';
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
    applyPresetSelect.innerHTML = state.presets.map(preset => `<option value="${preset.id}">${escapeText(preset.name)}</option>`).join('') || '<option value="">Noch kein Preset vorhanden</option>';
  }
  if (blocklistSelect) {
    blocklistSelect.innerHTML = blocklistOptions();
  }
}

function renderPresets() {
  const list = document.getElementById('presetList');
  if (!list) return;
  if (!state.presets.length) {
    list.innerHTML = '<empty-state title="Keine Presets" text="Erstelle links ein Preset und weise es einem Gerät zu."></empty-state>';
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
          <strong>${escapeText(preset.name)}</strong>
          <span>${escapeText(tags)} · Blockliste: ${escapeText(blocklist?.name || 'Keine')}</span>
          <span>Zugewiesen: ${escapeText(devices.join(', ') || 'keinem Gerät')}</span>
        </div>
        <span class="badge ok">${devices.length} ${devices.length === 1 ? 'Gerät' : 'Geräte'}</span>
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
  `).join('') || '<empty-state title="Keine Netzwerke" text="Passe Suche oder Filter an."></empty-state>';
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
}

function updateApplyPresetPreview() {
  const preset = state.presets.find(item => Number(item.id) === Number(document.getElementById('applyPresetSelect').value));
  const device = state.devices.find(item => Number(item.id) === Number(document.getElementById('applyPresetDevice').value));
  const current = device ? presetForDevice(device.id) : null;
  document.getElementById('applyPresetPreview').textContent = `${preset?.name || 'Kein Preset'} → ${device?.hostname || 'Kein Gerät'}${current ? ` · ersetzt „${current.name}“` : ''}${preset?.blockedFrom ? ` · Sperrzeit ${preset.blockedFrom}–${preset.blockedUntil}` : ' · bestehende Internetzeiten bleiben unverändert'}`;
}

function blocklistScope(blocklist) {
  if (blocklist.sourceType === 'NETWORK') return 'Gesamtes Netzwerk';
  if (blocklist.sourceType === 'DNS') return 'Werbefilter · Netzwerk';
  const groups = state.groups.filter(group => Number(group.blocklistId) === Number(blocklist.id)).map(group => group.name);
  const presets = state.presets.filter(preset => Number(preset.blocklistId) === Number(blocklist.id));
  const devices = state.assignments.filter(a => presets.some(p => Number(p.id) === Number(a.presetId)))
    .map(a => state.devices.find(d => Number(d.id) === Number(a.deviceId))?.hostname).filter(Boolean);
  return [...groups.map(name => `Gruppe: ${name}`), ...devices].join(', ') || 'Noch nicht zugewiesen';
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
  document.getElementById('priorityList').innerHTML = state.devices.map(device => `<div class="priority-row"><span>${escapeText(device.hostname)}</span><span class="badge ${presetForDevice(device.id)?.priorityMode ? 'ok' : ''}">${presetForDevice(device.id)?.priorityMode ? 'Bevorzugt' : 'Normal'}</span></div>`).join('');
}

function updatePrioritySelection() {
  const deviceId = Number(document.getElementById('priorityDevice').value);
  const select = document.getElementById('priorityMode');
  select.value = presetForDevice(deviceId)?.priorityMode ? 'high' : 'normal';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  updatePriorityPreview();
}

function updatePriorityPreview() {
  const device = state.devices.find(item => Number(item.id) === Number(document.getElementById('priorityDevice').value));
  const high = document.getElementById('priorityMode').value === 'high';
  document.getElementById('priorityPreview').textContent = `${device?.hostname || 'Kein Gerät'} · ${high ? 'Bevorzugt bei hoher Netzauslastung' : 'Keine Bevorzugung'} · Router-Anwendung ausstehend`;
}

async function savePriority(event) {
  event.preventDefault();
  await saveDeviceProfile(Number(document.getElementById('priorityDevice').value), { priorityMode: document.getElementById('priorityMode').value === 'high' });
  await loadSecurityState();
  setStatus('Gerätepriorität gespeichert. Router-Anwendung ausstehend.', 'success');
}

let activeRouterConfig = null;
async function loadAdProtection() {
  try {
    const configs = await apiJson(`${API_BASE_URL}/api/configs/list`);
    activeRouterConfig = configs[0] || null;
    if (!activeRouterConfig) return;
    document.getElementById('adProtectionEnabled').checked = Boolean(activeRouterConfig.dnsBlocking ?? activeRouterConfig.dns_blocking);
    document.getElementById('adProtectionEnabled').disabled = false;
    document.getElementById('saveAdProtection').disabled = false;
  } catch {
    document.getElementById('saveAdProtection').textContent = 'Werbeschutz nicht geladen';
  }
}

async function saveAdProtection(event) {
  event.preventDefault();
  if (!activeRouterConfig) throw new Error('Router-Einstellung nicht geladen');
  const enabled = document.getElementById('adProtectionEnabled').checked;
  await apiJson(`${API_BASE_URL}/api/configs/${activeRouterConfig.id}`, { method: 'PUT', body: JSON.stringify({ ...activeRouterConfig, dnsBlocking: enabled }) });
  activeRouterConfig.dnsBlocking = enabled;
  setStatus(`Werbeschutz ${enabled ? 'eingeschaltet' : 'ausgeschaltet'} gespeichert. Router-Anwendung ausstehend.`, 'success');
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
      routerId: 1,
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
  const target = scope === 'network' ? 'Gesamtes Netzwerk' : scope === 'group' ? group.name : device.hostname;
  const blocklist = await apiJson(`${SECURITY_API}/blocklists`, {
    method: 'POST',
    body: JSON.stringify({ id: scope === 'network' ? previous?.id : null, routerId: previous?.routerId || 1,
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
  const domains = [...new Set([...blocklistDomains(dns), domain])];
  await apiJson(`${SECURITY_API}/blocklists`, {
    method: 'POST',
    body: JSON.stringify({ id: dns?.id, routerId: 1, name: dns?.name || 'Werbung & Tracker', sourceType: 'DNS', urlPattern: domains.join('|') })
  });
  input.value = '';
  await loadSecurityState();
  setStatus(`${domain} zum Werbeschutz hinzugefügt.`, 'success');
}

async function createPreset(event) {
  event.preventDefault();
  const name = document.getElementById('presetName').value.trim();
  const deviceId = Number(document.getElementById('presetDevice').value);
  if (!name) return setStatus('Bitte Preset-Namen eingeben.', 'error');
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
  setStatus(`Preset "${name}" gespeichert und zugewiesen.`, 'success');
}

async function applyExistingPreset(event) {
  event.preventDefault();
  const presetId = Number(document.getElementById('applyPresetSelect')?.value);
  const deviceId = Number(document.getElementById('applyPresetDevice')?.value);
  const preset = state.presets.find(item => Number(item.id) === presetId);
  const device = state.devices.find(item => Number(item.id) === deviceId);
  if (!presetId || !preset) return setStatus('Bitte zuerst ein Preset auswählen.', 'error');
  if (!deviceId || !device) return setStatus('Bitte ein Gerät auswählen.', 'error');

  await applyPresetToDevice(deviceId, preset);
  await loadSecurityState();
  setStatus(`"${preset.name}" wurde "${device.hostname || 'Gerät'}" zugewiesen. Router-Anwendung ausstehend.`, 'success');
}

function setupTabs() {
  document.querySelectorAll('.security-tabs button').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.security-tabs button').forEach(item => item.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
      button.classList.add('active');
      document.getElementById(`tab-${button.dataset.tab}`)?.classList.add('active');
    });
  });
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
  document.querySelector('app-hero')?.addEventListener('hero-click', async () => { await loadSecurityState(); await loadAdProtection(); });
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
      finally { button.disabled = false; }
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
      return setStatus('Geräte-Preset gespeichert.', 'success');
    }
    } catch (error) {
      setStatus(`Änderung nicht vollständig gespeichert: ${error.message}. Bitte neu laden und prüfen.`, 'error');
    }
  });

  document.addEventListener('click', event => {
    const remove = event.target.closest('[data-remove-domain]');
    if (remove) {
      const blocklist = state.blocklists.find(item => Number(item.id) === Number(remove.dataset.blocklist));
      remove.disabled = true;
      apiJson(`${SECURITY_API}/blocklists`, { method: 'POST', body: JSON.stringify({ ...blocklist,
        urlPattern: blocklistDomains(blocklist).filter(domain => domain !== remove.dataset.removeDomain).join('|') }) })
        .then(loadSecurityState)
        .then(() => setStatus('Eintrag aus der Blockliste entfernt.', 'success'))
        .catch(error => { remove.disabled = false; setStatus(`Nicht entfernt: ${error.message}`, 'error'); });
    }
    const saveButton = event.target.closest('[data-save-group]');
    if (saveButton) {
      saveGroupName(Number(saveButton.dataset.saveGroup)).catch(error => setStatus(`Gruppe konnte nicht gespeichert werden: ${error.message}`, 'error'));
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupEvents();
  loadSecurityState();
  loadAdProtection();
});
