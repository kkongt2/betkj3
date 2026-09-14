'use strict';
const TuningModel=(()=>{
 const engine=typeof module!=='undefined'?require('./model.js'):{score,probs};
 const VERSION='user-weighted-v1';
 const FEATURES=[
  ['place','최근 1년 입상률',33,'1·2·3착 비율, 적은 출전 수는 보정'],
  ['win','최근 1년 승률',9,'1착 비율, 적은 출전 수는 보정'],
  ['distance','동일 거리 입상률',18,'같은 거리에서의 3착 이내 비율'],
  ['rating','상대 레이팅',12,'이번 출전마 사이의 레이팅 수준'],
  ['recent','최근 5경주 흐름',10,'최근 경주에 더 비중을 둔 착순 점수'],
  ['jockey','기수 입상률',6,'출전 기수 사이의 연승률 비교'],
  ['trainer','조교사 입상률',4,'출전 조교사 사이의 연승률 비교'],
  ['burden','부담중량 유리함',3,'평균보다 가벼우면 가점, 무거우면 감점'],
  ['body','마체중 변화 감점',3,'큰 체중 변화에 감점; 가중치가 클수록 감점 강화'],
  ['interval','출전 간격',2,'적정 간격 가점, 장기 휴양 감점']
 ].map(([id,label,weight,description])=>({id,label,weight,description}));
 const defaults=()=>FEATURES.map(f=>f.weight);
 function validWeights(w){return Array.isArray(w)&&w.length===FEATURES.length&&w.every(n=>Number.isInteger(n)&&n>=0&&n<=100)&&w.some(n=>n>0);}
 function settings(s={}){return {anchorMode:s?.anchorMode==='analysis'?'analysis':'odds',modelMode:s?.modelMode==='custom'?'custom':'existing',weights:validWeights(s?.weights)?s.weights.slice():defaults()};}
 function apply(base,input){
  const config=settings(input);if(config.modelMode!=='custom')return base;
  const field=base.horses.slice().sort((a,b)=>+a.number-+b.number),sum=config.weights.reduce((a,b)=>a+b,0);
  const features=field.map(h=>h.tuningFeatures||engine.score(h,field).features);
  const raw=features.map(f=>f.reduce((s,x,i)=>s+x*config.weights[i]/sum,0)*6.28),mean=raw.reduce((a,b)=>a+b,0)/raw.length;
  const strengths=raw.map(x=>Math.exp(Math.max(-4,Math.min(4,(x-mean)*.6))));
  const place=engine.probs(strengths,base.k),pair=engine.probs(strengths,3);
  const refresh=(item,prob)=>({...item,prob,ev:item.odds?prob*item.odds-1:null});
  const byNumber=new Map(field.map((h,i)=>[+h.number,i]));
  const places=base.places.map(x=>refresh(x,place.p[byNumber.get(+x.numbers[0])]));
  const pairs=base.pairs.map(x=>{const ids=x.numbers.map(n=>byNumber.get(+n)).sort((a,b)=>a-b);return refresh(x,pair.q[ids.join('-')]);});
  const sort=(a,b)=>b.prob-a.prob||+a.numbers[0]-+b.numbers[0];places.sort(sort);pairs.sort(sort);
  const horses=field.map((h,i)=>({...h,prob:place.p[i]})).sort((a,b)=>b.prob-a.prob||+a.number-+b.number);
  return {...base,horses,places,pairs,model:VERSION,models:{place:VERSION,pair:VERSION},advanced:{place:false,pair:false},selectiveActive:{place:false,pair:false},selection:{place:{qualified:false,reason:'사용자 가중치 적용 · 별도 선별 검증 없음'},pair:{qualified:false,reason:'사용자 가중치 적용'}},selectivePicks:{place:null,pair:null},tuning:config};
 }
 function pack(base,market){
  const field=base.horses.slice().sort((a,b)=>+a.number-+b.number);
  return {date:base.date,venue:base.venue,race:base.race_no,k:base.k,models:base.models,
   horses:base.horses.map(h=>[+h.number,base.places.find(p=>+p.numbers[0]===+h.number).prob,h.quality,engine.score(h,field).features]),
   pairs:base.pairs.map(p=>[...p.numbers.map(Number),p.prob]),quotes:market?.quotes||[],starters:base.official_result?.starters||null,
   settled:base.official_result?.pair?.status==='confirmed'&&!!base.official_result.pair.payouts?.length,payouts:base.official_result?.pair?.payouts||[]};
 }
 function unpack(row){
  const horses=row.horses.map(([number,prob,quality,tuningFeatures])=>({number,name:String(number),prob,quality,tuningFeatures}));
  return {date:row.date,venue:row.venue,race_no:row.race,k:row.k,horses,models:row.models,mode:'accuracy',reasons:[],
   places:horses.map(h=>({numbers:[h.number],names:[h.name],prob:h.prob,quality:h.quality})).sort((a,b)=>b.prob-a.prob),
   pairs:row.pairs.map(([a,b,prob])=>({numbers:[a,b],names:[String(a),String(b)],prob})),
   official_result:{starters:row.starters,pair:{status:row.settled?'confirmed':'pending',payouts:row.payouts}}};
 }
 return {FEATURES,VERSION,defaults,validWeights,settings,apply,pack,unpack};
})();
if(typeof module!=='undefined')module.exports=TuningModel;
