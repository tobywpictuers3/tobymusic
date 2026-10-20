import { useEffect, useRef, useState } from 'react';
import type { RhythmEvent } from '@/lib/sightReadingPatterns';

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
export async function makeSightReadingPdf(xml:string):Promise<Blob>{
  const C=await verovioClass();
  const t=makeToolkit(C,xml,{pageWidth:2250,pageHeight:3050,scale:42,breaks:'encoded',adjustPageHeight:false,svgViewBox:true});
  const count=t.getPageCount();
  if(!count||count>30)throw new Error('לא ניתן להפיק PDF: מספר עמודים לא תקין');
  const {jsPDF}=await import('jspdf');
  const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
  for(let i=1;i<=count;i++){
    const svg=t.renderToSVG(i);
    const image=new Image();
    image.src=svgImageUrl(svg);
    await new Promise<void>((resolve,reject)=>{
      image.onload=()=>resolve();
      image.onerror=()=>reject(new Error('טעינת דף תווים ל-PDF נכשלה'));
    });
    const canvas=document.createElement('canvas');
    const ratio=image.naturalHeight/image.naturalWidth;
    canvas.width=1400;canvas.height=Math.max(300,Math.round(canvas.width*ratio));
    const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('אין אפשרות להפיק PDF בדפדפן זה');
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const jpeg=canvas.toDataURL('image/jpeg',0.93);
    if(i>1)pdf.addPage();
    const targetW=190,targetH=Math.min(277,targetW*ratio);
    pdf.addImage(jpeg,'JPEG',10,10,targetW,targetH,undefined,'FAST');
  }
  return pdf.output('blob');
}
