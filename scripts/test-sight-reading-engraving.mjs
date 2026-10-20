import assert from 'node:assert/strict';
import fs from 'node:fs';
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
const source=fs.readFileSync(new URL('../src/lib/sightReadingPatterns.ts',import.meta.url),'utf8');
const notes=source.match(/const SOURCE = "([^"]+)"/)?.[1]?.split('|');
const beams=source.match(/const SOURCE_BEAMS = "([^"]+)"/)?.[1]?.split('|');
assert.equal(notes?.length,74,'74 rhythms from source');
assert.equal(beams?.length,74,'74 original beam specs');
for(let i=0;i<74;i++){
  const events=[...notes[i].matchAll(/([nr])(\d+)/g)];
  const states=beams[i].split(',');
  assert.equal(events.length,states.length,'beam count '+(i+1));
  assert.equal(events.reduce((a,e)=>a+Number(e[2]),0),8,'rhythmic duration '+(i+1));
  for(const state of states)assert.match(state,/^(?:-|[BCEFH]{1,2})$/);
}
const module=await createVerovioModule();
const toolkit=new VerovioToolkit(module);
toolkit.setOptions({inputFrom:'xml',font:'Bravura',breaks:'none',pageWidth:1500,pageHeight:700});
const xml='<?xml version="1.0" encoding="utf-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Example</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><time><beats>2</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><type>eighth</type><beam number="1">begin</beam></note><note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><type>eighth</type><beam number="1">end</beam></note><note><rest/><duration>4</duration><type>quarter</type></note></measure></part></score-partwise>';
assert.equal(toolkit.loadData(xml),true,'musicxml loaded');
const svg=toolkit.renderToSVG(1);
assert.ok(svg.startsWith('<svg')||svg.includes('<svg'),'SVG output');
assert.ok(svg.length>1000,'rendered SVG is substantial');
console.log('PASS: 74 original rhythms & beams, and Verovio Bravura SVG render');
