'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const balance=require('./weight-balance.cjs');
const {RULES,select,weightMove}=require('./family-selection.cjs');
const t=require('../tuning-model.js'),p=require('../qpl-policy.js'),{run}=require('./evaluate-seoul.cjs'),{exportTrain,evaluate}=require('./rolling-search.cjs');
const manifest=JSON.parse(fs.readFileSync('qpl-history.json'));assert.equal(manifest.scope,'seoul');
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date()).replaceAll('-','');
const rows=manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows).filter(r=>r.date<today);assert(rows.every(r=>r.venue==='seoul'));
const minimum=Math.ceil(rows.length*.4),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'seoul-top5-')),input=path.join(tmp,'races.txt'),output=path.join(tmp,'top.json'),seed=path.join(tmp,'seeds.txt');
const parents=JSON.parse(fs.readFileSync('preset-bases.json'));assert.deepEqual(parents.bases.map(p=>p.id),[3,4,9]);
const bases=parents.bases.map(p=>({...p,settings:{...p.settings,weights:[...p.settings.weights,0]}}));
exportTrain(rows,input);
const board=[];let tried=0,tested=0,exact=0;const baselines=[];
for(const base of bases){
 const projected=balance.project(base.settings.weights);
 fs.writeFileSync(seed,[base.settings.anchorMode==='analysis'?1:0,base.settings.min,base.settings.max,...projected,balance.RULES.minimum,balance.RULES.maximum,balance.RULES.groups.length,...balance.RULES.groups.flatMap(g=>[g.min,g.max,g.indices.length,...g.indices])].join(' '));
 cp.execFileSync('/tmp/search-top5',[input,output,seed],{stdio:'inherit'});
 const native=JSON.parse(fs.readFileSync(output));tested+=native.weightCandidates;
 const weights=[...new Map([projected,...native.finalists.map(f=>f.weights)].map(w=>[w.join(','),w])).values()];
 baselines.push({id:base.id,settings:base.settings,...evaluate(rows,base.settings)});
 for(const w of weights){assert(balance.valid(w));const results=run(rows,w,{predictions:true,family:base.settings});tried+=results.length;exact++;
  for(const x of results)if(x.all.evaluated>=minimum&&x.all.hits*20>=x.all.evaluated*3&&x.settings.anchorMode===base.settings.anchorMode&&Math.abs(x.settings.min-base.settings.min)<=3&&Math.abs(x.settings.max-base.settings.max)<=3)board.push({...x,baseId:base.id,weightReallocation:weightMove(w,base.settings.weights)});
  console.log('Base',base.id,'exact weights',exact);
 }
}
board.sort((a,b)=>b.metrics.product-a.metrics.product||b.all.evaluated-a.all.evaluated||JSON.stringify(a.settings).localeCompare(JSON.stringify(b.settings)));
const distinct=[],seen=new Set();
for(const c of board){const key=crypto.createHash('sha256').update(Buffer.from(c.predictions.buffer)).digest('hex');const groupKey=c.baseId+':'+key;if(seen.has(groupKey))continue;seen.add(groupKey);distinct.push({...c,predictionHash:key});}
const selected=select(distinct),presets=[];
for(const candidate of selected){
 const check=evaluate(rows,candidate.settings);assert.equal(check.all.hits,candidate.all.hits);assert.equal(check.all.evaluated,candidate.all.evaluated);assert(Math.abs(check.all.payoutTotal-candidate.all.payoutTotal)<1e-7);
 const {predictions,chosen,minPairDistance,minDiversity,...saved}=candidate;
 presets.push({rank:presets.length+1,name:'서울 균형 기준'+candidate.baseId+' 파생 '+(presets.length+1)+'번',...saved,weightSummary:balance.summary(candidate.settings.weights),coverage:candidate.all.evaluated/rows.length});
}
assert.equal(presets.length,15);
const previous=JSON.parse(fs.readFileSync('previous-preset-reference.json'));
const comparison={previousName:previous.preset.name,previousSettings:previous.preset.settings,previousSummary:balance.summary(previous.preset.settings.weights),previousMetrics:evaluate(rows,previous.preset.settings).metrics,newMetrics:presets[0].metrics};
const report={schema:4,weightBalance:balance.RULES,comparison,selectionRules:RULES,bases:baselines,baseSource:parents.sourceCommit,bestEligibleProduct:board[0].metrics.product,scope:'seoul',version:t.VERSION,generatedAt:new Date().toISOString(),from:rows[0].date,to:rows.at(-1).date,sourceRaces:rows.length,minimumCoverageRatio:.4,minimumEvaluated:minimum,search:{nativeWeightCandidates:tested,exactWeightCandidates:exact,exactSettings:tried,anchors:['odds','analysis'],ranks:[2,20],weightStep:1,weightTotal:100,deduplicate:'identical historical selected pairs',eligibleDistinct:distinct.length},presets,sourceSha256:Object.fromEntries(manifest.shards.map(s=>[s.url,crypto.createHash('sha256').update(fs.readFileSync(s.url)).digest('hex')])),note:'기존 프리셋 3·4·9번을 새 최근 5경주 지표로 다시 계산하고 각 계열에서 5개씩 총 15개를 균형 선별했습니다. 축마 방식은 기준과 같게 유지하며 순위 양 끝은 각각 ±3위, 기존 30%p 이동 제한을 해제하고 가중치는 각각 3~20%, 합계 100%로 재탐색했습니다. 최근 성적·착순 합계 20~40%, 기록·시간차 최대 35%, 중량·마체중·출전 간격 최대 20%로 제한합니다. 적중률 15% 이상과 전체 서울 경주 40% 이상 조건을 지키고 곱이 높은 후보부터 선택합니다. 실제 선택 조합 차이는 최소 10%, 같은 계열·순위 범위는 최대 2개입니다. 같은 과거 자료로 탐색·평가한 사후 성적이며 미래 성적이나 독립 검증이 아닙니다. 가중치 분산은 특정 지표 의존도를 줄이는 제약이며 성적 향상을 보장하지 않습니다.'};
fs.writeFileSync('top5-presets.json',JSON.stringify(report,null,2));fs.rmSync(tmp,{recursive:true,force:true});console.log(JSON.stringify({search:report.search,sourceRaces:report.sourceRaces,presets},null,2));
