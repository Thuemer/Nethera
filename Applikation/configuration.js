const appConfig = window.NETHERA_CONFIG || {};
const API_BASE_URL = appConfig.API_BASE_URL || 'http://localhost:8080';
const CONFIG_API_URL = `${API_BASE_URL}/api/configs/list`;
let activeConfigId = null;

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
    const account = window.parent?.NetheraAccount ?? window.NetheraAccount;
    const authHeader = (await account?.getAuthHeader?.()) ?? {};
    const response = await fetch(CONFIG_API_URL, { headers: { Accept: 'application/json', ...authHeader }, cache: 'no-store' });
    if (!response.ok) throw new Error(`API ${response.status}`);
    const data = await response.json();
    const configs = Array.isArray(data) ? data.map(normalizeConfig) : [];
    if (configs[0]) fillForm(configs[0]);
    if (saveButton) saveButton.disabled = !configs.length;
    setStatus(configs.length ? 'Konfiguration aktualisiert.' : 'Noch keine Konfiguration vorhanden.', configs.length ? 'success' : 'warning');
  } catch (error) {
    activeConfigId = null;
    if (saveButton) saveButton.disabled = true;
    setStatus(NetheraApi.userMessage(error), 'error');
  }
}

async function saveConfig() {
  if (!activeConfigId) return setStatus('Keine Konfiguration zum Speichern geladen.', 'error');
  const payload = {
    routerName: document.getElementById('routerName').value.trim() || 'Nethera Router',
    mode: document.getElementById('securityMode').value,
    updates: document.getElementById('updates').checked,
    dnsBlocking: document.getElementById('dnsBlocking').checked,
    lanIp: document.getElementById('lanIp').value.trim(),
    gatewayIp: document.getElementById('gatewayIp').value.trim(),
    guestNetwork: document.getElementById('guestNetwork').checked,
    profiling: document.getElementById('profiling').checked
  };

  const account = window.parent?.NetheraAccount ?? window.NetheraAccount;
  const authHeader = (await account?.getAuthHeader?.()) ?? {};
  const response = await fetch(`${API_BASE_URL}/api/configs/${activeConfigId}`, {
    method: 'PUT',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  setStatus('Konfiguration gespeichert.', 'success');
  await loadConfigs();
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('app-hero').addEventListener('hero-click', () => {
    saveConfig().catch(error => setStatus(`Speichern fehlgeschlagen: ${error.message}`, 'error'));
  });

  loadConfigs();
});
