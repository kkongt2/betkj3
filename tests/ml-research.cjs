'use strict';
// Independent payout/coverage audit of the saved out-of-time forecasts.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const folder=process.argv[2];assert(folder,'Usage: node tests/ml-research.cjs <experiment-output-directory>');
const read=f=>JSON.parse(fs.readFileSync(path.join(folder,f))),report=read('report.json'),predictions=read('predictions.json'),members=read('selection-members.json'),dataset=read('dataset.json');
const manifest=JSON.parse(fs.readFileSync('qpl-history.json'));
const rows=manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows).filter(r=>r.venue==='seoul'&&r.settled);
const key=r=>r.date+':'+r.race,pair=ns=>ns.slice().sort((a,b)=>a-b).join('-'),lookup=new Map(rows.map(r=>[key(r),r]));
const expected=rows.filter(r=>r.date>='20240101'),n=expected.length;
assert.equal(n,2833);assert.equal(new Set(dataset.feature_names).size,92);
assert(!dataset.feature_names.some(f=>/odds|payout|current_finish|current_result/.test(f)));
const approx=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function audit(rs,g,total){
 assert.equal(g.total,total);assert.equal(g.evaluated,rs.length);assert.equal(new Set(rs.map(key)).size,rs.length);
 let hits=0,paid=0;for(const p of rs){const r=lookup.get(key(p));assert(r);assert.equal(new Set(p.numbers).size,2);assert(p.numbers.every(v=>r.horses.some(h=>h[0]===v)));
  const amount=r.payouts.find(q=>pair(q.numbers)===pair(p.numbers))?.odds||0;hits+=amount>0;paid+=amount;
  if('payout' in p)approx(p.payout,amount);if('hit' in p)assert.equal(p.hit,amount>0?1:0);
 }
 assert.equal(g.hits,hits);approx(g.payoutTotal,paid);approx(g.coverage,rs.length/total);approx(g.product,paid/rs.length);
}
for(const [variant,rs] of Object.entries(predictions)){
 for(const p of rs){assert(Number.isFinite(p.score));assert(p.date>='20230101');}
 const tested=rs.filter(r=>r.date>='20240101');assert.equal(tested.length,n);audit(tested,report.all[variant].overall,n);
}
for(const [label,rs] of Object.entries(members)){
 const variant=label.split('-')[0],original=new Map(predictions[variant].map(r=>[key(r),r]));
 for(const r of rs)assert.equal(pair(r.numbers),pair(original.get(key(r)).numbers));
 audit(rs,report.selected[label].overall,n);
 for(const fold of report.selected[label].folds){assert(fold.selector_train_through<fold.threshold_train_through);assert(fold.threshold_train_through<fold.year*10000+101);
  const selected=rs.filter(r=>r.date.startsWith(String(fold.year))),total=expected.filter(r=>r.date.startsWith(String(fold.year))).length;audit(selected,fold.test,total);
 }
 assert.equal(report.selected[label].meets_40_percent_each_year,report.selected[label].folds.every(f=>f.test.coverage>=.4));
}
for(const [name,m] of Object.entries(report.horse_models))assert(m.train_through<Number(name.slice(-4))*10000+101);
for(const [year,m] of Object.entries(report.pair_models))assert(m.train_through<Number(year)*10000+101);
console.log('PASS official payout audit, 2,833-race coverage, all model/selector date boundaries, one combination per race, and selected membership');
