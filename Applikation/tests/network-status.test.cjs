const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

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
      userMessage: () => 'Daten konnten nicht geladen werden.'
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
  const h = harness({ dataMode: 'demo', isOnline: false, devices: [{ connectionType: 'wifi' }, { connectionType: 'lan' }] });
  await h.check();
  assert.equal(h.field('deviceCount').attributes.value, '1');
  assert.equal(h.field('deviceCount').attributes.detail, 'Beispielgeräte');
  assert.equal(h.field('routerState').attributes.value, 'Offline');
  assert.equal(h.field('routerState').attributes.tone, 'danger');
  assert.equal(h.field('statusBox').attributes.state, 'info');
});

test('failed requests leave an explicit error and no device count', async () => {
  const h = harness(new Error('API 500'));
  await h.check();
  assert.equal(h.field('deviceCount').attributes.value, '—');
  assert.equal(h.field('deviceCount').attributes.detail, 'nicht verfügbar');
  assert.equal(h.field('routerState').attributes.tone, '');
  assert.equal(h.field('statusBox').attributes.state, 'error');
});
