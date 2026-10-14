'use strict';
const assert=require('node:assert/strict'),T=require('../tuning-model'),B=require('../weight-balance'),G=require('../global-weight-search'),W=require('../weight-search-engine'),R=require('../runner-search-contract'),P=require('../parallel-search');
assert.equal(T.ACTIVE.length,21);assert.equal(T.FEATURES.length,26);
const old=Array(22).fill(0);old[0]=30;old[1]=10;old[8]=20;old[16]=25;old[20]=15;
const migrated=T.settings({weights:old}).weights;
assert.equal(migrated[4],65);assert.equal(migrated[9],20);assert.equal(migrated[17],15);
assert(T.RETIRED.every(i=>migrated[i]===0));assert(migrated.slice(22).every(x=>x===0));
assert.deepEqual(T.settings({weights:migrated}).weights,migrated);
assert.equal(T.defaults().reduce((a,b)=>a+b),100);
for(const balanced of [false,true]){
 const search=G.create({balanced,seeds:[old],random:G.rng(12)});
 for(let i=0;i<120;i++){const w=search.ask();assert(w);assert(T.RETIRED.every(j=>w[j]===0));assert.equal(w.reduce((a,b)=>a+b),100);if(balanced)assert(B.valid(w));search.tell(w[23]);}
}
assert(B.valid(B.project(migrated)));assert.deepEqual(B.project(B.project(migrated)),B.project(migrated));
assert(B.summary(B.project(migrated)).groups.every(g=>g.weight<=g.max));
const legacy={schema:1,modelVersion:'user-weighted-seoul-trainer22-v1',featureCount:22,runId:'123',from:'20230101',to:'20261231',finishedAt:'2026-10-14T00:00:00Z',
 request:{schema:1,requestId:'legacy',seconds:60,method:'local',objective:'product',joint:false,balanced:false,parallel:false,target:40,settings:{modelMode:'custom',weights:old,anchorRank:1,min:2,max:4}},
 result:{count:1,elapsed:1,workers:1,best:{settings:{modelMode:'custom',weights:old,anchorRank:1,min:2,max:4},all:{total:10,evaluated:10,excluded:0,hits:2,paidHits:2,payoutTotal:8}}}};
const report=R.report(legacy);assert(report.migrated);assert.deepEqual(report.result.best.settings.weights,migrated);
(async()=>{
 const all={total:10,evaluated:10,excluded:0,hits:1,paidHits:1,payoutTotal:3};
 const out=await P.verify(report.result,{joint:false,migrated:true,minHitRate:15},async()=>({all}),()=>true);
 assert(Math.abs(out.best.metrics.product-.3)<1e-12);assert(out.best.migrated);
 let time=0;
 await W.run({settings:{...T.settings(),min:2,max:3},balanced:false,seconds:1,objective:'product'},async cfg=>{time+=100;assert(T.RETIRED.every(i=>cfg.weights[i]===0));return {all};},async()=>({all}),{now:()=>time});
 console.log('PASS 21 active dimensions, idempotent migration, group caps, retired-free DE/local search and legacy Runner recomputation');
})().catch(e=>{console.error(e);process.exitCode=1;});
