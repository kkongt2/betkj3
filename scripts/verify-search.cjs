// Re-score every finalist, both anchors and all 190 intervals using actual site probabilities.
const fs=require('node:fs'),crypto=require('node:crypto'),{Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const tuning=require('../tuning-model.js'),policy=require('../qpl-policy.js'),engine=require('../qpl-history-engine.js');
const manifest=JSON.parse(fs.readFileSync('qpl-history.json'));
const loadRows=()=>manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows);
const blank=()=>({total:0,evaluated:0,hits:0,excluded:0,paidHits:0,payoutTotal:0});
function compare(a,b){return !b||a.pick.prob>b.pick.prob||a.pick.prob===b.pick.prob&&(a.partner.prob>b.partner.prob||a.partner.prob===b.partner.prob&&a.partner.number<b.partner.number);}
function run(rows,weights){
 const results=[];for(const anchorMode of ['odds','analysis'])for(let min=2;min<=20;min++)for(let max=min;max<=20;max++)results.push({settings:{anchorMode,modelMode:weights?'custom':'existing',weights:weights||tuning.defaults(),min,max},all:blank(),years:{}});
 const grids={odds:[],analysis:[]},yearTotals={};for(const row of rows)yearTotals[row.date.slice(0,4)]=(yearTotals[row.date.slice(0,4)]||0)+1;for(const r of results)(grids[r.settings.anchorMode][r.settings.min]||(grids[r.settings.anchorMode][r.settings.min]=[]))[r.settings.max]=r;
 for(const row of rows){
  if(!row.settled)continue;
  const base=tuning.apply(tuning.unpack(row),{modelMode:weights?'custom':'existing',weights});
  const payouts=new Map(row.payouts.map(p=>[p.numbers.slice().sort((a,b)=>a-b).join('-'),p.odds]));
  for(const anchorMode of ['odds','analysis']){
   const all=policy.apply(base,{quotes:row.quotes},{anchorMode,min:2,max:20});if(all.qplPolicy.status!=='ready')continue;
   const byRank=new Map(all.qplPolicy.candidates.map(c=>[c.partner.rank,c]));
   for(let min=2;min<=20;min++){let picked=null;for(let max=min;max<=20;max++){
    const c=byRank.get(max);if(c&&compare(c,picked))picked=c;if(!picked)continue;
    const out=grids[anchorMode][min][max],year=row.date.slice(0,4);
    const amount=payouts.get(picked.pick.numbers.slice().sort((a,b)=>a-b).join('-'))||0;
    for(const g of [out.all,out.years[year]||(out.years[year]=blank())]){g.evaluated++;g.hits+=amount>0;g.paidHits+=amount>0;g.payoutTotal+=amount;}
   }}
  }
 }
 for(const out of results){out.all.total=rows.length;out.all.excluded=rows.length-out.all.evaluated;for(const [year,g]of Object.entries(out.years)){g.total=yearTotals[year];g.excluded=g.total-g.evaluated;}out.metrics=engine.metrics(out.all);}
 return results;
}
if(!isMainThread){const rows=loadRows();parentPort.on('message',({i,weights})=>parentPort.postMessage({i,results:run(rows,weights)}));}
else{
 const source=JSON.parse(fs.readFileSync(process.argv[2])),weights=[null,tuning.defaults(),...source.finalists.map(f=>f.weights)];
 const candidates=[...new Map(weights.map(w=>[JSON.stringify(w),w])).values()],results=[];let next=0,done=0;
 const workers=Array.from({length:4},()=>new Worker(__filename));
 for(const worker of workers){worker.on('error',e=>{console.error(e);process.exit(1)});worker.on('message',({i,results:r})=>{results.push(...r);console.log('Verified',++done,'/',candidates.length);dispatch(worker);});dispatch(worker);}
 function dispatch(worker){if(next<candidates.length){const i=next++;worker.postMessage({i,weights:candidates[i]});}else{worker.terminate();if(done===candidates.length)finish();}}
 function finish(){
  const rank=(a,b)=>(b.metrics.product??-1)-(a.metrics.product??-1)||b.all.evaluated-a.all.evaluated||a.settings.max-b.settings.max;
  results.sort(rank);const baseline=results.find(r=>r.settings.modelMode==='existing'&&r.settings.anchorMode==='odds'&&r.settings.min===3&&r.settings.max===4),minimumCoverageRatio=source.minimumCoverageRatio||.4,minimumEvaluated=Math.ceil(manifest.races*minimumCoverageRatio),eligible=results.filter(r=>r.all.evaluated>=minimumEvaluated),best=eligible[0],broad=results.filter(r=>r.all.evaluated>=baseline.all.evaluated*.8)[0];
  const report={schema:1,generatedAt:new Date().toISOString(),from:manifest.from,to:manifest.to,sourceRaces:manifest.races,sourceSha256:Object.fromEntries(manifest.shards.map(s=>[s.url,crypto.createHash('sha256').update(fs.readFileSync(s.url)).digest('hex')])),search:{seed:source.seed,weightCandidates:source.weightCandidates,rangeCombinationsPerWeight:380,exactWeightCandidates:candidates.length,exactConfigurations:results.length,weightsSum:100,minimumCoverageRatio,minimumEvaluated,coverageDenominator:manifest.races,broadMinimumEvaluated:Math.ceil(baseline.all.evaluated*.8),method:'Deterministic sparse/random seeds, 10/5/2/1 percentage-point transfers; score-order screening, then exact site probabilities for all finalist intervals. Same-data retrospective selection, not held-out validation.'},best,broad,baseline};
  fs.writeFileSync('strategy-search.json',JSON.stringify(report,null,2));fs.writeFileSync('research/strategy-search-top.json',JSON.stringify(eligible.slice(0,30),null,2));
  console.log(JSON.stringify({best,broad,baseline}));
 }
}
