'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const P=require('../search-policy'),T=require('../tuning-model'),W=require('../weight-search-engine'),G=require('../global-weight-search'),H=require('../qpl-history-engine'),C=require('../weight-curve-engine'),Parallel=require('../parallel-search'),Contract=require('../runner-search-contract');
const fitness=P.defaults(),settings={...T.settings(),min:2,max:10},pure=i=>T.FEATURES.map((_,j)=>j===i?100:0);
const fixture=jackpot=>['20240101','20240401'].flatMap((date,q)=>Array.from({length:60},(_,i)=>({date,settled:true,ready:true,hit:jackpot?i<12||q===0&&i===12:i<20,payout:jackpot?(q===0&&i===12?20000:i<12?2:null):(i<20?4:null)})));
const summary=rows=>{const all={total:rows.length,evaluated:rows.length,hits:0,paidHits:0,payoutTotal:0,excluded:0};for(const p of rows)if(p.hit){all.hits++;all.paidHits++;all.payoutTotal+=p.payout;}return all;};
(async()=>{
 const a=fixture(true),b=fixture(false),at=P.summarize(a,fitness),bt=P.summarize(b,fitness);
 assert(summary(a).payoutTotal>summary(b).payoutTotal);assert(at.score<bt.score);assert.equal(at.worst,.4);assert(Math.abs(at.penalty-.4/.65)<1e-12);
 assert.equal(at.capped.payoutTotal,108);assert.equal(summary(a).payoutTotal,20048,'official returns must never be capped');
 assert.deepEqual(P.validate(structuredClone(at)),at);
 const short=P.summarize(a.slice(0,20),fitness);assert.equal(short.worst,null);assert.equal(short.penalty,1);
 const many=['2023','2024','2025'].flatMap(y=>[1,4,7,10].map(m=>({date:y+String(m).padStart(2,'0')+'01',settled:true,ready:true,hit:false,payout:null})));assert.equal(P.summarize(many,fitness).quarters.length,8);
 assert(Number.isFinite(P.guidance(summary(a),at,'product',30)));assert.equal(P.guidance({...summary(a),paidHits:1},at,'product'),-Infinity);
 for(const bad of [{...fitness,cap:0},{...fitness,cap:60.5},{...fitness,floor:NaN},{...fitness,quarters:4}])assert.throws(()=>P.config(bad));
 for(const robust of [false,true]){
  let clock=0;const rowsFor=c=>c.weights[2]>50?a:b;
  const evaluate=async c=>{const rows=rowsFor(c);return {all:summary(rows),...(c.fitness?{training:P.summarize(rows,c.fitness,c.searchObjective)}:{})};};
  const out=await W.run({settings:{...settings,weights:pure(2)},seconds:1,objective:'product',balanced:false,...(robust?{fitness}:{}),searchSeed:321},async c=>{clock+=100;return evaluate(c);},evaluate,{now:()=>clock,yieldTask:()=>Promise.resolve()});
  assert.equal(out.best.all.payoutTotal,robust?160:20048);assert(out.pool.length>1&&out.pool.length<=8);
 }
 const population=G.create({seeds:[T.defaults()],random:G.rng(987),surrogate:true});
 for(let i=0;i<240;i++){const w=population.ask();assert(w);assert(T.RETIRED.every(j=>w[j]===0));population.tell(100-w.reduce((s,x,j)=>s+(x-(j===2?100:0))**2,0)/1000);}
 assert(population.stats().surrogateProposals>0);assert(population.stats().restarts>0);
 const candidates=T.ACTIVE.slice(0,12).map((i,n)=>({settings:{...settings,weights:pure(i)},all:summary(b),metrics:{product:2-n/100},training:{score:2-n/100}})),pool=P.pool(candidates);
 assert.equal(pool.length,8);assert.equal(pool[0],candidates[0]);assert(pool.slice(4).every(c=>pool.filter(p=>p!==c).every(p=>P.distance(c.settings,p.settings)>=.30)));
 const rawA={settings,all:summary(a),metrics:H.metrics(summary(a)),training:at},rawB={settings:{...settings,weights:pure(3)},all:summary(b),metrics:H.metrics(summary(b)),training:bt};
 assert.equal(Parallel.merge([{best:rawA,count:1},{best:rawB,count:1}],{objective:'product',fitness}).best.all.payoutTotal,160);
 const request={schema:1,requestId:'robust-test',seconds:1,method:'de',objective:'product',parallel:false,balanced:false,joint:false,target:50,settings,fitness};
 assert.deepEqual(Contract.request(request).fitness,fitness);assert(!('fitness' in Contract.request({...request,fitness:undefined})));
 const manifest=JSON.parse(fs.readFileSync('qpl-history.json')),rows=manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows.slice(0,70));
 for(const betStrategy of ['qpl-single','trio-box3','hybrid']){
  const cfg={...settings,betStrategy,fitness},exact=await H.create(rows).evaluate(cfg,'20230101','20261231'),fast=await C.create(rows).evaluate(cfg,'20230101','20261231');
  assert.deepEqual(fast.all,exact.all);assert.deepEqual(fast.training,exact.training);
  const plain=await H.create(rows).evaluate({...cfg,fitness:undefined},'20230101','20261231');assert.deepEqual(plain.all,exact.all);
 }
 console.log('PASS jackpot resistance, recent-quarter penalty, honest official payouts, smooth guidance, diverse pools, robust ranking, compatibility and exact/fast parity for QPL/trio/hybrid');
})().catch(e=>{console.error(e);process.exitCode=1;});
