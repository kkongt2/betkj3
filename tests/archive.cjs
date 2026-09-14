const fs=require('node:fs'),assert=require('node:assert/strict'),model=require('../model.js'),policy=require('../qpl-policy.js');
global.KraV7=require('../model-v7.js');
model.setTrainedModel(JSON.parse(fs.readFileSync('data/training-report.json')));
model.setAdvancedModel(JSON.parse(fs.readFileSync('data/model-v6.json')));
model.setChallengerModel(JSON.parse(fs.readFileSync('data/model-v7.json')));
const history=JSON.parse(fs.readFileSync('qpl-history.json'));
assert.equal(history.policyVersion,policy.VERSION);
const indexed=new Map(history.rows.map(r=>[[r.date,r.venue,r.race].join(':'),r]));
const counts=new Map();
let ready=0,pending=0;
for(const file of fs.readdirSync('data/calendar').filter(f=>/^\d{8}\.json$/.test(f))){
 const races=JSON.parse(fs.readFileSync('data/calendar/'+file)).races;
 const oddsPath='data/market-odds/'+file,odds=fs.existsSync(oddsPath)?JSON.parse(fs.readFileSync(oddsPath)).races:{};
 for(const r of races){
  const b=model.analyze(r),p=policy.apply(b,odds[r.venue+':'+r.race_no]?.place);
  if(p.qplPolicy.status!=='ready'){pending++;assert.equal(p.pairs.length,0);continue;}
  ready++;const q=p.qplPolicy,ns=p.pairs[0].numbers.map(Number);
  assert.equal(ns.length,2);assert(ns.includes(q.anchor.number));assert(ns.includes(q.partner.number));assert([3,4].includes(q.partner.rank));
  assert(q.candidates.every(c=>p.pairs[0].prob>=c.pick.prob));assert.deepEqual(p.places,b.places);
  const row=indexed.get([r.date,r.venue,r.race_no].join(':'));assert(row);
  for(const range of [{min:3,max:4},{min:2,max:4},{min:3,max:6},{min:14,max:20}]){
   const full=policy.apply(b,odds[r.venue+':'+r.race_no]?.place,range),compact=policy.choose(row.candidates,range);
   assert.equal(full.qplPolicy.partner?.number,compact?.partner.number);
   if(!compact||!row.settled)continue;
   const key=ns=>ns.map(Number).sort((a,b)=>a-b).join('-');
   const hit=r.official_result.pair.payouts.some(x=>key(x.numbers)===key(full.pairs[0].numbers));
   assert.equal(compact.hit,hit);
   assert.equal(compact.payout,r.official_result.pair.payouts.find(x=>key(x.numbers)===key(full.pairs[0].numbers))?.odds??null);
   const k=range.min+'~'+range.max,c=counts.get(k)||{evaluated:0,hits:0};c.evaluated++;c.hits+=hit?1:0;counts.set(k,c);
  }
 }
}
assert(ready>2000,'The full historical odds archive must be present');
console.log('PASS historical archive:',ready,'eligible races;',pending,'waiting or insufficient-data races');

for(const [range,c] of counts){const [min,max]=range.split('~').map(Number),g=policy.summarize(history.rows,{min,max},'00000000','99999999').all;assert.equal(g.hits,c.hits);assert.equal(g.evaluated,c.evaluated);console.log('PASS range',range,JSON.stringify(c));}
