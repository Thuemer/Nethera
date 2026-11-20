// Requires the local frontend. All API responses and writes are isolated in the browser.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.NETHERA_TEST_URL || 'http://localhost:5500';
const pages = ['overview','devices','network-status','topologie_custom','time-limits','security','traffic','configuration'];
(async () => {
 const browser = await chromium.launch({channel:process.env.NETHERA_BROWSER || 'chrome',headless:true});
 let checks=0;
 try {
  const context=await browser.newContext();
  let mode='demo', failSave=false, puts=0;
  const devices=[{id:1,hostname:'Tablet <Familie>',ipAddress:'192.0.2.10',connectionType:'wifi'},{id:2,hostname:'Sehr-langer-Gerätename-für-die-Präsentation',connectionType:'lan'}];
  let limits=[{id:1,deviceId:1,dailyLimitMinutes:90,usedMinutesToday:25,blockedFrom:'21:00',blockedUntil:'07:00',status:'active'}];
  await context.route('**/api/**',async route=>{
   const url=route.request().url(),method=route.request().method();
   if(['error','unauthorized'].includes(mode))return route.fulfill({status:mode==='error'?500:401,json:{}});
   if(url.includes('/routers/list'))return route.fulfill({json:[{id:1,name:'Testnetz',dataMode:mode==='demo'?'demo':mode==='unknown'?'unavailable':'live',connection:mode==='demo'?'offline':mode==='unknown'?'unknown':'online',devices:mode==='empty'?[]:devices}]});
   if(url.includes('/device-time-limits')){
    if(method==='PUT'){
     puts++;await new Promise(r=>setTimeout(r,200));
     if(failSave)return route.fulfill({status:500,json:{}});
     const value={...route.request().postDataJSON(),id:1};limits=[value];return route.fulfill({json:value});
    }
    if(method==='DELETE'){limits=[];return route.fulfill({status:204});}
    return route.fulfill({json:limits});
   }
   if(url.includes('/security/state'))return route.fulfill({json:{groups:[{id:1,name:'Familie'}],members:[{deviceId:1,groupId:1}],presets:[],assignments:[],blocklists:[],timeLimits:limits}});
   if(url.includes('/router-control/status'))return route.fulfill({status:404,json:{}});
   return route.fulfill({json:[]});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  async function visit(file){await page.goto(`${base}/${file}.html`);await page.locator('#dataSourceNotice').waitFor();await page.waitForTimeout(150);assert.deepEqual(errors.splice(0),[],`${file} errors in ${mode}`);}
  for(const width of [1440,768,390,320]){
   await page.setViewportSize({width,height:900});
   for(const file of pages){
    await visit(file);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${file} overflow at ${width}`);
    if(process.env.NETHERA_SCREENSHOTS && [1440,390].includes(width)){
     fs.mkdirSync(process.env.NETHERA_SCREENSHOTS,{recursive:true});
     await page.screenshot({path:path.join(process.env.NETHERA_SCREENSHOTS,`${file}-${width}.png`),fullPage:true});
    }
    if (file === 'devices' && width <= 390) {
      assert.equal(await page.locator('.table-wrap').evaluate(element => element.scrollWidth > element.clientWidth), false);
      const details = page.locator('.client-details-toggle').first();
      await details.click();
      assert.equal(await details.getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('.client-detail-row').first().isVisible(), true);
    }
    checks++;
   }
  }
  await page.setViewportSize({width:1280,height:900});
  await visit('overview');
  assert.equal(await page.locator('#dashboard-settings').isVisible(),false);
  await page.locator('#editToggle').click();assert.equal(await page.locator('#dashboard-settings').isVisible(),true);
  await page.locator('#editToggle').click();assert.equal(await page.locator('#dashboard-settings').isVisible(),false);checks++;
  await visit('topologie_custom');
  await page.locator('#open-device-search').click();
  await page.locator('#device-search').fill('nicht vorhanden');assert.equal(await page.locator('#graph-empty').innerText(),'Keine passenden Geräte');
  await page.locator('#device-search').fill('');await page.locator('#device-picker').selectOption('device--1');
  assert.match(await page.locator('#device-details').innerText(),/Demo-Laptop/);
  await page.locator('[data-view="connections"]').click();assert.equal(await page.locator('[data-view="connections"]').getAttribute('aria-pressed'),'true');checks++;
  await visit('security');
  for (const tab of await page.locator('[data-tab]').all()) {
    const name = await tab.getAttribute('data-tab');
    await tab.click();
    assert.equal(await page.locator(`#tab-${name}`).isVisible(), true);
    assert.deepEqual(errors.splice(0), []);
    checks++;
  }
  await visit('time-limits');
  const picker = page.locator('#deviceSelect').locator('..').getByRole('combobox');
  await picker.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  assert.equal(await picker.getAttribute('aria-expanded'),'false');
  await page.locator('#deviceSelect').selectOption('-4',{force:true});assert.match(await page.locator('#schedulePreview').innerText(),/Demo-Tablet/);
  assert.equal(await page.locator('#saveLimitButton').isDisabled(),true);checks++;
  mode='live';await visit('time-limits');
  await page.waitForFunction(()=>!document.querySelector('#saveLimitButton').disabled);
  assert.equal(await page.locator('#dailyLimit').inputValue(),'90');
  await page.locator('[data-schedule="homework"]').click();assert.equal(await page.locator('#blockedFrom').inputValue(),'14:00');assert.equal(puts,0);
  await page.locator('#blockedUntil').fill('14:00');assert.match(await page.locator('#schedulePreview').innerText(),/unterschiedliche Uhrzeiten/);
  assert.equal(await page.locator('#scheduleTimeline').isVisible(),false);
  await page.locator('[data-schedule="night"]').click();failSave=true;await page.locator('#saveLimitButton').click();
  await page.waitForFunction(()=>document.querySelector('#statusBox').getAttribute('state')==='error');assert.equal(await page.locator('#blockedFrom').inputValue(),'21:00');
  failSave=false;const before=puts;
  await page.locator('#limitForm').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
  await page.waitForFunction(()=>document.querySelector('#statusBox').getAttribute('state')==='success');
  assert.equal(puts,before+1);assert.equal(limits[0].dailyLimitMinutes,90);checks++;
  for(mode of ['empty','unknown','error','unauthorized'])for(const file of pages){
   await visit(file);
   if(mode!=='empty')assert.equal(await page.locator('#dataSourceNotice').getAttribute('data-mode'),'unavailable');
   if(file==='time-limits'){assert.equal(await page.locator('#saveLimitButton').isDisabled(),true);assert.equal(await page.locator('#scheduleTimeline').isVisible(),false);}
   checks++;
  }
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:900});
   for(const file of ['/','/website/html/step_by_step.html','/website/html/support.html']){
    await page.goto(base+file);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${file} overflow at ${width}`);assert.deepEqual(errors.splice(0),[]);checks++;
   }
  }
  console.log(`Passed ${checks} browser scenarios. No test writes reached the backend.`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
