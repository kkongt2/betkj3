'use strict';
importScripts('model-v7.js?v=3.0','model.js?v=3.0','tuning-model.js?v=3.0','qpl-policy.js?v=3.0','qpl-history-engine.js?v=4.0');
let ready=null,latest=0;
async function fetchYear(url){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
 try{const res=await fetch(url+'?t='+Date.now(),{cache:'no-store',signal:controller.signal});if(!res.ok)throw Error('연도별 자료 HTTP '+res.status);return await res.json();}finally{clearTimeout(timer);}
}
onmessage=async({data})=>{
 if(data.type==='init'){
  ready=QplHistoryEngine.load(data.manifest,fetchYear,(done,total)=>postMessage({type:'loading',done,total})).then(rows=>QplHistoryEngine.create(rows));ready.catch(()=>{});return;
 }
 if(data.type!=='evaluate')return;latest=data.id;
 try{
  const evaluator=await ready;if(latest!==data.id)return;
  const groups=await evaluator.evaluate(data.settings,data.from,data.to,()=>latest===data.id,percent=>postMessage({id:data.id,type:'progress',percent}));
  if(groups&&latest===data.id)postMessage({id:data.id,groups});
 }catch(error){if(latest===data.id)postMessage({id:data.id,error:String(error.message||error)});}
};
