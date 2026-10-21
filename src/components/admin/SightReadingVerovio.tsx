import { useEffect, useRef, useState } from 'react';
import type { RhythmEvent } from '@/lib/sightReadingPatterns';
import { paginateSightReadingXml } from '@/lib/sightReadingPrintLayout';

type Toolkit = {
  setOptions: (options: Record<string, unknown>) => void;
  loadData: (data: string) => boolean;
  getPageCount: () => number;
  renderToSVG: (page: number) => string;
};
let loader: Promise<(new () => Toolkit)> | null = null;
function verovioClass() {
  if(!loader) loader = Promise.all([import('verovio/wasm'), import('verovio/esm')])
    .then(async ([wasm, api]) => {
      const module = await wasm.default();
      return class extends api.VerovioToolkit {
        constructor() { super(module); }
      } as unknown as new () => Toolkit;
    }).catch(error => { loader=null; throw error; });
  return loader;
}
/** Render trusted Verovio output as an isolated SVG image.\n * HTML sanitizers can strip SMuFL symbol definitions or <use href> references,\n * leaving beams/stems visible but hiding heads, rests and clefs.\n * The browser image context does not execute SVG scripts. Never inject this SVG into HTML. */
function svgImageUrl(svg:string) {
  if (typeof svg !== 'string' || !svg.includes('<svg')) throw new Error('Verovio did not return SVG');
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
const baseOptions = {
  inputFrom:'xml', breaks:'encoded', header:'none', footer:'none',
  svgViewBox:true, svgHtml5:true, smuflTextFont:'embedded',
  font:'Bravura',
};
function makeToolkit(C:new () => Toolkit, xml:string, opts:Record<string, unknown>) {
  const toolkit=new C();
  toolkit.setOptions({...baseOptions,...opts});
  if(!toolkit.loadData(xml)) throw new Error('מנוע התיווי לא הצליח לקרוא את הנתונים');
  return toolkit;
}
const kind:Record<number,string>={1:'16th',2:'eighth',3:'eighth',4:'quarter',6:'quarter',8:'half'};
function patternXML(events:RhythmEvent[]) {
  let xml='<?xml version="1.0" encoding="utf-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Rhythm</part-name></score-part></part-list><part id="P1"><measure number="1">';
  xml+='<attributes><divisions>4</divisions><key><fifths>0</fifths></key><time print-object="no"><beats>2</beats><beat-type>4</beat-type></time><clef print-object="no"><sign>G</sign><line>2</line></clef><staff-details print-object="yes"><staff-lines>0</staff-lines></staff-details></attributes>';
  for(const event of events) {
    xml+='<note>'+(event.rest?'<rest/>':'<pitch><step>G</step><octave>4</octave></pitch>');
    xml+='<duration>'+event.units+'</duration><type>'+kind[event.units]+'</type>';
    if(event.units===3||event.units===6)xml+='<dot/>';
    if(!event.rest && event.beams) for(const n of [1,2] as const) {
      const beam=event.beams[n];if(beam)xml+='<beam number="'+n+'">'+beam+'</beam>';
    }
    xml+='</note>';
  }
  return xml+'</measure></part></score-partwise>';
}
const patternCache=new Map<string,string>();

/** Native in-page professional score: no external runtime CDN or local Finale installation. */
export function EngravedScore({xml}:{xml:string}) {
  const [pages,setPages]=useState<string[]>([]);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    setPages([]);setError('');
    verovioClass().then(C=>{
      if(!active)return;
      const t=makeToolkit(C,xml,{pageWidth:2250,pageHeight:3050,scale:42,breaks:'encoded',adjustPageHeight:false,svgViewBox:true});
      const count=t.getPageCount();
      if(!count||count>30)throw new Error('לא התקבלו דפי תיווי תקינים');
      const imgs=Array.from({length:count},(_,i)=>svgImageUrl(t.renderToSVG(i+1)));
      if(active)setPages(imgs);
    }).catch(e=>{if(active)setError(String(e?.message||e));});
    return()=>{active=false;};
  },[xml]);
  if(error)return <p role="alert" className="text-red-700">תצוגת התווים לא נטענה: {error}. אפשר לייצא MusicXML.</p>;
  if(!pages.length)return <p role="status" className="p-3">מעבדת תיווי מקצועי נטענת מתוך האתר…</p>;
  return <div dir="ltr" className="space-y-4 overflow-x-auto" aria-label="דפי תווים">
    {pages.map((src,i)=><img key={i} src={src} alt={'דף תווים '+(i+1)} className="block bg-white border rounded shadow-sm mx-auto w-full max-w-5xl"/>)}
  </div>;
}

export function EngravedPattern({id,events}:{id:string;events:RhythmEvent[]}) {
  const [svg,setSvg]=useState<string|null>(patternCache.get(id)||null);
  const [error,setError]=useState(false);
  const anchor=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{
    if(patternCache.has(id)){setSvg(patternCache.get(id)!);return;}
    const target=anchor.current;if(!target)return;
    let active=true, started=false;
    const render=()=>{
      if(started)return;started=true;
      verovioClass().then(C=>{
        if(!active)return;
        const toolkit=makeToolkit(C,patternXML(events),{
          pageWidth:1100,pageHeight:280,scale:60,
          breaks:'none',adjustPageHeight:true,adjustPageWidth:true,
          noJustification:true,
        });
        const result=svgImageUrl(toolkit.renderToSVG(1));
        patternCache.set(id,result);
        if(active)setSvg(result);
      }).catch(()=>{if(active)setError(true);});
    };
    const observer=new IntersectionObserver(entries=>{if(entries.some(x=>x.isIntersecting)){observer.disconnect();render();}},{rootMargin:'250px'});
    observer.observe(target);
    return()=>{active=false;observer.disconnect();};
  },[id,events]);
  return <div ref={anchor} className="h-24 flex items-center justify-center overflow-hidden bg-white" dir="ltr">
    {svg?<img className="block w-full h-full object-contain" src={svg} alt={'תבנית '+id}/>:error?<span className="text-xs text-red-600">תצוגה לא זמינה</span>:<span className="text-xs text-slate-500">מכין תיווי…</span>}
  </div>;
}

/** Create a shareable A4 PDF from the same local engraving used by the preview.
 * All SVG pages are rasterized within the isolated image context to preserve
 * Bravura glyphs, avoiding the HTML sanitizer and any network/CDN dependency. */
/** Loads an image without races on cached resources and without hanging forever
 * in filtered browsers. A failed logo is optional, but music images are required. */
function loadPdfImage(src:string,timeoutMs=12000):Promise<HTMLImageElement>{
  return new Promise((resolve,reject)=>{
    const image=new Image();
    let finished=false;
    const finish=(error?:Error)=>{
      if(finished)return;
      finished=true;
      window.clearTimeout(timer);
      image.onload=null;image.onerror=null;
      if(error)reject(error);else resolve(image);
    };
    const timer=window.setTimeout(()=>finish(new Error('זמן טעינת תמונה עבור PDF הסתיים')),timeoutMs);
    image.onload=()=>finish();
    image.onerror=()=>finish(new Error('תמונת תווים או לוגו לא נטענה'));
    image.src=src;
    if(image.complete&&image.naturalWidth>0)finish();
  });
}
async function renderOfficialBlank():Promise<string>{
  // The TOBY colored stationery layout approved 2026-10-19:
  // gold perimeter lines, small upper-right inscription, black logo at
  // bottom-left, gold footer rule and contact panel on lower right.
  const canvas=document.createElement('canvas');
  canvas.width=1240;canvas.height=1754;
  const c=canvas.getContext('2d');
  if(!c)throw new Error('Canvas is not supported for letterhead');
  const k=canvas.width/210;
  const X=(mm:number)=>mm*k;
  const gold='#D5A146';
  c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);
  c.strokeStyle=gold;c.lineWidth=X(0.32);
  c.beginPath();c.moveTo(X(8),X(6.6));c.lineTo(X(202),X(6.6));
  c.moveTo(X(8),X(6.6));c.lineTo(X(8),X(284.8));
  c.lineTo(X(119),X(284.8));c.stroke();
  c.fillStyle='#793D43';c.font=`${X(3.5)}px serif`;
  c.textAlign='right';c.fillText('בס״ד',X(185),X(3.7));
  c.strokeStyle=gold;c.beginPath();c.moveTo(X(120),X(270.3));c.lineTo(X(202),X(270.3));
  c.moveTo(X(120),X(270.3));c.lineTo(X(120),X(285.2));c.stroke();
  c.fillStyle='#74303B';c.textAlign='right';c.font=`bold ${X(5)}px sans-serif`;
  c.fillText('TOBY music | טובי וינברג',X(198),X(277));
  c.textAlign='center';c.font=`${X(2.65)}px sans-serif`;c.fillStyle='#333';
  c.fillText('tobymusic.club  |  TOBY.musicartist@gmail.com',X(160),X(283.3));
  c.fillText('0504124161',X(160),X(288.2));
  let image:HTMLImageElement|null=null;
  try { image=await loadPdfImage('/lovable-uploads/toby-music-logo.png',4500); }
  catch { /* optional decorative logo must never block PDFs */ }
  const loaded=Boolean(image);
  if(loaded && image && image.naturalWidth>0 && image.naturalHeight>0){
    const logoW=42,logoH=logoW*image.naturalHeight/image.naturalWidth;
    c.drawImage(image,X(35),X(290-logoH),X(logoW),X(logoH));
  } else {
    c.fillStyle='#74303B';c.font=`bold ${X(6)}px serif`;
    c.textAlign='left';c.fillText('TOBY music',X(29),X(284));
  }
  return canvas.toDataURL('image/png');
}

/** A4 with native-size music, eight evenly-spaced systems per page.
 * Rendering a separate system avoids Verovio squeezing eight rows into
 * the top of a large mostly blank SVG canvas.
 */
export async function makeSightReadingPdf(xml:string):Promise<Blob>{
  const C=await verovioClass();
  const chunks=paginateSightReadingXml(xml,1);
  if(!chunks.length||chunks.length>120)throw new Error('מספר שורות תווים לא תקין');
  const {jsPDF}=await import('jspdf');
  const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
  const blank=await renderOfficialBlank();
  const rowsPerPage=8;
  const topY=26,bottomY=254;
  const slot=(bottomY-topY)/rowsPerPage;
  for(let i=0;i<chunks.length;i++){
    if(i>0&&i%rowsPerPage===0)pdf.addPage();
    if(i%rowsPerPage===0)pdf.addImage(blank,'PNG',0,0,210,297,'toby-letterhead-'+(i/rowsPerPage),'FAST');
    const toolkit=makeToolkit(C,chunks[i],{
      // A 42mm page caused Verovio to split some busy systems across
      // two internal pages, aborting ALL PDF generation. Give the renderer
      // enough vertical room and let it crop to notation height.
      pageWidth:2100,pageHeight:1500,scale:76,breaks:'none',
      adjustPageHeight:true,svgViewBox:true,
      pageMarginLeft:125,pageMarginRight:125,pageMarginTop:30,pageMarginBottom:30,
      noJustification:true,header:'none',footer:'none',
    });
    const count=toolkit.getPageCount();
    if(count!==1)throw new Error('שגיאת תיווי: שורה '+(i+1)+' הופקה כ-'+count+' דפים פנימיים');
    const svg=toolkit.renderToSVG(1);
    const image=await loadPdfImage(svgImageUrl(svg),15000);
    // Verovio's SVG image includes blank *page* canvas. Scaling the
    // entire image to a 28-mm slot shrinks the actual notation drastically.
    // Trim blank space around *ink*, then maximize the score's size in
    // the available 185 mm x (slot-2 mm) rectangle without distortion.
    const canvas=document.createElement('canvas');
    canvas.width=1850;
    canvas.height=Math.max(140,Math.round(canvas.width*image.naturalHeight/image.naturalWidth));
    const context=canvas.getContext('2d',{willReadFrequently:true});
    if(!context)throw new Error('לא ניתן לעבד תווים להדפסה');
    context.clearRect(0,0,canvas.width,canvas.height);
    context.drawImage(image,0,0,canvas.width,canvas.height);
    const bitmap=context.getImageData(0,0,canvas.width,canvas.height);
    const data=bitmap.data;
    let xMin=canvas.width,yMin=canvas.height,xMax=-1,yMax=-1;
    // Ignore white/transparent page backgrounds but preserve every music
    // glyph, ledger line, staff line, accidental, clef and barline.
    for(let y=0;y<canvas.height;y++){
      for(let x=0;x<canvas.width;x++){
        const pos=(y*canvas.width+x)*4;
        if(data[pos+3]<40)continue;
        if(data[pos]>245&&data[pos+1]>245&&data[pos+2]>245)continue;
        if(x<xMin)xMin=x;if(x>xMax)xMax=x;
        if(y<yMin)yMin=y;if(y>yMax)yMax=y;
      }
    }
    if(xMax<xMin||yMax<yMin)throw new Error('תיווי ריק בשורה '+(i+1));
    const pad=14;
    const sx=Math.max(0,xMin-pad),sy=Math.max(0,yMin-pad);
    const sw=Math.min(canvas.width-sx,xMax-xMin+1+2*pad);
    const sh=Math.min(canvas.height-sy,yMax-yMin+1+2*pad);
    const cropped=document.createElement('canvas');
    cropped.width=sw;cropped.height=sh;
    const ctx=cropped.getContext('2d');
    if(!ctx)throw new Error('לא ניתן להכין תווים מוגדלים');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,sw,sh);
    ctx.drawImage(canvas,sx,sy,sw,sh,0,0,sw,sh);
    const png=cropped.toDataURL('image/png');
    const ratio=sh/sw;
    const width=Math.min(185,(slot-2)/ratio);
    const height=width*ratio;
    const y=topY+(i%rowsPerPage)*slot+(slot-height)/2;
    pdf.addImage(png,'PNG',(210-width)/2,y,width,height,undefined,'FAST');
  }
  return pdf.output('blob');
}
