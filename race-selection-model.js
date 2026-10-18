'use strict';
// Independent, fixed-rule screening model. Scores are not calibrated probabilities.
// Outcomes and payouts are deliberately absent from the score inputs.
const RaceSelectionModel=(()=>{
 const VERSION='race-screening-v2';
 const values=(h,w)=>w.map((_,j)=>Number.isFinite(h.weighted_v3_features?.[j])?h.weighted_v3_features[j]:.5);
 const clamp=x=>Math.max(0,Math.min(1,Number.isFinite(x)?x:0));
 const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
 const pairKey=a=>a.map(Number).sort((a,b)=>a-b).join('-');
 const LEGACY_JOINT_VERSION='joint-selection-v1',JOINT_VERSION='joint-selection-v2';
 const JOINT_TARGETS=Object.freeze([40,50,60,80]);
 const LEGACY_JOINT_LABELS=['축마 점수 우위','상대마 점수 우위','두 말 점수 차이','출전 두수','축마 전적 충실도','상대마 전적 충실도','마체중 자료 충실도','기수·조교사 자료 충실도','두 말 평균 점수','전체 점수 분산','축마 우위 × 상대마 경합','마체중 점수 × 자료 존재'];
 const JOINT_LABELS=Object.freeze(['축마와 차순위 점수 격차','구매 상대마와 비구매 경쟁마 격차','상위 3두 점수 집중도','적정 출전 두수 이탈도 |두수−10|','구매마 전적·자료 신뢰도','하위권 신예·장기휴양 불확실성','구매마 최근 3경주 착순 추세','등급·거리 적합 구간']);
 const JOINT_BOUNDS=Object.freeze([[-10,10],[-10,10],[-10,10],[-10,0],[0,10],[-10,0],[-10,10],[-10,10]].map(Object.freeze));
 const DEFAULT_COEFFICIENTS=Object.freeze([2,2,1,-1,2,-1,1,0]);
 const labels=version=>version===LEGACY_JOINT_VERSION?LEGACY_JOINT_LABELS:JOINT_LABELS;
 function projectCoefficients(c){
  const out=JOINT_BOUNDS.map(([lo,hi],i)=>Math.max(lo,Math.min(hi,Number.isFinite(c?.[i])?c[i]:0)));
  if(!out.some(x=>x!==0))out[4]=1;return out;
 }
 function jointConfig(s){
  if(!s||![JOINT_VERSION,LEGACY_JOINT_VERSION].includes(s.version)||!Array.isArray(s.coefficients)||s.coefficients.length!==labels(s.version).length||!s.coefficients.every((x,i)=>Number.isFinite(x)&&Math.abs(x)<=10&&(s.version===LEGACY_JOINT_VERSION||x>=JOINT_BOUNDS[i][0]&&x<=JOINT_BOUNDS[i][1]))||!s.coefficients.some(x=>x!==0)||!Number.isInteger(s.threshold)||s.threshold<0||s.threshold>100||!JOINT_TARGETS.includes(s.target))return null;
  return {version:s.version,coefficients:s.coefficients.slice(),threshold:s.threshold,target:s.target};
 }
 // The compact archive keeps only prior-race metadata needed by screening.
 function recentTrend(s){
  if(Number.isFinite(s?.screening?.recentTrend))return clamp(s.screening.recentTrend);
  const recent=(s?.detail?.recent||[]).filter(r=>Number.isFinite(r.finish)&&Number.isFinite(r.fieldSize)&&r.fieldSize>1&&r.finish>=1&&r.finish<=r.fieldSize).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(-3);
  if(recent.length<3)return .5;
  const form=r=>(r.fieldSize-r.finish)/(r.fieldSize-1);
  return clamp(.5+(form(recent[2])-form(recent[0]))/2);
 }
 function selectionFeatures(field,weights,selected,anchor,context={}){
  const total=weights.reduce((s,x)=>s+x,0);if(!total||!field.length)return null;
  const raw=field.map(h=>values(h,weights).reduce((s,x,j)=>s+x*weights[j]/total,0)),numbers=new Set(selected.map(Number));
  const a=field.findIndex(h=>+h.number===+anchor),chosen=field.map((h,i)=>numbers.has(+h.number)?i:-1).filter(i=>i>=0);
  if(a<0||!chosen.length||chosen.length!==numbers.size)return null;
  const order=raw.map((_,i)=>i).sort((a,b)=>raw[b]-raw[a]||+field[a].number-+field[b].number),support=i=>field[i].weighted_v3_support;
  const others=order.filter(i=>i!==a),outsiders=order.filter(i=>!numbers.has(+field[i].number)),partners=chosen.filter(i=>i!==a);
  const gap=(x,y)=>clamp(.5+(x-y)*3),anchorGap=gap(raw[a],raw[others[0]]??raw[a]);
  const partnerGap=partners.length&&outsiders.length?gap(Math.min(...partners.map(i=>raw[i])),raw[outsiders[0]]):.5;
  // Remove the uniform-field baseline so concentration does not merely reward small fields.
  const sum=raw.reduce((s,x)=>s+x,0),share=sum?order.slice(0,3).reduce((s,i)=>s+raw[i],0)/sum:3/field.length;
  const concentration=clamp(.5+2*(share-Math.min(3,field.length)/field.length));
  const quality=i=>.5*clamp((support(i)?.starts||0)/5)+.5*weights.reduce((s,w,j)=>s+w*(support(i)?.available?.[j]===true?1:0),0)/total;
  const lower=order.slice(4),uncertainty=i=>{
   const s=support(i),starts=s?.starts,rest=s?.screening?.restDays??s?.detail?.restDays;
   // Unknown support is uncertain too; missing records cannot earn a quality bonus.
   return !Number.isFinite(starts)||starts<=3||Number.isFinite(rest)&&rest>=180?1:0;
  };
  const grade=String(context.grade??'').match(/([1-6])(?:등급)?$/),distance=+context.distance;
  // A learnable prior, not a claim of higher observed ROI. Missing metadata is neutral.
  const classDistance=grade&&distance>0?([3,4,5].includes(+grade[1])&&distance>=1300&&distance<=1700?1:+grade[1]===6&&distance<=1200?0:.5):.5;
  return [anchorGap,partnerGap,concentration,clamp(Math.abs(field.length-10)/10),mean(chosen.map(quality)),lower.length?mean(lower.map(uncertainty)):0,mean(chosen.map(i=>recentTrend(support(i)))),classDistance];
 }
 function jointFeatures(field,weights,anchor,partner,context={},version=JOINT_VERSION){
  return version===LEGACY_JOINT_VERSION?legacyJointFeatures(field,weights,anchor,partner):selectionFeatures(field,weights,[...new Set([+anchor,+partner])],anchor,context);
 }
 // Only pre-race horse features, support flags and selected horse numbers enter here.
 function legacyJointFeatures(field,weights,anchor,partner){
  const total=weights.reduce((s,x)=>s+x,0),raw=field.map(h=>values(h,weights).reduce((s,x,j)=>s+x*weights[j]/total,0));
  const a=field.findIndex(h=>+h.number===+anchor),b=field.findIndex(h=>+h.number===+partner);
  if(a<0||b<0)return null;
  const others=raw.filter((_,i)=>i!==a&&i!==b),boundary=others.length?Math.max(...others):0;
  const support=i=>field[i].weighted_v3_support,has=(i,j)=>support(i)?.available?.[j]===true?1:0;
  const quality=i=>.5*clamp((support(i)?.starts||0)/5)+.5*weights.reduce((s,w,j)=>s+w*has(i,j),0)/total;
  const ag=clamp(.5+(raw[a]-boundary)*3),bg=clamp(.5+(raw[b]-boundary)*3),body=(has(a,8)+has(b,8))/2;
  return [ag,bg,clamp(Math.abs(raw[a]-raw[b])*5),clamp((field.length-5)/11),quality(a),quality(b),body,(has(a,5)+has(a,6)+has(b,5)+has(b,6))/4,(raw[a]+raw[b])/2,clamp((Math.max(...raw)-Math.min(...raw))*3),ag*(1-bg),mean([a,b].map(i=>has(i,8)*(field[i].weighted_v3_features?.[8]??.5)))];
 }
 function jointScore(features,coefficients){
  const scale=coefficients.reduce((s,x)=>s+Math.abs(x),0)||1;
  return Math.max(0,Math.min(99,Math.floor(50+49*features.reduce((s,x,j)=>s+(2*x-1)*coefficients[j],0)/scale)));
 }
 function strictness(value){return Number.isFinite(+value)?Math.max(0,Math.min(100,Math.round(+value))):0;}
 function qualifies(result,value){const threshold=strictness(value);return result?.available===true&&threshold<100&&(threshold===0||result.score>=threshold);}
 function strategyPairs(result,settings){
  if(settings.betStrategy==='hybrid'){
   const T=typeof module!=='undefined'?require('./tuning-model.js'):TuningModel,selected=T.hybridSelection(result,settings);
   if(!selected.ready)return [];
   const pairs=[];
   for(const combo of selected.combos)for(let i=0;i<combo.numbers.length;i++)for(let j=i+1;j<combo.numbers.length;j++){
    const numbers=[combo.numbers[i],combo.numbers[j]],pick=(result.allPairs||result.pairs||[]).find(p=>pairKey(p.numbers)===pairKey(numbers));
    if(!pick)return [];pairs.push({pick,anchor:result.horses.find(h=>+h.number===+numbers[0]),partner:result.horses.find(h=>+h.number===+numbers[1])});
   }return pairs;
  }
  if(['trio-box4','trio-box3','trio-box3-2'].includes(settings.betStrategy)){
   const box=result.horses.slice().sort((a,b)=>b.prob-a.prob||a.number-b.number).slice(0,4);
   if(box.length!==4)return [];
   const pairs=[];for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){
    if(settings.betStrategy==='trio-box3-2'&&i===2&&j===3)continue;
    const numbers=[box[i].number,box[j].number],pick=(result.allPairs||result.pairs).find(p=>pairKey(p.numbers)===pairKey(numbers));
    if(!pick)return [];pairs.push({pick,anchor:box[i],partner:box[j]});
    // Each anchor pair occurs in two purchased triples; each other pair occurs once.
    if(settings.betStrategy==='trio-box3'&&i===0||settings.betStrategy==='trio-box3-2'&&i===0&&j===1)pairs.push({pick,anchor:box[i],partner:box[j]});
   }return pairs;
  }
  const p=result.qplPolicy,need=settings.betStrategy==='qpl-anchor2'?2:1;
  const picks=p?.status==='ready'?(p.candidates||[]).filter(x=>x.pick&&Number.isFinite(x.pick.prob)).slice(0,need):[];
  return picks.length===need?picks.map(x=>({...x,anchor:p.anchor})):[];
 }
 function strategyFeatures(result,settings,version=settings.screening?.version||JOINT_VERSION){
  if(settings.betStrategy==='place-single'){
   const T=typeof module!=='undefined'?require('./tuning-model.js'):TuningModel,s=T.placeSelection(result,settings);
   return s.ready?jointFeatures(result.horses,settings.weights,s.picks[0].numbers[0],s.picks[0].numbers[0],result,version):null;
  }
  const pairs=strategyPairs(result,settings);if(!pairs.length)return null;
  if(version===LEGACY_JOINT_VERSION){
   const features=pairs.map(p=>legacyJointFeatures(result.horses,settings.weights,p.anchor.number,p.partner.number));
   return features.every(Boolean)?LEGACY_JOINT_LABELS.map((_,j)=>mean(features.map(f=>f[j]))):null;
  }
  const selected=[...new Set(pairs.flatMap(p=>p.pick.numbers.map(Number)))];
  const anchor=['hybrid','trio-box3','trio-box4','trio-box3-2'].includes(settings.betStrategy)?result.horses.filter(h=>selected.includes(+h.number)).slice().sort((a,b)=>b.prob-a.prob||+a.number-+b.number)[0]?.number:pairs[0].anchor.number;
  return selectionFeatures(result.horses,settings.weights,selected,anchor,result);
 }
 function score(result,settings){
  const joint=jointConfig(settings.screening),version=joint?.version||JOINT_VERSION,features=strategyFeatures(result,settings,version);
  return {version:joint?version:VERSION,available:!!features,score:features?jointScore(features,joint?.coefficients||DEFAULT_COEFFICIENTS):null,...(features?{components:Object.fromEntries(labels(version).map((name,i)=>[name,features[i]]))}:{})};
 }
 function metrics(g){
  const rate=g.evaluated?g.hits/g.evaluated:null,average=g.paidHits?g.payoutTotal/g.paidHits:null;
  const product=!g.evaluated||g.paidHits!==g.hits?null:g.payoutTotal/g.evaluated;
  return {rate,average,product};
 }
 function curve(rows){
  const blank=()=>({evaluated:0,hits:0,paidHits:0,payoutTotal:0});
  const buckets=Array.from({length:100},blank);let eligible=0;
  for(const row of rows){
   const pick=Object.prototype.hasOwnProperty.call(row,'hit')?row:row.candidates[0];if(!row.settled||row.ready===false||!pick||!row.screening?.available)continue;
   eligible++;const b=buckets[Math.min(99,Math.floor(row.screening.score))];b.evaluated++;
   if(pick.hit){b.hits++;if(Number.isFinite(pick.payout)&&pick.payout>=0){b.paidHits++;b.payoutTotal+=pick.payout;}}
  }
  const running=blank(),points=Array(101);
  for(let value=100;value>=0;value--){
   if(value<100)for(const k of Object.keys(running))running[k]+=buckets[value][k];
   const g={...running,total:rows.length,excluded:rows.length-running.evaluated};
   points[value]={strictness:value,...g,...metrics(g),ratio:rows.length?g.evaluated/rows.length:null};
  }
  return {version:VERSION,total:rows.length,eligible,unavailable:rows.length-eligible,points};
 }
 return {VERSION,JOINT_VERSION,LEGACY_JOINT_VERSION,LEGACY_JOINT_LABELS,JOINT_BOUNDS,DEFAULT_COEFFICIENTS,labels,projectCoefficients,recentTrend,selectionFeatures,JOINT_TARGETS,JOINT_LABELS,strategyPairs,strategyFeatures,jointConfig,jointFeatures,jointScore,strictness,qualifies,score,metrics,curve};
})();
if(typeof module!=='undefined')module.exports=RaceSelectionModel;
