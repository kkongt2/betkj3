const fs=require('node:fs');
const manifest=JSON.parse(fs.readFileSync('qpl-history.json'));
const rows=manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows);
const valid=rows.filter(r=>r.settled&&r.horses.filter(h=>!r.starters||r.starters.includes(h[0])).every(h=>r.quotes.some(q=>q.numbers[0]===h[0])));
let lines=[valid.length+' '+rows.length];
for(const r of valid){
 const hs=r.horses.slice().sort((a,b)=>a[0]-b[0]);
 lines.push([r.date,hs.length,r.k].join(' '));
 for(const h of hs)lines.push([h[0],(!r.starters||r.starters.includes(h[0]))?r.quotes.find(q=>q.numbers[0]===h[0]).odds:-1,h[1],...h[3]].join(' '));
 for(const a of hs)for(const b of hs){const p=r.pairs.find(p=>p.slice(0,2).includes(a[0])&&p.slice(0,2).includes(b[0])&&a!==b);const paid=r.payouts.find(p=>p.numbers.includes(a[0])&&p.numbers.includes(b[0])&&a!==b);lines.push([p?.[2]||0,paid?.odds||0].join(' '));}
}
fs.writeFileSync(process.argv[2],lines.join('\n'));console.log('Exported',valid.length,'races');
