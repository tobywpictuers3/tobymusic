import { useEffect, useState } from 'react';
import { Student } from '@/lib/types';
import MusicRecallSettingsEditor from './MusicRecallSettingsEditor';
import { updateStudent } from '@/lib/storage';
import { MUSIC_LEVELS, MusicPlaySettings, normalizeMusicSettings, NATURAL_MIDI, noteName } from '@/lib/musicPlay';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface Props { student: Student; onSaved: () => void }
const selectNumber = (value: number, set: (value: number) => void, choices: number[]) => (
  <select className="w-full rounded-md border bg-background p-2" value={value} onChange={e => set(Number(e.target.value))}>
    {choices.map(v => <option value={v} key={v}>{noteName(v)}</option>)}
  </select>
);
const pitchOptions = (min: number, max: number) => NATURAL_MIDI.filter(n => n >= min && n <= max);
export default function MusicPlaySettingsEditor({ student, onSaved }: Props) {
  const [draft, setDraft] = useState<MusicPlaySettings>(() => normalizeMusicSettings(student.musicPlaySettings));
  useEffect(() => { setDraft(normalizeMusicSettings(student.musicPlaySettings)); }, [student.id, student.musicPlaySettings]);
  const change = (part: Partial<MusicPlaySettings>) => setDraft(v => normalizeMusicSettings({ ...v, ...part }));
  const save = () => {
    const updated = updateStudent(student.id, { musicPlaySettings: { ...student.musicPlaySettings, ...normalizeMusicSettings(draft) } });
    if (!updated) { toast({ title: 'לא ניתן לשמור הגדרות', variant: 'destructive' }); return; }
    toast({ title: 'ההגדרות עודכנו מקומית', description: 'יש לוודא שהסנכרון ל-Dropbox הסתיים לפני סגירת המערכת.' });
    onSaved();
  };
  return (
    <div dir="rtl" className="space-y-5 text-right">
      <MusicRecallSettingsEditor student={student} onSaved={onSaved} />
      <details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">הגדרות ותיקות למשחקי מקצב ונגינה (נפרדות מרמות השליפה האישיות)</summary>
      <div className="space-y-5 pt-4">
      <p className="text-sm text-muted-foreground">לכל תלמידה פתוחות הרמה שהוגדרה וכל הרמות שמתחתיה. הרמות הגבוהות יותר נעולות.</p>
      <div className="space-y-2">
        <Label htmlFor="music-level">הרמה הגבוהה הפתוחה</Label>
        <select id="music-level" className="w-full rounded-md border p-2 bg-background" value={draft.maxUnlockedLevel}
          onChange={e => change({ maxUnlockedLevel: Number(e.target.value) })}>
          {MUSIC_LEVELS.map(l => <option key={l.id} value={l.id}>{l.id}. {l.name} — {l.description}</option>)}
        </select>
      </div>
      <div className="rounded-lg border p-3 space-y-3">
        <div className="font-semibold">ידע התווים במפתח סול</div>
        <div className="grid grid-cols-2 gap-3"><div><Label>מהתו</Label>{selectNumber(draft.trebleFrom, n => change({trebleFrom:n, trebleTo:Math.max(n,draft.trebleTo)}), pitchOptions(48,84))}</div>
        <div><Label>עד התו</Label>{selectNumber(draft.trebleTo, n => change({trebleTo:n,trebleFrom:Math.min(n,draft.trebleFrom)}), pitchOptions(48,84))}</div></div>
      </div>
      <div className="rounded-lg border p-3 space-y-3">
        <div className="font-semibold">ידע התווים במפתח פה (מרמה 4)</div>
        <div className="grid grid-cols-2 gap-3"><div><Label>מהתו</Label>{selectNumber(draft.bassFrom, n => change({bassFrom:n,bassTo:Math.max(n,draft.bassTo)}), pitchOptions(36,72))}</div>
        <div><Label>עד התו</Label>{selectNumber(draft.bassTo, n => change({bassTo:n,bassFrom:Math.min(n,draft.bassFrom)}), pitchOptions(36,72))}</div></div>
      </div>
      <fieldset className="rounded-lg border p-3 space-y-2">
        <legend className="font-semibold px-1">מקצבים שהתלמידה למדה</legend>
        {([0.5,1,2,4] as const).map(v => (
          <label key={v} className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={v===1} checked={draft.rhythmValues.includes(v)} onChange={e => {
              const next = e.target.checked ? [...draft.rhythmValues, v] : draft.rhythmValues.filter(n=>n!==v);
              if (next.length) change({ rhythmValues: next });
            }} /> {v===0.5?'שמינית':v===1?'רבע':v===2?'חצי':'שלם'}
          </label>
        ))}
      <p className="text-xs text-muted-foreground">ערך של רבע נשאר זמין תמיד לצורך תרגילי הבסיס.</p>
      </fieldset>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="space-y-1 text-sm">תנועת הצלילים
          <select className="w-full rounded-md border bg-background p-2" value={draft.motion} onChange={e => change({motion:e.target.value as MusicPlaySettings['motion']})}>
            <option value="steps">צעדים בלבד</option><option value="mixed">גם קפיצות</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">מהירות מטרונום (BPM)
          <input type="number" min={40} max={180} className="w-full border rounded-md bg-background p-2" value={draft.bpm} onChange={e => change({bpm:Number(e.target.value)})} />
        </label>
        <label className="space-y-1 text-sm">תווים בו-זמנית בחמשה (מרמה 6)
          <select className="w-full border rounded-md bg-background p-2" value={draft.maxChordNotes} onChange={e => change({maxChordNotes:Number(e.target.value)})}>
            <option value={2}>2</option><option value={3}>3</option><option value={4}>4</option>
          </select>
        </label>
      </div>
      <Button onClick={save} className="w-full">שמור הגדרות משחקים ותיקות</Button>
      </div></details>
    </div>
  );
}
