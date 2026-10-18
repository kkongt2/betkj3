'use strict';
const assert=require('node:assert/strict');
const P=require('../search-policy'),T=require('../tuning-model'),W=require('../weight-search-engine'),J=require('../joint-search-engine'),H=require('../qpl-history-engine'),Parallel=require('../parallel-search'),Contract=require('../runner-search-contract'),Summary=require('../runner-search-panel');
const fitness={...P.defaults(),floor:1.05,worstFloor:1.05},settings={...T.settings(),min:2,max:10};
const events=(low,high=low)=>['20240101','20240401'].flatMap((date,q)=>Array.from({length:40},()=>({date,settled:true,ready:true,hit:true,payout:q?high:low})));
const stats=rows=>({total:rows.length,evaluated:rows.length,hits:rows.length,paidHits:rows.length,excluded:0,payoutTotal:rows.reduce((s,x)=>s+x.payout,0)});
const candidate=(rows,input=fitness)=>({settings:{...settings,fitness:input},all:stats(rows),metrics:H.metrics(stats(rows)),training:P.summarize(rows,input)});
const passing=candidate(events(1.05)),failing=candidate(events(.9,10)),unknown=candidate(events(2).slice(0,40));
assert(P.satisfies(passing.training));assert(!P.satisfies(failing.training));assert(!P.satisfies(unknown.training));
assert(P.satisfies(failing.training,P.defaults()),'legacy soft criterion does not become a hard floor');
assert(P.satisfies(candidate(events(1.049)).training)===false);assert(Math.abs(passing.training.penalty-1)<1e-12);
for(const bad of [null,-.01,2.01,NaN,'1.05',1.055])assert.throws(()=>P.config({...fitness,worstFloor:bad}));
assert.deepEqual(P.config({...P.defaults(),worstFloor:0}),P.defaults());assert.deepEqual(P.config(P.defaults()),P.defaults());
assert(Number.isFinite(P.guidance(failing.all,failing.training,'product')),'below-floor candidates still give exploration feedback');
assert.deepEqual(P.pool([failing,unknown,passing]),[passing]);
const merged=Parallel.merge([{best:failing,pool:[failing],count:1},{best:passing,pool:[passing],count:1}],{objective:'product',fitness});
assert.deepEqual(merged.best,passing);assert.deepEqual(merged.pool,[passing]);
const empty=Parallel.merge([{best:failing,pool:[failing,unknown],count:1}],{objective:'product',fitness});assert.equal(empty.best,null);assert.deepEqual(empty.pool,[]);
function packedRows(low,high=low){return events(low,high).map((p,i)=>{
 const horses=Array.from({length:8},(_,j)=>[j+1,.375,1,[],null,null,T.FEATURES.map(()=>.5),{starts:5,available:T.FEATURES.map(()=>true)}]);
 const pairs=[],trios=[];for(let a=1;a<=8;a++)for(let b=a+1;b<=8;b++){pairs.push([a,b,.1]);for(let c=b+1;c<=8;c++)trios.push({numbers:[a,b,c],odds:p.payout});}
 return {venue:'seoul',date:p.date,race:i+1,k:3,models:{place:'test',pair:'test'},distance:1400,grade:'국4등급',horses,pairs,starters:horses.map(h=>h[0]),settled:true,payouts:pairs.map(([a,b])=>({numbers:[a,b],odds:p.payout})),trioSettled:true,trioPayouts:trios};
});}
(async()=>{
 for(const method of ['local','de'])for(const kind of ['mixed','none','insufficient']){
  let clock=0;const evaluate=async cfg=>{const rows=kind==='insufficient'?events(2).slice(0,40):kind==='none'||cfg.weights[2]>50?events(.9,10):events(1.1);return {all:stats(rows),training:P.summarize(rows,cfg.fitness,cfg.searchObjective)};};
  const result=await W.run({settings:{...settings,weights:T.FEATURES.map((_,i)=>i===2?100:0)},method,fitness,objective:'product',seconds:1,balanced:false,searchSeed:77},async cfg=>{clock+=100;return evaluate(cfg);},evaluate,{now:()=>clock,yieldTask:()=>Promise.resolve()});
  if(kind==='mixed'){assert(result.best);assert(P.satisfies(result.best.training,fitness));assert(result.pool.every(c=>P.satisfies(c.training,fitness)));}else{assert.equal(result.best,null);assert.deepEqual(result.pool,[]);}
 }
 let goodResult;
 for(const method of ['local','de'])for(const kind of ['pass','fail','insufficient']){
  const rows=kind==='pass'?packedRows(1.05):kind==='fail'?packedRows(.9,10):packedRows(2).slice(0,40);let steps=0;
  const result=await J.create(rows,()=>Promise.resolve()).run({settings:{...settings,betStrategy:'hybrid',hybridRanks:[3,4]},method,fitness,seconds:30,target:50,minHitRate:0,balanced:false,from:'20240101',to:'20241231'},H.create(rows).evaluate,{stopped:()=>steps>=8,progress:p=>steps=p.count});
  if(kind==='pass'){assert(result.best);assert(P.satisfies(result.best.training,fitness));assert(result.pool.every(c=>P.satisfies(c.training,fitness)));goodResult=result;}else{assert.equal(result.best,null);assert.deepEqual(result.pool,[]);}
 }
 await assert.rejects(Parallel.verify({best:failing},{joint:false,fitness,minHitRate:0},async()=>({all:failing.all,training:failing.training}),()=>true),/안정성/);
 const request={schema:1,requestId:'worst-floor',seconds:30,method:'de',objective:'product',joint:true,target:50,minHitRate:0,balanced:false,parallel:false,fitness,settings:{...settings,betStrategy:'hybrid',hybridRanks:[3,4]}};
 assert.equal(Contract.request(request).fitness.worstFloor,1.05);
 const report={schema:1,modelVersion:T.VERSION,featureCount:T.FEATURES.length,runId:'123-1',from:'20240101',to:'20241231',finishedAt:'2026-10-19T00:00:00Z',request,result:{...goodResult,workers:1}};
 const valid=Contract.report(structuredClone(report));assert(P.satisfies(valid.result.best.training,fitness));
 for(const pool of [false,true]){
  const broken=structuredClone(report),training=pool?broken.result.pool[0].training:broken.result.best.training;
  training.quarters[0].all.payoutTotal=training.quarters[0].all.evaluated*.9;training.worst=999;
  assert.throws(()=>Contract.report(broken),'report validation recalculates worst and rejects a failing winner or pool candidate');
 }
 const s=Summary.summarize(report);assert.equal(s.request.fitness.worstFloor,1.05);assert(Summary.label(s).includes('Worst 필수 1.05배'));assert(Summary.preview(s).includes('1.05배 이상 · 표본 부족 제외'));assert.deepEqual(Summary.summarize(s),s);
 const noCandidate=structuredClone(report);noCandidate.result.best=null;noCandidate.result.pool=[];assert(Summary.preview(Summary.summarize(noCandidate)).includes('1.05배 이상'));
 console.log('PASS Worst quarter hard floor: inclusive boundary, insufficient-quarter rejection, soft-only legacy compatibility, DE/local all/joint eligibility, no-candidate results, pool/parallel/verification enforcement, validated Runner reports and option summaries');
})().catch(e=>{console.error(e);process.exitCode=1;});
