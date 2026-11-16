const appConfig = window.NETHERA_CONFIG || {};
const API_BASE_URL = appConfig.API_BASE_URL || 'http://localhost:8080';
let activeConfigId = null;
let savedConfig = null;
let saving = false;

function readForm() {
  return {
    routerName: document.getElementById('routerName').value.trim(),
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
  const saveButton = document.getElementById('saveConfig');
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
    routerName: config.routerName ?? config.router_name ?? '',
    mode: config.mode ?? '',
    updates: Boolean(config.updates),
    dnsBlocking: Boolean(config.dnsBlocking ?? config.dns_blocking),
    lanIp: config.lanIp ?? config.lan_ip ?? '',
    gatewayIp: config.gatewayIp ?? config.gateway_ip ?? '',
    guestNetwork: Boolean(config.guestNetwork ?? config.guest_network),
    profiling: Boolean(config.profiling ?? config.profimetric)
  };
}

function isRouterAddress(value) {
  const parts = value.split('.');
  return parts.length === 4 && parts.every(part => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255)
    && Number(parts[0]) > 0 && Number(parts[0]) < 224 && Number(parts[0]) !== 127;
}

function configErrors(config) {
  const errors = {};
  if (!config.routerName || config.routerName.length > 100) errors.routerName = 'Bitte gib einen Routernamen mit 1 bis 100 Zeichen ein.';
  if (!['GATEWAY', 'REPEATER', 'BRIDGE'].includes(config.mode)) errors.securityMode = 'Bitte wähle einen Betriebsmodus aus.';
  for (const field of ['lanIp', 'gatewayIp']) {
    if (!isRouterAddress(config[field])) errors[field] = 'Bitte gib eine gültige IPv4-Adresse ein, zum Beispiel 192.168.1.1.';
  }
  return errors;
}

function setStatus(text, tone = 'info') {
  document.getElementById('statusBox')?.setAttribute('text', text);
  document.getElementById('statusBox')?.setAttribute('state', tone);
}

function clearErrors() {
  for (const id of ['routerName', 'securityMode', 'lanIp', 'gatewayIp']) {
    document.getElementById(id).removeAttribute('aria-invalid');
    document.getElementById(`${id}Error`).textContent = '';
  }
}

function fillForm(config) {
  clearErrors();
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
  const saveButton = document.getElementById('saveConfig');
  try {
    const router = await NetheraApi.getPrimaryRouter();
    const config = await NetheraApi.getConfiguration(router);
    document.getElementById('retryConfig').hidden = true;
    if (config) {
      fillForm(normalizeConfig(config));
      savedConfig = readForm();
    } else {
      activeConfigId = null;
      savedConfig = null;
      clearForm();
    }
    document.getElementById('configName').textContent = config?.routerName || config?.router_name || 'Noch kein Router eingerichtet.';
    document.getElementById('configFields').disabled = !config || router.dataMode !== 'live';
    updateChangeState();

    setStatus(router.dataMode === 'demo' ? 'Beispiel-Konfiguration · Nur Ansicht.'
      : router.dataMode === 'unavailable' ? 'Keine bestätigten Routerdaten verfügbar.'
        : config ? 'Konfiguration aktualisiert.' : 'Noch keine Konfiguration vorhanden.',
    router.dataMode === 'live' && config ? 'success' : 'info');
  } catch (error) {
    document.getElementById('retryConfig').hidden = false;
    document.getElementById('configName').textContent = 'Konfiguration nicht verfügbar.';
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
  clearErrors();
  const errors = configErrors(payload);
  for (const [id, message] of Object.entries(errors)) {
    document.getElementById(id).setAttribute('aria-invalid', 'true');
    document.getElementById(`${id}Error`).textContent = message;
  }
  if (Object.keys(errors).length) {
    if (errors.lanIp || errors.gatewayIp) document.getElementById('advancedSettings').open = true;
    document.getElementById(Object.keys(errors)[0]).focus();
    return setStatus('Bitte korrigiere die markierten Eingaben. Es wurde nichts gespeichert.', 'error');
  }
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
    document.getElementById('configName').textContent = payload.routerName;
    setStatus('In Nethera gespeichert. Die Übernahme am Router wird hier noch nicht bestätigt.', 'success');
  } finally {
    saving = false;
    document.getElementById('configFields').disabled = !NetheraApi.isLive();
    updateChangeState();
  }
}

if (typeof module !== 'undefined') module.exports = { normalizeConfig, isRouterAddress, configErrors };
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('configForm').addEventListener('submit', event => {
    event.preventDefault();
    saveConfig().catch(error => setStatus(`Speichern fehlgeschlagen: ${error.message}`, 'error'));
  });

  document.getElementById('retryConfig').addEventListener('click', loadConfigs);
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
