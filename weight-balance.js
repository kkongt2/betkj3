'use strict';
const WeightBalance=(()=>{
const T=typeof module!=='undefined'?require('./tuning-model.js'):TuningModel;
const RULES={version:'active21-v1',minimum:0,maximum:25,total:100,groups:[
 {id:'form',label:'최근 착순·유사거리',indices:[2,4,17],min:0,max:25},
 {id:'ability',label:'레이팅·상대 수준',indices:[3,12],min:0,max:20},
 {id:'people',label:'기수·조교사·교체',indices:[5,6,21,25],min:0,max:30},
 {id:'condition',label:'부담중량·출전 간격',indices:[7,9],min:0,max:15},
 {id:'records',label:'전체 기록·시간차',indices:[10,11,13,14,15,18,19],min:0,max:30},
 {id:'sectionals',label:'구간 기록·전개',indices:[22,23,24],min:0,max:40}
]};
function summary(w){return {minimum:Math.min(...T.ACTIVE.map(i=>w[i]||0)),maximum:Math.max(...w),effectiveFeatures:10000/w.reduce((s,x)=>s+x*x,0),groups:RULES.groups.map(g=>({id:g.id,label:g.label,weight:g.indices.reduce((s,i)=>s+(w[i]??0),0),min:g.min,max:g.max}))};}
function valid(w){return Array.isArray(w)&&w.length===T.FEATURES.length&&w.every((x,i)=>Number.isInteger(x)&&x>=0&&x<=RULES.maximum&&(!T.RETIRED.includes(i)||x===0))&&w.reduce((a,b)=>a+b,0)===100&&summary(w).groups.every(g=>g.weight>=g.min&&g.weight<=g.max);}
function project(origin){
 const input=T.validWeights(origin)?T.settings({weights:origin}).weights:origin;
 if(valid(input))return input.slice();
 const w=Array(T.FEATURES.length).fill(0),group=i=>RULES.groups.find(g=>g.indices.includes(i)),can=i=>w[i]<RULES.maximum&&group(i).indices.reduce((s,j)=>s+w[j],0)<group(i).max;
 const add=ids=>{const i=ids.filter(can).sort((a,b)=>((input[b]??0)+1)/(w[b]+1)-((input[a]??0)+1)/(w[a]+1)||a-b)[0];if(i===undefined)throw Error('Infeasible weight limits');w[i]++;};
 while(w.reduce((a,b)=>a+b,0)<100)add(T.ACTIVE);
 if(!valid(w))throw Error('Invalid projected seed');return w;
}
return {RULES,valid,summary,project};
})();
if(typeof module!=='undefined')module.exports=WeightBalance;
