import React, { useCallback, useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { jsPDF } from "jspdf";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Tool = "pen" | "marker" | "eraser" | "text";
type Point = [number, number];
type Stroke = { tool: Tool; color: string; width: number; points: Point[]; text?: string };
type Layers = Record<number, Stroke[]>;
const TAGS = ["פסנתר","חליל","קריאה","שליפה","יצירה","מקצבים","קואורדינציה","רמה 1","רמה 2","רמה 3","דואט","ליווי","עיבוד"];
const copy = (value: Layers): Layers => JSON.parse(JSON.stringify(value)) as Layers;
const baseName = (name: string) => name.trim().replace(/[\\/:*?"<>|]/g,"-");

function paint(ctx: CanvasRenderingContext2D, strokes: Stroke[], width: number, height: number) {
  ctx.save();
  for (const s of strokes) {
    if (!s.points.length) continue;
    const x = s.points[0][0] * width, y = s.points[0][1] * height;
    ctx.save();
    if (s.tool === "eraser") ctx.globalCompositeOperation = "destination-out";
    else ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.globalAlpha = s.tool === "marker" ? 0.33 : 1;
    ctx.lineWidth = s.width * width / 700 * (s.tool === "marker" ? 2.4 : s.tool === "eraser" ? 2 : 1);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (s.tool === "text") {
      ctx.font = `${Math.max(16, s.width * width / 45)}px Arial, sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(s.text || "", x, y);
    } else {
      ctx.beginPath();
      ctx.moveTo(x,y);
      for (const point of s.points.slice(1)) ctx.lineTo(point[0]*width, point[1]*height);
      if (s.points.length === 1) ctx.lineTo(x + 0.05,y + 0.05);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

export interface PdfAnnotationResult {fileNameBase: string; pdf: Blob; subject: string; tags: string[]}
export default function PdfAnnotationEditor(props: {
  blob: Blob; initialFileName: string; initialSubject?: string; initialTags?: string[];
  onSave: (result: PdfAnnotationResult) => Promise<void>;
  onCancel: () => void;
}) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [loadingPage,setLoadingPage] = useState(false);
  const [error,setError] = useState("");
  const [fileNameBase,setFileNameBase] = useState(props.initialFileName);
  const [subject,setSubject] = useState(props.initialSubject || "");
  const [tags,setTags] = useState<string[]>(props.initialTags || []);
  const [customTag,setCustomTag] = useState("");
  const [tool,setTool] = useState<Tool>("pen");
  const [color,setColor] = useState("#171717");
  const [penSize,setPenSize] = useState(5);
  const [textValue,setTextValue] = useState("");
  const [zoom,setZoom] = useState(1);
  const [progress,setProgress] = useState("");
  const [layers,setLayers] = useState<Layers>({});
  const layersRef = useRef<Layers>({});
  const undoRef = useRef<Layers[]>([]);
  const redoRef = useRef<Layers[]>([]);
  const active = useRef<Stroke | null>(null);
  const baseCanvas = useRef<HTMLCanvasElement>(null);
  const inkCanvas = useRef<HTMLCanvasElement>(null);

  const updateLayers = (next: Layers) => {layersRef.current=next;setLayers(next);};
  const redraw = useCallback((draft?: Stroke | null) => {
    const el=inkCanvas.current;
    if (!el) return;
    const ctx=el.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0,0,el.width,el.height);
    paint(ctx,[...(layersRef.current[page]||[]),...(draft?[draft]:[])],el.width,el.height);
  },[page]);
  useEffect(()=>{redraw();},[layers,redraw]);

  useEffect(()=>{
    let live=true;
    let pdf:PDFDocumentProxy | undefined;
    let task:ReturnType<typeof getDocument> | undefined;
    void (async()=>{
      try {
        const data = new Uint8Array(await props.blob.arrayBuffer());
        if(!live)return;
        task=getDocument({data,isEvalSupported:false});
        const doc=await task.promise;
        pdf=doc;
        if(live)setDocument(doc);else void doc.destroy();
      }catch(e){if(live)setError("לא ניתן לטעון PDF: "+String(e));}
    })();
    return ()=>{live=false;void pdf?.destroy();void task?.destroy();};
  },[props.blob]);

  useEffect(()=>{
    if(!document)return;
    let cancelled=false;
    const render=async()=>{
      setLoadingPage(true);
      try {
        const p=await document.getPage(page);
        const view=p.getViewport({scale:1});
        const viewport=p.getViewport({scale:Math.min(2.1,1500/view.width)});
        if(cancelled)return;
        const c=baseCanvas.current,ink=inkCanvas.current;
        if(!c||!ink)return;
        c.width=ink.width=Math.round(viewport.width);
        c.height=ink.height=Math.round(viewport.height);
        const ctx=c.getContext("2d",{alpha:false});
        if(!ctx)throw new Error("Canvas אינו זמין");
        ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);
        await p.render({canvasContext:ctx,viewport}).promise;
        if(!cancelled)redraw();
      }catch(e){if(!cancelled)setError("שגיאת ציור PDF: "+String(e));}
      finally{if(!cancelled)setLoadingPage(false);}
    };
    void render();
    return()=>{cancelled=true;};
  },[document,page,redraw]);

  const point=(e:React.PointerEvent<HTMLCanvasElement>):Point=>{
    const r=e.currentTarget.getBoundingClientRect();
    return [Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)),Math.min(1,Math.max(0,(e.clientY-r.top)/r.height))];
  };
  const commit=(stroke:Stroke)=>{
    undoRef.current.push(copy(layersRef.current));
    if(undoRef.current.length>100)undoRef.current.shift();
    redoRef.current=[];
    updateLayers({...layersRef.current,[page]:[...(layersRef.current[page]||[]),stroke]});
  };
  const down=(e:React.PointerEvent<HTMLCanvasElement>)=>{
    if(loadingPage||busy)return;
    if(tool==="text"){
      if(!textValue.trim())return;
      commit({tool,color,width:penSize,points:[point(e)],text:textValue.trim()});
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    active.current={tool,color,width:penSize,points:[point(e)]};
    redraw(active.current);
  };
  const move=(e:React.PointerEvent<HTMLCanvasElement>)=>{
    if(!active.current)return;
    active.current.points.push(point(e));
    redraw(active.current);
  };
  const up=(e:React.PointerEvent<HTMLCanvasElement>)=>{
    if(!active.current)return;
    const stroke=active.current;active.current=null;
    commit(stroke);
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const undo=()=>{
    const prev=undoRef.current.pop();if(!prev)return;
    redoRef.current.push(copy(layersRef.current));updateLayers(prev);
  };
  const redo=()=>{
    const next=redoRef.current.pop();if(!next)return;
    undoRef.current.push(copy(layersRef.current));updateLayers(next);
  };
  const createPdf=async()=>{
    if(!document)throw new Error("המסמך עדיין בטעינה");
    const output=new jsPDF({orientation:"portrait",unit:"mm",format:"a4",compress:true});
    for(let n=1;n<=document.numPages;n++){
      setProgress(`מכין עמוד ${n} מתוך ${document.numPages}`);
      const pdfPage=await document.getPage(n);
      const v=pdfPage.getViewport({scale:1});
      const viewport=pdfPage.getViewport({scale:Math.min(2.4,1750/v.width)});
      const c=window.document.createElement("canvas");
      c.width=Math.max(1,Math.round(viewport.width));c.height=Math.max(1,Math.round(viewport.height));
      const ctx=c.getContext("2d",{alpha:false});if(!ctx)throw new Error("לא ניתן לייצא עמוד");
      ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);
      await pdfPage.render({canvasContext:ctx,viewport}).promise;
      // Render the annotation layer on its own canvas so the eraser never deletes original PDF text.
      const overlay=window.document.createElement("canvas");overlay.width=c.width;overlay.height=c.height;
      const ink=overlay.getContext("2d");if(!ink)throw new Error("לא ניתן לייצא סימונים");
      paint(ink,layersRef.current[n]||[],c.width,c.height);
      ctx.drawImage(overlay,0,0);
      if(n>1)output.addPage("a4","portrait");
      const margin=6, maxW=210-2*margin,maxH=297-2*margin,ratio=Math.min(maxW/c.width,maxH/c.height);
      const w=c.width*ratio,h=c.height*ratio;
      output.addImage(c.toDataURL("image/jpeg",0.93),"JPEG",(210-w)/2,(297-h)/2,w,h,undefined,"FAST");
      c.width=c.height=overlay.width=overlay.height=0;
    }
    setProgress("");
    return output.output("blob");
  };
  const save=async()=>{
    if(!baseName(fileNameBase)||busy)return;
    setBusy(true);setError("");
    try{const pdf=await createPdf();await props.onSave({fileNameBase:baseName(fileNameBase),pdf,subject:subject.trim(),tags});}
    catch(e){setError("השמירה נכשלה: "+String(e));}
    finally{setBusy(false);setProgress("");}
  };
  const print=async()=>{
    const popup=window.open("","_blank");
    if(!popup){setError("הדפדפן חסם חלון הדפסה");return;}
    setBusy(true);
    try{const pdf=await createPdf();const url=URL.createObjectURL(pdf);popup.location.href=url;setTimeout(()=>URL.revokeObjectURL(url),120000);}
    catch(e){popup.close();setError("ההדפסה נכשלה: "+String(e));}
    finally{setBusy(false);setProgress("");}
  };

  return <div className="h-full flex flex-col gap-2" dir="rtl">
    <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-background text-foreground border">
      <input className="rounded border p-2 bg-background w-44" aria-label="שם המסמך" value={fileNameBase} onChange={e=>setFileNameBase(e.target.value)} />
      <input className="rounded border p-2 bg-background w-40" aria-label="נושא" placeholder="נושא" value={subject} onChange={e=>setSubject(e.target.value)} />
      <select className="rounded border bg-background p-2" aria-label="כלי ציור" value={tool} onChange={e=>setTool(e.target.value as Tool)}>
        <option value="pen">עט / עיפרון</option><option value="marker">מרקר</option><option value="eraser">מחק</option><option value="text">טקסט</option>
      </select>
      <input type="color" aria-label="צבע כתיבה" value={color} onChange={e=>setColor(e.target.value)} />
      <button className="border rounded p-2 bg-white text-black" onClick={()=>setColor("#ffffff")}>לבן</button>
      <label className="flex items-center gap-1 text-sm">עובי <input type="range" min="1" max="30" value={penSize} onChange={e=>setPenSize(Number(e.target.value))}/></label>
      {tool==="text"&&<input className="rounded border p-2 bg-background" aria-label="טקסט להוספה" placeholder="כתבי טקסט ולחצי על הדף" value={textValue} onChange={e=>setTextValue(e.target.value)}/>}
      <button className="rounded border p-2" disabled={!undoRef.current.length} onClick={undo}>ביטול</button>
      <button className="rounded border p-2" disabled={!redoRef.current.length} onClick={redo}>חזרה</button>
      <button className="rounded border p-2" onClick={()=>setZoom(v=>Math.max(0.5,v-0.2))}>−</button><span>{Math.round(zoom*100)}%</span><button className="rounded border p-2" onClick={()=>setZoom(v=>Math.min(2.5,v+0.2))}>+</button>
      <details className="relative"><summary className="cursor-pointer border rounded p-2">תגיות ({tags.length})</summary>
        <div className="absolute z-30 top-full right-0 p-3 bg-background border shadow-lg rounded-lg w-72 max-h-64 overflow-auto">
          <div className="flex flex-wrap gap-2">{[...new Set([...TAGS,...tags])].map(t=><label key={t} className="text-xs flex items-center gap-1"><input type="checkbox" checked={tags.includes(t)} onChange={e=>setTags(v=>e.target.checked?[...v,t]:v.filter(x=>x!==t))}/>{t}</label>)}</div>
          <div className="flex mt-2 gap-1"><input className="border bg-background rounded p-1 w-40" value={customTag} aria-label="הוספת תגית" onChange={e=>setCustomTag(e.target.value)}/><button className="border rounded p-1" onClick={()=>{const t=customTag.trim();if(t&&!tags.includes(t))setTags(v=>[...v,t]);setCustomTag("");}}>הוספה</button></div>
        </div>
      </details>
      <button className="border rounded px-3 py-2" disabled={busy||!document} onClick={()=>void print()}>הדפסה</button>
      <button className="border rounded px-3 py-2" onClick={props.onCancel}>סגירה</button>
      <button className="rounded px-4 py-2 bg-primary text-primary-foreground" disabled={busy||!document||!baseName(fileNameBase)} onClick={()=>void save()}>{busy?"שומר…":"שמירת PDF A4"}</button>
    </div>
    <div className="flex items-center justify-center gap-3 text-sm">
      <button className="border rounded px-3 py-1" disabled={page<=1||busy} onClick={()=>setPage(p=>p-1)}>עמוד קודם</button>
      <span>עמוד {page} מתוך {document?.numPages||"…"}</span>
      <button className="border rounded px-3 py-1" disabled={page>=(document?.numPages||1)||busy} onClick={()=>setPage(p=>p+1)}>עמוד הבא</button>
      {loadingPage&&<span>טוען דף…</span>}{progress&&<span>{progress}</span>}
    </div>
    {error&&<div role="alert" className="rounded border border-red-500 text-red-600 p-2 text-sm">{error}</div>}
    <div className="flex-1 overflow-auto min-h-0 bg-slate-400/20 p-3" dir="ltr">
      <div className="relative mx-auto shadow-xl" style={{width:`min(100%, ${Math.round((baseCanvas.current?.width||900)*zoom)}px)`,touchAction:"none"}}>
        <canvas ref={baseCanvas} className="w-full block bg-white" style={{height:"auto"}} />
        <canvas ref={inkCanvas} aria-label="משטח לסימון על PDF" className="absolute inset-0 w-full h-full cursor-crosshair" style={{touchAction:"none"}} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}/>
      </div>
    </div>
  </div>;
}
