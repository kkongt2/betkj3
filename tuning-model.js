'use strict';
const TuningModel=(()=>{
 const engine=typeof module!=='undefined'?require('./model.js'):{score,probs};
 const VERSION='user-weighted-v3';
 const FEATURES=[["place","최근 1년 연승 입상률",22,"실제 연승 적중 착순 적용 · 최근 기록 강조 · 소표본 보정"],["win","최근 1년 승률",0,"별도 승률 포함·제외를 시간순 비교 · 0%이면 제외"],["distance","유사 거리 연승 입상률",14,"현재 거리 ±200m · 전체 입상률로 소표본 보정"],["rating","상대 레이팅",9,"출전마 평균과 차이 · 극단값에 흔들리는 최소·최대 환산 제거"],["recent","출전 두수 보정 최근 착순",13,"최근 5경주 착순을 해당 경주 출전 두수로 보정"],["jockey","기수 기대 대비 입상",7,"과거 기승마 전적으로 예상한 입상 대비 실제 성적 · 소표본 보정"],["trainer","조교사 기대 대비 입상",5,"과거 관리마 전적으로 예상한 입상 대비 실제 성적 · 소표본 보정"],["burden","직전 대비 부담중량",5,"같은 등급·유사 레이팅일 때 자신의 직전 중량과 비교"],["body","입상 당시 마체중과 차이",3,"자신의 과거 입상 체중 중앙값과 비교 · 최소 3회"],["interval","평소 출전 간격과 차이",2,"자신의 과거 출전 주기와 비교 · 최소 3개 간격"],["speed","등급·거리·주로 보정 평균 기록",4,"이전 경주 기록을 해당 경주 이전의 경마장·거리·주로 기준 기록과 비교"],["margin","선두와의 시간차",6,"이전 경주 선두와의 시간차를 1200m 기준으로 보정 · 거리 단위 착차 아님"],["opposition","과거 상대 수준·등급 변화",4,"과거 상대 평균 레이팅과 현재 출전마 수준·등급 비교"],["speed_median","보정 기록 중앙값",3,"최근 5경주의 유효 등급 보정 기록 중앙값"],["speed_best","보정 최고 기록",2,"최근 5경주 최고 보정 기록 · 소표본 보정"],["speed_consistency","보정 기록 안정성",1,"최근 5경주 보정 기록의 표준편차 감점 · 최소 3회"]].map(([id,label,weight,description])=>({id,label,weight,description}));
 const defaults=()=>FEATURES.map(f=>f.weight);
 function validWeights(w){return Array.isArray(w)&&[10,13,FEATURES.length].includes(w.length)&&w.every(n=>Number.isInteger(n)&&n>=0&&n<=100)&&w.some(n=>n>0);}
 function settings(s={}){
  const old=[33,9,18,12,10,6,4,3,3,2],v2=[22,0,14,9,13,7,5,5,3,2,10,6,4];
  let mode=s.modelMode==='legacy'||s.modelMode==='custom'&&s.weights?.length===10?'legacy':s.modelMode==='v2'||s.modelMode==='custom'&&s.weights?.length===13?'v2':s.modelMode==='existing'?'existing':'custom';
  const width=mode==='legacy'?10:mode==='v2'?13:16, fallback=width===10?old:width===13?v2:defaults();
  const weights=validWeights(s.weights)&&(mode==='existing'||s.weights.length===width)?s.weights.slice():fallback;
  const out={anchorMode:s.anchorMode==='analysis'?'analysis':'odds',modelMode:mode,weights};
  if(mode==='custom'&&s.weightScope==='venue'){
   out.weightScope='venue';out.venueWeights={};for(const v of ['seoul','busan','jeju'])if(validWeights(s.venueWeights?.[v])&&s.venueWeights[v].length===16)out.venueWeights[v]=s.venueWeights[v].slice();
  }
  return out;
 }
 const label=mode=>mode==='legacy'?'이전 10개 지표':mode==='v2'?'이전 13개 지표':mode==='custom'?'수정 지표 가중치 (등급 보정)':'기존 학습 모델';
 function weightsFor(s,venue){return s.modelMode==='custom'&&s.weightScope==='venue'&&validWeights(s.venueWeights?.[venue])?s.venueWeights[venue]:s.weights;}
 function apply(base,input){
  const config=settings(input);if(config.modelMode==='existing')return base;
  config.weights=weightsFor(config,base.venue).slice();
  const legacy=config.modelMode==='legacy',v2=config.modelMode==='v2',version=legacy?'user-weighted-v1':v2?'user-weighted-v2':VERSION,starters=base.official_result?.starters;
  if(!legacy&&Array.isArray(starters)&&starters.length){const active=new Set(starters.map(Number));base={...base,horses:base.horses.filter(h=>active.has(+h.number)),places:base.places.filter(p=>p.numbers.every(n=>active.has(+n))),pairs:base.pairs.filter(p=>p.numbers.every(n=>active.has(+n)))};base.k=base.horses.length<=7?2:3;}
  if(!base.horses.length)return base;
  const field=base.horses.slice().sort((a,b)=>+a.number-+b.number),sum=config.weights.reduce((a,b)=>a+b,0);
  const features=field.map(h=>legacy?(h.tuningFeatures||engine.score(h,field).features):(v2?(h.weighted_features||Array(13).fill(.5)):(h.weighted_v3_features||Array(16).fill(.5))));
  const raw=features.map(f=>f.reduce((s,x,i)=>s+x*config.weights[i]/sum,0)*6.28),mean=raw.reduce((a,b)=>a+b,0)/raw.length;
  const strengths=raw.map(x=>Math.exp(Math.max(-4,Math.min(4,(x-mean)*.6))));
  const place=engine.probs(strengths,base.k),pair=engine.probs(strengths,3);
  const refresh=(item,prob)=>({...item,prob,ev:item.odds?prob*item.odds-1:null});
  const byNumber=new Map(field.map((h,i)=>[+h.number,i]));
  const places=base.places.map(x=>refresh(x,place.p[byNumber.get(+x.numbers[0])]));
  const pairs=base.pairs.map(x=>{const ids=x.numbers.map(n=>byNumber.get(+n)).sort((a,b)=>a-b);return refresh(x,pair.q[ids.join('-')]);});
  const sort=(a,b)=>b.prob-a.prob||+a.numbers[0]-+b.numbers[0];places.sort(sort);pairs.sort(sort);
  const horses=field.map((h,i)=>({...h,prob:place.p[i],reasons:legacy?h.reasons:[...FEATURES.map((f,j)=>({label:f.label,value:features[i][j],weight:config.weights[j]})).filter(x=>x.weight>0).sort((a,b)=>b.weight-a.weight).slice(0,3).map(x=>x.label+' 점수 '+Math.round(x.value*100)+' / 가중치 '+x.weight+'%'),h.weighted_support?.through?'전적 기준 '+h.weighted_support.through:'이전 전적 부족 · 중립값/사전값 포함']})).sort((a,b)=>b.prob-a.prob||+a.number-+b.number);
  return {...base,horses,places,pairs,model:version,models:{place:version,pair:version},advanced:{place:false,pair:false},selectiveActive:{place:false,pair:false},selection:{place:{qualified:false,reason:'사용자 가중치 적용 · 별도 선별 검증 없음'},pair:{qualified:false,reason:'사용자 가중치 적용'}},selectivePicks:{place:null,pair:null},tuning:config};
 }
 function pack(base,market){
  const field=base.horses.slice().sort((a,b)=>+a.number-+b.number);
  return {date:base.date,venue:base.venue,race:base.race_no,k:base.k,models:base.models,
   horses:base.horses.map(h=>[+h.number,base.places.find(p=>+p.numbers[0]===+h.number).prob,h.quality,engine.score(h,field).features,h.weighted_features||null,h.weighted_support||null,h.weighted_v3_features||null,h.weighted_v3_support||null]),
   pairs:base.pairs.map(p=>[...p.numbers.map(Number),p.prob]),quotes:market?.quotes||[],starters:base.official_result?.starters||null,
   settled:base.official_result?.pair?.status==='confirmed'&&!!base.official_result.pair.payouts?.length,payouts:base.official_result?.pair?.payouts||[]};
 }
 function unpack(row){
  const horses=row.horses.map(([number,prob,quality,tuningFeatures,weighted_features,weighted_support,weighted_v3_features,weighted_v3_support])=>({number,name:String(number),prob,quality,tuningFeatures,weighted_features,weighted_support,weighted_v3_features,weighted_v3_support}));
  return {date:row.date,venue:row.venue,race_no:row.race,k:row.k,horses,models:row.models,mode:'accuracy',reasons:[],
   places:horses.map(h=>({numbers:[h.number],names:[h.name],prob:h.prob,quality:h.quality})).sort((a,b)=>b.prob-a.prob),
   pairs:row.pairs.map(([a,b,prob])=>({numbers:[a,b],names:[String(a),String(b)],prob})),
   official_result:{starters:row.starters,pair:{status:row.settled?'confirmed':'pending',payouts:row.payouts}}};
 }
 return {FEATURES,VERSION,label,weightsFor,defaults,validWeights,settings,apply,pack,unpack};
})();
if(typeof module!=='undefined')module.exports=TuningModel;

