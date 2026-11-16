// Tab-local editing model. It has no network dependency and never queues router commands.
(function (root) {
  const copy = value => JSON.parse(JSON.stringify(value));
  const tables = ['groups', 'blocklists', 'presets', 'members', 'assignments', 'timeLimits'];
  const empty = () => ({ version: 1, nextId: -100000, ...Object.fromEntries(tables.map(key => [key, []])), adblock: {} });
  const fields = {
    groups: ['id', 'name', 'description', 'color', 'blocklistId'],
    blocklists: ['id', 'routerId', 'name', 'sourceType', 'urlPattern'],
    presets: ['id', 'name', 'description', 'blocklistId', 'timeLimitMinutes', 'blockedFrom', 'blockedUntil', 'parentalMode', 'priorityMode']
  };
  function create(storage, key) {
    let changes = empty();
    const raw = storage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.version !== 1 || !tables.every(name => Array.isArray(parsed[name]))
        || !Number.isSafeInteger(parsed.nextId) || parsed.nextId > -100000 || !parsed.adblock) {
        throw new Error('Lokaler Entwurf ist beschädigt. Bitte den Entwurf verwerfen.');
      }
      changes = parsed;
    }
    const replace = (rows, row, field = 'id') => [...rows.filter(item => Number(item[field]) !== Number(row[field])), row];
    function snapshot(base) {
      const result = copy(base);
      for (const name of tables) {
        const field = ['members', 'assignments', 'timeLimits'].includes(name) ? 'deviceId' : 'id';
        result[name] = (base[name] || []).map(copy);
        for (const row of changes[name]) result[name] = replace(result[name], { ...row, localDraft: true }, field);
      }
      const devices = new Set((base.devices || []).map(item => Number(item.id)));
      result.members = result.members.filter(item => devices.has(Number(item.deviceId)) && item.groupId != null);
      result.assignments = result.assignments.filter(item => devices.has(Number(item.deviceId)) && item.presetId != null);
      result.timeLimits = result.timeLimits.filter(item => devices.has(Number(item.deviceId)));
      return result;
    }
    function commit(mutate) {
      const next = copy(changes);
      const result = mutate(next);
      // Persist first. A storage error must not be reported as a successful save.
      storage.setItem(key, JSON.stringify(next));
      changes = next;
      return copy(result ?? null);
    }
    function requireRow(rows, id, label) {
      if (!Number.isSafeInteger(id) || !rows.some(row => Number(row.id) === id)) throw new Error(`${label} nicht vorhanden.`);
    }
    function assignGroup(base, deviceId, groupId) {
      const current = snapshot(base);
      requireRow(base.devices, deviceId, 'Gerät');
      if (groupId != null) requireRow(current.groups, groupId, 'Gruppe');
      return commit(next => {
        const row = { deviceId, groupId };
        next.members = replace(next.members, row, 'deviceId');
        return row;
      });
    }
    function request(base, pathname, options = {}) {
      const current = snapshot(base);
      const method = options.method || 'GET';
      const body = options.body ? JSON.parse(options.body) : {};
      let match = pathname.match(/^\/api\/security\/(groups|blocklists|presets)$/);
      if (match && method === 'POST') {
        const name = match[1];
        if (!String(body.name || '').trim()) throw new Error('Bitte einen Namen eingeben.');
        if (body.id != null) requireRow(current[name], Number(body.id), 'Eintrag');
        if (body.blocklistId != null) requireRow(current.blocklists, Number(body.blocklistId), 'Blockliste');
        if (name === 'presets' && (body.blockedFrom || body.blockedUntil)) {
          const validTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '');
          if (!validTime(body.blockedFrom) || !validTime(body.blockedUntil) || body.blockedFrom === body.blockedUntil) throw new Error('Bitte gültige, unterschiedliche Uhrzeiten wählen.');
          if (!Number.isInteger(body.timeLimitMinutes) || body.timeLimitMinutes < 0 || body.timeLimitMinutes > 1440) throw new Error('Tageslimit muss zwischen 0 und 1440 Minuten liegen.');
        }
        return commit(next => {
          const row = Object.fromEntries(fields[name].filter(field => body[field] !== undefined).map(field => [field, body[field]]));
          row.id = body.id == null ? next.nextId-- : Number(body.id);
          row.name = String(row.name).trim();
          if (name !== 'blocklists') row.blocklistId ??= null;
          next[name] = replace(next[name], row);
          return row;
        });
      }
      match = pathname.match(/^\/api\/security\/devices\/(-?\d+)\/preset(?:\/(-?\d+))?$/);
      if (match && ['PUT', 'DELETE'].includes(method)) {
        const deviceId = Number(match[1]), presetId = method === 'PUT' ? Number(match[2]) : null;
        requireRow(base.devices, deviceId, 'Gerät');
        if (presetId != null) requireRow(current.presets, presetId, 'Vorlage');
        return commit(next => {
          const row = { deviceId, presetId, status: 'active' };
          next.assignments = replace(next.assignments, row, 'deviceId');
          return row;
        });
      }
      match = pathname.match(/^\/api\/device-time-limits\/(-?\d+)$/);
      if (match && method === 'PUT') {
        const deviceId = Number(match[1]);
        requireRow(base.devices, deviceId, 'Gerät');
        return commit(next => {
          const row = { deviceId, id: deviceId, dailyLimitMinutes: body.dailyLimitMinutes,
            blockedFrom: body.blockedFrom, blockedUntil: body.blockedUntil, status: body.status, note: body.note };
          next.timeLimits = replace(next.timeLimits, row, 'deviceId');
          return row;
        });
      }
      throw new Error('Diese Aktion ist in der lokalen Vorschau nicht verfügbar.');
    }
    return {
      snapshot, request, assignGroup,
      get adblock() { return copy(changes.adblock); },
      get dirty() { return tables.some(name => changes[name].length) || Object.keys(changes.adblock).length > 0; },
      setAdblock(enabled, install = false) { return commit(next => { next.adblock = { enabled: Boolean(enabled), installRequested: install || next.adblock.installRequested === true }; }); },
      reset() { storage.removeItem(key); changes = empty(); }
    };
  }
  const api = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NetheraSecurityDraft = api;
})(globalThis);
