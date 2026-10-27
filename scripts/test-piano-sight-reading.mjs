import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const src=fs.readFileSync('src/lib/pianoSightReading.ts','utf8');
const compiled=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
vm.runInNewContext(compiled,{module:mod,exports:mod.exports,Math,require:()=>({
  buildRhythmBar:(beats,ids)=>Array.from({length:beats*4},()=>({units:1,rest:false,sourceId:ids[0]}))
})});
const {generatePianoXml,normalizePianoNotation}=mod.exports;
const staff=(clef,low,high)=>({clef,low,high,allowed:[0,1,2,3,4,5,6],intervalMode:'fifth',repeatShort:false,patterns:['P01']});
const base={title:'Piano',beats:4,bars:2,rows:4,fifths:0,doubleBar:true,
  right:staff('G','C4','C5'),left:staff('F','C3','C4'),
  rules:{oneHandAtATime:false,matchingRhythm:false,tenPercentHand:'none',sameDirection:false}};
const tones=x=>[...x.matchAll(/<note>([\s\S]*?)<\/note>/g)].map(m=>({
  duration:Number(m[1].match(/<duration>(\d+)<\/duration>/)?.[1]),
  rest:m[1].includes('<rest'),
  beam:m[1].match(/<beam number="1">([^<]+)<\/beam>/)?.[1],
  pitch:m[1].match(/<step>([A-G])<\/step>[\s\S]*?<octave>(\d+)<\/octave>/)?.slice(1)
}));
for(const [name,rules] of [
  ['default',{}],['matching',{matchingRhythm:true}],['exclusive',{oneHandAtATime:true}],
  ['ten-percent-right',{tenPercentHand:'right'}],['ten-percent-left',{tenPercentHand:'left'}],
  ['exclusive-minority',{oneHandAtATime:true,tenPercentHand:'right'}],
  ['parallel',{sameDirection:true}]
]){
  for(let retry=0;retry<3;retry++){
    const xml=generatePianoXml({...base,rules:{...base.rules,...rules}});
    assert.match(xml,/<staves>2<\/staves>/);
    assert.match(xml,/<clef number="2"><sign>F<\/sign>/);
    const measures=[...xml.matchAll(/<measure number="\d+">([\s\S]*?)<\/measure>/g)];
    assert.equal(measures.length,8,name);
    let played=[0,0],last=[null,null];
    for(const [measureIndex,match] of measures.entries()){
      const [rh,lh]=match[1].split(/<backup><duration>16<\/duration><\/backup>/);
      assert.ok(lh,name);
      const streams=[tones(rh),tones(lh)];
      streams.forEach((stream,i)=>{
        assert.equal(stream.reduce((n,x)=>n+x.duration,0),16,name+' meter '+i);
        // Beaming cannot run into a rest; each numbered group must end.
        let inside=false;
        for(const x of stream){
          if(x.rest){assert.equal(inside,false,name+' dangling beam into rest');}
          if(x.beam==='begin') {assert.equal(inside,false);inside=true;}
          if(x.beam==='end'){assert.equal(inside,true);inside=false;}
        }
        assert.equal(inside,false,name+' unterminated beam');
      });
      // Compare note activity on the sixteenth-note grid, not raw XML
      // event counts, because consecutive rests are correctly consolidated.
      const grid=streams.map(stream=>stream.flatMap(x=>Array.from({length:x.duration},(_,k)=>!x.rest&&k===0)));
      for(let tick=0;tick<16;tick++){
        if(rules.oneHandAtATime)assert.ok(!(grid[0][tick]&&grid[1][tick]),name+' overlap');
        if(rules.matchingRhythm)assert.equal(grid[0][tick],grid[1][tick],name+' mismatch');
      }
      streams.forEach((stream,i)=>{
        for(const x of stream){
          if(x.rest)continue;
          played[i]++;
          if(!rules.sameDirection||!x.pitch)continue;
          const degree=Number(x.pitch[1])*7+['C','D','E','F','G','A','B'].indexOf(x.pitch[0]);
          last[i]=degree;
        }
      });
      if(measureIndex===measures.length-1)assert.match(match[1],/<bar-style>light-light<\/bar-style>/);
      else assert.doesNotMatch(match[1],/<bar-style>light-light<\/bar-style>/);
    }
    if(rules.tenPercentHand){
      const idx=rules.tenPercentHand==='left'?1:0;
      assert.ok(Math.abs(played[idx]-Math.round((played[0]+played[1])*.1))<=1,name+' wrong ratio');
    }
  }
}
const examples=[
  [{units:1,rest:false,sourceId:'x'},{units:1,rest:true,sourceId:'x'},{units:1,rest:true,sourceId:'x'},{units:1,rest:true,sourceId:'x'}],
  Array.from({length:16},()=>({units:1,rest:true,sourceId:'x'}))
];
assert.deepEqual(Array.from(normalizePianoNotation(examples[0],1).map(x=>x.units)),[1,3]);
assert.equal(normalizePianoNotation(examples[1],4).length,1,'entire silent measure uses one rest');
assert.throws(()=>generatePianoXml({...base,rules:{...base.rules,oneHandAtATime:true,matchingRhythm:true}}));
console.log('PASS: grand staff, compact rests, beam groups, musical rules and final barline');
