'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {run}=require('./evaluate-v2.cjs'),engine=require('../qpl-history-engine.js'),tuning=require('../tuning-model.js');
const manifest=JSON.parse(fs.readFileSync('qpl-history.json')),rows=manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows);
const splits={train:rows.filter(r=>r.date<='20231231'),validation:rows.filter(r=>r.date>='20240101'&&r.date<='20241231'),test:rows.filter(r=>r.date>='20250101')};
const rank=(a,b)=>(b.metrics.product??-1)-(a.metrics.product??-1)||b.all.evaluated-a.all.evaluated||a.settings.max-b.settings.max||a.settings.min-b.settings.min||JSON.stringify(a.settings).localeCompare(JSON.stringify(b.settings));
const key=x=>JSON.stringify(x);
let tested=0;const arms=[];
for(const name of ['with','without']){
 const source=JSON.parse(fs.readFileSync('research/v2-'+name+'.json'));tested+=source.weightCandidates;
 const results=[];
 for(const f of source.finalists){
  assert.equal(f.weights.length,13);assert.equal(f.weights[1]===0,name==='without');
  results.push(...run(splits.validation,f.weights).filter(r=>r.all.evaluated>=Math.ceil(splits.validation.length*.4)));
 }
 results.sort(rank);assert(results.length);arms.push({label:name==='with'?'승률 유지':'승률 제외',selection:results[0]});
 console.log(name,'validation best',JSON.stringify(results[0]),'finalists',source.finalists.length);
}
arms.sort((a,b)=>rank(a.selection,b.selection));const selected=arms[0];
const fullFor=s=>run(rows,s.weights).find(x=>key(x.settings)===key(s));
for(const arm of arms){arm.full=fullFor(arm.selection.settings);assert(arm.full.all.evaluated>=Math.ceil(rows.length*.4));}
const best=selected.full;
const combine=(r,years,label)=>{const g={total:0,evaluated:0,hits:0,excluded:0,paidHits:0,payoutTotal:0,label};for(const year of years){const source=rows.filter(x=>x.date.startsWith(year)).length;const x=r.years[year]||{total:source,evaluated:0,hits:0,excluded:source,paidHits:0,payoutTotal:0};for(const k of ['total','evaluated','hits','excluded','paidHits','payoutTotal'])g[k]+=x[k];}return g;};
const metrics=r=>({train:combine(r,['2021','2022','2023'],'탐색 2021~2023'),validation:combine(r,['2024'],'선택 2024'),test:combine(r,['2025','2026'],'후속 확인 2025~현재')});
const temporal={...metrics(best),note:'2021~2023년으로 척도와 후보를 만들고 2024년 결과로 조합·승률 유지 여부를 선택했습니다. 2025년 이후는 선택 후 별도 집계했으나 이전 실험에도 사용된 자료여서 완전히 새로운 독립 검증이 아닙니다. 당일 결과는 입력 지표에 사용하지 않습니다.'};
for(const g of [temporal.train,temporal.validation,temporal.test])assert(g.evaluated>=Math.ceil(g.total*.4),'Coverage must be >=40% of all source races in each period');
const baseline=run(rows,null).find(x=>x.settings.anchorMode==='odds'&&x.settings.min===3&&x.settings.max===4);
const report={schema:1,featureVersion:tuning.VERSION,generatedAt:new Date().toISOString(),from:manifest.from,to:manifest.to,sourceRaces:rows.length,
 sourceSha256:Object.fromEntries(manifest.shards.map(s=>[s.url,crypto.createHash('sha256').update(fs.readFileSync(s.url)).digest('hex')])),
 search:{seed:20260914,weightCandidates:tested,rangeCombinationsPerWeight:380,weightsSum:100,minimumCoverageRatio:.4,minimumEvaluated:Math.ceil(rows.length*.4),coverageDenominator:rows.length,method:'Train-only deterministic sparse/random seeds and 10/5/2/1 transfers; finalists independently re-scored by site probabilities on 2024; choose arm on 2024 before reporting 2025 onward.'},
 best,baseline,temporal,ablation:arms.map(a=>({label:a.label,settings:a.selection.settings,...metrics(a.full)}))};
fs.writeFileSync('strategy-search.json',JSON.stringify(report,null,2));fs.writeFileSync('research/strategy-search-top.json',JSON.stringify([best],null,2));
console.log(JSON.stringify({settings:best.settings,all:best.all,temporal,ablation:report.ablation},null,2));
