import { useMemo, useState } from 'react';
import { Student } from '@/lib/types';
import { DEFAULT_MUSIC_SETTINGS, MusicPlaySettings, NATURAL_MIDI, noteName } from '@/lib/musicPlay';
import MusicPlay from '@/components/student/MusicPlay';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const preset = {
  beginner: { maxUnlockedLevel: 2, trebleFrom: 60, trebleTo: 67, bassFrom: 43, bassTo: 55, rhythmValues: [0.5,1] as const, motion: 'steps' as const, bpm: 60, maxChordNotes: 2 },
  piano: { maxUnlockedLevel: 5, trebleFrom: 60, trebleTo: 76, bassFrom: 43, bassTo: 59, rhythmValues: [0.5,1,2] as const, motion: 'steps' as const, bpm: 72, maxChordNotes: 2 },
  chords: { maxUnlockedLevel: 6, trebleFrom: 60, trebleTo: 79, bassFrom: 40, bassTo: 59, rhythmValues: [0.5,1,2,4] as const, motion: 'mixed' as const, bpm: 80, maxChordNotes: 3 },
};
const range = (min: number,max: number) => NATURAL_MIDI.filter(n=>n>=min&&n<=max);
export default function MusicPlaySandbox() {
  const [settings, setSettings] = useState<MusicPlaySettings>({ ...DEFAULT_MUSIC_SETTINGS, maxUnlockedLevel: 6 });
  const [revision, setRevision] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [clipboardState, setClipboardState] = useState('');
  const report = () => [
    'TOBY PLAY — דוח התנסות ללא פרטי תלמידות',
    'רמה פתוחה: ' + settings.maxUnlockedLevel,
    'מהירות: ' + settings.bpm + ' BPM',
    'מפתח סול: ' + noteName(settings.trebleFrom) + ' עד ' + noteName(settings.trebleTo),
    'מפתח פה: ' + noteName(settings.bassFrom) + ' עד ' + noteName(settings.bassTo),
    'ערכים: ' + settings.rhythmValues.join(', '),
    'תנועה: ' + settings.motion,
    'צלילים כפולים: ' + settings.maxChordNotes,
    'מה כדאי לדייק: ' + feedback.trim(),
  ].join('\\n');
  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report());
      setClipboardState('הדוח הועתק! אפשר להדביק אותו בשיחה כדי לדייק את הפיתוח.');
    } catch {
      setClipboardState('העתקה אוטומטית אינה נתמכת. סמני והעתיקי את הטקסט שבתיבה שלמטה.');
    }
  };
  const change = (part: Partial<MusicPlaySettings>) => { setSettings(s => ({...s,...part})); setRevision(r=>r+1); };
  const demo = useMemo(() => ({
    id: '__toby_music_preview_only__', firstName: 'תצוגת', lastName: 'מורה', musicPlaySettings: settings,
    musicPlayAttempts: [],
  } as Student), [settings]);
  const updatePreset=(name: keyof typeof preset) => {
    setSettings({ ...preset[name], rhythmValues: [...preset[name].rhythmValues] });
    setRevision(v=>v+1);
  };
  return <div className="space-y-5" dir="rtl">
    <Card className="border-violet-400/60">
      <CardHeader className="bg-gradient-to-l from-violet-100 to-sky-50 dark:from-violet-950 dark:to-slate-900">
        <CardTitle>🎹 TOBY PLAY — סטודיו התנסות למורה</CardTitle>
        <p className="text-sm text-muted-foreground">כאן אפשר לנסות את האימון ולהחליף הגדרות בחופשיות. ההגדרות, הניקוד והניסיונות אינם משנים תלמידות ואינם נשמרים ב-Dropbox.</p>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={()=>updatePreset('beginner')}>דו–סול · צעדים</Button>
          <Button variant="outline" onClick={()=>updatePreset('piano')}>פסנתר · שתי ידיים</Button>
          <Button variant="outline" onClick={()=>updatePreset('chords')}>פסנתר · אקורדים</Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="space-y-1 text-sm"><Label>הרמה הגבוהה הפתוחה</Label>
            <select className="border rounded-md w-full p-2 bg-background" value={settings.maxUnlockedLevel} onChange={e=>change({maxUnlockedLevel:Number(e.target.value)})}>
              {[1,2,3,4,5,6].map(n=><option value={n} key={n}>רמה {n}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm"><Label>מהירות (BPM)</Label>
            <input type="number" min={40} max={180} className="w-full rounded-md border p-2 bg-background" value={settings.bpm} onChange={e=>change({bpm:Math.max(40,Math.min(180,Number(e.target.value)||60))})}/>
          </label>
          <label className="space-y-1 text-sm"><Label>רצף צלילים</Label>
            <select className="w-full rounded-md border p-2 bg-background" value={settings.motion} onChange={e=>change({motion:e.target.value as MusicPlaySettings['motion']})}>
              <option value="steps">צעדים בלבד</option>
              <option value="mixed">גם קפיצות</option>
            </select>
          </label>
          <label className="space-y-1 text-sm"><Label>צלילים בו־זמנית</Label>
            <select className="w-full rounded-md border p-2 bg-background" value={settings.maxChordNotes} onChange={e=>change({maxChordNotes:Number(e.target.value)})}>
              {[2,3,4].map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-2 border rounded-xl p-3">
            <div className="font-medium">🎼 מפתח סול — תווים מותרים</div>
            <div className="grid grid-cols-2 gap-2">{(['trebleFrom','trebleTo'] as const).map(key=><label key={key} className="text-xs space-y-1">
              {key==='trebleFrom'?'מהתו':'עד התו'}
              <select className="w-full p-2 rounded-md border bg-background" value={settings[key]} onChange={e=>{
                const pitch=Number(e.target.value);
                change(key==='trebleFrom'?{trebleFrom:pitch,trebleTo:Math.max(pitch,settings.trebleTo)}:{trebleTo:pitch,trebleFrom:Math.min(pitch,settings.trebleFrom)});
              }}>{range(48,84).map(n=><option key={n} value={n}>{noteName(n)}</option>)}</select>
            </label>)}</div>
          </div>
          <div className="space-y-2 border rounded-xl p-3">
            <div className="font-medium">🎼 מפתח פה — תווים מותרים</div>
            <div className="grid grid-cols-2 gap-2">{(['bassFrom','bassTo'] as const).map(key=><label key={key} className="text-xs space-y-1">
              {key==='bassFrom'?'מהתו':'עד התו'}
              <select className="w-full p-2 rounded-md border bg-background" value={settings[key]} onChange={e=>{
                const pitch=Number(e.target.value);
                change(key==='bassFrom'?{bassFrom:pitch,bassTo:Math.max(pitch,settings.bassTo)}:{bassTo:pitch,bassFrom:Math.min(pitch,settings.bassFrom)});
              }}>{range(36,72).map(n=><option key={n} value={n}>{noteName(n)}</option>)}</select>
            </label>)}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <strong className="text-sm">ערכים ריתמיים:</strong>
          {([0.5,1,2,4] as const).map(v=><label key={v} className="text-sm flex gap-2 items-center">
            <input type="checkbox" disabled={v===1} checked={settings.rhythmValues.includes(v)} onChange={e=>{
              const next=e.target.checked?[...settings.rhythmValues,v]:settings.rhythmValues.filter(n=>n!==v);
              change({rhythmValues:next});
            }}/>
            {v===0.5?'שמינית':v===1?'רבע':v===2?'חצי':'שלם'}
          </label>)}
        </div>
      </CardContent>
    </Card>
    <MusicPlay key={revision} student={demo} preview />
    <Card>
      <CardHeader><CardTitle>📝 מה לשפר אחרי ההתנסות?</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">כתבי כאן מה ראית ומה היית רוצה לשנות. המידע נשאר בדפדפן בלבד ואינו נשלח או נשמר במערכת.</p>
        <textarea dir="rtl" rows={3} className="w-full border rounded-md bg-background p-3" placeholder="למשל: התווים קטנים מדי, אני רוצה שתי תיבות קבועות במסך..." value={feedback} onChange={e=>setFeedback(e.target.value)} />
        <Button variant="outline" onClick={()=>void copyReport()}>העתקת הגדרות ומשוב לצ׳אט</Button>
        {clipboardState && <p className="text-sm" role="status">{clipboardState}</p>}
        <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">הצגת טקסט הדוח להעתקה ידנית</summary>
          <textarea readOnly className="w-full border rounded-md bg-background p-2 mt-2" rows={8} value={report()} onFocus={e=>e.currentTarget.select()} />
        </details>
      </CardContent>
    </Card>
    <p className="text-xs text-muted-foreground">זהו סטודיו התנסות. כדי לשייך ידע לתלמידה אמיתית, היכנסי ללשונית תלמידות ובחרי ״רמות אימון״ בכרטיס שלה.</p>
  </div>;
}
