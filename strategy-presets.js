'use strict';
const StrategyPresets=(()=>{
 const tuning=typeof module!=='undefined'?require('./tuning-model.js'):TuningModel;
 const policy=typeof module!=='undefined'?require('./qpl-policy.js'):Betkj3Policy;
 const KEY='betkj3-strategy-presets-v1';
 function config(value){
  if(!value||!tuning.validWeights(value.weights)||!['odds','analysis'].includes(value.anchorMode)||!['existing','custom','legacy','v2'].includes(value.modelMode)||![value.min,value.max].every(n=>Number.isInteger(n)&&n>=2&&n<=20)||value.min>value.max)throw Error('설정 자료를 확인해 주세요.');
  if(value.weightScope==='venue'&&(!value.venueWeights||Object.keys(value.venueWeights).some(v=>!['seoul','busan','jeju'].includes(v)||!tuning.validWeights(value.venueWeights[v])||value.venueWeights[v].length!==16)))throw Error('경마장별 가중치를 확인해 주세요.');
  return {...tuning.settings(value),...policy.normalizeRange(value)};
 }
 function read(storage){
  const raw=storage.getItem(KEY);if(!raw)return [];
  const doc=JSON.parse(raw);if(doc.schema!==1||!Array.isArray(doc.entries))throw Error('저장된 설정을 읽지 못했습니다.');
  return doc.entries.map(p=>{if(typeof p.name!=='string'||!p.name.trim()||p.name.length>60)throw Error('저장된 이름을 확인해 주세요.');return {name:p.name,settings:config(p.settings)};});
 }
 function save(storage,name,settings){
  name=String(name).trim();if(!name||name.length>60)throw Error('설정 이름을 1~60자로 입력하세요.');
  const entries=read(storage),preset={name,settings:config(settings)},index=entries.findIndex(p=>p.name===name);
  if(index>=0)entries[index]=preset;else{if(entries.length>=50)throw Error('최대 50개까지 저장할 수 있습니다.');entries.push(preset);}
  storage.setItem(KEY,JSON.stringify({schema:1,entries}));return entries;
 }
 function remove(storage,name){const entries=read(storage).filter(p=>p.name!==name);storage.setItem(KEY,JSON.stringify({schema:1,entries}));return entries;}
 return {KEY,config,read,save,remove};
})();
if(typeof module!=='undefined')module.exports=StrategyPresets;

