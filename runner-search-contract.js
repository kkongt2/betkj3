'use strict';
const RunnerSearchContract=(()=>{
 const T=typeof module!=='undefined'?require('./tuning-model.js'):TuningModel;
 const S=typeof module!=='undefined'?require('./race-selection-model.js'):RaceSelectionModel;
 const H=typeof module!=='undefined'?require('./qpl-history-engine.js'):QplHistoryEngine;
 const P=typeof module!=='undefined'?require('./search-policy.js'):SearchPolicy;
 const MAX_RUNNER_SECONDS=604800;
 const fail=()=>{throw Error('Runner 탐색 자료 형식 또는 범위를 확인해 주세요.');};
 function settings(s){
  if(!s||!T.validWeights(s.weights)||![22,T.FEATURES.length].includes(s.weights.length)||![1,2,3].includes(s.anchorRank)||![s.min,s.max].every(x=>Number.isInteger(x)&&x>=2&&x<=20)||s.min>s.max)fail();
  if(s.hybridRanks!==undefined&&!T.validHybridRanks(s.hybridRanks))fail();
  if(s.screening&&!S.jointConfig(s.screening))fail();
  if(s.betStrategy!==undefined&&!['place-single','qpl-single','qpl-anchor2','trio-box4','trio-box3','hybrid'].includes(s.betStrategy))fail();
  return {...T.settings(s),anchorRank:s.anchorRank,min:s.min,max:s.max};
 }
 function request(x){
  if(!x||x.schema!==1||typeof x.requestId!=='string'||!/^[-a-zA-Z0-9]{1,64}$/.test(x.requestId))fail();
  if(!Number.isInteger(x.seconds)||x.seconds<1||x.seconds>MAX_RUNNER_SECONDS||!['local','de'].includes(x.method)||!['rate','average','product'].includes(x.objective)||typeof x.joint!=='boolean'||typeof x.balanced!=='boolean'||typeof x.parallel!=='boolean'||!S.JOINT_TARGETS.includes(x.target))fail();
  const minHitRate=x.minHitRate===undefined?15:x.minHitRate;
  if(!Number.isFinite(minHitRate)||minHitRate<0||minHitRate>100||Math.abs(minHitRate*10-Math.round(minHitRate*10))>1e-8)fail();
  const fitness=P.config(x.fitness);
  return {schema:1,...(fitness?{fitness}:{}),minHitRate,requestId:x.requestId,seconds:x.seconds,method:x.method,objective:x.joint?'product':x.objective,joint:x.joint,balanced:x.balanced,parallel:x.parallel,target:x.target,settings:settings(x.settings)};
 }
 function stats(g){
  if(!g||!['total','evaluated','hits','paidHits','excluded'].every(k=>Number.isSafeInteger(g[k])&&g[k]>=0)||!Number.isFinite(g.payoutTotal)||g.payoutTotal<0||g.evaluated>g.total||g.hits>g.evaluated||g.paidHits>g.hits||g.excluded!==g.total-g.evaluated)fail();
  if(g.searchScore!==undefined&&(!Number.isFinite(g.searchScore)||g.searchScore<0))fail();
  return {...g,...H.metrics(g),ratio:g.total?g.evaluated/g.total:null};
 }
 function report(x){
  const migrated=x?.modelVersion==='user-weighted-seoul-trainer22-v1'&&x?.featureCount===22;
  if(!x||x.schema!==1||(!migrated&&(x.modelVersion!==T.VERSION||x.featureCount!==T.FEATURES.length))||!/^\d+(?:-\d+)?$/.test(x.runId)||!/^\d{8}$/.test(x.from)||!/^\d{8}$/.test(x.to)||!Number.isFinite(Date.parse(x.finishedAt)))fail();
  x.request=request(x.request);const r=x.result;
  if(!r||!Number.isSafeInteger(r.count)||r.count<0||!Number.isFinite(r.elapsed)||r.elapsed<0||r.elapsed>x.request.seconds||!Number.isInteger(r.workers)||r.workers<1||r.workers>8)fail();
  r.method=x.request.method;r.objective=x.request.objective;
  if(r.best){const b=r.best;b.settings=settings(b.settings);b.all=stats(b.all);b.metrics=H.metrics(b.all);
   if(x.request.fitness){b.training=P.validate(b.training,x.request.objective);if(JSON.stringify(b.training.settings)!==JSON.stringify(x.request.fitness))fail();for(const k of ['total','evaluated','hits','paidHits','excluded'])if(b.training.capped[k]!==b.all[k])fail();}else delete b.training;
   if(!b.all.evaluated||b.all.hits!==b.all.paidHits||b.all.hits*1000<b.all.evaluated*Math.round(x.request.minHitRate*10))fail();
   if(b.comparison){b.comparison.all=stats(b.comparison.all);b.comparison.metrics=H.metrics(b.comparison.all);}
   if(x.request.joint){const j=b.joint;if(!j||j.target!==x.request.target||!b.settings.screening||!Array.isArray(j.ratios)||![3,4].includes(j.ratios.length)||!Array.isArray(j.validation?.folds)||j.validation.folds.length>50)fail();
    // Old reports contain only 40/60/80. Keep them readable without inventing a 50% result.
    const ratioTargets=j.ratios.map(r=>r?.target).sort((a,b)=>a-b).join(',');
    if(!['40,60,80',S.JOINT_TARGETS.join(',')].includes(ratioTargets)||!j.ratios.some(r=>r.target===x.request.target))fail();
    j.modelLabels=S.labels(b.settings.screening.version);j.method=x.request.method;
    j.ratios=j.ratios.map(r=>{if(!S.JOINT_TARGETS.includes(r.target))fail();return r.product===null?{target:r.target,product:null,ratio:null}:{target:r.target,...stats(r)};});
    if(j.fixed){const v=j.fixed;if(!/^\d{8}$/.test(v.from)||!/^\d{8}$/.test(v.to)||!Array.isArray(v.years)||v.years.length>50)fail();
     v.all=stats(v.all);v.metrics=S.metrics(v.all);const seen=new Set();v.years=v.years.map(f=>{if(!/^\d{4}$/.test(f.year)||seen.has(f.year))fail();seen.add(f.year);const all=stats(f.all);return {year:f.year,all,metrics:S.metrics(all)};});
     for(const k of ['total','evaluated','hits','paidHits','excluded','payoutTotal'])if(Math.abs(v.years.reduce((n,f)=>n+f.all[k],0)-v.all[k])>1e-7)fail();
    }
    j.validation.all=stats(j.validation.all);j.validation.metrics=H.metrics(j.validation.all);
    j.validation.folds=j.validation.folds.map(f=>{if(!/^\d{4}$/.test(f.year))fail();return {year:f.year,train:stats(f.train),test:stats(f.test),settings:settings(f.settings)};});
   }else delete b.joint;
  }
  if(r.pool!==undefined){if(!Array.isArray(r.pool)||r.pool.length>8)fail();r.pool=r.pool.map(c=>{const out={settings:settings(c.settings),all:stats(c.all)};out.metrics=H.metrics(out.all);if(!out.all.evaluated||out.all.hits!==out.all.paidHits||out.all.hits*1000<out.all.evaluated*Math.round(x.request.minHitRate*10))fail();if(x.request.fitness){out.training=P.validate(c.training,x.request.objective);if(JSON.stringify(out.training.settings)!==JSON.stringify(x.request.fitness))fail();for(const k of ['total','evaluated','hits','paidHits','excluded'])if(out.training.capped[k]!==out.all[k])fail();}return out;});}
  if(migrated){x.migrated=true;x.request.joint=false;delete x.request.settings.screening;if(r.best){delete r.best.settings.screening;delete r.best.joint;}}
  return x;
 }
 return {request,report,MAX_RUNNER_SECONDS};
})();
if(typeof module!=='undefined')module.exports=RunnerSearchContract;
