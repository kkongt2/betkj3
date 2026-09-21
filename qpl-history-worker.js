'use strict';
importScripts('model.js?v=detail-1','tuning-model.js?v=detail-1','qpl-policy.js?v=detail-1','race-selection-model.js?v=detail-1','qpl-history-engine.js?v=detail-1','weight-curve-engine.js?v=detail-1','weight-balance.js?v=detail-1','weight-search-engine.js?v=detail-1','joint-search-engine.js?v=detail-1');
let ready=null,latest=0,latestCurve=0,searchId=0,searchStopped=false;
async function fetchYear(url){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
 try{const res=await fetch(url+'?t='+Date.now(),{cache:'no-store',signal:controller.signal});if(!res.ok)throw Error('연도별 자료 HTTP '+res.status);return await res.json();}finally{clearTimeout(timer);}
}
onmessage=async({data})=>{
 if(data.type==='init'){
  ready=QplHistoryEngine.load(data.manifest,fetchYear,(done,total)=>postMessage({type:'loading',done,total})).then(rows=>({history:QplHistoryEngine.create(rows),curves:WeightCurveEngine.create(rows),joint:JointSearchEngine.create(rows)}));ready.catch(()=>{});return;
 }
 if(data.type==='abort-search'){searchId=data.searchId;searchStopped=true;return;}
 if(data.type==='stop-search'){if(searchId===data.searchId)searchStopped=true;return;}
 if(data.type==='search'){
  searchId=data.searchId;searchStopped=false;
  try{const {curves,history,joint}=await ready;if(searchId!==data.searchId)return;
   const run=data.options.joint?(o,f,v,c)=>joint.run(o,v,c):WeightSearchEngine.run;
   const result=await run(data.options,curves.evaluate,history.evaluate,{current:()=>searchId===data.searchId,stopped:()=>searchStopped,progress:p=>postMessage({type:'search-progress',searchId:data.searchId,progress:p})});
   if(searchId===data.searchId)postMessage({type:'search-result',searchId:data.searchId,result});
  }catch(e){if(searchId===data.searchId)postMessage({type:'search-result',searchId:data.searchId,error:String(e.message||e)});}return;
 }
 if(data.type==='cancel-curve'){latestCurve=data.curveId;return;}
 if(data.type==='curve'){latestCurve=data.curveId;try{const {curves}=await ready;if(latestCurve!==data.curveId)return;const result=await curves.curve(data.settings,data.index,data.from,data.to,()=>latestCurve===data.curveId,percent=>postMessage({type:'curve-progress',curveId:data.curveId,percent}));if(result&&latestCurve===data.curveId)postMessage({type:'curve',curveId:data.curveId,result});}catch(e){if(latestCurve===data.curveId)postMessage({type:'curve',curveId:data.curveId,error:String(e.message||e)});}return;}
 if(data.type!=='evaluate')return;latest=data.id;
 try{
  const {history:evaluator}=await ready;if(latest!==data.id)return;
  const groups=await evaluator.evaluate(data.settings,data.from,data.to,()=>latest===data.id,percent=>postMessage({id:data.id,type:'progress',percent}));
  if(groups&&latest===data.id)postMessage({id:data.id,groups});
 }catch(error){if(latest===data.id)postMessage({id:data.id,error:String(error.message||error)});}
};

