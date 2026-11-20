// All APIs are intercepted. Edits exercise tab-local drafts, never a real router.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.NETHERA_TEST_URL || 'http://127.0.0.1:5500';
const screenshots = process.env.NETHERA_SCREENSHOTS;

(async () => {
  const browser = await chromium.launch({ channel: process.env.NETHERA_BROWSER || 'chrome', headless: true });
  let checks = 0;
  try {
    const context = await browser.newContext();
    let mode = 'demo';
    const writes = [], errors = [];
    await context.route('**/api/**', route => {
      if (route.request().method() !== 'GET') {
        writes.push(route.request().url());
        return route.fulfill({ status: 405, json: {} });
      }
      if (mode === 'error') return route.fulfill({ status: 500, json: {} });
      const url = route.request().url();
      if (url.includes('/routers/list')) return route.fulfill({ json: [{
        id: 1, name: 'Testnetz', dataMode: mode, connection: mode === 'demo' ? 'offline' : mode === 'live' ? 'online' : 'unknown', devices: []
      }] });
      if (url.includes('/router-control/status')) return route.fulfill({ status: 404, json: {} });
      if (url.includes('/security/state')) return route.fulfill({ json: { groups: [], presets: [], blocklists: [], devices: [] } });
      return route.fulfill({ json: [] });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    async function visit(file) {
      await page.goto(`${base}/${file}.html`);
      await page.locator('#dataSourceNotice').waitFor();
    }
    async function layout(name) {
      const overflow = await page.evaluate(() => {
        const visible = element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
        return [...document.querySelectorAll('button, input:not([type="hidden"]), .badge, .protocol-pill')]
          .filter(visible).filter(element => {
            const bounds = element.getBoundingClientRect();
            return bounds.left < -1 || bounds.right > innerWidth + 1 || element.scrollWidth > element.clientWidth + 2;
          }).map(element => element.id || element.textContent.trim());
      });
      assert.deepEqual(overflow, [], `${name}: clipped controls`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name);
      if (screenshots) {
        fs.mkdirSync(screenshots, { recursive: true });
        await page.screenshot({ path: path.join(screenshots, `${name}.png`), fullPage: true });
        if (name === 'security-groups-1440') await page.screenshot({ path: path.join(screenshots, 'preview.png') });
      }
      checks++;
    }
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 960 });
      await visit('security');
      await page.locator('#groupDeviceList .device-group-item').first().waitFor();
      for (const tab of await page.locator('[data-tab]').all()) {
        const name = await tab.getAttribute('data-tab');
        await tab.click();
        assert.equal(await tab.getAttribute('aria-selected'), 'true');
        assert.equal(await page.locator(`#tab-${name}`).isVisible(), true);
        await layout(`security-${name}-${width}`);
      }
      await page.locator('[data-tab="groups"]').click();
      await page.locator('[data-group-view="management"]').click();
      await layout(`security-management-${width}`);
      await visit('traffic');
      await page.locator('#traffic-table-body [data-label="Client"]').first().waitFor();
      if (width <= 390) assert.equal(await page.locator('.table-wrapper').evaluate(e => e.scrollWidth > e.clientWidth), false);
      assert.match(await page.locator('.traffic-legend').innerText(), /Download[\s\S]*Upload/);
      await layout(`traffic-${width}`);
    }
    await page.setViewportSize({ width: 1440, height: 960 });
    await visit('security');
    const firstRow = () => page.locator('#groupDeviceList .device-group-item').first();
    const badges = page.locator('#groupDeviceList .badge').filter({ hasText: 'Lokaler Entwurf' });
    await firstRow().waitFor();
    assert.equal(await badges.count(), 0);
    const group = await firstRow().locator('[data-device-group]').inputValue();
    await firstRow().locator('[data-device-group]').selectOption('', { force: true });
    await badges.first().waitFor();
    assert.equal(await badges.count(), 1);
    assert.match(await page.locator('#statusBox').innerText(), /lokalen Entwurf|lokal/i);
    assert.match(await page.locator('#draftNotice').innerText(), /Keine Übertragung/);
    await page.reload();
    await badges.first().waitFor();
    assert.equal(await firstRow().locator('[data-device-group]').inputValue(), '');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#discardDraft').click();
    await page.waitForFunction(() => document.querySelector('#discardDraft').disabled);
    assert.equal(await badges.count(), 0);
    assert.equal(await firstRow().locator('[data-device-group]').inputValue(), group);
    checks++;
    await page.locator('[data-tab="groups"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-tab="blocklists"]').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('End');
    assert.equal(await page.locator('[data-tab="wifi"]').getAttribute('aria-selected'), 'true');
    checks++;

    for (mode of ['unavailable', 'live', 'demo', 'error']) {
      await visit('network-status');
      await page.waitForFunction(() => !document.querySelector('#routerState').getAttribute('value').includes('Prüfe'));
      assert.equal(await page.locator('#deviceCount').getAttribute('value'), mode === 'demo' ? '5' : mode === 'live' ? '0' : '—');
      if (mode === 'unavailable') {
        assert.equal(await page.locator('#routerState').getAttribute('tone'), '');
        assert.equal(await page.locator('#statusBox').getAttribute('state'), 'info');
      }
      if (mode === 'error') assert.equal(await page.locator('#statusBox').getAttribute('state'), 'error');
      await layout(`status-${mode}`);
    }
    await context.route('**/vendor/keycloak.min.js', route => route.fulfill({ contentType: 'text/javascript', body: `
      window.Keycloak = class {
        constructor() { this.authenticated = true; this.token = 'test-only'; this.tokenParsed = {sub:'test-demo',preferred_username:'demo',email:'demo@example.invalid'}; }
        async init() { return true; } async updateToken() { return true; }
      };` }));
    mode = 'demo';
    await page.goto(`${base}/index.html?entry=website`);
    await page.locator('#home').waitFor();
    await page.locator('[data-src="account.html"]').click();
    await page.locator('#netheraLogoutButton').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-src="account.html"]').classList.contains('active'));
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 960 });
      for (const view of ['account', 'navigation-toggled']) {
        if (view === 'navigation-toggled') await page.locator('#nav-toggle').click();
        const expectedWidth = width <= 900 ? width : view === 'account' ? 248 : 72;
        await page.waitForFunction(expected => Math.abs(document.querySelector('#nav-bar').getBoundingClientRect().width - expected) < 1, expectedWidth);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        if (screenshots) await page.screenshot({ path: path.join(screenshots, `${view}-${width}.png`), fullPage: true });
        checks++;
      }
    }
    assert.deepEqual(writes, []);
    assert.deepEqual(errors, []);
    console.log(`Passed ${checks} polish scenarios: layouts, tabs, keyboard, draft edits/reload/discard and status states. No backend writes.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
