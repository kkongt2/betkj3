const assert=require('node:assert/strict'),{pairDistance}=require('./preset-diversity.cjs');
const RULES={count:15,baseIds:[3,4,9],perBase:5,minimumHitRate:.15,minimumCoverageRatio:.40,minimumPairDifference:.10,maxSameFamilyRange:2,maxWeightReallocation:30,maxRankChange:3,objective:'product-first'};
const weightMove=(a,b)=>a.reduce((s,x,i)=>s+Math.abs(x-b[i]),0)/2;
function select(candidates){
 const board=candidates.filter(c=>c.all.hits*20>=c.all.evaluated*3&&c.all.evaluated>=Math.ceil(c.all.total*.4));
 board.sort((a,b)=>b.metrics.product-a.metrics.product||b.all.evaluated-a.all.evaluated||a.baseId-b.baseId||JSON.stringify(a.settings).localeCompare(JSON.stringify(b.settings)));
 const selected=[],counts=new Map(),ranges=new Map();
 for(const c of board){
  const key=[c.baseId,c.settings.min,c.settings.max].join(':');if((counts.get(c.baseId)||0)>=5||(ranges.get(key)||0)>=2)continue;
  if(selected.some(s=>pairDistance(c.predictions,s.predictions)+1e-12<.10))continue;
  selected.push(c);counts.set(c.baseId,(counts.get(c.baseId)||0)+1);ranges.set(key,(ranges.get(key)||0)+1);if(selected.length===15)break;
 }
 assert.equal(selected.length,15,'Need five distinct qualifying descendants of each base');for(const id of RULES.baseIds)assert.equal(counts.get(id),5);
 return selected.map(c=>({...c,nearestPairDifference:Math.min(...selected.filter(x=>x!==c).map(x=>pairDistance(c.predictions,x.predictions)))}));
}
module.exports={RULES,weightMove,select};
