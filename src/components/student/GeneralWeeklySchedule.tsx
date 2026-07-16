import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, ArrowRight, ArrowLeft, CalendarOff } from 'lucide-react';
import { getStudents, getHolidays } from '@/lib/storage';
import { hybridSync } from '@/lib/hybridSync';
import { Holiday, Lesson, Student } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import StudentsSwapRequestDialog from '@/components/students/StudentsSwapRequestDialog';
import { isFutureLesson } from '@/lib/lessonSwap/logic';

interface GeneralWeeklyScheduleProps {
  studentId?: string;
  lessons: Lesson[];
  onLessonDoubleClick?: (lesson: Lesson) => void;
  isSelectionActive?: boolean;
  currentSwapStep?: 1 | 2 | 3 | 4;
}

const dateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const GeneralWeeklySchedule: React.FC<GeneralWeeklyScheduleProps> = ({ studentId, lessons, onLessonDoubleClick, isSelectionActive, currentSwapStep = 1 }) => {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [students, setStudents] = useState<Student[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [selectedLessonForSwap, setSelectedLessonForSwap] = useState<Lesson | null>(null);
  const [detailsLesson, setDetailsLesson] = useState<Lesson | null>(null);

  const refreshSharedScheduleData = useCallback(() => {
    setStudents(getStudents());
    setHolidays(getHolidays());
  }, []);

  useEffect(() => {
    refreshSharedScheduleData();
  }, [lessons, refreshSharedScheduleData]);

  useEffect(() => {
    let lastSeenCloudSync: string | null = null;
    return hybridSync.subscribeSyncState((state) => {
      if (!state.lastCloudSyncAt || state.lastCloudSyncAt === lastSeenCloudSync) return;
      lastSeenCloudSync = state.lastCloudSyncAt;
      refreshSharedScheduleData();
    });
  }, [refreshSharedScheduleData]);

  const getWeekDates = (date: Date) => {
    const week = [];
    const startOfWeek = new Date(date);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day;
    startOfWeek.setDate(diff);

    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      week.push(day);
    }
    return week;
  };

  const weekDates = getWeekDates(currentWeek);
  const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'מוצאי שבת'];

  const getHolidayForDate = (date: Date): Holiday | undefined => {
    const key = dateKey(date);
    return holidays.find(holiday => holiday.date === key);
  };

  const getLessonsForDay = (date: Date): Lesson[] => {
    const dateStr = dateKey(date);

    // Holidays are the same shared records used by the admin journal.
    // Never display or allow swapping lessons on a date marked as a holiday.
    if (holidays.some(holiday => holiday.date === dateStr)) return [];

    return lessons
      .filter(lesson => lesson.date === dateStr && lesson.status !== 'cancelled')
      .filter(lesson => students.some(student => student.id === lesson.studentId))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  const getStudentDetails = (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    return student ? {
      name: `${student.firstName} ${student.lastName}`,
      phone: student.phone,
      email: student.email
    } : null;
  };

  const handlePrevWeek = () => {
    const prevWeek = new Date(currentWeek);
    prevWeek.setDate(currentWeek.getDate() - 7);
    setCurrentWeek(prevWeek);
  };

  const handleNextWeek = () => {
    const nextWeek = new Date(currentWeek);
    nextWeek.setDate(currentWeek.getDate() + 7);
    setCurrentWeek(nextWeek);
  };

  const isSwappedLesson = (lesson: Lesson) => {
    return lesson.isSwapped || lesson.notes?.includes('שיעור שהוחלף') || lesson.notes?.includes('החלפה');
  };

  const handleLessonClick = (lesson: Lesson) => {
    if (isSelectionActive && isFutureLesson(lesson)) {
      setSelectedLessonForSwap(lesson);
      if (onLessonDoubleClick) {
        onLessonDoubleClick(lesson);
      } else {
        setSelectedLesson(lesson);
        setSwapDialogOpen(true);
      }
      return;
    }
    setDetailsLesson(lesson);
  };

  return (
    <Card className="overflow-hidden border-[#C9A961]/45 bg-[#fffaf0]/95 shadow-xl dark:bg-[#140c0f]/95">
      <CardHeader className="border-b border-[#C9A961]/30 bg-gradient-to-l from-[#6B1F2A] to-[#8B2A37] text-white">
        <CardTitle className="text-2xl flex items-center gap-2">
          <Calendar className="h-6 w-6" />
          מערכת שיעורים שבועית
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-2">
          לחצי על שם תלמידה להצגת פרטי השיעור. בזמן בקשת החלפה, הלחיצה בוחרת שיעור.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex justify-between items-center mb-6">
          <Button onClick={handleNextWeek} variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 ml-2" />
            שבוע הבא
          </Button>
          <h3 className="text-lg font-semibold">
            {weekDates[0].toLocaleDateString('he-IL')} - {weekDates[6].toLocaleDateString('he-IL')}
          </h3>
          <Button onClick={handlePrevWeek} variant="outline" size="sm">
            שבוע קודם
            <ArrowRight className="h-4 w-4 mr-2" />
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7" dir="rtl">
          {weekDates.map((date, index) => {
            const holiday = getHolidayForDate(date);
            const dayLessons = holiday ? [] : getLessonsForDay(date);

            return (
              <div key={dateKey(date)} className="space-y-1">
                <div className={`text-center p-2 rounded-lg ${holiday ? 'bg-destructive/15 border border-destructive/40' : 'bg-secondary/50'}`}>
                  <div className="font-semibold text-sm">{dayNames[index]}</div>
                  <div className="text-xs text-muted-foreground">
                    {date.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}
                  </div>
                </div>

                <div className="space-y-1 min-h-[150px]">
                  {holiday ? (
                    <div className="min-h-[150px] rounded-lg border-2 border-destructive/50 bg-destructive/10 p-3 flex flex-col items-center justify-center text-center gap-2">
                      <CalendarOff className="h-7 w-7 text-destructive" />
                      <div className="font-bold text-destructive">חופשה — אין שיעורים</div>
                      {holiday.description && (
                        <div className="text-xs text-muted-foreground whitespace-pre-wrap">
                          {holiday.description}
                        </div>
                      )}
                    </div>
                  ) : (
                    dayLessons.map((lesson) => {
                      const studentDetails = getStudentDetails(lesson.studentId);
                      if (!studentDetails) return null;

                      const isFuture = isFutureLesson(lesson);
                      const isCompleted = lesson.status === 'completed';
                      const isSwapped = isSwappedLesson(lesson);
                      const isClickableForSelection =
                        isSelectionActive &&
                        isFuture &&
                        onLessonDoubleClick &&
                        (
                          (currentSwapStep === 2 && lesson.studentId === studentId) ||
                          (currentSwapStep === 3 && lesson.studentId !== studentId)
                        );
                      const isClickable = isFuture && onLessonDoubleClick;
                      const isSelected = selectedLessonForSwap?.id === lesson.id;

                      return (
                        <div
                          key={lesson.id}
                          className={`min-h-16 p-3 border rounded-xl text-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                            isSelected
                              ? 'bg-primary/20 border-primary border-4 shadow-lg ring-2 ring-primary ring-offset-2'
                              : isSwapped
                                ? 'bg-[#8B4513]/10 border-[#8B4513] text-[#8B4513]'
                                : isFuture
                                  ? 'bg-white/50 text-gray-700 border-gray-300'
                                  : isCompleted
                                    ? 'bg-[#FFD700]/10 border-[#FFD700] text-gray-900'
                                    : 'bg-white border-gray-400 text-black'
                          } cursor-pointer ${
                            isSelectionActive && isClickable
                              ? 'ring-2 ring-primary ring-offset-2 animate-pulse'
                              : ''
                          }`}
                          onClick={() => handleLessonClick(lesson)}
                          title={isSelectionActive ? 'לחצי לבחירת שיעור להחלפה' : 'לחצי להצגת הפרטים'}
                        >
                          <div className="space-y-2 text-center">
                            <div className="font-bold text-base text-[#6B1F2A] dark:text-[#FFE5A0]">{studentDetails.name}</div>
                            <div className="flex gap-1 flex-wrap mt-1">
                              {lesson.isSwapped && (
                                <Badge className="text-[10px] px-1.5 py-0.5 bg-red-600 text-white border-red-600">הוחלף</Badge>
                              )}
                              {isClickableForSelection && (
                                <Badge className="text-[10px] px-1.5 py-0.5 bg-blue-500 text-white animate-pulse">לחצי כאן</Badge>
                              )}
                              {isSelected && (
                                <Badge className="text-[10px] px-1.5 py-0.5 bg-primary text-white">✓ נבחר</Badge>
                              )}
                              {lesson.isOneOff && (
                                <Badge className="text-[10px] px-1.5 py-0.5 bg-[#FFD700] text-black border-[#FFD700]">חד פעמי</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>

      <StudentsSwapRequestDialog
        open={swapDialogOpen}
        onOpenChange={setSwapDialogOpen}
        selectedLesson={selectedLesson}
      />
      <Dialog open={Boolean(detailsLesson)} onOpenChange={open => !open && setDetailsLesson(null)}>
        <DialogContent dir="rtl" className="border-[#C9A961]/50">
          <DialogHeader><DialogTitle className="text-[#6B1F2A] dark:text-[#FFE5A0]">פרטי השיעור</DialogTitle></DialogHeader>
          {detailsLesson && (() => {
            const details = getStudentDetails(detailsLesson.studentId);
            return <div className="space-y-3 rounded-xl bg-[#C9A961]/10 p-4">
              <div className="text-xl font-bold">{details?.name}</div>
              <div><strong>תאריך:</strong> {new Date(`${detailsLesson.date}T12:00:00`).toLocaleDateString('he-IL')}</div>
              <div><strong>שעה:</strong> {detailsLesson.startTime}–{detailsLesson.endTime}</div>
              {details?.phone && <div><strong>טלפון:</strong> <a className="text-primary hover:underline" href={`tel:${details.phone}`}>{details.phone}</a></div>}
              {details?.email && <div><strong>מייל:</strong> <a className="text-primary hover:underline" href={`mailto:${details.email}`}>{details.email}</a></div>}
              {detailsLesson.notes && <div><strong>הערות:</strong> {detailsLesson.notes}</div>}
            </div>;
          })()}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default GeneralWeeklySchedule;
