const CONFIG_API_URL = 'http://localhost:8080/api/configs/list';

const DEMO_CONFIGS = [
  { routerName: 'Edge-Router-01', mode: 'GATEWAY', updates: true, dnsBlocking: true, lanIp: '192.168.1.1', gatewayIp: '10.0.0.1', guestNetwork: true, profiling: true },
  { routerName: 'Home-Box-V2', mode: 'REPEATER', updates: true, dnsBlocking: false, lanIp: '192.168.1.2', gatewayIp: '192.168.1.1', guestNetwork: false, profiling: false },
  { routerName: 'Lab-Router', mode: 'BRIDGE', updates: false, dnsBlocking: false, lanIp: '10.0.5.1', gatewayIp: '10.0.5.254', guestNetwork: false, profiling: true }
];

function normalizeConfig(config) {
  return {
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

function statusBadge(label, active) {
  return `<span class="badge ${active ? 'ok' : 'danger'}">${label}: ${active ? 'An' : 'Aus'}</span>`;
}

function renderConfigs(configs) {
  const list = document.getElementById('configList');
  if (!list) return;

  const normalized = configs.map(normalizeConfig);
  list.innerHTML = normalized.map(config => `
    <article class="data-card config-data-card">
      <div class="data-main">
        <div class="data-title-row">
          <strong>${escapeHtml(config.routerName)}</strong>
          <span class="badge profi">${escapeHtml(config.mode)}</span>
        </div>
        <div class="kv compact"><span>LAN-IP</span><strong>${escapeHtml(config.lanIp)}</strong></div>
        <div class="kv compact"><span>Gateway</span><strong>${escapeHtml(config.gatewayIp)}</strong></div>
        <div class="badge-row">
          ${statusBadge('Updates', config.updates)}
          ${statusBadge('DNS', config.dnsBlocking)}
          ${statusBadge('Gast', config.guestNetwork)}
          ${statusBadge('Metriken', config.profiling)}
        </div>
      </div>
    </article>
  `).join('');
}

async function loadConfigs() {
  try {
    const response = await fetch(CONFIG_API_URL, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`API ${response.status}`);
    const data = await response.json();
    renderConfigs(Array.isArray(data) ? data : DEMO_CONFIGS);
  } catch (error) {
    renderConfigs(DEMO_CONFIGS);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const saved = JSON.parse(localStorage.getItem('nethera-config') || '{}');
  if (saved.routerName) document.getElementById('routerName').value = saved.routerName;
  if (saved.securityMode) document.getElementById('securityMode').value = saved.securityMode;

  document.querySelector('app-hero').addEventListener('hero-click', () => {
    const data = {
      routerName: document.getElementById('routerName').value,
      securityMode: document.getElementById('securityMode').value,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem('nethera-config', JSON.stringify(data));
    document.getElementById('statusBox').setAttribute('text', 'Demo-Konfiguration lokal gespeichert.');
    document.getElementById('statusBox').setAttribute('state', 'success');
  });

  loadConfigs();
});
