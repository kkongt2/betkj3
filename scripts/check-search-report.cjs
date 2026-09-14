const fs=require('node:fs'),assert=require('node:assert/strict'),engine=require('../qpl-history-engine.js');
const report=JSON.parse(fs.readFileSync('strategy-search.json')),manifest=JSON.parse(fs.readFileSync('qpl-history.json'));
const rows=manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows),evaluation=engine.create(rows);
(async()=>{
 for(const name of ['best','broad','baseline']){
  const r=report[name],actual=(await evaluation.evaluate(r.settings,report.from,report.to)).all;
  for(const field of ['total','evaluated','hits','excluded','paidHits'])assert.equal(actual[field],r.all[field],name+' '+field);
  assert(Math.abs(actual.payoutTotal-r.all.payoutTotal)<1e-7);
  const annual={};for(let i=0;i<rows.length;i++){
   const row=rows[i],x=evaluation.evaluateRow(i,r.settings),p=x.candidates[0],year=row.date.slice(0,4);
   const g=annual[year]||(annual[year]={evaluated:0,hits:0,payoutTotal:0});if(x.settled&&p){g.evaluated++;if(p.hit){g.hits++;g.payoutTotal+=p.payout;}}
  }
  for(const [year,g] of Object.entries(annual))for(const field of ['evaluated','hits','payoutTotal'])assert(Math.abs(g[field]-(r.years[year]?.[field]||0))<1e-7,name+' '+year+' '+field);
  console.log('PASS exact site engine',name,JSON.stringify({...actual,...engine.metrics(actual)}));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
