const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function apiHarness(response) {
  const calls = [];
  const context = vm.createContext({
    window: {
      NETHERA_CONFIG: { API_BASE_URL: 'http://backend', ROUTERS_PATH: '/api/routers/list' },
      parent: { NetheraAccount: { getAuthHeader: async () => ({ Authorization: 'Bearer test-token' }) } }
    },
    fetch: async (url, options) => {
      calls.push({ url, options });
      return response;
    }
  });
  vm.runInContext(readFileSync(path.join(__dirname, '..', 'api.js'), 'utf8'), context);
  return { calls, run: source => vm.runInContext(source, context) };
}

test('missing router-control API remains unsupported, not successful', async () => {
  const h = apiHarness({ status: 404, ok: false });
  assert.equal(await h.run('NetheraApi.getRouterControlStatus()'), null);
  assert.equal(h.calls[0].url, 'http://backend/api/router-control/status');
  assert.equal(h.calls[0].options.headers.Authorization, 'Bearer test-token');
});

test('invalid router-control response is rejected', async () => {
  const h = apiHarness({ status: 200, ok: true, json: async () => [] });
  await assert.rejects(h.run('NetheraApi.getRouterControlStatus()'), /ungültig/);
});

test('adblock install uses an authenticated POST and returns only the backend response', async () => {
  const h = apiHarness({ status: 202, ok: true, json: async () => ({ accepted: true }) });
  const result = await h.run('NetheraApi.installAdblock()');
  assert.equal(result.accepted, true);
  assert.equal(h.calls[0].url, 'http://backend/api/router-control/adblock/install');
  assert.equal(h.calls[0].options.method, 'POST');
  assert.equal(h.calls[0].options.headers.Authorization, 'Bearer test-token');
});
