const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto'),t=require('../tuning-model.js'),p=require('../strategy-presets.js'),policy=require('../qpl-policy.js'),{evaluate}=require('../scripts/rolling-search.cjs');
const balance=require('../scripts/weight-balance.cjs');
const {RULES,weightMove}=require('../scripts/family-selection.cjs'),{pairDistance}=require('../scripts/preset-diversity.cjs');
const report=JSON.parse(fs.readFileSync('top5-presets.json')),manifest=JSON.parse(fs.readFileSync('qpl-history.json'));
assert.equal(report.scope,'seoul');assert.equal(report.version,t.VERSION);assert.equal(report.presets.length,15);assert.deepEqual(report.selectionRules,RULES);
const rows=manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows).filter(r=>r.date>=report.from&&r.date<=report.to);assert.equal(rows.length,report.sourceRaces);assert(rows.every(r=>r.venue==='seoul'));assert.equal(report.minimumEvaluated,Math.ceil(rows.length*.4));
const counts=new Map(),ranges=new Map(),vectors=[];let previous=Infinity;
for(const preset of report.presets){
 const base=report.bases.find(b=>b.id===preset.baseId);assert(base);assert.deepEqual(p.config(preset.settings),preset.settings);assert.equal(preset.settings.weights.length,17);assert.equal(preset.settings.weights.reduce((a,b)=>a+b,0),100);
 assert.equal(preset.settings.anchorMode,base.settings.anchorMode);assert(Math.abs(preset.settings.min-base.settings.min)<=3);assert(Math.abs(preset.settings.max-base.settings.max)<=3);assert(balance.valid(preset.settings.weights));assert.deepEqual(preset.weightSummary,balance.summary(preset.settings.weights));
 assert(preset.all.hits*20>=preset.all.evaluated*3);assert(preset.all.evaluated>=report.minimumEvaluated);assert(preset.metrics.product<=previous);previous=preset.metrics.product;counts.set(preset.baseId,(counts.get(preset.baseId)||0)+1);
 const key=[preset.baseId,preset.settings.min,preset.settings.max].join(':');ranges.set(key,(ranges.get(key)||0)+1);
 const x=evaluate(rows,preset.settings);assert.deepEqual(x.all,preset.all);assert.equal(x.metrics.product,preset.metrics.product);
 const vector=new Uint16Array(rows.length);for(let i=0;i<rows.length;i++){const row=rows[i];if(!row.settled)continue;const result=policy.apply(t.apply(t.unpack(row),preset.settings),{quotes:row.quotes},preset.settings);if(result.qplPolicy.status==='ready'){const ns=result.pairs[0].numbers.slice().sort((a,b)=>a-b);vector[i]=ns[0]*32+ns[1];}}
 assert.equal(crypto.createHash('sha256').update(Buffer.from(vector.buffer)).digest('hex'),preset.predictionHash);vectors.push(vector);
}
assert.deepEqual([...counts.keys()].sort((a,b)=>a-b),[3,4,9]);assert([...counts.values()].every(n=>n===5));assert([...ranges.values()].every(n=>n<=2));
for(let i=0;i<15;i++){let nearest=1;for(let j=0;j<15;j++)if(i!==j){const d=pairDistance(vectors[i],vectors[j]);assert(d+1e-12>=.1);nearest=Math.min(nearest,d);}assert.equal(nearest,report.presets[i].nearestPairDifference);}
console.log('PASS 15 exact last-five presets: 5 descendants per base 3/4/9, 17 integer weights, 15% hits, 40% coverage, 10% pick differences and balanced weights and bounded rank changes');
