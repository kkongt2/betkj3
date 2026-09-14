const fs=require('node:fs'),assert=require('node:assert/strict'),presets=require('../strategy-presets.js');
const report=JSON.parse(fs.readFileSync('strategy-search.json'));
const minimum=Math.ceil(report.sourceRaces*.4);
assert.equal(report.search.minimumCoverageRatio,.4);
assert.equal(report.search.coverageDenominator,report.sourceRaces);
assert.equal(report.search.minimumEvaluated,minimum);
assert(minimum>report.sourceRaces*.4-1&&minimum>=report.sourceRaces*.4);
for(const r of [report.best,...JSON.parse(fs.readFileSync('research/strategy-search-top.json'))]){
 assert(r.all.evaluated>=minimum,'Best candidates must cover at least 40% of ALL source races');
 assert.equal(r.all.total,report.sourceRaces);
 assert.equal(r.all.total,r.all.evaluated+r.all.excluded);
 assert.equal(r.all.hits,r.all.paidHits);
 assert(Math.abs(r.metrics.product-r.all.payoutTotal/r.all.evaluated)<1e-10);
 presets.config(r.settings);
}
console.log('PASS minimum coverage:',minimum,'of',report.sourceRaces,'races; selected',report.best.all.evaluated);
