'use strict';
const assert=require('node:assert/strict');
const S=require('../race-selection-model'),T=require('../tuning-model'),M=require('../model'),P=require('../qpl-policy'),J=require('../joint-search-engine'),H=require('../qpl-history-engine'),Contract=require('../runner-search-contract');
const weights=T.FEATURES.map((_,i)=>i===2?100:0);
const support=()=>({starts:5,available:T.FEATURES.map(()=>true),detail:{version:'last5-detail-v1',restDays:28,recent:[{date:'20260601',finish:6,fieldSize:10},{date:'20260701',finish:4,fieldSize:10},{date:'20260801',finish:2,fieldSize:10}]}});
const horse=(number,score)=>({number,name:String(number),weighted_v3_features:T.FEATURES.map((_,i)=>i===2?score:.5),weighted_v3_support:support()});
const field=Array.from({length:10},(_,i)=>horse(i+1,.9-i*.07));
const context={grade:'국4등급',distance:1400};
const features=(f=field,selected=[1,2],anchor=1,c=context)=>S.selectionFeatures(f,weights,selected,anchor,c);
const f=features();assert.equal(f.length,8);assert(f.every(x=>Number.isFinite(x)&&x>=0&&x<=1));
assert.equal(f[3],0);assert.equal(features(field.slice(0,6))[3],.4);
assert.equal(features([...field,horse(11,.15),horse(12,.1),horse(13,.08),horse(14,.05)])[3],.4);
assert.equal(f[4],1);assert.equal(f[5],0);assert.equal(f[7],1);
assert(Math.abs(f[6]-(.5+2/9))<1e-12,'recent three form slope, independent of field sizes');
assert.equal(features(field,[1],1)[1],.5,'place-single has no invented partner');
const stronger=structuredClone(field);stronger[2].weighted_v3_features[2]=.86;
assert(features(stronger)[1]<f[1],'unbought strongest rival directly reduces partner separation');
assert(Math.abs(features(field,[1,2,3,4])[1]-.71)<1e-12,'box weakest bought horse compared with strongest unbought horse');
const unknown=structuredClone(field);unknown.forEach(h=>delete h.weighted_v3_support);
assert.equal(features(unknown)[4],0);assert.equal(features(unknown)[5],1);
assert(S.jointScore(features(unknown),S.DEFAULT_COEFFICIENTS)<S.jointScore(f,S.DEFAULT_COEFFICIENTS));
const risk=structuredClone(field);risk[4].weighted_v3_support.starts=3;risk[5].weighted_v3_support.detail.restDays=180;
assert.equal(features(risk)[5],2/6);
assert.equal(features(field,[1,2],1,{grade:'국6등급',distance:1200})[7],0);
assert.equal(features(field,[1,2],1,{})[7],.5);
const uniform=field.map(h=>({...h,weighted_v3_features:weights.map(()=>.5)}));
for(const n of [6,10])assert(Math.abs(features(uniform.slice(0,n))[2]-.5)<1e-12,'concentration removes field-size baseline');
assert.equal(S.recentTrend({}),.5);assert.equal(S.recentTrend({detail:{recent:support().detail.recent.slice(1)}}),.5);
const v2={version:S.JOINT_VERSION,coefficients:S.DEFAULT_COEFFICIENTS.slice(),threshold:50,target:50};
for(const [i,value] of [[3,1],[4,-1],[5,1]]){const bad=structuredClone(v2);bad.coefficients[i]=value;assert.equal(S.jointConfig(bad),null);}
for(const c of J.profiles())assert(S.jointConfig({...v2,coefficients:c}));
let c=S.projectCoefficients(Array(8).fill(-10));const rng=require('../global-weight-search').rng(77);
for(let i=0;i<1200;i++){c=J.coefficientProposal(c,i,rng);assert(S.jointConfig({...v2,coefficients:c}));}
// Stable legacy oracle: old 12-input formula and old signed reliability weights remain valid.
const legacy={version:'joint-selection-v1',coefficients:Array(12).fill(1),threshold:50,target:50};
const oldField=[horse(1,.9),horse(2,.8),horse(3,.6),horse(4,.5)];
const old=S.jointFeatures(oldField,weights,1,2,{},legacy.version);
const expected=[1,1,.5,0,1,1,1,1,.85,1,0,.5];
old.forEach((v,i)=>assert(Math.abs(v-expected[i])<1e-12));assert.equal(S.jointScore(old,legacy.coefficients),73);
assert(S.jointConfig({...legacy,coefficients:Array(12).fill(-4)}));assert.equal(S.labels(legacy.version).length,12);
const race={date:'20260901',venue:'seoul',race_no:1,...context,horses:field,official_result:{starters:field.map(h=>h.number),pair:{status:'confirmed',payouts:[{numbers:[1,2],odds:5},{numbers:[1,3],odds:6},{numbers:[2,3],odds:7}]}}};
const row=T.pack(M.analyze(race)),unpacked=T.unpack(row);
assert.equal(row.distance,1400);assert.equal(row.grade,'국4등급');
assert(!row.horses[0][7].detail.recent);assert.equal(row.horses[0][7].screening.restDays,28);
assert.equal(S.recentTrend(row.horses[0][7]),S.recentTrend(support()));
assert.deepEqual(S.selectionFeatures(unpacked.horses,weights,[1,2],1,unpacked),f,'live and compact archive preserve all eight inputs');
assert.deepEqual(T.pack(M.analyze(unpacked)).horses.map(h=>h[7]),row.horses.map(h=>h[7]),'packing compact metadata is idempotent');
const settings={...T.settings({weights}),min:2,max:10,screening:v2};
const live=P.apply(T.apply(M.analyze(race),settings),null,settings);
const before=S.score(live,settings);live.official_result={pair:{payouts:[{numbers:[9,10],odds:9999}]}};
assert.deepEqual(S.score(live,settings),before,'no actual outcome or payout enters screening');
(async()=>{
 if(process.argv.includes('--archive')){
  const fs=require('node:fs'),manifest=JSON.parse(fs.readFileSync('qpl-history.json'));
  for(const shard of manifest.shards)for(const r of JSON.parse(fs.readFileSync(shard.url)).rows){
   assert(Number.isFinite(r.distance)&&r.distance>0,'archive retains pre-race distance');
   for(const h of r.horses){assert(Number.isFinite(h[7]?.screening?.recentTrend),'archive retains recent-three trend');assert(!h[7]?.through||h[7].through<r.date,'history must precede race day');}
  }
 }
 const rows=Array.from({length:12},(_,i)=>({...row,race:i+1}));
 for(const screening of [v2,legacy]){
  const cfg={...settings,screening},points=await J.create(rows).evaluate(cfg,'20230101','20261231');
  const result=P.apply(T.apply(T.unpack(row),cfg),null,cfg);
  assert.equal(S.jointScore(points[0].features,screening.coefficients),S.score(result,cfg).score,'fast replay honors both model versions');
 }
 let steps=0;
 const out=await J.create(rows,()=>Promise.resolve()).run({settings:{...settings,screening:legacy},seedCandidates:[{settings:{...settings,screening:legacy}}],seconds:30,target:50,minHitRate:0,balanced:false,from:'20230101',to:'20261231'},H.create(rows).evaluate,{stopped:()=>steps>=1,progress:p=>steps=p.count});
 assert(out.best);assert.equal(out.best.settings.screening.version,S.JOINT_VERSION);assert.equal(out.best.settings.screening.coefficients.length,8,'v1 warm starts never reinterpret legacy coefficients');
 const request={schema:1,requestId:'screen-v2',seconds:30,method:'local',objective:'product',joint:true,balanced:false,parallel:false,target:50,minHitRate:0,settings};
 const report={schema:1,modelVersion:T.VERSION,featureCount:T.FEATURES.length,runId:'123-1',from:'20230101',to:'20261231',finishedAt:'2026-10-18T12:00:00Z',request,result:{...out,workers:1}};
 assert.equal(Contract.report(structuredClone(report)).result.best.joint.modelLabels.length,8);
 const oldReport=structuredClone(report);oldReport.result.best.settings.screening=legacy;oldReport.result.best.joint.modelLabels=['untrusted'];
 assert.deepEqual(Contract.report(oldReport).result.best.joint.modelLabels,S.LEGACY_JOINT_LABELS,'old Runner labels match old coefficient positions');
 console.log('PASS screening v2: field sweet spot, rival boundary, quality sign constraints, uncertainty, prior-three trend, compact metadata, no payout leakage, v1 replay and v1 warm-start isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
