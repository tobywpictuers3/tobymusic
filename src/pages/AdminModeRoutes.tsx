import { useEffect, useLayoutEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getCurrentUser, setDevMode } from '@/lib/storage';
import { clearDevFakeDate, restoreNativeClock } from '@/lib/devFakeClock';
import FinancialYearGate from '@/components/admin/FinancialYearGate';
import AdminDashboard from './AdminDashboard';
import DevAdminDashboard from './DevAdminDashboard';

export const NormalAdminRoute = () => {
  const [ready, setReady] = useState(false);
  const [syncGeneration, setSyncGeneration] = useState(0);

  useEffect(() => {
    const handleCanonicalDataApplied = () => setSyncGeneration((value) => value + 1);
    window.addEventListener('toby:canonical-sync-applied', handleCanonicalDataApplied);
    return () => window.removeEventListener('toby:canonical-sync-applied', handleCanonicalDataApplied);
  }, []);

  useLayoutEffect(() => {
    sessionStorage.removeItem('musicSystem_devMode');
    setDevMode(false);
    restoreNativeClock();
    setReady(true);
  }, []);

  if (!ready) return null;

  const isAdmin = getCurrentUser()?.type === 'admin';

  const dashboard = <AdminDashboard key={syncGeneration} />;

  return (
    <div className="relative">
      {isAdmin ? <FinancialYearGate>{dashboard}</FinancialYearGate> : dashboard}
    </div>
  );
};

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
    <div className="relative">
      {isAdmin && (
        <div className="sticky top-0 z-40 border-b-2 border-red-500 bg-red-100/95 px-3 py-2 shadow-md backdrop-blur-sm dark:bg-red-950/90">
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
