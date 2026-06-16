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
  return String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
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
  if (adPercent) adPercent.textContent = `${Math.min(98, 64 + domainCount * 2)}%`;
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
  const packages = packageNames(blocklist);
  document.getElementById('groupPkgGambling').checked = packages.includes('Glücksspiel');
  document.getElementById('groupPkgAdult').checked = packages.includes('18+');
  document.getElementById('groupPkgSocial').checked = packages.includes('Social');
}

function renderGroupDevices() {
  const list = document.getElementById('groupDeviceList');
  if (!list) return;
  if (!state.devices.length) {
    list.innerHTML = '<empty-state title="Keine Geräte" text="Keine Geräte in der Datenbank gefunden."></empty-state>';
    return;
  }

  list.innerHTML = state.devices.map(device => {
    const group = groupForDevice(device.id);
    const preset = presetForDevice(device.id);
    const assignment = assignmentForDevice(device.id);
    const groupBlocklist = state.blocklists.find(item => Number(item.id) === Number(group?.blocklistId));
    const presetBlocklist = state.blocklists.find(item => Number(item.id) === Number(preset?.blocklistId));
    const ruleCount = blocklistDomains(groupBlocklist).length + blocklistDomains(presetBlocklist).length;
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
          <span class="preset-line">Aktives Preset: <b>${escapeText(preset?.name || 'Keines')}</b> · ${ruleCount} Regeln</span>
        </div>
        <div class="device-group-actions">
          <label><span>Gruppe</span><select aria-label="Gruppe wählen" data-device-group="${device.id}">${groupOptions(group?.id)}</select></label>
          <label><span>Preset</span><select aria-label="Preset wählen" data-device-preset="${device.id}">${presetOptions(preset?.id)}</select></label>
        </div>
      </article>
    `;
  }).join('');
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
          <span>${escapeText(blocklist.sourceType || 'CUSTOM')} · ${domains.length} Domains${tags.length ? ` · ${escapeText(tags.join(', '))}` : ''}</span>
          <span>${escapeText(domains.slice(0, 5).join(', ') || 'Noch keine Domains')}</span>
        </div>
        <span class="badge">${escapeText(blocklist.sourceType || 'CUSTOM')}</span>
      </article>
    `;
  }).join('');
}

function renderAdDomains() {
  const list = document.getElementById('adDomainsList');
  if (!list) return;
  const dns = state.blocklists.find(item => item.sourceType === 'DNS') || state.blocklists[0];
  const domains = blocklistDomains(dns);
  list.innerHTML = domains.map((domain, index) => `
    <article class="rule-item">
      <div class="rule-main">
        <strong>${escapeText(domain)}</strong>
        <span>Blockiert vor ${index * 7 + 2} min</span>
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
          <span>Aktiv auf: ${escapeText(devices.join(', ') || 'keinem Gerät')}</span>
        </div>
        <span class="badge ok">${devices.length} Geräte</span>
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

  const domain = sanitizeDomain(document.getElementById('groupDomainInput').value);
  const parts = [
    document.getElementById('groupPkgGambling').checked ? 'gambling' : '',
    document.getElementById('groupPkgAdult').checked ? 'adult' : '',
    document.getElementById('groupPkgSocial').checked ? 'social' : '',
    domain
  ].filter(Boolean);

  const blocklist = await apiJson(`${SECURITY_API}/blocklists`, {
    method: 'POST',
    body: JSON.stringify({
      id: group.blocklistId,
      routerId: 1,
      name: `${group.name} Blockliste`,
      sourceType: 'GROUP',
      urlPattern: parts.join('|')
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
  if (!domain) return setStatus('Bitte Domain eingeben.', 'error');
  await apiJson(`${SECURITY_API}/blocklists`, {
    method: 'POST',
    body: JSON.stringify({ routerId: 1, name: `Domain: ${domain}`, sourceType: 'CUSTOM', urlPattern: domain })
  });
  input.value = '';
  await loadSecurityState();
  setStatus(`${domain} in der Datenbank gespeichert.`, 'success');
}

async function addAdDomain(event) {
  event.preventDefault();
  const input = document.getElementById('adDomainInput');
  const domain = sanitizeDomain(input.value);
  if (!domain) return setStatus('Bitte Werbe-Domain eingeben.', 'error');
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

  const preset = await apiJson(`${SECURITY_API}/presets`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      description: 'Manuell erstellt',
      blocklistId: Number(document.getElementById('presetBlocklist')?.value || 0) || null,
      timeLimitMinutes: document.getElementById('presetTimeLimit').checked ? 120 : null,
      blockedFrom: document.getElementById('presetTimeLimit').checked ? '21:00' : null,
      blockedUntil: document.getElementById('presetTimeLimit').checked ? '07:00' : null,
      parentalMode: document.getElementById('presetParental').checked,
      priorityMode: document.getElementById('presetPriority').checked
    })
  });
  await apiJson(`${SECURITY_API}/devices/${deviceId}/preset/${preset.id}`, { method: 'PUT' });
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

  await apiJson(`${SECURITY_API}/devices/${deviceId}/preset/${presetId}`, { method: 'PUT' });
  await loadSecurityState();
  setStatus(`"${preset.name}" ist jetzt auf "${device.hostname || 'Gerät'}" aktiv.`, 'success');
}

function simulateWifiScan() {
  state.wifiNetworks = state.wifiNetworks.map(network => ({
    ...network,
    signal: Math.min(-38, Math.max(-88, network.signal + Math.round(Math.random() * 12 - 6)))
  }));
  renderWifi();
  setStatus('WLAN-Scan aktualisiert.', 'success');
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
  document.querySelector('app-hero')?.addEventListener('hero-click', simulateWifiScan);
  document.getElementById('groupForm')?.addEventListener('submit', addGroup);
  document.getElementById('groupBlocklistForm')?.addEventListener('submit', saveGroupBlocklist);
  document.getElementById('groupBlocklistSelect')?.addEventListener('change', renderGroupBlocklistForm);
  document.getElementById('manualDomainForm')?.addEventListener('submit', addManualDomain);
  document.getElementById('adDomainForm')?.addEventListener('submit', addAdDomain);
  document.getElementById('presetForm')?.addEventListener('submit', createPreset);
  document.getElementById('applyPresetForm')?.addEventListener('submit', applyExistingPreset);
  document.getElementById('wifiSearch')?.addEventListener('input', renderWifi);
  document.getElementById('wifiFilter')?.addEventListener('change', renderWifi);

  document.addEventListener('change', async event => {
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
        await apiJson(`${SECURITY_API}/devices/${deviceId}/preset/${presetId}`, { method: 'PUT' });
      } else {
        await apiJson(`${SECURITY_API}/devices/${deviceId}/preset`, { method: 'DELETE' });
      }
      await loadSecurityState();
      return setStatus('Geräte-Preset gespeichert.', 'success');
    }
  });

  document.addEventListener('click', event => {
    const saveButton = event.target.closest('[data-save-group]');
    if (saveButton) {
      saveGroupName(Number(saveButton.dataset.saveGroup)).catch(error => setStatus(`Gruppe konnte nicht gespeichert werden: ${error.message}`, 'error'));
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupEvents();
  loadSecurityState();
});
