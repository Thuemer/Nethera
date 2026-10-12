const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function harness(file) {
  const fields = new Map();
  const calls = [];
  const field = id => {
    if (!fields.has(id)) fields.set(id, { value: '', checked: false, setAttribute() {}, dispatchEvent() {} });
    return fields.get(id);
  };
  const context = vm.createContext({
    URL, Intl, Event, Date, console,
    window: { NETHERA_CONFIG: { API_BASE_URL: 'http://test' } },
    localStorage: { getItem: () => null, setItem() {} },
    document: { addEventListener() {}, getElementById: field, querySelector: () => null },
    fetch: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ url, method: options.method || 'GET', body });
      return { ok: true, status: 200, json: async () => ({ ...body, id: body?.id || 99 }) };
    }
  });
  vm.runInContext(readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  return { context, calls, field, run: source => vm.runInContext(source, context) };
}

function securityHarness() {
  const h = harness('security.js');
  h.run(`Object.assign(state, {
    devices: [{id:1,hostname:'Tablet'}, {id:2,hostname:'Laptop'}],
    groups: [{id:3,name:'Kinder',blocklistId:5}],
    presets: [{id:7,name:'Shared',blocklistId:5,priorityMode:false,blockedFrom:'22:00',blockedUntil:'06:00',timeLimitMinutes:60}],
    assignments: [{deviceId:1,presetId:7}, {deviceId:2,presetId:7}],
    blocklists: [{id:5,name:'Shared filter',sourceType:'CUSTOM',urlPattern:'example.com|adult'}],
    timeLimits: [{deviceId:1,usedMinutesToday:25}]
  }); loadSecurityState = async () => {};`);
  return h;
}

test('domain parsing accepts URLs but rejects credentials, ports and invalid domains', () => {
  const h = securityHarness();
  assert.equal(h.run(`sanitizeDomain('https://www.Example.com/path')`), 'example.com');
  for (const input of ['bad domain', 'https://user:pass@example.com', 'javascript:alert(1)', 'localhost', 'example.com:8080']) {
    assert.equal(h.run(`sanitizeDomain(${JSON.stringify(input)})`), '');
  }
});

test('device priority copies shared preset and preserves its other settings', async () => {
  const h = securityHarness();
  await h.run('saveDeviceProfile(1, {priorityMode:true})');
  const payload = h.calls[0].body;
  assert.equal(payload.id, null);
  assert.equal(payload.blocklistId, 5);
  assert.equal(payload.blockedFrom, '22:00');
  assert.equal(payload.timeLimitMinutes, 60);
  assert.equal(payload.priorityMode, true);
  assert.equal(h.run('state.presets[0].priorityMode'), false);
  assert.match(h.calls[1].url, /devices\/1\/preset\/99$/);
});

test('device-only domain rule preserves prior entries without modifying a shared list', async () => {
  const h = securityHarness();
  h.field('manualDomainInput').value = 'https://youtube.com/watch';
  h.field('domainScope').value = 'device';
  h.field('domainTarget').value = '1';
  await h.run('addManualDomain({preventDefault(){}})');
  assert.equal(h.calls[0].body.id, null);
  assert.equal(h.calls[0].body.sourceType, 'DEVICE');
  assert.equal(h.calls[0].body.urlPattern, 'example.com|adult|youtube.com');
  assert.equal(h.calls[1].body.blocklistId, 99);
  assert.equal(h.run('state.blocklists[0].urlPattern'), 'example.com|adult');
});

test('group rule is assigned to selected group, not a different device', async () => {
  const h = securityHarness();
  h.field('manualDomainInput').value = 'youtube.com';
  h.field('domainScope').value = 'group';
  h.field('domainTarget').value = '3';
  await h.run('addManualDomain({preventDefault(){}})');
  assert.match(h.calls[1].url, /security\/groups$/);
  assert.equal(h.calls[1].body.id, 3);
  assert.equal(h.calls[1].body.blocklistId, 99);
  assert.equal(h.calls.some(call => call.url.includes('/devices/')), false);
});

test('network rule uses an explicit network-wide scope', async () => {
  const h = securityHarness();
  h.field('manualDomainInput').value = 'youtube.com';
  h.field('domainScope').value = 'network';
  await h.run('addManualDomain({preventDefault(){}})');
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].body.sourceType, 'NETWORK');
});

test('applying a preset persists its chosen schedule and preserves recorded usage', async () => {
  const h = securityHarness();
  await h.run('applyPresetToDevice(1, state.presets[0])');
  const limit = h.calls[0].body;
  assert.match(h.calls[0].url, /device-time-limits\/1$/);
  assert.equal(limit.blockedFrom, '22:00');
  assert.equal(limit.blockedUntil, '06:00');
  assert.equal(limit.usedMinutesToday, 25);
  assert.equal(limit.dailyLimitMinutes, 60);
});

test('preset without schedule does not erase independent Internet times', async () => {
  const h = securityHarness();
  await h.run('applyPresetToDevice(1, {id:8,name:"Filter only"})');
  assert.equal(h.calls.length, 1);
  assert.match(h.calls[0].url, /preset\/8$/);
});

test('group category edits preserve existing individual domains', async () => {
  const h = securityHarness();
  h.field('groupBlocklistSelect').value = '3';
  h.field('groupPkgGambling').checked = true;
  await h.run('saveGroupBlocklist({preventDefault(){}})');
  assert.equal(h.calls[0].body.urlPattern, 'gambling|example.com');
  assert.equal(h.calls[0].body.id, null);
});

test('a specific social domain does not enable the whole social category', () => {
  const h = securityHarness();
  h.run(`state.blocklists[0].urlPattern = 'instagram.com|adult';`);
  h.field('groupBlocklistSelect').value = '3';
  h.run('renderGroupBlocklistForm()');
  assert.equal(h.field('groupPkgSocial').checked, false);
  assert.equal(h.field('groupPkgAdult').checked, true);
});

test('invalid group domain does not silently save other settings', async () => {
  const h = securityHarness();
  h.field('groupBlocklistSelect').value = '3';
  h.field('groupDomainInput').value = 'bad domain';
  await h.run('saveGroupBlocklist({preventDefault(){}})');
  assert.equal(h.calls.length, 0);
});

test('ad protection updates DNS setting without dropping other router settings', async () => {
  const h = securityHarness();
  h.run(`activeRouterConfig={id:1,routerName:'Router',mode:'GATEWAY',dnsBlocking:true,updates:true,lanIp:'192.168.1.1',guestNetwork:true};`);
  h.field('adProtectionEnabled').checked = false;
  await h.run('saveAdProtection({preventDefault(){}})');
  assert.equal(h.calls[0].body.dnsBlocking, false);
  assert.equal(h.calls[0].body.routerName, 'Router');
  assert.equal(h.calls[0].body.guestNetwork, true);
  assert.equal(h.calls[0].body.updates, true);
});

test('overnight schedule ends exactly at the configured end time', () => {
  const h = harness('time-limits.js');
  h.run(`Date = class extends Date { getHours(){return 7} getMinutes(){return 0} };`);
  assert.equal(h.run(`isBlockedNow({from:'21:00',until:'07:00',status:'active'})`), false);
  h.run(`Date = class extends Date { getHours(){return 23} getMinutes(){return 0} };`);
  assert.equal(h.run(`isBlockedNow({from:'21:00',until:'07:00',status:'active'})`), true);
  assert.equal(h.run(`isBlockedNow({from:'21:00',until:'07:00',status:'paused'})`), false);
});

test('failed save keeps previous time rule and does not claim local success', async () => {
  const h = harness('time-limits.js');
  h.field('deviceSelect').value = '1';
  h.field('blockedFrom').value = '22:00';
  h.field('blockedUntil').value = '07:00';
  h.field('limitNote').value = '';
  h.run(`state.storageMode='backend'; state.limits['1']={from:'21:00'};
    saveBackendLimit=async()=>{throw new Error('offline')};`);
  await h.run('saveSelectedLimit({preventDefault(){}})');
  assert.equal(h.run(`state.limits['1'].from`), '21:00');
});
