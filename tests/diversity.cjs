const assert=require('node:assert/strict'),{pairDistance,weightDistance}=require('../scripts/preset-diversity.cjs'),p=require('../strategy-presets.js');
assert.equal(pairDistance([0,1,2,3],[0,1,4,3]),1/3);assert.equal(pairDistance([0,1],[1,0]),1);assert.equal(pairDistance([0,0],[0,0]),0);
assert.equal(weightDistance([100,0],[0,100]),1);assert.equal(weightDistance([50,50],[55,45]),.05);
const store={data:{},getItem(k){return this.data[k]||null},setItem(k,v){this.data[k]=v}},settings={modelMode:'custom',anchorMode:'odds',weights:Array(16).fill(1),min:2,max:4};
p.saveMany(store,[{name:'old',settings}]);p.saveMany(store,Array.from({length:10},(_,i)=>({name:'preset '+i,settings})));assert.equal(p.read(store).length,11);const before=JSON.stringify(store.data);assert.throws(()=>p.saveMany(store,[{name:'invalid',settings:{...settings,weights:[0]}}]));assert.equal(JSON.stringify(store.data),before);
console.log('PASS prediction distance excludes joint omissions, weight distance and atomic bulk preset save preserves existing settings');
