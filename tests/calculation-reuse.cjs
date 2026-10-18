'use strict';
const assert=require('node:assert/strict');
const M=require('../model'),T=require('../tuning-model'),H=require('../qpl-history-engine'),J=require('../joint-search-engine'),S=require('../race-selection-model'),P=require('../qpl-policy');
function race(n=10,index=0,starters){
 return {venue:'seoul',date:'20260913',race_no:index+1,distance:1400,grade:'국4등급',horses:Array.from({length:n},(_,i)=>({number:i+1,name:'말'+(i+1),weighted_v3_features:T.FEATURES.map((_,j)=>Math.max(0,Math.min(1,.85-i*.045+Math.sin(index+i+j)*.1))),weighted_v3_support:{starts:5,available:T.FEATURES.map(()=>true)}})),official_result:{starters:starters||Array.from({length:n},(_,i)=>i+1),place:{status:'confirmed',payouts:[{numbers:[1],odds:2},{numbers:[2],odds:3}]},pair:{status:'confirmed',payouts:[{numbers:[1,2],odds:4},{numbers:[1,3],odds:5},{numbers:[2,3],odds:6}]},trio:{status:'confirmed',payouts:[{numbers:[1,2,3],odds:12}]}}};
}
// Compare both markets with independent probability calls, including the change
// from three place slots to two after scratches. Large fields need one call only.
const originalProbs=M.probs,originalApply=T.apply;
for(const [n,starters] of [[3],[7],[8],[10],[14],[12,[1,3,4,5,7,8]]]){
 const base=M.analyze(race(n,0,starters)),calls=[];
 M.probs=(strengths,k)=>{calls.push({strengths:strengths.slice(),k});return originalProbs(strengths,k);};
 let actual;try{actual=T.apply(base,T.settings());}finally{M.probs=originalProbs;}
 const field=actual.horses.slice().sort((a,b)=>a.number-b.number),k=field.length<=7?2:3,ids=new Map(field.map((h,i)=>[h.number,i]));
 assert.equal(calls.length,k===3?1:2);assert.deepEqual(calls.map(x=>x.k),k===3?[3]:[3,2]);
 const place=originalProbs(calls[0].strengths,k),pair=originalProbs(calls[0].strengths,3);
 for(const p of actual.places)assert.equal(p.prob,place.p[ids.get(p.numbers[0])]);
 for(const p of actual.pairs){const indices=p.numbers.map(n=>ids.get(n)).sort((a,b)=>a-b);assert.equal(p.prob,pair.q[indices.join('-')]);}
}
const rows=Array.from({length:5},(_,i)=>T.pack(M.analyze(race(10,i))));
const cfg={...T.settings(),min:2,max:10,betStrategy:'hybrid',hybridRanks:[3,4]};
const history=H.create(rows),withAnalysis=history.evaluateRow(0,cfg,true);
assert(withAnalysis.analysis);assert(!('analysis' in history.evaluateRow(0,cfg,true)),'cached outcomes do not retain the large analyzed object');
assert(!('analysis' in H.create(rows).evaluateRow(0,cfg)),'public outcome shape stays unchanged');
(async()=>{
 for(const betStrategy of ['place-single','qpl-anchor2','trio-box3','trio-box3-2','trio-box4','hybrid']){
  const engine=J.create(rows,()=>Promise.resolve());
  for(const version of [S.JOINT_VERSION,S.LEGACY_JOINT_VERSION]){
   const settings={...cfg,betStrategy,screening:{version,coefficients:version===S.JOINT_VERSION?S.DEFAULT_COEFFICIENTS.slice():Array(12).fill(1),threshold:0,target:50}};
   for(let repeat=0;repeat<3;repeat++){
    if(repeat===2){settings.weights=settings.weights.slice();settings.weights[2]--;settings.weights[3]++;}
    let calls=0;T.apply=(...args)=>{calls++;return originalApply(...args);};
    let points;try{points=await engine.evaluate(settings,'20230101','20261231');}finally{T.apply=originalApply;}
    assert.equal(calls,rows.length,betStrategy+' computes at most one analysis per race, including cache hits and changed weights');
    const publicHistory=H.create(rows);
    for(let i=0;i<rows.length;i++){
     const base=T.apply(T.unpack(rows[i]),settings),result=P.apply(base,null,settings);result.allPairs=base.pairs;
     const outcome=publicHistory.evaluateRow(i,settings);
     assert.deepEqual(points[i].features,S.strategyFeatures(result,settings),betStrategy+' exact features');
     assert.equal(points[i].hit,outcome.hit);assert.equal(points[i].payout,outcome.payout);
    }
   }
  }
 }
 const a=await H.create(rows).evaluate({...cfg,includeScreening:true},'20230101','20261231');
 assert(a.all.evaluated);assert(!JSON.stringify(a).includes('"analysis"'),'internal analysis never leaks into persisted reports');
 console.log('PASS single top-three probability calculation, two-slot/scratched races, one analysis per joint-search race, cache-hit fallback, changed weights, all multi-purchase modes, v1/v2 exact parity and unchanged public reports');
})().catch(e=>{console.error(e);process.exitCode=1});
