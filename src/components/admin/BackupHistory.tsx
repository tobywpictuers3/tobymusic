import { useState, useEffect, type MouseEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/safe-ui/card';
import { Button } from '@/components/safe-ui/button';
import { Badge } from '@/components/safe-ui/badge';
import { toast } from '@/hooks/use-toast';
import { workerApi } from '@/lib/workerApi';
import { logger } from '@/lib/logger';
import { isDevMode } from '@/lib/storage';
import { restorePracticeSessionsFromVersion } from '@/lib/practiceRestore';
import {
  History,
  RefreshCw,
  RotateCcw,
  Calendar,
  HardDrive,
  Loader2,
  Dumbbell,
  CheckCircle,
  ShieldCheck,
  Filter,
  X,
} from 'lucide-react';
import {
  getStudents,
  getLessons,
  getPayments,
  getPracticeSessions,
  getSwapRequests,
  getFiles,
  getMonthlyAchievements,
  getMedalRecords,
  getStudentStatistics,
} from '@/lib/storage';
import { getMessages } from '@/lib/messages';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/safe-ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/safe-ui/alert-dialog';

interface VersionInfo {
  path: string;
  server_modified: string;
  size: number;
  content_hash?: string;
}

const PRACTICE_KEY_HINTS = [
  'practice',
  'practices',
  'session',
  'sessions',
  'training',
  'trainings',
  'workout',
  'exercise',
  'אימון',
  'אימונים',
];

const isPracticeStorageKey = (key: string) => {
  const lowerKey = key.toLowerCase();
  return PRACTICE_KEY_HINTS.some((hint) => lowerKey.includes(hint.toLowerCase()));
};

const extractVersions = (data: unknown): VersionInfo[] => {
  if (Array.isArray(data)) return data as VersionInfo[];

  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;

    if (Array.isArray(obj.entries)) return obj.entries as VersionInfo[];
    if (Array.isArray(obj.versions)) return obj.versions as VersionInfo[];
    if (Array.isArray(obj.items)) return obj.items as VersionInfo[];
    if (Array.isArray(obj.files)) return obj.files as VersionInfo[];
    if (Array.isArray(obj.result)) return obj.result as VersionInfo[];
  }

  return [];
};

const asStorageRecord = (data: unknown): Record<string, unknown> | null => {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return null;
};

const toStorageString = (value: unknown) =>
  typeof value === 'string' ? value : JSON.stringify(value);

const getAllLocalStorageKeys = () => {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key) keys.push(key);
  }
  return keys;
};

interface StorageSnapshotItem {
  key: string;
  value: string | null;
}

const BackupHistory = () => {
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [selectedVersion, setSelectedVersion] = useState<VersionInfo | null>(null);

  // Date range filter
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const [isRestoreDialogOpen, setIsRestoreDialogOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const [isPracticeRestoreDialogOpen, setIsPracticeRestoreDialogOpen] = useState(false);
  const [isRestoringPractice, setIsRestoringPractice] = useState(false);

  const [isRestoreWithoutPracticeDialogOpen, setIsRestoreWithoutPracticeDialogOpen] =
    useState(false);
  const [isRestoringWithoutPractice, setIsRestoringWithoutPractice] = useState(false);

  const devMode = isDevMode();

  const runIntegrityCheck = () => {
    const studentIds = getStudents().map((s) => s.id);
    const lessons = getLessons();
    const payments = getPayments();
    const sessions = getPracticeSessions();
    const swaps = getSwapRequests();
    const files = getFiles();
    const msgs = getMessages();
    const achievements = getMonthlyAchievements();
    const medals = getMedalRecords();

    const errors: string[] = [];

    lessons.forEach((l) => {
      if (!studentIds.includes(l.studentId)) {
        errors.push(`שיעור ${l.id} שייך לתלמידה שאינה קיימת (${l.studentId})`);
      }
    });

    payments.forEach((p) => {
      if (!studentIds.includes(p.studentId)) {
        errors.push(`תשלום ${p.id} שייך לתלמידה שאינה קיימת`);
      }
    });

    sessions.forEach((s) => {
      if (!studentIds.includes(s.studentId)) {
        errors.push(`אימון ${s.id} שייך לתלמידה שאינה קיימת`);
      }
    });

    swaps.forEach((sw) => {
      if (sw.requesterId && !studentIds.includes(sw.requesterId)) {
        errors.push(`SwapRequest יתום עם requesterId חסר (${sw.requesterId})`);
      }
      if (sw.targetId && !studentIds.includes(sw.targetId)) {
        errors.push(`SwapRequest יתום עם targetId חסר (${sw.targetId})`);
      }
    });

    files.forEach((f) => {
      if (!studentIds.includes(f.studentId)) {
        errors.push(`קובץ ${f.id} יתום ללא תלמידה`);
      }
    });

    msgs.forEach((m) => {
      m.recipientIds.forEach((r) => {
        if (r !== 'all' && r !== 'admin' && !studentIds.includes(r)) {
          errors.push(`הודעה ${m.id} מכילה נמענת שאינה קיימת (${r})`);
        }
      });
    });

    achievements.forEach((a) => {
      if (!studentIds.includes(a.studentId)) {
        errors.push(`Achievement יתום עבור ${a.studentId}`);
      }
    });

    medals.forEach((m) => {
      if (!studentIds.includes(m.studentId)) {
        errors.push(`Medal יתום עבור ${m.studentId}`);
      }
    });

    studentIds.forEach((id) => {
      getStudentStatistics(id);
    });

    if (errors.length === 0) {
      toast({
        title: '✅ בדיקת תקינות הושלמה',
        description: 'כל הנתונים תקינים לחלוטין — אין יתומים!',
      });
    } else {
      toast({
        title: `⚠️ נמצאו ${errors.length} בעיות`,
        description:
          errors.slice(0, 3).join('\n') +
          (errors.length > 3 ? `\n...ועוד ${errors.length - 3}` : ''),
        variant: 'destructive',
      });
      console.log('Integrity check errors:', errors);
    }
  };

  const loadVersions = async () => {
  setIsLoading(true);
  try {
    const result = await workerApi.listVersions();

    console.log('listVersions raw result:', result);

    if (result.success && result.data) {
      const versionsArray = extractVersions(result.data);

      console.log('versionsArray count:', versionsArray.length);
      console.log('first 10 raw versions:', versionsArray.slice(0, 10));

      const sorted = [...versionsArray].sort(
        (a, b) =>
          new Date(b.server_modified).getTime() -
          new Date(a.server_modified).getTime()
      );

      console.log('newest version after sort:', sorted[0]);
      console.log('oldest version after sort:', sorted[sorted.length - 1]);

      setVersions(sorted);
      logger.info(`Loaded ${sorted.length} versions`);
    } else {
      logger.error('Failed to load versions:', result.error);
      toast({
        title: '❌ שגיאה בטעינת היסטוריה',
        description: `שגיאה: ${result.error || 'לא ניתן לטעון את רשימת הגרסאות'}`,
        variant: 'destructive',
      });
    }
  } catch (error) {
    logger.error('Error loading versions:', error);
    const errorMessage = error instanceof Error ? error.message : 'שגיאה לא ידועה';
    toast({
      title: '❌ שגיאה',
      description: `אירעה תקלה: ${errorMessage}`,
      variant: 'destructive',
    });
  } finally {
    setIsLoading(false);
  }
};
  

  useEffect(() => {
    if (!devMode) {
      void loadVersions();
    }
  }, [devMode]);

  const handleVersionClick = (version: VersionInfo) => {
    setSelectedVersion(version);
    setIsRestoreDialogOpen(true);
  };

  const handlePracticeRestoreClick = (
    version: VersionInfo,
    e: MouseEvent<HTMLButtonElement>
  ) => {
    e.stopPropagation();
    setSelectedVersion(version);
    setIsPracticeRestoreDialogOpen(true);
  };

  const handleRestoreWithoutPracticeClick = (
    version: VersionInfo,
    e: MouseEvent<HTMLButtonElement>
  ) => {
    e.stopPropagation();
    setSelectedVersion(version);
    setIsRestoreWithoutPracticeDialogOpen(true);
  };

  const handlePracticeRestore = async () => {
    if (!selectedVersion) return;

    setIsRestoringPractice(true);
    try {
      const result = await restorePracticeSessionsFromVersion(selectedVersion.path);

      if (result.success) {
        toast({
          title: '✅ שחזור אימונים הושלם',
          description: `${result.restored} אימונים שוחזרו בהצלחה. הדף יתרענן...`,
        });

        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        toast({
          title: '❌ שגיאה בשחזור אימונים',
          description: result.error || 'לא ניתן לשחזר את האימונים',
          variant: 'destructive',
        });
      }
    } catch (error) {
      logger.error('Error restoring practice sessions:', error);
      toast({
        title: '❌ שגיאה',
        description: 'אירעה תקלה. נסי שוב.',
        variant: 'destructive',
      });
    } finally {
      setIsRestoringPractice(false);
      setIsPracticeRestoreDialogOpen(false);
    }
  };

  const handleRestore = async () => {
    if (!selectedVersion) return;

    setIsRestoring(true);
    try {
      const result = await workerApi.downloadByPath(selectedVersion.path);

      if (result.success && result.data) {
        const restoredData = asStorageRecord(result.data);

        if (!restoredData) {
          toast({
            title: '❌ שגיאה בשחזור',
            description: 'מבנה הנתונים שהתקבל אינו תקין',
            variant: 'destructive',
          });
          return;
        }

        Object.entries(restoredData).forEach(([key, value]) => {
          localStorage.setItem(key, toStorageString(value));
        });

        toast({
          title: '✅ השחזור הושלם',
          description: 'הנתונים שוחזרו בהצלחה. הדף יתרענן...',
        });

        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        toast({
          title: '❌ שגיאה בשחזור',
          description: result.error || 'לא ניתן לשחזר את הגרסה',
          variant: 'destructive',
        });
      }
    } catch (error) {
      logger.error('Error restoring version:', error);
      toast({
        title: '❌ שגיאה',
        description: 'אירעה תקלה. נסי שוב.',
        variant: 'destructive',
      });
    } finally {
      setIsRestoring(false);
      setIsRestoreDialogOpen(false);
    }
  };

  const handleRestoreWithoutPractice = async () => {
    if (!selectedVersion) return;

    setIsRestoringWithoutPractice(true);

    try {
      const currentPracticeSessions = getPracticeSessions();
      const currentPracticeSerialized = JSON.stringify(currentPracticeSessions);

      const result = await workerApi.downloadByPath(selectedVersion.path);

      if (result.success && result.data) {
        const restoredData = asStorageRecord(result.data);

        if (!restoredData) {
          toast({
            title: '❌ שגיאה בשחזור',
            description: 'מבנה הנתונים שהתקבל אינו תקין',
            variant: 'destructive',
          });
          return;
        }

        const practiceKeys = new Set<string>();

        getAllLocalStorageKeys().forEach((key) => {
          if (isPracticeStorageKey(key)) {
            practiceKeys.add(key);
            return;
          }

          const currentValue = localStorage.getItem(key);
          if (currentValue === currentPracticeSerialized) {
            practiceKeys.add(key);
          }
        });

        Object.entries(restoredData).forEach(([key, value]) => {
          if (isPracticeStorageKey(key)) {
            practiceKeys.add(key);
            return;
          }

          try {
            if (toStorageString(value) === currentPracticeSerialized) {
              practiceKeys.add(key);
            }
          } catch {
            // ignore
          }
        });

        const practiceSnapshot: StorageSnapshotItem[] = Array.from(practiceKeys).map((key) => ({
          key,
          value: localStorage.getItem(key),
        }));

        Object.entries(restoredData).forEach(([key, value]) => {
          if (practiceKeys.has(key) || isPracticeStorageKey(key)) return;
          localStorage.setItem(key, toStorageString(value));
        });

        practiceSnapshot.forEach(({ key, value }) => {
          if (value === null) {
            localStorage.removeItem(key);
          } else {
            localStorage.setItem(key, value);
          }
        });

        toast({
          title: '✅ השחזור הושלם',
          description: 'כל הנתונים שוחזרו, והאימונים נשמרו כפי שהם. הדף יתרענן...',
        });

        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        toast({
          title: '❌ שגיאה בשחזור',
          description: result.error || 'לא ניתן לשחזר את הגרסה',
          variant: 'destructive',
        });
      }
    } catch (error) {
      logger.error('Error restoring version without practice sessions:', error);
      toast({
        title: '❌ שגיאה',
        description: 'אירעה תקלה. נסי שוב.',
        variant: 'destructive',
      });
    } finally {
      setIsRestoringWithoutPractice(false);
      setIsRestoreWithoutPracticeDialogOpen(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('he-IL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (devMode) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            היסטוריית גיבויים
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <div className="text-4xl mb-4">🔧</div>
            <p className="text-lg font-medium mb-2">לא זמין במצב מפתחים</p>
            <p className="text-sm">היסטוריית גיבויים זמינה רק במצב ניהול רגיל</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="card-gradient card-shadow">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              היסטוריית גיבויים
              {versions.length > 0 && (
                <Badge variant="secondary">{versions.length} גרסאות</Badge>
              )}
            </CardTitle>

            <div className="flex gap-2">
              <Button onClick={runIntegrityCheck} variant="outline" size="sm">
                <CheckCircle className="h-4 w-4 ml-2" />
                בדוק תקינות נתונים
              </Button>

              <Button onClick={loadVersions} disabled={isLoading} variant="outline" size="sm">
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 ml-2" />
                )}
                רענן
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>🔒 מקור האמת:</strong> כל הגרסאות נשמרות ב-Worker החיצוני שלך בלבד.
                <br />
                לחצי על גרסה כדי לשחזר אותה.
              </p>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="mr-3 text-muted-foreground">טוען גרסאות...</span>
              </div>
            ) : versions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <HardDrive className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">אין גרסאות שמורות</p>
                <p className="text-sm text-muted-foreground mt-2">
                  הגרסה הראשונה תישמר אוטומטית עם השינוי הבא
                </p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">תאריך ושעה</TableHead>
                      <TableHead className="text-right">גודל</TableHead>
                      <TableHead className="text-right">נתיב</TableHead>
                      <TableHead className="text-right" colSpan={3}>
                        פעולות
                      </TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {versions.map((version, index) => (
                      <TableRow
                        key={version.path}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleVersionClick(version)}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {formatDate(version.server_modified)}
                            {index === 0 && (
                              <Badge variant="default" className="mr-2">
                                אחרון
                              </Badge>
                            )}
                          </div>
                        </TableCell>

                        <TableCell>{formatSize(version.size)}</TableCell>

                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {version.path.split('/').pop()}
                        </TableCell>

                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleVersionClick(version);
                            }}
                          >
                            <RotateCcw className="h-4 w-4 ml-2" />
                            שחזר הכל
                          </Button>
                        </TableCell>

                        <TableCell>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => handleRestoreWithoutPracticeClick(version, e)}
                          >
                            <ShieldCheck className="h-4 w-4 ml-2" />
                            שחזר הכל חוץ מאימונים
                          </Button>
                        </TableCell>

                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => handlePracticeRestoreClick(version, e)}
                          >
                            <Dumbbell className="h-4 w-4 ml-2" />
                            שחזר רק אימונים
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* שחזור מלא */}
      <AlertDialog open={isRestoreDialogOpen} onOpenChange={setIsRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>שחזור גרסה</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>האם את בטוחה שברצונך לשחזר את הגרסה הזו?</p>

                {selectedVersion && (
                  <div className="p-4 bg-muted rounded-lg space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">תאריך:</span>
                      <span>{formatDate(selectedVersion.server_modified)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">גודל:</span>
                      <span>{formatSize(selectedVersion.size)}</span>
                    </div>
                  </div>
                )}

                <p className="text-destructive font-medium">
                  ⚠️ פעולה זו תחליף את כל הנתונים הנוכחיים!
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoring}>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestore}
              disabled={isRestoring}
              className="bg-primary"
            >
              {isRestoring ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  משחזר...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 ml-2" />
                  שחזר גרסה
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* שחזור מלא בלי אימונים */}
      <AlertDialog
        open={isRestoreWithoutPracticeDialogOpen}
        onOpenChange={setIsRestoreWithoutPracticeDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>שחזור הכל חוץ מאימונים</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>פעולה זו תשחזר את כל הנתונים מהגרסה שנבחרה, אבל תשאיר את האימונים הנוכחיים כפי שהם.</p>

                {selectedVersion && (
                  <div className="p-4 bg-muted rounded-lg space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">תאריך:</span>
                      <span>{formatDate(selectedVersion.server_modified)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">גודל:</span>
                      <span>{formatSize(selectedVersion.size)}</span>
                    </div>
                  </div>
                )}

                <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                  <p className="text-sm font-medium">
                    ✅ האימונים יישמרו בדיוק כמו שהם עכשיו
                  </p>
                </div>

                <p className="text-destructive font-medium text-sm">
                  ⚠️ כל שאר הנתונים יוחלפו לפי הגרסה שנבחרה
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoringWithoutPractice}>
              ביטול
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestoreWithoutPractice}
              disabled={isRestoringWithoutPractice}
              className="bg-primary"
            >
              {isRestoringWithoutPractice ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  משחזר...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4 ml-2" />
                  שחזר הכל חוץ מאימונים
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* שחזור אימונים בלבד */}
      <AlertDialog
        open={isPracticeRestoreDialogOpen}
        onOpenChange={setIsPracticeRestoreDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>שחזור אימונים בלבד</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>פעולה זו תשחזר רק את נתוני האימונים מהגרסה הזו.</p>

                {selectedVersion && (
                  <div className="p-4 bg-muted rounded-lg space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">תאריך:</span>
                      <span>{formatDate(selectedVersion.server_modified)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">גודל:</span>
                      <span>{formatSize(selectedVersion.size)}</span>
                    </div>
                  </div>
                )}

                <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                  <p className="text-sm font-medium">
                    ✅ בטוח: כל שאר הנתונים (תלמידות, שיעורים, תשלומים) יישארו ללא שינוי
                  </p>
                </div>

                <p className="text-destructive font-medium text-sm">
                  ⚠️ נתוני האימונים הנוכחיים יוחלפו באימונים מהגרסה הזו
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoringPractice}>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePracticeRestore}
              disabled={isRestoringPractice}
              className="bg-primary"
            >
              {isRestoringPractice ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  משחזר אימונים...
                </>
              ) : (
                <>
                  <Dumbbell className="h-4 w-4 ml-2" />
                  שחזר אימונים
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BackupHistory;
