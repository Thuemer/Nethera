const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildModel, graphElements, matchingDevices } = require('../topology-model.js');
const cytoscape = require('../vendor/cytoscape.min.js');

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
  for (const rules of [null, {}]) {
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

test('both graph modes have valid endpoints and support multiple memberships', () => {
  for (const mode of ['groups', 'connections']) {
    const cy = cytoscape({ headless: true, elements: graphElements(buildModel(router, rules), mode) });
    assert.equal(cy.nodes('[kind="device"]').length, 3);
    assert.equal(cy.getElementById('device-1').degree(), mode === 'groups' ? 2 : 1);
    assert.equal(cy.getElementById('device-3').data('label'), '<img onerror=alert(1)>');
    cy.edges().forEach(edge => { assert.equal(edge.source().length, 1); assert.equal(edge.target().length, 1); });
    cy.destroy();
  }
});

test('empty networks remain a valid graph', () => {
  const model = buildModel({}, null);
  assert.deepEqual(model.devices, []);
  assert.equal(graphElements(model).length, 1);
});
