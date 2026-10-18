'use strict';
const TuningModel=(()=>{
 const engine=typeof module!=='undefined'?require('./model.js'):{score,probs};
 const VERSION='user-weighted-seoul-pace21-v1';
 const FEATURES=[["place","최근 5경주 연승 입상률",22,"해당 말의 직전 5경주 · 실제 연승 입상 횟수 ÷ 출전 횟수"],["win","최근 5경주 승률",0,"해당 말의 직전 5경주 · 1착 횟수 ÷ 출전 횟수"],["distance","최근 5경주 유사 거리 입상률",14,"직전 5경주 중 현재 거리 ±200m · 대상 경주가 없으면 최근 5경주 입상률"],["rating","상대 레이팅",9,"출전마 평균과 차이 · 극단값에 흔들리는 최소·최대 환산 제거"],["recent","최근 5경주 착순 · 최근 강조",8,"출전 두수 보정 착순 · 최근 경주에 가중치와 소표본 보정 적용"],["jockey","기수 기대 대비 입상",7,"과거 기승마 전적으로 예상한 입상 대비 실제 성적 · 소표본 보정"],["trainer","조교사 기대 대비 입상",5,"과거 관리마 전적으로 예상한 입상 대비 실제 성적 · 소표본 보정"],["burden","직전 대비 부담중량",5,"같은 등급·유사 레이팅일 때 자신의 직전 중량과 비교"],["body","입상 당시 마체중과 차이",3,"자신의 과거 입상 체중 중앙값과 비교 · 최소 3회"],["interval","평소 출전 간격과 차이",2,"자신의 과거 출전 주기와 비교 · 최소 3개 간격"],["speed","등급·거리·주로 보정 평균 기록",4,"이전 경주 기록을 해당 경주 이전의 경마장·거리·주로 기준 기록과 비교"],["margin","선두와의 시간차",6,"이전 경주 선두와의 시간차를 1200m 기준으로 보정 · 거리 단위 착차 아님"],["opposition","과거 상대 수준·등급 변화",4,"과거 상대 평균 레이팅과 현재 출전마 수준·등급 비교"],["speed_median","보정 기록 중앙값",3,"최근 5경주의 유효 등급 보정 기록 중앙값"],["speed_best","보정 최고 기록",2,"최근 5경주 최고 보정 기록 · 소표본 보정"],["speed_consistency","보정 기록 안정성",1,"최근 5경주 보정 기록의 표준편차 감점 · 최소 3회"],["mean_finish5","최근 5경주 두수 보정 평균 순위",5,"각 경주의 (두수−순위)/(두수−1)을 동일 가중치로 평균 · 높을수록 우수"],["finish_trend", "최근 5경주 착순 상승 추세", 0, "두수 보정 착순의 출전 순서별 기울기 · 상승일수록 우수 · 최소 2회, 소표본 보정"],["speed_trend", "최근 5경주 보정 기록 상승 추세", 0, "보정 기록의 출전 순서별 기울기 · 빨라질수록 우수 · 최소 2회, 소표본 보정"],["speed_last", "직전 경주 보정 기록", 0, "평균에 가려진 직전 기록 · 직전 경주 보정 기록이 없으면 중립값"],["finish_consistency", "최근 5경주 착순 안정성", 0, "두수 보정 착순의 표준편차 감점 · 변동이 작을수록 우수 · 최소 3회"],["trainer_form","조교사 최근 상승세",0,"최근 90일과 이전 275일의 기대 대비 입상 성적 차이 · 최소 20건·50건, 소표본 보정"]].map(([id,label,weight,description])=>({id,label,weight,description}));
 // Stable storage slots preserve old records; only ACTIVE indices are model inputs.
 const RETIRED=[0,1,8,16,20],MIGRATION={0:4,1:4,8:9,16:4,20:17};
 FEATURES.push(...[
  ['early_speed','초반 200m 선행력',8,'직전 5경주 S1F · 당시 이전 날짜의 거리별 기준 대비 · 최소 기준 20건 · 중립 3경주 보정'],
  ['late_kick','종반 200m 탄력',8,'직전 5경주 G1F 기록의 경주 내 상대 순위 · 중립 3경주 보정'],
  ['pace_fit','선행 경합·전개 상성',7,'직전 S1F 통과 1·2위를 선행형으로 분류 · 자료 80% 이상일 때 단독선행/3두 이상 경합과 종반 탄력 반영'],
  ['jockey_upgrade','기수 상향 교체',7,'현재 기수와 직전 기수의 이전 365일 기대 대비 입상 성적 차이 · 각 20전 이상 · 중립 30전 보정']
 ].map(([id,label,weight,description])=>({id,label,weight,description})));
 FEATURES.forEach((f,i)=>{f.active=!RETIRED.includes(i);if(!f.active)f.weight=0;});
 const ACTIVE=FEATURES.map((f,i)=>f.active?i:-1).filter(i=>i>=0);
 const defaults=()=>FEATURES.map(f=>f.weight);
 function normalizeActive(input){
  const w=FEATURES.map((f,i)=>f.active?Math.max(0,Math.min(100,Number.isFinite(input[i])?input[i]:0)):0);
  if(!w.some(x=>x>0))for(const i of ACTIVE)w[i]=1;
  const sum=w.reduce((a,b)=>a+b,0),raw=w.map(x=>100*x/sum),out=raw.map(Math.floor);
  for(const i of ACTIVE.slice().sort((a,b)=>(raw[b]-out[b])-(raw[a]-out[a])||a-b).slice(0,100-out.reduce((a,b)=>a+b,0)))out[i]++;
  return out;
 }
 function migrateWeights(input){
  const w=FEATURES.map((_,i)=>input[i]??0);
  if(input.length!==FEATURES.length){for(const [from,to] of Object.entries(MIGRATION)){w[to]+=w[from];w[from]=0;}}
  else for(const i of RETIRED)w[i]=0;
  return w.some(x=>x>100)?normalizeActive(w):w.some(x=>x>0)?w:defaults();
 }
 function validWeights(w){return Array.isArray(w)&&[10,13,16,17,21,22,FEATURES.length].includes(w.length)&&w.every(n=>Number.isInteger(n)&&n>=0&&n<=100)&&w.some(n=>n>0);}
 const HYBRID_RANKS=['3','4','5','6','3,4','4,5','4,6','5,6'];
 function validHybridRanks(ranks){return Array.isArray(ranks)&&ranks.every(Number.isInteger)&&HYBRID_RANKS.includes(ranks.join(','));}
 function hybridSelection(result,config={}){
  const ranks=validHybridRanks(config.hybridRanks)?config.hybridRanks:[4,5];
  const ordered=(result.horses||[]).slice().sort((a,b)=>(b.prob||0)-(a.prob||0)||a.number-b.number);
  if(ordered.length<Math.max(...ranks))return {ready:false,kind:'hybrid',reason:'선택한 복병 분석 순위까지 출전마가 필요합니다.'};
  const anchor=ordered[0],partner=ordered[1],longshots=ranks.map(rank=>ordered[rank-1]);
  const pair=(result.allPairs||result.pairs||[]).find(p=>p.numbers.map(Number).sort((a,b)=>a-b).join('-')===[anchor.number,partner.number].map(Number).sort((a,b)=>a-b).join('-'));
  const combos=[{kind:'pair',numbers:[anchor.number,partner.number],names:[anchor.name,partner.name],prob:pair?.prob??null},...longshots.map(h=>({kind:'trio',numbers:[anchor.number,partner.number,h.number],names:[anchor.name,partner.name,h.name],prob:null}))];
  return {ready:true,kind:'hybrid',anchor,partner,longshots,combos};
 }
 function settings(s={}){
  const candidate=s.weightScope==='venue'&&validWeights(s.venueWeights?.seoul)?s.venueWeights.seoul:s.weights;
  const weights=validWeights(candidate)?migrateWeights(candidate):defaults();
  const selection=typeof module!=='undefined'?require('./race-selection-model.js'):RaceSelectionModel;
  const screening=selection.jointConfig(s.screening);
  return {betStrategy:['place-single','qpl-single','qpl-anchor2','trio-box4','trio-box3','hybrid'].includes(s.betStrategy)?s.betStrategy:'qpl-single',anchorRank:[1,2,3].includes(+s.anchorRank)?+s.anchorRank:1,modelMode:'custom',weights,...((s.betStrategy==='hybrid'||s.hybridRanks!==undefined)?{hybridRanks:validHybridRanks(s.hybridRanks)?s.hybridRanks.slice():[4,5]}:{}),...(screening?{screening}:{})};
 }
 const label=()=> '서울 최근 5경주 가중치 ('+ACTIVE.length+'개)';
 function featureValues(values){return FEATURES.map((_,i)=>Number.isFinite(values?.[i])?values[i]:.5);}
 function weightsFor(s){return settings(s).weights;}
 function apply(base,input){
  if(base.venue!=='seoul')throw Error('서울 경주만 분석할 수 있습니다.');
  const config=settings(input);
  config.weights=weightsFor(config,base.venue).slice();
  const version=VERSION,starters=base.official_result?.starters;
  if(Array.isArray(starters)&&starters.length){const active=new Set(starters.map(Number));base={...base,horses:base.horses.filter(h=>active.has(+h.number)),places:base.places.filter(p=>p.numbers.every(n=>active.has(+n))),pairs:base.pairs.filter(p=>p.numbers.every(n=>active.has(+n)))};base.k=base.horses.length<=7?2:3;}
  if(!base.horses.length)return base;
  const field=base.horses.slice().sort((a,b)=>+a.number-+b.number),sum=config.weights.reduce((a,b)=>a+b,0);
  const features=field.map(h=>featureValues(h.weighted_v3_features));
  const raw=features.map(f=>f.reduce((s,x,i)=>s+x*config.weights[i]/sum,0)*6.28),mean=raw.reduce((a,b)=>a+b,0)/raw.length;
  const strengths=raw.map(x=>Math.exp(Math.max(-4,Math.min(4,(x-mean)*.6))));
  const place=engine.probs(strengths,base.k),pair=engine.probs(strengths,3);
  const refresh=(item,prob)=>({...item,prob});
  const byNumber=new Map(field.map((h,i)=>[+h.number,i]));
  const places=base.places.map(x=>refresh(x,place.p[byNumber.get(+x.numbers[0])]));
  const pairs=base.pairs.map(x=>{const ids=x.numbers.map(n=>byNumber.get(+n)).sort((a,b)=>a-b);return refresh(x,pair.q[ids.join('-')]);});
  const sort=(a,b)=>b.prob-a.prob||+a.numbers[0]-+b.numbers[0];places.sort(sort);pairs.sort(sort);
  const horses=field.map((h,i)=>({...h,prob:place.p[i],reasons:[...FEATURES.map((f,j)=>({label:f.label,value:features[i][j],weight:config.weights[j],available:h.weighted_v3_support?.available?.[j],count:h.weighted_v3_support?.detail?.counts?.[j]})).filter(x=>x.weight>0).sort((a,b)=>b.weight-a.weight).slice(0,3).map(x=>x.label+' '+(x.available===false?'자료·조건 부족 · 대체점수 ':x.available===true?'점수 ':'자료 확인 전 점수 ')+Math.round(x.value*100)+(Number.isInteger(x.count)?' / 근거 '+x.count+'건':'')+' / 가중치 '+x.weight+'%'),h.weighted_v3_support?.through?'전적 기준 '+h.weighted_v3_support.through:'이전 전적 부족 · 중립값/사전값 포함']})).sort((a,b)=>b.prob-a.prob||+a.number-+b.number);
  return {...base,horses,places,pairs,model:version,models:{place:version,pair:version},advanced:{place:false,pair:false},selectiveActive:{place:false,pair:false},selection:{place:{qualified:false,reason:'사용자 가중치 적용 · 별도 선별 검증 없음'},pair:{qualified:false,reason:'사용자 가중치 적용'}},selectivePicks:{place:null,pair:null},tuning:config};
 }
 function placeSelection(result,settings={}){
  const starters=result.official_result?.starters,active=Array.isArray(starters)?new Set(starters.map(Number)):null;
  const picks=(result.places||[]).filter(p=>Number.isFinite(p.prob)&&(!active||active.has(+p.numbers[0]))).slice().sort((a,b)=>b.prob-a.prob||+a.numbers[0]-+b.numbers[0]);
  const rank=[1,2,3].includes(+settings.anchorRank)?+settings.anchorRank:1,pick=picks[rank-1];
  return pick?{ready:true,kind:'place',picks:[pick],rank}:{ready:false,kind:'place',reason:'선택한 연승확률 분석 '+rank+'위 말이 없습니다.'};
 }
 function packedSupport(s){
  if(!s?.detail)return s||null;
  const S=typeof module!=='undefined'?require('./race-selection-model.js'):RaceSelectionModel;
  return {...s,screening:{recentTrend:S.recentTrend(s),...(Number.isFinite(s.detail.restDays)?{restDays:s.detail.restDays}:s.screening?.restDays!==undefined?{restDays:s.screening.restDays}:{})},detail:{version:s.detail.version,counts:s.detail.counts}};
 }
 function pack(base){
  const field=base.horses.slice().sort((a,b)=>+a.number-+b.number);
  return {date:base.date,venue:base.venue,race:base.race_no,k:base.k,models:base.models,distance:base.distance??null,grade:base.grade??null,
   horses:base.horses.map(h=>[+h.number,base.places.find(p=>+p.numbers[0]===+h.number).prob,h.quality,engine.score(h,field).features,h.weighted_features||null,h.weighted_support||null,h.weighted_v3_features||null,packedSupport(h.weighted_v3_support)]),
   pairs:base.pairs.map(p=>[...p.numbers.map(Number),p.prob]),starters:base.official_result?.starters||null,
   settled:base.official_result?.pair?.status==='confirmed'&&!!base.official_result.pair.payouts?.length,payouts:base.official_result?.pair?.payouts||[],
   placeSettled:base.official_result?.place?.status==='confirmed'&&!!base.official_result.place.payouts?.length,placePayouts:base.official_result?.place?.payouts||[],
   trioSettled:base.official_result?.trio?.status==='confirmed'&&!!base.official_result.trio.payouts?.length,trioPayouts:base.official_result?.trio?.payouts||[]};
 }
 function unpack(row){
  const horses=row.horses.map(([number,prob,quality,tuningFeatures,weighted_features,weighted_support,weighted_v3_features,weighted_v3_support])=>({number,name:String(number),prob,quality,tuningFeatures,weighted_features,weighted_support,weighted_v3_features,weighted_v3_support}));
  return {date:row.date,venue:row.venue,race_no:row.race,k:row.k,distance:row.distance??null,grade:row.grade??null,horses,models:row.models,mode:'accuracy',reasons:[],
   places:horses.map(h=>({numbers:[h.number],names:[h.name],prob:h.prob,quality:h.quality})).sort((a,b)=>b.prob-a.prob),
   pairs:row.pairs.map(([a,b,prob])=>({numbers:[a,b],names:[String(a),String(b)],prob})),
   official_result:{starters:row.starters,place:{status:row.placeSettled?'confirmed':'pending',payouts:row.placePayouts||[]},pair:{status:row.settled?'confirmed':'pending',payouts:row.payouts||[]},trio:{status:row.trioSettled?'confirmed':'pending',payouts:row.trioPayouts||[]}}};
 }
 return {placeSelection,ACTIVE,RETIRED,MIGRATION,normalizeActive,migrateWeights,HYBRID_RANKS,validHybridRanks,hybridSelection,FEATURES,VERSION,featureValues,label,weightsFor,defaults,validWeights,settings,apply,pack,unpack};
})();
if(typeof module!=='undefined')module.exports=TuningModel;
