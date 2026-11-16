const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

function harness() {
  const elements = new Map();
  const field = id => {
    if (!elements.has(id)) elements.set(id, { value: '', checked: false, disabled: false, setAttribute() {}, removeAttribute() {}, focus() {}, dispatchEvent() {} });
    return elements.get(id);
  };
  const calls = [];
  const context = vm.createContext({
    window: {}, Event, NetheraApi: { userMessage: () => 'Laden fehlgeschlagen', requireLive: async () => {}, isLive: () => true },
    document: { getElementById: field, querySelector: () => field('save'),
      querySelectorAll: () => ['routerName', 'lanIp', 'gatewayIp', 'updates', 'dnsBlocking', 'guestNetwork', 'profiling'].map(id => {
        field(id).type = ['routerName', 'lanIp', 'gatewayIp'].includes(id) ? 'text' : 'checkbox';
        return field(id);
      }), addEventListener() {} },
    fetch: async (url, options) => { calls.push(options); return { ok: true }; }
  });
  vm.runInContext(readFileSync(`${__dirname}/../configuration.js`, 'utf8'), context);
  const run = source => vm.runInContext(source, context);
  run(`fillForm({id:1,routerName:'Home',mode:'GATEWAY',lanIp:'192.168.0.1',gatewayIp:'192.168.0.1',updates:false,dnsBlocking:false,guestNetwork:false,profiling:false}); savedConfig = readForm(); updateChangeState();`);
  return { field, calls, run, context };
}

test('changes enable save and discard; discard restores all saved fields without a request', () => {
  const h = harness();
  assert.equal(h.field('saveConfig').disabled, true);
  h.field('routerName').value = 'Changed';
  h.field('guestNetwork').checked = true;
  h.run('updateChangeState()');
  assert.equal(h.field('saveConfig').disabled, false);
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
  assert.equal(h.field('saveConfig').disabled, false);
  assert.equal(h.field('lanIp').value, '192.168.1.1');
  h.run('discardChanges()');
  assert.equal(h.field('lanIp').value, '192.168.0.1');
});

test('demo configuration is visible but read-only; missing data clears old demo values', async () => {
  const h = harness();
  h.run(`NetheraApi.isLive=()=>false;
    NetheraApi.getPrimaryRouter=async()=>({dataMode:'demo'});
    NetheraApi.getConfiguration=async()=>({id:-1,routerName:'Demo-Netzwerk',mode:'GATEWAY',lanIp:'192.0.2.1',gatewayIp:'192.0.2.1',dnsBlocking:true});`);
  await h.run('loadConfigs()');
  assert.equal(h.field('routerName').value, 'Demo-Netzwerk');
  assert.equal(h.field('dnsBlocking').checked, true);
  assert.equal(h.field('configFields').disabled, true);
  assert.equal(h.field('saveConfig').disabled, true);
  assert.equal(h.calls.length, 0);
  h.run(`NetheraApi.getPrimaryRouter=async()=>({dataMode:'unavailable'}); NetheraApi.getConfiguration=async()=>null;`);
  await h.run('loadConfigs()');
  assert.equal(h.field('routerName').value, '');
  assert.equal(h.field('dnsBlocking').checked, false);
  assert.equal(h.field('configFields').disabled, true);
});


test('invalid network address prevents saving and opens advanced settings', async () => {
  const h = harness();
  h.field('lanIp').value = '192.168.1.999';
  await h.run('saveConfig()');
  assert.equal(h.calls.length, 0);
  assert.equal(h.field('advancedSettings').open, true);
  assert.equal(h.run('hasUnsavedChanges()'), true);
});

test('demo edits cannot trigger a write even through direct save invocation', async () => {
  const h = harness();
  h.field('routerName').value = 'Changed';
  h.run(`NetheraApi.isLive=()=>false; NetheraApi.requireLive=async()=>{throw new Error('Read only');}`);
  await assert.rejects(h.run('saveConfig()'), /Read only/);
  assert.equal(h.calls.length, 0);
});
