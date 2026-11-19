// Isolated authentication and API fixtures; no request can change a real router.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.NETHERA_TEST_URL || 'http://localhost:5500';

(async () => {
  const browser = await chromium.launch({ channel: process.env.NETHERA_BROWSER || 'chrome', headless: true });
  try {
    for (const username of ['demo', 'regular-user']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      let offline = false;
      const writes = [], errors = [];
      const devices = [
        { id: 20, hostname: 'Router-Laptop', ipAddress: '192.0.2.20', connectionType: 'wifi', isOnline: true },
        { id: 21, hostname: 'Router-TV', ipAddress: '192.0.2.21', connectionType: 'lan', isOnline: false }
      ];
      await context.route('**/vendor/keycloak.min.js', route => route.fulfill({ contentType: 'text/javascript', body: `
        window.Keycloak = class {
          constructor() { this.authenticated = true; this.token = 'test-only'; this.tokenParsed = {sub:'test-${username}',preferred_username:'${username}'}; }
          async init() { return true; } async updateToken() { return true; }
          logout() { window.testLogout = true; }
        };` }));
      await context.route('**/api/**', route => {
        if (route.request().method() !== 'GET') {
          writes.push(route.request().url());
          return route.fulfill({ status: 405, json: {} });
        }
        const url = route.request().url();
        if (url.includes('/routers/list')) return route.fulfill({ json: [{ id: 1, name: 'Real router', dataMode: offline ? 'demo' : 'live', connection: offline ? 'offline' : 'online', devices }] });
        if (url.includes('/security/state')) return route.fulfill({ json: { groups: [], members: [], presets: [], assignments: [], blocklists: [], timeLimits: [] } });
        if (url.includes('/router-control/status')) return route.fulfill({ status: 404, json: {} });
        if (url.includes('/accounts/me')) return route.fulfill({ json: { username } });
        return route.fulfill({ json: [] });
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      const frame = () => page.frames().find(item => /\/overview\.html|\/topologie_custom\.html/.test(item.url()));
      async function expectMode(mode) {
        await page.waitForFunction(expected => document.querySelector('#screen-frame').contentDocument?.querySelector('#dataSourceNotice')?.dataset.mode === expected, mode);
      }
      await page.goto(`${base}/index.html?entry=website`);
      await expectMode('live');
      assert.equal(await page.evaluate(() => window.NETHERA_DEMO_PREVIEW), false);
      assert.match(await frame().locator('body').innerText(), /Router-Laptop/);

      if (username === 'demo') {
        await page.locator('#demo-preview-toggle').click();
        await expectMode('demo');
        assert.equal(await frame().locator('#dataSourceNotice').isVisible(), false);
        assert.equal(await page.locator('#demo-mode-indicator').isVisible(), true);
        for (const file of ['overview', 'devices', 'network-status', 'security', 'time-limits', 'traffic', 'configuration', 'topologie_custom']) {
          await page.locator(`[data-src="${file}.html"]`).click();
          await page.waitForFunction(name => document.querySelector('#screen-frame').contentDocument?.location.pathname.endsWith(`/${name}.html`), file);
          await expectMode('demo');
          const current = page.frames().find(item => item.url().includes(`/${file}.html`));
          assert.equal(await current.locator('#dataSourceNotice').isVisible(), false, file);
          assert.doesNotMatch(await current.locator('body').innerText(), /Temporäre Demo|Nur Ansicht|nur Ansicht|Beispiel-Zeitpläne|Alle Regeln sind Beispiele|Keine echte Sperrwirkung/, file);
          assert.equal(await page.locator('#demo-mode-indicator').isVisible(), true, file);
        }
        await page.reload(); await expectMode('demo');
        await page.locator('#demo-preview-toggle').click(); await expectMode('live');
        await page.reload(); await expectMode('live');
        await page.goto(`${base}/index.html?entry=website&demo=1`); await expectMode('demo');
        await page.locator('[data-src="account.html"]').click();
        await page.locator('#netheraLogoutButton').click();
        assert.equal(await page.evaluate(() => sessionStorage.getItem('nethera-demo-preview')), null);
        await page.goto(`${base}/index.html?entry=website`); await expectMode('live');
      } else {
        assert.equal(await page.locator('#demo-preview-toggle').isVisible(), false);
        await page.goto(`${base}/index.html?entry=website&demo=1`); await expectMode('live');
      }

      await page.locator('[data-src="topologie_custom.html"]').click();
      await page.waitForFunction(() => document.querySelector('#screen-frame').contentDocument?.querySelector('#device-picker')?.options.length === 3);
      const topology = frame();
      await topology.evaluate(() => {
        const key = NetheraSecurityDraft.keyFor(NETHERA_CONFIG.API_BASE_URL, parent.NetheraAccount.keycloak.tokenParsed.sub, { id: 1, dataMode: 'live' });
        const draft = NetheraSecurityDraft.create(sessionStorage, key);
        const data = { devices: [{ id: 20 }, { id: 21 }], groups: [], presets: [], members: [], assignments: [], blocklists: [], timeLimits: [] };
        const group = draft.request(data, '/api/security/groups', { method: 'POST', body: JSON.stringify({ name: 'Local family' }) });
        draft.assignGroup(data, 20, group.id);
        const preset = draft.request(data, '/api/security/presets', { method: 'POST', body: JSON.stringify({ name: 'Priority draft', priorityMode: true }) });
        draft.request(data, `/api/security/devices/20/preset/${preset.id}`, { method: 'PUT' });
      });
      await topology.locator('#reload-network').click();
      await topology.waitForFunction(() => document.querySelector('#group-legend').textContent.includes('Local family'));
      await topology.locator('#device-picker').selectOption('device-20');
      assert.match(await topology.locator('#device-details').innerText(), /Priority draft/);
      assert.match(await topology.locator('#device-details').innerText(), /192\.0\.2\.20/);
      assert.match(await topology.locator('#device-details').innerText(), /Online/);
      await topology.locator('#online-filter').click();
      assert.equal(await topology.locator('#device-picker option').count(), 2);
      await topology.locator('#online-filter').click();
      await topology.locator('#device-picker').selectOption('device-21');
      assert.match(await topology.locator('#device-details').innerText(), /Offline/);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await topology.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      }
      offline = true; await topology.locator('#reload-network').click();
      await topology.waitForFunction(() => document.querySelector('#device-picker').options.length === 9);
      assert.equal(await page.locator('#demo-mode-indicator').isVisible(), true);
      assert.doesNotMatch(await topology.locator('#group-legend').innerText(), /Local family/);
      offline = false; await topology.locator('#reload-network').click();
      await topology.waitForFunction(() => document.querySelector('#group-legend').textContent.includes('Local family'));
      assert.equal(await page.locator('#demo-mode-indicator').isVisible(), false);
      assert.deepEqual(writes, []); assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('Presentation regressions passed: opt-in demo, normal accounts, live/offline separation, draft groups/presets, router connection status, mobile legend and no API writes.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
