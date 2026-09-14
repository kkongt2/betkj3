const fs=require('node:fs'),assert=require('node:assert/strict'),model=require('../model.js'),policy=require('../qpl-policy.js');
global.KraV7=require('../model-v7.js');
model.setTrainedModel(JSON.parse(fs.readFileSync('data/training-report.json')));
model.setAdvancedModel(JSON.parse(fs.readFileSync('data/model-v6.json')));
model.setChallengerModel(JSON.parse(fs.readFileSync('data/model-v7.json')));
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
 }
}
assert(ready>2000,'The full historical odds archive must be present');
console.log('PASS historical archive:',ready,'eligible races;',pending,'waiting or insufficient-data races');
