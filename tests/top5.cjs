const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto'),t=require('../tuning-model.js'),p=require('../strategy-presets.js'),{evaluate}=require('../scripts/rolling-search.cjs');
const report=JSON.parse(fs.readFileSync('top5-presets.json')),manifest=JSON.parse(fs.readFileSync('qpl-history.json'));
assert.equal(report.scope,'seoul');assert.equal(report.version,t.VERSION);assert.equal(report.presets.length,5);assert.equal(report.minimumCoverageRatio,.4);assert.equal(report.minimumEvaluated,Math.ceil(report.sourceRaces*.4));
const rows=manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows).filter(r=>r.date>=report.from&&r.date<=report.to);assert.equal(rows.length,report.sourceRaces);assert(rows.every(r=>r.venue==='seoul'));
const hashes=new Set();let previous=Infinity;
for(const preset of report.presets){assert.deepEqual(p.config(preset.settings),preset.settings);assert.equal(preset.settings.weights.length,16);assert.equal(preset.settings.weights.reduce((a,b)=>a+b,0),100);assert(preset.all.evaluated>=report.minimumEvaluated);assert(preset.metrics.product<=previous);previous=preset.metrics.product;hashes.add(preset.predictionHash);
 const x=evaluate(rows,preset.settings);assert.deepEqual(x.all,preset.all);assert.equal(x.metrics.product,preset.metrics.product);assert.equal(x.metrics.average,preset.metrics.average);
 assert.equal(Object.values(preset.years).reduce((n,g)=>n+g.evaluated,0),preset.all.evaluated);
}
assert.equal(hashes.size,5);console.log('PASS five distinct Seoul presets: exact full-history metrics, descending product, integer weights totaling 100%, >=40% source coverage and valid saved configurations');
