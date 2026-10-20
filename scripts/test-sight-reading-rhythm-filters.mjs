import assert from 'node:assert/strict';
import fs from 'node:fs';
const library=fs.readFileSync('src/lib/sightReadingPatterns.ts','utf8');
const source=library.match(/const SOURCE = "([^"]+)"/)?.[1]?.split('|');
assert.equal(source?.length,74);
const parsed=source.map((str,i)=>({
 id:'P'+String(i+1).padStart(2,'0'),
 events:[...str.matchAll(/([nr])(\d+)/g)].map(x=>({rest:x[1]==='r',units:Number(x[2])}))
}));
function classify(events){
 const minimum=Math.min(...events.map(e=>e.units));
 const parent=minimum<=1?1:minimum<=2?2:minimum<=4?4:8;
 const rest=events.some(e=>e.rest);
 const dot=events.some(e=>e.units===3||e.units===6);
 const sub=rest?'rests':dot?(parent===1?'dotted16':'dotted8'):'regular';
 return parent+':'+sub;
}
const map=new Map();
for(const p of parsed){
 const category=classify(p.events);
 map.set(category,(map.get(category)||0)+1);
 assert.equal(p.events.reduce((s,x)=>s+x.units,0),8);
}
assert.equal([...map.values()].reduce((a,b)=>a+b,0),74);
assert.ok(map.has('2:regular'));
assert.ok(map.has('1:regular'));
assert.ok(map.has('1:dotted16'));
assert.ok(map.has('1:rests'));
console.log('PASS rhythm taxonomy, source-constrained 74 patterns:',Object.fromEntries(map));
