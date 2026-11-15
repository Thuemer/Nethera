const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

function harness(routers = []) {
  const calls = [];
  const context = vm.createContext({
    window: { NETHERA_CONFIG: { API_BASE_URL: 'http://backend', ROUTERS_PATH: '/api/routers/list' } },
    routers, security: {}, connections: [], status: 200,
    fetch: async (url, options) => {
      calls.push({ url, options });
      const value = url.endsWith('/routers/list') ? context.routers : url.endsWith('/security/state') ? context.security : context.connections;
      return { ok: context.status === 200, status: context.status, json: async () => value };
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
  h.context.security = { devices: [{ id: 1 }, { id: 20 }], members: [{ deviceId: 1 }, { deviceId: 20 }], assignments: [{ deviceId: 1 }], timeLimits: [{ deviceId: 1 }], presets: [{ id: 4, name: 'Saved configuration' }] };
  const state = await h.run('NetheraApi.getSecurityState()');
  assert.equal(state.devices.length, 1);
  assert.equal(state.devices[0].id, 20);
  assert.equal(state.members.length, 1);
  assert.equal(state.assignments.length, 0);
  assert.equal(state.timeLimits.length, 0);
  assert.equal(state.presets.length, 1);
});

test('demo security does not fetch or expose real rule assignments', async () => {
  const h = harness([offline]);
  const state = await h.run('NetheraApi.getSecurityState()');
  assert.equal(state.assignments.length, 0);
  assert.equal(h.calls.some(call => call.url.endsWith('/security/state')), false);
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
