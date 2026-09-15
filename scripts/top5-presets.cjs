'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
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
for(const w of weights){const results=run(rows,w);tried+=results.length;board.push(...results.filter(x=>x.all.evaluated>=minimum));console.log('Exact weights',++progress,'/',weights.length);}
board.sort((a,b)=>b.metrics.product-a.metrics.product||b.all.evaluated-a.all.evaluated||JSON.stringify(a.settings).localeCompare(JSON.stringify(b.settings)));
function fingerprint(config){const selected=[];for(const row of rows){if(!row.settled){selected.push('-');continue;}const r=p.apply(t.apply(t.unpack(row),config),{quotes:row.quotes},config);selected.push(r.qplPolicy.status==='ready'?r.pairs[0].numbers.slice().sort((a,b)=>a-b).join('-'):'-');}return crypto.createHash('sha256').update(selected.join('|')).digest('hex');}
const presets=[],seen=new Set();
for(const candidate of board){const key=fingerprint(candidate.settings);if(seen.has(key))continue;seen.add(key);
 const check=evaluate(rows,candidate.settings);assert.equal(check.all.hits,candidate.all.hits);assert.equal(check.all.evaluated,candidate.all.evaluated);assert(Math.abs(check.all.payoutTotal-candidate.all.payoutTotal)<1e-7);
 presets.push({rank:presets.length+1,name:'서울 과거 최고 '+(presets.length+1)+'위',...candidate,coverage:candidate.all.evaluated/rows.length,predictionHash:key});if(presets.length===5)break;
}
assert.equal(presets.length,5);
const report={schema:1,scope:'seoul',version:t.VERSION,generatedAt:new Date().toISOString(),from:rows[0].date,to:rows.at(-1).date,sourceRaces:rows.length,minimumCoverageRatio:.4,minimumEvaluated:minimum,search:{nativeWeightCandidates:native.weightCandidates,exactWeightCandidates:weights.length,exactSettings:tried,anchors:['odds','analysis'],ranks:[2,20],weightStep:1,weightTotal:100,deduplicate:'identical historical selected pairs'},presets,sourceSha256:Object.fromEntries(manifest.shards.map(s=>[s.url,crypto.createHash('sha256').update(fs.readFileSync(s.url)).digest('hex')])),note:'전체 서울 과거 자료에서 적중률×평균배당이 높았던 탐색 후보 5개입니다. 최소 전체 경주 40% 이상 조건을 적용하고, 과거 선택 조합이 완전히 같은 설정은 하나로 합쳤습니다. 같은 과거 자료로 탐색하고 평가한 사후 성적이며 미래 성적 또는 독립 검증이 아닙니다. 모든 가중치의 전역 최댓값을 보장하지 않습니다. 분기별 시간순 검증과 구분해서 보세요.'};
fs.writeFileSync('top5-presets.json',JSON.stringify(report,null,2));fs.rmSync(tmp,{recursive:true,force:true});console.log(JSON.stringify({search:report.search,sourceRaces:report.sourceRaces,presets},null,2));
