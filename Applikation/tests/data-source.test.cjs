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

test('embedded demo has one shell label; live and failure notices remain visible', async () => {
  const h = harness([offline]);
  const notice = { dataset: {} }, indicator = { hidden: true }, body = { dataset: {} };
  h.context.document = { body, getElementById: () => notice };
  h.context.window.parent = { document: { getElementById: () => indicator } };
  await h.run('NetheraApi.getPrimaryRouter()');
  assert.equal(indicator.hidden, false);
  assert.equal(notice.hidden, true);
  assert.equal(notice.textContent, 'Demo');
  assert.equal(body.dataset.sourceMode, 'demo');
  h.context.routers = [live];
  await h.run('NetheraApi.getPrimaryRouter()');
  assert.equal(indicator.hidden, true);
  assert.equal(notice.hidden, false);
  assert.equal(body.dataset.sourceMode, 'live');
  h.context.status = 500;
  await assert.rejects(h.run('NetheraApi.getPrimaryRouter()'));
  assert.equal(notice.hidden, false);
  assert.match(notice.textContent, /unbekannt/);
  assert.equal(body.dataset.sourceMode, 'unavailable');
});

test('standalone demo pages keep a concise source label', async () => {
  const h = harness([offline]);
  const notice = { dataset: {} };
  h.context.document = { body: { dataset: {} }, getElementById: () => notice };
  await h.run('NetheraApi.getPrimaryRouter()');
  assert.equal(notice.textContent, 'Demo');
  assert.equal(notice.hidden, false);
});

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
  h.context.security = { devices: [{ id: 1 }, { id: 20 }], members: [{ deviceId: 1 }, { deviceId: 20 }], assignments: [{ deviceId: 1 }], timeLimits: [{ deviceId: 1 }], presets: [{ id: 4, name: 'Saved configuration' }] };
  const state = await h.run('NetheraApi.getSecurityState()');
  assert.equal(state.devices.length, 1);
  assert.equal(state.devices[0].id, 20);
  assert.equal(state.members.length, 0);
  assert.equal(state.assignments.length, 0);
  assert.equal(state.timeLimits.length, 0);
  assert.equal(state.presets.length, 0);
  assert.equal(state.rulesKnown, false);
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

test('device rules require explicit origin, not an applied flag or matching router ID', async () => {
  for (const origin of [{}, { routerId: 1 }, { routerId: 1, applied: true },
    { routerId: 1, dataSource: 'UNKNOWN' }, { routerId: 2, dataSource: 'ROUTER' },
    { routerId: null, dataSource: 'ROUTER' }, { routerId: true, dataSource: 'ROUTER' }]) {
    const h = harness([live]);
    const security = routerRules();
    for (const key of ['blocklists', 'groups', 'presets', 'members', 'assignments']) {
      security[key] = security[key].map(({ routerId, dataSource, ...record }) => ({ ...record, ...origin }));
    }
    h.context.security = security;
    const state = await h.run('NetheraApi.getSecurityState()');
    for (const key of ['blocklists', 'groups', 'presets', 'members', 'assignments']) assert.equal(state[key].length, 0);
    assert.equal(state.rulesKnown, false);
    assert.equal(state.devices[0].id, 20);
  }
});

function appliedNetwork() {
  const h = harness([live]);
  h.context.security = {
    blocklists: [
      { id: 1, routerId: 1, sourceType: 'PRESET', urlPattern: 'adult|gambling' },
      { id: 2, routerId: 1, sourceType: 'PRESET', urlPattern: 'tiktok.com|instagram.com' },
      { id: 3, routerId: 1, sourceType: 'GROUP', urlPattern: 'youtube.com' },
      { id: 4, routerId: 1, sourceType: 'DNS', urlPattern: 'ads.example.net|tracker.example.com|ads.google.com' },
      { id: 5, routerId: 1, sourceType: 'NETWORK', urlPattern: 'tiktok.com|htl-leonding.at|youtube.com' }
    ],
    groups: [{ id: 2, routerId: 1, blocklistId: 3 }],
    presets: [{ id: 3, routerId: 1, blocklistId: 2 }],
    members: [{ deviceId: 20, groupId: 2 }], assignments: [{ deviceId: 20, presetId: 3 }]
  };
  h.context.control = { connection: 'online', checkedAt: '2026-11-16T12:55:44Z',
    adblock: { installed: true, enabled: true, applied: true },
    blocklists: Object.fromEntries([1, 2, 3, 4, 5].map(id => [id, { applied: true }])) };
  return h;
}

test('current router ACK restores active network and DNS lists, not unused presets or assignments', async () => {
  const h = appliedNetwork();
  const before = JSON.stringify(h.context.security);
  const state = await h.run('NetheraApi.getSecurityState()');
  assert.equal(JSON.stringify(state.blocklists.map(row => row.id)), '[4,5]');
  assert.equal(state.blocklists.every(row => row.confirmationSource === 'ROUTER_ACK'), true);
  assert.equal(state.blocklists.reduce((n, row) => n + row.urlPattern.split('|').length, 0), 6);
  for (const key of ['groups', 'presets', 'members', 'assignments']) assert.equal(state[key].length, 0);
  assert.equal(state.rulesKnown, false);
  assert.equal(JSON.stringify(h.context.security), before);
  assert.ok(h.calls.every(call => !call.options.method || call.options.method === 'GET'));
});

test('acknowledged lists show only domains accepted by the router DNS publisher', async () => {
  const h = appliedNetwork();
  h.context.security.blocklists[4].urlPattern = 'HTTPS://WWW.Example.org/path|adult;EXAMPLE.ORG.,example.org\nhttps://host.example.net:443/a?x=1|*.invalid.org|bad_domain.org';
  h.context.security.blocklists.push({ id: 6, routerId: 1, sourceType: 'NETWORK', urlPattern: 'adult|gambling' });
  h.context.control.blocklists[6] = { applied: true };
  const state = await h.run('NetheraApi.getSecurityState()');
  assert.equal(state.blocklists.find(row => row.id === 5).urlPattern, 'example.org|host.example.net|www.example.org');
  assert.equal(state.blocklists.some(row => row.id === 6), false);
});

test('DNS ACK requires active installed adblock, while network blocking stays independent', async () => {
  for (const adblock of [null, {}, { installed: false, enabled: true, applied: true },
    { installed: true, enabled: false, applied: true }, { installed: true, enabled: true, applied: false }]) {
    const h = appliedNetwork(); h.context.control.adblock = adblock;
    const state = await h.run('NetheraApi.getSecurityState()');
    assert.equal(JSON.stringify(state.blocklists.map(row => row.id)), '[5]');
  }
});

test('unconfirmed, failed or wrong-router ACKs never certify network lists', async () => {
  for (const change of [{ connection: 'offline' }, { connection: 'unknown' }, { error: 'apply failed' },
    { checkedAt: null }, { checkedAt: 'invalid' }, { checkedAt: 123 }, { routerId: 2 }, { routerId: true },
    { blocklists: {} }, { blocklists: { 4: { applied: false }, 5: { applied: true, error: 'rejected' } } }]) {
    const h = appliedNetwork(); Object.assign(h.context.control, change);
    assert.equal((await h.run('NetheraApi.getSecurityState()')).blocklists.length, 0);
  }
  for (const controlStatus of [401, 403, 404, 500, 501]) {
    const h = appliedNetwork(); h.context.controlStatus = controlStatus;
    const state = await h.run('NetheraApi.getSecurityState()');
    assert.equal(state.blocklists.length, 0);
    assert.equal(state.rulesKnown, false);
  }
});

test('legacy ACK belongs to configured router 1, explicit future ACK must match selected router', async () => {
  const h = appliedNetwork();
  h.context.routers = [{ ...live, id: 2 }];
  h.context.security.blocklists.forEach(row => { row.routerId = 2; });
  assert.equal((await h.run('NetheraApi.getSecurityState()')).blocklists.length, 0);
  h.context.control.routerId = 2;
  assert.equal((await h.run('NetheraApi.getSecurityState()')).blocklists.length, 2);
  h.context.security.blocklists[4].routerId = 1;
  assert.equal((await h.run('NetheraApi.getSecurityState()')).blocklists.length, 1);
});

test('ACK loss, offline demo and reconnect replace active lists without retaining stale state', async () => {
  const h = appliedNetwork();
  assert.equal((await h.run('NetheraApi.getSecurityState()')).blocklists.length, 2);
  h.context.control.blocklists[5].applied = false;
  assert.equal((await h.run('NetheraApi.getSecurityState()')).blocklists.length, 1);
  h.context.controlStatus = 503;
  assert.equal((await h.run('NetheraApi.getSecurityState()')).blocklists.length, 0);
  h.context.routers = [offline];
  assert.ok((await h.run('NetheraApi.getSecurityState()')).blocklists.every(row => row.id < 0));
  h.context.routers = [live]; h.context.controlStatus = 200;
  const state = await h.run('NetheraApi.getSecurityState()');
  assert.equal(state.blocklists.length, 1);
  assert.equal(state.blocklists[0].id, 4);
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

test('mixed sources preserve only verified records and never certify completeness', async () => {
  const h = harness([live]);
  h.context.security = routerRules();
  h.context.security.blocklists.push({ id: 8, name: 'Seed list', routerId: 1 });
  h.context.security.groups.push({ dataSource: 'ROUTER', routerId: 1, id: 9, blocklistId: 8 });
  h.context.security.presets.push({ dataSource: 'ROUTER', routerId: 1, id: 10, blocklistId: 8 });
  h.context.security.members.push({ dataSource: 'ROUTER', routerId: 1, deviceId: 20, groupId: 9 });
  h.context.security.assignments.push({ dataSource: 'ROUTER', routerId: 1, deviceId: 20, presetId: 10 });
  h.context.security.assignments.push({ dataSource: 'ROUTER', routerId: 1, deviceId: 99, presetId: 3 });
  const state = await h.run('NetheraApi.getSecurityState()');
  for (const key of ['blocklists', 'groups', 'presets', 'members', 'assignments']) assert.equal(state[key].length, 1);
  assert.equal(state.rulesKnown, false);
});

test('a missing blocklist reference is unknown; explicit null means no blocklist', async () => {
  const h = harness([live]);
  h.context.security = routerRules();
  delete h.context.security.groups[0].blocklistId;
  h.context.security.presets[0].blocklistId = null;
  const state = await h.run('NetheraApi.getSecurityState()');
  assert.equal(state.groups.length, 0);
  assert.equal(state.members.length, 0);
  assert.equal(state.presets.length, 1);
  assert.equal(state.assignments.length, 1);
  assert.equal(state.rulesKnown, false);
});

test('only a complete router snapshot can certify absence of rules', async () => {
  const empty = { blocklists: [], groups: [], presets: [], members: [], assignments: [] };
  for (const metadata of [{}, { rulesComplete: true }, { dataSource: 'ROUTER', routerId: 1 },
    { dataSource: 'ROUTER', routerId: 2, rulesComplete: true }]) {
    const h = harness([live]); h.context.security = { ...empty, ...metadata };
    assert.equal((await h.run('NetheraApi.getSecurityState()')).rulesKnown, false);
  }
  const h = harness([live]);
  h.context.security = { ...empty, dataSource: 'ROUTER', routerId: 1, rulesComplete: true };
  assert.equal((await h.run('NetheraApi.getSecurityState()')).rulesKnown, true);
});

test('malformed and incomplete rule responses do not leak previous or demo data', async () => {
  const h = harness([live]);
  for (const security of [null, [], {}, { ...routerRules(), blocklists: [null, false, { id: true }] },
    { ...routerRules(), groups: 'bad', presets: null, assignments: {} }]) {
    h.context.security = security;
    const state = await h.run('NetheraApi.getSecurityState()');
    assert.equal(state.rulesKnown, false);
    assert.equal(state.dataMode, 'live');
    assert.ok(state.blocklists.every(row => row.dataSource === 'ROUTER'));
  }
  h.context.status = 503;
  await assert.rejects(h.run('NetheraApi.getSecurityState()'));
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
