'use strict';
// Preserve the user's existing preset; replay its results under the current
// feature schema and evaluation period instead of relabelling old statistics.
const fs=require('node:fs'),T=require('../tuning-model.js'),H=require('../qpl-history-engine.js'),B=require('../weight-balance.js'),P=require('../strategy-presets.js');
(async()=>{
 const old=JSON.parse(fs.readFileSync('top5-presets.json'));
 const manifest=JSON.parse(fs.readFileSync('qpl-history.json'));
 const rows=manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows).filter(r=>r.date>=H.PERIOD.from);
 const engine=H.create(rows),presets=[];
 for(const p of old.presets){
  const settings=P.config(p.settings),g=await engine.evaluate(settings,H.PERIOD.from,manifest.to);
  const years={};for(const year of [...new Set(rows.map(r=>r.date.slice(0,4)))])years[year]=(await engine.evaluate(settings,year+'0101',year+'1231')).all;
  presets.push({rank:p.rank,name:p.name,settings,all:g.all,years,metrics:H.metrics(g.all),weightSummary:B.summary(settings.weights),coverage:g.all.total?g.all.evaluated/g.all.total:0});
 }
 const report={schema:4,preservedSettings:true,scope:'seoul',version:T.VERSION,weightBalance:B.RULES,generatedAt:manifest.generatedAt,from:manifest.from,to:manifest.to,sourceRaces:rows.length,minimumCoverageRatio:.4,minimumEvaluated:Math.ceil(rows.length*.4),presets,note:'기존 프리셋 가중치를 유지하고 2023년 이후 자료로 성적을 재계산했습니다. 2022년은 전적 참조와 척도 설정에만 사용하며 2021년은 제외합니다. 새 가중치는 0%로 추가하며 재탐색 결과가 아닙니다.'};
 fs.writeFileSync('top5-presets.json',JSON.stringify(report,null,2));
 console.log('Refreshed preserved presets:',presets.length,'period',manifest.from,manifest.to);
})().catch(e=>{console.error(e);process.exitCode=1});
