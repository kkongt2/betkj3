'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {RULES,selectDiverse}=require('./preset-diversity.cjs');
const t=require('../tuning-model.js'),p=require('../qpl-policy.js'),{run}=require('./evaluate-seoul.cjs'),{exportTrain,evaluate}=require('./rolling-search.cjs');
const manifest=JSON.parse(fs.readFileSync('qpl-history.json'));assert.equal(manifest.scope,'seoul');
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date()).replaceAll('-','');
const rows=manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows).filter(r=>r.date<today);assert(rows.every(r=>r.venue==='seoul'));
const minimum=Math.ceil(rows.length*.4),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'seoul-top5-')),input=path.join(tmp,'races.txt'),output=path.join(tmp,'top.json'),seed=path.join(tmp,'seeds.txt');
const rolling=JSON.parse(fs.readFileSync('rolling-report.json'));assert.equal(rolling.scope,'seoul');
const seeds=[t.defaults(),...rolling.folds.map(f=>f.settings.weights)];
exportTrain(rows,input);fs.writeFileSync(seed,seeds.map(w=>w.join(' ')).join('\n'));
cp.execFileSync('/tmp/search-top5',[input,output,'4','20',seed],{stdio:'inherit'});
const native=JSON.parse(fs.readFileSync(output)),weights=[...new Map([...native.finalists.map(f=>f.weights),...seeds].map(w=>[w.join(','),w])).values()];
const board=[];let tried=0,progress=0;
for(const w of weights){const results=run(rows,w,{predictions:true});tried+=results.length;board.push(...results.filter(x=>x.all.evaluated>=minimum&&x.all.hits*10>=x.all.evaluated));console.log('Exact weights',++progress,'/',weights.length);}
board.sort((a,b)=>b.metrics.product-a.metrics.product||b.all.evaluated-a.all.evaluated||JSON.stringify(a.settings).localeCompare(JSON.stringify(b.settings)));
const distinct=[],seen=new Set();
for(const c of board){const key=crypto.createHash('sha256').update(Buffer.from(c.predictions.buffer)).digest('hex');if(seen.has(key))continue;seen.add(key);distinct.push({...c,predictionHash:key});}
const selected=selectDiverse(distinct),presets=[];
for(const candidate of selected){
 const check=evaluate(rows,candidate.settings);assert.equal(check.all.hits,candidate.all.hits);assert.equal(check.all.evaluated,candidate.all.evaluated);assert(Math.abs(check.all.payoutTotal-candidate.all.payoutTotal)<1e-7);
 const {predictions,chosen,minPairDistance,minDiversity,...saved}=candidate;
 presets.push({rank:presets.length+1,name:'서울 10% 분산 '+(presets.length+1)+'번',...saved,coverage:candidate.all.evaluated/rows.length});
}
assert.equal(presets.length,10);
const report={schema:2,selectionRules:RULES,bestEligibleProduct:board[0].metrics.product,scope:'seoul',version:t.VERSION,generatedAt:new Date().toISOString(),from:rows[0].date,to:rows.at(-1).date,sourceRaces:rows.length,minimumCoverageRatio:.4,minimumEvaluated:minimum,search:{nativeWeightCandidates:native.weightCandidates,exactWeightCandidates:weights.length,exactSettings:tried,anchors:['odds','analysis'],ranks:[2,20],weightStep:1,weightTotal:100,deduplicate:'identical historical selected pairs',eligibleDistinct:distinct.length},presets,sourceSha256:Object.fromEntries(manifest.shards.map(s=>[s.url,crypto.createHash('sha256').update(fs.readFileSync(s.url)).digest('hex')])),note:'서울 전체 경주의 40% 이상을 평가하고 적중률이 10% 이상인 후보만 사용합니다. 최고 곱의 85% 이상인 후보에서 성과 80%·다양성 20%로 10개를 선정한 뒤 곱이 높은 순서로 표시합니다. 두 프리셋 중 하나라도 조합을 선택한 경주에서 실제 선택이 최소 10% 이상 다르며, 같은 축마·순위 범위는 최대 2개, 같은 축마·시작 순위 구간은 최대 4개입니다. 같은 과거 자료로 탐색하고 평가한 사후 성적이며 미래 성적이나 독립 검증이 아닙니다.'};
fs.writeFileSync('top5-presets.json',JSON.stringify(report,null,2));fs.rmSync(tmp,{recursive:true,force:true});console.log(JSON.stringify({search:report.search,sourceRaces:report.sourceRaces,presets},null,2));
