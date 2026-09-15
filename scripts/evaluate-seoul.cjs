// Re-score every finalist, both anchors and all 190 intervals using actual site probabilities.
const fs=require('node:fs'),crypto=require('node:crypto'),{Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const tuning=require('../tuning-model.js'),policy=require('../qpl-policy.js'),engine=require('../qpl-history-engine.js');
const manifest=JSON.parse(fs.readFileSync('qpl-history.json'));
const loadRows=()=>manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows);
const blank=()=>({total:0,evaluated:0,hits:0,excluded:0,paidHits:0,payoutTotal:0});
function compare(a,b){return !b||a.pick.prob>b.pick.prob||a.pick.prob===b.pick.prob&&(a.partner.prob>b.partner.prob||a.partner.prob===b.partner.prob&&a.partner.number<b.partner.number);}
function run(rows,weights,options={}){
 rows=rows.filter(r=>r.venue==='seoul');
 const results=[];for(const anchorMode of ['odds','analysis'])for(let min=2;min<=20;min++)for(let max=min;max<=20;max++)results.push({settings:{anchorMode,modelMode:weights?'custom':'existing',weights:weights||tuning.defaults(),min,max},all:blank(),years:{},...(options.predictions?{predictions:new Uint16Array(rows.length)}:{})});
 const grids={odds:[],analysis:[]},yearTotals={};for(const row of rows)yearTotals[row.date.slice(0,4)]=(yearTotals[row.date.slice(0,4)]||0)+1;for(const r of results)(grids[r.settings.anchorMode][r.settings.min]||(grids[r.settings.anchorMode][r.settings.min]=[]))[r.settings.max]=r;
 for(const [rowIndex,row] of rows.entries()){
  if(!row.settled)continue;
  const base=tuning.apply(tuning.unpack(row),{modelMode:weights?'custom':'existing',weights});
  const payouts=new Map(row.payouts.map(p=>[p.numbers.slice().sort((a,b)=>a-b).join('-'),p.odds]));
  for(const anchorMode of ['odds','analysis']){
   const all=policy.apply(base,{quotes:row.quotes},{anchorMode,min:2,max:20});if(all.qplPolicy.status!=='ready')continue;
   const byRank=new Map(all.qplPolicy.candidates.map(c=>[c.partner.rank,c]));
   for(let min=2;min<=20;min++){let picked=null;for(let max=min;max<=20;max++){
    const c=byRank.get(max);if(c&&compare(c,picked))picked=c;if(!picked)continue;
    const out=grids[anchorMode][min][max],year=row.date.slice(0,4);
    const ns=picked.pick.numbers.slice().sort((a,b)=>a-b),amount=payouts.get(ns.join('-'))||0;if(options.predictions)out.predictions[rowIndex]=ns[0]*32+ns[1];
    for(const g of [out.all,out.years[year]||(out.years[year]=blank())]){g.evaluated++;g.hits+=amount>0;g.paidHits+=amount>0;g.payoutTotal+=amount;}
   }}
  }
 }
 for(const out of results){out.all.total=rows.length;out.all.excluded=rows.length-out.all.evaluated;for(const [year,g]of Object.entries(out.years)){g.total=yearTotals[year];g.excluded=g.total-g.evaluated;}out.metrics=engine.metrics(out.all);}
 return results;
}

module.exports={run};
