'use strict';
const JointSearchEngine=(()=>{
 const T=typeof module!=='undefined'?require('./tuning-model.js'):TuningModel;
 const S=typeof module!=='undefined'?require('./race-selection-model.js'):RaceSelectionModel;
 const C=typeof module!=='undefined'?require('./weight-curve-engine.js'):WeightCurveEngine;
 const H=typeof module!=='undefined'?require('./qpl-history-engine.js'):QplHistoryEngine;
 const B=typeof module!=='undefined'?require('./weight-balance.js'):WeightBalance;
 const G=typeof module!=='undefined'?require('./global-weight-search.js'):GlobalWeightSearch;
 const P=typeof module!=='undefined'?require('./search-policy.js'):SearchPolicy;
 const blank=()=>({total:0,evaluated:0,hits:0,paidHits:0,payoutTotal:0,excluded:0});
 const metric=g=>({...g,...H.metrics(g),ratio:g.total?g.evaluated/g.total:null});
 function add(g,p){g.evaluated++;if(p.hit){g.hits++;if(Number.isFinite(p.payout)&&p.payout>=0){g.paidHits++;g.payoutTotal+=p.payout;}}}
 function aggregate(items,threshold){const g=blank();g.total=items.length;for(const p of items)if(p.score!==null&&p.score>=threshold)add(g,p);g.excluded=g.total-g.evaluated;return g;}
 function calibrate(items,target){
  const bins=Array.from({length:100},blank);let eligible=0;
  for(const p of items)if(p.score!==null){eligible++;add(bins[p.score],p);}
  const needed=Math.ceil(items.length*target/100);if(!needed||eligible<needed)return null;
  const g=blank();g.total=items.length;
  for(let threshold=99;threshold>=0;threshold--){for(const k of ['evaluated','hits','paidHits','payoutTotal'])g[k]+=bins[threshold][k];if(g.evaluated>=needed){g.excluded=g.total-g.evaluated;return {threshold,all:g};}}
  return null;
 }
 function eligible(g,minHitRate=15){return g.evaluated>0&&g.hits===g.paidHits&&g.hits*1000>=g.evaluated*Math.round(minHitRate*10);}
 function better(a,b){return !b||P.value(a,'product')>P.value(b,'product')+1e-12||Math.abs(P.value(a,'product')-P.value(b,'product'))<=1e-12&&a.all.evaluated>b.all.evaluated;}
 function rng(seed){let x=seed>>>0;return ()=>{x=(Math.imul(1664525,x)+1013904223)>>>0;return x/4294967296;};}
 const normalize=w=>T.normalizeActive(w);
 // Legacy candidate proposals never depend on test outcomes. DE uses separate populations
 // for the descriptive full-period search and each fold; fold feedback uses training only. Current/saved user weights are
 // allowed in the descriptive full-period search only, not in walk-forward folds.
 function proposals(options,index,random){
  if(index===0&&!(options.island>0))return options.balanced?B.project(options.settings.weights):normalize(options.settings.weights);
  const base=T.defaults();
  if(index===1&&!(options.island>0))return options.balanced?B.project(base):normalize(base);
  if(index%3){for(let k=0;k<5;k++){const a=T.ACTIVE[Math.floor(random()*T.ACTIVE.length)],b=T.ACTIVE[Math.floor(random()*T.ACTIVE.length)],n=Math.min(base[a],1+Math.floor(random()*12));base[a]-=n;base[b]+=n;}}
  else for(let i=0;i<T.FEATURES.length;i++)base[i]=Math.pow(random(),2)*100;
  return options.balanced?B.project(base):normalize(base);
 }
 function profiles(){const random=rng(73021),out=[S.DEFAULT_COEFFICIENTS.slice(),[2,2,2,-2,2,-2,1,1],[-1,2,1,-1,3,-2,2,0]];
  for(let i=0;i<9;i++)out.push(S.projectCoefficients(S.JOINT_LABELS.map(()=>Math.round(random()*6)-3)));return out;
 }
 // Every mutation, restart and seed obeys the v2 coefficient bounds.
 function coefficientProposal(base,index,random){
  const out=S.projectCoefficients(base),n=out.length;
  if(index%101===100)for(let j=0;j<n;j++)out[j]=Math.round(random()*20)-10;
  else if(index%25===24)for(let k=0;k<3;k++){const j=Math.floor(random()*n);out[j]+=random()<.5?-2:2;}
  else {const j=Math.floor(index/2)%n;out[j]+=index%2?1:-1;}
  return S.projectCoefficients(out);
 }
 function weightProposal(base,index,random,balanced){
  const out=base.slice();
  if(index%8===7)for(let j=0;j<out.length;j++)out[j]=Math.pow(random(),2)*100;
  else {
   const from=out.map((x,i)=>x>0?i:-1).filter(i=>i>=0),a=from[Math.floor(random()*from.length)];
   const to=T.ACTIVE.filter(i=>i!==a),b=to[Math.floor(random()*to.length)];
   const amount=Math.min(out[a],[1,2,5,10][index%4]);out[a]-=amount;out[b]+=amount;
  }
  return balanced?B.project(normalize(out)):normalize(out);
 }
 function create(rows,yieldTask=()=>new Promise(r=>setTimeout(r,0))){
  const entries=rows.filter(r=>r.venue==='seoul').map(C.prepare),multiHistory=H.create(rows);
  async function evaluate(settings,from,to,current=()=>true){
   settings={...settings,...T.settings(settings)};
   const out=[],total=settings.weights.reduce((s,x)=>s+x,0);
   for(let i=0;i<entries.length;i++){
    if(i%96===95){await yieldTask();if(!current())return null;}
    const e=entries[i];if(e.row.date<from||e.row.date>to)continue;
    const p={date:e.row.date,features:null,hit:false,payout:null};out.push(p);
    if(settings.betStrategy!=='qpl-single'){
     const outcome=multiHistory.evaluateRow(i,settings);if(!outcome.ready||!outcome.settled)continue;
     const P=typeof module!=='undefined'?require('./qpl-policy.js'):Betkj3Policy,base=T.apply(T.unpack(e.row),settings),result=P.apply(base,null,settings);result.allPairs=base.pairs;
     p.features=S.strategyFeatures(result,settings);p.hit=outcome.hit;p.payout=outcome.payout;continue;
    }
    if(!e.valid||e.field.length<settings.min||e.field.length<settings.anchorRank)continue;
    const raw=e.features.map(f=>f.reduce((s,x,j)=>s+x*settings.weights[j],0));
    const pair=C.pick(e,settings,raw,total);if(!pair)continue;
    // Use the exact anchor tie-break on the rare rows delegated to the public model.
    const exact=e.slow||raw.some((x,j)=>raw.some((y,k)=>j!==k&&Math.abs(x-y)/total<1e-7));
    let anchor;
    if(exact){const P=typeof module!=='undefined'?require('./qpl-policy.js'):Betkj3Policy;anchor=P.apply(T.apply(T.unpack(e.row),settings),null,settings).qplPolicy.anchor?.number;}
    else anchor=e.numbers.map((_,j)=>j).sort((a,b)=>raw[b]-raw[a]||e.numbers[a]-e.numbers[b]).map(j=>e.numbers[j])[settings.anchorRank-1];
    const partner=pair.split('-').map(Number).find(n=>n!==anchor);
    p.features=S.jointFeatures(e.field.map(h=>({number:h[0],weighted_v3_features:h[6],weighted_v3_support:h[7]})),settings.weights,anchor,partner,e.row,settings.screening?.version||S.JOINT_VERSION);
    p.hit=e.winning.has(pair);p.payout=p.hit?e.winning.get(pair):null;
   }
   return current()?out:null;
  }
  async function run(options,verify,control={}){
   const fitness=P.config(options.fitness);
   const minHitRate=options.minHitRate===undefined?15:options.minHitRate;
   if(!Number.isFinite(minHitRate)||minHitRate<0||minHitRate>100||Math.abs(minHitRate*10-Math.round(minHitRate*10))>1e-8)throw Error('최저 적중률은 0~100% 범위에서 0.1% 단위로 입력하세요.');
   if(!S.JOINT_TARGETS.includes(options.target)||!Number.isInteger(options.seconds)||options.seconds<1||options.seconds>86400)throw Error('선택 비율과 탐색 시간을 확인해 주세요.');
   const current=control.current||(()=>true),stopped=control.stopped||(()=>false),progress=control.progress||(()=>{}),now=control.now||(()=>performance.now());
   const start=now(),years=[...new Set(entries.filter(e=>e.row.date>=options.from&&e.row.date<=options.to).map(e=>e.row.date.slice(0,4)))].sort().slice(1);
   const method=G.method(options.method),targets=S.JOINT_TARGETS,bestByTarget=new Map(),foldBest=new Map();
   const baseSettings={...T.settings(options.settings),min:options.settings.min,max:options.settings.max};delete baseSettings.screening;
   const saved=S.jointConfig(options.settings.screening),savedScreen=saved?.version===S.JOINT_VERSION?saved:null,initialProfiles=profiles();
   const seedCandidates=options.seedCandidates||[],seed=seedCandidates[(options.island||0)%Math.max(1,seedCandidates.length)];
   const project=w=>options.balanced?B.project(w):normalize(w);
   // Each coverage target and chronological fold owns its state and RNG. User
   // settings/checkpoints seed only the descriptive full-period search, never folds.
   const scopes=[...[options.target,...targets.filter(t=>t!==options.target)].map(target=>({year:null,target})),...years.map(year=>({year,target:options.target}))].map(s=>({
    ...s,random:rng((options.searchSeed??0)+(s.year?+s.year*7919:41821+s.target*97)),
    weights:project(s.year?T.defaults():seed?.settings.weights||baseSettings.weights),pool:[],phase:'initial',points:null,incumbent:null,
    coefficientIndex:0,weightIndex:0,weightSteps:0,rounds:0,search:null,completedGenerations:0,completedRestarts:0,completedSurrogate:0
   }));
   let count=0,cursor=0;
   const active=()=>current()&&!stopped()&&now()-start<options.seconds*1000;
   const evolution=()=>{if(method!=='de')return undefined;const s=scopes[0],v=s.search?.stats()||{population:0,populationSize:12,generations:0,restarts:0};return {...v,generations:v.generations+s.completedGenerations,restarts:v.restarts+s.completedRestarts,surrogateProposals:(v.surrogateProposals||0)+s.completedSurrogate};};
   const score=(points,coefficients)=>points.map(p=>({...p,score:p.features?S.jointScore(p.features,coefficients):null}));
   function candidate(scope,points,weights,coefficients,threshold){
    if(scope.year&&points.length<200)return null;
    if(!S.jointConfig({version:S.JOINT_VERSION,coefficients,threshold:threshold??0,target:scope.target}))return null;
    const scored=score(points,coefficients),fit=threshold===undefined?calibrate(scored,scope.target):{threshold,all:aggregate(scored,threshold)};
    if(!fit||!fit.all.evaluated||fit.all.evaluated<Math.ceil(fit.all.total*scope.target/100))return null;
    return {settings:{...baseSettings,...(fitness?{fitness,searchObjective:'product'}:{}),weights:weights.slice(),screening:{version:S.JOINT_VERSION,coefficients:coefficients.slice(),threshold:fit.threshold,target:scope.target}},all:fit.all,metrics:H.metrics(fit.all),...(fitness?{training:P.summarize(scored,fitness,'product',p=>p.score!==null&&p.score>=fit.threshold)}:{})};
   }
   function accept(scope,c,points){
    if(!c)return;
    const valid=eligible(c.all,minHitRate),old=scope.incumbent;
    // An ineligible seed can guide exploration until a qualifying candidate exists.
    if(!old||valid&&!eligible(old.all,minHitRate)||valid===eligible(old.all,minHitRate)&&better(c,old)){scope.incumbent=c;scope.weights=c.settings.weights;scope.points=points;}
    if(valid){scope.pool=P.pool([...scope.pool,c]);const map=scope.year?foldBest:bestByTarget,key=scope.year||scope.target;if(better(c,map.get(key)))map.set(key,c);}
   }
   function startWeights(scope){
    scope.phase='weights';scope.weightSteps=0;
    const next=scope.incumbent?.settings.screening||{coefficients:initialProfiles[0],threshold:0};
    const unchanged=JSON.stringify(next)===JSON.stringify(scope.fixedScreen);scope.fixedScreen=next;
    if(scope.search&&unchanged){scope.search.inject(scope.incoming||[]);scope.incoming=[];return;}
    if(scope.search){const v=scope.search.stats();scope.completedGenerations+=v.generations;scope.completedRestarts+=v.restarts;scope.completedSurrogate+=v.surrogateProposals||0;}
    // Screening changed: old DE fitness is no longer comparable. Start a fresh
    // population with the incumbent, keeping this block's coefficients/threshold fixed.
    scope.search=method==='de'?G.create({seeds:[scope.weights,T.defaults(),...(!scope.year?[...(options.seeds||[]),...(scope.incoming||[])]:[])],balanced:!!options.balanced,random:scope.random,surrogate:!!fitness}):null;
   }
   while(active()){
    const incoming=(control.migrants?.()||[]).map(c=>c.settings?.weights).filter(T.validWeights);if(incoming.length)for(const s of scopes)if(!s.year){s.incoming=[...(s.incoming||[]),...incoming].slice(-16);s.search?.inject(incoming);}
    const scope=scopes[cursor++%scopes.length],stage=scope.phase;
    const trainTo=scope.year?Math.min(+options.to,+((+scope.year-1)+'1231')).toString():options.to;
    if(stage==='initial'){
     const points=await evaluate({...baseSettings,weights:scope.weights},options.from,trainTo,active);if(!points)break;
     scope.points=points;
     if(!scope.year&&S.jointConfig(seed?.settings.screening)?.version===S.JOINT_VERSION)accept(scope,candidate(scope,points,scope.weights,seed.settings.screening.coefficients,seed.settings.screening.threshold),points);
     if(!scope.year&&savedScreen)accept(scope,candidate(scope,points,scope.weights,savedScreen.coefficients,savedScreen.threshold),points);
     for(const coefficients of [...initialProfiles,...(!scope.year&&savedScreen?[savedScreen.coefficients]:[])])accept(scope,candidate(scope,points,scope.weights,coefficients),points);
     scope.phase='screening';
    }else if(stage==='screening'){
     // Horse rankings and pair outcomes are cached for the whole screening block.
     const weights=scope.weights.slice(),points=scope.points;
     if(scope.incumbent)accept(scope,candidate(scope,points,weights,scope.incumbent.settings.screening.coefficients),points);
     for(let i=0;i<24&&active();i++){
      const base=scope.incumbent?.settings.screening.coefficients||initialProfiles[0];
      const coefficients=coefficientProposal(base,scope.coefficientIndex++,scope.random);
      accept(scope,candidate(scope,points,weights,coefficients),points);
      if(i%8===7)await yieldTask();
     }
     startWeights(scope);
    }else {
     const weights=scope.search?scope.search.ask():weightProposal(scope.weights,scope.weightIndex++,scope.random,!!options.balanced);
     if(weights){
      const points=await evaluate({...baseSettings,weights},options.from,trainTo,active);if(!points)break;
      const c=candidate(scope,points,weights,scope.fixedScreen.coefficients,scope.fixedScreen.threshold);
      if(scope.search)scope.search.tell(c?(fitness?P.guidance(c.all,c.training,'product',minHitRate,scope.target/100):eligible(c.all,minHitRate)?c.metrics.product:-Infinity):-Infinity);
      accept(scope,c,points);
     }
     if(!weights||++scope.weightSteps>=24){scope.phase='screening';scope.rounds++;}
    }
    count++;
    control.onStep?.({stage,year:scope.year,target:scope.target,round:scope.rounds,settings:scope.incumbent?.settings||null});
    progress({method,evolution:evolution(),alternating:true,stage,phase:'searching',count,best:bestByTarget.get(options.target)||null,elapsed:Math.min(options.seconds,(now()-start)/1000),seconds:options.seconds});
    await yieldTask();
   }
   if(!current())return null;
   const best=bestByTarget.get(options.target)||null,elapsed=Math.min(options.seconds,(now()-start)/1000);
   if(best){
    progress({method,evolution:evolution(),phase:'verifying',count,best,elapsed,seconds:options.seconds});
    const exact=await verify({...best.settings,includeScreening:true},options.from,options.to,current);if(!exact||!current())return null;
    const p=exact.screening.points[best.settings.screening.threshold];
    for(const k of ['total','evaluated','hits','paidHits'])if(p[k]!==best.all[k])throw Error('선별 탐색과 실제 계산이 일치하지 않습니다.');
    if(Math.abs(p.payoutTotal-best.all.payoutTotal)>1e-7)throw Error('선별 지급배당 검산 불일치');
    best.all={...p};best.metrics=H.metrics(p);
    const summed=blank(),folds=[];
    // Held-out outcomes are read only after all training decisions are complete.
    if(fitness&&(!exact.training||Math.abs(exact.training.score-best.training.score)>1e-7))throw Error('공동 안정성 점수 검산 실패');
    for(const [year,c] of foldBest){
     const points=await evaluate(c.settings,year+'0101',Math.min(+options.to,+(year+'1231')).toString(),current);if(!points||!current())return null;
     const test=aggregate(score(points,c.settings.screening.coefficients),c.settings.screening.threshold);
     for(const k of Object.keys(summed))summed[k]+=test[k];folds.push({year,train:{...metric(c.all),searchScore:P.value(c,'product')},test:metric(test),settings:c.settings});
    }
    best.joint={fixed:exact.fixedSelection,method,optimizer:'alternating-v1',target:options.target,ratios:targets.map(target=>({target,...(bestByTarget.has(target)?{...metric(bestByTarget.get(target).all),searchScore:P.value(bestByTarget.get(target),'product')}:{product:null,ratio:null})})),validation:{folds,all:summed,metrics:H.metrics(summed)},modelLabels:S.JOINT_LABELS};
   }
   return {best,pool:P.pool([best,...scopes[0].pool]),count,elapsed,stopped:stopped(),objective:'product',balanced:!!options.balanced,method,evolution:evolution()};
  }
  return {run,evaluate};
 }
 return {create,calibrate,aggregate,proposals,profiles,coefficientProposal,weightProposal};
})();
if(typeof module!=='undefined')module.exports=JointSearchEngine;
