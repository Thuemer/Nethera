const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const base = (process.env.NETHERA_TEST_URL || 'http://localhost:5500').replace(/\/$/, '');
const shots = process.env.NETHERA_SCREENSHOTS || '/tmp/nethera-topology-layouts';

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.NETHERA_BROWSER || 'chrome', headless: true });
  try {
    for (const layout of ['klassisch', 'baum']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      let unavailable = false;
      const writes = [], errors = [];
      await context.addInitScript(value => localStorage.setItem('nethera.topology.layout', value), layout);
      await context.route('**/api/**', route => {
        if (route.request().method() !== 'GET') writes.push(route.request().url());
        return route.fulfill(unavailable ? { status: 500, json: {} } : { json: [{ id: 1, dataMode: 'demo', connection: 'offline' }] });
      });
      await context.route('**/test-topology-host', route => route.fulfill({ contentType: 'text/html',
        body: '<html><body style="margin:0"><iframe title="Topologie" src="' + base + '/topologie_custom.html" allow="fullscreen" allowfullscreen style="width:100%;height:900px;border:0"></iframe></body></html>' }));
      const page = await context.newPage();
      page.setDefaultTimeout(6000);
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/test-topology-host');
      const frame = await page.locator('iframe').elementHandle().then(element => element.contentFrame());
      await frame.waitForFunction(() => document.querySelector('#device-picker').options.length === 9);
      assert.equal(await frame.locator('#network-graph').getAttribute('data-layout'), layout);
      assert.equal(await frame.locator('.topology-router img').evaluate(image => image.complete && image.naturalWidth > 0), true);
      await frame.locator('#device-picker').selectOption('device--1');
      assert.match(await frame.locator('#device-details').innerText(), /Demo-Laptop/);
      await frame.locator('[data-device="device--2"]').first().click();
      assert.match(await frame.locator('#device-details').innerText(), /Demo-Smartphone/);
      await frame.locator('[data-device="device--4"]').first().focus();
      await page.keyboard.press('Enter');
      assert.match(await frame.locator('#device-details').innerText(), /Demo-Tablet/);
      const other = layout === 'baum' ? 'klassisch' : 'baum';
      await frame.locator('[data-layout="' + other + '"]').click();
      assert.equal(await frame.locator('[data-device="device--4"]').first().getAttribute('aria-pressed'), 'true');
      assert.equal(await frame.evaluate(() => localStorage.getItem('nethera.topology.layout')), other);
      await frame.locator('[data-layout="' + layout + '"]').click();
      await frame.locator('[data-view="connections"]').click();
      assert.match(await frame.locator('#device-details').innerText(), /Demo-Tablet/);
      assert.equal(await frame.locator('.topology-hub').count(), 2);
      await frame.locator('[data-view="groups"]').click();
      await frame.locator('#device-search').fill('Tablet');
      assert.equal(await frame.locator('#device-picker option').count(), 2);
      await frame.locator('#device-search').fill('does not exist');
      assert.match(await frame.locator('#graph-empty').innerText(), /Keine passenden/);
      await frame.locator('#device-search').fill('');
      const group = frame.locator('#group-legend [data-group]:not([data-group=""])').first();
      await group.click();
      await frame.locator('[data-layout="' + other + '"]').click();
      assert.equal(await group.getAttribute('aria-pressed'), 'true');
      await frame.locator('[data-layout="' + layout + '"]').click();
      await group.click();
      await frame.locator('#online-filter').click();
      assert.equal(await frame.locator('.topology-device.offline').count(), 0);
      await frame.locator('#online-filter').click();
      if (layout === 'klassisch') {
        const node = frame.locator('[data-device="device--1"]'), start = await node.boundingBox();
        await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
        await page.mouse.down(); await page.mouse.move(start.x + start.width / 2 + 30, start.y + start.height / 2 + 20, { steps: 5 }); await page.mouse.up();
        const moved = await node.boundingBox();
        assert.ok(moved.x > start.x + 20, 'device can be dragged');
        await frame.locator('#device-picker').selectOption('device--2');
        assert.ok(Math.abs((await node.boundingBox()).x - moved.x) < 1, 'selection preserves drag position');
        await frame.locator('#zoom-in').click();
        assert.ok(Number(await frame.locator('.classic-layer').getAttribute('data-zoom')) > 1);
        await frame.locator('#reset-network').click();
        assert.equal(await frame.locator('.classic-layer').getAttribute('data-zoom'), '1');
        assert.ok(Math.abs((await node.boundingBox()).x - start.x) < 1, 'reset restores geometry');
      } else {
        assert.equal(await frame.locator('#zoom-in').isVisible(), false);
        assert.equal(await frame.locator('#reset-network').isVisible(), false);
      }
      await frame.locator('#device-picker').selectOption('');
      const visual = await frame.locator('.topology-device, .topology-hub, .topology-router img').evaluateAll(nodes => nodes.map(node => {
        const css = getComputedStyle(node); return [css.boxShadow, css.filter, css.animationName];
      }));
      assert.ok(visual.every(values => values.every(value => value === 'none')), 'no glow or continuous animation');
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await frame.locator('#device-picker').selectOption('');
        assert.equal(await frame.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, layout + ' no page overflow at ' + width);
        await page.screenshot({ path: shots + '/' + layout + '-' + width + '.png', fullPage: true });
        await frame.locator('#fullscreen-network').click();
        await frame.waitForFunction(() => Boolean(document.fullscreenElement));
        assert.equal(await frame.locator('.network-inspector').isVisible(), true);
        await frame.locator('#device-picker').selectOption('device--4');
        await frame.locator('#fullscreen-network').click();
        await frame.waitForFunction(() => !document.fullscreenElement);
      }
      await frame.locator('#fullscreen-network').click();
      await frame.waitForFunction(() => Boolean(document.fullscreenElement));
      await frame.evaluate(() => document.exitFullscreen());
      await frame.waitForFunction(() => !document.fullscreenElement);
      await frame.evaluate(() => { document.querySelector('.topology-workspace').requestFullscreen = () => Promise.reject(new Error('denied')); });
      await frame.locator('#fullscreen-network').click();
      await frame.waitForFunction(() => document.querySelector('#network-notice').textContent.includes('Vollbild konnte nicht'));
      assert.equal(await frame.locator('#fullscreen-network').isEnabled(), true);
      unavailable = true;
      await frame.locator('#reload-network').click();
      await frame.waitForFunction(() => document.querySelector('#network-summary').textContent === 'Keine Netzwerkdaten');
      assert.equal(await frame.locator('.topology-device').count(), 0);
      assert.equal(await frame.locator('#device-details').innerText(), '');
      unavailable = false;
      await frame.locator('#reload-network').click();
      await frame.waitForFunction(() => document.querySelector('#device-picker').options.length === 9);
      assert.equal(await frame.locator('#network-graph').getAttribute('data-layout'), layout);
      assert.deepEqual(writes, []); assert.deepEqual(errors, []);
      await context.close();
      console.log(layout + ': selection, filters, layout switch, online, tools, fullscreen, errors and four viewport sizes passed');
    }
    for (const blocked of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
      await context.route('**/api/**', route => route.fulfill({ json: [{ id: 1, dataMode: 'demo', connection: 'offline' }] }));
      if (blocked) await context.addInitScript(() => {
        const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
        Storage.prototype.getItem = function(key) { if (key === 'nethera.topology.layout') throw new Error('blocked'); return get.call(this, key); };
        Storage.prototype.setItem = function(key, value) { if (key === 'nethera.topology.layout') throw new Error('blocked'); return set.call(this, key, value); };
      });
      const page = await context.newPage();
      await page.goto(base + '/topologie_custom.html');
      await page.waitForSelector('.tree-device');
      await page.locator('[data-layout="klassisch"]').click();
      await page.waitForSelector('.classic-device');
      if (!blocked) { await page.reload(); await page.waitForSelector('.classic-device'); }
      await context.close();
    }
    console.log('Narrow default, layout persistence and unavailable storage passed.');
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('**/api/**', route => route.fulfill({ json: [{ id: 1, dataMode: 'demo', connection: 'offline' }] }));
    const page = await context.newPage();
    await page.goto(base + '/topologie_custom.html');
    await page.waitForSelector('.topology-device');
    const special = await page.evaluate(() => {
      const router = { name: 'Test Router', dataMode: 'live', devices: [
        { id: 1, hostname: '<img onerror=alert(1)>', isOnline: true, connectionType: 'wifi' },
        { id: 2, hostname: 'Offline', isOnline: false, connectionType: 'lan' }
      ] };
      const rules = { groups: [{ id: 1, name: 'Familie' }, { id: 2, name: 'Arbeit' }], members: [{ deviceId: 1, groupId: 1 }, { deviceId: 1, groupId: 2 }, { deviceId: 2, groupId: 2 }], presets: [], assignments: [] };
      const model = NetheraTopology.buildModel(router, rules);
      const stage = document.createElement('div'); stage.className = 'topology-stage'; stage.style.cssText = 'position:relative;width:800px;height:600px'; document.body.append(stage);
      const view = { model, hubs: NetheraTopology.topologyHubs(model), mode: 'groups', groupFilter: '', query: '', selectedId: '', scope: 'test', onSelect() {}, onHubClick() {} };
      const classic = NetheraTopologyClassic.render(stage, view);
      const result = { classicCount: stage.querySelectorAll('.topology-device').length, secondary: stage.querySelectorAll('[data-secondary]').length,
        offline: getComputedStyle(stage.querySelector('.offline .device-ring')).borderTopStyle,
        noMarkup: !stage.querySelector('[onerror]') };
      classic.destroy();
      const tree = NetheraTopologyTree.render(stage, view); tree.select('device-1');
      result.selectedRows = stage.querySelectorAll('[data-device="device-1"][aria-pressed="true"]').length;
      result.rows = stage.querySelectorAll('.tree-device').length;
      tree.destroy();
      const empty = NetheraTopology.buildModel({ name: 'Empty', devices: [] }, null);
      const emptyTree = NetheraTopologyTree.render(stage, { ...view, model: empty, hubs: [] });
      result.emptyRouter = stage.querySelectorAll('.topology-router').length;
      result.emptyDevices = stage.querySelectorAll('.topology-device').length;
      emptyTree.destroy(); stage.remove();
      return result;
    });
    assert.deepEqual(special, { classicCount: 2, secondary: 1, offline: 'dashed', noMarkup: true, selectedRows: 2, rows: 3, emptyRouter: 1, emptyDevices: 0 });
    await context.close();
    console.log('Multiple memberships, offline rings, untrusted names and empty renderers passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
