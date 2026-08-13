import { useLayoutEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlaskConical, RotateCcw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getCurrentUser, setDevMode } from '@/lib/storage';
import { clearDevFakeDate, restoreNativeClock } from '@/lib/devFakeClock';
import AdminDashboard from './AdminDashboard';
import DevAdminDashboard from './DevAdminDashboard';

/**
 * Hard boundary for the normal admin route.
 * The production dashboard is not mounted until any leftover developer state
 * from this browser tab has been cleared, so devData/fake time cannot leak
 * back into /admin after a rehearsal.
 */
export const NormalAdminRoute = () => {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    sessionStorage.removeItem('musicSystem_devMode');
    setDevMode(false);
    restoreNativeClock();
    setReady(true);
  }, []);

  if (!ready) return null;

  const isAdmin = getCurrentUser()?.type === 'admin';

  return (
    <div className="relative z-[120]">
      {isAdmin && (
        <div className="relative z-[140] border-b border-red-300/70 bg-red-50/95 px-3 py-2 shadow-sm dark:bg-red-950/60">
          <div className="container mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-red-800 dark:text-red-200">
              <FlaskConical className="h-4 w-4" />
              בדיקת מעבר שנה וטעינת JSON מבודדת
            </div>
            <Button
              type="button"
              onClick={() => navigate('/dev-admin')}
              className="border border-red-400 bg-red-700 text-white hover:bg-red-800"
              size="sm"
              title="פתיחת סביבת בדיקה מבודדת ללא שמירה ל-Dropbox"
            >
              <FlaskConical className="ml-2 h-4 w-4" />
              פתחי מצב בדיקה
            </Button>
          </div>
        </div>
      )}
      <AdminDashboard />
    </div>
  );
};

/**
 * Explicit route-level boundary for the isolated developer environment.
 * The entire route is raised above PageBackground so developer controls cannot
 * disappear behind decorative layers. The status bar lives in normal document
 * flow rather than relying on a fixed corner button.
 */
export const DevAdminRoute = () => {
  const navigate = useNavigate();
  const isAdmin = getCurrentUser()?.type === 'admin';

  const returnToNormalMode = () => {
    clearDevFakeDate();
    restoreNativeClock();
    sessionStorage.removeItem('musicSystem_devMode');
    setDevMode(false);
    navigate('/admin', { replace: true });
  };

  return (
    <div className="relative z-[130]">
      {isAdmin && (
        <div className="sticky top-0 z-[160] border-b-2 border-red-500 bg-red-100/95 px-3 py-2 shadow-md backdrop-blur-sm dark:bg-red-950/90">
          <div className="container mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-red-900 dark:text-red-100">
              <ShieldCheck className="h-4 w-4" />
              מצב בדיקה פעיל — נתונים מקומיים בלבד, ללא Dropbox
            </div>
            <Button
              type="button"
              onClick={returnToNormalMode}
              variant="outline"
              size="sm"
              className="border-red-400"
              title="ניקוי מצב הבדיקה וחזרה לנתוני הייצור"
            >
              <RotateCcw className="ml-2 h-4 w-4" />
              חזרה למצב רגיל
            </Button>
          </div>
        </div>
      )}
      <DevAdminDashboard />
    </div>
  );
};
