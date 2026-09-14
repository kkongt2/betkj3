'use strict';
const QplHistoryEngine=(()=>{
 const tuning=typeof module!=='undefined'?require('./tuning-model.js'):TuningModel;
 const policy=typeof module!=='undefined'?require('./qpl-policy.js'):Betkj3Policy;
 const key=ns=>ns.map(Number).sort((a,b)=>a-b).join('-');
 function create(rows){
  const entries=rows.map(row=>({row,base:tuning.unpack(row),winning:new Map(row.payouts.map(p=>[key(p.numbers),p.odds]))}));
  function evaluateRow(entry,config){
   const signature=config.modelMode==='custom'?config.weights.join(','):'existing';
   if(entry.signature!==signature){entry.analyzed=tuning.apply(entry.base,config);entry.signature=signature;}
   const result=policy.apply(entry.analyzed,{quotes:entry.row.quotes},config),selected=result.qplPolicy.partner;
   const pair=selected?result.pairs[0]:null,hit=!!pair&&entry.winning.has(key(pair.numbers));
   return {date:entry.row.date,venue:entry.row.venue,settled:entry.row.settled,
    candidates:pair?[{partner:selected,pick:{prob:pair.prob},hit,payout:hit?entry.winning.get(key(pair.numbers)):null}]:[]};
  }
  async function evaluate(options,from,to,isCurrent=()=>true){
   const config={...tuning.settings(options),...policy.normalizeRange(options)},results=[];
   for(let i=0;i<entries.length;i++){
    if(!isCurrent())return null;
    const entry=entries[i];if(entry.row.date>=from&&entry.row.date<=to)results.push(evaluateRow(entry,config));
    if(i%40===39)await new Promise(resolve=>setTimeout(resolve,0));
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
 return {create,metrics};
})();
if(typeof module!=='undefined')module.exports=QplHistoryEngine;
