'use strict';
// Integer, constrained DE/rand/1/bin with periodic random immigrants.
// The caller supplies fitness; this module never reads race outcomes itself.
const GlobalWeightSearch=(()=>{
 const T=typeof module!=='undefined'?require('./tuning-model.js'):TuningModel;
 const B=typeof module!=='undefined'?require('./weight-balance.js'):WeightBalance;
 function method(value){if(value===undefined)return 'local';if(!['local','de'].includes(value))throw Error('탐색 방식을 확인해 주세요.');return value;}
 const P=typeof module!=='undefined'?require('./search-policy.js'):SearchPolicy;
 const normalize=input=>T.normalizeActive(input);
 function create({seeds=[],balanced=false,random=Math.random,size=12,surrogate=false}={}){
  if(!Number.isInteger(size)||size<4)throw Error('DE population must contain at least four candidates');
  const project=v=>{const w=normalize(v);return balanced?(B.valid(w)?w:B.project(w)):w;};
  const initial=seeds.filter(T.validWeights).slice(0,surrogate?8:4).map(w=>project(T.settings({weights:w}).weights));
  const population=[],seen=new Set();let cursor=0,trials=0,immigrants=0,pending=null,stale=0,proxyProposals=0;const archive=[];
  const fresh=()=>project(Array.from({length:T.FEATURES.length},()=>(-Math.log(Math.max(1e-12,1-random())))**(random()<.5?1:3)));
  function proposal(slot){
   const ids=population.map((_,i)=>i).filter(i=>i!==slot);
   for(let i=ids.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}
   const [a,b,c]=ids,F=.3+random()*.7,cr=.35+random()*.55,forced=T.ACTIVE[Math.floor(random()*T.ACTIVE.length)],target=population[slot].weights;
   return project(target.map((x,j)=>j===forced||random()<cr?population[a].weights[j]+F*(population[b].weights[j]-population[c].weights[j]):x));
  }
  // Kernel surrogate smooths ranking plateaus only for proposal selection.
  // Every proposed candidate is still evaluated using its real integer purchases.
  function estimate(w){
   const nearest=archive.map(p=>({...p,d:P.distance(w,p.weights)})).sort((a,b)=>a.d-b.d).slice(0,12);let sum=0,mass=0;
   for(const p of nearest){const k=Math.exp(-p.d*p.d/.08);sum+=k*p.fitness;mass+=k;}
   return mass?sum/mass+.1*Math.max(1,Math.abs(sum/mass))*(nearest[0]?.d||0):-Infinity;
  }
  function ask(){
   if(pending)throw Error('DE feedback missing');
   let slot=population.length<size?population.length:cursor++%size;
   for(let attempt=0;attempt<64;attempt++){
    let weights,kind;
    if(initial.length){weights=initial.shift();kind='seed';}
    else if(population.length<size||attempt>8||trials>0&&trials%(size*(surrogate&&stale>size*8?2:4))===0){weights=fresh();kind='restart';}
    else{
     weights=proposal(slot);kind='evolve';
     if(surrogate&&archive.length>=12&&trials%8===7){
      const candidates=[weights,...Array.from({length:7},()=>random()<.4?fresh():proposal(slot))].filter(w=>!seen.has(w.join(',')));
      if(candidates.length){weights=candidates.sort((a,b)=>estimate(b)-estimate(a))[0];proxyProposals++;}
     }
    }
    const key=weights.join(',');if(seen.has(key))continue;seen.add(key);
    if(kind==='restart'&&population.length===size){slot=population.reduce((worst,p,i)=>p.fitness<population[worst].fitness?i:worst,0);immigrants++;}
    pending={weights,slot,kind};return weights.slice();
   }
   return null;
  }
  function tell(fitness){
   if(!pending)throw Error('DE candidate missing');
   const p={weights:pending.weights.slice(),fitness:Number.isFinite(fitness)?fitness:-Infinity},old=population[pending.slot];
   const priorBest=Math.max(-Infinity,...population.map(p=>p.fitness));if(p.fitness>priorBest)stale=0;else stale++;
   if(Number.isFinite(p.fitness)){archive.push(p);if(archive.length>256)archive.shift();}
   if(!old||p.fitness>=old.fitness||pending.kind==='restart')population[pending.slot]=p;
   if(pending.kind==='evolve'||pending.kind==='restart'&&old)trials++;
   pending=null;
  }
  const stats=()=>({population:population.length,populationSize:size,generations:Math.floor(trials/size),restarts:immigrants,surrogateProposals:proxyProposals,diversity:population.length>1?Math.min(...population.slice(1).map(p=>P.distance(population[0].weights,p.weights))):null});
  return {ask,tell,stats,inject:weights=>{for(const w of weights.filter(T.validWeights)){const next=project(w);if(!seen.has(next.join(',')))initial.push(next);}if(initial.length>64)initial.splice(0,initial.length-64);}};
 }
 function rng(seed){let n=seed>>>0;return ()=>((n=(Math.imul(1664525,n)+1013904223)>>>0)/4294967296);}
 return {create,method,normalize,rng};
})();
if(typeof module!=='undefined')module.exports=GlobalWeightSearch;
