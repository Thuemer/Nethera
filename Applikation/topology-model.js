(function (root) {
  const colors = ['#69c5b6', '#79b9e3', '#d9b96f', '#bcaae2', '#de9caf', '#91c59a'];
  const list = value => Array.isArray(value) ? value : [];
  const sameId = (a, b) => a != null && b != null && String(a) === String(b);
  const connection = value => ({ wifi: 'WLAN', wlan: 'WLAN', lan: 'LAN' }[String(value || '').toLowerCase()] || 'Unbekannt');

  function buildModel(router, security) {
    const known = security != null && ['groups', 'members', 'assignments', 'presets'].every(key => Array.isArray(security[key]));
    const groups = list(security?.groups).slice().sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))
      .map((group, index) => ({ id: `group-${group.id}`, sourceId: group.id, name: group.name || 'Unbenannte Gruppe', color: colors[index % colors.length] }));
    const fallback = { id: known ? 'ungrouped' : 'unknown', name: known ? 'Ohne Gruppe' : 'Gruppe unbekannt', color: '#9aa8b0' };
    const devices = list(router?.devices).map(device => {
      const memberships = list(security?.members).filter(member => sameId(member.deviceId, device.id));
      const assignedGroups = groups.filter(group => memberships.some(member => sameId(member.groupId, group.sourceId)));
      const assignment = list(security?.assignments).find(item => sameId(item.deviceId, device.id));
      const preset = list(security?.presets).find(item => sameId(item.id, assignment?.presetId));
      return {
        id: `device-${device.id}`, sourceId: device.id,
        name: device.hostname || device.ipAddress || `Gerät ${device.id}`,
        ip: device.ipAddress || 'Nicht bekannt', mac: device.macAddress || 'Nicht bekannt',
        connection: connection(device.connectionType), lastSeen: device.lastSeen,
        groups: assignedGroups.length ? assignedGroups : [fallback],
        preset: preset || null, assignment: assignment || null, rulesKnown: known,
        timeLimit: list(security?.timeLimits).find(item => sameId(item.deviceId, device.id)) || null,
        blocklist: list(security?.blocklists).find(item => sameId(item.id, preset?.blocklistId)) || null
      };
    });
    const usedGroups = [...groups, fallback].map(group => ({ ...group, count: devices.filter(device => device.groups.some(item => item.id === group.id)).length })).filter(group => group.count);
    return { router: { name: router?.name || 'Router', model: router?.model || 'Nicht bekannt' }, devices, groups: usedGroups, rulesKnown: known };
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
      nodes.push({ data: { id: device.id, label: device.name.replaceAll('-', '-\n'), kind: 'device', color: device.groups[0].color } });
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

  const api = { buildModel, graphElements, matchingDevices };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NetheraTopology = api;
})(typeof window !== 'undefined' ? window : globalThis);
