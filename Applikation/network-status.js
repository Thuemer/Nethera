function escapeText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setStatus(text, tone = 'info') {
  const status = document.getElementById('statusBox');
  status?.setAttribute('text', text);
  status?.setAttribute('state', tone);
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function renderDetails(router, error) {
  const details = document.getElementById('statusDetails');
  if (!details) return;

  const rows = [
    ['Backend', error ? 'Nicht erreichbar' : 'Erreichbar'],
    ['Routername', router?.name || '—'],
    ['Firmware', router?.firmware || '—'],
    ['Letzter Kontakt', formatDateTime(router?.lastSeen)],
    ['Browser online', navigator.onLine ? 'Ja' : 'Nein']
  ];

  details.innerHTML = rows.map(([label, value]) => `
    <article class="status-row">
      <strong>${escapeText(label)}</strong>
      <span>${escapeText(value)}</span>
    </article>
  `).join('');
}

async function checkStatus() {
  document.getElementById('connectionState')?.setAttribute('value', navigator.onLine ? 'Online' : 'Offline');
  setStatus('Prüfe Routerstatus ...');

  try {
    const router = await NetheraApi.getPrimaryRouter();
    const wifiDevices = (router.devices || []).filter(device => String(device.connectionType || '').toLowerCase() === 'wifi');
    document.getElementById('routerState')?.setAttribute('value', router.isOnline ? 'Online' : 'Offline');
    document.getElementById('deviceCount')?.setAttribute('value', String(wifiDevices.length));
    renderDetails(router, null);
    setStatus('Routerstatus aktualisiert.', 'success');
  } catch (error) {
    document.getElementById('routerState')?.setAttribute('value', 'Offline');
    document.getElementById('deviceCount')?.setAttribute('value', '0');
    renderDetails(null, error);
    setStatus(`Backend nicht erreichbar: ${error.message}`, 'error');
  }
}

function setupEvents() {
  document.querySelector('app-hero')?.addEventListener('hero-click', checkStatus);
  window.addEventListener('online', checkStatus);
  window.addEventListener('offline', checkStatus);
}

document.addEventListener('DOMContentLoaded', () => {
  setupEvents();
  checkStatus();
});
