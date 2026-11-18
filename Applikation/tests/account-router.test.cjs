const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Minimal DOM: account.js only needs elements by id, a few properties and event listeners
function element(id) {
  const listeners = {};
  const el = {
    id, textContent: '', value: '', hidden: false, disabled: false, className: '', type: 'text', dataset: {},
    addEventListener: (type, fn) => { listeners[type] = fn; },
    querySelector: () => el.button || null,
    fire: (type, event = {}) => listeners[type]({ preventDefault() {}, currentTarget: el, ...event })
  };
  return el;
}

function accountHarness(responses) {
  const calls = [];
  const ids = ['accountRouterInfo', 'accountRouterForm', 'accountPairingCode', 'accountStatus'];
  const elements = Object.fromEntries(ids.map(id => [id, element(id)]));
  elements.accountRouterForm.button = element('submit');

  class Keycloak {
    constructor() { this.authenticated = true; this.token = 'test-token'; this.tokenParsed = { preferred_username: 'demo' }; }
    async init() { return true; }
    async updateToken() { return true; }
  }

  const window = { NETHERA_CONFIG: { API_BASE_URL: 'http://backend' }, Keycloak, location: { origin: '', pathname: '' } };
  const context = vm.createContext({
    window, Keycloak, sessionStorage: { removeItem() {} },
    document: {
      getElementById: id => elements[id] || null,
      createElement: () => ({}),
      head: { insertBefore() {} },
      querySelectorAll: () => []
    },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      const key = `${options.method || 'GET'} ${url.replace('http://backend', '')}`;
      const response = responses[key];
      if (!response) return { ok: true, status: 200, json: async () => [] };
      return { ok: response.status < 300, status: response.status, json: async () => response.body };
    },
    console
  });
  vm.runInContext(readFileSync(path.join(__dirname, '..', 'account.js'), 'utf8'), context);
  return { calls, elements, account: window.NetheraAccount };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test('without a router the claim form is shown', async () => {
  const h = accountHarness({ 'GET /api/routers/list': { status: 200, body: [] } });
  await h.account.render({ innerHTML: '' });
  assert.equal(h.elements.accountRouterForm.hidden, false);
  assert.match(h.elements.accountRouterInfo.textContent, /Noch kein Router verbunden/);
});

test('with a router the name is shown and the form hidden', async () => {
  const h = accountHarness({ 'GET /api/routers/list': { status: 200, body: [{ id: 1, name: 'Wohnzimmer' }] } });
  await h.account.render({ innerHTML: '' });
  assert.equal(h.elements.accountRouterForm.hidden, true);
  assert.match(h.elements.accountRouterInfo.textContent, /Wohnzimmer/);
});

test('successful claim posts the code with auth and shows the router', async () => {
  const h = accountHarness({
    'GET /api/routers/list': { status: 200, body: [] },
    'POST /api/routers/claim': { status: 200, body: { id: 1, name: 'Nethera Router' } }
  });
  await h.account.render({ innerHTML: '' });
  h.elements.accountPairingCode.value = '  nethera-demo ';
  await h.elements.accountRouterForm.fire('submit');
  await flush();

  const claim = h.calls.find(call => call.url.endsWith('/api/routers/claim'));
  assert.equal(claim.options.method, 'POST');
  assert.equal(claim.options.headers.Authorization, 'Bearer test-token');
  assert.deepEqual(JSON.parse(claim.options.body), { pairingCode: 'nethera-demo' });
  assert.equal(h.elements.accountRouterForm.hidden, true);
  assert.match(h.elements.accountRouterInfo.textContent, /Nethera Router/);
  assert.match(h.elements.accountStatus.className, /success/);
});

for (const [status, text] of [[404, /unbekannt/], [409, /bereits verbunden/]]) {
  test(`claim error ${status} keeps the form and shows a German message`, async () => {
    const h = accountHarness({
      'GET /api/routers/list': { status: 200, body: [] },
      'POST /api/routers/claim': { status, body: {} }
    });
    await h.account.render({ innerHTML: '' });
    h.elements.accountPairingCode.value = 'WRONG';
    await h.elements.accountRouterForm.fire('submit');
    await flush();

    assert.equal(h.elements.accountRouterForm.hidden, false);
    assert.match(h.elements.accountStatus.textContent, text);
    assert.match(h.elements.accountStatus.className, /error/);
    assert.equal(h.elements.accountRouterForm.button.disabled, false);
  });
}
