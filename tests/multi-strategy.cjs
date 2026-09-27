'use strict';
const assert=require('node:assert/strict'),T=require('../tuning-model.js'),H=require('../qpl-history-engine.js'),C=require('../weight-curve-engine.js'),S=require('../race-selection-model.js'),J=require('../joint-search-engine.js'),P=require('../qpl-policy.js'),Presets=require('../strategy-presets.js'),Runner=require('../runner-search-contract.js');
const horses=Array.from({length:8},(_,i)=>[i+1,.3,1,[],null,null,Array(21).fill(1-i/10),{starts:5,available:Array(21).fill(true)}]);
const row={venue:'seoul',date:'20250101',race:1,k:3,models:{pair:'fixture',place:'fixture'},horses,pairs:horses.flatMap((a,i)=>horses.slice(i+1).map(b=>[a[0],b[0],.1])),starters:horses.map(h=>h[0]),settled:true,payouts:[{numbers:[1,2],odds:2},{numbers:[1,3],odds:4},{numbers:[2,3],odds:3}],trioSettled:true,trioPayouts:[{numbers:[1,2,3],odds:3}]};
(async()=>{
 for(const [betStrategy,expected] of [['qpl-single',2],['qpl-anchor2',3],['trio-box4',.75]]){
  const cfg={...T.settings({betStrategy}),min:2,max:8,includeScreening:true},h=H.create([row]);
  const g=await h.evaluate(cfg,'20220101','20261231');assert.equal(g.all.payoutTotal,expected);assert.equal(g.screening.points[0].product,expected);assert.equal(g.screening.points[0].hits,1);assert.equal(g.screening.points[100].evaluated,0);
  const fast=await C.create([row]).evaluate(cfg,'20220101','20261231');assert.equal(fast.metrics.product,expected);
  const curve=await C.create([row]).curve(cfg,0,'20220101','20261231');assert.equal(curve.points[22].product,expected);
  const base=T.apply(T.unpack(row),cfg),live=P.apply(base,null,cfg);live.allPairs=base.pairs;
  assert(S.score(live,cfg).available);
  const joint=await J.create([row]).evaluate(cfg,'20220101','20261231');assert.equal(joint[0].payout,expected);
  const jc={...cfg,screening:{version:S.JOINT_VERSION,coefficients:Array(12).fill(1),threshold:0,target:40}};
  const jg=await h.evaluate(jc,'20220101','20261231');assert.equal(S.jointScore(joint[0].features,jc.screening.coefficients),S.score(live,jc).score);assert.equal(jg.fixedSelection.metrics.product,expected);
  assert.equal(Presets.config(cfg).betStrategy,betStrategy);
  assert.equal(Runner.request({schema:1,requestId:'test',seconds:60,method:'local',objective:'product',joint:false,balanced:true,parallel:false,target:40,settings:cfg}).settings.betStrategy,betStrategy);
 }
 const cfg={...T.settings({betStrategy:'trio-box4'}),min:20,max:20,includeScreening:true};
 assert.equal((await H.create([row]).evaluate(cfg,'20220101','20261231')).all.evaluated,1,'trio ignores partner range');
 const missing={...row,trioSettled:false,trioPayouts:[]};assert.equal((await H.create([missing]).evaluate(cfg,'20220101','20261231')).all.evaluated,0);
 const miss={...row,trioPayouts:[{numbers:[5,6,7],odds:10}]};assert.equal((await H.create([miss]).evaluate(cfg,'20220101','20261231')).screening.points[0].product,0);
 const cfg2={...T.settings({betStrategy:'qpl-anchor2'}),min:2,max:2,includeScreening:true};assert.equal((await H.create([row]).evaluate(cfg2,'20220101','20261231')).screening.eligible,0);
 const unknown={...row,trioPayouts:[{numbers:[1,2,3],odds:null}]};const unknownResult=await H.create([unknown]).evaluate(cfg,'20220101','20261231');assert.equal(unknownResult.all.hits,1);assert.equal(unknownResult.screening.points[0].product,null);
 const deadHeat={...row,trioPayouts:[{numbers:[1,2,3],odds:3},{numbers:[1,2,4],odds:5}]};assert.equal((await H.create([deadHeat]).evaluate(cfg,'20220101','20261231')).all.payoutTotal,2);
 console.log('PASS all purchase modes: aggregate payout, screening, weight curves, joint/live parity, persistence, Runner, missing payouts and dead heats');
})().catch(e=>{console.error(e);process.exitCode=1;});
