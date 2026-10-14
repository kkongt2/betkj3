'use strict';
const assert=require('node:assert/strict'),S=require('../runner-search-panel'),T=require('../tuning-model');
function fixture(betStrategy='trio-box4'){
 const settings={betStrategy,anchorRank:1,min:2,max:12,weights:T.defaults(),...(betStrategy==='hybrid'?{hybridRanks:[4,6]}:{})};
 return {schema:1,runId:'123-1',finishedAt:'2026-10-13T12:30:00Z',modelVersion:T.VERSION,from:'20230101',to:'20261011',request:{schema:1,requestId:'test',seconds:604800,method:'de',objective:'product',joint:true,target:50,minHitRate:20,balanced:false,parallel:true,settings},result:{elapsed:360000,count:218525,workers:4,segments:20,best:{settings:{...settings,screening:{threshold:53}},all:{total:3904,evaluated:1960,hits:459,paidHits:459,excluded:1944,payoutTotal:2406.825}}}};
}
const raw=fixture(),before=JSON.stringify(raw),summary=S.summarize(raw);
assert.equal(JSON.stringify(raw),before,'preview must not migrate or change saved settings/statistics');
assert.deepEqual(S.summarize(summary),summary,'persisted summaries must be independently readable');
assert(summary.result.partial);assert.equal(summary.result.best.metrics.product,2406.825/1960);
const label=S.label(summary),html=S.preview(summary);
assert(label.includes('삼복승 4두 박스'));assert(label.includes('공동 50%'));assert(label.includes('100시간 / 요청 7일'));assert(label.includes('1.2280배'));
for(const phrase of ['적중률 하한','20%','균형 제한','실제 4개 작업','요청·실제 탐색 시간','7일 / 100시간','최종 경기 선별','53점 이상','218,525','21개 보기'])assert(html.includes(phrase),phrase);
assert.equal(S.selection(summary.request.settings),'분석 상위 4두 · 4조합');
assert.equal(S.selection(S.summarize(fixture('trio-box3')).request.settings),'분석 상위 4두 · 1위 축 고정 · 3조합');
assert(S.selection(S.summarize(fixture('hybrid')).request.settings).includes('복병 4·6위 · 총 3조합'));
assert(S.selection(S.summarize(fixture('qpl-anchor2')).request.settings).includes('상대 2~12위 · 2조합'));
const empty=fixture();empty.result.best=null;empty.request.seconds=empty.result.elapsed=42000;assert(S.label(S.summarize(empty)).includes('조건 만족 후보 없음'));assert(!S.summarize(empty).result.partial);
const old=fixture('qpl-single');old.modelVersion='user-weighted-seoul-trainer22-v1';delete old.request.minHitRate;old.request.settings.weights=Array(22).fill(1);old.result.best.settings.weights=Array(22).fill(1);
assert.equal(S.summarize(old).request.minHitRate,15);assert(S.preview(S.summarize(old)).includes('22개 보기'));
const zero=fixture();zero.result.best.all={total:100,evaluated:100,hits:0,paidHits:0,excluded:0,payoutTotal:0};assert(S.label(S.summarize(zero)).includes('0.0000배'),'zero is a real result, not missing');
const incomplete=fixture();incomplete.result.best.all.paidHits--;assert(S.label(S.summarize(incomplete)).includes('환급 —'));
for(const mutate of [x=>x.runId='../../secret',x=>x.request.settings.betStrategy='constructor',x=>x.request.objective='constructor',x=>x.result.best.all.payoutTotal=NaN,x=>x.result.elapsed=700000,x=>x.result.best.settings.weights[0]='<script>',x=>x.request.settings.hybridRanks=['<img>']]){const x=fixture('hybrid');mutate(x);assert.throws(()=>S.summarize(x));}
console.log('PASS original saved performance, legacy/partial/no-candidate/zero results, strategy-specific options, final weights, summary roundtrip and malformed data rejection');
// Preview and background hydration must not import a result. A changed selection
// must invalidate a pending import before the receiver can apply it.
(async()=>{
 const saved={};for(const key of ['document','localStorage','fetch','RunnerSearchContract'])saved[key]=global[key];
 const nodes=Object.fromEntries(['runnerSearchStatus','runnerSearchRequest','runnerSearchResults','runnerSearchPreview','runnerPrepared','prepareRunnerSearch','copyRunnerSearch','refreshRunnerSearch','loadRunnerSearch'].map(id=>[id,{hidden:true,disabled:false,value:'',textContent:'',innerHTML:''}]));
 const list=nodes.runnerSearchResults;list.options=[];list.replaceChildren=()=>{list.options=[];list.value='';};list.append=o=>{list.options.push(o);if(!list.value)list.value=o.value;};
 const a=fixture('qpl-single'),b=fixture('hybrid');b.runId='124-1';for(const raw of [a,b]){raw.featureCount=T.FEATURES.length;raw.request.joint=false;delete raw.result.best.settings.screening;}
 let indexed=true,reads=0,release;const received=[];
 try{
  global.document={getElementById:id=>nodes[id],createElement:()=>({}),addEventListener(){}};global.localStorage={getItem:()=>null};global.RunnerSearchContract=require('../runner-search-contract');
  global.fetch=async url=>({ok:true,status:200,json:async()=>url.includes('index.json')?{schema:1,entries:[a,b].map(raw=>({runId:raw.runId,finishedAt:raw.finishedAt,requestId:'test',seconds:raw.result.elapsed,method:'de',joint:false,...(indexed?{summary:S.summarize(raw)}:{})}))}:(reads++,url.includes('/123-1.json')?a:b)});
  S.init({canPrepare:()=>true,receive:async(report,current=()=>true)=>{if(report.runId==='123-1')await new Promise(resolve=>release=resolve);if(current())received.push(report.runId);return current();}});
  await nodes.refreshRunnerSearch.onclick();assert.equal(reads,0,'new index summaries need no full report fetch');assert(nodes.runnerSearchPreview.innerHTML.includes('실제 환급배수'));assert.equal(received.length,0);
  const loading=nodes.loadRunnerSearch.onclick();await new Promise(resolve=>setImmediate(resolve));assert.equal(typeof release,'function');list.value='124-1';list.onchange();assert(nodes.runnerSearchPreview.innerHTML.includes('하이브리드'));release();await loading;assert.deepEqual(received,[],'stale selection must not import');
  await nodes.loadRunnerSearch.onclick();assert.deepEqual(received,['124-1']);
  indexed=false;nodes.runnerSearchPreview.innerHTML='';S.init({canPrepare:()=>true,receive:()=>{throw Error('hydration must never import');}});await nodes.refreshRunnerSearch.onclick();assert(reads>=4);assert(list.options.every(o=>o.textContent.includes('환급')),'old writers are enriched from their full reports');
  console.log('PASS rich-index previews, legacy-writer hydration, fresh explicit load and stale selection cancellation');
 }finally{for(const key of Object.keys(saved)){if(saved[key]===undefined)delete global[key];else global[key]=saved[key];}}
})().catch(e=>{console.error(e);process.exitCode=1;});
