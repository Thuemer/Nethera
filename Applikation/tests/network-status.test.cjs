const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

// The real online rule from api.js, so the status page is tested with what it uses in the app.
const apiContext = vm.createContext({ window: { NETHERA_CONFIG: {} } });
vm.runInContext(readFileSync(`${__dirname}/../api.js`, 'utf8'), apiContext);
const onlineDevices = vm.runInContext('NetheraApi.onlineDevices', apiContext);

function harness(router) {
  const elements = new Map();
  const field = id => {
    if (!elements.has(id)) elements.set(id, {
      attributes: {}, innerHTML: '',
      setAttribute(key, value) { this.attributes[key] = value; }
    });
    return elements.get(id);
  };
  const context = vm.createContext({
    window: {}, navigator: { onLine: true },
    document: { getElementById: field, addEventListener() {} },
    NetheraApi: {
      getPrimaryRouter: async () => { if (router instanceof Error) throw router; return router; },
      userMessage: () => 'Daten konnten nicht geladen werden.',
      onlineDevices
    }
  });
  vm.runInContext(readFileSync(`${__dirname}/../network-status.js`, 'utf8'), context);
  return { field, check: () => vm.runInContext('checkStatus()', context) };
}

test('unavailable telemetry is neutral with a missing count, not offline or zero', async () => {
  const h = harness({ dataMode: 'unavailable', isOnline: null, devices: [] });
  await h.check();
  assert.equal(h.field('routerState').attributes.value, 'Unbekannt');
  assert.equal(h.field('routerState').attributes.tone, '');
  assert.equal(h.field('deviceCount').attributes.value, '—');
  assert.equal(h.field('statusBox').attributes.state, 'info');
  assert.match(h.field('statusDetails').innerHTML, /Keine aktuellen Daten/);
});

test('a live empty list is a genuine zero', async () => {
  const h = harness({ dataMode: 'live', isOnline: true, devices: [] });
  await h.check();
  assert.equal(h.field('deviceCount').attributes.value, '0');
  assert.equal(h.field('routerState').attributes.value, 'Online');
  assert.equal(h.field('statusBox').attributes.state, 'success');
});

test('demo counts are labelled as examples and never claim a live status update', async () => {
  const now = '2026-11-20T10:00:00Z';
  const h = harness({ dataMode: 'demo', isOnline: false, devices: [{ connectionType: 'wifi', lastSeen: now }, { connectionType: 'lan', lastSeen: now }] });
  await h.check();
  assert.equal(h.field('deviceCount').attributes.value, '2');
  assert.equal(h.field('deviceCount').attributes.detail, 'Beispielgeräte');
  assert.equal(h.field('routerState').attributes.value, 'Offline');
  assert.equal(h.field('routerState').attributes.tone, 'danger');
  assert.equal(h.field('statusBox').attributes.state, 'info');
});

test('the client count shows only devices seen in the latest router report', async () => {
  const h = harness({ dataMode: 'live', isOnline: true, checkedAt: '2026-11-20T10:00:00Z', devices: [
    { connectionType: 'wifi', lastSeen: '2026-11-20T09:59:30Z' },
    { connectionType: 'lan', lastSeen: '2026-11-20T09:58:30Z' },
    { connectionType: 'wifi', lastSeen: '2026-11-20T08:00:00Z' },
    { connectionType: 'wifi', lastSeen: null }
  ] });
  await h.check();
  assert.equal(h.field('deviceCount').attributes.value, '2');
  assert.equal(h.field('deviceCount').attributes.detail, 'von 4 bekannten');
});

test('failed requests leave an explicit error and no device count', async () => {
  const h = harness(new Error('API 500'));
  await h.check();
  assert.equal(h.field('deviceCount').attributes.value, '—');
  assert.equal(h.field('deviceCount').attributes.detail, 'nicht verfügbar');
  assert.equal(h.field('routerState').attributes.tone, '');
  assert.equal(h.field('statusBox').attributes.state, 'error');
});
