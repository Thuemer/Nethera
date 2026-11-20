const STORAGE_KEY = 'nethera-device-time-limits';
const appConfig = window.NETHERA_CONFIG || {};
const TIME_LIMITS_API_URL = `${appConfig.API_BASE_URL || 'http://localhost:8080'}/api/device-time-limits`;
const SECURITY_STATE_API_URL = `${appConfig.API_BASE_URL || 'http://localhost:8080'}/api/security/state`;

const state = {
  loaded: false,
  busy: false,
  loading: false,
  devices: [],
  limits: {},
  presets: [],
  rulesKnown: false,
  assignments: [],
  filteredDevices: [],
  storageMode: 'local',
  routerControl: null,
  routerControlError: null
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
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.limits)); } catch { /* Backend remains the source of truth. */ }
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
  const account = window.parent?.NetheraAccount ?? window.NetheraAccount;
  const authHeader = (await account?.getAuthHeader?.()) ?? {};
  const response = await fetch(TIME_LIMITS_API_URL, {
    headers: { Accept: 'application/json', ...authHeader },
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`Zeitlimit-API antwortet mit ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('Zeitlimit-Antwort ist keine Liste');
  }

  setLimitRows(data);
  state.storageMode = 'backend';
}

function setLimitRows(data) {
  state.limits = {};
  data.forEach(limit => {
    const normalized = normalizeLimit(limit);
    if (normalized?.deviceId && state.securityDevices.some(device => Number(device.id) === Number(normalized.deviceId))) {
      state.limits[String(normalized.deviceId)] = normalized;
    }
  });
}

async function saveBackendLimit(deviceId, limit) {
  await NetheraApi.requireLive();
  const account = window.parent?.NetheraAccount ?? window.NetheraAccount;
  const authHeader = (await account?.getAuthHeader?.()) ?? {};
  const response = await fetch(`${TIME_LIMITS_API_URL}/${deviceId}`, {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...authHeader
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
  await NetheraApi.requireLive();
  const account = window.parent?.NetheraAccount ?? window.NetheraAccount;
  const authHeader = (await account?.getAuthHeader?.()) ?? {};
  const response = await fetch(`${TIME_LIMITS_API_URL}/${deviceId}`, { method: 'DELETE', headers: { ...authHeader } });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Loeschen fehlgeschlagen (${response.status})`);
  }
}

async function loadSecurityState() {
  const data = await NetheraApi.getSecurityState();
  state.dataMode = data.dataMode;
  state.rulesKnown = data.rulesKnown === true;
  state.presets = data.presets || [];
  state.assignments = data.assignments || [];
  state.securityDevices = data.devices || [];
  if (state.dataMode !== 'live') {
    setLimitRows(data.timeLimits || []);
    state.storageMode = state.dataMode;
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
  if (from < until) return current >= from && current < until;
  return current >= from || current < until;
}

function usedPercent(limit) {
  const budget = Number(limit?.dailyLimit) || 0;
  if (!budget) return 0;
  const used = Number(limit?.usedMinutesToday) || 0;
  return Math.min(100, Math.max(0, Math.round((used / budget) * 100)));
}

function presetForDevice(deviceId) {
  const assignment = state.assignments.find(item => Number(item.deviceId) === Number(deviceId));
  return state.presets.find(item => Number(item.id) === Number(assignment?.presetId)) || null;
}

function setStatus(text, tone = 'info') {
  const status = document.getElementById('statusBox');
  if (status) status.hidden = !text;
  status?.setAttribute('text', text);
  status?.setAttribute('state', tone);
}

function renderRouterControlStatus() {
  const summary = document.getElementById('routerControlStatus');
  if (summary) summary.textContent = state.dataMode === 'demo'
    ? 'Beispiel-Zeitpläne · Kein Gerät wird tatsächlich gesperrt.'
    : state.routerControlError
    ? 'Routerstatus konnte nicht geladen werden. Zeitregeln sind nicht als wirksam bestätigt.'
    : !state.routerControl
      ? 'Routerbestätigung noch nicht verfügbar. Zeitregeln werden zunächst nur gespeichert.'
      : state.routerControl.connection === 'online'
        ? 'Router erreichbar. Die Wirkung steht bei jeder Zeitregel.'
        : 'Router nicht erreichbar oder Status unbekannt. Gespeicherte Regeln sind nicht als wirksam bestätigt.';
  renderList();
}

async function loadRouterControlStatus() {
  try {
    state.routerControl = await NetheraApi.getRouterControlStatus();
    state.routerControlError = null;
  } catch (error) {
    state.routerControl = null;
    state.routerControlError = error;
  }
  renderRouterControlStatus();
}

function validLimitInput(from, until, dailyLimit, note) {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!time.test(from) || !time.test(until) || from === until) return 'Bitte zwei unterschiedliche Uhrzeiten angeben.';
  if (!Number.isInteger(dailyLimit) || dailyLimit < 0 || dailyLimit > 1440) return 'Das Tagesbudget muss zwischen 0 und 1440 Minuten liegen.';
  if (note.length > 160) return 'Die Notiz darf höchstens 160 Zeichen enthalten.';
  return '';
}

function updateStats() {
  if (!state.loaded) {
    ['statDevices', 'statLimited', 'statBlockedSoon', 'statAverage'].forEach(id => {
      document.getElementById(id)?.setAttribute('value', '—');
    });
    return;
  }
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

  document.querySelectorAll('[data-schedule]').forEach(button => { button.disabled = state.storageMode !== 'backend' || state.busy || !state.devices.length; });
  const saveButton = document.getElementById('saveLimitButton');
  if (saveButton) saveButton.disabled = !state.devices.length || state.storageMode !== 'backend';
  document.querySelectorAll('#limitForm input, #limitForm select:not(#deviceSelect)').forEach(control => {
    control.disabled = state.storageMode !== 'backend';
  });

  if (!state.devices.length) {
    select.innerHTML = '<option value="">Keine Geräte verfügbar</option>';
    select.disabled = true;
    updateSchedulePreview();
    return;
  }

  select.disabled = false;
  select.innerHTML = state.devices.map(device => {
    const key = deviceKey(device);
    const label = `${device.hostname || 'Unbekanntes Gerät'} · ${device.ipAddress || device.macAddress || 'ohne Adresse'}`;
    return `<option value="${escapeText(key)}">${escapeText(label)}</option>`;
  }).join('');

  loadSelectedLimit();
}

function loadSelectedLimit() {
  const key = document.getElementById('deviceSelect')?.value;
  const limit = state.limits[key] || {};

  const dailyLimit = document.getElementById('dailyLimit');
  const limitStatus = document.getElementById('limitStatus');
  // Preserve budgets created by another client instead of silently resetting them.
  dailyLimit.querySelectorAll?.('[data-custom-budget]').forEach(option => option.remove());
  const budget = String(limit.dailyLimit ?? 0);
  if (dailyLimit.options && ![...dailyLimit.options].some(option => option.value === budget)) {
    const option = new Option(formatMinutes(Number(budget)), budget);
    option.dataset.customBudget = 'true';
    dailyLimit.add(option);
  }
  dailyLimit.value = budget;
  limitStatus.value = limit.status || 'active';
  dailyLimit.dispatchEvent(new Event('change', { bubbles: true }));
  limitStatus.dispatchEvent(new Event('change', { bubbles: true }));
  document.getElementById('usedMinutesToday').value = String(limit.usedMinutesToday ?? 0);
  document.getElementById('blockedFrom').value = limit.from || '21:00';
  document.getElementById('blockedUntil').value = limit.until || '07:00';
  document.getElementById('limitNote').value = limit.note || '';
  document.querySelector('.advanced-settings').open = Number(limit.dailyLimit) > 0;
  document.getElementById('clearLimitButton').disabled = !state.limits[key] || state.storageMode !== 'backend';
  updateSchedulePreview();
}

// Segments cover one day exactly, including schedules that cross midnight.
function scheduleSegments(from, until, paused = false) {
  if (validLimitInput(from, until, 0, '')) return [];
  if (paused) return [{ start: 0, end: 1440, blocked: false }];
  const start = minutesSinceMidnight(from), end = minutesSinceMidnight(until);
  const points = [...new Set([0, start, end, 1440])].sort((a, b) => a - b);
  return points.slice(0, -1).map((point, index) => ({
    start: point, end: points[index + 1],
    blocked: start < end ? point >= start && point < end : point >= start || point < end
  }));
}

function updateSchedulePreview() {
  const key = document.getElementById('deviceSelect').value;
  const device = state.devices.find(item => deviceKey(item) === key);
  const from = document.getElementById('blockedFrom').value;
  const until = document.getElementById('blockedUntil').value;
  const paused = document.getElementById('limitStatus').value === 'paused';
  const daily = Number(document.getElementById('dailyLimit').value);
  const error = validLimitInput(from, until, daily, '');
  const overnight = from > until ? ' am nächsten Tag' : '';
  const preview = document.getElementById('schedulePreview');
  const timeline = document.getElementById('scheduleTimeline');
  if (!device || error) {
    preview.innerHTML = `<strong>${escapeText(device?.hostname || 'Kein Gerät ausgewählt')}</strong><p>${escapeText(!device ? 'Wähle ein Gerät, um seine Internetzeiten anzusehen.' : error)}</p>`;
    if (timeline) timeline.hidden = true;
    return;
  }
  preview.innerHTML = `
    <strong>${escapeText(device.hostname || 'Unbekanntes Gerät')}</strong>
    <p>${paused ? 'Zeitsperre ausgeschaltet' : `Geplant: täglich kein Internet von <b>${escapeText(from)}</b> bis <b>${escapeText(until)}</b>${overnight}.`}</p>
    <span>${paused ? 'Sperrzeit und Tageslimit sind pausiert.' : daily ? `Zusätzlich maximal ${formatMinutes(daily)} pro Tag.` : 'Außerhalb der Sperrzeit kein Tageslimit.'}</span>
    <small>Uhrzeit: ${escapeText(Intl.DateTimeFormat().resolvedOptions().timeZone)} · Routerwirkung separat prüfen</small>`;
  if (timeline) {
    timeline.hidden = false;
    const track = document.getElementById('scheduleTrack');
    track.innerHTML = scheduleSegments(from, until, paused).map(segment => `<span class="schedule-segment${segment.blocked ? ' blocked' : ''}" style="--segment-width:${(segment.end - segment.start) / 1440 * 100}%"></span>`).join('');
    track.setAttribute('aria-label', paused ? 'Keine Zeitsperre: Regel ausgeschaltet.' : `Geplante Sperrzeit täglich von ${from} bis ${until}${overnight}. Außerhalb keine Zeitsperre.`);
  }
  document.querySelectorAll('[data-schedule]').forEach(button => {
    const times = button.dataset.schedule === 'night' ? ['21:00', '07:00'] : ['14:00', '16:00'];
    button.setAttribute('aria-pressed', String(!paused && from === times[0] && until === times[1]));
  });
}

function applySchedulePreset(name) {
  if (state.storageMode !== 'backend' || state.busy || state.loading || !state.devices.length) return;
  const times = { night: ['21:00', '07:00'], homework: ['14:00', '16:00'] }[name];
  if (!times) return;
  document.getElementById('blockedFrom').value = times[0];
  document.getElementById('blockedUntil').value = times[1];
  const status = document.getElementById('limitStatus');
  status.value = 'active';
  status.dispatchEvent(new Event('change', { bubbles: true }));
  updateSchedulePreview();
}

function setLimitBusy(busy) {
  state.busy = busy;
  document.getElementById('limitForm')?.setAttribute('aria-busy', String(busy));
  document.querySelectorAll('#limitForm input, #limitForm select, #limitForm button, #limitsList button').forEach(control => {
    const viewOnly = control.id === 'deviceSelect' || control.dataset.action === 'edit';
    control.disabled = busy || (viewOnly ? !state.devices.length : state.storageMode !== 'backend');
  });
  if (!busy) {
    const key = document.getElementById('deviceSelect')?.value;
    document.getElementById('clearLimitButton').disabled = !state.limits[key] || state.storageMode !== 'backend';
    document.getElementById('saveLimitButton').disabled = !state.devices.length || state.storageMode !== 'backend';
  }
}

function renderList() {
  const list = document.getElementById('limitsList');
  if (!list) return;

  if (!state.filteredDevices.length) {
    list.innerHTML = state.loaded && state.devices.length
      ? '<empty-state title="Keine Treffer" text="Passe Suche oder Filter an."></empty-state>'
      : '<empty-state title="Keine Geräte" text="Noch keine Geräte verfügbar."></empty-state>';
    return;
  }

  const renderCard = device => {
    const key = deviceKey(device);
    const limit = state.limits[key];
    const blockedBySchedule = isBlockedNow(limit) || (limit?.status === 'active' && limit.dailyLimit > 0 && limit.usedMinutesToday >= limit.dailyLimit);
    const routerResult = state.routerControl?.timeLimits?.[device.id];
    const confirmed = state.routerControl?.connection === 'online' && routerResult?.applied === true;
    const blocked = confirmed && routerResult.blockedNow === true;
    const paused = limit?.status === 'paused';
    const percent = limit ? usedPercent(limit) : 0;
    const preset = presetForDevice(device.id);
    const cardState = blocked ? 'is-blocked' : paused ? 'is-paused' : '';
    const statusBadge = !limit
      ? '<span class="badge">Keine Regel</span>'
      : state.dataMode === 'demo'
        ? `<span class="badge">Beispiel · ${paused ? 'pausiert' : 'eingeschaltet'}</span>`
      : blocked
        ? '<span class="badge danger">Am Router gesperrt</span>'
        : paused
          ? `<span class="badge paused">Ausgeschaltet · ${confirmed ? 'am Router bestätigt' : 'nur gespeichert'}</span>`
          : confirmed
            ? '<span class="badge ok">Am Router bestätigt</span>'
            : '<span class="badge">Nur gespeichert</span>';

    return `
      <article class="limit-card ${cardState}">
        <div class="limit-main">
          <div class="limit-title-row">
            <h3>${escapeText(device.hostname || 'Unbekanntes Gerät')}</h3>
            ${statusBadge}
          </div>
          <p class="limit-summary">${limit
            ? `Sperrzeit ${escapeText(limit.from)}–${escapeText(limit.until)}${limit.dailyLimit > 0 ? ` · ${formatMinutes(limit.dailyLimit)} pro Tag` : ''}`
            : 'Noch keine Internetzeiten festgelegt.'}</p>
          ${limit && !paused && !confirmed && blockedBySchedule && state.dataMode !== 'demo' ? '<p class="limit-summary">Zeitfenster läuft rechnerisch; Routerwirkung nicht bestätigt.</p>' : ''}
          ${limit?.dailyLimit > 0 ? `<div class="budget-bar" role="progressbar" aria-label="Tageslimit genutzt" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><span style="--budget: ${percent}%"></span></div>` : ''}
          <details class="limit-details"><summary>Gerätedetails</summary><div class="limit-meta">
            <span>IP: ${escapeText(device.ipAddress || '–')}</span>
            <span>MAC: ${escapeText(device.macAddress || '–')}</span>
            <span>Vorlage: ${escapeText(preset?.name || (state.rulesKnown ? 'Keine' : 'Nicht vom Router gemeldet'))}</span>
            ${limit?.note ? `<span>Notiz: ${escapeText(limit.note)}</span>` : ''}
            ${limit?.dailyLimit > 0 ? `<span>${Number(limit.usedMinutesToday) || 0} Minuten heute erfasst</span>` : ''}
          </div></details>
        </div>
        <div class="limit-side">
          <button class="small-btn" type="button" data-action="edit" data-key="${escapeText(key)}">${state.storageMode !== 'backend' ? 'Ansehen' : limit ? 'Bearbeiten' : 'Einrichten'}</button>
          ${limit ? `<button class="small-btn ghost" type="button" data-action="toggle" data-key="${escapeText(key)}" ${state.storageMode !== 'backend' ? 'disabled' : ''}>${paused ? 'Regel einschalten' : 'Regel ausschalten'}</button>` : ''}
        </div>
      </article>
    `;
  };

  const withRule = state.filteredDevices.filter(device => state.limits[deviceKey(device)]);
  const withoutRule = state.filteredDevices.filter(device => !state.limits[deviceKey(device)]);
  const filter = document.getElementById('statusFilter')?.value || 'all';
  if (filter === 'all') {
    list.innerHTML = `${withRule.length
      ? withRule.map(renderCard).join('')
      : '<p class="helper-text">Noch keine Internetzeiten eingerichtet.</p>'}
      ${withoutRule.length ? `<details class="unconfigured-devices"><summary>Geräte ohne Regel (${withoutRule.length})</summary><div class="limit-list">${withoutRule.map(renderCard).join('')}</div></details>` : ''}`;
  } else {
    list.innerHTML = state.filteredDevices.map(renderCard).join('');
  }
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
  if (state.loading || state.busy) return;
  state.loading = true;
  state.storageMode = 'unavailable';
  setLimitBusy(true);
  setStatus('Lade Internetzeiten ...');

  try {
    await loadSecurityState();
    try {
      if (state.dataMode === 'live') await loadBackendLimits();
    } catch {
      state.limits = {};
      state.storageMode = 'unavailable';
    }

    const devices = state.securityDevices || [];
    state.loaded = state.storageMode === 'backend' || state.storageMode === 'demo';
    state.devices = devices
      .map(device => ({
        id: device.id,
        hostname: device.hostname,
        ipAddress: device.ipAddress,
        macAddress: device.macAddress,
        connectionType: normalizeConnectionType(device.connectionType),
        lastSeen: device.lastSeen
      }));

    renderDeviceOptions();
    applyFilters();
    setStatus(state.storageMode === 'backend'
      ? `${state.devices.length} Geräte · Internetzeiten aktualisiert.`
      : state.storageMode === 'demo' ? ''
        : 'Internetzeiten konnten nicht geladen werden. Speichern ist derzeit nicht möglich.',
    state.storageMode === 'backend' ? 'success' : 'warning');
  } catch (error) {
    state.loaded = false;
    state.dataMode = 'unavailable';
    state.storageMode = 'unavailable';
    state.devices = [];
    state.limits = {};
    document.getElementById('clearLimitButton').disabled = true;
    renderDeviceOptions();
    applyFilters();
    setStatus(NetheraApi.userMessage(error), 'error');
  }
  await loadRouterControlStatus();
  state.loading = false;
  setLimitBusy(false);
}

async function saveSelectedLimit(event) {
  event.preventDefault();
  if (state.busy || state.loading) return;

  const key = document.getElementById('deviceSelect')?.value;
  if (!key) {
    setStatus('Bitte zuerst ein Gerät auswählen.', 'error');
    return;
  }

  if (state.storageMode !== 'backend') return setStatus('Nicht gespeichert. Bitte prüfe die Verbindung und versuche es erneut.', 'error');
  const from = document.getElementById('blockedFrom').value;
  const until = document.getElementById('blockedUntil').value;
  const dailyLimit = Number(document.getElementById('dailyLimit').value);
  const note = document.getElementById('limitNote').value.trim();
  const validationError = validLimitInput(from, until, dailyLimit, note);
  if (validationError) return setStatus(validationError, 'error');

  const nextLimit = {
    dailyLimit,
    usedMinutesToday: Number(document.getElementById('usedMinutesToday').value) || 0,
    status: document.getElementById('limitStatus').value,
    from,
    until,
    note,
    updatedAt: new Date().toISOString()
  };

  setLimitBusy(true);
  try {
    state.limits[key] = await saveBackendLimit(key, nextLimit);
  } catch (error) {
    setStatus(`${NetheraApi.userMessage(error)} Deine Eingaben bleiben erhalten.`, 'error');
    return;
  } finally { setLimitBusy(false); }

  saveLimits();
  loadSelectedLimit();
  applyFilters();
  await loadRouterControlStatus();
  setStatus('Internetzeit gespeichert. Die Routerwirkung ist separat ausgewiesen.', 'success');
}

async function clearSelectedLimit() {
  if (state.busy || state.loading) return;
  const key = document.getElementById('deviceSelect')?.value;
  if (!key) return;
  if (state.storageMode !== 'backend') return setStatus('Nicht entfernt. Bitte prüfe die Verbindung und versuche es erneut.', 'error');

  if (state.storageMode === 'backend') {
    try {
      setLimitBusy(true);
      await deleteBackendLimit(key);
    } catch (error) {
      setStatus(NetheraApi.userMessage(error), 'error');
      return;
    } finally { setLimitBusy(false); }
  }

  delete state.limits[key];
  saveLimits();
  loadSelectedLimit();
  applyFilters();
  await loadRouterControlStatus();
  setStatus('Zeitlimit aus dem Backend entfernt. Die Routerwirkung ist separat ausgewiesen.', 'success');
}

async function handleListClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button || state.busy || state.loading) return;

  const key = button.dataset.key;
  const select = document.getElementById('deviceSelect');
  if (select) {
    select.value = key;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  if (button.dataset.action === 'edit') {
    loadSelectedLimit();
    document.getElementById('limitForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  if (button.dataset.action === 'toggle') {
    if (!state.limits[key]) return;
    if (state.storageMode !== 'backend') return setStatus('Nicht gespeichert. Bitte prüfe die Verbindung und versuche es erneut.', 'error');
    const current = { ...state.limits[key] };
    current.status = current.status === 'paused' ? 'active' : 'paused';
    current.updatedAt = new Date().toISOString();

    if (state.storageMode === 'backend') {
      try {
        setLimitBusy(true);
        state.limits[key] = await saveBackendLimit(key, current);
      } catch (error) {
        setStatus(NetheraApi.userMessage(error), 'error');
        return;
      } finally { setLimitBusy(false); }
    } else {
      saveLimits();
    }

    loadSelectedLimit();
    applyFilters();
    await loadRouterControlStatus();
    setStatus(current.status === 'active' ? 'Regel eingeschaltet gespeichert. Routerwirkung separat prüfen.' : 'Regel ausgeschaltet gespeichert. Routerwirkung separat prüfen.', 'success');
  }
}

function setupEvents() {
  document.querySelectorAll('[data-schedule]').forEach(button => button.addEventListener('click', () => applySchedulePreset(button.dataset.schedule)));
  document.querySelector('app-hero')?.addEventListener('hero-click', loadDevices);
  document.getElementById('limitForm')?.addEventListener('submit', saveSelectedLimit);
  document.getElementById('clearLimitButton')?.addEventListener('click', clearSelectedLimit);
  document.getElementById('deviceSelect')?.addEventListener('change', loadSelectedLimit);
  document.getElementById('searchInput')?.addEventListener('input', applyFilters);
  document.getElementById('statusFilter')?.addEventListener('change', applyFilters);
  document.getElementById('limitsList')?.addEventListener('click', handleListClick);
  document.getElementById('limitForm')?.addEventListener('input', updateSchedulePreview);
  document.getElementById('limitForm')?.addEventListener('change', updateSchedulePreview);
  document.getElementById('refreshRouterControl')?.addEventListener('click', loadRouterControlStatus);
}

document.addEventListener('DOMContentLoaded', () => {
  setupEvents();
  loadDevices();
  NetheraApi.watchSource(loadDevices);
});
