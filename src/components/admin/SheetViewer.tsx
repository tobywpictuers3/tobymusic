import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ChevronLeft, ChevronRight, Columns2, Expand, Minus, Plus, Square, X } from 'lucide-react';
import { fetchSheetFile, type SheetPiece } from '@/lib/sheetLibrary';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Props = {
  piece: SheetPiece;
  initialFile?: string;
  onClose: () => void;
};

/**
 * Lesson view: the score fills the screen, pages turn with the keyboard,
 * a Bluetooth page-turner pedal (arrows / PageDown), a tap on the page or a swipe.
 */
export default function SheetViewer({ piece, initialFile, onClose }: Props) {
  const files = useMemo(
    () => [
      ...(piece.score ? [{ name: 'פרטיטורה', file: piece.score }] : []),
      ...piece.parts.map((p) => ({ name: p.name || 'חלק', file: p.file })),
    ],
    [piece],
  );
  const [file, setFile] = useState(initialFile || files[0]?.file || '');
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [twoPages, setTwoPages] = useState(() => window.innerWidth > window.innerHeight * 1.2);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRefs = [useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null)];
  const touchX = useRef<number | null>(null);

  // load the PDF
  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    setLoading(true);
    setError('');
    setDoc(null);
    fetchSheetFile(file)
      .then((data) => getDocument({ data: new Uint8Array(data) }).promise)
      .then((d) => {
        loaded = d;
        if (cancelled) { void d.destroy(); return; }
        setDoc(d);
        setPage(1);
      })
      .catch((e) => !cancelled && setError(e?.message || 'הקובץ לא נטען'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; if (loaded) void loaded.destroy(); };
  }, [file]);

  const pagesShown = twoPages && doc && doc.numPages > 1 ? 2 : 1;
  const step = pagesShown;
  const lastStart = doc ? Math.max(1, doc.numPages - (pagesShown - 1)) : 1;

  const next = useCallback(() => setPage((p) => (doc ? Math.min(lastStart, p + step) : p)), [doc, lastStart, step]);
  const prev = useCallback(() => setPage((p) => Math.max(1, p - step)), [step]);

  // render visible pages
  useEffect(() => {
    if (!doc || !stageRef.current) return;
    let cancelled = false;
    const tasks: { cancel: () => void }[] = [];
    const render = async () => {
      const stage = stageRef.current!;
      const availW = stage.clientWidth / pagesShown - 16;
      const availH = stage.clientHeight - 16;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (let i = 0; i < 2; i += 1) {
        const canvas = canvasRefs[i].current;
        if (!canvas) continue;
        const n = page + i;
        if (i >= pagesShown || n > doc.numPages) { canvas.style.display = 'none'; continue; }
        const pg = await doc.getPage(n);
        if (cancelled) return;
        const base = pg.getViewport({ scale: 1 });
        const fit = Math.min(availW / base.width, availH / base.height) * zoom;
        const vp = pg.getViewport({ scale: fit * dpr });
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        canvas.style.width = `${Math.floor(vp.width / dpr)}px`;
        canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
        canvas.style.display = 'block';
        const task = pg.render({ canvasContext: canvas.getContext('2d')!, viewport: vp });
        tasks.push(task);
        await task.promise.catch(() => undefined);
      }
    };
    void render();
    const onResize = () => { tasks.forEach((t) => t.cancel()); void render(); };
    window.addEventListener('resize', onResize);
    return () => { cancelled = true; tasks.forEach((t) => t.cancel()); window.removeEventListener('resize', onResize); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, page, pagesShown, zoom]);

  // keyboard + page-turner pedals
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); next(); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); prev(); }
      else if (e.key === 'Home') setPage(1);
      else if (e.key === 'End') setPage(lastStart);
      else if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(2.5, z + 0.15));
      else if (e.key === '-') setZoom((z) => Math.max(0.5, z - 0.15));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, lastStart, onClose]);

  const fullscreen = () => {
    const el = stageRef.current?.parentElement;
    if (!document.fullscreenElement) void el?.requestFullscreen?.().catch(() => undefined);
    else void document.exitFullscreen().catch(() => undefined);
  };

  const pageLabel = doc ? (pagesShown === 2 && page + 1 <= doc.numPages ? `${page}–${page + 1}` : `${page}`) + ` / ${doc.numPages}` : '';
  const btn = 'inline-flex items-center justify-center rounded-md border border-white/20 bg-white/10 hover:bg-white/20 text-white min-h-[44px] min-w-[44px] px-3 text-sm';

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-neutral-900" role="dialog" aria-label={`תווים: ${piece.title}`}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-white" dir="rtl">
        <button className={btn} onClick={onClose} aria-label="סגירה (Esc)"><X className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{piece.title}</div>
          <div className="truncate text-xs text-white/60">{[piece.composer, piece.arranger && `עיבוד: ${piece.arranger}`, piece.key].filter(Boolean).join(' · ')}</div>
        </div>
        {files.length > 1 && (
          <select
            className="rounded-md bg-white/10 border border-white/20 text-white min-h-[44px] px-2 text-sm max-w-[45vw]"
            value={file}
            onChange={(e) => setFile(e.target.value)}
            aria-label="בחירת חלק"
          >
            {files.map((f) => <option key={f.file} value={f.file} className="text-black">{f.name}</option>)}
          </select>
        )}
        <button className={btn} onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))} aria-label="הקטנה"><Minus className="h-4 w-4" /></button>
        <button className={btn} onClick={() => setZoom(1)} aria-label="התאמה למסך">{Math.round(zoom * 100)}%</button>
        <button className={btn} onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))} aria-label="הגדלה"><Plus className="h-4 w-4" /></button>
        <button className={btn} onClick={() => setTwoPages((v) => !v)} aria-label={twoPages ? 'דף אחד' : 'שני דפים'} title={twoPages ? 'דף אחד' : 'שני דפים זה לצד זה'}>
          {twoPages ? <Square className="h-4 w-4" /> : <Columns2 className="h-4 w-4" />}
        </button>
        <button className={btn} onClick={fullscreen} aria-label="מסך מלא"><Expand className="h-4 w-4" /></button>
      </div>

      <div
        ref={stageRef}
        className="relative flex-1 overflow-auto flex items-center justify-center gap-4 select-none"
        dir="ltr"
        onClick={(e) => {
          const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          if (e.clientX - r.left > r.width / 2) next(); else prev();
        }}
        onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
        onTouchEnd={(e) => {
          const start = touchX.current;
          const end = e.changedTouches[0]?.clientX;
          touchX.current = null;
          if (start == null || end == null || Math.abs(end - start) < 50) return;
          if (end < start) next(); else prev();
        }}
      >
        {loading && <div className="text-white/70">טוען תווים…</div>}
        {error && <div className="text-red-300 bg-black/40 rounded p-3" dir="rtl">{error}</div>}
        <canvas ref={canvasRefs[0]} className="bg-white shadow-xl" />
        <canvas ref={canvasRefs[1]} className="bg-white shadow-xl" style={{ display: 'none' }} />
      </div>

      <div className="flex items-center justify-center gap-3 py-2 text-white" dir="ltr">
        <button className={btn} onClick={prev} disabled={page <= 1} aria-label="עמוד קודם"><ChevronLeft className="h-6 w-6" /></button>
        <span className="min-w-[90px] text-center tabular-nums" aria-live="polite">{pageLabel}</span>
        <button className={btn} onClick={next} disabled={!doc || page >= lastStart} aria-label="עמוד הבא"><ChevronRight className="h-6 w-6" /></button>
      </div>
    </div>
  );
}
