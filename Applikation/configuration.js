const appConfig = window.NETHERA_CONFIG || {};
const API_BASE_URL = appConfig.API_BASE_URL || 'http://localhost:8080';
const CONFIG_API_URL = `${API_BASE_URL}/api/configs/list`;
let activeConfigId = null;
let savedConfig = null;
let saving = false;

function readForm() {
  return {
    routerName: document.getElementById('routerName').value.trim() || 'Nethera Router',
    mode: document.getElementById('securityMode').value,
    updates: document.getElementById('updates').checked,
    dnsBlocking: document.getElementById('dnsBlocking').checked,
    lanIp: document.getElementById('lanIp').value.trim(),
    gatewayIp: document.getElementById('gatewayIp').value.trim(),
    guestNetwork: document.getElementById('guestNetwork').checked,
    profiling: document.getElementById('profiling').checked
  };
}

function hasUnsavedChanges() {
  return savedConfig !== null && JSON.stringify(readForm()) !== JSON.stringify(savedConfig);
}

function updateChangeState() {
  const dirty = hasUnsavedChanges();
  const saveButton = document.querySelector('app-hero button[data-action="hero-button"]');
  if (saveButton) saveButton.disabled = !dirty || saving || !NetheraApi.isLive();
  document.getElementById('discardChanges').disabled = !dirty || saving;
  document.getElementById('changeState').textContent = saving
    ? 'Änderungen werden gespeichert …'
    : dirty ? 'Ungespeicherte Änderungen' : savedConfig ? 'Keine ungespeicherten Änderungen' : 'Noch keine Konfiguration geladen';
}

function discardChanges() {
  if (!savedConfig || saving) return;
  fillForm({ id: activeConfigId, ...savedConfig });
  updateChangeState();
  setStatus('Änderungen verworfen. Die zuletzt gespeicherten Werte wurden wiederhergestellt.');
}

function normalizeConfig(config) {
  return {
    id: config.id,
    routerName: config.routerName ?? config.router_name ?? 'Unbenannter Router',
    mode: config.mode ?? '—',
    updates: Boolean(config.updates),
    dnsBlocking: Boolean(config.dnsBlocking ?? config.dns_blocking),
    lanIp: config.lanIp ?? config.lan_ip ?? '—',
    gatewayIp: config.gatewayIp ?? config.gateway_ip ?? '—',
    guestNetwork: Boolean(config.guestNetwork ?? config.guest_network),
    profiling: Boolean(config.profiling ?? config.profimetric)
  };
}

function setStatus(text, tone = 'info') {
  document.getElementById('statusBox')?.setAttribute('text', text);
  document.getElementById('statusBox')?.setAttribute('state', tone);
}

function fillForm(config) {
  activeConfigId = config.id;
  document.getElementById('routerName').value = config.routerName;
  const modeSelect = document.getElementById('securityMode');
  modeSelect.value = config.mode;
  modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  document.getElementById('updates').checked = config.updates;
  document.getElementById('dnsBlocking').checked = config.dnsBlocking;
  document.getElementById('lanIp').value = config.lanIp;
  document.getElementById('gatewayIp').value = config.gatewayIp;
  document.getElementById('guestNetwork').checked = config.guestNetwork;
  document.getElementById('profiling').checked = config.profiling;
}

async function loadConfigs() {
  const saveButton = document.querySelector('app-hero button[data-action="hero-button"]');
  try {
    const router = await NetheraApi.getPrimaryRouter();
    const config = await NetheraApi.getConfiguration(router);
    if (config) {
      fillForm(normalizeConfig(config));
      savedConfig = readForm();
    } else {
      activeConfigId = null;
      savedConfig = null;
      clearForm();
    }
    document.getElementById('configFields').disabled = !config || router.dataMode !== 'live';
    updateChangeState();

    setStatus(router.dataMode === 'demo' ? 'Beispiel-Konfiguration · Nur Ansicht.'
      : router.dataMode === 'unavailable' ? 'Keine bestätigten Routerdaten verfügbar.'
        : config ? 'Konfiguration aktualisiert.' : 'Noch keine Konfiguration vorhanden.',
    router.dataMode === 'live' && config ? 'success' : 'info');
  } catch (error) {
    activeConfigId = null;
    savedConfig = null;
    clearForm();
    document.getElementById('configFields').disabled = true;
    updateChangeState();
    if (saveButton) saveButton.disabled = true;
    setStatus(NetheraApi.userMessage(error), 'error');
  }
}

function clearForm() {
  document.querySelectorAll('#configFields input').forEach(input => {
    if (input.type === 'checkbox') input.checked = false;
    else input.value = '';
  });
  const select = document.getElementById('securityMode');
  select.value = '';
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

async function saveConfig() {
  if (!activeConfigId) return setStatus('Keine Konfiguration zum Speichern geladen.', 'error');
  if (saving || !hasUnsavedChanges()) return;
  const payload = readForm();
  saving = true;
  document.getElementById('configFields').disabled = true;
  updateChangeState();
  try {
    await NetheraApi.requireLive();
    const account = window.parent?.NetheraAccount ?? window.NetheraAccount;
    const authHeader = (await account?.getAuthHeader?.()) ?? {};
    const response = await fetch(`${API_BASE_URL}/api/configs/${activeConfigId}`, {
      method: 'PUT',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`API ${response.status}`);
    savedConfig = payload;
    setStatus('Konfiguration gespeichert.', 'success');
  } finally {
    saving = false;
    document.getElementById('configFields').disabled = !NetheraApi.isLive();
    updateChangeState();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('app-hero').addEventListener('hero-click', () => {
    saveConfig().catch(error => setStatus(`Speichern fehlgeschlagen: ${error.message}`, 'error'));
  });

  const fields = document.getElementById('configFields');
  fields.addEventListener('input', updateChangeState);
  fields.addEventListener('change', updateChangeState);
  document.getElementById('discardChanges').addEventListener('click', discardChanges);
  window.addEventListener('beforeunload', event => {
    if (!hasUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  });
  updateChangeState();
  loadConfigs();
  NetheraApi.watchSource(loadConfigs);
});
