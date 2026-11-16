(() => {
  const $ = id => document.getElementById(id);
  const { buildModel, onlineOnly, graphElements, matchingDevices } = window.NetheraTopology;
  // fullModel = every stored device; model = what is shown (all, or only the online ones)
  let fullModel = null, onlyOnline = false;
  let model = null, graph = null, mode = 'groups', groupFilter = '', selectedId = '';
  let initialPositions = null, resizeObserver = null;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const row = (name, value) => `<div><dt>${escape(name)}</dt><dd>${escape(value)}</dd></div>`;
  const date = value => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' }) : 'Nicht bekannt';

  function notice(message) {
    $('network-notice').textContent = message;
    $('network-notice').hidden = !message;
  }

  async function load() {
    $('reload-network').disabled = true;
    $('network-summary').textContent = 'Netzwerk wird geladen …';
    try {
      const router = await NetheraApi.getPrimaryRouter();
      let rules = null;
      try { rules = await NetheraApi.getSecurityState(router); } catch {}
      fullModel = buildModel(router, rules);
      groupFilter = ''; selectedId = ''; $('device-search').value = '';
      notice(fullModel.rulesKnown ? '' : 'Gruppen und Vorlagen konnten nicht geladen werden. Verbindungsdaten werden weiterhin angezeigt.');
      applyOnlineFilter();
    } catch {
      model = null; fullModel = null;
      $('online-filter').disabled = true;
      graph?.destroy(); graph = null;
      $('device-details').innerHTML = '';
      $('group-legend').innerHTML = '';
      $('device-picker').innerHTML = '<option value="">Keine Gerätedaten</option>';
      notice('Netzwerk konnte nicht geladen werden. Bitte Anmeldung und Backend prüfen und erneut laden.');
      $('network-summary').textContent = model ? 'Letzter geladener Stand' : 'Keine Netzwerkdaten';
      if (!model) { $('graph-empty').textContent = 'Netzwerk nicht verfügbar'; $('graph-empty').hidden = false; }
    } finally { $('reload-network').disabled = false; }
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
    $('network-summary').textContent = `${fullModel.devices.length} Geräte · ${online} online · ${model.groups.length} Gruppen · ${model.router.name}`;
    renderLegend(); renderGraph(); filterGraph(); showDetails();
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
    graph.nodes('[kind = "router"]').style({ width: 86, height: 86 });
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
      minZoom: .02, maxZoom: 2.5, wheelSensitivity: .25, selectionType: 'single', boxSelectionEnabled: false,
      style: [
        { selector: 'node', style: { label: 'data(label)', 'background-color': 'data(color)', width: 42, height: 42, 'border-width': 2, 'border-color': '#1c2226', color: '#e4e9eb', 'font-family': 'Avenir Next, Segoe UI, sans-serif', 'font-size': 12, 'text-valign': 'bottom', 'text-margin-y': 9, 'text-wrap': 'wrap', 'text-max-width': 110, 'text-background-color': '#1c2226', 'text-background-opacity': .85, 'text-background-padding': 3, 'overlay-opacity': 0 } },
        { selector: 'node[kind = "router"]', style: { width: 86, height: 86, 'background-image': 'router.png', 'background-fit': 'contain', 'background-width': '80%', 'background-height': '80%', 'border-width': 2, 'border-color': '#69c5b6', 'font-weight': 600 } },
        { selector: 'node[kind = "group"]', style: { width: 32, height: 32, 'background-opacity': .18, 'border-color': 'data(color)', 'border-width': 2, 'font-weight': 600 } },
        { selector: 'edge', style: { width: 1.4, 'line-color': '#617078', 'curve-style': 'bezier', 'overlay-opacity': 0 } },
        { selector: 'node[kind = "device"][online = 0]', style: { 'background-opacity': .3, 'border-style': 'dashed', 'border-color': '#617078', color: '#9aa8b0' } },
        { selector: '.muted', style: { opacity: .13 } },
        { selector: 'node:selected', style: { 'border-color': '#ffffff', 'border-width': 4 } },
        { selector: 'edge.highlighted', style: { 'line-color': '#9cd6cd', width: 2 } }
      ],
      layout: { name: 'grid', padding: 60 }
    });
    // Keep positions stable except when switching between wide and compact screens.
    const layout = { name: 'cose', randomize: false, animate: false, fit: false, nodeDimensionsIncludeLabels: true, nodeRepulsion: () => 16000, idealEdgeLength: () => 115, edgeElasticity: () => 90, gravity: .3, numIter: 1000 };
    graph.layout(layout).run();
    fit();
    if (graph.width() < 600) { graph.layout(layout).run(); fit(); }
    initialPositions = new Map(graph.nodes().map(node => [node.id(), { ...node.position() }]));
    graph.on('tap', 'node', event => {
      const node = event.target;
      if (node.data('kind') === 'device') {
        selectDevice(node.id());
        if (window.matchMedia('(max-width: 700px)').matches) document.querySelector('.network-inspector').scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
      else if (node.data('kind') === 'group' && mode === 'groups') { groupFilter = groupFilter === node.id() ? '' : node.id(); renderLegend(); filterGraph(); }
      else { selectedId = ''; showDetails(); $('device-picker').value = ''; }
    });
    graph.on('tap', event => { if (event.target === graph) { selectedId = ''; graph.nodes().unselect(); graph.edges().removeClass('highlighted'); showDetails(); $('device-picker').value = ''; } });
    let compactLayout = graph.width() < 600;
    resizeObserver = new ResizeObserver(() => {
      graph.resize();
      const compact = graph.width() < 600;
      fit();
      if (compact !== compactLayout) {
        compactLayout = compact;
        graph.layout(layout).run(); fit();
        initialPositions = new Map(graph.nodes().map(node => [node.id(), { ...node.position() }]));
      }
    });
    resizeObserver.observe($('network-graph'));
    $('graph-caption').textContent = model.router.dataMode === 'demo' ? 'Beispiel-Netzwerk · Nur Ansicht'
      : mode === 'groups' ? 'Gespeicherte Gruppenzuordnung' : 'Verbindungstyp laut Gerätedaten';
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
    const presetName = !device.rulesKnown ? 'Nicht verfügbar' : preset?.name || (device.assignment ? 'Vorlagendetails fehlen' : 'Keine Vorlage zugewiesen');
    const paused = device.assignment?.status === 'paused';
    const limitText = !device.rulesKnown ? 'Nicht verfügbar' : !limit ? 'Keine Zeitregel gespeichert' : limit.status === 'paused' ? 'Pausiert' : limit.blockedFrom && limit.blockedUntil ? `${limit.blockedFrom}–${limit.blockedUntil}` : 'Kein Sperrzeitraum';
    $('device-details').innerHTML = `<p class="detail-kicker">Gerät</p><h2>${escape(device.name)}</h2>
      <section class="detail-section"><h3>Gruppenzuordnung</h3>${device.groups.map(group => `<div class="detail-group"><span class="swatch" style="--group-color:${group.color}"></span>${escape(group.name)}</div>`).join('')}</section>
      <section class="detail-section"><h3>Zugewiesene Vorlage</h3><strong>${escape(presetName)}</strong>${device.assignment ? `<div><span class="assignment-state">${demo ? 'Beispiel' : paused ? 'Zuweisung pausiert' : 'Gespeichert'}${demo && paused ? ' · pausiert' : ''}</span></div>` : ''}
      <p class="detail-note">${demo ? 'Keine Wirkung auf deinen Router.' : 'Die Routerwirkung ist hier nicht bestätigt.'}</p></section>
      <section class="detail-section"><h3>Gespeicherte Regeln</h3><dl>${row('Priorität', !device.rulesKnown || (device.assignment && !preset) ? 'Nicht verfügbar' : paused ? 'Vorlage pausiert' : preset?.priorityMode ? 'Bevorzugt' : 'Normal')}${row('Sperrzeit', limitText)}${row('Tagesbudget', !device.rulesKnown ? 'Nicht verfügbar' : limit?.dailyLimitMinutes ? `${limit.dailyLimitMinutes} Minuten` : 'Kein Tagesbudget')}${row('Vorlagen-Blockliste', device.blocklist?.name || (!device.rulesKnown || preset?.blocklistId ? 'Nicht verfügbar' : 'Keine'))}</dl></section>
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
  $('fit-network').addEventListener('click', fit);
  $('reset-network').addEventListener('click', () => { if (graph && initialPositions) { graph.nodes().positions(node => initialPositions.get(node.id())); fit(); } });
  ['zoom-in', 'zoom-out'].forEach(id => $(id).addEventListener('click', () => {
    if (graph) graph.zoom({ level: graph.zoom() * (id === 'zoom-in' ? 1.2 : 1 / 1.2), renderedPosition: { x: graph.width() / 2, y: graph.height() / 2 } });
  }));
  window.addEventListener('pagehide', () => { resizeObserver?.disconnect(); graph?.destroy(); });
  window.lucide?.createIcons({ attrs: { 'aria-hidden': 'true', 'stroke-width': 1.8 } });
  load();
  NetheraApi.watchSource(load);
})();
