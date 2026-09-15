'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const tuning=require('../tuning-model.js'),policy=require('../qpl-policy.js'),engine=require('../qpl-history-engine.js'),{run}=require('./evaluate-v2.cjs');
const VENUES=['seoul','busan','jeju'],STYLES=['평균 기록','중앙값','최고 기록','기록 혼합·변동성'];
const blank=()=>({total:0,evaluated:0,hits:0,excluded:0,paidHits:0,payoutTotal:0});
const plus=(a,b)=>{for(const k of Object.keys(blank()))a[k]+=b[k];return a;};
const product=g=>g.evaluated?g.payoutTotal/g.evaluated:-Infinity;
const covers=g=>g.total>0&&g.evaluated>=Math.ceil(g.total*.4);
function shift(d,months){const t=new Date(Date.UTC(+d.slice(0,4),+d.slice(4,6)-1+months,1));return t.toISOString().slice(0,10).replaceAll('-','');}
function quarter(d){return d.slice(0,4)+String(Math.floor((+d.slice(4,6)-1)/3)*3+1).padStart(2,'0')+'01';}
function normalize(w){const sum=w.reduce((a,b)=>a+b,0),raw=w.map(x=>x*100/sum),out=raw.map(Math.floor);let n=100-out.reduce((a,b)=>a+b,0);const rank=raw.map((x,i)=>[x-out[i],i]).sort((a,b)=>b[0]-a[0]||a[1]-b[1]);for(let i=0;i<n;i++)out[rank[i][1]]++;return out;}
function blend(local,common,n){const alpha=n/(n+1000);return normalize(local.map((x,i)=>alpha*x+(1-alpha)*common[i]));}
function evaluate(rows,config){const g=blank(),days={};for(const row of rows){g.total++;if(!row.settled){g.excluded++;continue;}const b=tuning.apply(tuning.unpack(row),config),r=policy.apply(b,{quotes:row.quotes},config);if(r.qplPolicy.status!=='ready'){g.excluded++;continue;}const ns=r.pairs[0].numbers.slice().sort((a,b)=>a-b).join('-'),paid=row.payouts.find(p=>p.numbers.slice().sort((a,b)=>a-b).join('-')===ns)?.odds||0;g.evaluated++;g.hits+=paid>0;g.paidHits+=paid>0;g.payoutTotal+=paid;days[row.date]=(days[row.date]||0)+paid-1;}return {all:g,days,metrics:engine.metrics(g)};}
function drawdown(days){let balance=0,peak=0,max=0;for(const d of Object.keys(days).sort()){balance+=days[d];peak=Math.max(peak,balance);max=Math.max(max,peak-balance);}return max;}
function aggregate(results){const all=blank(),days={};for(const r of results){plus(all,r.all);for(const[d,x]of Object.entries(r.days))days[d]=(days[d]||0)+x;}return {all,metrics:engine.metrics(all),maxDrawdown:drawdown(days),netUnits:all.payoutTotal-all.evaluated};}
const compare=(a,b)=>product(b.all)-product(a.all)||b.all.evaluated-a.all.evaluated||JSON.stringify(a.settings).localeCompare(JSON.stringify(b.settings));
function exportTrain(rows,file){const valid=rows.filter(r=>r.settled&&r.horses.filter(h=>!r.starters||r.starters.includes(h[0])).length>=3&&r.quotes.every(q=>q.numbers.length===1&&Number.isFinite(q.odds)&&q.odds>=1)&&new Set(r.quotes.map(q=>q.numbers[0])).size===r.quotes.length&&r.horses.filter(h=>!r.starters||r.starters.includes(h[0])).every(h=>r.quotes.some(q=>q.numbers[0]===h[0])));const lines=[valid.length+' '+rows.length];for(const r of valid){const hs=r.horses.filter(h=>!r.starters||r.starters.includes(h[0])).slice().sort((a,b)=>a[0]-b[0]);lines.push([r.date,hs.length,r.k].join(' '));for(const h of hs){assert.equal(h[6]?.length,16);lines.push([h[0],r.quotes.find(q=>q.numbers[0]===h[0]).odds,h[1],...h[6]].join(' '));}for(const a of hs)for(const b of hs){const p=a!==b?r.payouts.find(x=>x.numbers.includes(a[0])&&x.numbers.includes(b[0])):null;lines.push('0 '+(p?.odds||0));}}fs.writeFileSync(file,lines.join('\n'));}
function safeMin(rows){const groups={};for(const r of rows)(groups[quarter(r.date)]||(groups[quarter(r.date)]=[])).push(r);let limit=2;for(let min=2;min<=19;min++){const enough=Object.values(groups).every(rs=>rs.filter(r=>r.settled&&r.horses.filter(h=>!r.starters||r.starters.includes(h[0])).length>=min+1&&r.horses.filter(h=>!r.starters||r.starters.includes(h[0])).every(h=>r.quotes.some(q=>q.numbers[0]===h[0]&&q.odds>=1))).length>=Math.ceil(rs.length*.6));if(enough)limit=min;}return limit;}
async function main(){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date()).replaceAll('-','');
 const manifest=JSON.parse(fs.readFileSync('qpl-history.json')),rows=manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows).filter(r=>r.date<today),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rolling-v3-'));
 assert(rows.length);manifest.to=rows.at(-1).date;
 const scaler=JSON.parse(fs.readFileSync('data/weighted-v3-scaler.json'));assert.equal(scaler.fitThrough,'20230930');
 const slice=(from,to,venue)=>rows.filter(r=>r.date>=from&&r.date<to&&(!venue||r.venue===venue));let tested=0;
 function search(train,style){assert(train.every(r=>r.date<activeValidation));const file=path.join(tmp,'train.txt'),out=path.join(tmp,'candidates.json');exportTrain(train,file);cp.execFileSync('/tmp/search-v3',[file,out,String(style),String(safeMin(train))],{stdio:['ignore','pipe','inherit']});const d=JSON.parse(fs.readFileSync(out));tested+=d.weightCandidates;return d.finalists.map(x=>x.weights);}
 let activeValidation;const folds=[],commonResults=[],regionalResults=[],selectedResults=[],styleResults=STYLES.map(()=>[]);let live;
 const lastQuarter=quarter(manifest.to);
 for(let from='20240101';from<=lastQuarter;from=shift(from,3)){
  const to=shift(from,3),validationFrom=shift(from,-3),validation=slice(validationFrom,from),test=slice(from,to);if(!test.length)continue;activeValidation=validationFrom;
  assert(scaler.fitThrough<validationFrom);const styleBest=[];
  for(let style=0;style<4;style++){
   const pool=[];for(const months of [24,36]){const trainFrom=shift(from,-months),train=slice(trainFrom,validationFrom);assert(train.length>=500);const weights=search(train,style);
    for(const w of weights){const limit=Math.min(safeMin(train),safeMin(validation));const candidates=run(validation,w).filter(r=>covers(r.all)&&r.settings.min<=limit&&r.settings.max>r.settings.min);candidates.sort(compare);if(candidates[0])pool.push({...candidates[0],months,style,trainFrom,trainThrough:train.at(-1).date});}
   }
   pool.sort(compare);assert(pool.length);styleBest.push(pool[0]);styleResults[style].push(evaluate(test,pool[0].settings));
  }
  styleBest.sort(compare);const best=styleBest[0],config={...best.settings},train=slice(best.trainFrom,validationFrom),venueWeights={},supports={};
  for(const venue of VENUES){const vt=train.filter(r=>r.venue===venue),vv=validation.filter(r=>r.venue===venue);supports[venue]={trainingRaces:vt.length,selectionRaces:vv.length,shrinkage:vt.length/(vt.length+1000),fallback:vt.length<500||vv.length<100};let chosen=config.weights;
   if(!supports[venue].fallback){const options=[config.weights,...search(vt,best.style).map(w=>blend(w,config.weights,vt.length))];const candidates=options.map(weights=>({settings:{...config,weights},...evaluate(vv,{...config,weights})})).filter(x=>covers(x.all));candidates.sort(compare);if(candidates[0])chosen=candidates[0].settings.weights;else supports[venue].fallback=true;}
   venueWeights[venue]=chosen.slice();
  }
  const regional={...config,weightScope:'venue',venueWeights},commonValidation=evaluate(validation,config),regionalValidation=evaluate(validation,regional);
  const choice=covers(regionalValidation.all)&&product(regionalValidation.all)>product(commonValidation.all)?'venue':'common',selected=choice==='venue'?regional:config;
  // Configurations are fully fixed here, before consulting the following quarter outcomes.
  const common=evaluate(test,config),regionalTest=evaluate(test,regional),chosen=choice==='venue'?regionalTest:common;
  for(const x of [common,regionalTest,chosen])assert(covers(x.all),'At least 40% of ALL source races required in every quarter');
  commonResults.push(common);regionalResults.push(regionalTest);selectedResults.push(chosen);
  folds.push({from,to,through:test.at(-1).date,partial:to>manifest.to,months:best.months,trainFrom:best.trainFrom,trainThrough:best.trainThrough,validationFrom,validationThrough:validation.at(-1).date,style:STYLES[best.style],choice,settings:selected,commonSettings:config,regionalSettings:regional,venueSupport:supports,selection:{common:commonValidation.all,regional:regionalValidation.all},common:common.all,regional:regionalTest.all,selected:chosen.all});
  live={forQuarter:from,settings:selected,venueSupport:supports,style:STYLES[best.style],months:best.months};
  console.log('Quarter',from,'choice',choice,'style',live.style,'months',live.months,'coverage',chosen.all.evaluated+'/'+chosen.all.total,'product',product(chosen.all).toFixed(4));
 }
 assert(folds.length>=4);const retrospective=evaluate(rows,live.settings);assert(covers(retrospective.all),'Live preset must cover >=40% of complete historical universe');
 const report={schema:1,version:tuning.VERSION,generatedAt:new Date().toISOString(),sourceRaces:rows.length,from:folds[0].from,to:manifest.to,minimumCoverageRatio:.4,search:{weightCandidates:tested,windows:[24,36],innerSelectionMonths:3,assessmentMonths:3,scaleFitThrough:scaler.fitThrough,venuePriorRaces:1000,minimumVenueTrain:500,minimumVenueSelection:100,historicalQuarterCoverageBuffer:.6,minimumRanksCompared:2},folds,common:aggregate(commonResults),regional:aggregate(regionalResults),selected:aggregate(selectedResults),recordComparison:STYLES.map((label,i)=>({label,...aggregate(styleResults[i])})),live:{...live,retrospective:{all:retrospective.all,metrics:retrospective.metrics}},sourceSha256:Object.fromEntries(manifest.shards.map(s=>[s.url,crypto.createHash('sha256').update(fs.readFileSync(s.url)).digest('hex')])),note:'각 분기 직전 3개월로 가중치·학습기간·기록 방식·공통/경마장별 사용 여부를 선택하고 다음 분기를 평가했습니다. 후보 선정 시 과거 각 분기의 60% 이상에서 두 순위를 비교할 자료가 있는 범위를 사용해 여유를 두며, 실제 평가에서는 각 분기 전체 경주의 40% 이상 조건을 확인합니다. 과거 자료는 이전 실험에도 사용됐으므로 완전히 새로운 독립 검증은 아닙니다. 최종배당 기준 사후 재계산입니다. 진행 중 분기는 확보된 날짜까지만 집계합니다. 현재 선택 조합의 전체 과거 재계산과 분기별 고정 조합 성적은 서로 다릅니다.'};
 fs.writeFileSync('rolling-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({common:report.common,regional:report.regional,selected:report.selected,live:report.live,recordComparison:report.recordComparison},null,2));fs.rmSync(tmp,{recursive:true,force:true});
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={shift,quarter,normalize,blend,evaluate,aggregate,covers,drawdown,safeMin};
