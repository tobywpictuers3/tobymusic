import { useLayoutEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlaskConical, RotateCcw } from 'lucide-react';
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
    <>
      <AdminDashboard />
      {isAdmin && (
        <Button
          type="button"
          onClick={() => navigate('/dev-admin')}
          className="fixed bottom-4 left-4 z-[100] shadow-xl border border-red-400 bg-red-700 text-white hover:bg-red-800"
          title="פתיחת סביבת בדיקה מבודדת ללא שמירה ל-Dropbox"
        >
          <FlaskConical className="ml-2 h-4 w-4" />
          מצב בדיקה
        </Button>
      )}
    </>
  );
};

/**
 * Adds an explicit, safe exit from the isolated developer route.
 * DevAdminDashboard itself installs devMode/fake clock before mounting the
 * real dashboard; this wrapper guarantees they are cleared before returning.
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
    <>
      <DevAdminDashboard />
      {isAdmin && (
        <Button
          type="button"
          onClick={returnToNormalMode}
          className="fixed bottom-4 left-4 z-[110] shadow-xl"
          variant="outline"
          title="ניקוי מצב הבדיקה וחזרה לנתוני הייצור"
        >
          <RotateCcw className="ml-2 h-4 w-4" />
          חזרה למצב רגיל
        </Button>
      )}
    </>
  );
};
