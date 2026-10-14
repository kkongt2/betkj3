'use strict';
// Training-only robustness. Official historical returns remain uncapped.
const SearchPolicy=(()=>{
 const T=typeof module!=='undefined'?require('./tuning-model.js'):TuningModel;
 const VERSION='robust-search-v1';
 const defaults=()=>({version:VERSION,cap:60,floor:.65,quarters:8,minimum:30});
 function config(x){
  if(x===undefined||x===null)return null;
  if(x.version!==VERSION||!Number.isInteger(x.cap)||x.cap<1||x.cap>1000||!Number.isFinite(x.floor)||x.floor<0||x.floor>2||Math.abs(x.floor*100-Math.round(x.floor*100))>1e-8||x.quarters!==8||x.minimum!==30)throw Error('안정성 탐색 설정을 확인해 주세요.');
  return {version:VERSION,cap:x.cap,floor:x.floor,quarters:8,minimum:30};
 }
 const blank=()=>({total:0,evaluated:0,hits:0,paidHits:0,excluded:0,payoutTotal:0});
 const metrics=g=>({rate:g.evaluated?g.hits/g.evaluated:null,average:g.paidHits?g.payoutTotal/g.paidHits:null,product:!g.evaluated||g.paidHits!==g.hits?null:g.payoutTotal/g.evaluated});
 const quarter=date=>date.slice(0,4)+'Q'+Math.ceil(+date.slice(4,6)/3);
 function create(input){
  const settings=config(input);if(!settings)return null;
  const capped=blank(),blocks=new Map();
  const get=date=>{const id=quarter(date);if(!blocks.has(id))blocks.set(id,blank());return blocks.get(id);};
  function touch(date){for(const g of [capped,get(date)]){g.total++;g.excluded++;}}
  function bet(date,hit,payout){for(const g of [capped,get(date)]){g.evaluated++;g.excluded--;if(hit){g.hits++;if(Number.isFinite(payout)&&payout>=0){g.paidHits++;g.payoutTotal+=Math.min(settings.cap,payout);}}}}
  function finish(objective='product'){
   const recent=[...blocks].sort(([a],[b])=>a.localeCompare(b)).slice(-settings.quarters);
   const quarters=recent.map(([id,all])=>({id,all,product:metrics(all).product,used:all.evaluated>=settings.minimum&&all.hits===all.paidHits}));
   const used=quarters.filter(q=>q.used),worst=used.length>=2?Math.min(...used.map(q=>q.product)):null;
   const penalty=objective==='product'&&worst!==null&&settings.floor>0?Math.min(1,worst/settings.floor):1,m=metrics(capped);
   return {settings,capped,metrics:m,quarters,worst,penalty,score:Number.isFinite(m[objective])?m[objective]*penalty:null};
  }
  return {touch,bet,finish};
 }
 function summarize(rows,input,objective='product',select=p=>p.settled&&p.ready){
  const acc=create(input);if(!acc)return null;
  for(const p of rows){acc.touch(p.date);if(select(p))acc.bet(p.date,p.hit,p.payout);}
  return acc.finish(objective);
 }
 function guidance(all,training,objective,minHitRate=15,coverage=.4){
  const score=training?training.score:metrics(all)[objective];
  if(!Number.isFinite(score)||!all.evaluated||all.hits!==all.paidHits)return -Infinity;
  const hit=minHitRate?Math.min(1,100*all.hits/all.evaluated/minHitRate):1;
  const covered=coverage?Math.min(1,all.evaluated/Math.max(1,all.total*coverage)):1;
  return score*hit*hit*covered*covered;
 }
 const value=(c,objective)=>c?.training?c.training.score:c?.metrics?.[objective];
 function distance(a,b){const aw=a.weights||a,bw=b.weights||b,as=aw.reduce((s,x)=>s+x,0),bs=bw.reduce((s,x)=>s+x,0);return T.ACTIVE.reduce((s,i)=>s+Math.abs(aw[i]/as-bw[i]/bs),0)/2;}
 function pool(items,objective='product',maximum=8){
  const unique=new Map();for(const c of items||[])if(c&&Number.isFinite(value(c,objective))){const key=JSON.stringify({...T.settings(c.settings),min:c.settings.min,max:c.settings.max}),prior=unique.get(key);if(!prior||value(c,objective)>=value(prior,objective))unique.set(key,c);}
  const sorted=[...unique.values()].sort((a,b)=>value(b,objective)-value(a,objective)||(b.metrics?.product||0)-(a.metrics?.product||0)||b.all.evaluated-a.all.evaluated),out=sorted.splice(0,Math.min(4,maximum));
  while(out.length<maximum&&sorted.length){
   const far=c=>Math.min(...out.map(p=>distance(c.settings,p.settings))),strong=sorted.filter(c=>value(c,objective)>=value(out[0],objective)*.5&&far(c)>=.30);
   const chosen=(strong.length?strong:sorted.slice().sort((a,b)=>far(b)-far(a)||value(b,objective)-value(a,objective)))[0];out.push(chosen);sorted.splice(sorted.indexOf(chosen),1);
  }
  return out;
 }
 function validate(x,objective='product'){
  config(x?.settings);if(!x?.settings||!x.capped||!Array.isArray(x.quarters)||x.quarters.length>8)throw Error('탐색 점수 자료를 확인해 주세요.');
  const check=g=>{if(!g||!['total','evaluated','hits','paidHits','excluded'].every(k=>Number.isSafeInteger(g[k])&&g[k]>=0)||g.evaluated>g.total||g.hits>g.evaluated||g.paidHits!==g.hits||g.excluded!==g.total-g.evaluated||!Number.isFinite(g.payoutTotal)||g.payoutTotal<0||g.payoutTotal>g.paidHits*x.settings.cap+1e-7)throw Error('탐색 점수 통계를 확인해 주세요.');};check(x.capped);
  const ids=new Set();for(const q of x.quarters){if(!/^\d{4}Q[1-4]$/.test(q.id)||ids.has(q.id))throw Error('분기 탐색 자료를 확인해 주세요.');ids.add(q.id);check(q.all);q.product=metrics(q.all).product;q.used=q.all.evaluated>=x.settings.minimum;}
  x.metrics=metrics(x.capped);const used=x.quarters.filter(q=>q.used);x.worst=used.length>=2?Math.min(...used.map(q=>q.product)):null;
  x.penalty=objective==='product'&&x.worst!==null&&x.settings.floor>0?Math.min(1,x.worst/x.settings.floor):1;if(!Number.isFinite(x.metrics[objective]))throw Error('탐색 목표 점수를 확인해 주세요.');x.score=x.metrics[objective]*x.penalty;return x;
 }
 return {VERSION,defaults,config,create,summarize,guidance,value,distance,pool,validate,metrics};
})();
if(typeof module!=='undefined')module.exports=SearchPolicy;
