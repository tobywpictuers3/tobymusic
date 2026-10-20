import assert from 'node:assert/strict';
import fs from 'node:fs';
import { transform } from 'esbuild';
import createModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
const source=fs.readFileSync('src/lib/sightReadingPrintLayout.ts','utf8');
const result=await transform(source,{loader:'ts',format:'esm'});
const { paginateSightReadingXml }=await import('data:text/javascript;base64,'+Buffer.from(result.code).toString('base64'));
let xml='<?xml version="1.0" encoding="utf-8"?><score-partwise version="4.0"><work><work-title>Reading test</work-title></work><part-list><score-part id="P1"><part-name>Reading</part-name></score-part></part-list><part id="P1">';
for(let m=1;m<=64;m++){
  xml+='<measure number="'+m+'">';
  if(m===1)xml+='<attributes><divisions>4</divisions><key><fifths>1</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>';
  if(m>1 && m%4===1)xml+='<print new-system="yes"/>';
  for(let n=0;n<4;n++)xml+='<note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><type>quarter</type></note>';
  xml+='</measure>';
}
xml+='</part></score-partwise>';
const chunks=paginateSightReadingXml(xml,8);
assert.equal(chunks.length,2,'16 musical systems must split into two A4 chunks');
for(let i=0;i<chunks.length;i++){
  assert.equal((chunks[i].match(/<measure\b/g)||[]).length,32,'8 rows with 4 bars');
  assert.ok(chunks[i].includes('<attributes>'),'all pages must retain clef, key and meter');
  assert.ok(chunks[i].includes('<fifths>1</fifths>'));
}
const module=await createModule();
for(const [index,chunk] of chunks.entries()){
 const t=new VerovioToolkit(module);
 t.setOptions({inputFrom:'xml',breaks:'encoded',font:'Bravura',
  pageWidth:2100,pageHeight:2970,scale:55,pageMarginLeft:145,pageMarginRight:145,pageMarginTop:130,pageMarginBottom:130,adjustPageHeight:false});
 assert.ok(t.loadData(chunk),'MusicXML should load on page '+index);
 const pages=t.getPageCount();
 assert.ok(pages>=1,'render A4 pages');
 const svg=t.renderToSVG(1);
 assert.ok(svg.includes('<svg'),'render A4 notation');
 console.log('PDF layout chunk',index+1,'rows 8, Verovio physical pages:',pages);
}
console.log('PASS: max eight systems per PDF source sheet, page attributes repeated');
