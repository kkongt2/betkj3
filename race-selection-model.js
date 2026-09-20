'use strict';
// Independent, fixed-rule screening model. Scores are not calibrated probabilities.
// Outcomes and payouts are deliberately absent from the score inputs.
const RaceSelectionModel=(()=>{
 const VERSION='race-screening-v1';
 const clamp=x=>Math.max(0,Math.min(1,Number.isFinite(x)?x:0));
 const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
 const pairKey=a=>a.map(Number).sort((a,b)=>a-b).join('-');
 function strictness(value){return Number.isFinite(+value)?Math.max(0,Math.min(100,Math.round(+value))):0;}
 function qualifies(result,value){const threshold=strictness(value);return result?.available===true&&threshold<100&&(threshold===0||result.score>=threshold);}
 function score(result,settings){
  const pair=result.pairs?.[0],policy=result.qplPolicy;
  if(policy?.status!=='ready'||!pair)return {version:VERSION,available:false,score:null};
  const field=result.horses.slice().sort((a,b)=>+a.number-+b.number),n=field.length;
  const selected=new Set(pair.numbers.map(Number));
  const weights=settings.weights,total=weights.reduce((s,w)=>s+w,0);
  const validFeatures=h=>Array.isArray(h.weighted_v3_features)&&h.weighted_v3_features.length===17&&h.weighted_v3_features.every(Number.isFinite);
  const features=field.map(h=>validFeatures(h)?h.weighted_v3_features:Array(17).fill(.5));
  const raw=features.map(f=>f.reduce((s,x,j)=>s+x*weights[j]/total,0));
  const quality=h=>{
   if(!validFeatures(h))return 0;
   const support=h.weighted_v3_support,available=support?.available;
   const coverage=Array.isArray(available)&&available.length===17?available.reduce((s,v,j)=>s+(v===true?weights[j]:0),0)/total:0;
   return .5*coverage+.5*clamp((support?.starts??0)/5);
  };
  const completeness=.5*mean(field.filter(h=>selected.has(+h.number)).map(quality))+.5*mean(field.map(quality));
  // Test deterministic +/-20% relative changes to every active input weight.
  // Comparing raw ranks is equivalent to comparing positive-strength ranks.
  let same=0,trials=0;
  for(let j=0;j<17;j++)if(weights[j]>0)for(const factor of [-.2,.2]){
   const changed=raw.map((v,i)=>v+features[i][j]*weights[j]/total*factor);
   const order=field.map((_,i)=>i).sort((a,b)=>changed[b]-changed[a]||field[a].number-field[b].number);
   const anchor=order[(settings.anchorRank||1)-1];
   const partner=order.slice(settings.min-1,settings.max).find(i=>i!==anchor);
   trials++;if(anchor!==undefined&&partner!==undefined&&pairKey([field[anchor].number,field[partner].number])===pairKey(pair.numbers))same++;
  }
  // Tied, featureless fields must not appear stable solely due to the number tie-break.
  const spread=Math.max(...raw)-Math.min(...raw);
  const stability=(trials?same/trials:0)*clamp(spread/.1);
  const outsiders=raw.filter((_,i)=>!selected.has(+field[i].number)).sort((a,b)=>b-a);
  const boundary=outsiders[Math.min(1,outsiders.length-1)]??0;
  const weakest=Math.min(...raw.filter((_,i)=>selected.has(+field[i].number)));
  const gap=clamp((weakest-boundary)/.15);
  // Normalize pair probability by the top-three probability of a random pair.
  const randomPair=n>=3?6/(n*(n-1)):1;
  const advantage=clamp((pair.prob/randomPair-1)/2);
  const components={stability,completeness,gap,advantage};
  const value=100*(.35*stability+.25*completeness+.25*gap+.15*advantage);
  return {version:VERSION,available:true,score:Math.round(value*1000)/1000,components};
 }
 function metrics(g){
  const rate=g.evaluated?g.hits/g.evaluated:null,average=g.paidHits?g.payoutTotal/g.paidHits:null;
  const product=!g.evaluated||g.paidHits!==g.hits?null:g.payoutTotal/g.evaluated;
  return {rate,average,product};
 }
 function curve(rows){
  const blank=()=>({evaluated:0,hits:0,paidHits:0,payoutTotal:0});
  const buckets=Array.from({length:100},blank);let eligible=0;
  for(const row of rows){
   const pick=row.candidates[0];if(!row.settled||!pick||!row.screening?.available)continue;
   eligible++;const b=buckets[Math.min(99,Math.floor(row.screening.score))];b.evaluated++;
   if(pick.hit){b.hits++;if(Number.isFinite(pick.payout)&&pick.payout>=1){b.paidHits++;b.payoutTotal+=pick.payout;}}
  }
  const running=blank(),points=Array(101);
  for(let value=100;value>=0;value--){
   if(value<100)for(const k of Object.keys(running))running[k]+=buckets[value][k];
   const g={...running,total:rows.length,excluded:rows.length-running.evaluated};
   points[value]={strictness:value,...g,...metrics(g),ratio:rows.length?g.evaluated/rows.length:null};
  }
  return {version:VERSION,total:rows.length,eligible,unavailable:rows.length-eligible,points};
 }
 return {VERSION,strictness,qualifies,score,metrics,curve};
})();
if(typeof module!=='undefined')module.exports=RaceSelectionModel;
