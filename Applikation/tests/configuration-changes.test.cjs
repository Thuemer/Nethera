const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

function harness() {
  const elements = new Map();
  const field = id => {
    if (!elements.has(id)) elements.set(id, { value: '', checked: false, disabled: false, setAttribute() {}, dispatchEvent() {} });
    return elements.get(id);
  };
  const calls = [];
  const context = vm.createContext({
    window: {}, Event, NetheraApi: { userMessage: () => 'Laden fehlgeschlagen', requireLive: async () => {}, isLive: () => true },
    document: { getElementById: field, querySelector: () => field('save'), addEventListener() {} },
    fetch: async (url, options) => { calls.push(options); return { ok: true }; }
  });
  vm.runInContext(readFileSync(`${__dirname}/../configuration.js`, 'utf8'), context);
  const run = source => vm.runInContext(source, context);
  run(`fillForm({id:1,routerName:'Home',mode:'GATEWAY',lanIp:'192.168.0.1',gatewayIp:'192.168.0.1',updates:false,dnsBlocking:false,guestNetwork:false,profiling:false}); savedConfig = readForm(); updateChangeState();`);
  return { field, calls, run, context };
}

test('changes enable save and discard; discard restores all saved fields without a request', () => {
  const h = harness();
  assert.equal(h.field('save').disabled, true);
  h.field('routerName').value = 'Changed';
  h.field('guestNetwork').checked = true;
  h.run('updateChangeState()');
  assert.equal(h.field('save').disabled, false);
  assert.equal(h.run('hasUnsavedChanges()'), true);
  h.run('discardChanges()');
  assert.equal(h.field('routerName').value, 'Home');
  assert.equal(h.field('guestNetwork').checked, false);
  assert.equal(h.run('hasUnsavedChanges()'), false);
  assert.equal(h.calls.length, 0);
});

test('successful save updates baseline and prevents duplicate requests', async () => {
  const h = harness();
  h.field('routerName').value = 'Updated';
  await h.run('saveConfig()');
  await h.run('saveConfig()');
  assert.equal(h.calls.length, 1);
  assert.equal(h.run('hasUnsavedChanges()'), false);
  assert.equal(h.field('configFields').disabled, false);
});

test('failed save preserves edits and allows retry or discard', async () => {
  const h = harness();
  h.field('lanIp').value = '192.168.1.1';
  h.context.fetch = async () => ({ ok: false, status: 500 });
  await assert.rejects(h.run('saveConfig()'), /API 500/);
  assert.equal(h.run('hasUnsavedChanges()'), true);
  assert.equal(h.field('save').disabled, false);
  assert.equal(h.field('lanIp').value, '192.168.1.1');
  h.run('discardChanges()');
  assert.equal(h.field('lanIp').value, '192.168.0.1');
});
