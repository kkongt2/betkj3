'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module');
const W=require('../weight-search-engine.js'),J=require('../joint-search-engine.js'),T=require('../tuning-model.js'),R=require('../runner-search-contract.js');
const options={seconds:86400,objective:'product',settings:{...T.settings(),anchorRank:1,min:2,max:10},from:'20230101',to:'20260923',balanced:false};
const all={total:100,evaluated:100,hits:25,paidHits:25,payoutTotal:125,excluded:0};
(async()=>{
 // Cross the previous 300-minute ceiling and reach the new 1440-minute deadline
 // with a fake monotonic clock, while still performing real candidate selection.
 for(const method of ['local','de']){
  let clock=0;
  const out=await W.run({...options,method},async()=>{clock+=3600001;return {all};},async()=>({all}),{now:()=>clock,yieldTask:()=>Promise.resolve()});
  assert.equal(out.elapsed,86400);assert.equal(out.count,24);assert(out.best);
 }
 let clock=0;const joint=await J.create([],()=>Promise.resolve()).run({...options,target:60},()=>{throw Error('No valid candidate');},{now:()=>clock+=3600001});
 assert.equal(joint.elapsed,86400);assert(joint.count>1);
 // The actual coordinator must schedule a 24-hour timer, not 24 minutes or
 // the former five-hour cap. No real long-running search is started by this test.
 const timers=[],moduleObject={exports:{}};vm.runInNewContext(fs.readFileSync('parallel-search.js','utf8'),{module:moduleObject,require:createRequire(path.resolve('parallel-search.js')),performance:{now:()=>0},setTimeout:(fn,ms)=>{timers.push(ms);return timers.length;},clearTimeout:()=>{}});
 const pool=moduleObject.exports.create({makeWorker:()=>({postMessage(m){if(m.type==='init'){assert.equal(m.options.seconds,86400);queueMicrotask(()=>this.onmessage({data:{type:'ready'}}));}},terminate(){}})});
 const pending=pool.run([],options,2,()=>{});await new Promise(r=>setImmediate(r));assert(timers.includes(86400000));pool.abort();assert.equal(await pending,null);
 const request={schema:1,requestId:'minutes-test',...options,joint:false,parallel:true,method:'de',target:60};
 const report={schema:1,modelVersion:T.VERSION,featureCount:22,request,runId:'1-1',from:options.from,to:options.to,finishedAt:new Date().toISOString(),result:{count:0,elapsed:86400,workers:1,best:null}};
 assert.equal(R.report(report).result.elapsed,86400);assert.throws(()=>R.report({...report,result:{...report.result,elapsed:86401}}));
 assert.equal(R.request({...request,seconds:5}).seconds,5,'old Runner results remain readable');assert.equal(R.request({...request,seconds:86400}).seconds,86400);assert.equal(R.request({...request,seconds:172800}).seconds,172800);assert.throws(()=>R.request({...request,seconds:604801}));
 const {nextSegmentSeconds,SEGMENT_SECONDS}=require('../scripts/runner-search.cjs');
 assert.equal(SEGMENT_SECONDS,18000);
 for(let minutes=10;minutes<=1440;minutes+=10){
  const chunks=[];let elapsed=0;
  while(elapsed<minutes*60){const n=nextSegmentSeconds(minutes*60,elapsed);assert(n>0&&n<=18000);chunks.push(n/60);elapsed+=n;}
  assert.equal(elapsed,minutes*60);assert.equal(chunks.length,Math.ceil(minutes/300));assert(chunks.length<=5);
  assert.equal(nextSegmentSeconds(minutes*60,elapsed),0);
  if(minutes===1440)assert.deepEqual(chunks,[300,300,300,300,240]);
 }
 for(let days=1;days<=7;days++){const total=days*86400;assert.equal(R.request({...request,seconds:total}).seconds,total);let elapsed=0,count=0;while(elapsed<total){elapsed+=nextSegmentSeconds(total,elapsed);count++;}assert.equal(elapsed,total);assert.equal(count,Math.ceil(total/18000));if(days===7)assert.equal(count,34);}
 assert.throws(()=>nextSegmentSeconds(86400,0,21600));
 const workflow=fs.readFileSync('.github/workflows/runner-search.yml','utf8'),timeout=+workflow.match(/timeout-minutes: (\d+)/)[1];assert.equal(timeout,330);for(let i=2;i<=5;i++){assert(workflow.includes('search'+i+':'));assert(workflow.includes('fromJSON(inputs.request).seconds > '+((i-1)*18000)));}assert(workflow.includes('search10:'));assert(workflow.includes('fromJSON(inputs.request).seconds > 162000'));assert(workflow.includes('runner-search-state-10'));
 assert(!/^concurrency:/m.test(workflow));for(let i=2;i<=34;i++){assert(workflow.includes('needs: search'+(i-1)));assert(workflow.includes('fromJSON(inputs.request).seconds > '+((i-1)*18000)));assert(workflow.includes('name: runner-search-state-'+i));}assert(workflow.includes('retention-days: 14'));
 for(let i=2;i<=34;i++){const block=workflow.split('  search'+i+':\n')[1].split(i===34?'  publish:':'  search'+(i+1)+':')[0];assert(block.includes('name: runner-search-state-'+(i-1)+'\n          path: _runner-prev'));assert(block.includes('name: runner-search-state-'+i+'\n          path: _runner-out/result.json'));}
 console.log('PASS 1440-minute local deadlines, 24-hour coordinator timers, 1–7-day independent Runner chaining, legacy results and job timeout headroom');
})().catch(e=>{console.error(e);process.exitCode=1;});
