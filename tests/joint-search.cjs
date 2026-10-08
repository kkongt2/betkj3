'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const J=require('../joint-search-engine.js'),S=require('../race-selection-model.js'),T=require('../tuning-model.js'),H=require('../qpl-history-engine.js'),P=require('../qpl-policy.js'),Presets=require('../strategy-presets.js');
const m=JSON.parse(fs.readFileSync('qpl-history.json'));
const rows=m.shards.filter(s=>s.url.includes('2023')||s.url.includes('2024')||s.url.includes('2025')).flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows.slice(0,240));
const settings={...T.settings(),min:2,max:10};
(async()=>{
 for(const minHitRate of [0,100]){let count=0;const out=await J.create(rows).run({settings,seconds:30,target:60,balanced:false,minHitRate,from:'20230101',to:'20251231'},H.create(rows).evaluate,{stopped:()=>count>=3,progress:p=>{count=p.count;}});if(minHitRate===0)assert(out.best);else assert.equal(out.best,null);}
 const e=J.create(rows),points=await e.evaluate(settings,'20230101','20251231');
 const coefficients=J.profiles()[1],screening={version:S.JOINT_VERSION,coefficients,threshold:50,target:50},cfg={...settings,screening};
 for(let i=0;i<rows.length;i+=17){const result=P.apply(T.apply(T.unpack(rows[i]),cfg),null,cfg),s=S.score(result,cfg);if(points[i].features)assert.equal(S.jointScore(points[i].features,coefficients),s.score);}
 const scored=points.map(p=>({...p,score:p.features?S.jointScore(p.features,coefficients):null}));
 const fit=J.calibrate(scored,60);assert(fit);assert(fit.all.evaluated>=Math.ceil(rows.length*.6));
 const exact=await H.create(rows).evaluate({...cfg,includeScreening:true},'20230101','20251231');
 for(const [k,v] of Object.entries(J.aggregate(scored,50)))assert(Math.abs(v-exact.screening.points[50][k])<1e-7,k);
 const result=P.apply(T.apply(T.unpack(rows[0]),cfg),null,cfg),before=S.score(result,cfg);result.official_result={pair:{payouts:[{numbers:[1,2],odds:9999}]}};assert.deepEqual(S.score(result,cfg),before,'score never reads payouts');
 const storage={v:null,getItem(){return this.v},setItem(k,v){this.v=v}};Presets.save(storage,'joint',cfg);assert.deepEqual(Presets.read(storage)[0].settings.screening,screening);
 // Fixed candidate budget: perturb only held-out outcomes and confirm training choices
 // stay identical. Date order, labels, payout amounts and selection are all checked.
 async function run(data){let count=0;return J.create(data).run({settings,seconds:30,target:60,balanced:false,from:'20230101',to:'20251231'},H.create(data).evaluate,{stopped:()=>count>=5,progress:p=>{count=p.count;}});}
 const a=await run(rows),changed=structuredClone(rows);for(const r of changed)if(r.date.startsWith('2025'))r.payouts=r.payouts.map(p=>({...p,odds:p.odds*2}));const b=await run(changed);
 assert(a.best?.joint.validation.folds.length===1);assert.deepEqual(a.best.joint.validation.folds[0].settings,b.best.joint.validation.folds[0].settings,'future outcomes cannot affect fold selection');
 assert.deepEqual(a.best.joint.validation.folds[0].train,b.best.joint.validation.folds[0].train);
 assert.equal(b.best.joint.validation.folds[0].test.payoutTotal,2*a.best.joint.validation.folds[0].test.payoutTotal);
 assert.equal(J.calibrate([{score:null,hit:false,payout:null}],40),null);
 assert.equal(S.jointConfig({...screening,coefficients:[NaN]}),null);
 // Run multiple complete alternating blocks on real history. Screen updates must
 // preserve horse weights; weight updates must preserve BOTH screening components.
 const sample=rows.filter((r,i)=>i%3===0),trace=[],opts={settings,method:'local',seconds:600,target:60,balanced:false,from:'20230101',to:'20251231'};
 let steps=0;
 const alternated=await J.create(sample,()=>Promise.resolve()).run(opts,H.create(sample).evaluate,{stopped:()=>steps>=150,progress:p=>{steps=p.count;},onStep:s=>trace.push(structuredClone(s))});
 const scopes=new Map();let screeningChanged=false,weightsChanged=false;
 for(const step of trace){
  const key=step.year+'-'+step.target,prior=scopes.get(key);scopes.set(key,step);
  if(!prior?.settings||!step.settings)continue;
  if(step.stage==='screening'){
   assert.deepEqual(step.settings.weights,prior.settings.weights,'screening block fixes horse weights');
   screeningChanged||=JSON.stringify(step.settings.screening.coefficients)!==JSON.stringify(prior.settings.screening.coefficients);
  }else if(step.stage==='weights'){
   assert.deepEqual(step.settings.screening,prior.settings.screening,'weight block fixes coefficients AND threshold');
   weightsChanged||=JSON.stringify(step.settings.weights)!==JSON.stringify(prior.settings.weights);
  }
 }
 assert(screeningChanged,'screening coefficients must actually evolve');assert(weightsChanged,'horse weights must actually evolve');
 assert(trace.some(s=>s.stage==='screening'&&s.round>=1),'repeat screening after a weight block');
 assert(trace.some(s=>s.settings&&!J.profiles().some(p=>JSON.stringify(p)===JSON.stringify(s.settings.screening.coefficients))),'go beyond twelve legacy profiles');
 assert.equal(alternated.best.joint.optimizer,'alternating-v1');
 assert(alternated.best.all.evaluated>=Math.ceil(sample.length*.6));assert(alternated.best.metrics.rate>=.15);
 // A resumed segment must evaluate the exact previous best, including its learned
 // coefficients and threshold, so a short continuation cannot discard that result.
 let resumedSteps=0;
 const resumed=await J.create(sample,()=>Promise.resolve()).run({...opts,settings:alternated.best.settings},H.create(sample).evaluate,{stopped:()=>resumedSteps>=1,progress:p=>{resumedSteps=p.count;}});
 assert(resumed.best.metrics.product>=alternated.best.metrics.product-1e-12);
 const rand=require('../global-weight-search.js').rng(44);
 let cs=Array(12).fill(10);
 for(let i=0;i<250;i++){cs=J.coefficientProposal(cs,i,rand);assert(S.jointConfig({...screening,coefficients:cs}));}
 assert.equal(await J.create(sample).run(opts,()=>{throw Error('cancelled');},{current:()=>false}),null);
 console.log('PASS repeated alternating blocks, both fixed-variable invariants, learned coefficients, coverage/hit floor, checkpoint seed, coefficient bounds and cancellation');
 console.log('PASS joint score/live parity, actual selected metrics, quantile ties, payout independence, persistence and chronological outcome isolation');
})().catch(e=>{console.error(e);process.exitCode=1});
