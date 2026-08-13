import { useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setDevMode, getCurrentUser, setCurrentUser } from '@/lib/storage';
import { mockStudents } from '@/lib/mockData';
import AdminDashboard from './AdminDashboard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CalendarClock, RotateCcw, ShieldCheck, User } from 'lucide-react';
import {
  clearDevFakeDate,
  getDevFakeDate,
  installDevFakeClock,
  restoreNativeClock,
  setDevFakeDate,
} from '@/lib/devFakeClock';

const QUICK_DATES = [
  { value: '2026-08-30', label: '30.8 — לפני הדו״ח' },
  { value: '2026-08-31', label: '31.8 — דו״ח סוף שנה' },
  { value: '2026-09-01', label: '1.9 — מעבר ל־2027' },
  { value: '2026-09-02', label: '2.9 — אחרי המעבר' },
];

const DevAdminDashboard = () => {
  const navigate = useNavigate();
  const yearControlsRef = useRef<HTMLDivElement>(null);
  const [clockReady, setClockReady] = useState(false);
  const [clockRevision, setClockRevision] = useState(0);
  const [clockInput, setClockInput] = useState(() => getDevFakeDate() || '');
  const [activeFakeDate, setActiveFakeDate] = useState<string | null>(() => getDevFakeDate());

  useLayoutEffect(() => {
    const currentUser = getCurrentUser();

    if (!currentUser || currentUser.type !== 'admin') {
      navigate('/');
      return;
    }

    // CRITICAL: dev storage is activated before the real AdminDashboard is mounted.
    setDevMode(true);
    sessionStorage.setItem('musicSystem_devMode', 'true');
    installDevFakeClock();
    setActiveFakeDate(getDevFakeDate());
    setClockReady(true);

    // Start a rehearsal at the developer controls even if the browser restored
    // an old scroll position from the normal admin route.
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

    // The fake Date must never leak from /dev-admin into a normal route in the same tab.
    return () => restoreNativeClock();
  }, [navigate]);

  useLayoutEffect(() => {
    const handleStorageImported = () => {
      // The imported JSON already lives in isolated devData. Remounting the
      // dashboard makes every tab re-read it without destroying module memory.
      setClockRevision(revision => revision + 1);
    };

    window.addEventListener('toby:storage-imported', handleStorageImported);
    return () => window.removeEventListener('toby:storage-imported', handleStorageImported);
  }, []);

  const showYearControls = () => {
    yearControlsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const applyFakeDate = (value: string) => {
    setDevFakeDate(value);
    setClockInput(value);
    setActiveFakeDate(value);
    // Remount only the dashboard. devData remains in module memory, so an imported JSON is not lost.
    setClockRevision(revision => revision + 1);
  };

  const useRealClock = () => {
    clearDevFakeDate();
    setClockInput('');
    setActiveFakeDate(null);
    setClockRevision(revision => revision + 1);
  };

  const handleStudentLogin = (studentId: string) => {
    setCurrentUser({ type: 'student', studentId });
    navigate(`/student/${studentId}`);
  };

  if (!clockReady) return null;

  return (
    // PageBackground is a fixed z-0 layer. The normal AdminDashboard already
    // uses z-10, but these developer-only cards are siblings above it. Without
    // an explicit stacking level they render behind the stage background and
    // appear to be missing even though /dev-admin is active.
    <div className="relative z-20 space-y-6">
      <div ref={yearControlsRef} id="dev-year-rollover-controls" className="scroll-mt-4">
        <Card className="border-2 border-red-500/70 bg-red-50/95 dark:bg-red-950/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-red-800 dark:text-red-200">
              <ShieldCheck className="h-5 w-5" />
              סביבת בדיקה מבודדת — ללא שמירה ל־Dropbox
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-red-300/70 bg-background/80 p-3 text-sm">
              <div className="flex items-center gap-2 font-semibold">
                <CalendarClock className="h-4 w-4" />
                שעון דמה
              </div>
              <p className="mt-1 text-muted-foreground">
                התאריך המדומה משפיע על כל חישובי התאריך בתוך מצב המפתחים בלבד. שינוי תאריך לא מוחק את ה־JSON שכבר טעון בזיכרון.
              </p>
              <div className="mt-2 font-medium">
                {activeFakeDate
                  ? <>תאריך פעיל: <span className="text-red-700 dark:text-red-300">{new Date().toLocaleDateString('he-IL')}</span></>
                  : <>תאריך פעיל: <span>שעון אמיתי</span></>}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label htmlFor="dev-fake-date" className="mb-1 block text-sm font-medium">בחרי תאריך בדיקה</label>
                <Input
                  id="dev-fake-date"
                  type="date"
                  value={clockInput}
                  onChange={event => setClockInput(event.target.value)}
                />
              </div>
              <Button
                type="button"
                className="hero-gradient"
                disabled={!clockInput}
                onClick={() => applyFakeDate(clockInput)}
              >
                החל תאריך
              </Button>
              <Button type="button" variant="outline" onClick={useRealClock}>
                <RotateCcw className="ml-2 h-4 w-4" />
                חזרה לשעון אמיתי
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {QUICK_DATES.map(item => (
                <Button
                  key={item.value}
                  type="button"
                  size="sm"
                  variant={activeFakeDate === item.value ? 'default' : 'outline'}
                  onClick={() => applyFakeDate(item.value)}
                >
                  {item.label}
                </Button>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              לבדיקת מעבר השנה: טעני JSON, עברי ל־31.8 ובדקי את הדו״ח; לאחר מכן עברי ל־1.9. מעבר ל־1.9 מריץ את מנגנון המעבר על נתוני המפתחים בלבד.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="card-gradient card-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            גישה לאזור אישי - מצב מפתחים
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            כניסה לאזור אישי של תלמידות לדוגמא (נתונים מקומיים בלבד, ללא שמירה לדרופבוקס)
          </p>
          <div className="flex flex-wrap gap-2">
            {mockStudents.map((student) => (
              <Button
                key={student.id}
                variant="outline"
                onClick={() => handleStudentLogin(student.id)}
              >
                {student.firstName} {student.lastName}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Remounting the dashboard re-runs date-gated logic without clearing isolated devData. */}
      <AdminDashboard key={clockRevision} />

      <Button
        type="button"
        onClick={showYearControls}
        className="fixed bottom-16 left-4 z-[109] shadow-xl border border-red-400 bg-red-700 text-white hover:bg-red-800"
        title="חזרה לפקדי שעון הדמה ומעבר השנה"
      >
        <CalendarClock className="ml-2 h-4 w-4" />
        בדיקת מעבר שנה
      </Button>
    </div>
  );
};

export default DevAdminDashboard;