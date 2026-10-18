import { useCallback, useEffect, useRef, useState } from 'react';
import { getStudents, updateStudent } from '@/lib/storage';
import type { Student } from '@/lib/types';
import { generateEarRound, scoreEarRound, type EarRound } from '@/lib/musicEarGame';
import { noteName, type MusicPlayAttempt, type MusicPlaySettings } from '@/lib/musicPlay';
import { Button } from '@/components/ui/button';
import { Volume2, RotateCcw, Headphones } from 'lucide-react';

const ROUNDS = 5;
type Phase = 'ready' | 'listening' | 'answering' | 'feedback' | 'finished';
const labelClef = (clef: 'treble' | 'bass') => clef === 'treble' ? 'מפתח סול' : 'מפתח פה';

function schedulePitch(audio: AudioContext, midi: number, at: number, duration: number) {
  const source = audio.createOscillator();
  const envelope = audio.createGain();
  source.type = 'sine';
  source.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(0.12, at + 0.025);
  envelope.gain.setValueAtTime(0.12, at + Math.max(0.04, duration - 0.09));
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  source.connect(envelope).connect(audio.destination);
  source.start(at);
  source.stop(at + duration + 0.03);
}

export default function MusicEarGame({
  student, level, settings, preview,
}: { student: Student; level: number; settings: MusicPlaySettings; preview: boolean }) {
  const [round, setRound] = useState<EarRound | null>(null);
  const [roundNumber, setRoundNumber] = useState(1);
  const [phase, setPhase] = useState<Phase>('ready');
  const [answer, setAnswer] = useState<number[]>([]);
  const answerRef = useRef<number[]>([]);
  const totals = useRef({ correct: 0, total: 0, perfect: 0 });
  const [summary, setSummary] = useState({ correct: 0, total: 0, perfect: 0 });
  const [lastPerfect, setLastPerfect] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const audioRef = useRef<AudioContext | null>(null);
  const playbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const lastInput = useRef<'touch' | 'keyboard'>('touch');

  const stopPlayback = useCallback(() => {
    if (playbackTimer.current) clearTimeout(playbackTimer.current);
    playbackTimer.current = null;
    const old = audioRef.current;
    audioRef.current = null;
    if (old) void old.close().catch(() => undefined);
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopPlayback();
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
    };
  }, [stopPlayback]);

  const makeRound = useCallback(() => {
    try {
      const next = generateEarRound(level, settings);
      setRound(next);
      answerRef.current = [];
      setAnswer([]);
      setLastPerfect(null);
      setPhase('ready');
      setError('');
    } catch (e) {
      setRound(null);
      setError(e instanceof Error && e.message === 'INSUFFICIENT_NOTES'
        ? 'לטובת משחק השמיעה צריך לפחות שני תווים מותרים באחד המפתחות. אפשר להרחיב את הטווח בכרטיס התלמידה.'
        : 'הרמה הזאת נעולה. יש לבחור רמה פתוחה.');
    }
  }, [level, settings]);

  useEffect(() => {
    totals.current = { correct: 0, total: 0, perfect: 0 };
    setRoundNumber(1);
    makeRound();
  }, [makeRound]);

  const listen = useCallback(async () => {
    if (!round || (phase !== 'ready' && phase !== 'answering')) return;
    stopPlayback();
    setError('');
    setPhase('listening');
    try {
      const context = new AudioContext();
      audioRef.current = context;
      await context.resume();
      if (!alive.current || audioRef.current !== context) return;
      const step = Math.max(0.34, Math.min(0.9, 60 / settings.bpm));
      const start = context.currentTime + 0.12;
      round.melody.forEach((midi, i) => schedulePitch(context, midi, start + i * step, step * 0.82));
      playbackTimer.current = setTimeout(() => {
        if (!alive.current || audioRef.current !== context) return;
        stopPlayback();
        setPhase('answering');
      }, Math.ceil((0.12 + round.melody.length * step) * 1000));
    } catch {
      stopPlayback();
      setPhase('ready');
      setError('השמעת הצלילים נכשלה. בדקי הרשאת שמע ודפדפן ונסי שוב.');
    }
  }, [round, phase, stopPlayback, settings.bpm]);

  const persistAttempt = useCallback((correct: number, total: number) => {
    if (preview) return;
    const previous = getStudents().find(s => s.id === student.id);
    if (!previous) return;
    const attempt: MusicPlayAttempt = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      at: new Date().toISOString(),
      level, bpm: settings.bpm,
      accuracy: total ? Math.round(100 * correct / total) : 0,
      timing: 0, correct, total, input: lastInput.current,
      mode: 'ear',
    };
    updateStudent(student.id, {
      musicPlayAttempts: [...(previous.musicPlayAttempts || []), attempt].slice(-30),
    });
  }, [level, preview, settings.bpm, student.id]);

  const choose = useCallback((pitch: number, via: 'touch' | 'keyboard') => {
    if (phase !== 'answering' || !round || answerRef.current.length >= round.melody.length) return;
    lastInput.current = via;
    const next = [...answerRef.current, pitch];
    answerRef.current = next;
    setAnswer(next);
    if (next.length !== round.melody.length) return;
    const score = scoreEarRound(round.melody, next);
    totals.current = {
      correct: totals.current.correct + score.correct,
      total: totals.current.total + score.total,
      perfect: totals.current.perfect + (score.perfect ? 1 : 0),
    };
    setSummary({ ...totals.current });
    setLastPerfect(score.perfect);
    setPhase('feedback');
    if (roundNumber === ROUNDS) {
      persistAttempt(totals.current.correct, totals.current.total);
      transitionTimer.current = setTimeout(() => { if (alive.current) setPhase('finished'); }, 900);
    } else {
      transitionTimer.current = setTimeout(() => {
        if (!alive.current) return;
        setRoundNumber(n => n + 1);
        makeRound();
      }, 1100);
    }
  }, [phase, round, roundNumber, persistAttempt, makeRound]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey ||
        /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName || '')) return;
      const digit = Number(e.key);
      if (digit >= 1 && digit <= 4 && String(digit) === e.key && round?.choices[digit - 1] !== undefined) {
        e.preventDefault();
        choose(round.choices[digit - 1], 'keyboard');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choose, round]);

  const restart = () => {
    stopPlayback();
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    totals.current = { correct: 0, total: 0, perfect: 0 };
    setSummary({ correct: 0, total: 0, perfect: 0 });
    setRoundNumber(1);
    makeRound();
  };
  return (
    <section className="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-900 dark:bg-indigo-950/20" dir="rtl">
      <div className="flex items-center gap-2 font-bold text-lg">
        <Headphones className="h-5 w-5" /> מנגינה סודית — אימון שמיעה וזיכרון
      </div>
      <p className="text-sm">האזיני למנגינה קצרה, וזכרי את סדר הצלילים. שחזרי את המנגינה בלחיצה על שמות התווים. התווים מוגבלים לידע שהוגדר עבורך.</p>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      {round && <>
        <div className="flex items-center justify-between gap-2 flex-wrap text-sm">
          <span>סיבוב <strong>{roundNumber} מתוך {ROUNDS}</strong> · {labelClef(round.clef)}</span>
          <span aria-live="polite">🌟 מנגינות מושלמות: {summary.perfect} · תווים נכונים: {summary.correct}/{summary.total}</span>
        </div>
        <div className="flex items-center gap-2" aria-label="התקדמות במשחק">
          {Array.from({ length: ROUNDS }, (_, i) => (
            <span key={i} className={`h-2 flex-1 rounded-full ${i < roundNumber - 1 || phase === 'finished' ? 'bg-indigo-600' : i === roundNumber - 1 ? 'bg-amber-400' : 'bg-slate-200'}`} />
          ))}
        </div>
        {phase !== 'finished' ? <>
          <div className="flex gap-2 flex-wrap items-center">
            <Button type="button" onClick={() => void listen()} disabled={phase === 'listening' || phase === 'feedback'}>
              <Volume2 className="w-4 h-4 ml-2" />{phase === 'listening' ? 'המנגינה מתנגנת…' : phase === 'answering' ? 'השמעה חוזרת' : 'האזיני למנגינה'}
            </Button>
            <p className="text-xs text-muted-foreground">אפשר לשמוע שוב. הצלילים אינם מוקלטים ואינם נשלחים לשרת.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 min-h-14" aria-live="polite">
            {round.melody.map((_, i) => (
              <span key={i} className={`rounded-lg min-w-12 border px-3 py-2 text-center ${i < answer.length ? 'bg-indigo-100 border-indigo-300 text-indigo-950' : 'bg-white text-slate-400'}`}>
                {i < answer.length ? noteName(answer[i]) : '♪'}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {round.choices.map((midi, i) => (
              <button key={midi} type="button" onClick={() => choose(midi, 'touch')} disabled={phase !== 'answering'}
                className="rounded-xl border-2 border-indigo-200 bg-white p-4 text-indigo-950 shadow-sm text-lg font-semibold min-h-20 hover:border-indigo-500 active:bg-amber-100 disabled:opacity-50 touch-manipulation">
                <span className="block text-xs text-indigo-600"> {i + 1} </span>{noteName(midi)}
              </button>
            ))}
          </div>
          {phase === 'ready' && <p className="text-center text-sm">לחצי ״האזיני למנגינה״ להתחלת הסיבוב.</p>}
          {phase === 'answering' && <p className="text-center text-xs text-muted-foreground">אפשר ללחוץ על התווים או להשתמש במקשים 1–4 לפי המספרים שמופיעים מעליהם.</p>}
          {phase === 'feedback' && <p className="text-center font-semibold" role="status">
            {lastPerfect ? '🌟 מצוין! כל הצלילים לפי הסדר!' : 'סיימת את הסיבוב. ננסה מנגינה נוספת!'}
          </p>}
        </> : <div className="text-center p-5 space-y-3 rounded-xl bg-white dark:bg-slate-900" role="status">
          <p className="text-xl font-bold">סיימת את אתגר המנגינה הסודית!</p>
          <p className="text-lg">🌟 {summary.perfect} מתוך {ROUNDS} מנגינות מושלמות</p>
          <p>דיוק תווים: <strong>{summary.total ? Math.round(100 * summary.correct / summary.total) : 0}%</strong></p>
          <p className="text-xs text-muted-foreground">{preview ? 'התנסות מנהלת: תוצאות אינן נשמרות.' : 'התוצאה עודכנה מקומית. שמירה בענן מחייבת אימות סנכרון.'}</p>
          <Button type="button" variant="outline" onClick={restart}><RotateCcw className="w-4 h-4 ml-2" /> נסי שוב</Button>
        </div>}
      </>}
    </section>
  );
}
