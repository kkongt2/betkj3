'use strict';
const Betkj3Policy=(()=>{
 const VERSION='betkj3-final-place-1-with-3or4-v1';
 function apply(base,market){
  const result={...base,pairs:[],selection:{...base.selection,pair:{qualified:false,reason:'연승 최종배당으로 조합 선정'}},selectivePicks:{...base.selectivePicks,pair:null},models:{...base.models,pair:VERSION}};
  const pending=reason=>{result.qplPolicy={status:'unavailable',reason,version:VERSION};return result;};
  const field=base.horses.filter(h=>!Array.isArray(base.official_result?.starters)||base.official_result.starters.map(Number).includes(+h.number));
  if(field.length<4)return pending('출전마가 4두 미만이라 배당 3·4위 비교 불가');
  if(!Array.isArray(market?.quotes)||!market.quotes.length)return pending('연승 최종배당 대기 · 전체 출전마의 최종배당이 필요합니다.');
  const prices=new Map();
  for(const q of market.quotes){
   if(!Array.isArray(q.numbers)||q.numbers.length!==1||!Number.isFinite(q.odds)||q.odds<1)return pending('연승 최종배당 자료 확인 필요');
   const number=+q.numbers[0];if(prices.has(number))return pending('중복된 연승 최종배당 자료 확인 필요');prices.set(number,q.odds);
  }
  const probability=n=>base.places.find(p=>+p.numbers[0]===n)?.prob??0;
  if(field.some(h=>!prices.has(+h.number)))return pending('일부 출전마의 연승 최종배당 누락 · 조합 선정 대기');
  const ranked=field.map(h=>({number:+h.number,name:h.name,odds:prices.get(+h.number),prob:probability(+h.number)})).sort((a,b)=>a.odds-b.odds||b.prob-a.prob||a.number-b.number).map((h,i)=>({...h,rank:i+1}));
  const anchor=ranked[0],partners=ranked.slice(2,4);
  const candidates=partners.map(partner=>({partner,pick:base.pairs.find(p=>p.numbers.length===2&&p.numbers.map(Number).includes(anchor.number)&&p.numbers.map(Number).includes(partner.number))}));
  if(candidates.some(c=>!c.pick||!Number.isFinite(c.pick.prob)))return pending('기존 모델의 조합 확률 확인 필요');
  candidates.sort((a,b)=>b.pick.prob-a.pick.prob||b.partner.prob-a.partner.prob||a.partner.number-b.partner.number);
  result.pairs=[candidates[0].pick];
  result.qplPolicy={status:'ready',version:VERSION,baseModel:base.models.pair,anchor,partner:candidates[0].partner,ranked:ranked.slice(0,4),candidates};
  result.selection.pair.reason='연승 배당 1위 + 배당 3·4위 중 기존 모델 동반입상확률 우위 조합';
  return result;
 }
 return {apply,VERSION};
})();
if(typeof module!=='undefined')module.exports=Betkj3Policy;
