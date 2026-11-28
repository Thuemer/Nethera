// Local files and intercepted APIs only; no request reaches a live router/cloud.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=process.env.NETHERA_TEST_ROOT||path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({channel:process.env.NETHERA_BROWSER||'chrome',headless:true});
 try{
  const context=await browser.newContext();const page=await context.newPage();const errors=[],writes=[];let failBlockWrite=false;let bandwidth={configured:true,desired:{enabled:true,downloadKbit:60000,uploadKbit:10000},applied:true};
  page.on('pageerror',e=>errors.push(e.message));
  const device={id:24,hostname:'Test-MacBook',macAddress:'02:27:00:00:00:24',ipAddress:'192.0.2.24',connectionType:'wifi',isOnline:true};
  let control={routerId:1,connection:'online',checkedAt:new Date().toISOString(),capabilities:{devicePriority:true,timeControl:true},
   priority:{24:{mode:'normal',applied:true}},timeApplied:true,timeLimits:{24:{applied:true,blockedNow:false}},
   adblock:{installed:true,enabled:true,applied:true},blocklists:{5:{applied:true}}};
  const data={devices:[device],groups:[{id:2,name:'Kinder',blocklistId:null}],members:[{deviceId:24,groupId:2}],presets:[],assignments:[],
   blocklists:[{id:5,routerId:1,name:'Netzwerksperre',sourceType:'NETWORK',urlPattern:'example.com'}],
   timeLimits:[{deviceId:24,status:'active',blockedFrom:'21:00',blockedUntil:'07:00',routerEnforcement:true}]};
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.hostname!=='nethera.test')return route.abort();
   if(url.pathname.startsWith('/api/')){
    if(request.method()!=='GET')writes.push({path:url.pathname,method:request.method(),body:request.postDataJSON()});
    if(url.pathname==='/api/routers/list')return route.fulfill({json:[{id:1,name:'Testnetz',dataMode:'live',connection:'online',devices:[device]}]});
    if(url.pathname==='/api/security/state')return route.fulfill({json:data});
    if(url.pathname==='/api/router-control/status')return route.fulfill({json:control});
    if(url.pathname==='/api/router-control/priority/bandwidth'){
      if(request.method()==='PUT'){bandwidth={configured:true,desired:request.postDataJSON(),applied:false};return route.fulfill({status:202,json:{accepted:true}})}
      return route.fulfill({json:bandwidth});
    }
    if(url.pathname==='/api/router-control/priority/devices/24'){
      control.priority[24]={mode:request.postDataJSON().mode,applied:false};return route.fulfill({status:202,json:{accepted:true}});
    }
    if(url.pathname==='/api/configs/list')return route.fulfill({json:[{id:1,dnsBlocking:true}]});
    if(url.pathname==='/api/configs/1')return route.fulfill({json:{id:1,...request.postDataJSON()}});
    if(url.pathname==='/api/security/blocklists'){
      if(failBlockWrite)return route.fulfill({status:500,json:{}});
      const body=request.postDataJSON();const id=body.id||17;
      const previous=data.blocklists.findIndex(item=>item.id===id);const list={...body,id};
      if(previous<0)data.blocklists.push(list);else data.blocklists[previous]=list;
      return route.fulfill({json:list});
    }
    if(url.pathname==='/api/security/groups'){data.groups=[request.postDataJSON()];return route.fulfill({json:data.groups[0]})}
    return route.fulfill({status:404,json:{}});
   }
   const file=path.join(root,decodeURIComponent(url.pathname));
   if(!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
   return route.fulfill({body:fs.readFileSync(file),contentType:mime[path.extname(file)]||'application/octet-stream'});
  });
  await page.goto('http://nethera.test/security.html');
  await page.waitForFunction(()=>document.body.dataset.localDraft==='false');
  assert.equal(await page.locator('.draft-strip').isVisible(),false);
  await page.locator('[data-tab="priority"]').click();
  await page.selectOption('#priorityMode','high',{force:true});
  await page.locator('#priorityForm [type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#priorityList').textContent.includes('Routerwirkung unbestätigt'));
  assert.deepEqual(writes.map(w=>w.path),['/api/router-control/priority/devices/24']);
  assert.equal(control.timeApplied,true);assert.equal(control.adblock.enabled,true);
  control.priority[24].applied=true;
  await page.locator('#refreshRouterControl').click();
  await page.waitForFunction(()=>document.querySelector('#priorityList').textContent.includes('Am Router bestätigt'));
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await page.locator('[data-tab="blocklists"]').click();
  await page.selectOption('#domainScope','group',{force:true});
  await page.selectOption('#domainTarget','2',{force:true});
  await page.locator('#manualDomainInput').fill('https://www.tiktok.com/path');
  await page.locator('#manualDomainForm [type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#domainSaveStatus').textContent.includes('Erfolgreich gespeichert'));
  assert.match(await page.locator('#domainSaveStatus').innerText(),/tiktok.com · Kinder/);
  assert.match(await page.locator('#domainSaveStatus').innerText(),/Routerbestätigung ausstehend/);
  const groupWrite=writes.find(w=>w.path==='/api/security/blocklists');
  assert.equal(groupWrite.body.sourceType,'GROUP');assert.equal(data.groups[0].blocklistId,17);
  assert.equal(data.blocklists.find(item=>item.id===5).urlPattern,'example.com');
  failBlockWrite=true;
  await page.locator('#manualDomainInput').fill('youtube.com');
  await page.locator('#manualDomainForm [type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#domainSaveStatus').textContent.includes('Nicht vollständig gespeichert'));
  assert.equal(await page.locator('#manualDomainForm [type="submit"]').isDisabled(),false);
  assert.ok(!data.blocklists.some(item=>item.urlPattern.includes('youtube.com')));
  if(process.env.NETHERA_SCREENSHOTS){fs.mkdirSync(process.env.NETHERA_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.NETHERA_SCREENSHOTS,'website-group-error-mobile.png'),fullPage:true})}
  failBlockWrite=false;
  await page.locator('[data-tab="priority"]').click();
  assert.equal(await page.locator('#priorityDownloadMbit').inputValue(),'60');
  await page.locator('#priorityDownloadMbit').fill('50');
  await page.locator('#priorityBandwidthForm [type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#priorityBandwidthStatus').textContent.includes('ausstehend'));
  assert.deepEqual(bandwidth.desired,{enabled:true,downloadKbit:50000,uploadKbit:10000});
  assert.ok(!await page.locator('#priorityList').innerText().then(t=>t.includes('Am Router bestätigt')));
  assert.equal(control.timeApplied,true);assert.equal(control.adblock.enabled,true);
  bandwidth={configured:false,reported:{enabled:true,downloadKbit:1000000,uploadKbit:10000,adaptive:true,active:true,currentDownloadKbit:42000},applied:true};
  await page.evaluate(()=>loadPriorityBandwidth());
  assert.match(await page.locator('#priorityBandwidthStatus').innerText(),/Automatische Downloadregelung.*42.0/);
  bandwidth.applied=false;
  await page.evaluate(()=>loadPriorityBandwidth());
  assert.ok(!await page.locator('#priorityBandwidthStatus').innerText().then(t=>t.includes('Automatische Downloadregelung am Router aktiv')));
  // Exercise existing live protection paths after the new priority write.
  await page.evaluate(()=>updateBlocklistDomain(5,'example.com','blocked.example'));
  await page.evaluate(()=>{document.getElementById('adProtectionEnabled').checked=false;return saveAdProtection({preventDefault(){}})});
  assert.ok(writes.some(w=>w.path==='/api/security/blocklists'));
  assert.ok(writes.some(w=>w.path==='/api/configs/1'));
  assert.deepEqual(errors,[]);
  console.log('PASS: live priority save/readback, preserved live DNS/adblock writes, time status, desktop/mobile; intercepted APIs only.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
