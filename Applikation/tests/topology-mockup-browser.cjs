const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = (process.env.NETHERA_TEST_URL || 'http://localhost:5500').replace(/\/$/, '');
const shots = process.env.NETHERA_SCREENSHOTS || '/tmp/nethera-mockup-comparison';
const reference = fs.readFileSync(path.join(__dirname, '../../openspec/changes/topology-visual-refresh/mockup.html'), 'utf8');

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.NETHERA_BROWSER || 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('**/mockup-reference', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<meta charset="UTF-8">' + reference }));
    await context.route('**/mockup-implementation', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body:
      '<meta charset="UTF-8"><link rel="stylesheet" href="/topologie.css"><section class="graph-surface" style="width:1248px;height:720px"><div class="topology-stage" id="stage"></div></section>' +
      ['topology-model', 'topology-renderer', 'topology-classic', 'topology-tree'].map(name => `<script src="/${name}.js"></script>`).join('') }));
    const original = await context.newPage();
    await original.goto(base + '/mockup-reference');
    await original.waitForSelector('.c-dev');
    const fixture = await original.evaluate(() => ({ groups: GROUPS, devices: DEVICES, name: ROUTER_NAME, image: ROUTER }));
    const actual = await context.newPage();
    await actual.goto(base + '/mockup-implementation');
    await actual.waitForFunction(() => Boolean(window.NetheraTopologyTree));
    const image = fs.readFileSync(path.join(__dirname, '../topology-router.png'));
    assert.deepEqual(image, Buffer.from(fixture.image.split(',')[1], 'base64'), 'router image is byte-identical to the mockup');
    for (const [layout, option] of [['klassisch', 'C2'], ['baum', 'F']]) {
      await original.locator(`[data-v="${option}"]`).click();
      await actual.evaluate(({ fixture, layout }) => {
        const model = {
          router: { name: fixture.name },
          groups: fixture.groups.map(group => ({ ...group, count: fixture.devices.filter(d => d.group === group.id).length })),
          devices: fixture.devices.map(device => ({ ...device, id: String(device.id), connection: device.conn,
            groups: fixture.groups.filter(group => group.id === device.group) }))
        };
        window.renderer?.destroy();
        const view = { model, hubs: NetheraTopology.topologyHubs(model), mode: 'groups', query: '', groupFilter: '', selectedId: '', scope: 'reference', onSelect() {}, onHubClick() {} };
        window.renderer = (layout === 'klassisch' ? NetheraTopologyClassic : NetheraTopologyTree).render(document.querySelector('#stage'), view);
      }, { fixture, layout });
      await actual.locator('.topology-router img').evaluate(image => image.decode());
      const measure = async (page, selectors) => page.evaluate(selectors => {
        const origin = document.querySelector('#stage').getBoundingClientRect();
        return selectors.map(selector => [...document.querySelectorAll(selector)].map(node => {
          const box = node.getBoundingClientRect(), css = getComputedStyle(node);
          return { x: box.x - origin.x - (origin.width === 1248 ? 1 : 0), y: box.y - origin.y - (origin.width === 1248 ? 1 : 0),
            width: box.width, height: box.height, background: css.backgroundImage, backgroundColor: css.backgroundColor,
            borderColor: css.borderTopColor, borderWidth: css.borderTopWidth, radius: css.borderRadius, fontSize: css.fontSize };
        }));
      }, selectors);
      const expected = await measure(original, layout === 'klassisch' ? ['.c-router', '.c-group', '.c-dev'] : ['.f-router', '.f-group', '.f-dev']);
      const observed = await measure(actual, layout === 'klassisch' ? ['.topology-router img', '.topology-hub', '.device-ring'] : ['.topology-router', '.topology-hub', '.tree-device']);
      for (let kind = 0; kind < expected.length; kind++) {
        assert.equal(observed[kind].length, expected[kind].length);
        expected[kind].forEach((item, i) => {
          for (const property of ['x', 'y', 'width', 'height']) {
            assert.ok(Math.abs(item[property] - observed[kind][i][property]) < 1.1,
              `${layout} ${kind}:${i} ${property}: expected ${item[property]}, got ${observed[kind][i][property]}`);
          }
          if (kind > 0) for (const property of ['background', 'backgroundColor', 'borderColor', 'borderWidth', 'radius']) {
            assert.equal(observed[kind][i][property], item[property], `${layout} ${kind}:${i} ${property}`);
          }
        });
      }
      await original.locator('#stage').screenshot({ path: path.join(shots, layout + '-original.png') });
      await actual.locator('.graph-surface').screenshot({ path: path.join(shots, layout + '-implementation.png') });
      console.log(layout + ': same router asset; all 15 device and 5 hub positions, sizes, backgrounds and borders match the original mockup.');
    }
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
