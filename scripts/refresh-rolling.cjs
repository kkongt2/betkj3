const fs=require('node:fs'),cp=require('node:child_process'),policy=require('../qpl-policy.js');
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date()).replaceAll('-','');
const manifest=JSON.parse(fs.readFileSync('qpl-history.json')),rows=manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows).filter(r=>r.date<today&&r.settled),d=rows.at(-1)?.date||manifest.from,q=d.slice(0,4)+String(Math.floor((+d.slice(4,6)-1)/3)*3+1).padStart(2,'0')+'01';
const report=fs.existsSync('rolling-report.json')?JSON.parse(fs.readFileSync('rolling-report.json')):null;
if(report?.scope==='seoul'&&report?.version===require('../tuning-model.js').VERSION&&report?.policyVersion===policy.VERSION&&report.live?.forQuarter===q){
 // New source records must refresh descriptive totals without changing frozen weights.
 const {evaluate,aggregate}=require('./rolling-search.cjs');
 const allRows=manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows).filter(r=>r.venue==='seoul'&&r.date<today);
 const results=report.folds.map(f=>{const selected=allRows.filter(r=>r.date>=f.from&&r.date<f.to);const result=evaluate(selected,f.settings);f.selected=result.all;f.through=selected.at(-1)?.date||f.through;return result;});
 report.selected=aggregate(results);const live=evaluate(allRows,report.live.settings);report.live.retrospective={all:live.all,metrics:live.metrics};report.sourceRaces=allRows.length;report.to=allRows.at(-1)?.date||report.to;
 report.refreshedAt=new Date().toISOString();
 // The alternative-style comparison is the original experiment snapshot; only the
 // selected settings were retained, so do not pretend to replay discarded candidates.
 report.recordComparisonNote='기록 방식별 비교는 최초 탐색 당시 자료 기준이며, 선택 조합 성적은 현재 자료로 재계산합니다.';
 fs.writeFileSync('rolling-report.json',JSON.stringify(report,null,2));console.log('Refreshed results with frozen quarterly settings:',q);
}
else{cp.execFileSync('g++',['-O3','-fopenmp','-std=c++17','scripts/search-v3.cpp','-o','/tmp/search-v3'],{stdio:'inherit'});cp.execFileSync(process.execPath,['scripts/rolling-search.cjs'],{stdio:'inherit'});}
