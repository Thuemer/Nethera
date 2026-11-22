// Isolated browser contract test: every API call is intercepted, never a real router.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.NETHERA_TEST_URL || 'http://127.0.0.1:5531';

(async () => {
  const browser = await chromium.launch({ channel: process.env.NETHERA_BROWSER || undefined,
    executablePath: process.env.NETHERA_BROWSER_PATH || undefined, headless: true });
  try {
    const context = await browser.newContext({ locale: 'de-AT', timezoneId: 'America/New_York' });
    const page = await context.newPage();
    const errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    const device = { id: 27, hostname: 'Test-Smartphone', ipAddress: '192.0.2.27', macAddress: '02:27:00:00:00:01', connectionType: 'wifi' };
    let limit = { id: 27, deviceId: 27, blockedFrom: '21:00', blockedUntil: '07:00', dailyLimitMinutes: 60, usedMinutesToday: null, status: 'active', routerEnforcement: false };
    let control = { routerId: 1, connection: 'online', capabilities: { timeControl: true }, timeLimits: {} };
    await context.route('**/api/**', route => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname === '/api/routers/list') return route.fulfill({ json: [{ id: 1, name: 'Testnetz', dataMode: 'live', connection: 'online', devices: [device] }] });
      if (url.pathname === '/api/security/state') return route.fulfill({ json: { devices: [device], groups: [], presets: [], assignments: [], blocklists: [], timeLimits: limit ? [limit] : [] } });
      if (url.pathname === '/api/router-control/status') return route.fulfill({ json: control });
      if (url.pathname === '/api/device-time-limits' && request.method() === 'GET') return route.fulfill({ json: limit ? [limit] : [] });
      if (url.pathname === '/api/device-time-limits/27' && ['PUT', 'DELETE'].includes(request.method())) {
        writes.push({ method: request.method(), body: request.postDataJSON() });
        control = { ...control, timeApplied: false, timeLimits: {} };
        if (request.method() === 'DELETE') { limit = null; return route.fulfill({ status: 204 }); }
        assert.equal(request.postDataJSON().usedMinutesToday, undefined);
        limit = { ...request.postDataJSON(), id: 27, routerEnforcement: true, usedMinutesToday: null };
        return route.fulfill({ json: limit });
      }
      throw new Error(`Unexpected API call: ${request.method()} ${url.pathname}`);
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/time-limits.html`);
    await page.waitForFunction(() => !document.getElementById('saveLimitButton').disabled);
    assert.match(await page.locator('#schedulePreview').innerText(), /Zeitzone: Wien/);
    assert.match(await page.locator('#limitsList').innerText(), /Noch nicht am Router aktiviert/);
    await page.locator('#blockedFrom').fill('22:00');
    await page.locator('#saveLimitButton').click();
    await page.waitForFunction(() => document.getElementById('routerControlStatus').textContent.includes('ausstehend'));
    assert.equal(limit.blockedFrom, '22:00');
    control = { ...control, timeApplied: true, timeLimits: { 27: { applied: true, blockedNow: true, reason: 'window', usedMinutesToday: 12, budgetMinutesToday: 60, clockSynced: true } } };
    await page.locator('#refreshRouterControl').click();
    await page.getByText('Am Router gesperrt', { exact: true }).waitFor();
    await page.locator('.limit-details summary').click();
    await page.locator('.limit-details summary').focus();
    await page.evaluate(() => loadRouterControlStatus());
    assert.equal(await page.locator('.limit-details').getAttribute('open'), '');
    assert.equal(await page.locator('.limit-details summary').evaluate(element => element === document.activeElement), true);
    assert.match(await page.locator('#limitsList').innerText(), /12 von 60/);
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 960 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `page overflow ${width}`);
      const clipped = await page.evaluate(() => [...document.querySelectorAll('button,input:not([type="hidden"]),.badge')]
        .filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')
        .filter(e => e.getBoundingClientRect().right > innerWidth + 1 || e.getBoundingClientRect().left < -1 || e.scrollWidth > e.clientWidth + 2)
        .map(e => e.id || e.textContent));
      assert.deepEqual(clipped, [], `clipped controls ${width}`);
      if (process.env.NETHERA_SCREENSHOTS) {
        fs.mkdirSync(process.env.NETHERA_SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: path.join(process.env.NETHERA_SCREENSHOTS, `time-control-${width}.png`), fullPage: true });
      }
    }
    await page.locator('[data-action="toggle"]').click();
    await page.waitForFunction(() => document.getElementById('routerControlStatus').textContent.includes('ausstehend'));
    assert.equal(limit.status, 'paused');
    control = { ...control, timeApplied: true, timeLimits: { 27: { applied: true } } };
    await page.locator('#refreshRouterControl').click();
    await page.getByText('Ausgeschaltet · am Router bestätigt', { exact: true }).waitFor();
    await page.locator('#clearLimitButton').click();
    await page.waitForFunction(() => document.getElementById('routerControlStatus').textContent.includes('ausstehend'));
    assert.equal(limit, null);
    control = { ...control, timeApplied: true };
    await page.locator('#refreshRouterControl').click();
    await page.waitForFunction(() => document.getElementById('routerControlStatus').textContent.includes('am Router bestätigt'));
    assert.deepEqual(writes.map(item => item.method), ['PUT', 'PUT', 'DELETE']);
    await page.locator('#blockedFrom').fill('');
    await page.locator('#blockedUntil').fill('');
    await page.locator('.advanced-settings summary').click();
    await page.locator('#dailyLimit').selectOption('60', { force: true });
    await page.locator('#saveLimitButton').click();
    await page.waitForFunction(() => document.getElementById('routerControlStatus').textContent.includes('ausstehend'));
    assert.equal(limit.dailyLimitMinutes, 60); assert.equal(limit.blockedFrom, '');
    await page.reload();
    await page.waitForFunction(() => !document.getElementById('saveLimitButton').disabled);
    assert.equal(await page.locator('#blockedFrom').inputValue(), '');
    assert.match(await page.locator('#schedulePreview').innerText(), /Tagesbudget ohne feste Sperrzeit/);
    assert.deepEqual(errors, []);
    console.log('PASS: save/readback, router usage, stable focus/details, pause/delete, 4 responsive viewports; API fully intercepted.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
