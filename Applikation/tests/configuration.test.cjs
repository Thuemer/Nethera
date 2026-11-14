const { test } = require('node:test');
const assert = require('node:assert/strict');
global.window = {};
const { configErrors, isRouterAddress, normalizeConfig } = require('../configuration.js');
const valid = { routerName: 'Heimrouter', mode: 'GATEWAY', lanIp: '192.168.1.1', gatewayIp: '10.0.0.1' };

test('accepts router IPv4 addresses and rejects malformed, multicast and loopback addresses', () => {
  for (const ip of ['192.168.1.1', '10.0.0.1', '172.16.0.254']) assert.equal(isRouterAddress(ip), true, ip);
  for (const ip of ['', '1.2.3', '1.2.3.256', '01.2.3.4', 'localhost', '127.0.0.1', '0.0.0.0', '224.0.0.1', '192.168.1.1/24', '::1']) assert.equal(isRouterAddress(ip), false, ip);
});

test('reports each invalid field instead of sending incomplete configuration', () => {
  assert.deepEqual(configErrors(valid), {});
  assert.deepEqual(Object.keys(configErrors({ routerName: '', mode: 'unknown', lanIp: 'abc', gatewayIp: '' })), ['routerName', 'securityMode', 'lanIp', 'gatewayIp']);
  assert.ok(configErrors({ ...valid, routerName: 'a'.repeat(101) }).routerName);
});

test('normalizes backend fields without inventing defaults for missing IP addresses', () => {
  const result = normalizeConfig({ id: 5, router_name: 'Router', lan_ip: '10.0.0.1', dns_blocking: false, guest_network: true });
  assert.equal(result.id, 5);
  assert.equal(result.routerName, 'Router');
  assert.equal(result.lanIp, '10.0.0.1');
  assert.equal(result.gatewayIp, '');
  assert.equal(result.dnsBlocking, false);
  assert.equal(result.guestNetwork, true);
});

const vm = require('node:vm');
const fs = require('node:fs');
function page(fetch) {
  const elements = new Map();
  const checkboxes = ['updates', 'dnsBlocking', 'guestNetwork', 'profiling'];
  const document = {
    addEventListener() {},
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { value: '', checked: false, type: checkboxes.includes(id) ? 'checkbox' : 'text', hidden: false, attributes: {},
        setAttribute(key, value) { this.attributes[key] = value; },
        removeAttribute(key) { delete this.attributes[key]; },
        focus() { this.focused = true; }
      });
      return elements.get(id);
    }
  };
  const context = vm.createContext({ window: {}, document, fetch, AbortSignal, NetheraApi: { getAuthHeader: async () => ({ Authorization: 'Bearer test' }), userMessage: () => 'Daten konnten nicht geladen werden.' } });
  vm.runInContext(fs.readFileSync(require.resolve('../configuration.js'), 'utf8'), context);
  return { elements, run: expression => vm.runInContext(expression, context), field: id => document.getElementById(id) };
}
const config = { id: 3, ...valid, updates: false, dnsBlocking: true, guestNetwork: false, profiling: true };
const okList = () => ({ ok: true, json: async () => [config] });

test('failed loading keeps editing disabled and offers retry', async () => {
  const p = page(async () => { throw new Error('Offline'); });
  await p.run('loadConfigs()');
  assert.equal(p.field('configFields').disabled, true);
  assert.equal(p.field('saveConfig').disabled, true);
  assert.equal(p.field('retryConfig').hidden, false);
});

test('invalid network input never sends a PUT and opens advanced settings', async () => {
  let requests = 0;
  const p = page(async () => { requests++; return okList(); });
  await p.run('loadConfigs()');
  p.field('lanIp').value = '192.168.1.999';
  await p.run('saveConfig({ preventDefault() {} })');
  assert.equal(requests, 1);
  assert.equal(p.field('advancedSettings').open, true);
  assert.equal(p.field('lanIp').attributes['aria-invalid'], 'true');
  assert.equal(p.field('lanIp').focused, true);
});

test('failed save preserves edited values; retry success clears dirty state and blocks duplicate saves', async () => {
  let saves = 0;
  const p = page(async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer test');
    if (!options.method) return okList();
    saves++;
    assert.equal(url, 'http://localhost:8080/api/configs/3');
    assert.equal(JSON.parse(options.body).routerName, 'Neuer Name');
    return saves === 1 ? { ok: false, status: 503 } : { ok: true };
  });
  await p.run('loadConfigs()');
  assert.equal(p.run('hasChanges()'), false);
  p.field('routerName').value = 'Neuer Name';
  await p.run('saveConfig({ preventDefault() {} })');
  assert.equal(p.field('routerName').value, 'Neuer Name');
  assert.equal(p.run('hasChanges()'), true);
  assert.equal(p.field('saveConfig').disabled, false);
  await p.run('saveConfig({ preventDefault() {} })');
  assert.equal(p.run('hasChanges()'), false);
  assert.equal(p.field('saveConfig').disabled, true);
  await p.run('saveConfig({ preventDefault() {} })');
  assert.equal(saves, 2);
  assert.match(p.field('statusBox').attributes.text, /Router.*noch nicht bestätigt/);
});
