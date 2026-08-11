import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, Download, Cloud, CloudOff, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { hybridSync } from '@/lib/hybridSync';
import { logger } from '@/lib/logger';
import { isDevMode } from '@/lib/storage';
import { importBackupSafely } from '@/lib/safeBackupRestore';
import {
  getLocalJsonDraftState,
  subscribeLocalJsonDraftState,
} from '@/lib/localJsonDraft';

const BackupImport = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [draftActive, setDraftActive] = useState(() => getLocalJsonDraftState().active);
  const devMode = isDevMode();

  useEffect(() => subscribeLocalJsonDraftState(next => setDraftActive(next.active)), []);

  const handleDownloadFromWorker = async () => {
    if (devMode) {
      toast({
        title: '🧪 מצב בדיקה',
        description: 'במצב בדיקה אין הורדה אוטומטית מ-Dropbox. טעני JSON מקומי כדי לשמור על בידוד מלא.',
      });
      return;
    }

    if (draftActive) {
      toast({
        title: '⏸ סנכרון מושהה',
        description: 'נטען JSON מקומי שטרם נשמר. לחצי קודם על שמור JSON ל-Dropbox או רענני את הדף כדי לבטל את הטיוטה המקומית.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      await hybridSync.loadDataOnInit();

      toast({
        title: '✅ הורדה הושלמה',
        description: 'הנתונים עודכנו מהדרופבוקס',
      });

      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      logger.error('Download from worker error:', error);
      toast({
        title: '❌ שגיאה בהורדה',
        description: 'הורדה נכשלה, בדקי חיבור לאינטרנט',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadBackup = () => {
    try {
      hybridSync.downloadBackup();
      toast({
        title: '✅ הגיבוי הורד',
        description: 'קובץ הגיבוי נשמר במחשב',
      });
    } catch (error) {
      logger.error('Download backup error:', error);
      toast({
        title: '❌ שגיאה בהורדה',
        description: 'אירעה תקלה. נסי שוב.',
        variant: 'destructive',
      });
    }
  };

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.json')) {
      toast({
        title: 'שגיאה',
        description: 'ניתן לטעון רק קבצי JSON',
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await importBackupSafely(file);

      toast({
        title: result.success
          ? devMode
            ? '✅ הגיבוי נטען במצב בדיקה'
            : '✅ ה-JSON נטען מקומית'
          : '❌ הייבוא נכשל',
        description: result.message,
        variant: result.success ? 'default' : 'destructive',
      });
    } catch (error) {
      logger.error('Import error:', error);
      toast({
        title: '❌ שגיאה ביבוא',
        description: 'שגיאה בטעינת הגיבוי',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const syncState = hybridSync.getSyncState();

  return (
    <div className="space-y-6">
      <Card className="card-gradient card-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {draftActive && !devMode ? <CloudOff className="h-5 w-5" /> : <Cloud className="h-5 w-5" />}
            הורדה מדרופבוקס
            {devMode ? (
              <Badge variant="secondary">🧪 מבודד</Badge>
            ) : draftActive ? (
              <Badge variant="destructive">⏸ סנכרון מושהה</Badge>
            ) : syncState.isOnline ? (
              <Badge variant="default">🟢 מקוון</Badge>
            ) : (
              <Badge variant="destructive">🔴 לא מקוון</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted/50 rounded-lg space-y-2">
            {devMode ? (
              <p className="text-sm text-muted-foreground">
                <strong>🧪 מצב בדיקה:</strong> נתונים נטענים מזיכרון מקומי בלבד. אין קריאה או כתיבה ל-Dropbox.
              </p>
            ) : draftActive ? (
              <>
                <p className="text-sm font-medium">
                  <strong>⏸ JSON מקומי פעיל:</strong> הסנכרון האוטומטי ל-Dropbox מושהה כרגע.
                </p>
                <p className="text-sm text-muted-foreground">
                  אפשר לעבור בין המסכים ולבדוק או לערוך את הנתונים. לחיצה על <strong>שמור JSON ל-Dropbox</strong> בראש המסך תעלה את המצב הנוכחי, תאמת אותו ורק אז תחזיר את הסנכרון הקבוע.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  <strong>🔒 מקור האמת:</strong> הנתונים הקבועים נשמרים ב-Worker/Dropbox
                </p>
                <p className="text-sm text-muted-foreground">
                  <strong>💾 מטמון מקומי:</strong> הדפדפן שומר עותק זמני לעבודה מהירה
                </p>
                <p className="text-sm text-muted-foreground">
                  <strong>📥 הורדה:</strong> לחצי כאן כדי להוריד את הנתונים האחרונים מהדרופבוקס
                </p>
                <p className="text-sm text-muted-foreground">
                  <strong>💾 שמירה:</strong> השתמשי בכפתור השמירה בראש המסך כדי להעלות שינויים לדרופבוקס
                </p>
                {syncState.lastSyncTime && (
                  <p className="text-sm text-muted-foreground">
                    <strong>🕐 סנכרון אחרון:</strong>{' '}
                    {new Date(syncState.lastSyncTime).toLocaleString('he-IL')}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleDownloadFromWorker}
              disabled={isLoading || devMode || draftActive || !syncState.isOnline}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <Download className="h-4 w-4 ml-2" />
              )}
              הורדה מדרופבוקס
            </Button>
          </div>

          {!devMode && !draftActive && !syncState.isOnline && (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                <strong>📡 אין חיבור לאינטרנט</strong>
                <br />
                המערכת עובדת במצב אופליין. הנתונים יסתנכרנו אוטומטית כשהחיבור יחזור.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="card-gradient card-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            גיבוי מקומי
            <Badge variant="secondary">ידני בלבד</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                ייצוא ויבוא של קובצי גיבוי JSON
              </p>

              <div className="flex gap-2 mb-4">
                <Button onClick={handleDownloadBackup} disabled={isLoading}>
                  <Download className="h-4 w-4 ml-2" />
                  הורד גיבוי מקומי
                </Button>
              </div>

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileImport}
                  className="hidden"
                  id="file-upload"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  variant="outline"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Upload className="h-4 w-4 ml-2" />}
                  טען גיבוי מקובץ
                </Button>
              </div>
            </div>

            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium mb-2">ℹ️ הערה חשובה</p>
              <p className="text-sm text-muted-foreground">
                {devMode
                  ? 'במצב בדיקה הייבוא מחליף את נתוני הבדיקה בזיכרון בלבד ואינו נשמר ל-Dropbox.'
                  : 'במצב רגיל טעינת JSON עוברת למצב טיוטה מקומי ומפסיקה את הסנכרון האוטומטי. רק לחיצה על שמור JSON ל-Dropbox שומרת ומאמתת את הנתונים ומחזירה את הסנכרון הקבוע.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BackupImport;
