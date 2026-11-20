(() => {
  const $ = id => document.getElementById(id);
  const { buildModel, onlineOnly, topologyHubs, matchingDevices } = window.NetheraTopology;
  // fullModel = every stored device; model = what is shown (all, or only the online ones)
  let fullModel = null, onlyOnline = false;
  let model = null, graph = null, mode = 'groups', groupFilter = '', selectedId = '';
  let resizeObserver = null, layout = null;
  let detailsOpen = false;
  try { const saved = localStorage.getItem('nethera.topology.layout'); if (['klassisch', 'baum'].includes(saved)) layout = saved; } catch {}
  let sourceRouter = null, sourceRules = null, draftKey = null, draftRevision;
  let loadVersion = 0;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const row = (name, value) => `<div><dt>${escape(name)}</dt><dd>${escape(value)}</dd></div>`;
  const date = value => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' }) : 'Nicht bekannt';
  const presetTitle = device => device.preset?.name || (device.presetDraft ? 'Keine Vorlage im Entwurf'
    : !device.rulesKnown ? 'Nicht vom Router gemeldet' : device.assignment ? 'Vorlagendetails fehlen' : 'Keine Vorlage zugewiesen');

  function notice(message) {
    $('network-notice').textContent = message;
    $('network-notice').hidden = !message;
  }

  function currentDraftKey(router) {
    const account = window.parent?.NetheraAccount ?? window.NetheraAccount;
    return NetheraSecurityDraft.keyFor(window.NETHERA_CONFIG.API_BASE_URL, account?.keycloak?.tokenParsed?.sub, router);
  }

  function refreshDraft(force = false) {
    if (!sourceRouter) return;
    let rules = sourceRules, draftError = false;
    try {
      const revision = sessionStorage.getItem(draftKey);
      if (!force && revision === draftRevision) return;
      draftRevision = revision;
      // Overlay only assignments, never the router's device inventory or connection state.
      if (rules && ['live', 'demo'].includes(sourceRouter.dataMode)) {
        rules = NetheraSecurityDraft.create(sessionStorage, draftKey).snapshot({ ...rules, devices: sourceRouter.devices });
      }
    } catch { draftError = true; }
    fullModel = buildModel(sourceRouter, rules);
    notice(draftError ? 'Lokaler Entwurf nicht lesbar. Die Topologie zeigt nur den geladenen Ausgangsstand.'
      : fullModel.hasLocalDraft ? 'Lokale Vorschau · Gruppen und Regeln enthalten deine Entwürfe. Verbindungsdaten bleiben unverändert; keine Übertragung an den Router.'
      : fullModel.rulesKnown ? '' : 'Gruppen und Vorlagen sind nicht vollständig vom Router gemeldet. Verbindungsdaten werden weiterhin angezeigt.');
    applyOnlineFilter();
  }

  async function load() {
    const version = ++loadVersion;
    $('reload-network').disabled = true;
    $('network-summary').textContent = 'Netzwerk wird geladen …';
    try {
      const router = await NetheraApi.getPrimaryRouter();
      let rules = null;
      try { rules = await NetheraApi.getSecurityState(router); } catch {}
      if (version !== loadVersion) return;
      const key = currentDraftKey(router);
      if (key !== draftKey) { groupFilter = ''; selectedId = ''; $('device-search').value = ''; }
      sourceRouter = router; sourceRules = rules; draftKey = key;
      refreshDraft(true);
    } catch {
      if (version !== loadVersion) return;
      sourceRouter = null; sourceRules = null; draftKey = null;
      resizeObserver?.disconnect(); resizeObserver = null;
      model = null; fullModel = null;
      $('online-filter').disabled = true;
      graph?.destroy(); graph = null;
      $('graph-caption').hidden = true;
      $('device-details').innerHTML = '';
      setDetails(false); setSearch(false); updateDeviceBar();
      $('group-legend').innerHTML = '';
      $('device-picker').innerHTML = '<option value="">Keine Gerätedaten</option>';
      notice('Netzwerk konnte nicht geladen werden. Bitte Anmeldung und Backend prüfen und erneut laden.');
      $('network-summary').textContent = model ? 'Letzter geladener Stand' : 'Keine Netzwerkdaten';
      if (!model) { $('graph-empty').textContent = 'Netzwerk nicht verfügbar'; $('graph-empty').hidden = false; }
    } finally { if (version === loadVersion) $('reload-network').disabled = false; }
  }

  // Switches between all stored devices and the ones connected right now
  function applyOnlineFilter() {
    if (!fullModel) return;
    const online = fullModel.devices.filter(device => device.online).length;
    model = onlyOnline ? onlineOnly(fullModel) : fullModel;
    if (!model.groups.some(group => group.id === groupFilter)) groupFilter = '';
    if (!model.devices.some(device => device.id === selectedId)) selectedId = '';
    $('online-filter').disabled = false;
    $('online-filter').setAttribute('aria-pressed', String(onlyOnline));
    $('online-count').textContent = online;
    $('network-summary').textContent = `${fullModel.devices.length} Geräte · ${online} online · ${model.hasLocalDraft ? 'Lokale Gruppenvorschau' : model.rulesKnown ? `${model.groups.length} Gruppen` : 'Gruppenzuordnung unvollständig'} · ${model.router.name}`;
    renderLegend(); filterGraph();
    if (selectedId) selectDevice(selectedId);
  }

  function renderLegend() {
    $('group-legend').replaceChildren();
    model.groups.forEach(group => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'legend-item';
      button.dataset.group = group.id;
      button.style.setProperty('--group-color', group.color);
      button.setAttribute('aria-pressed', String(group.id === groupFilter));
      if (group.color) {
        const swatch = document.createElement('span');
        swatch.className = 'swatch'; swatch.style.setProperty('--group-color', group.color); swatch.setAttribute('aria-hidden', 'true');
        button.appendChild(swatch);
      }
      button.appendChild(document.createTextNode(group.name));
      if (group.localDraft) button.title = 'Lokaler Entwurf, nicht an den Router gesendet';
      const count = document.createElement('span'); count.className = 'legend-count'; count.textContent = group.count; button.appendChild(count);
      button.addEventListener('click', () => { groupFilter = groupFilter === group.id ? '' : group.id; renderLegend(); filterGraph(); });
      $('group-legend').appendChild(button);
    });
  }

  function fit() {
    const height = layout === 'baum' ? document.querySelector('.legend-bar').offsetHeight : 0;
    document.querySelector('.topology-body').style.setProperty('--legend-height', `${height}px`);
    graph?.fit();
  }

  function renderGraph() {
    graph?.destroy();
    if (!layout) layout = $('network-graph').clientWidth < 700 ? 'baum' : 'klassisch';
    document.querySelector('.topology-body').dataset.activeLayout = layout;
    document.querySelectorAll('button[data-layout]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.layout === layout)));
    ['zoom-in', 'zoom-out', 'reset-network'].forEach(id => { $(id).hidden = layout === 'baum'; });
    $('device-bar').hidden = layout === 'baum';
    const renderer = layout === 'baum' ? window.NetheraTopologyTree : window.NetheraTopologyClassic;
    graph = renderer.render($('network-graph'), {
      model, hubs: topologyHubs(model, mode), mode, groupFilter, query: $('device-search').value, selectedId,
      scope: draftKey,
      onSelect(id) {
        setSearch(false);
        if (!id || id === selectedId) { clearSelection(); return; }
        detailsOpen = false;
        selectDevice(id);
      },
      onHubClick(hub) {
        if (hub.kind !== 'group') return;
        groupFilter = groupFilter === hub.id ? '' : hub.id;
        renderLegend(); filterGraph();
      }
    });
    if (!resizeObserver) {
      resizeObserver = new ResizeObserver(fit);
      resizeObserver.observe($('network-graph'));
      resizeObserver.observe(document.querySelector('.legend-bar'));
    }
    $('graph-caption').textContent = model.hasLocalDraft ? mode === 'groups' ? 'Gruppen inklusive lokaler Entwürfe' : 'Verbindungen unverändert · Regeln als Entwurf'
      : model.router.dataMode === 'demo' ? ''
      : mode === 'groups' ? model.rulesKnown ? 'Gruppenzuordnung vom Router' : 'Nur verifizierte Gruppenzuordnungen' : 'Verbindungstyp laut Gerätedaten';
    $('graph-caption').hidden = !$('graph-caption').textContent;
    $('network-graph').setAttribute('aria-label', `Netzwerkgraph mit ${model.devices.length} Geräten. Auswahl auch unter Gerät auswählen.`);
    fit();
  }

  function filterGraph() {
    if (!model) return;
    const matches = matchingDevices(model, $('device-search').value, groupFilter);
    const filtered = Boolean(groupFilter || $('device-search').value.trim());
    $('device-picker').replaceChildren(new Option(filtered ? `${matches.length} Geräte gefunden` : 'Netzwerkübersicht', ''));
    matches.forEach(device => $('device-picker').add(new Option(device.name, device.id)));
    if (!matches.some(device => device.id === selectedId)) selectedId = '';
    $('device-picker').value = selectedId;
    $('graph-empty').hidden = matches.length > 0;
    $('graph-empty').textContent = model.devices.length ? 'Keine passenden Geräte' : onlyOnline && fullModel.devices.length ? 'Gerade ist kein Gerät online' : 'Noch keine Geräte vorhanden';
    renderGraph();
    showDetails();
  }

  function selectDevice(id) {
    if (!model?.devices.some(device => device.id === id)) return;
    if (![...$('device-picker').options].some(option => option.value === id)) {
      groupFilter = ''; $('device-search').value = ''; renderLegend(); filterGraph();
    }
    selectedId = id; $('device-picker').value = id;
    graph.select(id);
    showDetails();
  }

  function showDetails() {
    if (!model) return;
    updateDeviceBar();
    const demo = model.router.dataMode === 'demo';
    const device = model.devices.find(item => item.id === selectedId);
    if (!device) {
      $('device-details').replaceChildren();
      setDetails(false);
      return;
    }
    const preset = device.preset;
    const limit = device.timeLimit;
    const presetName = presetTitle(device);
    const paused = device.assignment?.status === 'paused';
    const limitText = !limit ? 'Keine Zeitregel geladen' : limit.status === 'paused' ? 'Pausiert' : limit.blockedFrom && limit.blockedUntil ? `${limit.blockedFrom}–${limit.blockedUntil}` : 'Kein Sperrzeitraum';
    $('device-details').innerHTML = `<p class="detail-kicker">Gerät</p><h2>${escape(device.name)}</h2>
      <dl class="detail-primary"><dt>Gruppe</dt><dd>${device.groups.map(group => `<span class="detail-group"><span class="swatch" style="--group-color:${group.color}"></span>${escape(group.name)}</span>`).join('')}${device.groupDraft ? '<span class="assignment-state">Lokaler Entwurf</span>' : ''}</dd>
      <dt>Status</dt><dd class="${device.online ? 'status-online' : 'status-offline'}">${device.online ? 'Online' : 'Offline'}</dd>
      <dt>Verbindung</dt><dd>${escape(device.connection)}</dd><dt>IP</dt><dd>${escape(device.ip)}</dd><dt>MAC</dt><dd>${escape(device.mac)}</dd>
      <dt>Vorlage</dt><dd>${escape(presetName)}${device.assignment || device.presetDraft ? `<span class="assignment-state">${device.presetDraft ? 'Lokaler Entwurf' : demo ? 'Beispiel' : paused ? 'Zuweisung pausiert' : 'Gespeichert'}${demo && paused ? ' · pausiert' : ''}</span>` : ''}</dd></dl>
      <details class="detail-more"><summary>Regeln und Verbindungsdetails</summary>
      <p class="detail-note">${demo ? 'Keine Wirkung auf deinen Router.' : 'Die Routerwirkung ist hier nicht bestätigt.'}</p>
      <section class="detail-section"><h3>Regeln${device.presetDraft || limit?.localDraft || device.blocklist?.localDraft ? ' im Entwurf' : ''}</h3><dl>${row('Priorität', (!device.rulesKnown && !device.presetDraft || device.assignment) && !preset ? 'Nicht verfügbar' : paused ? 'Vorlage pausiert' : preset?.priorityMode ? 'Bevorzugt' : 'Normal')}${row('Sperrzeit', limitText)}${row('Tagesbudget', !limit ? 'Nicht verfügbar' : limit.dailyLimitMinutes ? `${limit.dailyLimitMinutes} Minuten` : 'Kein Tagesbudget')}${row('Vorlagen-Blockliste', device.blocklist?.name || (preset?.blocklistId === null ? 'Keine' : !device.rulesKnown || preset?.blocklistId ? 'Nicht verfügbar' : 'Keine'))}</dl></section>
      <section class="detail-section"><dl>${row('Zuletzt gesehen', date(device.lastSeen))}</dl></section></details>`;
    setDetails((detailsOpen || layout === 'baum') && $('device-search-panel').hidden);
  }

  function clearSelection() {
    selectedId = ''; graph?.select(''); $('device-picker').value = ''; showDetails();
  }

  function setSearch(open) {
    $('device-search-panel').hidden = !open;
    $('open-device-search').setAttribute('aria-expanded', String(open));
    if (open) { setDetails(false); $('device-search').focus(); }
  }

  function setDetails(open) {
    detailsOpen = Boolean(open && selectedId && model);
    $('device-details-panel').hidden = !detailsOpen;
    $('device-bar-details').setAttribute('aria-expanded', String(detailsOpen));
    if (detailsOpen) setSearch(false);
  }

  function updateDeviceBar() {
    const device = model?.devices.find(item => item.id === selectedId);
    const bar = $('device-bar-details');
    bar.disabled = !device;
    bar.innerHTML = device
      ? `<i class="tree-status${device.online ? '' : ' offline-dot'}" aria-hidden="true"></i><span><b>${escape(device.name)}</b> · ${escape(device.groups.map(group => group.name).join(', '))} · ${escape(presetTitle(device))} · ${escape(device.connection)} ${escape(device.ip)} · ${device.online ? 'online' : 'offline'}</span>`
      : `<span>${model ? `${escape(model.router.name)} · ${model.devices.length} Geräte · ${model.devices.filter(item => item.online).length} online` : 'Keine Netzwerkdaten'}</span>`;
    const empty = !model || !matchingDevices(model, $('device-search').value, groupFilter).length;
    $('previous-device').disabled = $('next-device').disabled = empty;
  }

  function stepDevice(direction) {
    if (!model) return;
    const matching = new Set(matchingDevices(model, $('device-search').value, groupFilter).map(device => device.id));
    const order = [...new Map(topologyHubs(model, mode).flatMap(hub => hub.devices).filter(device => matching.has(device.id)).map(device => [device.id, device])).values()];
    if (!order.length) return;
    const index = order.findIndex(device => device.id === selectedId);
    const next = index < 0 ? direction > 0 ? 0 : order.length - 1 : (index + direction + order.length) % order.length;
    selectDevice(order[next].id);
  }

  $('reload-network').addEventListener('click', load);
  $('online-filter').addEventListener('click', () => { onlyOnline = !onlyOnline; applyOnlineFilter(); });
  $('open-device-search').addEventListener('click', () => setSearch($('device-search-panel').hidden));
  $('close-device-search').addEventListener('click', () => { setSearch(false); $('open-device-search').focus(); });
  $('close-device-details').addEventListener('click', () => { clearSelection(); $('open-device-search').focus(); });
  $('device-bar-details').addEventListener('click', () => setDetails(!detailsOpen));
  $('previous-device').addEventListener('click', () => stepDevice(-1));
  $('next-device').addEventListener('click', () => stepDevice(1));
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!$('device-search-panel').hidden) { setSearch(false); $('open-device-search').focus(); }
    else if (detailsOpen) { setDetails(false); $('open-device-search').focus(); }
  });
  $('device-search').addEventListener('input', filterGraph);
  $('device-picker').addEventListener('change', event => {
    if (event.target.value) { selectDevice(event.target.value); setDetails(true); }
    else clearSelection();
  });
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    if (!model || mode === button.dataset.view) return;
    mode = button.dataset.view;
    document.querySelectorAll('[data-view]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    filterGraph();
  }));
  document.querySelectorAll('button[data-layout]').forEach(button => button.addEventListener('click', () => {
    if (!model || layout === button.dataset.layout) return;
    layout = button.dataset.layout;
    try { localStorage.setItem('nethera.topology.layout', layout); } catch {}
    renderGraph();
    detailsOpen = false; showDetails();
  }));
  const workspace = document.querySelector('.topology-workspace');
  const fullscreenButton = $('fullscreen-network');
  function updateFullscreen() {
    const active = document.fullscreenElement === workspace;
    fullscreenButton.setAttribute('aria-pressed', String(active));
    fullscreenButton.setAttribute('aria-label', active ? 'Vollbild beenden' : 'Vollbild öffnen');
    fullscreenButton.title = active ? 'Vollbild beenden' : 'Vollbild öffnen';
    fullscreenButton.innerHTML = `<i data-lucide="${active ? 'minimize' : 'maximize'}"></i>`;
    window.lucide?.createIcons({ attrs: { 'aria-hidden': 'true', 'stroke-width': 1.8 } });
    requestAnimationFrame(fit);
  }
  fullscreenButton.addEventListener('click', async () => {
    fullscreenButton.disabled = true;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (workspace.requestFullscreen) await workspace.requestFullscreen();
      else throw new Error('Fullscreen unavailable');
    } catch {
      notice('Vollbild konnte nicht geöffnet werden. Bitte prüfe, ob dein Browser Vollbild für diese Seite erlaubt.');
    } finally { fullscreenButton.disabled = false; }
  });
  document.addEventListener('fullscreenchange', updateFullscreen);
  $('reset-network').addEventListener('click', () => graph?.reset());
  ['zoom-in', 'zoom-out'].forEach(id => $(id).addEventListener('click', () => {
    graph?.zoom?.(id === 'zoom-in' ? 1.2 : 1 / 1.2);
  }));
  window.addEventListener('pagehide', () => { resizeObserver?.disconnect(); graph?.destroy(); });
  window.addEventListener('storage', event => {
    if (sourceRouter && event.storageArea === sessionStorage && (event.key === draftKey || event.key === null)) refreshDraft();
  });
  window.addEventListener('focus', () => {
    if (!sourceRouter) return;
    if (currentDraftKey(sourceRouter) !== draftKey) load();
    else refreshDraft();
  });
  window.addEventListener('pageshow', event => { if (event.persisted) load(); });
  window.lucide?.createIcons({ attrs: { 'aria-hidden': 'true', 'stroke-width': 1.8 } });
  load();
  NetheraApi.watchSource(load);
})();
