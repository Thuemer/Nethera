const SECURITY_KEY = 'nethera-security-center';
const FALLBACK_GROUP = 'Ungruppiert';

const defaultState = {
  packages: { gambling: true, adult: true, social: true },
  manualDomains: ['win2day.at', 'edufs.edu.htl-leonding.at', 'figma.com'],
  groups: ['Kinder', 'Gäste', 'Gaming', FALLBACK_GROUP],
  deviceGroups: {},
  groupBlocklists: {
    Kinder: {
      gambling: true,
      adult: true,
      social: false,
      manualDomains: ['tiktok.com']
    }
  },
  devicePresets: {},
  adDomains: [
    { name: 'googleads.g.doubleclick.net', time: '2 min' },
    { name: 'connect.facebook.com', time: '4 min' },
    { name: 'stats.g.doubleclick.net', time: '17 min' },
    { name: 'adservice.google.com', time: '29 min' }
  ],
  presets: [],
  wifiNetworks: [
    { ssid: 'Nethera', bssid: 'A4:20:11:8C:90:01', type: 'router', signal: -48, channel: 6, frequency: '2.4 GHz', encryption: 'WPA3', known: true },
    { ssid: 'Nethera-5G', bssid: 'A4:20:11:8C:90:02', type: 'accessPoint', signal: -56, channel: 44, frequency: '5 GHz', encryption: 'WPA3', known: true },
    { ssid: 'HTL-Gast', bssid: 'D0:C1:23:44:81:10', type: 'accessPoint', signal: -70, channel: 11, frequency: '2.4 GHz', encryption: 'WPA2', known: false },
    { ssid: 'Nachbar-WLAN', bssid: '74:83:C2:13:AA:90', type: 'router', signal: -78, channel: 1, frequency: '2.4 GHz', encryption: 'WPA2', known: false }
  ]
};

const runtime = {
  devices: []
};

const state = normalizeState(loadState());

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(SECURITY_KEY) || 'null') || structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function normalizeState(input) {
  const merged = {
    ...structuredClone(defaultState),
    ...input,
    packages: { ...defaultState.packages, ...(input?.packages || {}) },
    groupBlocklists: { ...defaultState.groupBlocklists, ...(input?.groupBlocklists || {}) },
    deviceGroups: { ...(input?.deviceGroups || {}) },
    devicePresets: { ...(input?.devicePresets || {}) }
  };

  if (!merged.groups.includes(FALLBACK_GROUP)) merged.groups.push(FALLBACK_GROUP);
  if (!Array.isArray(merged.presets) || merged.presets.length === 0) {
    merged.presets = [{
      id: crypto.randomUUID(),
      name: 'Schultag iPad',
      deviceId: '',
      parental: true,
      priority: false,
      timeLimit: true,
      enabled: true,
      packages: { gambling: true, adult: true, social: false },
      manualDomains: ['youtube.com']
    }];
  }
  return merged;
}

function saveState() {
  localStorage.setItem(SECURITY_KEY, JSON.stringify(state));
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
  return String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

function deviceKey(device) {
  return String(device.id || device.macAddress || device.hostname);
}

function setStatus(text, tone = 'info') {
  const status = document.getElementById('statusBox');
  status?.setAttribute('text', text);
  status?.setAttribute('state', tone);
}

function packageCount(profile = state.packages) {
  return ['gambling', 'adult', 'social'].filter(key => profile?.[key]).length;
}

function groupForDevice(device) {
  return state.deviceGroups[deviceKey(device)] || FALLBACK_GROUP;
}

function profileForGroup(group) {
  return {
    gambling: false,
    adult: false,
    social: false,
    manualDomains: [],
    ...(state.groupBlocklists[group] || {})
  };
}

function presetForDevice(device) {
  const id = state.devicePresets[deviceKey(device)];
  return state.presets.find(preset => preset.id === id) || null;
}

function effectiveRulesForDevice(device) {
  const groupProfile = profileForGroup(groupForDevice(device));
  const preset = presetForDevice(device);
  const packages = {
    gambling: Boolean(state.packages.gambling || groupProfile.gambling || preset?.packages?.gambling),
    adult: Boolean(state.packages.adult || groupProfile.adult || preset?.packages?.adult),
    social: Boolean(state.packages.social || groupProfile.social || preset?.packages?.social)
  };
  const manualDomains = [...new Set([
    ...state.manualDomains,
    ...(groupProfile.manualDomains || []),
    ...(preset?.manualDomains || [])
  ])];

  return { packages, manualDomains, preset };
}

function demoDevices() {
  return [
    { id: 1, hostname: 'Helmut-iPhone', ipAddress: '192.168.0.10', macAddress: 'AA:BB:CC:DD:EE:01', connectionType: 'wifi' },
    { id: 2, hostname: 'Jakobs-Laptop', ipAddress: '192.168.0.11', macAddress: 'AA:BB:CC:DD:EE:02', connectionType: 'wifi' },
    { id: 4, hostname: 'Nethera-Tablet', ipAddress: '192.168.0.13', macAddress: 'AA:BB:CC:DD:EE:04', connectionType: 'wifi' }
  ];
}

async function loadDevices() {
  try {
    const router = await NetheraApi.getPrimaryRouter();
    runtime.devices = (router.devices || [])
      .filter(device => String(device.connectionType || '').toLowerCase() === 'wifi')
      .map(device => ({
        id: device.id,
        hostname: device.hostname,
        ipAddress: device.ipAddress,
        macAddress: device.macAddress,
        connectionType: device.connectionType
      }));
    setStatus(`${runtime.devices.length} WLAN-Geräte aus dem Backend geladen.`, 'success');
  } catch {
    runtime.devices = demoDevices();
    setStatus('Backend offline: Demo-Geräte geladen, Gruppenlogik bleibt nutzbar.', 'error');
  }

  assignInitialGroups();
  renderAll();
}

function assignInitialGroups() {
  runtime.devices.forEach((device, index) => {
    const key = deviceKey(device);
    if (!state.deviceGroups[key]) {
      state.deviceGroups[key] = index === 0 ? 'Kinder' : index === 1 ? 'Gaming' : FALLBACK_GROUP;
    }
  });

  const firstPreset = state.presets[0];
  if (firstPreset && !firstPreset.deviceId && runtime.devices[0]) {
    firstPreset.deviceId = deviceKey(runtime.devices[0]);
    state.devicePresets[firstPreset.deviceId] = firstPreset.id;
  }
  saveState();
}

function renderStats() {
  document.getElementById('statPackages')?.setAttribute('value', String(packageCount()));
  document.getElementById('statManual')?.setAttribute('value', String(state.manualDomains.length));
  document.getElementById('statAds')?.setAttribute('value', String(state.adDomains.length));
  document.getElementById('statPresets')?.setAttribute('value', String(state.presets.length));
  document.getElementById('adPercent').textContent = `${Math.min(99, 72 + state.adDomains.length * 4)}%`;
}

function renderPackages() {
  document.getElementById('pkgGambling').checked = Boolean(state.packages.gambling);
  document.getElementById('pkgAdult').checked = Boolean(state.packages.adult);
  document.getElementById('pkgSocial').checked = Boolean(state.packages.social);
}

function groupOptions(selected = '') {
  return state.groups.map(group => `<option value="${escapeText(group)}" ${group === selected ? 'selected' : ''}>${escapeText(group)}</option>`).join('');
}

function renderGroupControls() {
  const select = document.getElementById('groupBlocklistSelect');
  if (select) {
    const previous = select.value || state.groups[0] || FALLBACK_GROUP;
    select.innerHTML = groupOptions(state.groups.includes(previous) ? previous : state.groups[0]);
  }
  renderGroupBlocklistForm();
}

function renderGroupBlocklistForm() {
  const group = document.getElementById('groupBlocklistSelect')?.value || state.groups[0] || FALLBACK_GROUP;
  const profile = profileForGroup(group);
  document.getElementById('groupPkgGambling').checked = Boolean(profile.gambling);
  document.getElementById('groupPkgAdult').checked = Boolean(profile.adult);
  document.getElementById('groupPkgSocial').checked = Boolean(profile.social);
}

function renderPresetDeviceOptions() {
  const select = document.getElementById('presetDevice');
  if (!select) return;
  select.innerHTML = runtime.devices.map(device => {
    const key = deviceKey(device);
    return `<option value="${escapeText(key)}">${escapeText(device.hostname || 'Unbekanntes Gerät')} (${escapeText(groupForDevice(device))})</option>`;
  }).join('');
}

function renderGroupDevices() {
  const list = document.getElementById('groupDeviceList');
  if (!list) return;

  if (!runtime.devices.length) {
    list.innerHTML = '<empty-state title="Keine Geräte" text="Es wurden keine WLAN-Geräte gefunden."></empty-state>';
    return;
  }

  list.innerHTML = runtime.devices.map(device => {
    const key = deviceKey(device);
    const group = groupForDevice(device);
    const rules = effectiveRulesForDevice(device);
    const packageText = packageCount(rules.packages) ? `${packageCount(rules.packages)} Pakete aktiv` : 'Keine Pakete';
    const presetText = rules.preset ? `Preset: ${rules.preset.name}` : 'Kein Geräte-Preset';

    return `
      <article class="device-group-item">
        <div class="device-group-main">
          <strong>${escapeText(device.hostname || 'Unbekanntes Gerät')}</strong>
          <span>${escapeText(device.ipAddress || 'Keine IP')} · ${escapeText(group)} · ${escapeText(packageText)} · ${rules.manualDomains.length} Domains</span>
          <span>${escapeText(presetText)}</span>
        </div>
        <div class="device-group-actions">
          <select data-device-group="${escapeText(key)}">${groupOptions(group)}</select>
          <button class="small-btn ghost" type="button" data-clear-device-preset="${escapeText(key)}">Preset lösen</button>
        </div>
      </article>
    `;
  }).join('');
}

function renderManualDomains() {
  const list = document.getElementById('manualDomainsList');
  if (!list) return;

  if (!state.manualDomains.length) {
    list.innerHTML = '<empty-state title="Keine Domains" text="Füge links eine Domain hinzu, um sie global zu blockieren."></empty-state>';
    return;
  }

  list.innerHTML = state.manualDomains.map(domain => `
    <article class="rule-item">
      <div class="rule-main">
        <strong>${escapeText(domain)}</strong>
        <span>Globale Sperre für alle Geräte</span>
      </div>
      <div class="rule-actions">
        <button class="small-btn danger" type="button" data-remove-domain="${escapeText(domain)}">Entfernen</button>
      </div>
    </article>
  `).join('');
}

function renderAdDomains() {
  const list = document.getElementById('adDomainsList');
  if (!list) return;
  list.innerHTML = state.adDomains.map(domain => `
    <article class="rule-item">
      <div class="rule-main">
        <strong>${escapeText(domain.name)}</strong>
        <span>Blockiert vor ${escapeText(domain.time)}</span>
      </div>
      <span class="badge danger">Adblock</span>
    </article>
  `).join('');
}

function renderPresets() {
  const list = document.getElementById('presetList');
  if (!list) return;

  if (!state.presets.length) {
    list.innerHTML = '<empty-state title="Keine Presets" text="Erstelle links dein erstes Geräte-Profil."></empty-state>';
    return;
  }

  list.innerHTML = state.presets.map(preset => {
    const device = runtime.devices.find(item => deviceKey(item) === preset.deviceId);
    const active = preset.deviceId && state.devicePresets[preset.deviceId] === preset.id;
    const tags = [
      preset.parental ? 'Kinderschutz' : '',
      preset.priority ? 'Priorität' : '',
      preset.timeLimit ? 'Zeitlimit' : '',
      packageCount(preset.packages) ? `${packageCount(preset.packages)} Blocklisten` : ''
    ].filter(Boolean).join(' · ') || 'Keine Extras';

    return `
      <article class="preset-item">
        <div class="preset-main">
          <strong>${escapeText(preset.name)} ${active ? '<span class="badge ok">Aktiv</span>' : ''}</strong>
          <span>${escapeText(device?.hostname || 'Kein Gerät')} · ${escapeText(tags)}</span>
        </div>
        <div class="preset-actions">
          <button class="small-btn" type="button" data-apply-preset="${escapeText(preset.id)}">Auf Gerät anwenden</button>
          <button class="small-btn danger" type="button" data-delete-preset="${escapeText(preset.id)}">Löschen</button>
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
  renderPackages();
  renderGroupControls();
  renderPresetDeviceOptions();
  renderGroupDevices();
  renderManualDomains();
  renderAdDomains();
  renderPresets();
  renderWifi();
}

function addManualDomain(event) {
  event.preventDefault();
  const input = document.getElementById('manualDomainInput');
  const domain = sanitizeDomain(input.value);
  if (!domain) return setStatus('Bitte eine Domain eingeben.', 'error');
  if (!state.manualDomains.includes(domain)) state.manualDomains.unshift(domain);
  input.value = '';
  saveState();
  renderAll();
  setStatus(`${domain} wurde global blockiert.`, 'success');
}

function addAdDomain(event) {
  event.preventDefault();
  const input = document.getElementById('adDomainInput');
  const domain = sanitizeDomain(input.value);
  if (!domain) return setStatus('Bitte eine Werbe-Domain eingeben.', 'error');
  if (!state.adDomains.some(entry => entry.name === domain)) state.adDomains.unshift({ name: domain, time: 'jetzt' });
  input.value = '';
  saveState();
  renderAll();
  setStatus(`${domain} wird im Werbeschutz angezeigt.`, 'success');
}

function addGroup(event) {
  event.preventDefault();
  const input = document.getElementById('groupNameInput');
  const name = input.value.trim();
  if (!name) return setStatus('Bitte einen Gruppennamen eingeben.', 'error');
  if (!state.groups.includes(name)) state.groups.unshift(name);
  input.value = '';
  saveState();
  renderAll();
  setStatus(`Gruppe "${name}" angelegt.`, 'success');
}

function saveGroupBlocklist(event) {
  event.preventDefault();
  const group = document.getElementById('groupBlocklistSelect').value;
  const domain = sanitizeDomain(document.getElementById('groupDomainInput').value);
  const current = profileForGroup(group);
  const domains = [...current.manualDomains];
  if (domain && !domains.includes(domain)) domains.unshift(domain);
  state.groupBlocklists[group] = {
    gambling: document.getElementById('groupPkgGambling').checked,
    adult: document.getElementById('groupPkgAdult').checked,
    social: document.getElementById('groupPkgSocial').checked,
    manualDomains: domains
  };
  document.getElementById('groupDomainInput').value = '';
  saveState();
  renderAll();
  setStatus(`Blocklist für "${group}" gespeichert.`, 'success');
}

function createPreset(event) {
  event.preventDefault();
  const nameInput = document.getElementById('presetName');
  const name = nameInput.value.trim();
  const deviceId = document.getElementById('presetDevice').value;
  if (!name) return setStatus('Bitte einen Preset-Namen eingeben.', 'error');
  if (!deviceId) return setStatus('Bitte ein Gerät auswählen.', 'error');

  const preset = {
    id: crypto.randomUUID(),
    name,
    deviceId,
    parental: document.getElementById('presetParental').checked,
    priority: document.getElementById('presetPriority').checked,
    timeLimit: document.getElementById('presetTimeLimit').checked,
    enabled: true,
    packages: { ...state.packages },
    manualDomains: []
  };
  state.presets.unshift(preset);
  state.devicePresets[deviceId] = preset.id;
  nameInput.value = '';
  saveState();
  renderAll();
  setStatus(`Preset "${name}" gespeichert und dem Gerät zugewiesen.`, 'success');
}

function simulateWifiScan() {
  state.wifiNetworks = state.wifiNetworks.map(network => ({
    ...network,
    signal: Math.min(-38, Math.max(-88, network.signal + Math.round(Math.random() * 12 - 6)))
  }));
  saveState();
  renderWifi();
  setStatus('WLAN-Demo-Scan aktualisiert.', 'success');
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
  document.getElementById('wifiSearch')?.addEventListener('input', renderWifi);
  document.getElementById('wifiFilter')?.addEventListener('change', renderWifi);

  [['pkgGambling', 'gambling'], ['pkgAdult', 'adult'], ['pkgSocial', 'social']].forEach(([id, key]) => {
    document.getElementById(id)?.addEventListener('change', event => {
      state.packages[key] = event.target.checked;
      saveState();
      renderAll();
      setStatus('Globale Blockliste aktualisiert.', 'success');
    });
  });

  document.addEventListener('change', event => {
    const select = event.target.closest('[data-device-group]');
    if (!select) return;
    state.deviceGroups[select.dataset.deviceGroup] = select.value;
    saveState();
    renderAll();
    setStatus('Gerät wurde einer Gruppe zugewiesen.', 'success');
  });

  document.addEventListener('click', event => {
    const removeDomain = event.target.closest('[data-remove-domain]')?.dataset.removeDomain;
    if (removeDomain) {
      state.manualDomains = state.manualDomains.filter(domain => domain !== removeDomain);
      saveState();
      renderAll();
      return setStatus(`${removeDomain} entfernt.`, 'success');
    }

    const clearDevicePreset = event.target.closest('[data-clear-device-preset]')?.dataset.clearDevicePreset;
    if (clearDevicePreset) {
      delete state.devicePresets[clearDevicePreset];
      saveState();
      renderAll();
      return setStatus('Preset vom Gerät gelöst.', 'success');
    }

    const deletePreset = event.target.closest('[data-delete-preset]')?.dataset.deletePreset;
    if (deletePreset) {
      state.presets = state.presets.filter(preset => preset.id !== deletePreset);
      Object.keys(state.devicePresets).forEach(key => {
        if (state.devicePresets[key] === deletePreset) delete state.devicePresets[key];
      });
      saveState();
      renderAll();
      return setStatus('Preset gelöscht.', 'success');
    }

    const applyPreset = event.target.closest('[data-apply-preset]')?.dataset.applyPreset;
    if (applyPreset) {
      const preset = state.presets.find(item => item.id === applyPreset);
      if (!preset?.deviceId) return setStatus('Dieses Preset hat kein Gerät.', 'error');
      state.devicePresets[preset.deviceId] = preset.id;
      saveState();
      renderAll();
      return setStatus(`Preset "${preset.name}" auf Gerät angewendet.`, 'success');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupEvents();
  loadDevices();
});
