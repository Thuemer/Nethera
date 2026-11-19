(() => {
  const $ = id => document.getElementById(id);
  const { buildModel, onlineOnly, graphElements, matchingDevices } = window.NetheraTopology;
  // fullModel = every stored device; model = what is shown (all, or only the online ones)
  let fullModel = null, onlyOnline = false;
  let model = null, graph = null, mode = 'groups', groupFilter = '', selectedId = '';
  let initialPositions = null, resizeObserver = null;
  let sourceRouter = null, sourceRules = null, draftKey = null, draftRevision;
  let loadVersion = 0;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const row = (name, value) => `<div><dt>${escape(name)}</dt><dd>${escape(value)}</dd></div>`;
  const date = value => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' }) : 'Nicht bekannt';

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
      resizeObserver?.disconnect();
      model = null; fullModel = null;
      $('online-filter').disabled = true;
      graph?.destroy(); graph = null;
      $('device-details').innerHTML = '';
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
    renderLegend(); renderGraph(); filterGraph();
    if (selectedId) selectDevice(selectedId);
  }

  function renderLegend() {
    $('group-legend').replaceChildren();
    [{ id: '', name: 'Alle', count: model.devices.length }, ...model.groups].forEach(group => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'legend-item';
      button.dataset.group = group.id;
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
    if (!graph) return;
    graph.resize();
    graph.nodes().style({ 'font-size': 12, 'text-max-width': 110, width: 42, height: 42 });
    graph.nodes('[kind = "group"]').style({ width: 32, height: 32 });
    graph.nodes('[kind = "router"]').style({ width: 86, height: 86, label: graph.width() < 600 ? '' : 'data(label)' });
    graph.fit(graph.elements(), 48);
    // Keep labels readable when a full graph is fitted into a narrow viewport.
    for (let pass = 0; pass < 3; pass++) {
      const scale = graph.zoom();
      const minFont = graph.width() < 600 ? 10 : 12;
      graph.nodes().style({ 'font-size': Math.max(12, minFont / scale), 'text-max-width': 84 / scale, width: Math.max(42, 23 / scale), height: Math.max(42, 23 / scale) });
      graph.nodes('[kind = "group"]').style({ width: Math.max(32, 18 / scale), height: Math.max(32, 18 / scale) });
      graph.nodes('[kind = "router"]').style({ width: Math.max(86, 46 / scale), height: Math.max(86, 46 / scale) });
      graph.fit(graph.elements(), 48);
    }
    if (graph.zoom() > 1.2) graph.zoom({ level: 1.2, renderedPosition: { x: graph.width() / 2, y: graph.height() / 2 } });
  }

  function renderGraph() {
    graph?.destroy(); resizeObserver?.disconnect();
    graph = cytoscape({
      container: $('network-graph'), elements: graphElements(model, mode),
      minZoom: .02, maxZoom: 2.5, selectionType: 'single', boxSelectionEnabled: false,
      style: [
        { selector: 'node', style: { label: 'data(label)', 'background-color': 'data(color)', width: 42, height: 42, 'border-width': 2, 'border-color': '#001818', color: '#e4e9eb', 'font-family': 'Avenir Next, Segoe UI, sans-serif', 'font-size': 12, 'text-valign': 'bottom', 'text-margin-y': 9, 'text-wrap': 'wrap', 'text-max-width': 110, 'text-background-color': '#001818', 'text-background-opacity': .85, 'text-background-padding': 3, 'overlay-opacity': 0 } },
        { selector: 'node[kind = "router"]', style: { width: 86, height: 86, 'background-image': 'router.png', 'background-fit': 'contain', 'background-width': '80%', 'background-height': '80%', 'border-width': 2, 'border-color': '#63e5c5', 'underlay-color': '#63e5c5', 'underlay-padding': 14, 'underlay-shape': 'ellipse', 'underlay-opacity': .08, 'font-weight': 600 } },
        { selector: 'node[kind = "group"]', style: { width: 32, height: 32, 'background-opacity': .18, 'border-color': 'data(color)', 'border-width': 2, 'font-weight': 600 } },
        { selector: 'edge', style: { width: 1.4, 'line-color': '#617078', 'curve-style': 'bezier', 'overlay-opacity': 0 } },
        { selector: 'node[kind = "device"][online = 0]', style: { 'background-opacity': .3, 'border-style': 'dashed', 'border-color': '#617078', color: '#9aa8b0' } },
        { selector: '.muted', style: { opacity: .13 } },
        { selector: 'node:selected', style: { 'border-color': '#63e5c5', 'border-width': 4 } },
        { selector: 'edge.highlighted', style: { 'line-color': '#9cd6cd', width: 2 } }
      ],
      layout: { name: 'preset', padding: 60 }
    });
    // Stable rings keep groups apart and prevent the narrow, overlapping mobile layout.
    function arrange() {
      const hubs = graph.nodes('[kind = "group"]');
      const devices = graph.nodes('[kind = "device"]');
      graph.getElementById('router').position({ x: 0, y: 0 });
      const slots = devices.length + hubs.length * 1.5;
      let offset = -Math.PI / 2;
      hubs.forEach(hub => {
        const children = devices.filter(node => node.connectedEdges()[0]?.source().id() === hub.id());
        const arc = (children.length + 1.5) / Math.max(1, slots) * Math.PI * 2;
        const angle = offset + arc / 2;
        const radius = Math.max(320, devices.length * 26);
        hub.position({ x: Math.cos(angle) * radius * .58, y: Math.sin(angle) * radius * .58 });
        children.forEach((node, index) => {
          const theta = offset + arc * (index + 1) / (children.length + 1);
          node.position({ x: Math.cos(theta) * radius, y: Math.sin(theta) * radius });
        });
        offset += arc;
      });
    }
    arrange(); fit();
    initialPositions = new Map(graph.nodes().map(node => [node.id(), { ...node.position() }]));
    graph.on('tap', 'node', event => {
      const node = event.target;
      if (node.data('kind') === 'device') {
        selectDevice(node.id());
        if (window.matchMedia('(max-width: 700px)').matches) document.querySelector('.network-inspector').scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
      else if (node.data('kind') === 'group' && mode === 'groups') { groupFilter = groupFilter === node.id() ? '' : node.id(); renderLegend(); filterGraph(); }
      else { selectedId = ''; graph.nodes().unselect(); graph.edges().removeClass('highlighted'); showDetails(); $('device-picker').value = ''; }
    });
    graph.on('tap', event => { if (event.target === graph) { selectedId = ''; graph.nodes().unselect(); graph.edges().removeClass('highlighted'); showDetails(); $('device-picker').value = ''; } });
    let compactLayout = graph.width() < 600;
    resizeObserver = new ResizeObserver(() => {
      graph.resize();
      const compact = graph.width() < 600;
      fit();
      if (compact !== compactLayout) {
        compactLayout = compact;
        arrange(); fit();
        initialPositions = new Map(graph.nodes().map(node => [node.id(), { ...node.position() }]));
      }
    });
    resizeObserver.observe($('network-graph'));
    $('graph-caption').textContent = model.hasLocalDraft ? mode === 'groups' ? 'Gruppen inklusive lokaler Entwürfe' : 'Verbindungen unverändert · Regeln als Entwurf'
      : model.router.dataMode === 'demo' ? 'Beispiel-Netzwerk · Nur Ansicht'
      : mode === 'groups' ? model.rulesKnown ? 'Gruppenzuordnung vom Router' : 'Nur verifizierte Gruppenzuordnungen' : 'Verbindungstyp laut Gerätedaten';
    $('network-graph').setAttribute('aria-label', `Netzwerkgraph mit ${model.devices.length} Geräten. Auswahl auch unter Gerät auswählen.`);
  }

  function filterGraph() {
    if (!model || !graph) return;
    const matches = matchingDevices(model, $('device-search').value, groupFilter);
    const filtered = Boolean(groupFilter || $('device-search').value.trim());
    graph.elements().removeClass('muted');
    if (filtered) {
      graph.elements().addClass('muted');
      let visible = graph.getElementById('router');
      matches.forEach(device => {
        const node = graph.getElementById(device.id);
        visible = visible.union(node.closedNeighborhood()).union(node.neighborhood().nodes().connectedEdges().filter(edge => edge.source().id() === 'router'));
      });
      visible.removeClass('muted');
    }
    $('device-picker').replaceChildren(new Option(filtered ? `${matches.length} Geräte gefunden` : 'Netzwerkübersicht', ''));
    matches.forEach(device => $('device-picker').add(new Option(device.name, device.id)));
    if (!matches.some(device => device.id === selectedId)) selectedId = '';
    $('device-picker').value = selectedId;
    $('graph-empty').hidden = matches.length > 0;
    $('graph-empty').textContent = model.devices.length ? 'Keine passenden Geräte' : onlyOnline && fullModel.devices.length ? 'Gerade ist kein Gerät online' : 'Noch keine Geräte vorhanden';
    if (!selectedId) { graph.nodes().unselect(); graph.edges().removeClass('highlighted'); }
    showDetails();
  }

  function selectDevice(id) {
    if (!model?.devices.some(device => device.id === id)) return;
    if (![...$('device-picker').options].some(option => option.value === id)) {
      groupFilter = ''; $('device-search').value = ''; renderLegend(); filterGraph();
    }
    selectedId = id; $('device-picker').value = id;
    graph.nodes().unselect(); graph.edges().removeClass('highlighted');
    const node = graph.getElementById(id);
    node.select(); node.connectedEdges().addClass('highlighted');
    showDetails();
  }

  function showDetails() {
    if (!model) return;
    const demo = model.router.dataMode === 'demo';
    const device = model.devices.find(item => item.id === selectedId);
    if (!device) {
      $('device-details').innerHTML = `<p class="detail-kicker">Netzwerkübersicht</p><h2>${escape(model.router.name)}</h2><p class="overview-count">${model.devices.length}</p><p class="detail-note">${onlyOnline ? 'Geräte gerade online' : demo ? 'Geräte im Beispiel-Netzwerk' : 'Geräte im gespeicherten Netzwerk'}</p><section class="detail-section"><h3>Gruppen</h3>${model.groups.map(group => `<div class="detail-group"><span class="swatch" style="--group-color:${group.color}"></span><span>${escape(group.name)}</span><span class="legend-count">${group.count}</span></div>`).join('')}</section><section class="detail-section"><h3>Router</h3><dl>${row('Modell', model.router.model)}</dl></section>`;
      return;
    }
    const preset = device.preset;
    const limit = device.timeLimit;
    const presetName = preset?.name || (device.presetDraft ? 'Keine Vorlage im Entwurf' : !device.rulesKnown ? 'Nicht vom Router gemeldet' : device.assignment ? 'Vorlagendetails fehlen' : 'Keine Vorlage zugewiesen');
    const paused = device.assignment?.status === 'paused';
    const limitText = !limit ? 'Keine Zeitregel geladen' : limit.status === 'paused' ? 'Pausiert' : limit.blockedFrom && limit.blockedUntil ? `${limit.blockedFrom}–${limit.blockedUntil}` : 'Kein Sperrzeitraum';
    $('device-details').innerHTML = `<p class="detail-kicker">Gerät</p><h2>${escape(device.name)}</h2>
      <section class="detail-section"><h3>Gruppenzuordnung</h3>${device.groups.map(group => `<div class="detail-group"><span class="swatch" style="--group-color:${group.color}"></span>${escape(group.name)}</div>`).join('')}${device.groupDraft ? '<span class="assignment-state">Lokaler Entwurf</span>' : ''}</section>
      <section class="detail-section"><h3>Zugewiesene Vorlage</h3><strong>${escape(presetName)}</strong>${device.assignment || device.presetDraft ? `<div><span class="assignment-state">${device.presetDraft ? 'Lokaler Entwurf' : demo ? 'Beispiel' : paused ? 'Zuweisung pausiert' : 'Gespeichert'}${demo && paused ? ' · pausiert' : ''}</span></div>` : ''}
      <p class="detail-note">${demo ? 'Keine Wirkung auf deinen Router.' : 'Die Routerwirkung ist hier nicht bestätigt.'}</p></section>
      <section class="detail-section"><h3>Regeln${device.presetDraft || limit?.localDraft || device.blocklist?.localDraft ? ' im Entwurf' : ''}</h3><dl>${row('Priorität', (!device.rulesKnown && !device.presetDraft || device.assignment) && !preset ? 'Nicht verfügbar' : paused ? 'Vorlage pausiert' : preset?.priorityMode ? 'Bevorzugt' : 'Normal')}${row('Sperrzeit', limitText)}${row('Tagesbudget', !limit ? 'Nicht verfügbar' : limit.dailyLimitMinutes ? `${limit.dailyLimitMinutes} Minuten` : 'Kein Tagesbudget')}${row('Vorlagen-Blockliste', device.blocklist?.name || (preset?.blocklistId === null ? 'Keine' : !device.rulesKnown || preset?.blocklistId ? 'Nicht verfügbar' : 'Keine'))}</dl></section>
      <section class="detail-section"><h3>Verbindung</h3><dl>${row('Status', device.online ? 'Online' : 'Offline')}${row('Typ', device.connection)}${row('IP-Adresse', device.ip)}${row('MAC-Adresse', device.mac)}${row('Zuletzt gesehen', date(device.lastSeen))}</dl></section>`;
  }

  $('reload-network').addEventListener('click', load);
  $('online-filter').addEventListener('click', () => { onlyOnline = !onlyOnline; applyOnlineFilter(); });
  $('back-to-graph').addEventListener('click', () => document.querySelector('.topology-header').scrollIntoView({ block: 'start', behavior: 'smooth' }));
  $('device-search').addEventListener('input', filterGraph);
  $('device-picker').addEventListener('change', event => {
    if (event.target.value) selectDevice(event.target.value);
    else { selectedId = ''; graph?.nodes().unselect(); graph?.edges().removeClass('highlighted'); showDetails(); }
  });
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    if (!model || mode === button.dataset.view) return;
    mode = button.dataset.view;
    document.querySelectorAll('[data-view]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    renderGraph(); filterGraph(); if (selectedId) selectDevice(selectedId);
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
  $('reset-network').addEventListener('click', () => { if (graph && initialPositions) { graph.nodes().positions(node => initialPositions.get(node.id())); fit(); } });
  ['zoom-in', 'zoom-out'].forEach(id => $(id).addEventListener('click', () => {
    if (graph) graph.zoom({ level: graph.zoom() * (id === 'zoom-in' ? 1.2 : 1 / 1.2), renderedPosition: { x: graph.width() / 2, y: graph.height() / 2 } });
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
