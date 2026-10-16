'use strict';
const assert=require('node:assert/strict'),T=require('../tuning-model.js'),H=require('../qpl-history-engine.js'),C=require('../weight-curve-engine.js'),S=require('../race-selection-model.js'),J=require('../joint-search-engine.js'),P=require('../qpl-policy.js'),Presets=require('../strategy-presets.js'),Runner=require('../runner-search-contract.js');
const horses=Array.from({length:8},(_,i)=>[i+1,.3,1,[],null,null,Array(21).fill(1-i/10),{starts:5,available:Array(21).fill(true)}]);
const row={venue:'seoul',date:'20250101',race:1,k:3,models:{pair:'fixture',place:'fixture'},horses,pairs:horses.flatMap((a,i)=>horses.slice(i+1).map(b=>[a[0],b[0],.1])),starters:horses.map(h=>h[0]),settled:true,payouts:[{numbers:[1,2],odds:2},{numbers:[1,3],odds:4},{numbers:[2,3],odds:3}],placeSettled:true,placePayouts:[{numbers:[1],odds:1.5},{numbers:[2],odds:2},{numbers:[3],odds:3}],trioSettled:true,trioPayouts:[{numbers:[1,2,3],odds:3}]};
(async()=>{
 for(const [betStrategy,expected] of [['place-single',1.5],['qpl-single',2],['qpl-anchor2',3],['trio-box4',.75],['trio-box3',1],['hybrid',2/3]]){
  const cfg={...T.settings({betStrategy}),min:2,max:8,includeScreening:true},h=H.create([row]);
  const g=await h.evaluate(cfg,'20230101','20261231');assert.equal(g.all.payoutTotal,expected);assert.equal(g.screening.points[0].product,expected);assert.equal(g.screening.points[0].hits,1);assert.equal(g.screening.points[100].evaluated,0);
  const fast=await C.create([row]).evaluate(cfg,'20230101','20261231');assert.equal(fast.metrics.product,expected);
  const curve=await C.create([row]).curve(cfg,4,'20230101','20261231');assert.equal(curve.points[22].product,expected);
  const base=T.apply(T.unpack(row),cfg),live=P.apply(base,null,cfg);live.allPairs=base.pairs;
  assert(S.score(live,cfg).available);
  const joint=await J.create([row]).evaluate(cfg,'20230101','20261231');assert.equal(joint[0].payout,expected);
  const jc={...cfg,screening:{version:S.JOINT_VERSION,coefficients:Array(12).fill(1),threshold:0,target:40}};
  const jg=await h.evaluate(jc,'20230101','20261231');assert.equal(S.jointScore(joint[0].features,jc.screening.coefficients),S.score(live,jc).score);assert(Math.abs(jg.fixedSelection.metrics.product-expected)<1e-8);
  assert.equal(Presets.config(cfg).betStrategy,betStrategy);
  assert.equal(Runner.request({schema:1,requestId:'test',seconds:60,method:'local',objective:'product',joint:false,balanced:true,parallel:false,target:40,settings:cfg}).settings.betStrategy,betStrategy);
  let count=0;
  const found=await J.create([row],()=>Promise.resolve()).run({settings:cfg,method:'de',target:40,seconds:60,from:'20230101',to:'20261231'},h.evaluate,{stopped:()=>count>=120,progress:p=>{count=p.count;}});
  assert.equal(found.best.metrics.product,expected);assert.equal(found.best.settings.betStrategy,betStrategy);
  assert.equal(found.best.joint.optimizer,'alternating-v1');assert(found.evolution.generations>0);
 }
 const place={...T.settings({betStrategy:'place-single'}),min:20,max:20,includeScreening:true};
 for(const [anchorRank,expected] of [[1,1.5],[2,2],[3,3]]){
  const result=await H.create([{...row,settled:false,payouts:[],trioSettled:false}]).evaluate({...place,anchorRank},'20230101','20261231');
  assert.equal(result.all.evaluated,1);assert.equal(result.all.payoutTotal,expected);
 }
 const missingPlace=await H.create([{...row,placeSettled:false}]).evaluate(place,'20230101','20261231');assert.equal(missingPlace.all.evaluated,0);
 const unknownPlace=await H.create([{...row,placePayouts:[{numbers:[1],odds:null}]}]).evaluate(place,'20230101','20261231');assert.equal(unknownPlace.all.hits,1);assert.equal(H.metrics(unknownPlace.all).product,null);
 const missPlace=await H.create([{...row,placePayouts:[{numbers:[8],odds:10}]}]).evaluate(place,'20230101','20261231');assert.equal(missPlace.all.evaluated,1);assert.equal(H.metrics(missPlace.all).product,0);
 const tie=T.placeSelection(T.unpack(row),place);assert.equal(tie.picks[0].numbers[0],1);
 const scratched=T.placeSelection(T.unpack({...row,starters:[2,3,4]}),place);assert.equal(scratched.picks[0].numbers[0],2);
 const packed=T.pack(T.unpack(row));assert.deepEqual(packed.placePayouts,row.placePayouts);assert.equal(packed.placeSettled,true);
 const cfg={...T.settings({betStrategy:'trio-box4'}),min:20,max:20,includeScreening:true};
 assert.equal((await H.create([row]).evaluate(cfg,'20230101','20261231')).all.evaluated,1,'trio ignores partner range');
 const missing={...row,trioSettled:false,trioPayouts:[]};assert.equal((await H.create([missing]).evaluate(cfg,'20230101','20261231')).all.evaluated,0);
 const miss={...row,trioPayouts:[{numbers:[5,6,7],odds:10}]};assert.equal((await H.create([miss]).evaluate(cfg,'20230101','20261231')).screening.points[0].product,0);
 const cfg2={...T.settings({betStrategy:'qpl-anchor2'}),min:2,max:2,includeScreening:true};assert.equal((await H.create([row]).evaluate(cfg2,'20230101','20261231')).screening.eligible,0);
 const unknown={...row,trioPayouts:[{numbers:[1,2,3],odds:null}]};const unknownResult=await H.create([unknown]).evaluate(cfg,'20230101','20261231');assert.equal(unknownResult.all.hits,1);assert.equal(unknownResult.screening.points[0].product,null);
 const deadHeat={...row,trioPayouts:[{numbers:[1,2,3],odds:3},{numbers:[1,2,4],odds:5}]};assert.equal((await H.create([deadHeat]).evaluate(cfg,'20230101','20261231')).all.payoutTotal,2);
 const anchored={...cfg,betStrategy:'trio-box3',anchorRank:3};
 const anchorEngine=H.create([row]);
 assert.deepEqual(anchorEngine.evaluateRow(0,anchored).candidates.map(x=>x.pick.numbers),[[1,2,3],[1,2,4],[1,3,4]]);
 for(const numbers of [[1,2,3],[1,2,4],[1,3,4],[2,3,4]]){
  const fixture={...row,trioPayouts:[{numbers,odds:12}]};
  const result=await H.create([fixture]).evaluate(anchored,'20230101','20261231');
  assert.equal(result.all.hits,numbers.includes(1)?1:0);
  assert.equal(result.all.payoutTotal,numbers.includes(1)?4:0);
 }
 assert.equal((await H.create([deadHeat]).evaluate(anchored,'20230101','20261231')).all.payoutTotal,8/3);
 assert.equal((await H.create([{...row,horses:horses.slice(0,3)}]).evaluate(anchored,'20230101','20261231')).all.evaluated,0);
 assert.equal((await H.create([missing]).evaluate(anchored,'20230101','20261231')).all.evaluated,0);
 assert.equal((await H.create([unknown]).evaluate(anchored,'20230101','20261231')).screening.points[0].product,null);
 const hybrid={...T.settings({betStrategy:'hybrid'}),anchorRank:3,min:20,max:20,includeScreening:true};
 const hybridRow={...row,trioPayouts:[{numbers:[1,2,4],odds:12}]};
 const he=H.create([hybridRow]);
 assert.deepEqual(he.evaluateRow(0,hybrid).candidates.map(c=>[c.pick.kind,c.pick.numbers]),[['pair',[1,2]],['trio',[1,2,4]],['trio',[1,2,5]]]);
 assert.equal(he.evaluateRow(0,hybrid).payout,14/3);
 assert.equal(H.create([hybridRow]).evaluateRow(0,{...hybrid,hybridRanks:[4]}).payout,7);
 assert.equal(H.create([hybridRow]).evaluateRow(0,{...hybrid,hybridRanks:[5,6]}).payout,2/3);
 assert.equal(H.create([{...hybridRow,payouts:[{numbers:[3,4],odds:2}]}]).evaluateRow(0,hybrid).payout,4,'trio-only hit');
 assert.equal(H.create([{...hybridRow,settled:false}]).evaluateRow(0,hybrid).settled,false);
 assert.equal(H.create([{...hybridRow,trioSettled:false}]).evaluateRow(0,hybrid).settled,false);
 assert.equal(H.create([{...hybridRow,trioPayouts:[{numbers:[1,2,4],odds:null}]}]).evaluateRow(0,hybrid).payout,null);
 assert.equal(H.create([{...hybridRow,horses:horses.slice(0,4)}]).evaluateRow(0,hybrid).ready,false);
 const h34={...hybrid,hybridRanks:[3,4]},sel34=H.create([hybridRow]).evaluateRow(0,h34);
 assert.deepEqual(sel34.candidates.map(c=>[c.pick.kind,c.pick.numbers]),[['pair',[1,2]],['trio',[1,2,3]],['trio',[1,2,4]]]);
 assert.equal(sel34.payout,14/3);assert.deepEqual(Presets.config(h34).hybridRanks,[3,4]);
 assert.deepEqual(Runner.request({schema:1,requestId:'hybrid34',seconds:60,method:'de',objective:'product',joint:false,balanced:true,parallel:true,target:40,settings:h34}).settings.hybridRanks,[3,4]);
 assert.equal(H.create([{...hybridRow,horses:horses.slice(0,4),starters:[1,2,3,4]}]).evaluateRow(0,h34).ready,true);
 const preset=Presets.config({...hybrid,hybridRanks:[4,6]});assert.deepEqual(preset.hybridRanks,[4,6]);
 const hybridBase=T.apply(T.unpack(hybridRow),hybrid),hybridLive=P.apply(hybridBase,null,hybrid);hybridLive.allPairs=hybridBase.pairs;
 assert.equal(S.strategyPairs(hybridLive,hybrid).length,7);
 console.log('PASS all purchase modes: aggregate payout, screening, weight curves, joint/live parity, persistence, Runner, missing payouts and dead heats');
})().catch(e=>{console.error(e);process.exitCode=1;});
