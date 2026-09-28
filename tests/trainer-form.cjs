'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const T=require('../tuning-model.js'),B=require('../weight-balance.js'),H=require('../qpl-history-engine.js');
assert.equal(T.FEATURES.length,22);assert.equal(T.FEATURES[21].id,'trainer_form');
const old=Array(21).fill(0);old[6]=100;
assert.deepEqual(T.settings({weights:old}).weights,[...old,0]);
const w=B.project([...old,20]);assert.equal(w.length,22);assert(B.valid(w));
assert(B.RULES.groups.find(g=>g.id==='people').indices.includes(21));
assert.equal(H.PERIOD.from,'20230101');
if(process.argv.includes('--archive')){
 const manifest=JSON.parse(fs.readFileSync('qpl-history.json'));
 assert(manifest.from>='20230101');assert(manifest.shards.every(s=>s.from>='20230101'));
 const scale=JSON.parse(fs.readFileSync('data/weighted-v3-scaler.json'));
 assert.equal(scale.sourceFrom,'20220101');assert.equal(scale.fitThrough,'20221231');assert.equal(scale.evaluationFrom,'20230101');
 const coverage=JSON.parse(fs.readFileSync('data/weighted-v3-coverage.json'));
 let horses=0,available=0;
 for(const shard of manifest.shards)for(const r of JSON.parse(fs.readFileSync(shard.url)).rows)for(const h of r.horses){
  horses++;assert.equal(h[6].length,22);assert.equal(h[7].available.length,22);
  if(h[7].available[21])available++;else assert.equal(h[6][21],.5);
  if(h[7].through)assert(h[7].through>='20220101'&&h[7].through<r.date);
 }
 assert.equal(horses,coverage.horseStarts);assert.equal(available,coverage.observedCoverage.trainer_form);
 assert(available/horses>.9);
 console.log('PASS rebuilt evaluation archive:',manifest.races,'races;',horses,'starts;',available,'trainer trend observations');
}
console.log('PASS 21→22 saved weights, people-group constraints and evaluation boundary');
