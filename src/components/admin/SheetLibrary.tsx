import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Copy, Download, ExternalLink, Globe, ListMusic, Loader2, Search, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import SheetViewer from './SheetViewer';
import {
  downloadMusicXml, facetCounts, filterPieces, loadCatalog, markRecent, readList, searchImslp, toggleInList, writeList,
  SheetAccessError, type ImslpResponse, type SheetFilters, type SheetPiece,
} from '@/lib/sheetLibrary';

type View = 'all' | 'favorites' | 'recent' | 'lesson';
const PAGE = 60;

const IMSLP_WHY: Record<string, string> = {
  composer: 'מלחין', form: 'סוג יצירה', opus: 'אופוס', catalog: 'מספר קטלוגי', number: 'מספר', instrument: 'כלי', key: 'סולם', famous: 'שם מוכר',
};

export default function SheetLibrary() {
  const [pieces, setPieces] = useState<SheetPiece[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [filters, setFilters] = useState<SheetFilters>({ query: '', instrument: '', ensemble: '', key: '', includeNumbered: false });
  const [view, setView] = useState<View>('all');
  const [shown, setShown] = useState(PAGE);
  const [lists, setLists] = useState(() => ({ favorites: readList('favorites'), recent: readList('recent'), lesson: readList('lesson') }));
  const [open, setOpen] = useState<{ piece: SheetPiece; file?: string } | null>(null);
  const [imslp, setImslp] = useState<{ q: string; loading: boolean; data?: ImslpResponse; error?: string } | null>(null);

  useEffect(() => {
    loadCatalog()
      .then(setPieces)
      .catch((e) => setLoadError(e instanceof SheetAccessError ? 'ספריית התווים פתוחה רק בכניסת מנהלת.' : 'לא הצלחתי לטעון את ספריית התווים. בדקי את החיבור ונסי שוב.'));
    const sync = () => setLists({ favorites: readList('favorites'), recent: readList('recent'), lesson: readList('lesson') });
    window.addEventListener('toby-sheets-lists', sync);
    return () => window.removeEventListener('toby-sheets-lists', sync);
  }, []);

  const byId = useMemo(() => new Map((pieces || []).map((p) => [p.id, p])), [pieces]);
  const facets = useMemo(() => facetCounts(pieces || []), [pieces]);

  const results = useMemo(() => {
    if (!pieces) return [];
    if (view !== 'all') {
      const ids = lists[view];
      const subset = ids.map((id) => byId.get(id)).filter(Boolean) as SheetPiece[];
      return filters.query ? filterPieces(subset, { ...filters, includeNumbered: true }) : subset;
    }
    return filterPieces(pieces, filters);
  }, [pieces, filters, view, lists, byId]);

  useEffect(() => setShown(PAGE), [filters, view]);

  const set = (patch: Partial<SheetFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const openPiece = (piece: SheetPiece, file?: string) => {
    markRecent(piece.id);
    setOpen({ piece, file });
  };

  const runImslp = async (q = filters.query) => {
    const query = q.trim();
    if (!query) { toast({ title: 'כתבי מה לחפש, למשל: אימפרומפטו שוברט אופוס 90' }); return; }
    setImslp({ q: query, loading: true });
    try {
      setImslp({ q: query, loading: false, data: await searchImslp(query) });
    } catch (e) {
      setImslp({ q: query, loading: false, error: e instanceof Error ? e.message : 'החיפוש נכשל' });
    }
  };

  const copyPath = async (p: SheetPiece) => {
    try {
      await navigator.clipboard.writeText(p.finalePath);
      toast({ title: 'הנתיב הועתק', description: 'הדביקי אותו בסייר הקבצים כדי לפתוח את קובץ הפינאלה' });
    } catch {
      toast({ title: 'נתיב קובץ הפינאלה', description: p.finalePath });
    }
  };

  const getXml = async (p: SheetPiece) => {
    try {
      await downloadMusicXml(p);
      toast({ title: 'הורד קובץ MusicXML', description: 'פותחים אותו ב-MuseScore (חינמי) כדי לערוך' });
    } catch (e) {
      toast({ title: 'ההורדה נכשלה', description: e instanceof Error ? e.message : '', variant: 'destructive' });
    }
  };

  if (loadError) return <div className="rounded-lg border p-6 text-center" dir="rtl">{loadError}</div>;
  if (!pieces) return <div className="flex items-center justify-center gap-2 p-10" dir="rtl"><Loader2 className="h-5 w-5 animate-spin" /> טוען את ספריית התווים…</div>;

  const tab = (v: View, label: string, count?: number) => (
    <button
      key={v}
      onClick={() => setView(v)}
      className={`rounded-full px-4 min-h-[40px] text-sm border transition ${view === v ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}
      aria-pressed={view === v}
    >
      {label}{count !== undefined ? ` (${count})` : ''}
    </button>
  );

  return (
    <div className="space-y-4" dir="rtl">
      {/* search */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => { e.preventDefault(); if (view !== 'all') setView('all'); }}
          role="search"
        >
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={filters.query}
              onChange={(e) => set({ query: e.target.value })}
              placeholder="חיפוש: שם יצירה, מלחין, כלי, סולם, תיקייה…"
              className="pr-9 min-h-[48px] text-base"
              aria-label="חיפוש בספריית התווים"
              autoFocus
            />
            {filters.query && (
              <button type="button" className="absolute left-2 top-1/2 -translate-y-1/2 p-2" onClick={() => set({ query: '' })} aria-label="ניקוי החיפוש">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button type="button" variant="outline" className="min-h-[48px]" onClick={() => void runImslp()}>
            <Globe className="h-4 w-4 ml-2" /> חיפוש ב-IMSLP
          </Button>
        </form>

        <div className="flex flex-wrap gap-2">
          <select className="border rounded-md bg-background min-h-[40px] px-2 text-sm" value={filters.instrument} onChange={(e) => set({ instrument: e.target.value })} aria-label="סינון לפי כלי">
            <option value="">כל הכלים</option>
            {facets.instruments.map(([n, c]) => <option key={n} value={n}>{n} ({c})</option>)}
          </select>
          <select className="border rounded-md bg-background min-h-[40px] px-2 text-sm" value={filters.ensemble} onChange={(e) => set({ ensemble: e.target.value })} aria-label="סינון לפי הרכב">
            <option value="">כל ההרכבים</option>
            {facets.ensembles.map(([n, c]) => <option key={n} value={n}>{n} ({c})</option>)}
          </select>
          <select className="border rounded-md bg-background min-h-[40px] px-2 text-sm" value={filters.key} onChange={(e) => set({ key: e.target.value })} aria-label="סינון לפי סולם">
            <option value="">כל הסולמות</option>
            {facets.keys.map(([n, c]) => <option key={n} value={n}>{n} ({c})</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm px-2 min-h-[40px]">
            <input type="checkbox" checked={filters.includeNumbered} onChange={(e) => set({ includeNumbered: e.target.checked })} />
            להציג גם קבצים ממוספרים (0200…)
          </label>
          {(filters.instrument || filters.ensemble || filters.key) && (
            <Button variant="ghost" size="sm" onClick={() => set({ instrument: '', ensemble: '', key: '' })}>ניקוי סינון</Button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {tab('all', 'כל הספרייה', pieces.length)}
          {tab('lesson', 'לשיעור היום', lists.lesson.length)}
          {tab('favorites', 'מועדפים', lists.favorites.length)}
          {tab('recent', 'נפתחו לאחרונה', lists.recent.length)}
          {view === 'lesson' && lists.lesson.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => writeList('lesson', [])}>ניקוי רשימת השיעור</Button>
          )}
        </div>
      </div>

      {/* IMSLP */}
      {imslp && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold flex items-center gap-2"><Globe className="h-4 w-4" /> IMSLP: “{imslp.q}”</h3>
            <button className="p-2" onClick={() => setImslp(null)} aria-label="סגירת תוצאות IMSLP"><X className="h-4 w-4" /></button>
          </div>
          {imslp.loading && <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> מחפש ב-IMSLP…</div>}
          {imslp.error && <div className="text-sm text-destructive">{imslp.error}</div>}
          {imslp.data?.hint && (
            <div className="rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
              שימי לב: לא מצאתי יצירה כזאת של המלחין שכתבת, אבל יש יצירה כזאת של <b>{imslp.data.hint.composer}</b>:{' '}
              <a className="underline" href={imslp.data.hint.url} target="_blank" rel="noreferrer">{imslp.data.hint.title}</a>
            </div>
          )}
          {imslp.data && !imslp.data.results.length && <div className="text-sm">לא נמצאו תוצאות. נסי לכתוב את שם המלחין ואת סוג היצירה, למשל "סונטינה קלמנטי אופוס 36".</div>}
          <ul className="divide-y">
            {imslp.data?.results.map((r) => (
              <li key={r.title} className="py-2 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0" dir="ltr" style={{ textAlign: 'right' }}>
                  <a href={r.url} target="_blank" rel="noreferrer" className="font-medium underline-offset-2 hover:underline">{r.work}</a>
                  <div className="text-sm text-muted-foreground">{r.composer}{r.fields.opus ? ` · ${r.fields.opus}` : ''}{r.fields.key ? ` · ${r.fields.key}` : ''}{r.fields.year ? ` · ${r.fields.year}` : ''}</div>
                  {r.fields.instrumentation && <div className="text-xs text-muted-foreground">{r.fields.instrumentation}</div>}
                </div>
                <div className="flex flex-wrap items-center gap-1" dir="rtl">
                  {Object.keys(r.why).filter((k) => r.why[k]).map((k) => <Badge key={k} variant="secondary">{IMSLP_WHY[k] || k}</Badge>)}
                  <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border px-3 min-h-[40px] text-sm hover:bg-muted">
                    <ExternalLink className="h-4 w-4" /> פתיחה ב-IMSLP
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* library results */}
      <div className="text-sm text-muted-foreground">
        {results.length ? `${results.length} יצירות` : view === 'all' ? 'לא נמצאו יצירות בספרייה. אפשר לחפש ב-IMSLP.' : 'הרשימה ריקה.'}
      </div>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {results.slice(0, shown).map((p) => {
          const fav = lists.favorites.includes(p.id);
          const inLesson = lists.lesson.includes(p.id);
          return (
            <li key={p.id} className="rounded-xl border bg-card p-3 flex flex-col gap-2">
              <div className="flex items-start gap-2">
                <button className="flex-1 min-w-0 text-right" onClick={() => openPiece(p)} title="פתיחת התווים">
                  <div className="font-semibold leading-snug break-words">{p.title}</div>
                  <div className="text-sm text-muted-foreground truncate">
                    {[p.composer, p.arranger && `עיבוד: ${p.arranger}`, p.lyricist && `מילים: ${p.lyricist}`].filter(Boolean).join(' · ') || p.folder}
                  </div>
                </button>
                <button
                  className="p-2 rounded-md hover:bg-muted"
                  onClick={() => toggleInList('favorites', p.id)}
                  aria-label={fav ? 'הסרה ממועדפים' : 'הוספה למועדפים'}
                  aria-pressed={fav}
                >
                  <Star className={`h-5 w-5 ${fav ? 'fill-yellow-400 text-yellow-500' : ''}`} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1 text-xs">
                {p.key && <Badge variant="outline" title={p.keyEstimated ? 'משוער לפי צליל הסיום' : undefined}>{p.key}</Badge>}
                {p.time && <Badge variant="outline" dir="ltr">{p.time}</Badge>}
                {p.ensemble && <Badge variant="outline">{p.ensemble}</Badge>}
                {p.instruments.slice(0, 4).map((i) => <Badge key={i} variant="secondary">{i}</Badge>)}
                {p.measures > 0 && <Badge variant="outline">{p.measures} תיבות</Badge>}
              </div>
              <div className="flex flex-wrap gap-2 mt-auto">
                <Button size="sm" className="min-h-[40px]" onClick={() => openPiece(p)}><BookOpen className="h-4 w-4 ml-1" /> פתיחה</Button>
                {p.parts.length > 0 && (
                  <select
                    className="border rounded-md bg-background min-h-[40px] px-2 text-sm max-w-[160px]"
                    value=""
                    onChange={(e) => e.target.value && openPiece(p, e.target.value)}
                    aria-label="פתיחת חלק"
                  >
                    <option value="">חלקים ({p.parts.length})</option>
                    {p.parts.map((x) => <option key={x.file} value={x.file}>{x.name || 'חלק'}</option>)}
                  </select>
                )}
                <Button size="sm" variant={inLesson ? 'secondary' : 'outline'} className="min-h-[40px]" onClick={() => toggleInList('lesson', p.id)} aria-pressed={inLesson}>
                  <ListMusic className="h-4 w-4 ml-1" /> {inLesson ? 'בשיעור היום ✓' : 'לשיעור היום'}
                </Button>
                {p.musicxml && (
                  <Button size="sm" variant="ghost" className="min-h-[40px]" onClick={() => void getXml(p)} title="קובץ לעריכה ב-MuseScore">
                    <Download className="h-4 w-4 ml-1" /> לעריכה
                  </Button>
                )}
                {p.finalePath && (
                  <Button size="sm" variant="ghost" className="min-h-[40px]" onClick={() => void copyPath(p)} title={p.finalePath}>
                    <Copy className="h-4 w-4 ml-1" /> פינאלה
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {results.length > shown && (
        <div className="text-center">
          <Button variant="outline" onClick={() => setShown((n) => n + PAGE)}>עוד יצירות ({results.length - shown})</Button>
        </div>
      )}

      {open && <SheetViewer piece={open.piece} initialFile={open.file} onClose={() => setOpen(null)} />}
    </div>
  );
}
