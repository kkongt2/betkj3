'use strict';
const QplHistoryEngine=(()=>{
 const tuning=typeof module!=='undefined'?require('./tuning-model.js'):TuningModel;
 const policy=typeof module!=='undefined'?require('./qpl-policy.js'):Betkj3Policy;
 const key=ns=>ns.map(Number).sort((a,b)=>a-b).join('-');
 function create(rows){
  const entries=rows.filter(r=>r.venue==='seoul').map(row=>({row,winning:new Map(row.payouts.map(p=>[key(p.numbers),p.odds]))}));
  function evaluateRow(entry,config){
   const signature=config.modelMode!=='existing'?config.modelMode+':'+tuning.weightsFor(config,entry.row.venue).join(','):'existing';
   if(signature!=='existing'&&entry.signature!==signature){
    const analyzed=tuning.apply(tuning.unpack(entry.row),config),prob=new Map(analyzed.places.map(p=>[+p.numbers[0],p.prob]));
    entry.custom={...entry.row,horses:entry.row.horses.filter(h=>prob.has(h[0])).map(h=>[h[0],prob.get(h[0]),...h.slice(2)]),pairs:analyzed.pairs.map(p=>[...p.numbers,p.prob])};entry.signature=signature;
   }
   const result=policy.apply(tuning.unpack(signature==='existing'?entry.row:entry.custom),{quotes:entry.row.quotes},config),selected=result.qplPolicy.partner;
   const pair=selected?result.pairs[0]:null,hit=!!pair&&entry.winning.has(key(pair.numbers));
   return {date:entry.row.date,venue:entry.row.venue,settled:entry.row.settled,
    candidates:pair?[{partner:selected,pick:{prob:pair.prob},hit,payout:hit?entry.winning.get(key(pair.numbers)):null}]:[]};
  }
  async function evaluate(options,from,to,isCurrent=()=>true,onProgress=()=>{}){
   const config={...tuning.settings(options),...policy.normalizeRange(options)},results=[];
   for(let i=0;i<entries.length;i++){
    if(!isCurrent())return null;
    const entry=entries[i];if(entry.row.date>=from&&entry.row.date<=to)results.push(evaluateRow(entry,config));
    if(i%80===79){onProgress(Math.round((i+1)/entries.length*100));await new Promise(resolve=>setTimeout(resolve,0));}
   }
   return isCurrent()?policy.summarize(results,config,from,to):null;
  }
  return {evaluate,evaluateRow:(i,options)=>evaluateRow(entries[i],{...tuning.settings(options),...policy.normalizeRange(options)})};
 }
 function metrics(g){
  const rate=g.evaluated?g.hits/g.evaluated:null,average=g.paidHits?g.payoutTotal/g.paidHits:null;
  const product=rate===null||g.paidHits!==g.hits?null:g.hits===0?0:rate*average;
  return {rate,average,product};
 }
 async function load(manifest,fetchDocument,onProgress=()=>{}){
  if(manifest.schema===2&&Array.isArray(manifest.rows))return manifest.rows;
  if(manifest.schema!==3||!Array.isArray(manifest.shards)||!manifest.shards.length)throw Error('전체 기간 통계 자료 확인 필요');
  const parts=new Array(manifest.shards.length);let next=0,done=0;
  async function read(){
   while(next<manifest.shards.length){
    const i=next++,shard=manifest.shards[i];
    if(!/^qpl-history-years\/\d{4}\.json$/.test(shard.url))throw Error('Invalid historical year URL');
    const doc=await fetchDocument(shard.url);
    if(doc.schema!==2||doc.policyVersion!==manifest.policyVersion||!Array.isArray(doc.rows)||doc.rows.length!==shard.rows)throw Error('연도별 통계 자료 확인 필요');
    parts[i]=doc.rows;onProgress(++done,manifest.shards.length);
   }
  }
  await Promise.all([read(),read()]);const rows=parts.flat();
  if(rows.length!==manifest.races||new Set(rows.map(r=>[r.date,r.venue,r.race].join(':'))).size!==rows.length)throw Error('전체 통계 경주 수 확인 필요');
  return rows;
 }
 return {create,metrics,load};
})();
if(typeof module!=='undefined')module.exports=QplHistoryEngine;

