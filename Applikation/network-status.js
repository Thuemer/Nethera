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

  const authRequired = /\b(401|403)\b/.test(String(error?.message));
  const sourceStatus = !error ? (router?.dataMode === 'demo' ? 'Demodaten' : router?.dataMode === 'unavailable' ? 'Keine aktuellen Daten' : 'Routerdaten')
    : authRequired ? 'Anmeldung erforderlich'
      : error.message === 'Keine Routerdaten gefunden' ? 'Erreichbar' : 'Nicht erreichbar';

  const rows = [
    ['Datenquelle', sourceStatus],
    ['Routername', router?.name || '—'],
    ['Firmware', router?.firmware || '—'],
    ['Letzter Kontakt', formatDateTime(router?.lastSeen)],
    ['Browser-Verbindung', navigator.onLine ? 'Aktiv' : 'Getrennt']
  ];

  details.innerHTML = rows.map(([label, value]) => `
    <article class="status-row">
      <strong>${escapeText(label)}</strong>
      <span>${escapeText(value)}</span>
    </article>
  `).join('');
}

async function checkStatus() {
  const browserOnline = navigator.onLine;
  document.getElementById('connectionState')?.setAttribute('value', browserOnline ? 'Online' : 'Offline');
  document.getElementById('connectionState')?.setAttribute('tone', browserOnline ? '' : 'danger');
  setStatus('Prüfe Routerstatus ...');

  try {
    const router = await NetheraApi.getPrimaryRouter();
    const onlineDevices = NetheraApi.onlineDevices(router);
    document.getElementById('routerState')?.setAttribute('value', router.isOnline == null ? 'Unbekannt' : router.isOnline ? 'Online' : 'Offline');
    document.getElementById('routerState')?.setAttribute('tone', router.isOnline === false ? 'danger' : '');
    document.getElementById('deviceCount')?.setAttribute('value', router.dataMode === 'unavailable' ? '—' : String(onlineDevices.length));
    document.getElementById('deviceCount')?.setAttribute('detail', router.dataMode === 'demo' ? 'Beispielgeräte' : router.dataMode === 'unavailable' ? 'nicht verfügbar' : `von ${(router.devices || []).length} bekannten`);
    renderDetails(router, null);
    setStatus(router.dataMode === 'unavailable' ? 'Routerstatus derzeit unbekannt.' : router.dataMode === 'demo' ? 'Demo-Vorschau. Kein aktueller Routerstatus.' : 'Routerstatus aktualisiert.', router.dataMode === 'live' ? 'success' : 'info');
  } catch (error) {
    const noRouter = error.message === 'Keine Routerdaten gefunden';
    document.getElementById('routerState')?.setAttribute('value', noRouter ? 'Nicht verbunden' : 'Unbekannt');
    document.getElementById('routerState')?.setAttribute('tone', '');
    document.getElementById('deviceCount')?.setAttribute('value', '—');
    document.getElementById('deviceCount')?.setAttribute('detail', 'nicht verfügbar');
    renderDetails(null, error);
    setStatus(NetheraApi.userMessage(error), 'error');
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
  NetheraApi.watchSource(checkStatus);
});
