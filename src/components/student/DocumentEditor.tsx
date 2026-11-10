// DocumentEditor.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

export type EditorTemplate = "blank" | "lines" | "staff" | "piano";
export type EditorSourceKind = "blank" | "image" | "pdf";
type ToolMode = "pen" | "marker" | "eraser" | "text";
const DEFAULT_TAGS = ["פסנתר","חליל","קריאה","שליפה","יצירה","מקצבים","קואורדינציה","רמה 1","רמה 2","רמה 3","דואט","ליווי","עיבוד"];

function formatA4Px(scale = 2) {
  // A4 ratio ~ 1 : 1.414
  return { w: Math.round(900 * scale), h: Math.round(1273 * scale) };
}

function drawTemplate(ctx: CanvasRenderingContext2D, w: number, h: number, template: EditorTemplate) {
  ctx.save();
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle="#fff";
  ctx.fillRect(0,0,w,h);
  const k=w/900, left=64*k, right=w-left;
  // Consistent TOBY ivory / warm gold printed stationery, drawn locally for offline reliability.
  ctx.fillStyle="#846e49";
  ctx.font=`${18*k}px Georgia, serif`;
  ctx.fillText("TOBY MUSIC",left,52*k);
  ctx.strokeStyle="#bf9b5d";ctx.lineWidth=1.4*k;
  ctx.beginPath();ctx.moveTo(left,67*k);ctx.lineTo(right,67*k);ctx.stroke();
  ctx.fillStyle="#6b5d54";
  ctx.font=`${12*k}px Arial, sans-serif`;
  ctx.textAlign="right";
  ctx.fillText(template==="piano"?"PIANO" : template==="staff"?"MUSIC MANUSCRIPT" : "",right,52*k);
  ctx.textAlign="left";
  const staff=(top:number,x1:number=left,x2:number=right)=>{
    ctx.strokeStyle="#252525";ctx.lineWidth=1.4*k;
    for(let j=0;j<5;j++){let y=top+j*16*k;ctx.beginPath();ctx.moveTo(x1,y);ctx.lineTo(x2,y);ctx.stroke();}
  };
  if(template==="staff"){
    for(let top=135*k;top<h-135*k;top+=145*k)staff(top);
  }else if(template==="piano"){
    for(let top=134*k;top+232*k<h-115*k;top+=302*k){
      const x1=left+22*k;
      staff(top,x1,right);staff(top+142*k,x1,right);
      ctx.strokeStyle="#252525";ctx.lineWidth=1.6*k;
      ctx.beginPath();ctx.moveTo(x1,top);ctx.lineTo(x1,top+206*k);ctx.stroke();
      ctx.font=`${62*k}px Georgia, serif`;ctx.fillStyle="#816846";
      ctx.fillText("{",left-4*k,top+131*k);
    }
  }else if(template==="lines"){
    ctx.strokeStyle="rgba(0,0,0,.2)";ctx.lineWidth=1.4*k;
    for(let top=138*k;top<h-110*k;top+=52*k){ctx.beginPath();ctx.moveTo(left,top);ctx.lineTo(right,top);ctx.stroke();}
  }
  ctx.fillStyle="#b5a183";ctx.font=`${10*k}px Georgia, serif`;
  ctx.textAlign="center";ctx.fillText("TOBY MUSIC",w/2,h-38*k);
  ctx.restore();
}

// --- Minimal PDF generator that embeds a JPEG image (single page A4) ---
async function canvasToPdfBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const base64 = dataUrl.split(",")[1] || "";
  const jpgBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  const pageW = 595.28;
  const pageH = 841.89;

  const imgWpx = canvas.width;
  const imgHpx = canvas.height;

  const imgAspect = imgWpx / imgHpx;
  const pageAspect = pageW / pageH;

  let drawW = pageW;
  let drawH = pageH;
  if (imgAspect > pageAspect) {
    drawW = pageW;
    drawH = pageW / imgAspect;
  } else {
    drawH = pageH;
    drawW = pageH * imgAspect;
  }

  const x = (pageW - drawW) / 2;
  const y = (pageH - drawH) / 2;

  const enc = new TextEncoder();
  const parts: (string | ArrayBuffer)[] = [];
  const objOffsets: number[] = [];

  const push = (p: string | Uint8Array) => parts.push(typeof p === 'string' ? p : p.buffer.slice(p.byteOffset, p.byteOffset + p.byteLength) as ArrayBuffer);
  const len = () =>
    parts.reduce((s, p) => s + (typeof p === "string" ? enc.encode(p).length : p.byteLength), 0);

  push("%PDF-1.3\n");

  const writeObj = (objNum: number, contentPart: string | Uint8Array) => {
    objOffsets[objNum] = len();
    push(contentPart);
  };

  writeObj(1, "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  writeObj(2, "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  writeObj(
    3,
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " +
      pageW.toFixed(2) +
      " " +
      pageH.toFixed(2) +
      "] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n"
  );

  objOffsets[4] = len();
  push(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgWpx} /Height ${imgHpx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpgBytes.length} >>\nstream\n`
  );
  push(jpgBytes);
  push("\nendstream\nendobj\n");

  const content =
    `q\n${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/Im0 Do\nQ\n`;
  const contentBytes = enc.encode(content);
  objOffsets[5] = len();
  push(`5 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n${content}endstream\nendobj\n`);

  const xrefStart = len();
  const objCount = 6;
  let xref = `xref\n0 ${objCount}\n0000000000 65535 f \n`;
  for (let i = 1; i < objCount; i++) {
    const off = objOffsets[i] || 0;
    xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size ${objCount} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return new Blob(parts, { type: "application/pdf" });
}

function safeBaseName(name: string) {
  const trimmed = (name || "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/[\\/:*?"<>|]+/g, "-");
}

function guessKindFromFile(file: File): EditorSourceKind {
  const t = (file.type || "").toLowerCase();
  if (t.includes("pdf")) return "pdf";
  if (t.startsWith("image/")) return "image";
  const n = file.name.toLowerCase();
  if (n.endsWith(".pdf")) return "pdf";
  if (n.match(/\.(png|jpg|jpeg|webp|gif)$/)) return "image";
  return "image";
}

// cursors: simple inline SVG data-URI
function svgCursor(svg: string, hotspotX: number, hotspotY: number) {
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");
  return `url("data:image/svg+xml,${encoded}") ${hotspotX} ${hotspotY}, auto`;
}

const CURSOR_PEN = svgCursor(
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
    <path d="M6 26l4-1 14-14-3-3L7 22l-1 4z" fill="black"/>
    <path d="M19 8l3 3" stroke="white" stroke-width="2"/>
  </svg>`,
  6,
  26
);

const CURSOR_MARKER = svgCursor(
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
    <path d="M7 26l6-2 10-10-4-4L9 20l-2 6z" fill="black"/>
    <rect x="18" y="6" width="8" height="8" fill="rgba(255,205,0,0.9)"/>
  </svg>`,
  7,
  26
);

const CURSOR_ERASER = svgCursor(
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
    <path d="M9 22l8-10 8 6-6 8H9z" fill="black"/>
    <path d="M12 22h14" stroke="white" stroke-width="2"/>
  </svg>`,
  10,
  22
);

const CURSOR_TEXT = "text";

export default function DocumentEditor(props: {
  initialFileName: string;
  mode: "new" | "edit";
  initialTemplate?: EditorTemplate;
  source?: { kind: Exclude<EditorSourceKind, "blank">; blob: Blob };
  onCancel: () => void;
  onSave: (result: { fileNameBase: string; pdf: Blob; subject: string; tags: string[] }) => Promise<void> | void;
}) {
  const { w, h } = useMemo(() => formatA4Px(2), []);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const inkRef = useRef<HTMLCanvasElement | null>(null);

  const [fileNameBase, setFileNameBase] = useState<string>(props.initialFileName || "");
  const [template, setTemplate] = useState<EditorTemplate>(props.initialTemplate || "blank");

  const [tool, setTool] = useState<ToolMode>("pen");
  const [penSize, setPenSize] = useState<number>(6);
  const [inkColor, setInkColor] = useState("#111111");
  const [subject, setSubject] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [zoom, setZoom] = useState<number>(1);

  const [isDrawing, setIsDrawing] = useState(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const [textEdit, setTextEdit] = useState<{ open: boolean; x: number; y: number; value: string }>({
    open: false,
    x: 0,
    y: 0,
    value: "",
  });

  const undoStack = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);

  const [loadingBase, setLoadingBase] = useState<boolean>(false);
  const [pdfNotSupported, setPdfNotSupported] = useState<boolean>(false);

  const snapshotInk = () => {
    const ink = inkRef.current;
    const ctx = ink?.getContext("2d");
    if (!ink || !ctx) return;
    undoStack.current.push(ctx.getImageData(0, 0, w, h));
    redoStack.current = [];
  };

  const restoreInk = (img: ImageData) => {
    const ink = inkRef.current;
    const ctx = ink?.getContext("2d");
    if (!ink || !ctx) return;
    ctx.putImageData(img, 0, 0);
  };

  const undo = () => {
    const ink = inkRef.current;
    const ctx = ink?.getContext("2d");
    if (!ink || !ctx) return;
    if (undoStack.current.length === 0) return;

    redoStack.current.push(ctx.getImageData(0, 0, w, h));
    restoreInk(undoStack.current.pop()!);
  };

  const redo = () => {
    const ink = inkRef.current;
    const ctx = ink?.getContext("2d");
    if (!ink || !ctx) return;
    if (redoStack.current.length === 0) return;

    undoStack.current.push(ctx.getImageData(0, 0, w, h));
    restoreInk(redoStack.current.pop()!);
  };

  const clearInk = () => {
    const ink = inkRef.current;
    const ctx = ink?.getContext("2d");
    if (!ink || !ctx) return;
    snapshotInk();
    ctx.clearRect(0, 0, w, h);
  };

  useEffect(() => {
    const base = baseRef.current;
    const ctx = base?.getContext("2d");
    if (!base || !ctx) return;

    const drawNewTemplate = () => drawTemplate(ctx, w, h, template);

    const drawEditSource = async () => {
      if (!props.source) return;
      setLoadingBase(true);
      setPdfNotSupported(false);

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);

      try {
        if (props.source.kind === "pdf") {
          setPdfNotSupported(true);
          return;
        }

        const url = URL.createObjectURL(props.source.blob);
        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("IMAGE_LOAD_FAILED"));
          img.src = url;
        });

        const imgAspect = img.width / img.height;
        const canvasAspect = w / h;

        let drawW = w;
        let drawH = h;
        if (imgAspect > canvasAspect) {
          drawW = w;
          drawH = w / imgAspect;
        } else {
          drawH = h;
          drawW = h * imgAspect;
        }
        const x = (w - drawW) / 2;
        const y = (h - drawH) / 2;
        ctx.drawImage(img, x, y, drawW, drawH);
        URL.revokeObjectURL(url);
      } finally {
        setLoadingBase(false);
      }
    };

    if (props.mode === "new") drawNewTemplate();
    else void drawEditSource();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mode, props.source?.blob, props.source?.kind, template, w, h]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const ctrl = isMac ? e.metaKey : e.ctrlKey;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const typing = tag === "input" || tag === "textarea";

      if (ctrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
        return;
      }
      if (ctrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if (ctrl && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }

      if (typing) return;

      const k = e.key.toLowerCase();
      if (k === "b") setTool("pen");
      if (k === "m") setTool("marker");
      if (k === "e") setTool("eraser");
      if (k === "t") setTool("text");
      if (k === "escape") props.onCancel();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileNameBase]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (w / rect.width);
    const y = (e.clientY - rect.top) * (h / rect.height);
    return { x, y };
  };

  const beginStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);

    if (tool === "text") {
      const p = getPos(e);
      setTextEdit({ open: true, x: p.x, y: p.y, value: "" });
      return;
    }

    snapshotInk();
    setIsDrawing(true);
    last.current = getPos(e);
  };

  const moveStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const ink = inkRef.current;
    const ctx = ink?.getContext("2d");
    if (!ctx || !last.current) return;

    const p = getPos(e);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.lineWidth = penSize * 2;
    } else if (tool === "marker") {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = inkColor + "59";
      ctx.lineWidth = penSize * 2.4;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = inkColor;
      ctx.lineWidth = penSize;
    }

    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();

    last.current = p;
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setIsDrawing(false);
    last.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const commitText = () => {
    const val = textEdit.value.trimEnd();
    if (!val) {
      setTextEdit((s) => ({ ...s, open: false }));
      return;
    }

    const ink = inkRef.current;
    const ctx = ink?.getContext("2d");
    if (!ink || !ctx) {
      setTextEdit((s) => ({ ...s, open: false }));
      return;
    }

    snapshotInk();

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = inkColor;
    ctx.textBaseline = "top";

    const fontSize = Math.max(18, Math.round(penSize * 3));
    ctx.font = `${fontSize}px Arial`;

    const lines = val.split("\n");
    const lineH = Math.round(fontSize * 1.2);

    let y = textEdit.y;
    for (const line of lines) {
      ctx.fillText(line, textEdit.x, y);
      y += lineH;
    }
    ctx.restore();

    setTextEdit({ open: false, x: 0, y: 0, value: "" });
  };

  const exportMergedCanvas = async (): Promise<HTMLCanvasElement> => {
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const outCtx = out.getContext("2d");
    if (!outCtx) return out;

    outCtx.drawImage(baseRef.current!, 0, 0);
    outCtx.drawImage(inkRef.current!, 0, 0);
    return out;
  };

  const save = async () => {
    const baseName = safeBaseName(fileNameBase);
    if (!baseName || pdfNotSupported) return;

    const merged = await exportMergedCanvas();

    const pdfBlob = await canvasToPdfBlob(merged);

    await props.onSave({ fileNameBase: baseName, pdf: pdfBlob, subject: subject.trim(), tags });
  };

  const printPage = async () => {
    const merged = await exportMergedCanvas();
    const dataUrl = merged.toDataURL("image/png");

    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) return;

    // A4 print styling
    win.document.open();
    win.document.write(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>הדפסה</title>
        <style>
          @page { size: A4; margin: 10mm; }
          html, body { height: 100%; margin: 0; padding: 0; background: #fff; }
          .wrap { display:flex; align-items:center; justify-content:center; height: 100%; }
          img { width: 100%; max-width: 190mm; height: auto; }
        </style>
      </head>
      <body>
        <div class="wrap"><img src="${dataUrl}" /></div>
        <script>
          window.onload = () => {
            setTimeout(() => {
              window.focus();
              window.print();
            }, 50);
          };
        </script>
      </body>
      </html>
    `);
    win.document.close();
  };

  const zoomOut = () => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(2)));
  const zoomIn = () => setZoom((z) => Math.min(2.0, +(z + 0.1).toFixed(2)));

  const cursorForTool = () => {
    if (tool === "pen") return CURSOR_PEN;
    if (tool === "marker") return CURSOR_MARKER;
    if (tool === "eraser") return CURSOR_ERASER;
    if (tool === "text") return CURSOR_TEXT;
    return "auto";
  };

  const toolButtonStyle = (active: boolean) => ({
    padding: "8px 10px",
    borderRadius: 10,
    border: active ? "1px solid rgba(255,255,255,0.35)" : "1px solid rgba(255,255,255,0.15)",
    background: active ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)",
    cursor: "pointer",
    fontSize: 13,
    color: "white",
  });

  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: 12, height: "100%" }}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <div style={{ display: "grid", gap: 4 }}>
              <div style={{ fontSize: 12, opacity: 0.85, color: "white" }}>שם הקובץ</div>
              <input
                value={fileNameBase}
                onChange={(e) => setFileNameBase(e.target.value)}
                placeholder="למשל: שיעור 5"
                style={{
                  minWidth: 240,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(0,0,0,0.2)",
                  color: "white",
                }}
              />
            </div>

            <div style={{display:"grid", gap:4, minWidth:180}}><label style={{fontSize:12,color:"white"}}>נושא</label><input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="נושא הקובץ" style={{padding:8,borderRadius:8,color:"black"}} /></div>
            <details style={{color:"white"}}><summary>תגיות לשמירה ({tags.length})</summary><div style={{display:"flex",flexWrap:"wrap",gap:6,maxWidth:550}}>{[...new Set([...DEFAULT_TAGS,...tags])].map(tag=><label key={tag} style={{fontSize:12,display:"flex",alignItems:"center",gap:3}}><input type="checkbox" checked={tags.includes(tag)} onChange={e=>setTags(v=>e.target.checked?[...v,tag]:v.filter(x=>x!==tag))}/>{tag}</label>)}</div><div style={{display:"flex",gap:4}}><input aria-label="תגית חדשה" value={customTag} onChange={e=>setCustomTag(e.target.value)} placeholder="תגית נוספת" style={{color:"black"}}/><button type="button" onClick={()=>{const t=customTag.trim();if(t&&!tags.includes(t))setTags(v=>[...v,t]);setCustomTag("");}}>הוספה</button></div></details>
            {props.mode === "new" ? (
              <div style={{ display: "grid", gap: 4 }}>
                <div style={{ fontSize: 12, opacity: 0.85, color: "white" }}>סוג דף</div>
                <select
                  value={template}
                  onChange={(e) => setTemplate(e.target.value as EditorTemplate)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.15)",
                    background: "rgba(0,0,0,0.2)",
                    color: "white",
                  }}
                >
                  <option value="blank">דף ריק</option>
                  <option value="staff">דף תווים רגיל</option>
                  <option value="piano">דף תווים לפסנתר</option>
                </select>
              </div>
            ) : null}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <button type="button" onClick={() => setTool("pen")} style={toolButtonStyle(tool === "pen")}>
                עט (B)
              </button>
              <button type="button" onClick={() => setTool("marker")} style={toolButtonStyle(tool === "marker")}>
                מרקר (M)
              </button>
              <button type="button" onClick={() => setTool("eraser")} style={toolButtonStyle(tool === "eraser")}>
                מחק (E)
              </button>
              <button type="button" onClick={() => setTool("text")} style={toolButtonStyle(tool === "text")}>
                טקסט (T)
              </button>

              <label style={{ display: "grid", gap: 4, color: "white", fontSize: 12 }}>צבע כתיבה
                <input aria-label="צבע כתיבה" type="color" value={inkColor} onChange={(e) => setInkColor(e.target.value)} />
              </label>
              <button type="button" onClick={() => setInkColor("#ffffff")} title="כתיבה לבנה לכיסוי תוכן על דף כתוב" style={toolButtonStyle(false)}>לבן</button>
              <div style={{ display: "grid", gap: 4, minWidth: 160 }}>
                <div style={{ fontSize: 12, opacity: 0.85, color: "white" }}>עובי</div>
                <input type="range" min={2} max={18} value={penSize} onChange={(e) => setPenSize(Number(e.target.value))} />
              </div>

              <button type="button" onClick={undo} disabled={undoStack.current.length === 0} style={toolButtonStyle(false)}>
                ביטול (Ctrl+Z)
              </button>
              <button type="button" onClick={redo} disabled={redoStack.current.length === 0} style={toolButtonStyle(false)}>
                קדימה (Ctrl+Y)
              </button>
              <button type="button" onClick={clearInk} style={toolButtonStyle(false)}>
                ניקוי
              </button>

              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button type="button" onClick={zoomOut} style={toolButtonStyle(false)}>
                  −
                </button>
                <div style={{ width: 70, textAlign: "center", fontSize: 12, opacity: 0.9, color: "white" }}>
                  {Math.round(zoom * 100)}%
                </div>
                <button type="button" onClick={zoomIn} style={toolButtonStyle(false)}>
                  +
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={printPage}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(0,0,0,0.25)",
                color: "white",
              }}
            >
              הדפסה
            </button>

            <button
              type="button"
              onClick={props.onCancel}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(0,0,0,0.25)",
                color: "white",
              }}
            >
              השלכה (Esc)
            </button>

            <button
              type="button"
              onClick={() => void save()}
              disabled={!safeBaseName(fileNameBase)}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.15)",
                background: safeBaseName(fileNameBase) ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.08)",
                color: "white",
                cursor: safeBaseName(fileNameBase) ? "pointer" : "not-allowed",
              }}
            >
              שמירה (Ctrl+S)
            </button>
          </div>
        </div>

        {pdfNotSupported ? (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,200,0,0.35)",
              background: "rgba(255,200,0,0.10)",
              color: "white",
            }}
          >
            עריכת PDF עדיין לא זמינה כאן (ללא pdfjs). אפשר לערוך תמונות וליצור דפים חדשים.
          </div>
        ) : null}

        {loadingBase ? (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
            }}
          >
            טוען קובץ לעריכה...
          </div>
        ) : null}
      </div>

      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "auto",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(0,0,0,0.15)",
          touchAction: "none",
        }}
      >
        <div style={{ padding: 12 }}>
          <div style={{ transform: `scale(${zoom})`, transformOrigin: "top right", width: "fit-content" }}>
            <div style={{ position: "relative" }}>
              <canvas ref={baseRef} width={w} height={h} style={{ display: "block", width: w / 2, height: h / 2 }} />
              <canvas
                ref={inkRef}
                width={w}
                height={h}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: w / 2,
                  height: h / 2,
                  cursor: cursorForTool(), // <<< tool cursor
                }}
                onPointerDown={beginStroke}
                onPointerMove={moveStroke}
                onPointerUp={endStroke}
                onPointerCancel={endStroke}
              />

              {textEdit.open ? (
                <div
                  style={{
                    position: "absolute",
                    left: (textEdit.x / w) * (w / 2),
                    top: (textEdit.y / h) * (h / 2),
                    width: 320,
                    zIndex: 50,
                    background: "rgba(0,0,0,0.55)",
                    border: "1px solid rgba(255,255,255,0.18)",
                    borderRadius: 12,
                    padding: 10,
                    color: "white",
                  }}
                >
                  <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 6 }}>הקלדת טקסט</div>
                  <textarea
                    autoFocus
                    value={textEdit.value}
                    onChange={(e) => setTextEdit((s) => ({ ...s, value: e.target.value }))}
                    style={{
                      width: "100%",
                      height: 120,
                      resize: "vertical",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.15)",
                      background: "rgba(0,0,0,0.35)",
                      color: "white",
                      padding: 8,
                      outline: "none",
                    }}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
                    <button type="button" onClick={() => setTextEdit({ open: false, x: 0, y: 0, value: "" })} style={toolButtonStyle(false)}>
                      ביטול
                    </button>
                    <button type="button" onClick={commitText} style={toolButtonStyle(true)}>
                      הוסף טקסט
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function editorSourceFromFile(file: File): { kind: "image" | "pdf"; blob: Blob } {
  const kind = guessKindFromFile(file);
  return { kind: kind === "pdf" ? "pdf" : "image", blob: file };
}
