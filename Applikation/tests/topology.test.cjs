const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildModel, topologyHubs, matchingDevices, onlineOnly } = require('../topology-model.js');
const { create, keyFor } = require('../security-draft.js');

const router = { name: 'Nethera', devices: [
  { id: 1, hostname: 'Telefon', ipAddress: '192.168.1.2', macAddress: 'aa:bb:cc:dd:ee:ff', connectionType: 'wifi' },
  { id: 2, hostname: 'Laptop', connectionType: 'lan' },
  { id: 3, hostname: '<img onerror=alert(1)>', connectionType: 'unknown' }
] };
const rules = { groups: [{ id: 2, name: 'Arbeit' }, { id: 1, name: 'Familie' }],
  members: [{ deviceId: 1, groupId: 1 }, { deviceId: 1, groupId: 2 }],
  assignments: [{ deviceId: 1, presetId: 4, status: 'paused' }],
  presets: [{ id: 4, name: 'Abendruhe', priorityMode: true }],
  timeLimits: [{ deviceId: 1, blockedFrom: '20:00', blockedUntil: '07:00', status: 'paused' }]
};

test('layout-neutral hubs preserve all memberships, primary order and connection types', () => {
  const model = buildModel(router, rules), before = JSON.stringify(model);
  const groups = topologyHubs(model);
  assert.equal(groups[0].id, model.devices[0].groups[0].id);
  assert.equal(groups.filter(hub => hub.devices.includes(model.devices[0])).length, 2);
  assert.ok(groups.every(hub => hub.devices.length && hub.kind === 'group'));
  const connections = topologyHubs(model, 'connections');
  assert.deepEqual(connections.map(hub => hub.name), ['LAN', 'Unbekannt', 'WLAN']);
  assert.equal(connections.reduce((count, hub) => count + hub.devices.length, 0), 3);
  assert.ok(connections.every(hub => hub.kind === 'connection'));
  assert.equal(JSON.stringify(model), before);
});

test('layout-neutral hubs omit empty groups and follow online filtering', () => {
  assert.deepEqual(topologyHubs(buildModel({}, rules)), []);
  assert.deepEqual(topologyHubs(buildModel({}, rules), 'connections'), []);
  const model = buildModel({ ...router, devices: router.devices.map((device, i) => ({ ...device, isOnline: i === 0 })) }, rules);
  const hubs = topologyHubs(onlineOnly(model));
  assert.deepEqual(hubs.map(hub => hub.name), ['Familie', 'Arbeit']);
  assert.ok(hubs.every(hub => hub.devices.length === 1 && hub.devices[0].online));
});

test('topology joins real groups and assignments without confusing them with WLAN/LAN', () => {
  const model = buildModel(router, rules);
  assert.deepEqual(model.devices[0].groups.map(group => group.name), ['Familie', 'Arbeit']);
  assert.equal(model.devices[0].connection, 'WLAN');
  assert.equal(model.devices[0].preset.name, 'Abendruhe');
  assert.equal(model.devices[0].assignment.status, 'paused');
  assert.equal(model.devices[0].timeLimit.status, 'paused');
  assert.equal(model.devices[1].groups[0].name, 'Ohne Gruppe');
});

test('missing or incomplete rule data never means no preset or no group', () => {
  for (const rules of [null, {}, { groups: [], members: [], assignments: [], presets: [], rulesKnown: false }]) {
    const device = buildModel(router, rules).devices[0];
    assert.equal(device.rulesKnown, false);
    assert.equal(device.groups[0].name, 'Gruppe unbekannt');
  }
});

test('group colors are stable when the API changes ordering', () => {
  const a = buildModel(router, rules);
  const b = buildModel(router, { ...rules, groups: rules.groups.slice().reverse() });
  assert.deepEqual(a.groups, b.groups);
});

test('partial readback preserves verified relationships but marks missing assignments unknown', () => {
  const model = buildModel(router, { ...rules, rulesKnown: false });
  assert.equal(model.rulesKnown, false);
  assert.equal(model.devices[0].preset.name, 'Abendruhe');
  assert.equal(model.devices[0].groups[0].name, 'Familie');
  assert.equal(model.devices[1].groups[0].name, 'Gruppe unbekannt');
});

test('search and group filter combine, including secondary membership and presets', () => {
  const model = buildModel(router, rules);
  assert.deepEqual(matchingDevices(model, 'abend', 'group-2').map(d => d.sourceId), [1]);
  assert.equal(matchingDevices(model, '192.168.1.2', '').length, 1);
  assert.equal(matchingDevices(model, 'AA:BB', '').length, 1);
  assert.equal(matchingDevices(model, 'Laptop', 'group-1').length, 0);
});

test('only devices of the selected router appear, even when rules contain other devices', () => {
  const model = buildModel(router, { ...rules, members: [...rules.members, { deviceId: 99, groupId: 1 }] });
  assert.equal(model.devices.length, 3);
  assert.equal(model.groups.find(g => g.id === 'group-1').count, 1);
});

test('both layouts receive valid memberships and untrusted labels as plain model strings', () => {
  const model = buildModel(router, rules);
  for (const mode of ['groups', 'connections']) {
    const hubs = topologyHubs(model, mode);
    assert.equal(new Set(hubs.flatMap(hub => hub.devices.map(device => device.id))).size, 3);
    assert.equal(hubs.filter(hub => hub.devices.some(device => device.id === 'device-1')).length, mode === 'groups' ? 2 : 1);
    assert.equal(model.devices[2].name, '<img onerror=alert(1)>');
  }
});

test('empty networks remain a valid graph', () => {
  const model = buildModel({}, null);
  assert.deepEqual(model.devices, []);
  assert.deepEqual(topologyHubs(model), []);
});

test('online status compares lastSeen with the router check time, not with the browser clock', () => {
  const { onlineOnly } = require('../topology-model.js');
  const live = { name: 'Nethera', checkedAt: '2026-11-16T12:00:00', devices: [
    { id: 1, hostname: 'Jetzt da', lastSeen: '2026-11-16T11:59:40' },
    { id: 2, hostname: 'Gestern da', lastSeen: '2026-11-15T18:00:00' },
    { id: 3, hostname: 'Nie gesehen' },
    { id: 4, hostname: 'Laut API offline', lastSeen: '2026-11-16T12:00:00', isOnline: false }
  ] };
  const security = { groups: [{ id: 1, name: 'Kinder' }], members: [{ deviceId: 2, groupId: 1 }], assignments: [], presets: [] };
  const model = buildModel(live, security);
  assert.deepEqual(model.devices.map(device => device.online), [true, false, false, false]);

  const online = onlineOnly(model);
  assert.deepEqual(online.devices.map(device => device.name), ['Jetzt da']);
  // The group whose only device is offline disappears, and the counts follow
  assert.deepEqual(online.groups.map(group => [group.name, group.count]), [['Ohne Gruppe', 1]]);
  assert.equal(model.devices.length, 4, 'the full model stays untouched');
  assert.equal(new Set(topologyHubs(online).flatMap(hub => hub.devices.map(device => device.id))).size, 1);
});

test('without a router check time the newest device is the reference', () => {
  const model = buildModel({ devices: [
    { id: 1, lastSeen: '2026-11-16T12:00:00' }, { id: 2, lastSeen: '2026-11-16T11:59:00' }, { id: 3, lastSeen: '2026-11-16T09:00:00' }
  ] }, null);
  assert.deepEqual(model.devices.map(device => device.online), [true, true, false]);
});

test('topology overlays local groups and presets but keeps router telemetry and online filtering', () => {
  const entries = new Map();
  const storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
  const live = { ...router, id: 1, dataMode: 'live', devices: router.devices.map((device, i) => ({ ...device, isOnline: i === 0 })) };
  const base = { ...rules, devices: live.devices, rulesKnown: false };
  const before = JSON.stringify({ live, base });
  const key = keyFor('http://localhost:8080', 'userA', live), draft = create(storage, key);
  const post = (kind, body) => draft.request(base, `/api/security/${kind}`, { method: 'POST', body: JSON.stringify(body) });
  const group = post('groups', { name: 'Gaming' });
  draft.assignGroup(base, 2, group.id);
  const preset = post('presets', { name: 'Spielen', priorityMode: true, timeLimitMinutes: 120 });
  draft.request(base, `/api/security/devices/2/preset/${preset.id}`, { method: 'PUT' });
  const model = buildModel(live, create(storage, key).snapshot(base));
  assert.equal(model.hasLocalDraft, true);
  assert.equal(model.rulesKnown, false);
  assert.equal(model.devices[1].groups[0].name, 'Gaming');
  assert.equal(model.devices[1].groupDraft, true);
  assert.equal(model.devices[1].presetDraft, true);
  assert.equal(model.devices[1].preset.priorityMode, true);
  assert.equal(model.devices[0].groupDraft, false);
  assert.equal(model.devices[2].groups[0].name, 'Gruppe unbekannt');
  assert.equal(matchingDevices(model, 'spielen', `group-${group.id}`).length, 1);
  const baseline = buildModel(live, base);
  const telemetry = model => model.devices.map(({ id, name, online, connection, ip, mac, lastSeen }) => ({ id, name, online, connection, ip, mac, lastSeen }));
  assert.deepEqual(telemetry(model), telemetry(baseline));
  assert.deepEqual(require('../topology-model.js').onlineOnly(model).devices.map(d => d.sourceId), [1]);
  assert.equal(topologyHubs(model).find(hub => hub.id === `group-${group.id}`).devices.some(device => device.id === 'device-2'), true);
  assert.equal(JSON.stringify({ live, base }), before);
  draft.reset();
  assert.deepEqual(buildModel(live, create(storage, key).snapshot(base)), baseline);
});

test('clearing a local group or preset is explicit, other unreported devices stay unknown', () => {
  const storage = { getItem: () => null, setItem() {} };
  const base = { ...rules, devices: router.devices, rulesKnown: false };
  const draft = create(storage, 'live');
  draft.assignGroup(base, 1, null);
  draft.request(base, '/api/security/devices/1/preset', { method: 'DELETE' });
  const model = buildModel(router, draft.snapshot(base));
  assert.equal(model.devices[0].groups[0].name, 'Ohne Gruppe (Entwurf)');
  assert.equal(model.devices[0].preset, null);
  assert.equal(model.devices[0].presetDraft, true);
  assert.equal(model.devices[1].groups[0].name, 'Gruppe unbekannt');
  assert.equal(model.devices[1].presetDraft, false);
});
