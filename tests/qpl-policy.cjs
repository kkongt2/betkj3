const assert=require('node:assert/strict'),{apply}=require('../qpl-policy.js');
const horses=Array.from({length:6},(_,i)=>({number:i+1,name:'말'+(i+1)}));
const base={horses,places:horses.map((h,i)=>({numbers:[h.number],prob:.9-i*.1})),pairs:horses.flatMap((h,i)=>horses.slice(i+1).map(j=>({numbers:[h.number,j.number],names:[h.name,j.name],prob:h.number===1&&j.number===2?.99:h.number===1&&j.number===3?.25:h.number===1&&j.number===4?.3:.1}))),models:{place:'existing',pair:'existing'},selection:{pair:{qualified:true}},selectivePicks:{pair:{numbers:[1,2]}}};
const quotes=[1.1,1.2,2,3,5,8].map((odds,i)=>({numbers:[i+1],odds}));
const result=apply(base,{quotes});
assert.deepEqual(result.pairs[0].numbers,[1,4]);assert.equal(result.qplPolicy.partner.rank,4);
assert.deepEqual(result.qplPolicy.candidates.map(c=>c.partner.number).sort(),[3,4]);
assert.equal(result.pairs.length,1);assert.equal(result.selection.pair.qualified,false);assert.equal(result.selectivePicks.pair,null);
assert.deepEqual(base.selectivePicks.pair.numbers,[1,2]);assert.equal(base.pairs.length,15);
for(const q of [null,{quotes:quotes.slice(0,5)},{quotes:[...quotes,quotes[0]]},{quotes:quotes.map((q,i)=>i? q:{...q,odds:0})}])assert.equal(apply(base,q).pairs.length,0);
assert.equal(apply({...base,horses:horses.slice(0,2)},{quotes}).pairs.length,0);
const tied=apply({...base,places:base.places.map(p=>({...p,prob:p.numbers[0]===2?1:p.prob}))},{quotes:quotes.map((q,i)=>i===1?{...q,odds:1.1}:q)});
assert.equal(tied.qplPolicy.anchor.number,2);
const tiePair=apply({...base,pairs:base.pairs.map(p=>({...p,prob:.2}))},{quotes});assert.equal(tiePair.qplPolicy.partner.number,3);
const excluded=apply({...base,official_result:{starters:[1,2,3,4,5]}},{quotes:quotes.slice(0,5)});assert.equal(excluded.qplPolicy.status,'ready');
const reverse=apply({...base,places:[...base.places].reverse(),pairs:[...base.pairs].reverse()},{quotes:[...quotes].reverse()});assert.deepEqual(reverse.pairs[0].numbers,[1,4]);
console.log('PASS fixed lowest-odds anchor; only rank 3/4 partners; existing pair probabilities; ties, missing odds, exclusions and no input mutation');

assert.deepEqual(apply(base,{quotes},{min:2,max:4}).pairs[0].numbers,[1,2]);
assert.deepEqual(apply(base,{quotes},{min:3,max:6}).pairs[0].numbers,[1,4]);
assert.deepEqual(apply(base,{quotes},{min:6,max:20}).pairs[0].numbers,[1,6]);
assert.equal(apply(base,{quotes},{min:7,max:20}).pairs.length,0);
assert.deepEqual(apply(base,{quotes},{min:2,max:2}).pairs[0].numbers,[1,2]);
const {summarize,normalizeRange}=require('../qpl-policy.js');
assert.deepEqual(normalizeRange({min:6,max:3}),{min:3,max:6});
assert.deepEqual(normalizeRange({min:0,max:99}),{min:3,max:4});
const candidates=[{partner:{rank:2,number:2,prob:.8},pick:{prob:.9},hit:false},{partner:{rank:3,number:3,prob:.7},pick:{prob:.6},hit:true}];
const rows=[{date:'20250914',venue:'seoul',settled:true,candidates},{date:'20260913',venue:'busan',settled:true,candidates},{date:'20250913',venue:'jeju',settled:true,candidates},{date:'20260914',venue:'jeju',settled:false,candidates},{date:'20260915',venue:'seoul',settled:true,candidates}];
assert.deepEqual(summarize(rows,{min:3,max:4},'20250914','20260914').all,{total:1,evaluated:1,hits:1,excluded:0,paidHits:0,payoutTotal:0});
assert.equal(summarize(rows,{min:2,max:4},'20250914','20260914').all.hits,0);
assert.equal(summarize(rows,{min:4,max:6},'20250914','20260914').all.evaluated,0);
console.log('PASS configurable ranges, field-size clipping, inclusive dates, unavailable results and changing historical hit counts');

// Average only confirmed winning payouts: losses and unknown payouts never count as zero.
const payoutRows=[2.2,5.4,null].map((payout,i)=>({date:'20260913',venue:'seoul',settled:true,candidates:[{partner:{rank:3,number:3,prob:.7},pick:{prob:.6},hit:true,payout},{partner:{rank:2,number:2,prob:.8},pick:{prob:.9},hit:false,payout:99}]}));
const avg=summarize(payoutRows,{min:3,max:4},'20250914','20260914');
assert.equal(avg.all.hits,3);assert.equal(avg.all.paidHits,2);assert.equal((avg.all.payoutTotal/avg.all.paidHits).toFixed(2),'3.80');
assert.equal(avg.seoul.payoutTotal,7.6000000000000005);assert.equal(avg.busan,undefined);
assert.equal(summarize(payoutRows,{min:2,max:4},'20250914','20260914').all.paidHits,0);
console.log('PASS average winning payout excludes losses and missing odds, and follows selected range');
const analysisBase={...base,places:base.places.map(p=>({...p,prob:p.numbers[0]===4?1:p.prob}))};
const analysis=apply(analysisBase,{quotes},{min:3,max:4,anchorMode:'analysis'});
assert.equal(analysis.qplPolicy.anchor.number,4);assert.equal(analysis.qplPolicy.partner.number,3);
assert.deepEqual(analysis.pairs[0].numbers,[3,4]);
assert.equal(apply(analysisBase,{quotes},{min:4,max:4,anchorMode:'analysis'}).pairs.length,0);
assert.equal(apply({...analysisBase,official_result:{starters:[1,2,3,5,6]}},{quotes},{min:2,max:4,anchorMode:'analysis'}).qplPolicy.anchor.number,1);
console.log('PASS analysis anchor, anchor exclusion from partner range and withdrawn anchor');

for(const anchorRank of [1,2,3]){
 const a=apply(base,{quotes},{min:2,max:6,anchorMode:'odds',anchorRank});assert.equal(a.qplPolicy.anchor.number,anchorRank);assert(a.qplPolicy.candidates.every(c=>c.partner.number!==anchorRank));
 const b=apply(analysisBase,{quotes},{min:2,max:6,anchorMode:'analysis',anchorRank});assert.equal(b.qplPolicy.anchor.number,[4,1,2][anchorRank-1]);
}
assert.equal(apply({...base,official_result:{starters:[2,3,4,5,6]}},{quotes},{min:2,max:6,anchorRank:2}).qplPolicy.anchor.number,3);
assert.equal(apply(base,{quotes},{min:2,max:2,anchorRank:2}).pairs.length,0);
assert.equal(apply({...base,official_result:{starters:[1,2]}},{quotes},{min:2,max:3,anchorRank:3}).pairs.length,0);
assert.equal(apply(base,{quotes},{anchorRank:99}).qplPolicy.anchor.number,1);
console.log('PASS anchor ranks 1/2/3 in odds and analysis, withdrawals, no self pair and insufficient starters');
