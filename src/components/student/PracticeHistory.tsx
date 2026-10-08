import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { History, Trash2, Pencil } from 'lucide-react';
import { getStudentPracticeSessions, deletePracticeSession, updatePracticeSession } from '@/lib/storage';
import { PracticeSession } from '@/lib/types';
import { getDailyMedalInfo, getDailyMedalLevel } from '@/lib/medalEngine';
import { toast } from '@/hooks/use-toast';

interface PracticeHistoryProps {
  studentId: string;
  refreshKey?: number;
  onRefresh?: () => void;
}

interface DailyStats {
  date: string;
  sessions: PracticeSession[];
  totalMinutes: number;
}

const PracticeHistory = ({ studentId, refreshKey = 0, onRefresh }: PracticeHistoryProps) => {
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  // Edit session state
  const [sessionToEdit, setSessionToEdit] = useState<PracticeSession | null>(null);
  const [editForm, setEditForm] = useState({
    date: '',
    startTime: '',
    endTime: '',
    durationMinutes: 0 as number,
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    const sessions = getStudentPracticeSessions(studentId);

    // Group by date
    const grouped: Record<string, PracticeSession[]> = {};
    sessions.forEach(session => {
      if (!grouped[session.date]) grouped[session.date] = [];
      grouped[session.date].push(session);
    });

    const stats: DailyStats[] = Object.entries(grouped).map(([date, daySessions]) => ({
      date,
      sessions: daySessions,
      totalMinutes: daySessions.reduce((sum, s) => sum + s.durationMinutes, 0),
    }));

    // Sort newest first
    stats.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    setDailyStats(stats);
  }, [studentId, refreshKey]);

  const handleDeleteSession = async (sessionId: string) => {
    try {
      const deleted = await deletePracticeSession(sessionId);

      if (deleted) {
        toast({
          title: 'האימון נמחק מהרשימה',
          description: 'מחיקת הענן מתבצעת ברקע, ותאומת לאחר הסנכרון.',
          duration: 3000,
        });
        onRefresh?.();
      }

      setSessionToDelete(null);
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: '❌ שגיאה במחיקה',
        description: 'אנא נסי שוב',
        variant: 'destructive',
        duration: 3000,
      });
    }
  };

  const openEdit = (session: PracticeSession) => {
    setSessionToEdit(session);
    setEditForm({
      date: session.date,
      startTime: session.startTime || '',
      endTime: session.endTime || '',
      durationMinutes: session.durationMinutes || 0,
    });
  };

  const parseTimeToMinutes = (t: string): number | null => {
    const mm = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t.trim());
    if (!mm) return null;
    return parseInt(mm[1], 10) * 60 + parseInt(mm[2], 10);
  };

  const computeDurationFromTimes = (start: string, end: string): number | null => {
    const s = parseTimeToMinutes(start);
    const e = parseTimeToMinutes(end);
    if (s === null || e === null) return null;
    const diff = e - s;
    if (diff <= 0) return null;
    return diff;
  };

  const handleSaveEdit = async () => {
    if (!sessionToEdit) return;

    const date = editForm.date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast({
        title: '❌ תאריך לא תקין',
        description: 'פורמט נדרש: YYYY-MM-DD',
        variant: 'destructive',
        duration: 3000,
      });
      return;
    }

    let duration = Number(editForm.durationMinutes) || 0;
    const startTime = editForm.startTime.trim() || undefined;
    const endTime = editForm.endTime.trim() || undefined;

    // If both times exist, prefer derived duration
    if (startTime && endTime) {
      const derived = computeDurationFromTimes(startTime, endTime);
      if (derived === null) {
        toast({
          title: '❌ שעות לא תקינות',
          description: 'בדקי שעת התחלה/סיום (HH:MM) ושסיום מאוחר מהתחלה',
          variant: 'destructive',
          duration: 3500,
        });
        return;
      }
      duration = derived;
    }

    if (duration <= 0) {
      toast({
        title: '❌ משך לא תקין',
        description: 'משך האימון חייב להיות גדול מ-0',
        variant: 'destructive',
        duration: 3000,
      });
      return;
    }

    setIsSavingEdit(true);
    try {
      const updated = updatePracticeSession(sessionToEdit.id, {
        date,
        startTime,
        endTime,
        durationMinutes: duration,
      });

      if (!updated) {
        toast({
          title: '❌ לא נמצא אימון לעדכון',
          description: 'רענני ונסי שוב',
          variant: 'destructive',
          duration: 3000,
        });
        return;
      }

      toast({
        title: 'האימון עודכן ברשימה',
        description: 'העדכון לענן מתבצע ברקע; בדקי את מצב הסנכרון.',
        duration: 2500,
      });

      setSessionToEdit(null);
      onRefresh?.();
    } catch (error) {
      console.error('Edit error:', error);
      toast({
        title: '❌ שגיאה בעדכון',
        description: 'אנא נסי שוב',
        variant: 'destructive',
        duration: 3000,
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            היסטוריית אימונים
          </CardTitle>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>תאריך</TableHead>
                <TableHead>אימונים</TableHead>
                <TableHead>סה"כ</TableHead>
                <TableHead>מדליה</TableHead>
                <TableHead className="w-[40px]"></TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {dailyStats.map((day) => {
                const medalLevel = getDailyMedalLevel(day.totalMinutes);
                const medal = getDailyMedalInfo(medalLevel);

                return (
                  <TableRow key={day.date}>
                    <TableCell className="font-medium text-sm">
                      {new Date(day.date).toLocaleDateString('he-IL', {
                        weekday: 'short',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                      })}
                    </TableCell>

                    <TableCell>
                      <div className="space-y-2">
                        {day.sessions.map((session) => (
                          <div key={session.id} className="flex items-center justify-between gap-3 group">
                            <div className="text-sm">
                              <span className="font-medium">{session.durationMinutes} דק׳</span>
                              {(session.startTime || session.endTime) && (
                                <span className="text-muted-foreground">
                                  {' '}
                                  ({session.startTime || '--:--'}–{session.endTime || '--:--'})
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0"
                                onClick={() => openEdit(session)}
                                title="עריכה"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0"
                                onClick={() => setSessionToDelete(session.id)}
                                title="מחיקה"
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" className="text-sm">
                        {day.totalMinutes} דק׳
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <span className="text-lg">{medal.icon}</span>
                    </TableCell>

                    <TableCell />
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <AlertDialog open={!!sessionToEdit} onOpenChange={() => setSessionToEdit(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>עריכת אימון</AlertDialogTitle>
            <AlertDialogDescription>
              עדכני תאריך/שעות/דקות. אם מזינים גם התחלה וגם סיום – המערכת תחושב את הדקות לפי ההפרש.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">תאריך (YYYY-MM-DD)</label>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={editForm.date}
                onChange={(e) => setEditForm(f => ({ ...f, date: e.target.value }))}
                placeholder="2026-01-08"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">שעת התחלה (HH:MM)</label>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={editForm.startTime}
                  onChange={(e) => {
                    const startTime = e.target.value;
                    const derived = computeDurationFromTimes(startTime, editForm.endTime);
                    setEditForm(f => ({
                      ...f,
                      startTime,
                      durationMinutes: derived ?? f.durationMinutes,
                    }));
                  }}
                  placeholder="17:30"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">שעת סיום (HH:MM)</label>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={editForm.endTime}
                  onChange={(e) => {
                    const endTime = e.target.value;
                    const derived = computeDurationFromTimes(editForm.startTime, endTime);
                    setEditForm(f => ({
                      ...f,
                      endTime,
                      durationMinutes: derived ?? f.durationMinutes,
                    }));
                  }}
                  placeholder="18:05"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">דקות</label>
              <input
                type="number"
                min={1}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={editForm.durationMinutes}
                onChange={(e) => setEditForm(f => ({ ...f, durationMinutes: Number(e.target.value) }))}
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSavingEdit}>בטל</AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveEdit} disabled={isSavingEdit}>
              {isSavingEdit ? 'שומר…' : 'שמור'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!sessionToDelete} onOpenChange={() => setSessionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת אימון</AlertDialogTitle>
            <AlertDialogDescription>
              האם את בטוחה שברצונך למחוק את האימון? פעולה זו אינה ניתנת לשחזור.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>בטל</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => sessionToDelete && handleDeleteSession(sessionToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default PracticeHistory;
