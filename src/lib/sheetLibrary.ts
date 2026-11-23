/**
 * Toby's sheet-music library (manager only).
 * Files live on the toby-sheets Worker; every request carries the manager code.
 * Favourites / recent / "today's lesson" are per-device conveniences (localStorage).
 */
import { getWorkerCredentials } from './workerAuth';

// Reached through the students API address (allowed by NetFree); the library Worker checks the manager code.
export const SHEETS_ORIGIN = 'https://lovable-dropbox-api.w0504124161.workers.dev/sheets';

export interface SheetPart { name: string; file: string }
export interface SheetPiece {
  id: string;
  title: string;
  fileTitle: string;
  composer: string;
  arranger: string;
  lyricist: string;
  key: string;
  keyEstimated: boolean;
  keyChanges: string[];
  time: string;
  tempo?: number | null;
  measures: number;
  ensemble: string;
  instruments: string[];
  families: string[];
  folder: string;
  finalePath: string;
  finaleCopies: number;
  format: string;
  numericName: boolean;
  score: string;
  parts: SheetPart[];
  musicxml: string;
}

export interface ImslpResult {
  title: string;
  work: string;
  composer: string;
  url: string;
  score: number;
  why: Record<string, boolean>;
  fields: { opus?: string; key?: string; instrumentation?: string; year?: string; movements?: string };
}
export interface ImslpResponse {
  ok: boolean;
  results: ImslpResult[];
  hint: { composer: string; title: string; url: string } | null;
  query: { composer?: string | null; form?: string[] | null; opus?: string | null; number?: string | null; instrument?: string | null; key?: string | null };
  error?: string;
}

const authHeaders = (): Record<string, string> => {
  const { manager } = getWorkerCredentials();
  return manager ? { 'X-Sonata-Manager-Code': manager } : {};
};

export class SheetAccessError extends Error {}

async function sheetsFetch(path: string): Promise<Response> {
  const res = await fetch(SHEETS_ORIGIN + path, { headers: authHeaders() });
  if (res.status === 401) throw new SheetAccessError('נדרשת כניסה עם קוד המנהלת');
  if (!res.ok) throw new Error(`שגיאה ${res.status}`);
  return res;
}

let catalogPromise: Promise<SheetPiece[]> | null = null;
export function loadCatalog(force = false): Promise<SheetPiece[]> {
  if (!catalogPromise || force) {
    catalogPromise = sheetsFetch('/catalog.json')
      .then((r) => r.json())
      .then((d) => (Array.isArray(d?.pieces) ? (d.pieces as SheetPiece[]) : []))
      .catch((e) => { catalogPromise = null; throw e; });
  }
  return catalogPromise;
}

export async function fetchSheetFile(path: string): Promise<ArrayBuffer> {
  return (await sheetsFetch('/' + path.replace(/^\//, ''))).arrayBuffer();
}

/** Download MusicXML (.mxl) for editing in MuseScore / Dorico / Sibelius. */
export async function downloadMusicXml(piece: SheetPiece) {
  const data = await fetchSheetFile(piece.musicxml);
  const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.recordare.musicxml' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${piece.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || piece.id}.mxl`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function searchImslp(q: string): Promise<ImslpResponse> {
  return (await sheetsFetch('/imslp?q=' + encodeURIComponent(q))).json();
}

/* ---------------- search inside the library ---------------- */

export const normalizeText = (s: string) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-֑ͯ-ׇ]/g, '') // accents, niqqud
    .replace(/[׳'"״`’.,;:()_\-–/\\]+/g, ' ')
    .replace(/ך/g, 'כ').replace(/ם/g, 'מ').replace(/ן/g, 'נ').replace(/ף/g, 'פ').replace(/ץ/g, 'צ')
    .replace(/\s+/g, ' ')
    .trim();

/** Spelling-tolerant form: drop ו / י / א inside Hebrew words (מינואט = מנואט, ואלס = וולס). */
export const skeleton = (normalized: string) =>
  normalized.split(' ').map((w) => (/[א-ת]/.test(w) ? w[0] + w.slice(1).replace(/[ויא]/g, '') : w)).join(' ');

const haystackCache = new WeakMap<SheetPiece, { all: string; title: string; allSk: string; titleSk: string }>();
const hay = (p: SheetPiece) => {
  let h = haystackCache.get(p);
  if (!h) {
    const title = normalizeText(`${p.title} ${p.fileTitle}`);
    const all = normalizeText([p.title, p.fileTitle, p.composer, p.arranger, p.lyricist, p.folder, p.key, p.ensemble, p.time, ...p.instruments, ...p.parts.map((x) => x.name)].join(' '));
    h = { all, title, allSk: skeleton(all), titleSk: skeleton(title) };
    haystackCache.set(p, h);
  }
  return h;
};

export interface SheetFilters {
  query: string;
  instrument: string;
  ensemble: string;
  key: string;
  includeNumbered: boolean;
}

export function filterPieces(pieces: SheetPiece[], f: SheetFilters): SheetPiece[] {
  const tokens = normalizeText(f.query).split(' ').filter(Boolean);
  const scored: { p: SheetPiece; s: number }[] = [];
  for (const p of pieces) {
    if (!f.includeNumbered && p.numericName && !tokens.length) continue;
    if (f.instrument && !p.instruments.includes(f.instrument)) continue;
    if (f.ensemble && p.ensemble !== f.ensemble) continue;
    if (f.key && p.key.replace(' (משוער)', '') !== f.key) continue;
    if (!tokens.length) { scored.push({ p, s: p.numericName ? 0 : 1 }); continue; }
    const h = hay(p);
    if (!tokens.every((t) => h.all.includes(t) || h.allSk.includes(skeleton(t)))) continue;
    let s = 1;
    const q = tokens.join(' ');
    if (h.title.startsWith(q)) s += 6;
    else if (h.title.includes(q)) s += 4;
    else if (h.titleSk.includes(skeleton(q))) s += 3;
    s += tokens.filter((t) => h.title.includes(t) || h.titleSk.includes(skeleton(t))).length;
    if (p.numericName) s -= 2;
    scored.push({ p, s });
  }
  const collator = new Intl.Collator('he', { numeric: true });
  scored.sort((a, b) => b.s - a.s || collator.compare(a.p.title, b.p.title));
  return scored.map((x) => x.p);
}

export function facetCounts(pieces: SheetPiece[]) {
  const instruments = new Map<string, number>();
  const ensembles = new Map<string, number>();
  const keys = new Map<string, number>();
  for (const p of pieces) {
    for (const i of p.instruments) instruments.set(i, (instruments.get(i) || 0) + 1);
    if (p.ensemble) ensembles.set(p.ensemble, (ensembles.get(p.ensemble) || 0) + 1);
    const k = p.key.replace(' (משוער)', '');
    if (k) keys.set(k, (keys.get(k) || 0) + 1);
  }
  const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return { instruments: sorted(instruments), ensembles: sorted(ensembles), keys: sorted(keys) };
}

/* ---------------- per-device lists ---------------- */

const LS = { favorites: 'tobySheets.favorites', recent: 'tobySheets.recent', lesson: 'tobySheets.lesson' } as const;
export type SheetList = keyof typeof LS;

export function readList(name: SheetList): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(LS[name]) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function writeList(name: SheetList, ids: string[]) {
  try {
    localStorage.setItem(LS[name], JSON.stringify(ids));
  } catch {
    /* storage full / blocked: lists are only a convenience */
  }
  window.dispatchEvent(new CustomEvent('toby-sheets-lists'));
}

export function toggleInList(name: SheetList, id: string): boolean {
  const list = readList(name);
  const has = list.includes(id);
  writeList(name, has ? list.filter((x) => x !== id) : [...list, id]);
  return !has;
}

export function markRecent(id: string) {
  writeList('recent', [id, ...readList('recent').filter((x) => x !== id)].slice(0, 30));
}
