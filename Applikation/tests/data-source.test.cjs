const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

function harness(routers = []) {
  const calls = [];
  const context = vm.createContext({
    window: { NETHERA_CONFIG: { API_BASE_URL: 'http://backend', ROUTERS_PATH: '/api/routers/list' } },
    routers, security: {}, control: { connection: 'unknown' }, controlStatus: 200, connections: [], configs: [], status: 200,
    fetch: async (url, options) => {
      calls.push({ url, options });
      const value = url.endsWith('/routers/list') ? context.routers : url.endsWith('/router-control/status') ? context.control : url.endsWith('/security/state') ? context.security
        : url.endsWith('/configs/list') ? context.configs : context.connections;
      const status = url.endsWith('/router-control/status') ? context.controlStatus : context.status;
      return { ok: status === 200, status, json: async () => value };
    }
  });
  vm.runInContext(readFileSync(`${__dirname}/../api.js`, 'utf8'), context);
  return { context, calls, run: source => vm.runInContext(source, context) };
}

const live = { id: 1, dataMode: 'live', connection: 'online', devices: [{ id: 20, hostname: 'Real laptop' }] };
const offline = { id: 1, dataMode: 'demo', connection: 'offline', devices: [{ id: 99, hostname: 'Old DB seed' }] };

test('live mode never fills missing streams or WLAN with demo values', async () => {
  const h = harness([live]);
  const router = await h.run('NetheraApi.getPrimaryRouter()');
  assert.equal(router.devices[0].hostname, 'Real laptop');
  for (const name of ['speedStats', 'dnsStats', 'activityLogs', 'wifiNetworks']) assert.equal(router[name].length, 0);
});

test('confirmed offline uses only isolated demo fixtures, never mixed DB devices', async () => {
  const h = harness([offline]);
  const router = await h.run('NetheraApi.getPrimaryRouter()');
  assert.equal(router.dataMode, 'demo');
  assert.equal(router.isOnline, false);
  assert.equal(router.devices.every(device => device.id < 0 && device.hostname.startsWith('Demo-')), true);
  assert.equal(router.lastSeen, null);
});

test('legacy online flag and contradictory modes cannot certify live or demo data', async () => {
  for (const bad of [{ isOnline: true }, { dataMode: 'demo', connection: 'online' }, { dataMode: 'live', connection: 'unknown' }]) {
    const h = harness([{ ...live, ...bad, ...(bad.isOnline ? { dataMode: undefined, connection: undefined } : {}) }]);
    const router = await h.run('NetheraApi.getPrimaryRouter()');
    assert.equal(router.dataMode, 'unavailable');
    assert.equal(router.devices.length, 0);
    assert.equal(router.isOnline, null);
  }
});

test('selects a live router before a disconnected first record', async () => {
  const h = harness([{ ...offline, id: 2 }, live]);
  assert.equal((await h.run('NetheraApi.getPrimaryRouter()')).id, 1);
});

test('unavailable router prevents automatic demo selection when another router is offline', async () => {
  const h = harness([offline, { id: 2 }]);
  assert.equal((await h.run('NetheraApi.getPrimaryRouter()')).dataMode, 'unavailable');
});

test('API and authentication failures never become demo data', async () => {
  for (const status of [401, 403, 500]) {
    const h = harness([offline]); h.context.status = status;
    await assert.rejects(h.run('NetheraApi.getPrimaryRouter()'));
    assert.equal(h.run('NetheraApi.isLive()'), false);
  }
});

test('repeated loads replace demo/live completely in both directions', async () => {
  const h = harness([offline]);
  assert.equal((await h.run('NetheraApi.getPrimaryRouter()')).dataMode, 'demo');
  h.context.routers = [live];
  let router = await h.run('NetheraApi.getPrimaryRouter()');
  assert.equal(router.devices.length, 1);
  assert.equal(router.devices[0].id, 20);
  h.context.routers = [offline];
  router = await h.run('NetheraApi.getPrimaryRouter()');
  assert.equal(router.devices.some(device => device.id === 20), false);
});

test('security endpoint cannot reintroduce seed devices or their assignments', async () => {
  const h = harness([live]);
  h.context.security = { devices: [{ id: 1 }, { id: 20 }], groups: [{ id: 2, blocklistId: null }], members: [{ deviceId: 1, groupId: 2 }, { deviceId: 20, groupId: 2 }],
    presets: [{ id: 4, name: 'Saved configuration', blocklistId: null }], assignments: [{ deviceId: 1, presetId: 4 }], timeLimits: [{ deviceId: 1 }] };
  const state = await h.run('NetheraApi.getSecurityState()');
  assert.equal(state.devices.length, 1);
  assert.equal(state.devices[0].id, 20);
  assert.equal(JSON.stringify(state.members.map(item => item.deviceId)), '[20]');
  assert.equal(state.assignments.length, 0);
  assert.equal(state.timeLimits.length, 0);
  assert.equal(state.presets.length, 1);
  assert.equal(state.rulesKnown, true);
});

test('demo security does not fetch or expose real rule assignments', async () => {
  const h = harness([offline]);
  h.context.security = { assignments: [{ deviceId: 99, presetId: 100 }] };
  const state = await h.run('NetheraApi.getSecurityState()');
  assert.equal(state.assignments.length, 4);
  assert.equal(state.assignments.every(item => item.deviceId < 0 && item.presetId < 0), true);
  assert.equal(h.calls.some(call => call.url.endsWith('/security/state')), false);
});

function routerRules() {
  const origin = { dataSource: 'ROUTER', routerId: 1 };
  return { ...origin, rulesComplete: true,
    blocklists: [{ ...origin, id: 1, name: 'Router list', sourceType: 'CUSTOM', urlPattern: 'example.org' }],
    groups: [{ ...origin, id: 2, name: 'Router group', blocklistId: 1 }],
    presets: [{ ...origin, id: 3, name: 'Router preset', blocklistId: 1 }],
    members: [{ ...origin, groupId: 2, deviceId: 20 }],
    assignments: [{ ...origin, deviceId: 20, presetId: 3, status: 'active' }]
  };
}

test('live router shows saved account rules and allows editing', async () => {
  const h = harness([live]);
  const security = routerRules();
  for (const key of ['blocklists', 'groups', 'presets', 'members', 'assignments']) {
    security[key] = security[key].map(({ routerId, dataSource, ...record }) => record);
  }
  delete security.rulesComplete;
  h.context.security = security;
  const before = JSON.stringify(security);
  const state = await h.run('NetheraApi.getSecurityState()');
  for (const key of ['blocklists', 'groups', 'presets', 'members', 'assignments']) assert.equal(state[key].length, 1);
  assert.equal(state.rulesKnown, true);
  assert.equal(JSON.stringify(h.context.security), before);
  assert.ok(h.calls.every(call => !call.options?.method || call.options.method === 'GET'));
});

function appliedNetwork() {
  const h = harness([live]);
  h.context.security = {
    blocklists: [
      { id: 3, routerId: 1, sourceType: 'GROUP', urlPattern: 'youtube.com' },
      { id: 4, routerId: 1, sourceType: 'DNS', urlPattern: 'ads.example.net|tracker.example.com' },
      { id: 5, routerId: 1, sourceType: 'NETWORK', urlPattern: 'tiktok.com|youtube.com' }
    ],
    groups: [{ id: 2, routerId: 1, blocklistId: 3 }], presets: [], assignments: [],
    members: [{ deviceId: 20, groupId: 2 }]
  };
  h.context.control = { connection: 'online', checkedAt: '2026-11-16T12:55:44Z',
    adblock: { installed: true, enabled: true, applied: true },
    blocklists: Object.fromEntries([3, 4, 5].map(id => [id, { applied: true }])) };
  return h;
}

test('router ACK marks network and DNS lists as active; other saved lists stay visible', async () => {
  const h = appliedNetwork();
  const state = await h.run('NetheraApi.getSecurityState()');
  assert.equal(JSON.stringify(state.blocklists.map(row => row.id)), '[3,4,5]');
  assert.equal(JSON.stringify(state.blocklists.filter(row => row.confirmationSource === 'ROUTER_ACK').map(row => row.id)), '[4,5]');
  assert.equal(state.groups.length, 1);
  assert.equal(state.members.length, 1);
});

test('a missing, failed or wrong-router ACK never certifies a list', async () => {
  for (const change of [{ connection: 'offline' }, { error: 'apply failed' }, { checkedAt: null }, { routerId: 2 },
    { blocklists: { 4: { applied: false }, 5: { applied: true, error: 'rejected' } } }]) {
    const h = appliedNetwork(); Object.assign(h.context.control, change);
    const state = await h.run('NetheraApi.getSecurityState()');
    assert.equal(state.blocklists.length, 3);
    assert.equal(state.blocklists.some(row => row.confirmationSource === 'ROUTER_ACK'), false);
  }
  const h = appliedNetwork(); h.context.controlStatus = 503;
  const state = await h.run('NetheraApi.getSecurityState()');
  assert.equal(state.blocklists.some(row => row.confirmationSource === 'ROUTER_ACK'), false);
  assert.ok(state.routerControlError);
});

test('rows of another router and dangling references are dropped', async () => {
  const h = appliedNetwork();
  h.context.security.blocklists.push({ id: 6, routerId: 2, sourceType: 'NETWORK', urlPattern: 'other.org' });
  h.context.security.groups.push({ id: 7, routerId: 1, blocklistId: 6 });
  h.context.security.members.push({ deviceId: 20, groupId: 7 }, { deviceId: 99, groupId: 2 });
  const state = await h.run('NetheraApi.getSecurityState()');
  assert.equal(state.blocklists.some(row => row.id === 6), false);
  assert.equal(JSON.stringify(state.groups.map(row => row.id)), '[2]');
  assert.equal(state.members.length, 1);
});

test('malformed rule responses stay live and do not leak demo data', async () => {
  const h = harness([live]);
  for (const security of [null, [], {}, { blocklists: [null, false, { id: true }] }, { groups: 'bad', presets: null, assignments: {} }]) {
    h.context.security = security;
    const state = await h.run('NetheraApi.getSecurityState()');
    assert.equal(state.dataMode, 'live');
    for (const key of ['blocklists', 'groups', 'presets', 'members', 'assignments']) assert.equal(state[key].length, 0);
  }
  h.context.status = 503;
  await assert.rejects(h.run('NetheraApi.getSecurityState()'));
});


test('verified rules survive filtering with number or string IDs without mutating API data', async () => {
  const h = harness([live]);
  h.context.security = routerRules();
  h.context.security.presets[0].routerId = '1';
  h.context.security.assignments[0].deviceId = '20';
  const before = JSON.stringify(h.context.security);
  const state = await h.run('NetheraApi.getSecurityState()');
  for (const key of ['blocklists', 'groups', 'presets', 'members', 'assignments']) assert.equal(state[key].length, 1);
  assert.equal(state.rulesKnown, true);
  assert.equal(JSON.stringify(h.context.security), before);
});

test('complete demo has consistent groups, presets, blocklists, schedules and topology', async () => {
  const h = harness([offline]);
  const state = await h.run('NetheraApi.getSecurityState()');
  assert.equal(state.devices.length, 8);
  assert.equal(state.groups.length, 3);
  assert.equal(state.presets.length, 3);
  assert.equal(state.blocklists.length, 4);
  assert.equal(state.timeLimits.length, 4);
  const ids = name => new Set(state[name].map(item => item.id));
  for (const name of ['devices', 'groups', 'presets', 'blocklists', 'timeLimits']) {
    assert.equal(ids(name).size, state[name].length);
    assert.ok(state[name].every(item => item.id < 0));
  }
  for (const member of state.members) {
    assert.ok(ids('devices').has(member.deviceId));
    assert.ok(ids('groups').has(member.groupId));
  }
  for (const item of [...state.groups, ...state.presets]) assert.ok(ids('blocklists').has(item.blocklistId));
  for (const item of state.assignments) {
    assert.ok(ids('devices').has(item.deviceId));
    assert.ok(ids('presets').has(item.presetId));
    const preset = state.presets.find(preset => preset.id === item.presetId);
    const limit = state.timeLimits.find(limit => limit.deviceId === item.deviceId);
    assert.equal(limit.status, item.status);
    assert.equal(limit.blockedFrom, preset.blockedFrom);
    assert.equal(limit.blockedUntil, preset.blockedUntil);
    assert.equal(limit.dailyLimitMinutes, preset.timeLimitMinutes);
  }
  const { buildModel } = require('../topology-model.js');
  const model = buildModel({ id: 1, name: 'Demo', devices: state.devices }, state);
  assert.equal(model.devices.length, 8);
  assert.equal(model.devices.filter(device => device.preset).length, 4);
});

test('demo measurements are ordered and device rates match the network total', async () => {
  const h = harness([offline]);
  const router = await h.run('NetheraApi.getPrimaryRouter()');
  const connections = await h.run('NetheraApi.getConnections()');
  assert.equal(connections.length, router.devices.length);
  const latest = router.speedStats.at(-1);
  assert.equal(connections.reduce((sum, item) => sum + item.download, 0), latest.downloadSpeed);
  assert.ok(Math.abs(connections.reduce((sum, item) => sum + item.upload, 0) - latest.uploadSpeed) < 1e-9);
  router.speedStats.forEach((point, i) => {
    assert.ok(Number.isFinite(point.downloadSpeed) && Number.isFinite(point.uploadSpeed));
    if (i) assert.ok(new Date(point.timestamp) > new Date(router.speedStats[i - 1].timestamp));
  });
  assert.ok(router.activityLogs.length > 1);
  assert.ok(router.wifiNetworks.length > 1);
});

test('demo configuration never fetches stored settings or certifies router effects', async () => {
  const h = harness([offline]);
  h.context.configs = [{ id: 100, routerName: 'Real network' }];
  const config = await h.run('NetheraApi.getConfiguration()');
  assert.equal(config.id, -1);
  assert.equal(config.dnsBlocking, true);
  assert.equal(config.lanIp, '192.0.2.1');
  assert.equal((await h.run('NetheraApi.getRouterControlStatus()')).connection, 'offline');
  assert.equal(h.calls.every(call => call.url.endsWith('/routers/list')), true);
});

test('demo fixtures cannot be mutated across page loads and disappear completely on reconnect', async () => {
  const h = harness([offline]);
  let state = await h.run('NetheraApi.getSecurityState()');
  state.presets[0].name = 'Mutated';
  state.members.length = 0;
  state = await h.run('NetheraApi.getSecurityState()');
  assert.notEqual(state.presets[0].name, 'Mutated');
  assert.ok(state.members.length > 0);
  h.context.routers = [live];
  h.context.security = { groups: [], presets: [], blocklists: [], assignments: [], members: [], timeLimits: [] };
  state = await h.run('NetheraApi.getSecurityState()');
  assert.equal(state.devices[0].id, 20);
  for (const key of ['groups', 'presets', 'blocklists', 'assignments', 'members', 'timeLimits']) assert.equal(state[key].length, 0);
  assert.equal(await h.run('NetheraApi.getConfiguration()'), null);
  h.context.routers = [{ id: 1 }];
  state = await h.run('NetheraApi.getSecurityState()');
  assert.equal(state.dataMode, 'unavailable');
  assert.equal(state.presets.length, 0);
  assert.equal(await h.run('NetheraApi.getConfiguration()'), null);
  h.context.status = 503;
  await assert.rejects(h.run('NetheraApi.getSecurityState()'));
  await assert.rejects(h.run('NetheraApi.getConfiguration()'));
});

test('demo and unknown modes block install and guarded mutations before any POST', async () => {
  for (const router of [offline, { id: 1 }]) {
    const h = harness([router]);
    await assert.rejects(h.run('NetheraApi.installAdblock()'), /bestätigter Routerverbindung/);
    assert.equal(h.calls.some(call => call.options.method === 'POST'), false);
  }
});

test('traffic excludes unknown-origin rows and another router', async () => {
  const h = harness([live]);
  h.context.connections = [{ id: 1 }, { id: 2, dataSource: 'ROUTER', routerId: 2 }, { id: 3, dataSource: 'ROUTER', routerId: 1 }];
  const connections = await h.run('NetheraApi.getConnections()');
  assert.equal(connections.length, 1);
  assert.equal(connections[0].id, 3);
});

test('temporary demo uses memory-only fixtures for the authenticated demo account', async () => {
  const h = harness([live]);
  h.run(`window.parent={NETHERA_DEMO_PREVIEW:true,NetheraAccount:{authenticated:true,keycloak:{tokenParsed:{preferred_username:'demo'}}}}`);
  const router = await h.run('NetheraApi.getPrimaryRouter()');
  assert.equal(router.dataMode, 'demo');
  assert.equal(router.devices.length, 8);
  assert.equal(h.calls.length, 0);
  await assert.rejects(h.run('NetheraApi.requireLive()'));
  h.run('window.parent.NETHERA_DEMO_PREVIEW=false');
  const restored = await h.run('NetheraApi.getPrimaryRouter()');
  assert.equal(restored.dataMode, 'live');
  assert.equal(restored.devices[0].id, 20);
  assert.equal(restored.devices.some(device => device.id < 0), false);
});

test('temporary demo flag does not bypass authentication or affect other accounts', async () => {
  for (const [authenticated, username] of [[false,'demo'],[true,'nico']]) {
    const h = harness([live]);
    h.context.window.parent={NETHERA_DEMO_PREVIEW:true,NetheraAccount:{authenticated,keycloak:{tokenParsed:{preferred_username:username}}}};
    assert.equal((await h.run('NetheraApi.getPrimaryRouter()')).dataMode, 'live');
    assert.equal(h.calls.length, 1);
  }
});
