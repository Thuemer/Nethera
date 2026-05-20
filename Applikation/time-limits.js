const STORAGE_KEY = 'nethera-device-time-limits';
const appConfig = window.NETHERA_CONFIG || {};
const TIME_LIMITS_API_URL = `${appConfig.API_BASE_URL || 'http://localhost:8080'}/api/device-time-limits`;

const state = {
  devices: [],
  limits: loadLimits(),
  filteredDevices: [],
  storageMode: 'local'
};

function loadLimits() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function saveLimits() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.limits));
}

function normalizeLimit(limit) {
  if (!limit) return null;
  return {
    id: limit.id,
    deviceId: limit.deviceId,
    dailyLimit: Number(limit.dailyLimitMinutes ?? limit.dailyLimit ?? 0),
    usedMinutesToday: Number(limit.usedMinutesToday ?? 0),
    from: limit.blockedFrom ?? limit.allowedFrom ?? limit.from ?? '21:00',
    until: limit.blockedUntil ?? limit.allowedUntil ?? limit.until ?? '07:00',
    status: limit.status || 'active',
    note: limit.note || ''
  };
}

async function loadBackendLimits() {
  const response = await fetch(TIME_LIMITS_API_URL, {
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`Zeitlimit-API antwortet mit ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('Zeitlimit-Antwort ist keine Liste');
  }

  state.limits = {};
  data.forEach(limit => {
    const normalized = normalizeLimit(limit);
    if (normalized?.deviceId) {
      state.limits[String(normalized.deviceId)] = normalized;
    }
  });
  state.storageMode = 'backend';
}

async function saveBackendLimit(deviceId, limit) {
  const response = await fetch(`${TIME_LIMITS_API_URL}/${deviceId}`, {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      deviceId: Number(deviceId),
      dailyLimitMinutes: limit.dailyLimit,
      usedMinutesToday: limit.usedMinutesToday,
      blockedFrom: limit.from,
      blockedUntil: limit.until,
      status: limit.status,
      note: limit.note
    })
  });

  if (!response.ok) {
    throw new Error(`Speichern fehlgeschlagen (${response.status})`);
  }

  return normalizeLimit(await response.json());
}

async function deleteBackendLimit(deviceId) {
  const response = await fetch(`${TIME_LIMITS_API_URL}/${deviceId}`, { method: 'DELETE' });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Loeschen fehlgeschlagen (${response.status})`);
  }
}

function escapeText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeConnectionType(type) {
  return String(type || '').trim().toLowerCase();
}

function deviceKey(device) {
  return String(device.id || device.macAddress || device.hostname || '');
}

function formatMinutes(minutes) {
  const value = Number(minutes) || 0;
  if (value <= 0) return 'Kein Tageslimit';
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function minutesSinceMidnight(value) {
  const [hours, minutes] = String(value || '00:00').split(':').map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function isBlockedNow(limit) {
  if (!limit?.from || !limit?.until || limit.status !== 'active') return false;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const from = minutesSinceMidnight(limit.from);
  const until = minutesSinceMidnight(limit.until);

  if (from === until) return false;
  if (from < until) return current >= from && current <= until;
  return current >= from || current <= until;
}

function usedPercent(limit) {
  const budget = Number(limit?.dailyLimit) || 0;
  if (!budget) return 0;
  const used = Number(limit?.usedMinutesToday) || 0;
  return Math.min(100, Math.max(0, Math.round((used / budget) * 100)));
}

function setStatus(text, tone = 'info') {
  const status = document.getElementById('statusBox');
  status?.setAttribute('text', text);
  status?.setAttribute('state', tone);
}

function updateStats() {
  const limited = state.devices.filter(device => state.limits[deviceKey(device)]);
  const active = limited.filter(device => state.limits[deviceKey(device)]?.status === 'active');
  const budgets = active
    .map(device => Number(state.limits[deviceKey(device)]?.dailyLimit) || 0)
    .filter(Boolean);
  const average = budgets.length ? Math.round(budgets.reduce((sum, value) => sum + value, 0) / budgets.length) : 0;

  document.getElementById('statDevices')?.setAttribute('value', String(state.devices.length));
  document.getElementById('statLimited')?.setAttribute('value', String(active.length));
  document.getElementById('statBlockedSoon')?.setAttribute('value', String(budgets.length));
  document.getElementById('statAverage')?.setAttribute('value', average ? formatMinutes(average) : '0 h');
}

function renderDeviceOptions() {
  const select = document.getElementById('deviceSelect');
  if (!select) return;

  if (!state.devices.length) {
    select.innerHTML = '<option value="">Keine WLAN-Geräte gefunden</option>';
    select.disabled = true;
    return;
  }

  select.disabled = false;
  select.innerHTML = state.devices.map(device => {
    const key = deviceKey(device);
    const label = `${device.hostname || 'Unbekanntes Gerät'} (${device.ipAddress || device.macAddress || 'ohne Adresse'})`;
    return `<option value="${escapeText(key)}">${escapeText(label)}</option>`;
  }).join('');

  loadSelectedLimit();
}

function loadSelectedLimit() {
  const key = document.getElementById('deviceSelect')?.value;
  const limit = state.limits[key] || {};

  document.getElementById('dailyLimit').value = String(limit.dailyLimit ?? 120);
  document.getElementById('limitStatus').value = limit.status || 'active';
  document.getElementById('usedMinutesToday').value = String(limit.usedMinutesToday ?? 0);
  document.getElementById('blockedFrom').value = limit.from || '21:00';
  document.getElementById('blockedUntil').value = limit.until || '07:00';
  document.getElementById('limitNote').value = limit.note || '';
}

function renderList() {
  const list = document.getElementById('limitsList');
  if (!list) return;

  if (!state.filteredDevices.length) {
    list.innerHTML = '<empty-state title="Keine WLAN-Geräte" text="Für die aktuelle Filterung wurden keine Geräte gefunden."></empty-state>';
    return;
  }

  list.innerHTML = state.filteredDevices.map(device => {
    const key = deviceKey(device);
    const limit = state.limits[key];
    const blocked = isBlockedNow(limit);
    const paused = limit?.status === 'paused';
    const percent = limit ? usedPercent(limit) : 0;
    const budgetText = limit
      ? `${formatMinutes(limit.usedMinutesToday || 0)} von ${formatMinutes(limit.dailyLimit)} genutzt`
      : 'Noch kein Limit gesetzt';
    const note = limit?.note ? `<span>${escapeText(limit.note)}</span>` : '';
    const cardState = blocked ? 'is-blocked' : paused ? 'is-paused' : '';
    const statusBadge = !limit
      ? '<span class="badge">Ohne Limit</span>'
      : blocked
        ? '<span class="badge danger">Jetzt gesperrt</span>'
        : paused
          ? '<span class="badge paused">Pausiert</span>'
          : '<span class="badge ok">Aktiv</span>';

    return `
      <article class="limit-card ${cardState}">
        <div class="limit-main">
          <div class="limit-title-row">
            <h3>${escapeText(device.hostname || 'Unbekanntes Gerät')}</h3>
            ${statusBadge}
            <span class="badge wifi">WiFi</span>
          </div>
          <div class="limit-meta">
            <span>${escapeText(device.ipAddress || 'Keine IP')}</span>
            <span>${escapeText(device.macAddress || 'Keine MAC')}</span>
            ${note}
          </div>
          <div class="limit-budget">
            <div class="limit-meta">
              <strong>${limit ? formatMinutes(limit.dailyLimit) : 'Kein Tageslimit'}</strong>
              <span>${limit ? `Verboten: ${escapeText(limit.from)} bis ${escapeText(limit.until)}` : 'Kein Sperrzeitraum gesetzt'}</span>
            </div>
            <div class="budget-bar" aria-hidden="true"><span style="--budget: ${percent}%"></span></div>
            <div class="budget-text">${escapeText(budgetText)}</div>
          </div>
        </div>
        <div class="limit-side">
          <button class="small-btn" type="button" data-action="edit" data-key="${escapeText(key)}">Bearbeiten</button>
          <button class="small-btn ghost" type="button" data-action="toggle" data-key="${escapeText(key)}">${paused ? 'Aktivieren' : 'Pausieren'}</button>
        </div>
      </article>
    `;
  }).join('');
}

function applyFilters() {
  const search = String(document.getElementById('searchInput')?.value || '').trim().toLowerCase();
  const filter = document.getElementById('statusFilter')?.value || 'all';

  state.filteredDevices = state.devices.filter(device => {
    const key = deviceKey(device);
    const hasLimit = Boolean(state.limits[key]);
    const matchesFilter = filter === 'all' || (filter === 'limited' && hasLimit) || (filter === 'unlimited' && !hasLimit);
    const haystack = [device.hostname, device.ipAddress, device.macAddress].filter(Boolean).join(' ').toLowerCase();
    return matchesFilter && (!search || haystack.includes(search));
  });

  renderList();
  updateStats();
}

async function loadDevices() {
  setStatus('Lade WLAN-Geräte ...');

  try {
    const router = await NetheraApi.getPrimaryRouter();
    try {
      await loadBackendLimits();
    } catch {
      state.limits = loadLimits();
      state.storageMode = 'local';
    }

    const devices = Array.isArray(router?.devices) ? router.devices : [];
    state.devices = devices
      .filter(device => normalizeConnectionType(device.connectionType) === 'wifi')
      .map(device => ({
        id: device.id,
        hostname: device.hostname,
        ipAddress: device.ipAddress,
        macAddress: device.macAddress,
        connectionType: 'wifi',
        lastSeen: device.lastSeen
      }));

    renderDeviceOptions();
    applyFilters();
    const storageText = state.storageMode === 'backend' ? 'Backend' : 'lokaler Notfall-Speicher';
    setStatus(`${state.devices.length} WLAN-Geräte geladen. Zeitlimits kommen aus dem ${storageText}.`, 'success');
  } catch (error) {
    state.devices = [];
    renderDeviceOptions();
    applyFilters();
    setStatus(`Backend nicht verfügbar: ${error.message}`, 'error');
  }
}

async function saveSelectedLimit(event) {
  event.preventDefault();

  const key = document.getElementById('deviceSelect')?.value;
  if (!key) {
    setStatus('Bitte zuerst ein WLAN-Gerät auswählen.', 'error');
    return;
  }

  state.limits[key] = {
    dailyLimit: Number(document.getElementById('dailyLimit').value),
    usedMinutesToday: Number(document.getElementById('usedMinutesToday').value) || 0,
    status: document.getElementById('limitStatus').value,
    from: document.getElementById('blockedFrom').value,
    until: document.getElementById('blockedUntil').value,
    note: document.getElementById('limitNote').value.trim(),
    updatedAt: new Date().toISOString()
  };

  if (state.storageMode === 'backend') {
    try {
      state.limits[key] = await saveBackendLimit(key, state.limits[key]);
    } catch (error) {
      state.storageMode = 'local';
      saveLimits();
      setStatus(`Backend-Speichern nicht möglich: ${error.message}. Lokal gespeichert.`, 'error');
      applyFilters();
      return;
    }
  } else {
    saveLimits();
  }

  applyFilters();
  setStatus(state.storageMode === 'backend' ? 'Zeitlimit im Backend gespeichert.' : 'Zeitlimit lokal gespeichert.', 'success');
}

async function clearSelectedLimit() {
  const key = document.getElementById('deviceSelect')?.value;
  if (!key) return;

  if (state.storageMode === 'backend') {
    try {
      await deleteBackendLimit(key);
    } catch (error) {
      setStatus(`Zeitlimit konnte nicht geloescht werden: ${error.message}`, 'error');
      return;
    }
  }

  delete state.limits[key];
  saveLimits();
  loadSelectedLimit();
  applyFilters();
  setStatus('Zeitlimit entfernt.', 'success');
}

async function handleListClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const key = button.dataset.key;
  const select = document.getElementById('deviceSelect');
  if (select) select.value = key;

  if (button.dataset.action === 'edit') {
    loadSelectedLimit();
    document.getElementById('limitForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  if (button.dataset.action === 'toggle') {
    const current = state.limits[key] || { dailyLimit: 120, usedMinutesToday: 0, from: '21:00', until: '07:00', note: '' };
    current.status = current.status === 'paused' ? 'active' : 'paused';
    current.updatedAt = new Date().toISOString();
    state.limits[key] = current;

    if (state.storageMode === 'backend') {
      try {
        state.limits[key] = await saveBackendLimit(key, current);
      } catch (error) {
        setStatus(`Status konnte nicht gespeichert werden: ${error.message}`, 'error');
        return;
      }
    } else {
      saveLimits();
    }

    loadSelectedLimit();
    applyFilters();
    setStatus(current.status === 'active' ? 'Zeitlimit aktiviert.' : 'Zeitlimit pausiert.', 'success');
  }
}

function setupEvents() {
  document.querySelector('app-hero')?.addEventListener('hero-click', loadDevices);
  document.getElementById('limitForm')?.addEventListener('submit', saveSelectedLimit);
  document.getElementById('clearLimitButton')?.addEventListener('click', clearSelectedLimit);
  document.getElementById('deviceSelect')?.addEventListener('change', loadSelectedLimit);
  document.getElementById('searchInput')?.addEventListener('input', applyFilters);
  document.getElementById('statusFilter')?.addEventListener('change', applyFilters);
  document.getElementById('limitsList')?.addEventListener('click', handleListClick);
}

document.addEventListener('DOMContentLoaded', () => {
  setupEvents();
  loadDevices();
});
