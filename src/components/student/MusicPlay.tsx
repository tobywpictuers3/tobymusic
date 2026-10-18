import { useCallback, useEffect, useRef, useState } from 'react';
import { Student } from '@/lib/types';
import { getStudents, updateStudent } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock, Play, RotateCcw, Music2, Keyboard, Volume2 } from 'lucide-react';
import {
  canAccessMusicLevel, generateMusicExercise, MUSIC_LEVELS, MusicEvent, MusicNote,
  MusicPlayAttempt, NATURAL_MIDI, noteName, normalizeMusicSettings, scoreMusicEvent,
} from '@/lib/musicPlay';

type Hit = { midi: number; beat: number };
type Runtime = {
  audio: AudioContext;
  startTime: number;
  secondsPerBeat: number;
  events: MusicEvent[];
  judged: number;
  hits: Map<number, Hit[]>;
  correct: number;
  timely: number;
  finished: boolean;
};
function tone(context: AudioContext, midi: number, at = context.currentTime, duration = 0.16, volume = 0.09) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
  oscillator.connect(gain).connect(context.destination);
  gain.gain.setValueAtTime(volume, at);
  gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.01);
}
function click(context: AudioContext, at: number, strong: boolean) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.value = strong ? 1160 : 800;
  oscillator.connect(gain).connect(context.destination);
  gain.gain.setValueAtTime(0.07, at);
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.045);
  oscillator.start(at);
  oscillator.stop(at + 0.05);
}
function midiStep(midi: number): number {
  const offsets: Record<number, number> = {0:0,2:1,4:2,5:3,7:4,9:5,11:6};
  return Math.floor(midi/12)*7 + (offsets[midi%12] ?? 0);
}
function staffY(note: MusicNote): number {
  const bottom = note.clef === 'treble' ? 112 : 222;
  const base = note.clef === 'treble' ? 64 : 43; // E4 or G2 = bottom staff line
  return bottom - (midiStep(note.midi) - midiStep(base)) * 6;
}
function Notation({ events, cursor, level, phase }: { events: MusicEvent[]; cursor: number; level: number; phase: number }) {
  const first = Math.max(0, cursor - 1);
  const displayed = events.slice(first, first + 8);
  const clefs: Array<'treble'|'bass'> = level === 4 ? ['bass'] : level >= 5 ? ['treble','bass'] : ['treble'];
  const width = 870;
  const lineStart = 54;
  const eventX = (i: number) => 125 + 94 * i;
  return (
    <div className="overflow-x-auto rounded-xl border bg-white p-1 shadow-inner" dir="ltr" aria-label="תווי המנגינה, התו הפעיל מסומן בזהב">
      <svg viewBox={`0 0 ${width} ${level>=5 ? 282:180}`} className="w-full min-w-[590px] text-slate-900" role="img">
        <rect x={0} y={0} width={width} height={level>=5 ? 282:180} fill="#fffefa" />
        {clefs.map(clef => {
          const bottom = clef === 'treble' ? 112 : 222;
          return <g key={clef}>
            {Array.from({length: 5}, (_,i) => <line key={i} x1={lineStart} x2={width-18} y1={bottom-i*12} y2={bottom-i*12} stroke="#475569" strokeWidth="1.2"/>)}
            <text x="14" y={bottom-13} fontSize="22" fontWeight="600" fill="#1e293b">{clef==='treble'?'𝄞':'𝄢'}</text>
          </g>;
        })}
        <text x="62" y="35" fontSize="18" fontWeight="bold">4/4</text>
        {displayed.map((ev, i) => {
          const actualIndex = first+i;
          const x = eventX(i);
          const active = actualIndex === cursor;
          const opacity = actualIndex < cursor ? 0.35 : 1;
          return <g key={ev.id} opacity={opacity}>
            {active && <rect x={x-40} y={26} width={78} height={level>=5?238:125} rx={11} fill="#fef3c7" stroke="#f59e0b" strokeWidth="1.8" />}
            {ev.notes.map((n,j) => {
              const y = staffY(n);
              const bottom = n.clef === 'treble' ? 112 : 222;
              const group = ev.notes.filter(e => e.clef===n.clef);
              const noteX = x + (group.length>1 && group.indexOf(n)%2===1 ? 7 : 0);
              return <g key={j}>
                {y >= bottom+11 && Array.from({length:Math.floor((y-bottom)/12)},(_,k)=><line key={'lo'+k} x1={noteX-16} x2={noteX+16} y1={bottom+12*(k+1)} y2={bottom+12*(k+1)} stroke="#0f172a" strokeWidth="1.4"/>)}
                {y <= bottom-59 && Array.from({length:Math.floor((bottom-48-y)/12)},(_,k)=><line key={'hi'+k} x1={noteX-16} x2={noteX+16} y1={bottom-60-12*k} y2={bottom-60-12*k} stroke="#0f172a" strokeWidth="1.4"/>)}
                <ellipse cx={noteX} cy={y} rx={10.5} ry={6.2} transform={`rotate(-18 ${noteX} ${y})`} fill={ev.durationBeats>=2?'#fffefa':active?'#b45309':'#1e293b'} stroke={active?'#b45309':'#1e293b'} strokeWidth="2"/>
                {ev.durationBeats!==4 && <line x1={noteX+10} x2={noteX+10} y1={y} y2={y-34} stroke="#1e293b" strokeWidth="2"/>}
                {ev.durationBeats===0.5 && <path d={`M ${noteX+10} ${y-34} Q ${noteX+32} ${y-20} ${noteX+20} ${y-6}`} fill="none" stroke="#1e293b" strokeWidth="3"/>}
              </g>;
            })}
            {active && <rect x={x-35} y={level>=5?258:151} width={Math.max(1,70*phase)} height="4" rx="2" fill="#f59e0b" />}
          </g>;
        })}
        <text x="10" y={level>=5?277:176} fontSize="12" fill="#475569">TOBY PLAY</text>
      </svg>
    </div>
  );
}
export default function MusicPlay({ student }: { student: Student }) {
  const settings = normalizeMusicSettings(student.musicPlaySettings);
  const [level, setLevel] = useState(1);
  const [events, setEvents] = useState<MusicEvent[]>([]);
  const [cursor, setCursor] = useState(0);
  const [phase, setPhase] = useState(0);
  const [countIn, setCountIn] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ correct: number; timely: number; total: number } | null>(null);
  const [lastPlayed, setLastPlayed] = useState<string>('');
  const [inputMode, setInputMode] = useState<'touch'|'keyboard'|'midi'>('touch');
  const [midiMessage, setMidiMessage] = useState('');
  const engine = useRef<Runtime | null>(null);
  const raf = useRef(0);
  const accessRef = useRef<{ inputs?: Map<string, { onmidimessage: ((e: any)=>void)|null }> } | null>(null);
  const currentInput = useRef(inputMode);
  currentInput.current = inputMode;
  const end = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const runtime = engine.current;
    if (!runtime || runtime.finished) return;
    runtime.finished = true;
    const finished = { correct: runtime.correct, timely: runtime.timely, total: runtime.events.length };
    setResult(finished);
    setRunning(false);
    setCountIn(null);
    const previous = getStudents().find(s => s.id === student.id);
    if (previous) {
      const attempt: MusicPlayAttempt = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        at: new Date().toISOString(), level, bpm: settings.bpm,
        accuracy: Math.round((finished.correct / finished.total) * 100),
        timing: Math.round((finished.timely / finished.total) * 100),
        correct: finished.correct, total: finished.total, input: currentInput.current,
      };
      updateStudent(student.id, { musicPlayAttempts: [...(previous.musicPlayAttempts || []), attempt].slice(-30) });
    }
    void runtime.audio.close();
  }, [level, settings.bpm, student.id]);
  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const active = engine.current;
    if (active) {
      active.finished = true;
      void active.audio.close();
    }
    engine.current = null;
    setRunning(false);
    setCountIn(null);
  }, []);
  useEffect(() => () => {
    cancelAnimationFrame(raf.current);
    if (engine.current && !engine.current.finished) void engine.current.audio.close();
    if (accessRef.current?.inputs) accessRef.current.inputs.forEach(v => { v.onmidimessage = null; });
  }, []);
  const inputPitch = useCallback((midi: number, sound: boolean) => {
    const active = engine.current;
    if (sound && active && !active.finished) tone(active.audio, midi);
    setLastPlayed(noteName(midi));
    if (!active || active.finished) return;
    const beat = (active.audio.currentTime - active.startTime)/active.secondsPerBeat;
    if (beat < 0) return;
    const idx = active.events.findIndex(ev => beat >= ev.startBeat && beat < ev.startBeat + ev.durationBeats);
    if (idx < 0 || idx <= active.judged) return;
    const played = active.hits.get(idx) || [];
    // Debounce only duplicate note-ons, not new notes in a chord.
    if (!played.some(p=>p.midi===midi)) played.push({midi,beat});
    active.hits.set(idx,played);
  }, []);
  useEffect(() => {
    const map = ['a','s','d','f','g','h','j','k','l'];
    const options = NATURAL_MIDI.filter(n=>n>=settings.trebleFrom && n<=settings.trebleTo);
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName || '')) return;
      const index = map.indexOf(e.key.toLowerCase());
      if (index >= 0 && options[index] !== undefined) { e.preventDefault(); currentInput.current='keyboard'; inputPitch(options[index],true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settings.trebleFrom, settings.trebleTo, inputPitch]);
  const connectMidi = async () => {
    const request = (navigator as Navigator & { requestMIDIAccess?: () => Promise<any> }).requestMIDIAccess;
    if (!request) { setMidiMessage('MIDI אינו נתמך בדפדפן זה. אפשר להשתמש במקלדת או במסך.'); return; }
    try {
      const access = await request.call(navigator);
      accessRef.current = { inputs: access.inputs };
      let connected = 0;
      access.inputs.forEach((input: { onmidimessage: ((e:any)=>void)|null }) => {
        connected++;
        input.onmidimessage = (e: { data: Uint8Array }) => {
          const [status, pitch, velocity] = e.data;
          if ((status & 0xf0) === 0x90 && velocity > 0) { currentInput.current='midi'; inputPitch(pitch,false); }
        };
      });
      setMidiMessage(connected ? `מחוברות ${connected} כניסות MIDI` : 'לא נמצאה מקלדת MIDI. חברי אותה ונסי שוב.');
      if (connected) setInputMode('midi');
    } catch { setMidiMessage('לא התקבלה הרשאה למקלדת MIDI'); }
  };
  const start = async () => {
    stop();
    if (!canAccessMusicLevel(settings, level)) return;
    const generated = generateMusicExercise(level, settings, 4);
    const audio = new AudioContext();
    await audio.resume();
    const secondsPerBeat = 60/settings.bpm;
    const startTime = audio.currentTime + 4*secondsPerBeat + 0.12;
    const totalBeats = generated.reduce((total, ev)=>Math.max(total,ev.startBeat+ev.durationBeats),0);
    for(let b=-4;b<totalBeats;b++) click(audio,startTime+b*secondsPerBeat,(b+4)%4===0);
    engine.current = { audio,startTime,secondsPerBeat,events:generated,judged:-1,hits:new Map(),correct:0,timely:0,finished:false };
    setEvents(generated);setCursor(0);setPhase(0);setResult(null);setLastPlayed('');setRunning(true);
    const tick = () => {
      const active = engine.current;
      if (!active || active.finished) return;
      const beat = (active.audio.currentTime-active.startTime)/active.secondsPerBeat;
      if (beat < 0) setCountIn(Math.max(1,Math.ceil(-beat)));
      else {
        setCountIn(null);
        let index = active.events.findIndex(ev=>beat>=ev.startBeat && beat<ev.startBeat+ev.durationBeats);
        while(active.judged+1<active.events.length &&
          active.events[active.judged+1].startBeat + active.events[active.judged+1].durationBeats <= beat) {
          const next = ++active.judged;
          const score = scoreMusicEvent(active.events[next],active.hits.get(next)||[]);
          if(score.correct) active.correct++;
          if(score.timely) active.timely++;
        }
        if(index<0) index=active.events.length-1;
        setCursor(index);
        const ev=active.events[index];
        setPhase(Math.max(0,Math.min(1,(beat-ev.startBeat)/ev.durationBeats)));
        if(beat>=totalBeats) { end(); return; }
      }
      raf.current=requestAnimationFrame(tick);
    };
    raf.current=requestAnimationFrame(tick);
  };
  const keyboardNotes = NATURAL_MIDI.filter(n => (level===4 ? n>=settings.bassFrom && n<=settings.bassTo :
    level>=5 ? (n>=settings.trebleFrom && n<=settings.trebleTo)||(n>=settings.bassFrom && n<=settings.bassTo) :
    n>=settings.trebleFrom && n<=settings.trebleTo));
  const history = (student.musicPlayAttempts || []).filter(attempt=>attempt.level===level);
  const prior = history.length ? history[history.length-1] : null;
  return <div className="space-y-5" dir="rtl">
    <Card className="border-violet-200 dark:border-violet-900 overflow-hidden">
      <CardHeader className="bg-gradient-to-l from-violet-100 via-sky-50 to-amber-50 dark:from-violet-950 dark:via-slate-900 dark:to-indigo-950">
        <CardTitle className="flex items-center gap-2"><Music2 className="h-6 w-6"/> TOBY PLAY — אימונים מוזיקליים</CardTitle>
        <p className="text-sm text-muted-foreground">קריאה רציפה מהדף בקצב המטרונום. תמיד רואים גם את התווים הבאים.</p>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {MUSIC_LEVELS.map(item => {
            const locked=!canAccessMusicLevel(settings,item.id);
            return <button type="button" key={item.id} disabled={locked||running}
              onClick={()=>{setLevel(item.id);setEvents([]);setResult(null);}}
              className={`rounded-xl border p-3 text-right transition-colors min-h-24 ${locked?'opacity-45 bg-muted cursor-not-allowed':item.id===level?'border-violet-500 bg-violet-100 dark:bg-violet-950':'hover:border-violet-400'}`}>
              <div className="flex items-center gap-2 font-bold text-sm">{locked&&<Lock className="w-3 h-3"/>} רמה {item.id}</div>
              <div className="text-xs font-medium mt-1">{item.name}</div>
              <div className="text-xs text-muted-foreground mt-1">{item.description}</div>
            </button>;
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/40 p-3">
          <div className="text-sm">מטרונום: <strong>{settings.bpm} BPM</strong> | משקל: <strong>4/4</strong> | 4 פעימות הכנה</div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={()=>setInputMode('touch')}>מסך מגע</Button>
            <Button size="sm" variant="outline" onClick={()=>setInputMode('keyboard')}><Keyboard className="w-4 h-4 ml-1"/> מקלדת</Button>
            <Button size="sm" variant="outline" onClick={()=>void connectMidi()}>חיבור MIDI</Button>
          </div>
        </div>
        {midiMessage && <p className="text-xs text-muted-foreground" role="status">{midiMessage}</p>}
        {events.length>0 && <Notation events={events} cursor={cursor} level={level} phase={phase}/>}
        {!events.length && <div className="min-h-48 rounded-xl border border-dashed flex items-center justify-center bg-muted/20 text-center p-5">
          <p>בחרי רמה ולחצי על התחלת אימון. המנגינה תופיע כשורת תווים, ותתקדם לפי משך כל צליל.</p>
        </div>}
        {countIn!==null && <div className="text-4xl font-bold text-center text-amber-600" aria-live="polite">{countIn} — הכנה לנגינה</div>}
        {running && countIn===null && <div className="text-center text-sm text-violet-700 dark:text-violet-300">התו המודגש הוא התו הנוכחי · הקישי או נגני בזמן · התקדמות אוטומטית</div>}
        <div className="flex gap-3 justify-center">
          {!running ? <Button onClick={()=>void start()} size="lg" className="bg-violet-700 hover:bg-violet-800 text-white"><Play className="w-4 h-4 ml-2"/> {events.length?'אימון חדש':'התחלת אימון'}</Button>
            : <Button onClick={stop} variant="outline">עצירת האימון</Button>}
        </div>
        <div className="space-y-2">
          <div className="text-sm flex items-center gap-2"><Volume2 className="w-4 h-4"/> מקלדת נגינה על המסך · ניתן להקיש כמה צלילים באותה פעימה</div>
          <div className="flex flex-wrap gap-1 justify-center">
            {keyboardNotes.map(n=><button type="button" key={n} onClick={()=>{currentInput.current='touch';inputPitch(n,true);}} className="rounded-md border bg-white text-slate-800 shadow-sm hover:bg-amber-100 active:bg-amber-200 min-w-12 min-h-14 p-2 font-semibold text-sm" aria-label={`נגן ${noteName(n)}`}>
              {noteName(n)}
            </button>)}
          </div>
          {lastPlayed && <p className="text-center text-xs text-muted-foreground">צליל אחרון: {lastPlayed}</p>}
        </div>
        {result && <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 dark:bg-emerald-950 p-5 text-center space-y-2" role="status">
          <div className="font-bold text-lg">סיימת את האימון!</div>
          <div>דיוק תווים: <strong>{Math.round(result.correct/result.total*100)}%</strong> ({result.correct} מתוך {result.total})</div>
          <div>דיוק כניסה בפעימה: <strong>{Math.round(result.timely/result.total*100)}%</strong></div>
          <p className="text-xs">התוצאה נרשמה מקומית; יש לוודא השלמת סנכרון הענן.</p>
          <Button variant="outline" onClick={()=>void start()}><RotateCcw className="w-4 h-4 ml-1"/> שוב</Button>
        </div>}
        {!running && prior && !result && <p className="text-sm text-muted-foreground">באימון האחרון ברמה זו: {prior.accuracy}% זיהוי נכון.</p>}
        <p className="text-xs text-muted-foreground">גרסה ראשונית: קלט במיקרופון, עריכת תרגיל ידני ופענוח ביצוע פוליפוני אינם פעילים עדיין. במקלדת MIDI יש להשתמש בדפדפן תומך.</p>
      </CardContent>
    </Card>
  </div>;
}
