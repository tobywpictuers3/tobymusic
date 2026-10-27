import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
const src=fs.readFileSync('src/lib/pianoSightReading.ts','utf8');
const compiled=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
vm.runInNewContext(compiled,{
  module:mod,exports:mod.exports,Math,
  require:()=>({buildRhythmBar:(beats,ids)=>Array.from({length:beats},()=>({units:4,rest:false,sourceId:ids[0]}))})
});
const create=mod.exports.generatePianoXml;
const staff=(clef,low,high)=>({clef,low,high,allowed:[0,1,2,3,4,5,6],intervalMode:'fifth',repeatShort:false,patterns:['P01']});
const base={title:'Piano',beats:4,bars:4,rows:4,fifths:0,doubleBar:true,
 right:staff('G','C4','C5'),left:staff('F','C3','C4'),
 rules:{oneHandAtATime:false,matchingRhythm:false,tenPercentHand:'none',sameDirection:false}};
const cases=[
  ['default',{}],['matching',{matchingRhythm:true}],
  ['one-hand',{oneHandAtATime:true}],
  ['minority-left',{tenPercentHand:'left'}],['minority-right',{tenPercentHand:'right'}],
  ['one-hand-left',{oneHandAtATime:true,tenPercentHand:'left'}],
  ['same-direction',{sameDirection:true}]
];
for(const [name,extra] of cases){
  for(let repeat=0;repeat<5;repeat++){
    const xml=create({...base,rules:{...base.rules,...extra}});
    assert.match(xml,/<staves>2<\/staves>/,name);
    assert.match(xml,/<clef number="2"><sign>F<\/sign>/,name);
    const measures=[...xml.matchAll(/<measure number="\d+">([\s\S]*?)<\/measure>/g)];
    assert.equal(measures.length,16,name);
    let count=[0,0],last=[null,null];
    for(const m of measures){
      const [right,left]=m[1].split(/<backup><duration>16<\/duration><\/backup>/);
      assert.ok(left,name+' missing second staff');
      const rNotes=[...right.matchAll(/<note>([\s\S]*?)<\/note>/g)].map(x=>x[1]);
      const lNotes=[...left.matchAll(/<note>([\s\S]*?)<\/note>/g)].map(x=>x[1]);
      assert.equal(rNotes.length,lNotes.length,name);
      for(let n=0;n<rNotes.length;n++){
        const played=[rNotes[n],lNotes[n]].map(x=>!x.includes('<rest/>'));
        if(extra.oneHandAtATime)assert.ok(played.filter(Boolean).length<=1,name+' overlap');
        if(extra.matchingRhythm)assert.deepEqual(played,[true,true],name);
        if(extra.sameDirection){
          const cur=[rNotes[n],lNotes[n]].map(x=>{
            const step=x.match(/<step>([A-G])<\/step>/)?.[1];
            const oct=x.match(/<octave>(\d+)<\/octave>/)?.[1];
            return step?Number(oct)*7+['C','D','E','F','G','A','B'].indexOf(step):null;
          });
          if(cur.every(x=>x!==null)&&last.every(x=>x!==null)){
            const d=cur.map((x,i)=>Math.sign(x-last[i]));
            assert.ok(d[0]*d[1]>=0,name+' contrary melodic motion');
          }
          last=cur;
        }
        played.forEach((yes,i)=>{if(yes)count[i]++});
      }
    }
    if(extra.tenPercentHand!=='none'&&extra.tenPercentHand!==undefined){
      const i=extra.tenPercentHand==='left'?1:0;
      assert.ok(Math.abs(count[i]-Math.round((count[0]+count[1])*.1))<=1,name+' wrong ratio');
    }
  }
}
assert.throws(()=>create({...base,rules:{...base.rules,oneHandAtATime:true,matchingRhythm:true}}));
assert.throws(()=>create({...base,left:{...base.left,patterns:['P02']},rules:{...base.rules,matchingRhythm:true}}));
console.log('PASS: dual staff XML, independent notes, no overlap, 90/10, matched rhythm and parallel motion');
