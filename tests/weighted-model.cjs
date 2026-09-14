const fs=require('node:fs'),assert=require('node:assert/strict'),tuning=require('../tuning-model.js'),model=require('../model.js'),presets=require('../strategy-presets.js'),hist=require('../qpl-history-engine.js');
const race={date:'20260913',venue:'seoul',race_no:1,horses:Array.from({length:9},(_,i)=>({number:i+1,name:'말'+i,rating:20+i,weighted_features:Array.from({length:13},(_,j)=>j===10?i/8:j===11?1-i/8:.5)})),official_result:{starters:[1,2,3,4,5,6,7,8],pair:{status:'confirmed',payouts:[{numbers:[1,8],odds:4}]}}};
const base=model.analyze(race),w=Array(13).fill(0);w[10]=100;
const config={modelMode:'custom',weights:w,anchorMode:'analysis',min:2,max:4};
const a=tuning.apply(base,config);assert.equal(a.horses.length,8);assert.equal(a.places[0].numbers[0],8);assert.equal(a.model,'user-weighted-v2');
assert(Math.abs(a.places.reduce((s,x)=>s+x.prob,0)-3)<1e-9);
assert(Math.abs(a.pairs.reduce((s,x)=>s+x.prob,0)-3)<1e-9);
const market={quotes:race.horses.map(h=>({numbers:[h.number],odds:1+h.number/10}))},row=tuning.pack(base,market);
assert.equal(row.horses[0][4].length,13);
const b=tuning.apply(tuning.unpack(row),config);assert.deepEqual(a.pairs.map(p=>p.prob),b.pairs.map(p=>p.prob));
w[10]=0;w[11]=100;assert.equal(tuning.apply(base,config).places[0].numbers[0],1);
assert.equal(presets.config({...config,weights:[33,9,18,12,10,6,4,3,3,2]}).modelMode,'legacy');
const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
presets.save(storage,'v2',config);assert.deepEqual(presets.read(storage)[0].settings,config);
const manifest=JSON.parse(fs.readFileSync('qpl-history.json'));let starts=0;
for(const s of manifest.shards)for(const r of JSON.parse(fs.readFileSync(s.url)).rows)for(const h of r.horses){assert.equal(h[4]?.length,13);assert(h[4].every(x=>Number.isFinite(x)&&x>=0&&x<=1));if(h[5]?.through)assert(h[5].through<r.date);starts++;}
const coverage=JSON.parse(fs.readFileSync('data/weighted-coverage.json'));assert.equal(coverage.currentResultInputs,false);assert.equal(coverage.sameDayResultsInputs,false);assert.equal(coverage.fitThrough,'20231231');
console.log('PASS new metric sensitivity, official starter filtering, compact/live probability equivalence, old preset migration, 13-weight save roundtrip and',starts,'prior-date feature vectors');

assert.equal(tuning.settings({modelMode:'legacy',weights:[0,0,0,0,0,0,0,0,0,0,100,0,0]}).weights.length,10);
