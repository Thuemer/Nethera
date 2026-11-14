const appConfig = window.NETHERA_CONFIG || {};
const API_BASE_URL = appConfig.API_BASE_URL || 'http://localhost:8080';
const CONFIG_API_URL = `${API_BASE_URL}/api/configs/list`;
let activeConfigId = null;
let savedConfig = null;
let busy = false;
const fields = ['routerName', 'securityMode', 'updates', 'dnsBlocking', 'lanIp', 'gatewayIp', 'guestNetwork', 'profiling'];

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
  document.getElementById('statusBox').setAttribute('text', text);
  document.getElementById('statusBox').setAttribute('state', tone);
}

function readForm() {
  return Object.fromEntries(fields.map(id => {
    const element = document.getElementById(id);
    return [id === 'securityMode' ? 'mode' : id, element.type === 'checkbox' ? element.checked : element.value.trim()];
  }));
}

function hasChanges() {
  if (!savedConfig) return false;
  const { id, ...saved } = savedConfig;
  return JSON.stringify(readForm()) !== JSON.stringify(saved);
}

function updateActions() {
  const dirty = hasChanges();
  document.getElementById('configFields').disabled = busy || activeConfigId === null;
  document.getElementById('saveConfig').disabled = busy || !dirty;
  document.getElementById('resetConfig').disabled = busy || !dirty;
  document.getElementById('saveConfig').textContent = busy ? 'Bitte warten …' : 'Änderungen speichern';
  document.getElementById('changeState').textContent = dirty ? 'Ungespeicherte Änderungen.' : 'Keine ungespeicherten Änderungen.';
}

function clearErrors() {
  for (const id of ['routerName', 'securityMode', 'lanIp', 'gatewayIp']) {
    document.getElementById(id).removeAttribute('aria-invalid');
    document.getElementById(`${id}Error`).textContent = '';
  }
}

function fillForm(config) {
  for (const id of fields) {
    const element = document.getElementById(id);
    const value = config[id === 'securityMode' ? 'mode' : id];
    if (element.type === 'checkbox') element.checked = value;
    else element.value = value;
  }
  clearErrors();
}

async function request(url, options = {}) {
  const authHeader = await NetheraApi.getAuthHeader();
  const response = await fetch(url, {
    ...options,
    headers: { Accept: 'application/json', ...authHeader, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response;
}

async function loadConfigs() {
  if (busy) return;
  busy = true;
  activeConfigId = null;
  savedConfig = null;
  updateActions();
  document.getElementById('retryConfig').hidden = true;
  document.getElementById('configName').textContent = 'Konfiguration wird geladen.';
  setStatus('Konfiguration wird geladen.');
  try {
    const response = await request(CONFIG_API_URL);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('Ungültige Konfigurationsliste');
    if (!data.length) {
      setStatus('Noch keine Konfiguration vorhanden. Richte zuerst deinen Router mit dem Projektteam ein.', 'warning');
      document.getElementById('configName').textContent = 'Noch kein Router eingerichtet.';
      document.getElementById('retryConfig').hidden = false;
      return;
    }
    // The existing endpoint exposes the primary configuration as the first entry.
    const config = normalizeConfig(data[0]);
    if (config.id === null || config.id === undefined) throw new Error('Konfiguration ohne ID');
    fillForm(config);
    activeConfigId = config.id;
    savedConfig = config;
    document.getElementById('configName').textContent = config.routerName || 'Unbenannter Router';
    setStatus('Konfiguration geladen. Änderungen werden erst mit „Speichern“ übernommen.');
  } catch (error) {
    document.getElementById('configName').textContent = 'Konfiguration nicht verfügbar.';
    document.getElementById('retryConfig').hidden = false;
    setStatus(NetheraApi.userMessage(error), 'error');
  } finally {
    busy = false;
    updateActions();
  }
}

async function saveConfig(event) {
  event.preventDefault();
  if (busy || activeConfigId === null || !hasChanges()) return;
  const payload = readForm();
  clearErrors();
  const errors = configErrors(payload);
  const invalidIds = Object.keys(errors);
  for (const id of invalidIds) {
    document.getElementById(id).setAttribute('aria-invalid', 'true');
    document.getElementById(`${id}Error`).textContent = errors[id];
  }
  if (invalidIds.length) {
    if (errors.lanIp || errors.gatewayIp) document.getElementById('advancedSettings').open = true;
    document.getElementById(invalidIds[0]).focus();
    setStatus('Bitte korrigiere die markierten Eingaben. Es wurde nichts gespeichert.', 'error');
    return;
  }
  busy = true;
  updateActions();
  document.getElementById('configForm').setAttribute('aria-busy', 'true');
  setStatus('Konfiguration wird gespeichert.');
  try {
    await request(`${API_BASE_URL}/api/configs/${encodeURIComponent(activeConfigId)}`, { method: 'PUT', body: JSON.stringify(payload) });
    savedConfig = { id: activeConfigId, ...payload };
    document.getElementById('configName').textContent = payload.routerName;
    setStatus('In Nethera gespeichert. Die Übernahme am Router wird hier noch nicht bestätigt.', 'success');
  } catch (error) {
    const authError = /\b(401|403)\b/.test(error.message);
    setStatus(authError ? 'Bitte melde dich erneut an. Deine Eingaben bleiben erhalten.' : 'Speichern konnte nicht bestätigt werden. Deine Eingaben bleiben erhalten; du kannst es erneut versuchen.', 'error');
  } finally {
    busy = false;
    document.getElementById('configForm').removeAttribute('aria-busy');
    updateActions();
  }
}

// Export validation for focused tests without booting the page.
if (typeof module !== 'undefined') module.exports = { normalizeConfig, isRouterAddress, configErrors };
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('configForm');
  form.addEventListener('submit', saveConfig);
  form.addEventListener('input', updateActions);
  form.addEventListener('change', updateActions);
  document.getElementById('resetConfig').addEventListener('click', () => {
    if (!savedConfig || busy) return;
    fillForm(savedConfig);
    updateActions();
    setStatus('Nicht gespeicherte Änderungen wurden verworfen.');
  });
  document.getElementById('retryConfig').addEventListener('click', loadConfigs);
  window.addEventListener('beforeunload', event => {
    if (!hasChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  });
  loadConfigs();
});
