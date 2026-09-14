// Precompute model probabilities once per data sync; range changes only select and score.
const fs=require('node:fs'),model=require('../model.js'),policy=require('../qpl-policy.js');
global.KraV7=require('../model-v7.js');
model.setTrainedModel(JSON.parse(fs.readFileSync('data/training-report.json')));
model.setAdvancedModel(JSON.parse(fs.readFileSync('data/model-v6.json')));
model.setChallengerModel(JSON.parse(fs.readFileSync('data/model-v7.json')));
const rows=[],seen=new Set();
const pairKey=ns=>ns.map(Number).sort((a,b)=>a-b).join('-');
for(const file of fs.readdirSync('data/calendar').filter(f=>/^\d{8}\.json$/.test(f)).sort()){
 const races=JSON.parse(fs.readFileSync('data/calendar/'+file)).races;
 const path='data/market-odds/'+file,markets=fs.existsSync(path)?JSON.parse(fs.readFileSync(path)).races:{};
 for(const r of races){
  const key=[r.date,r.venue,r.race_no].join(':');if(seen.has(key))continue;seen.add(key);
  const base=model.analyze(r,'accuracy'),result=policy.apply(base,markets[r.venue+':'+r.race_no]?.place,{min:2,max:20});
  const market=r.official_result?.pair,settled=market?.status==='confirmed'&&Array.isArray(market.payouts)&&market.payouts.length>0;
  const winning=new Map((settled?market.payouts:[]).map(p=>[pairKey(p.numbers),p.odds]));
  rows.push({date:r.date,venue:r.venue,race:r.race_no,settled:!!settled,candidates:(result.qplPolicy.candidates||[]).map(c=>({partner:{rank:c.partner.rank,number:c.partner.number,prob:c.partner.prob},pick:{prob:c.pick.prob},hit:winning.has(pairKey(c.pick.numbers)),payout:winning.get(pairKey(c.pick.numbers))??null}))});
 }
}
const source=JSON.parse(fs.readFileSync('data/latest.json'));
fs.writeFileSync('qpl-history.json',JSON.stringify({schema:1,policyVersion:policy.VERSION,generatedAt:source.updated_at||new Date().toISOString(),rows}));
console.log('Built QPL range history:',rows.length,'races;',fs.statSync('qpl-history.json').size,'bytes');
