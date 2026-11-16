const { test } = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../security-draft.js');
const base = () => ({ dataMode: 'live', rulesKnown: false, devices: [{ id: 20 }, { id: 21 }],
  groups: [], members: [], presets: [], assignments: [], timeLimits: [],
  blocklists: [{ id: 5, routerId: 1, name: 'Network', sourceType: 'NETWORK', urlPattern: 'blocked.example.org', confirmationSource: 'ROUTER_ACK' }] });
function storage() {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
}
const post = (draft, source, kind, body) => draft.request(source, `/api/security/${kind}`, { method: 'POST', body: JSON.stringify(body) });

test('local groups can be created and assigned without router readback or baseline mutation', () => {
  const source = base(), before = JSON.stringify(source), draft = create(storage(), 'live');
  const group = post(draft, source, 'groups', { name: 'Arbeit', blocklistId: 5 });
  draft.assignGroup(source, 20, group.id);
  const snapshot = draft.snapshot(source);
  assert.equal(snapshot.groups[0].name, 'Arbeit');
  assert.deepEqual(snapshot.members, [{ deviceId: 20, groupId: group.id, localDraft: true }]);
  assert.equal(snapshot.rulesKnown, false);
  assert.equal(JSON.stringify(source), before);
  assert.ok(group.id < -99999);
});

test('moving, clearing and renaming groups persists after page reload', () => {
  const store = storage(), source = base(), draft = create(store, 'live');
  const a = post(draft, source, 'groups', { name: 'A' });
  const b = post(draft, source, 'groups', { name: 'B' });
  draft.assignGroup(source, 20, a.id);
  draft.assignGroup(source, 20, b.id);
  post(draft, source, 'groups', { ...b, name: 'Schule' });
  const reloaded = create(store, 'live');
  assert.equal(reloaded.snapshot(source).members.length, 1);
  assert.equal(reloaded.snapshot(source).groups[1].name, 'Schule');
  reloaded.assignGroup(source, 20, null);
  assert.equal(reloaded.snapshot(source).members.length, 0);
});

test('edited active lists never retain router confirmation or data-source metadata', () => {
  const source = base(), draft = create(storage(), 'live');
  post(draft, source, 'blocklists', { ...source.blocklists[0], dataSource: 'ROUTER', urlPattern: 'draft.example.org' });
  const list = draft.snapshot(source).blocklists[0];
  assert.equal(list.localDraft, true);
  assert.equal(list.confirmationSource, undefined);
  assert.equal(list.dataSource, undefined);
  assert.equal(source.blocklists[0].urlPattern, 'blocked.example.org');
  assert.equal(source.blocklists[0].confirmationSource, 'ROUTER_ACK');
});

test('fresh router lists merge with local edits without converting drafts to live data', () => {
  const source = base(), draft = create(storage(), 'live');
  post(draft, source, 'blocklists', { name: 'Draft', sourceType: 'DNS', urlPattern: 'ads.example.org' });
  source.blocklists.push({ id: 6, name: 'New ACK', sourceType: 'NETWORK', urlPattern: 'new.example.org', confirmationSource: 'ROUTER_ACK' });
  const rows = draft.snapshot(source).blocklists;
  assert.equal(rows.length, 3);
  assert.equal(rows.filter(row => row.localDraft).length, 1);
  source.blocklists = [];
  assert.equal(draft.snapshot(source).blocklists.length, 1);
});

test('local presets, schedules and device priorities are editable', () => {
  const source = base(), draft = create(storage(), 'live');
  const preset = post(draft, source, 'presets', { name: 'Abend', priorityMode: true, blockedFrom: '22:00', blockedUntil: '06:00', timeLimitMinutes: 120 });
  draft.request(source, `/api/security/devices/20/preset/${preset.id}`, { method: 'PUT' });
  draft.request(source, '/api/device-time-limits/20', { method: 'PUT', body: JSON.stringify({ blockedFrom: '22:00', blockedUntil: '06:00', dailyLimitMinutes: 120, status: 'active' }) });
  const result = draft.snapshot(source);
  assert.equal(result.assignments[0].presetId, preset.id);
  assert.equal(result.presets[0].priorityMode, true);
  assert.equal(result.timeLimits[0].dailyLimitMinutes, 120);
  draft.request(source, '/api/security/devices/20/preset', { method: 'DELETE' });
  assert.equal(draft.snapshot(source).assignments.length, 0);
});

test('bad targets and invalid schedules fail before changing local storage', () => {
  const source = base(), draft = create(storage(), 'live');
  assert.throws(() => draft.assignGroup(source, 20, 999));
  assert.throws(() => post(draft, source, 'groups', { id: 9, name: 'Missing' }));
  assert.throws(() => post(draft, source, 'groups', { name: ' ' }));
  for (const fields of [{ blockedFrom: '22:00', blockedUntil: '22:00', timeLimitMinutes: 120 },
    { blockedFrom: '25:00', blockedUntil: '06:00', timeLimitMinutes: 120 },
    { blockedFrom: '22:00', blockedUntil: '06:00', timeLimitMinutes: -1 }]) {
    assert.throws(() => post(draft, source, 'presets', { name: 'Bad', ...fields }));
  }
  assert.equal(draft.dirty, false);
});

test('account, router and demo scopes stay separate; reset removes only the selected draft', () => {
  const store = storage(), source = base();
  const live = create(store, 'userA:router1:live'), demo = create(store, 'userA:router1:demo');
  post(live, source, 'groups', { name: 'Private live draft' });
  post(demo, source, 'groups', { name: 'Demo draft' });
  assert.equal(create(store, 'userB:router1:live').snapshot(source).groups.length, 0);
  assert.equal(create(store, 'userA:router2:live').snapshot(source).groups.length, 0);
  live.reset();
  assert.equal(live.dirty, false);
  assert.equal(create(store, 'userA:router1:demo').snapshot(source).groups[0].name, 'Demo draft');
});

test('lost devices cannot retain visible assignments on a refreshed device inventory', () => {
  const source = base(), draft = create(storage(), 'live');
  const group = post(draft, source, 'groups', { name: 'A' });
  draft.assignGroup(source, 20, group.id);
  assert.equal(draft.snapshot({ ...source, devices: [] }).members.length, 0);
});

test('adblock requests are local wishes and do not change actual readback', () => {
  const source = { ...base(), routerControl: { adblock: { installed: false, enabled: false } } };
  const draft = create(storage(), 'live');
  draft.setAdblock(true, true);
  assert.deepEqual(draft.adblock, { enabled: true, installRequested: true });
  assert.equal(draft.snapshot(source).routerControl.adblock.enabled, false);
  draft.setAdblock(false);
  assert.equal(draft.adblock.enabled, false);
});

test('storage errors and unsupported actions cannot silently succeed or call a backend', () => {
  const store = storage(), source = base(), draft = create(store, 'live');
  store.setItem = () => { throw new Error('quota'); };
  assert.throws(() => post(draft, source, 'groups', { name: 'A' }), /quota/);
  assert.equal(draft.dirty, false);
  assert.equal(draft.snapshot(source).groups.length, 0);
  assert.throws(() => draft.request(source, '/api/router-control/adblock/install', { method: 'POST' }), /lokalen Vorschau/);
});
