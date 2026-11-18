(function (root) {
  const colors = ['#69c5b6', '#79b9e3', '#d9b96f', '#bcaae2', '#de9caf', '#91c59a'];
  const list = value => Array.isArray(value) ? value : [];
  const sameId = (a, b) => a != null && b != null && String(a) === String(b);
  const connection = value => ({ wifi: 'WLAN', wlan: 'WLAN', lan: 'LAN' }[String(value || '').toLowerCase()] || 'Unbekannt');

  // A device counts as online if the router reported it in (nearly) its latest message.
  // Both times come from the same server clock, so the browser's time zone does not matter.
  const ONLINE_WINDOW_MS = 120000;
  const time = value => { const ms = value ? new Date(value).getTime() : NaN; return Number.isNaN(ms) ? null : ms; };

  function buildModel(router, security) {
    const seen = list(router?.devices).map(device => time(device.lastSeen)).filter(ms => ms != null);
    const reference = time(router?.checkedAt) ?? (seen.length ? Math.max(...seen) : null);
    const isOnline = device => typeof device.isOnline === 'boolean' ? device.isOnline
      : reference != null && time(device.lastSeen) != null && time(device.lastSeen) >= reference - ONLINE_WINDOW_MS;
    const known = security != null && security.rulesKnown !== false && ['groups', 'members', 'assignments', 'presets'].every(key => Array.isArray(security[key]));
    const groups = list(security?.groups).slice().sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))
      .map((group, index) => ({ id: `group-${group.id}`, sourceId: group.id, name: group.name || 'Unbenannte Gruppe', color: colors[index % colors.length], localDraft: group.localDraft === true }));
    const fallback = { id: known ? 'ungrouped' : 'unknown', name: known ? 'Ohne Gruppe' : 'Gruppe unbekannt', color: '#9aa8b0' };
    const draftFallback = { id: 'draft-ungrouped', name: 'Ohne Gruppe (Entwurf)', color: '#9aa8b0', localDraft: true };
    const devices = list(router?.devices).map(device => {
      const memberships = list(security?.members).filter(member => sameId(member.deviceId, device.id));
      const assignedGroups = groups.filter(group => memberships.some(member => sameId(member.groupId, group.sourceId)));
      const assignment = list(security?.assignments).find(item => sameId(item.deviceId, device.id));
      const preset = list(security?.presets).find(item => sameId(item.id, assignment?.presetId));
      const groupDraft = memberships.some(item => item.localDraft) || assignedGroups.some(item => item.localDraft)
        || list(security?.draftDeviceIds?.members).some(id => sameId(id, device.id));
      const presetDraft = preset?.localDraft === true || assignment?.localDraft === true
        || list(security?.draftDeviceIds?.assignments).some(id => sameId(id, device.id));
      return {
        id: `device-${device.id}`, sourceId: device.id,
        name: device.hostname || device.ipAddress || `Gerät ${device.id}`,
        ip: device.ipAddress || 'Nicht bekannt', mac: device.macAddress || 'Nicht bekannt',
        connection: connection(device.connectionType), lastSeen: device.lastSeen, online: isOnline(device),
        groups: assignedGroups.length ? assignedGroups : [groupDraft ? draftFallback : fallback],
        preset: preset || null, assignment: assignment || null, rulesKnown: known, groupDraft, presetDraft,
        timeLimit: list(security?.timeLimits).find(item => sameId(item.deviceId, device.id)) || null,
        blocklist: list(security?.blocklists).find(item => sameId(item.id, preset?.blocklistId)) || null
      };
    });
    const allGroups = [...groups, fallback, draftFallback];
    return { router: { name: router?.name || 'Router', model: router?.model || 'Nicht bekannt', dataMode: router?.dataMode }, devices, groups: countGroups(allGroups, devices), allGroups, rulesKnown: known, hasLocalDraft: security?.hasLocalDraft === true };
  }

  const countGroups = (groups, devices) => groups.map(group => ({ ...group, count: devices.filter(device => device.groups.some(item => item.id === group.id)).length })).filter(group => group.count);

  // The same model without the devices that are not connected right now
  function onlineOnly(model) {
    const devices = model.devices.filter(device => device.online);
    return { ...model, devices, groups: countGroups(model.allGroups, devices) };
  }

  function graphElements(model, mode = 'groups') {
    const nodes = [{ data: { id: 'router', label: model.router.name, kind: 'router', color: '#164b60' } }];
    const edges = [];
    const hubs = mode === 'groups' ? model.groups : [...new Set(model.devices.map(device => device.connection))].map(name => ({ id: `connection-${name}`, name, color: '#76b7c5' }));
    hubs.forEach(group => {
      nodes.push({ data: { id: group.id, label: group.name, kind: 'group', color: group.color } });
      edges.push({ data: { id: `router-${group.id}`, source: 'router', target: group.id } });
    });
    model.devices.forEach(device => {
      nodes.push({ data: { id: device.id, label: device.name, kind: 'device', color: device.groups[0].color, online: device.online ? 1 : 0 } });
      const parents = mode === 'groups' ? device.groups.map(group => group.id) : [`connection-${device.connection}`];
      parents.forEach(parent => edges.push({ data: { id: `${parent}-${device.id}`, source: parent, target: device.id } }));
    });
    return [...nodes, ...edges];
  }

  function matchingDevices(model, query, groupId) {
    const search = String(query || '').trim().toLocaleLowerCase();
    return model.devices.filter(device => (!groupId || device.groups.some(group => group.id === groupId)) &&
      (!search || [device.name, device.ip, device.mac, device.preset?.name, ...device.groups.map(group => group.name)].some(value => String(value || '').toLocaleLowerCase().includes(search))));
  }

  const api = { buildModel, onlineOnly, graphElements, matchingDevices };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NetheraTopology = api;
})(typeof window !== 'undefined' ? window : globalThis);
