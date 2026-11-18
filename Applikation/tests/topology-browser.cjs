const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.NETHERA_TEST_URL || 'http://localhost:5500';
(async () => {
  const browser = await chromium.launch({channel:process.env.NETHERA_BROWSER || 'chrome',headless:true});
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1000}});
    let unavailable = false;
    await context.route('**/api/**', route => route.fulfill(unavailable
      ? {status:500,json:{}}
      : {json:[{id:1,dataMode:'demo',connection:'offline'}]}));
    await context.route('**/test-topology-host', route => route.fulfill({contentType:'text/html',body:'<html><body style="margin:0"><iframe title="Topologie" src="/topologie_custom.html" allow="fullscreen" allowfullscreen style="width:100%;height:700px;border:0"></iframe></body></html>'}));
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(5000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/test-topology-host`);
    const frame = page.frames().find(frame => frame.url().includes('topologie_custom')) || await page.locator('iframe').elementHandle().then(element => element.contentFrame());
    await frame.waitForFunction(() => document.querySelector('#device-picker').options.length === 9);
    await frame.locator('#device-picker').selectOption('device--1');
    await frame.locator('#fullscreen-network').click();
    await frame.waitForFunction(() => document.fullscreenElement?.classList.contains('topology-workspace'));
    assert.equal(await frame.locator('.network-inspector').isVisible(), true);
    assert.match(await frame.locator('#device-details').innerText(), /Demo-Laptop/);
    await frame.waitForFunction(() => document.querySelector('#fullscreen-network').getAttribute('aria-pressed') === 'true');
    await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    // Tap an actual canvas node, rather than only changing the accessible picker.
    const point = await frame.evaluate(() => {
      const element = document.querySelector('#network-graph');
      const node = element._cyreg.cy.getElementById('device--2');
      return node.renderedPosition();
    });
    await frame.locator('#network-graph').click({position:point});
    assert.match(await frame.locator('#device-details').innerText(), /Demo-Smartphone/);
    await page.screenshot({path:'/tmp/nethera-topology-fullscreen.png'});
    await frame.locator('[data-view="connections"]').click();
    assert.match(await frame.locator('#device-details').innerText(), /Demo-Smartphone/);
    await frame.locator('#zoom-in').click(); await frame.locator('#zoom-out').click();
    await frame.locator('#reset-network').click();
    assert.equal(await frame.evaluate(() => Boolean(document.fullscreenElement)), true);
    await frame.locator('#fullscreen-network').click();
    await frame.waitForFunction(() => !document.fullscreenElement);
    assert.match(await frame.locator('#device-details').innerText(), /Demo-Smartphone/);
    await frame.locator('#fullscreen-network').click();
    await frame.waitForFunction(() => Boolean(document.fullscreenElement));
    // Simulate an external browser exit (the same fullscreenchange as Escape).
    await frame.evaluate(() => document.exitFullscreen());
    await frame.waitForFunction(() => !document.fullscreenElement);
    await frame.waitForFunction(() => document.querySelector('#fullscreen-network').getAttribute('aria-pressed') === 'false');
    // Denied browser permission produces feedback and leaves a usable button.
    await frame.evaluate(() => { document.querySelector('.topology-workspace').requestFullscreen = () => Promise.reject(new Error('denied')); });
    await frame.locator('#fullscreen-network').dispatchEvent('click');
    await frame.waitForFunction(() => document.querySelector('#network-notice').textContent.includes('Vollbild konnte nicht'), null, {timeout:5000});
    assert.equal(await frame.locator('#fullscreen-network').isEnabled(), true);
    unavailable = true;
    await frame.locator('#reload-network').click();
    await frame.waitForFunction(() => document.querySelector('#network-summary').textContent === 'Keine Netzwerkdaten');
    assert.equal(await frame.locator('#device-details').innerText(), '');
    unavailable = false;
    await frame.locator('#reload-network').click();
    await frame.waitForFunction(() => document.querySelector('#device-picker').options.length === 9);
    await frame.evaluate(() => { delete document.querySelector('.topology-workspace').requestFullscreen; });
    for (const width of [390,768,1440]) {
      await page.setViewportSize({width,height:900});
      assert.equal(await frame.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await frame.locator('#fullscreen-network').click();
      await frame.waitForFunction(() => Boolean(document.fullscreenElement));
      await frame.locator('.network-inspector').scrollIntoViewIfNeeded();
      await frame.locator('#device-picker').selectOption('device--4');
      assert.match(await frame.locator('#device-details').innerText(), /Demo-Tablet/);
      await frame.locator('#fullscreen-network').click();
      await frame.waitForFunction(() => !document.fullscreenElement);
    }
    assert.deepEqual(errors, []);
    console.log('Topology passed: iframe fullscreen with inspector, canvas selection, mode switch, zoom/reset, exit, permission failure, reload failure/recovery and three viewport sizes.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
