'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const M=require('../model.js'),T=require('../tuning-model.js'),P=require('../qpl-policy.js'),H=require('../qpl-history-engine.js');
const root=path.resolve(__dirname,'..');
const races=Array.from({length:12},(_,ri)=>({date:'20260913',venue:'seoul',race_no:ri+1,start_time:'10:00',title:'서울 경주',horses:Array.from({length:10},(_,i)=>({number:i+1,name:'출전마 '+(i+1),weighted_v3_features:Array.from({length:17},(_,j)=>Math.max(0,Math.min(1,.85-i*.06+Math.sin(ri*3+i+j)*.25))),weighted_v3_support:{starts:ri%6,available:Array(17).fill(ri%3!==0)}})),official_result:{status:'confirmed',starters:Array.from({length:10},(_,i)=>i+1),place:{status:'confirmed',payouts:[{numbers:[1],odds:2},{numbers:[3],odds:3},{numbers:[5],odds:4}]},pair:{status:'confirmed',payouts:[{numbers:[1,3],odds:3+ri},{numbers:[1,5],odds:5},{numbers:[3,5],odds:6}]}}}));
for(const race of races)race.official_result.trio={status:'confirmed',payouts:[{numbers:[1,3,5],odds:12}]};
const rows=races.map(r=>T.pack(M.analyze(r)));
const manifest={schema:2,scope:'seoul',policyVersion:P.VERSION,generatedAt:'2026-09-20T00:00:00Z',rows};
const doc={date:'20260913',updated_at:'2026-09-20T00:00:00Z',scope:'seoul',races,calendar:[{date:'20260913',venues:['seoul']}]};
const server=http.createServer((req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname;
 const json=p==='/qpl-history.json'?manifest:p==='/data/latest.json'||p.startsWith('/data/calendar/')?doc:null;
 if(json){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(json));return;}
 const file=path.resolve(root,p==='/'?'index.html':'.'+p);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;res.end();return;}
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html');let content=fs.readFileSync(file);if(file.endsWith('/app.js'))content=content.toString().replace('run:runWeightSearch,', 'run:(o,p)=>{window.__requestedSearchSeconds=o.seconds;return runWeightSearch({...o,seconds:Math.min(o.seconds,2)},p);},');res.end(content);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,args:['--no-sandbox']}),errors=[];
 try{for(const fallback of [false,true]){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:')?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  if(fallback)await page.addInitScript(()=>{window.Worker=undefined;});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#pairLead .lead-number').waitFor();
  await page.locator('#screeningEnabled').check();
  for(const mode of ['qpl-anchor2','trio-box4','qpl-single']){
   await page.selectOption('#betStrategy',mode);
   await page.waitForFunction(()=>document.querySelector('#screeningStats').getAttribute('aria-busy')==='false');
   const cfg=await page.evaluate(()=>strategySettings()),g=await H.create(rows).evaluate({...cfg,includeScreening:true},'20220101','20260920');
   assert.equal(cfg.betStrategy,mode);assert.equal(await page.locator('#screeningProduct').innerText(),g.screening.points[0].product.toFixed(4)+'배');
   assert((await page.locator('#pairLead').innerText()).includes('배'));
   assert.equal(await page.locator('#raceOverview .screening-badge').count(),12);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile overflow');
   await page.locator('#presetName').fill(mode);await page.locator('#saveStrategy').click();
   if(mode!=='qpl-single'){
    for(const searchMode of ['all','joint']){
     await page.selectOption('#weightSearchMode',searchMode);await page.locator('#startWeightSearch').click();
     await page.waitForFunction(()=>!document.querySelector('#startWeightSearch').disabled,{},{timeout:60000});
     const status=await page.locator('#weightSearchStatus').innerText();assert(!status.includes('실패'),status);
     if(!await page.locator('#applyWeightSearch').isDisabled()){
      const product=await page.locator('#weightSearchResult .search-metrics strong').nth(2).innerText();
      await page.locator('#applyWeightSearch').click();assert.equal(await page.locator('#betStrategy').inputValue(),mode);
      await page.waitForFunction(()=>document.querySelector('#screeningStats').getAttribute('aria-busy')==='false');
      if(searchMode==='joint')assert.equal(await page.locator('#screeningProduct').innerText(),product);
     }
    }
   }
  }
  await page.selectOption('#savedStrategy','trio-box4');await page.locator('#loadStrategy').click();assert.equal(await page.locator('#betStrategy').inputValue(),'trio-box4');
  await page.reload();await page.locator('#screeningProduct').waitFor();assert.equal(await page.locator('#betStrategy').inputValue(),'trio-box4');
  await page.locator('.race-screening').screenshot({path:'/tmp/multi-strategy-'+(fallback?'fallback':'worker')+'.png'});
  await context.close();
 }assert.deepEqual(errors,[]);console.log('PASS mobile multi-strategy worker/fallback, stats, payouts, searches, save/load, reload and layout');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
