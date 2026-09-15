'use strict';
const Betkj3Policy=(()=>{
 const VERSION='betkj3-configurable-anchor-v3';
 function normalizeRange(value={}){
  const rank=(n,fallback)=>Number.isInteger(+n)&&+n>=2&&+n<=20?+n:fallback;
  const min=rank(value?.min,3),max=rank(value?.max,4);
  return {min:Math.min(min,max),max:Math.max(min,max)};
 }
 const compare=(a,b)=>b.pick.prob-a.pick.prob||b.partner.prob-a.partner.prob||a.partner.number-b.partner.number;
 function choose(candidates,range){const {min,max}=normalizeRange(range);return candidates.filter(c=>c.partner.rank>=min&&c.partner.rank<=max).sort(compare)[0]||null;}
 function summarize(rows,range,from,to){
  const groups=Object.fromEntries(['all','seoul'].map(k=>[k,{total:0,evaluated:0,hits:0,excluded:0,paidHits:0,payoutTotal:0}]));
  for(const row of rows){
   if(row.venue!=='seoul'||row.date<from||row.date>to)continue;
   const pick=row.settled?choose(row.candidates,range):null;
   for(const key of ['all',row.venue]){
    const g=groups[key];if(!g)continue;g.total++;
    if(pick){g.evaluated++;g.hits+=pick.hit?1:0;if(pick.hit&&Number.isFinite(pick.payout)&&pick.payout>=1){g.paidHits++;g.payoutTotal+=pick.payout;}}
    else g.excluded++;
   }
  }
  return groups;
 }
 function apply(base,market,options){
  const range=normalizeRange(options);
  const result={...base,pairs:[],selection:{...base.selection,pair:{qualified:false,reason:'연승 최종배당으로 조합 선정'}},selectivePicks:{...base.selectivePicks,pair:null},models:{...base.models,pair:VERSION}};
  const pending=reason=>{result.qplPolicy={status:'unavailable',reason,version:VERSION};return result;};
  const field=base.horses.filter(h=>!Array.isArray(base.official_result?.starters)||base.official_result.starters.map(Number).includes(+h.number));
  if(field.length<range.min)return pending('출전마 수가 배당 '+range.min+'위보다 적어 조합 선정 불가');
  if(!Array.isArray(market?.quotes)||!market.quotes.length)return pending('연승 최종배당 대기 · 전체 출전마의 최종배당이 필요합니다.');
  const prices=new Map();
  for(const q of market.quotes){
   if(!Array.isArray(q.numbers)||q.numbers.length!==1||!Number.isFinite(q.odds)||q.odds<1)return pending('연승 최종배당 자료 확인 필요');
   const number=+q.numbers[0];if(prices.has(number))return pending('중복된 연승 최종배당 자료 확인 필요');prices.set(number,q.odds);
  }
  const probability=n=>base.places.find(p=>+p.numbers[0]===n)?.prob??0;
  if(field.some(h=>!prices.has(+h.number)))return pending('일부 출전마의 연승 최종배당 누락 · 조합 선정 대기');
  const ranked=field.map(h=>({number:+h.number,name:h.name,odds:prices.get(+h.number),prob:probability(+h.number)})).sort((a,b)=>a.odds-b.odds||b.prob-a.prob||a.number-b.number).map((h,i)=>({...h,rank:i+1}));
  const anchorMode=options?.anchorMode==='analysis'?'analysis':'odds';
  const anchor=anchorMode==='analysis'?[...ranked].sort((a,b)=>b.prob-a.prob||a.number-b.number)[0]:ranked[0];
  const partners=ranked.slice(range.min-1,range.max).filter(h=>h.number!==anchor.number);
  if(!partners.length)return pending('선택 범위에 축마 외 후보가 없어 조합 선정 불가');
  const candidates=partners.map(partner=>({partner,pick:base.pairs.find(p=>p.numbers.length===2&&p.numbers.map(Number).includes(anchor.number)&&p.numbers.map(Number).includes(partner.number))}));
  if(candidates.some(c=>!c.pick||!Number.isFinite(c.pick.prob)))return pending('기존 모델의 조합 확률 확인 필요');
  candidates.sort(compare);
  result.pairs=[candidates[0].pick];
  result.qplPolicy={status:'ready',version:VERSION,baseModel:base.models.pair,anchor,anchorMode,partner:candidates[0].partner,ranked:ranked.slice(0,range.max),candidates,range};
  result.selection.pair.reason=(anchorMode==='analysis'?'분석 1위':'연승 배당 1위')+' + 배당 '+range.min+'~'+range.max+'위 중 동반입상확률 우위 조합';
  return result;
 }
 return {apply,choose,normalizeRange,summarize,VERSION};
})();
if(typeof module!=='undefined')module.exports=Betkj3Policy;
