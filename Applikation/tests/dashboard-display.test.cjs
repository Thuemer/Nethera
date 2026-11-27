const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function harness() {
  const context = vm.createContext({
    window: { devicePixelRatio: 2, NETHERA_CONFIG: {} },
    HTMLElement: class {},
    customElements: { define() {} }
  });
  vm.runInContext(readFileSync(path.join(__dirname, '..', 'api.js'), 'utf8'), context);
  vm.runInContext(readFileSync(path.join(__dirname, '..', 'overview.js'), 'utf8'), context);
  return source => vm.runInContext(source, context);
}

test('missing router and speed values are not displayed as offline or zero', () => {
  const run = harness();
  assert.equal(run('formatSpeed(null)'), '—');
  assert.equal(run('formatSpeed(0)'), '0.0 Mb/s');
  const html = run('const card = new RouterCard(); card.render(); card.innerHTML');
  assert.match(html, /Unbekannt/);
  assert.doesNotMatch(html, /Offline/);
});

test('empty speed chart does not invent a zero measurement', () => {
  const run = harness();
  const result = run(`
    const labels = [];
    const canvas = {width:0,height:0,getBoundingClientRect:()=>({width:300,height:130}),
      getContext:()=>({setTransform(){},clearRect(){},fillText(text){labels.push(text)}})};
    const card = new SpeedCard(); card.querySelector=()=>canvas; card.drawChart();
    ({samples:card.upload.length,labels,width:canvas.width,height:canvas.height});
  `);
  assert.equal(result.samples, 0);
  assert.equal(result.labels[0], 'Keine Messwerte verfügbar');
  assert.equal(result.width, 600);
  assert.equal(result.height, 260);
});

test('speed chart releases its resize observer when removed', () => {
  const run = harness();
  assert.equal(run(`let disconnected=false; const card=new SpeedCard();
    card.chartResizeObserver={disconnect(){disconnected=true}};
    card.disconnectedCallback(); disconnected;`), true);
});

test('router names, firmware and client names are rendered as text', () => {
  const run = harness();
  const value = '<img src=x onerror=alert(1)>';
  const routerHtml = run(`const routerCard=new RouterCard();routerCard.router={firmware:${JSON.stringify(value)}};routerCard.render();routerCard.innerHTML`);
  assert.doesNotMatch(routerHtml, /<img/);
  assert.match(routerHtml, /&lt;img/);
  const clientHtml = run(`const clientsCard=new ClientsCard();clientsCard.devices=[{hostname:${JSON.stringify(value)}}];clientsCard.render();clientsCard.innerHTML`);
  assert.doesNotMatch(clientHtml, /<img/);
});

test('chart timestamps use the same local timezone as the other dates', () => {
  const run = harness();
  const timestamp='2026-11-18T10:00:00Z';
  assert.equal(run(`formatTime('${timestamp}')`), new Date(timestamp).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}));
  assert.equal(run(`formatDateTime('<invalid>')`), '—');
});

test('corrupted or disabled layout storage does not crash the dashboard', () => {
  const run = harness();
  for (const value of ['{bad json', 'null', '42', '[]']) {
    run(`{ globalThis.localStorage={getItem:()=>${JSON.stringify(value)}};
      const dashboard${value.length}=new DashboardContainer();dashboard${value.length}.querySelector=()=>({clientWidth:1200});dashboard${value.length}.loadLayout(); }`);
  }
  run(`globalThis.localStorage={getItem(){throw new Error('disabled')},setItem(){throw new Error('disabled')}};
    const dashboard=new DashboardContainer();dashboard.querySelector=()=>({clientWidth:1200});dashboard.loadLayout();dashboard.saveLayout();`);
});

test('router and clients cards count only devices from the latest router report', () => {
  const run = harness();
  const router = JSON.stringify({ dataMode: 'live', checkedAt: '2026-11-20T10:00:00Z', devices: [
    { hostname: 'Laptop', connectionType: 'WIFI', lastSeen: '2026-11-20T09:59:40Z' },
    { hostname: 'TV', connectionType: 'LAN', lastSeen: '2026-11-20T09:59:00Z' },
    { hostname: 'Old phone', connectionType: 'WIFI', lastSeen: '2026-11-20T07:00:00Z' }
  ] });
  const routerHtml = run(`const rc=new RouterCard();rc.router=${router};rc.render();rc.innerHTML`);
  assert.match(routerHtml, /Clients<\/span>\s*<span class="card-kpi-value">2</);
  const clientHtml = run(`(async()=>{getPrimaryRouter=async()=>(${router});const cc=new ClientsCard();cc.render=function(){};await cc.loadClientData();cc.render=ClientsCard.prototype.render;cc.render();return cc.innerHTML;})()`);
  return clientHtml.then(html => {
    assert.match(html, /Online<\/span>\s*<span class="card-kpi-value">2</);
    assert.match(html, /Laptop/);
    assert.doesNotMatch(html, /Old phone/);
  });
});

test('speed chart splits the line where the router sent no samples', () => {
  const run = harness();
  const segments = run(`const sc=new SpeedCard();
    sc.times=[0,30,60,90,600000,600030,1200000].map(ms=>ms+Date.UTC(2026,10,20));
    JSON.stringify(sc.segments())`);
  assert.equal(segments, '[[0,1,2,3],[4,5],[6]]');
});
