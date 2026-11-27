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
    NetheraApi: { requireLive: async () => {}, isLive: () => true },
    window: { NETHERA_CONFIG: { API_BASE_URL: 'http://test' } },
    localStorage: { getItem: () => null, setItem() {} },
    document: { addEventListener() {}, getElementById: field, querySelector: () => null, querySelectorAll: () => [] },
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
    rulesKnown: true,
    devices: [{id:1,hostname:'Tablet'}, {id:2,hostname:'Laptop'}],
    groups: [{id:3,name:'Kinder',blocklistId:5}],
    presets: [{id:7,name:'Shared',blocklistId:5,priorityMode:false,blockedFrom:'22:00',blockedUntil:'06:00',timeLimitMinutes:60}],
    assignments: [{deviceId:1,presetId:7}, {deviceId:2,presetId:7}],
    blocklists: [{id:5,name:'Shared filter',sourceType:'CUSTOM',urlPattern:'example.com|adult'}],
    timeLimits: [{deviceId:1,usedMinutesToday:25}]
  }); loadSecurityState = async () => {};`);
  return h;
}

test('quiet demo form status never hides a later error', () => {
  for (const file of ['time-limits.js', 'configuration.js']) {
    const h = harness(file);
    h.run("setStatus('')");
    assert.equal(h.field('statusBox').hidden, true, file);
    h.run("setStatus('Fehler beim Laden', 'error')");
    assert.equal(h.field('statusBox').hidden, false, file);
  }
});

test('domain parsing accepts URLs but rejects credentials, ports and invalid domains', () => {
  const h = securityHarness();
  assert.equal(h.run(`sanitizeDomain('https://www.Example.com/path')`), 'example.com');
  for (const input of ['bad domain', 'https://user:pass@example.com', 'javascript:alert(1)', 'localhost', 'example.com:8080']) {
    assert.equal(h.run(`sanitizeDomain(${JSON.stringify(input)})`), '');
  }
});

test('unverified rule views block writes before they can overwrite hidden assignments', async () => {
  const h = securityHarness();
  h.run('state.rulesKnown = false');
  await assert.rejects(h.run('saveDeviceProfile(1, {priorityMode:true})'), /vollständig vom Router/);
  await assert.rejects(h.run('applyPresetToDevice(1, state.presets[0])'), /vollständig vom Router/);
  await assert.rejects(h.run(`apiJson(SECURITY_API + '/devices/1/preset', {method:'DELETE'})`), /vollständig vom Router/);
  assert.equal(h.calls.length, 0);
  await h.run(`apiJson(API_BASE_URL + '/api/configs/1', {method:'PUT',body:'{"dnsBlocking":true}'})`);
  assert.equal(h.calls.length, 1);
  assert.match(h.calls[0].url, /api\/configs\/1$/);
});

test('unknown assignments and empty rule views do not pretend there are no rules', () => {
  const h = securityHarness();
  h.run(`Object.assign(state, {loaded:true, dataMode:'live', rulesKnown:false, groups:[], members:[], presets:[], assignments:[], blocklists:[]});
    renderGroupDevices(); renderManualDomains(); renderPresets(); renderGroupOverview(); renderPriorityList();`);
  assert.match(h.field('groupDeviceList').innerHTML, /Routerzuweisungen nicht bestätigt/);
  assert.doesNotMatch(h.field('groupDeviceList').innerHTML, /0 Regeln|Keine Vorlage|Priorität: Normal/);
  assert.match(h.field('manualDomainsList').innerHTML, /Keine bestätigten Blocklisten/);
  assert.match(h.field('presetList').innerHTML, /Keine gemeldeten Vorlagen/);
  assert.match(h.field('groupOverviewList').innerHTML, /Keine gemeldeten Gruppen/);
  assert.doesNotMatch(h.field('priorityList').innerHTML, /Normal|Nur gespeichert/);
});

test('unchanged protection rows do not claim local edits or repeat assignment values', () => {
  const h = securityHarness();
  h.run("state.preview = true; state.devices[0].connectionType = 'WiFi'; state.devices[1].connectionType = 'LAN'; renderGroupDevices()");
  const html = h.field('groupDeviceList').innerHTML;
  assert.doesNotMatch(html, /Lokaler Entwurf|Gruppe:|Vorlage:/);
  assert.match(html, /data-device-group="1"/);
  assert.match(html, /data-device-preset="1"/);
  assert.match(html, /2 Filtereinträge/);
  assert.match(html, /Keine IP · WLAN/);
  assert.match(html, /Keine IP · LAN/);
});

test('only changed assignments are labelled, including explicit removals', () => {
  const h = securityHarness();
  h.run(`state.preview = true; state.assignments = [];
    state.draftDeviceIds = {members:[], assignments:[1]}; renderGroupDevices()`);
  assert.equal((h.field('groupDeviceList').innerHTML.match(/Lokaler Entwurf/g) || []).length, 1);
  h.run(`state.draftDeviceIds = {members:[2], assignments:[]}; renderGroupDevices()`);
  assert.equal((h.field('groupDeviceList').innerHTML.match(/Lokaler Entwurf/g) || []).length, 1);
});

test('editing a shared preset labels its affected devices, without changing any API data', () => {
  const h = securityHarness();
  h.run('state.preview = true; state.presets[0].localDraft = true; renderGroupDevices()');
  assert.equal((h.field('groupDeviceList').innerHTML.match(/Lokaler Entwurf/g) || []).length, 2);
  assert.equal(h.calls.length, 0);
});

test('editable priority views keep unreported values unknown and label demo examples correctly', () => {
  const h = securityHarness();
  h.run(`Object.assign(state, {preview:true, rulesKnown:false, presets:[], assignments:[]}); renderPriorityList()`);
  assert.match(h.field('priorityList').innerHTML, /Priorität nicht gemeldet/);
  assert.doesNotMatch(h.field('priorityList').innerHTML, /Normal|Lokaler Entwurf/);
  h.run(`state.draftDeviceIds = {assignments:[1]}; renderPriorityList()`);
  assert.equal((h.field('priorityList').innerHTML.match(/Lokaler Entwurf/g) || []).length, 1);
  h.run(`state.dataMode = 'demo'; state.rulesKnown = true; state.draftDeviceIds = {}; renderPriorityList()`);
  assert.equal((h.field('priorityList').innerHTML.match(/Beispiel/g) || []).length, 2);
});

test('all confirmed DNS lists render their domains and active status without exposing raw markup', () => {
  const h = securityHarness();
  h.run(`Object.assign(state, {dataMode:'live', rulesKnown:false, blocklists:[
    {id:4,name:'Werbung & Tracker',sourceType:'DNS',urlPattern:'ads.example.org',confirmationSource:'ROUTER_ACK'},
    {id:6,name:'<script>unsafe</script>',sourceType:'DNS',urlPattern:'tracker.example.org',confirmationSource:'ROUTER_ACK'},
    {id:5,name:'Netzwerk',sourceType:'NETWORK',urlPattern:'youtube.com',confirmationSource:'ROUTER_ACK'}
  ]}); renderAdDomains();`);
  const html = h.field('adDomainsList').innerHTML;
  assert.match(html, /ads.example.org/);
  assert.match(html, /tracker.example.org/);
  assert.equal((html.match(/Am Router aktiv/g) || []).length, 2);
  assert.doesNotMatch(html, /youtube.com|<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('status refresh reloads security lists together with their router confirmation', async () => {
  const h = securityHarness();
  h.run('loadSecurityState = async () => { state.blocklists = []; state.routerControl = null; };');
  await h.run('loadRouterControlStatus()');
  assert.equal(h.run('state.blocklists.length'), 0);
  assert.equal(h.run('state.routerControl'), null);
});

test('local preview intercepts writes before live checks or fetch and keeps router ACK separate', async () => {
  const h = securityHarness();
  h.context.NetheraSecurityDraft = require('../security-draft.js');
  h.run(`draftBase = {devices:state.devices, groups:[], members:[], presets:[], assignments:[], timeLimits:[], blocklists:[]};
    localDraft = NetheraSecurityDraft.create({getItem:()=>null,setItem(){},removeItem(){}}, 'preview');
    Object.assign(state, {preview:true, loaded:true, rulesKnown:false});
    NetheraApi.requireLive = async () => {throw new Error('must not request router writes')};`);
  await h.run(`apiJson(SECURITY_API + '/groups', {method:'POST',body:'{"name":"Local"}'})`);
  assert.equal(h.run('localDraft.snapshot(draftBase).groups[0].name'), 'Local');
  await assert.rejects(h.run(`apiJson(API_BASE_URL + '/api/unsupported', {method:'POST'})`), /lokalen Vorschau/);
  assert.equal(h.calls.length, 0);
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

test('duplicate website rule is not written again', async () => {
  const h = securityHarness();
  h.field('manualDomainInput').value = 'example.com';
  h.field('domainScope').value = 'device';
  h.field('domainTarget').value = '1';
  await h.run('addManualDomain({preventDefault(){}})');
  assert.equal(h.calls.length, 0);
});

test('editing a blocklist domain validates input and preserves other entries', async () => {
  const h = securityHarness();
  await assert.rejects(h.run(`updateBlocklistDomain(5, 'example.com', 'bad domain')`));
  await assert.rejects(h.run(`updateBlocklistDomain(5, 'example.com', 'adult')`));
  assert.equal(h.calls.length, 0);
  assert.equal(await h.run(`updateBlocklistDomain(5, 'example.com', 'https://www.new.example.org/path')`), true);
  assert.equal(h.calls[0].body.urlPattern, 'new.example.org|adult');
  assert.equal(h.calls[0].body.id, 5);
});

test('unchanged domain edit does not write to the backend', async () => {
  const h = securityHarness();
  assert.equal(await h.run(`updateBlocklistDomain(5, 'example.com', 'example.com')`), false);
  assert.equal(h.calls.length, 0);
});

test('preset count is a separate neutral header badge, not a router success', () => {
  const h = securityHarness();
  h.run('renderPresets()');
  const html = h.field('presetList').innerHTML;
  assert.match(html, /preset-heading.*badge">2 Geräte/);
  assert.doesNotMatch(html, /badge ok/);
});

test('router effect is only confirmed by an explicit applied flag', () => {
  const h = securityHarness();
  assert.equal(h.run('routerEffect(null)'), 'Nur gespeichert');
  assert.equal(h.run('routerEffect({applied:false})'), 'Nur gespeichert');
  assert.equal(h.run('routerEffect({applied:false,error:"offline"})'), 'Routerfehler');
  assert.equal(h.run('routerEffect({applied:true})'), 'Nur gespeichert');
  h.run(`state.routerControl={connection:'online'};`);
  assert.equal(h.run('routerEffect({applied:true})'), 'Am Router bestätigt');
});

test('demo rules are examples rather than stored or applied settings', () => {
  const h = securityHarness();
  h.run(`state.dataMode='demo'; renderPriorityList(); renderAdDomains();`);
  assert.equal(h.run('routerEffect({applied:true})'), 'Beispiel');
  assert.match(h.field('priorityList').innerHTML, /Beispiel/);
  assert.doesNotMatch(h.field('priorityList').innerHTML, /Nur gespeichert|Am Router bestätigt/);
});

test('offline time schedules load from the shared fixture without a limits request', async () => {
  const h = harness('time-limits.js');
  h.run(`NetheraApi.getSecurityState=async()=>({dataMode:'demo',devices:[{id:-1}],presets:[{id:-2}],assignments:[{deviceId:-1,presetId:-2}],timeLimits:[{id:-3,deviceId:-1,dailyLimitMinutes:120,blockedFrom:'20:30',blockedUntil:'06:30',status:'paused'}]});`);
  await h.run('loadSecurityState()');
  assert.equal(h.run(`state.limits['-1'].from`), '20:30');
  assert.equal(h.run(`state.limits['-1'].dailyLimit`), 120);
  assert.equal(h.run(`state.limits['-1'].status`), 'paused');
  assert.equal(h.run('state.storageMode'), 'demo');
  assert.equal(h.calls.length, 0);
  h.run(`NetheraApi.getSecurityState=async()=>({dataMode:'unavailable',devices:[]});`);
  await h.run('loadSecurityState()');
  assert.equal(h.run('Object.keys(state.limits).length'), 0);
});

test('priority list confirms only the matching device and mode', () => {
  const h = securityHarness();
  h.run(`state.routerControl={connection:'online',priority:{1:{mode:'high',applied:true},2:{mode:'normal',applied:false}}};
    state.presets[0].priorityMode=true; renderPriorityList();`);
  assert.match(h.field('priorityList').innerHTML, /Tablet.*Am Router bestätigt/);
  assert.match(h.field('priorityList').innerHTML, /Laptop.*Routerwirkung unbestätigt/);
  h.run(`state.routerControl.connection='offline'; renderPriorityList();`);
  assert.doesNotMatch(h.field('priorityList').innerHTML, /Am Router bestätigt/);
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
  h.run(`NetheraApi={userMessage:()=> 'Bitte erneut versuchen.'};
    state.storageMode='backend'; state.limits['1']={from:'21:00'};
    saveBackendLimit=async()=>{throw new Error('offline')};`);
  await h.run('saveSelectedLimit({preventDefault(){}})');
  assert.equal(h.run(`state.limits['1'].from`), '21:00');
});

test('time limit validation rejects empty, equal and out-of-range values', () => {
  const h = harness('time-limits.js');
  assert.match(h.run(`validLimitInput('', '07:00', 0, '')`), /Uhrzeiten/);
  assert.match(h.run(`validLimitInput('07:00', '07:00', 0, '')`), /Uhrzeiten/);
  assert.match(h.run(`validLimitInput('21:00', '07:00', 1500, '')`), /Tagesbudget/);
  assert.equal(h.run(`validLimitInput('21:00', '07:00', 60, '')`), '');
});

test('scheduled time without router confirmation is never shown as a verified block', () => {
  const h = harness('time-limits.js');
  h.run(`state.devices=[{id:1,hostname:'Tablet'}]; state.filteredDevices=state.devices;
    state.limits={'1':{from:'21:00',until:'07:00',status:'active',dailyLimit:0,usedMinutesToday:0}};
    renderList();`);
  assert.match(h.field('limitsList').innerHTML, /Nur gespeichert/);
  assert.doesNotMatch(h.field('limitsList').innerHTML, /Am Router gesperrt/);
});

test('time limit readback is not confirmed while router is offline', () => {
  const h = harness('time-limits.js');
  h.run(`state.devices=[{id:1,hostname:'Tablet'}]; state.filteredDevices=state.devices;
    state.limits={'1':{from:'21:00',until:'07:00',status:'active',dailyLimit:0,usedMinutesToday:0}};
    state.routerControl={connection:'offline',timeLimits:{1:{applied:true,blockedNow:true}}};
    renderList();`);
  assert.match(h.field('limitsList').innerHTML, /Nur gespeichert/);
  assert.doesNotMatch(h.field('limitsList').innerHTML, /Am Router gesperrt/);
});

test('day preview covers midnight and daytime exactly without gaps', () => {
  const h = harness('time-limits.js');
  for (const [from, until, duration] of [['21:00','07:00',600], ['14:00','16:00',120], ['00:00','07:00',420], ['23:59','00:00',1]]) {
    const segments = h.run(`scheduleSegments('${from}', '${until}')`);
    assert.equal(segments[0].start, 0);
    assert.equal(segments.at(-1).end, 1440);
    assert.equal(segments.reduce((sum, item) => sum + item.end - item.start, 0), 1440);
    assert.equal(segments.filter(item => item.blocked).reduce((sum, item) => sum + item.end - item.start, 0), duration);
    segments.slice(1).forEach((item, index) => assert.equal(item.start, segments[index].end));
  }
  assert.equal(h.run(`scheduleSegments('21:00','07:00',true).some(item=>item.blocked)`), false);
  assert.equal(h.run(`scheduleSegments('07:00','07:00').length`), 0);
});

test('invalid schedule preview never displays a stale timeline', () => {
  const h = harness('time-limits.js');
  h.field('deviceSelect').value = '1';
  h.field('blockedFrom').value = '14:00';
  h.field('blockedUntil').value = '14:00';
  h.run(`state.devices=[{id:1,hostname:'Tablet'}];updateSchedulePreview()`);
  assert.match(h.field('schedulePreview').innerHTML, /unterschiedliche Uhrzeiten/);
  assert.equal(h.field('scheduleTimeline').hidden, true);
  h.run('state.devices=[];updateSchedulePreview()');
  assert.match(h.field('schedulePreview').innerHTML, /Kein Gerät ausgewählt/);
});

test('schedule shortcuts only edit the form and cannot mutate demo data', () => {
  const h = harness('time-limits.js');
  h.run(`state.devices=[{id:1}];state.storageMode='demo';applySchedulePreset('homework')`);
  assert.equal(h.field('blockedFrom').value, '');
  h.run(`state.storageMode='backend';applySchedulePreset('homework')`);
  assert.equal(h.field('blockedFrom').value, '14:00');
  assert.equal(h.field('blockedUntil').value, '16:00');
  assert.equal(h.calls.length, 0);
});

test('disabled browser storage cannot turn a saved backend rule into an error', () => {
  const h = harness('time-limits.js');
  h.run(`localStorage.setItem=()=>{throw new Error('disabled')};saveLimits()`);
});

test('live priority writes only its own endpoint while other protection stays in the draft', async () => {
  const h = securityHarness();
  h.run(`Object.assign(state, {loaded:true, preview:true, dataMode:'live', rulesKnown:false,
    routerControl:{connection:'online', capabilities:{devicePriority:true},priority:{1:{mode:'normal',applied:true}}}});
    localDraft={request(){throw new Error('unexpected draft write')}};
    renderRouterControlStatus=()=>{};`);
  h.field('priorityDevice').value='1'; h.field('priorityMode').value='high';
  await h.run('savePriority({preventDefault(){}})');
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].url,'http://test/api/router-control/priority/devices/1');
  assert.deepEqual(h.calls[0].body,{mode:'high'});
  assert.equal(h.run('state.presets[0].priorityMode'),false);
  assert.equal(h.run('state.assignments[0].presetId'),7);
  assert.equal(h.run('state.routerControl.priority[1].applied'),false);
  await assert.rejects(h.run(`apiJson(SECURITY_API + '/presets', {method:'POST'}, true)`), /Live-Priorisierung/);
  await assert.rejects(h.run(`apiJson(SECURITY_API + '/presets', {method:'POST'})`), /unexpected draft/);
});

test('live priority confirmation works without revealing or applying local draft presets', () => {
  const h=securityHarness();
  h.run(`Object.assign(state,{preview:true,dataMode:'live',rulesKnown:false,
    routerControl:{connection:'online',capabilities:{devicePriority:true},priority:{1:{mode:'high',applied:true}}}});renderPriorityList()`);
  assert.match(h.field('priorityList').innerHTML,/Tablet · Bevorzugt.*Am Router bestätigt/);
  h.run("state.routerControl.connection='offline';renderPriorityList()");
  assert.doesNotMatch(h.field('priorityList').innerHTML,/Am Router bestätigt/);
});

test('priority on an older backend still reports a local draft', () => {
  const h = securityHarness();
  h.run(`state.preview=true;setStatus('Gerätepriorität gespeichert.', 'success')`);
  // The generic draft guard is not bypassed merely by the message wording.
  h.run(`let statusText='';document.getElementById('statusBox').setAttribute=(name,value)=>{if(name==='text')statusText=value};setStatus('Gerätepriorität gespeichert.', 'success')`);
  assert.match(h.run('statusText'),/lokalen Entwurf/);
});
