'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync:exec,execFile}=require('node:child_process');
const Contract=require('../runner-search-contract.js'),T=require('../tuning-model.js'),H=require('../qpl-history-engine.js'),{search}=require('../scripts/runner-search.cjs');
const request={schema:1,requestId:'runner-test',seconds:1,method:'de',objective:'product',parallel:true,balanced:false,joint:false,target:50,settings:{...T.settings(),anchorRank:1,min:2,max:10}};
(async()=>{
 assert.equal(Contract.request(request).minHitRate,15);
 for(const minHitRate of [0,10,12.5,100])assert.equal(Contract.request({...request,minHitRate}).minHitRate,minHitRate);
 for(const minHitRate of [-1,100.1,12.55,null,'10'])assert.throws(()=>Contract.request({...request,minHitRate}));
 for(const seconds of [1,600,601,3600,18000,86400,172800,604800])assert.equal(Contract.request({...request,seconds}).seconds,seconds);
 for(const changed of [{seconds:604801},{seconds:0},{seconds:NaN},{requestId:'$(command)'},{method:'shell'},{settings:{...request.settings,min:1}},{settings:{...request.settings,weights:Array(21).fill(-1)}}])assert.throws(()=>Contract.request({...request,...changed}));
 const manifest=JSON.parse(fs.readFileSync('qpl-history.json')),rows=manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows.slice(0,50));
 let report;
 for(const joint of [false,true]){
  report=await search({...request,joint},rows,{runId:'123-1'});assert(report.result.workers>=1);assert(report.result.count>0);assert(report.result.best);
  const b=report.result.best,g=await H.create(rows).evaluate({...b.settings,includeScreening:joint},report.from,report.to);assert.equal(b.metrics.product,H.metrics(joint?g.screening.points[b.settings.screening.threshold]:g.all).product);
  if(joint){assert.equal(b.joint.optimizer,'alternating-v1');assert.equal(b.settings.screening.target,50);assert(b.all.evaluated>=Math.ceil(b.all.total*.5));assert.deepEqual(b.joint.ratios.map(r=>r.target),[40,50,60,80]);}
 }
 const low=structuredClone(report);low.request.joint=false;low.request.minHitRate=12.5;low.result.best.all={total:1000,evaluated:1000,hits:125,paidHits:125,excluded:0,payoutTotal:500};
 assert.equal(Contract.report(structuredClone(low)).result.best.metrics.rate,.125);
 low.request.minHitRate=12.6;assert.throws(()=>Contract.report(structuredClone(low)));
 delete low.request.minHitRate;assert.throws(()=>Contract.report(structuredClone(low)));
 const legacy=structuredClone(report);legacy.request.target=60;legacy.request.settings.screening=undefined;legacy.result.best.settings.screening.target=60;legacy.result.best.joint.target=60;legacy.result.best.joint.ratios=legacy.result.best.joint.ratios.filter(r=>r.target!==50);
 assert.equal(Contract.report(legacy).result.best.joint.ratios.length,3,'legacy three-target reports remain readable');
 const duplicate=structuredClone(report);duplicate.result.best.joint.ratios[1].target=40;assert.throws(()=>Contract.report(duplicate));
 const chainedRequest={...request,joint:true,seconds:2,settings:report.result.best.settings};
 const first=await search(chainedRequest,rows,{runId:'125-1',segmentSeconds:1,to:'20261008'});
 const resumed=await search(chainedRequest,rows,{runId:'125-1',segmentSeconds:1,previous:first,to:'20261015'});assert.equal(resumed.to,first.to);
 assert.equal(first.result.elapsed,1);assert.equal(resumed.result.elapsed,2);assert.equal(resumed.result.segments,2);assert(resumed.result.count>=first.result.count);assert(resumed.result.best);
 assert.equal(resumed.result.best.joint.optimizer,'alternating-v1');assert(resumed.result.best.metrics.product>=first.result.best.metrics.product-1e-12);
 assert.throws(()=>Contract.report({...report,modelVersion:'old-model'}));
 const malicious=structuredClone(report);malicious.result.best.settings.weights[0]='<img>';assert.throws(()=>Contract.report(malicious));
 // Publish in a disposable bare repository; preserve existing results and create a
 // result-only branch without altering source/history or using a public-site token.
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'runner-publish-test-')),repo=path.join(temp,'repo'),bare=path.join(temp,'remote');
 try{
  exec('git',['init','--bare',bare],{stdio:'pipe'});exec('git',['init',repo],{stdio:'pipe'});exec('git',['remote','add','origin',bare],{cwd:repo});fs.mkdirSync(path.join(repo,'_runner-out'));
  for(const runId of ['123-1','124-1']){fs.writeFileSync(path.join(repo,'_runner-out/result.json'),JSON.stringify({...report,runId}));exec(process.execPath,[path.resolve('scripts/publish-runner-result.cjs')],{cwd:repo,stdio:'pipe'});}
  // Independent checkouts finish together and push to the same result branch.
  const concurrentIds=Array.from({length:6},(_,i)=>String(200+i)+'-1');
  await Promise.all(concurrentIds.map(runId=>{const cwd=path.join(temp,runId);fs.mkdirSync(cwd);exec('git',['init',cwd],{stdio:'pipe'});exec('git',['remote','add','origin',bare],{cwd});fs.mkdirSync(path.join(cwd,'_runner-out'));fs.writeFileSync(path.join(cwd,'_runner-out/result.json'),JSON.stringify({...report,runId}));return new Promise((resolve,reject)=>execFile(process.execPath,[path.resolve('scripts/publish-runner-result.cjs')],{cwd},(error)=>error?reject(error):resolve()));}));
  const index=JSON.parse(exec('git',['--git-dir',bare,'show','runner-results:index.json'],{encoding:'utf8'}));assert.equal(index.entries.length,8);
  for(const runId of concurrentIds)assert.equal(JSON.parse(exec('git',['--git-dir',bare,'show','runner-results:runs/'+runId+'.json'],{encoding:'utf8'})).runId,runId);
  assert.equal(JSON.parse(exec('git',['--git-dir',bare,'show','runner-results:runs/123-1.json'],{encoding:'utf8'})).runId,'123-1');
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
 console.log('PASS Runner request validation through 7 days, checkpoint/resume, real Node CPU workers, ordinary/joint exact parity, report validation and isolated result branch publishing');
})().catch(e=>{console.error(e);process.exitCode=1;});
