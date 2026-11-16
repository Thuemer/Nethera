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
