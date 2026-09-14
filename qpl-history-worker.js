'use strict';
importScripts('model-v7.js?v=3.0','model.js?v=3.0','tuning-model.js?v=3.0','qpl-policy.js?v=3.0','qpl-history-engine.js?v=3.0');
let evaluator=null,latest=0;
onmessage=async({data})=>{
 if(data.type==='init'){evaluator=QplHistoryEngine.create(data.rows);return;}
 if(data.type!=='evaluate')return;
 latest=data.id;
 try{
  const groups=await evaluator.evaluate(data.settings,data.from,data.to,()=>latest===data.id);
  if(groups&&latest===data.id)postMessage({id:data.id,groups});
 }catch(error){if(latest===data.id)postMessage({id:data.id,error:String(error.message||error)});}
};
