import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, ChevronLeft, Check, X, Plus, Edit, Trash2, Undo2, Clock, Download, AlertTriangle } from 'lucide-react';
import { NumberStepper } from '@/components/ui/number-stepper';
import { getStudents, getLessons, addLesson, updateLesson, deleteLesson, getActiveScheduleTemplate, getPerformances, getHolidays, addHoliday, deleteHoliday, isHoliday } from '@/lib/storage';
import { Student, Lesson, Performance } from '@/lib/types';
import { toast } from '@/hooks/use-toast';
import { syncManager } from '@/lib/syncManager';
import { useDateMode } from '@/contexts/DateModeContext';

type ViewMode = 'week' | 'day' | 'year' | 'student';

interface LessonWithStudent extends Lesson {
  student?: Student;
  lessonNumber?: number;
}

const LessonJournal = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [performances, setPerformances] = useState<Performance[]>([]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const { formatDate, dateMode } = useDateMode();
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const fmtDate = (d: Date, opts?: Intl.DateTimeFormatOptions) => {
    const locale = dateMode === 'hebrew' ? 'he-IL-u-ca-hebrew' : 'he-IL';
    return d.toLocaleDateString(locale, opts);
  };


  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showBankTimeDialog, setShowBankTimeDialog] = useState(false);
  const [showEditTimeDialog, setShowEditTimeDialog] = useState(false);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [draggedLesson, setDraggedLesson] = useState<Lesson | null>(null);
  const [undoStack, setUndoStack] = useState<Array<{ action: string; data: any }>>([]);
  const [editedTime, setEditedTime] = useState<string>('');
  const [bankTimeChange, setBankTimeChange] = useState<number>(0);
  const [markAsNoShow, setMarkAsNoShow] = useState(false);

  // Form states for adding lesson
  const [newLessonStudent, setNewLessonStudent] = useState('');
  const [newLessonDate, setNewLessonDate] = useState('');
  const [newLessonTime, setNewLessonTime] = useState('');
  const [customStudentName, setCustomStudentName] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setStudents(getStudents());
    setLessons(getLessons());
    setPerformances(getPerformances());
    setHolidays(getHolidays().map(h => h.date));
  };

  const getWeekDates = (date: Date): Date[] => {
    const week: Date[] = [];
    const startOfWeek = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - day);

    for (let i = 0; i < 6; i++) {
      const weekDay = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + i);
      week.push(weekDay);
    }
    return week;
  };

  const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי/מוצ"ש'];

  const isWeekInPast = (weekDate: Date): boolean => {
    const now = new Date();
    const weekEnd = new Date(weekDate);
    weekEnd.setDate(weekEnd.getDate() + 6);
    return weekEnd < now;
  };

  const handlePrevWeek = () => {
    const prevWeek = new Date(currentWeek.getFullYear(), currentWeek.getMonth(), currentWeek.getDate() - 7);
    setCurrentWeek(prevWeek);
  };

  const handleNextWeek = () => {
    const nextWeek = new Date(currentWeek.getFullYear(), currentWeek.getMonth(), currentWeek.getDate() + 7);
    setCurrentWeek(nextWeek);
  };

  const getLessonsForDate = (date: Date): LessonWithStudent[] => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    // אם זה יום חופשה - אל תראה שיעורים
    if (isHoliday(dateStr)) {
      return [];
    }
    
    // Get template lessons
    const activeTemplate = getActiveScheduleTemplate();
    const templateLessons: LessonWithStudent[] = [];
    
    if (activeTemplate) {
      const dayOfWeek = date.getDay();
      const dayKey = dayOfWeek.toString();
      const daySchedule = activeTemplate.schedule[dayKey] || {};
      
      Object.entries(daySchedule).forEach(([time, data]) => {
        const student = students.find(s => s.id === data.studentId);
        if (!student) return;
        
        // Check if lesson date is within student's active period
        const lessonDate = new Date(dateStr);
        const studentStartDate = new Date(student.startDate);
        
        // Don't show lessons before student's start date
        if (lessonDate < studentStartDate) {
          return;
        }
        
        // Calculate end date: use student's endDate or end of school year
        const getEndOfSchoolYear = (startDate: string): Date => {
          const start = new Date(startDate);
          const year = start.getFullYear();
          const month = start.getMonth(); // 0-11
          
          // If start is September or later (month >= 8), end is August 31 of next year
          // Otherwise, end is August 31 of same year
          const endYear = month >= 8 ? year + 1 : year;
          return new Date(`${endYear}-08-31`);
        };
        
        const effectiveEndDate = student.endDate 
          ? new Date(student.endDate)
          : getEndOfSchoolYear(student.startDate);
        
        // Don't show lessons after the effective end date
        if (lessonDate > effectiveEndDate) {
          return;
        }
        
        const existingLesson = lessons.find(
          l => l.date === dateStr && l.startTime === time && l.studentId === data.studentId
        );
        
        // Don't show template lesson if it was cancelled
        if (existingLesson && existingLesson.status === 'cancelled') {
          return;
        }
        
        if (!existingLesson) {
          const endTime = calculateEndTime(time, 30);
          
          templateLessons.push({
            id: `template-${dateStr}-${time}-${data.studentId}`,
            studentId: data.studentId,
            date: dateStr,
            startTime: time,
            endTime,
            status: 'scheduled',
            isFromTemplate: true,
            student
          });
        }
      });
    }
    
    // Get actual lessons (hide cancelled ones completely)
    const actualLessons: LessonWithStudent[] = lessons
      .filter(l => l.date === dateStr && l.status !== 'cancelled')
      .map(l => ({
        ...l,
        student: students.find(s => s.id === l.studentId)
      }));
    
    // Combine and calculate lesson numbers
    const allLessons = [...templateLessons, ...actualLessons];
    
    return allLessons.map(lesson => {
      if (lesson.status === 'completed' && lesson.student) {
        const lessonNumber = calculateLessonNumber(lesson.student, lesson.date, lesson.id);
        return { ...lesson, lessonNumber };
      }
      return lesson;
    }).sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  const getPerformancesForDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    return performances.filter(p => p.date === dateStr);
  };

  const checkTimeCollision = (date: Date) => {
    const dayLessons = getLessonsForDate(date);
    const dayPerformances = getPerformancesForDate(date);
    
    if (dayPerformances.length === 0) return false;
    
    for (const perf of dayPerformances) {
      if (!perf.timeEstimate || perf.timeEstimate.includes(':') === false) continue;
      
      for (const lesson of dayLessons) {
        const lessonStart = lesson.startTime;
        const perfTime = perf.timeEstimate;
        
        if (lessonStart === perfTime) return true;
      }
    }
    
    return false;
  };

  const checkLessonCollision = (lesson: LessonWithStudent, date: Date): boolean => {
    const dayPerformances = getPerformancesForDate(date);
    
    if (dayPerformances.length === 0) return false;
    
    for (const perf of dayPerformances) {
      if (!perf.timeEstimate || perf.timeEstimate.includes(':') === false) continue;
      
      if (lesson.startTime === perf.timeEstimate) {
        return true;
      }
    }
    
    return false;
  };

  const calculateEndTime = (startTime: string, duration: number): string => {
    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + duration;
    const newHours = Math.floor(totalMinutes / 60);
    const newMinutes = totalMinutes % 60;
    return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
  };

  const calculateLessonNumber = (student: Student, lessonDate: string, lessonId?: string): number => {
    const startDate = new Date(student.startDate);
    const checkDate = new Date(lessonDate);
    
    if (checkDate < startDate) return 0;

    const completedLessons = lessons
      .filter(l => l.studentId === student.id && l.status === 'completed' && new Date(l.date) <= checkDate)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (lessonId) {
      const index = completedLessons.findIndex(l => l.id === lessonId);
      return index >= 0 ? index + (student.startingLessonNumber || 1) : 0;
    }

    return completedLessons.length + (student.startingLessonNumber || 1);
  };

  const handleMarkCompleted = (lesson: LessonWithStudent) => {
    if (lesson.isFromTemplate) {
      // Create actual lesson from template
      const endTime = calculateEndTime(lesson.startTime, 30);
      addLesson({
        studentId: lesson.studentId,
        date: lesson.date,
        startTime: lesson.startTime,
        endTime,
        status: 'completed',
        isOneOff: false
      });
    } else {
      updateLesson(lesson.id, { status: 'completed' });
    }
    
    loadData();
    toast({ description: 'השיעור סומן כהתקיים' });
  };

  const handleDeleteLesson = async (lesson: LessonWithStudent, e?: React.MouseEvent) => {
    e?.stopPropagation();
    
    const studentName = lesson.student ? `${lesson.student.firstName} ${lesson.student.lastName}` : 'לא ידוע';
    
    if (lesson.isFromTemplate) {
      // Create a deleted marker for template lessons
      const deletedLesson = {
        studentId: lesson.studentId,
        date: lesson.date,
        startTime: lesson.startTime,
        endTime: lesson.endTime,
        status: 'cancelled' as const,
        isOneOff: false,
        notes: 'שיעור מהמערכת שנמחק'
      };
      addLesson(deletedLesson);
      loadData();
      toast({ description: 'השיעור נמחק לצמיתות' });
    } else {
      const lessonData = lessons.find(l => l.id === lesson.id);
      setUndoStack([...undoStack, { action: 'delete', data: lessonData }]);
      
      // Use deleteLesson which now uses onDestructiveChange internally
      const deleted = await deleteLesson(lesson.id);
      
      if (deleted) {
        loadData();
        toast({ description: 'השיעור נמחק ונשמר בדרופבוקס' });
      } else {
        toast({ 
          title: 'שגיאה',
          description: 'לא הצלחנו למחוק את השיעור',
          variant: 'destructive'
        });
      }
    }
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    
    const lastAction = undoStack[undoStack.length - 1];
    
    if (lastAction.action === 'delete') {
      addLesson(lastAction.data);
    } else if (lastAction.action === 'update') {
      updateLesson(lastAction.data.id, lastAction.data);
    }
    
    setUndoStack(undoStack.slice(0, -1));
    loadData();
    toast({ description: 'הפעולה בוטלה' });
  };

  const handleExportJSON = () => {
    const data = {
      students,
      lessons,
      exportDate: new Date().toISOString(),
      exportType: 'lesson-journal'
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `יומן-שיעורים-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ description: 'הקובץ הורד בהצלחה' });
  };

  const handleDragStart = (lesson: LessonWithStudent) => {
    if (lesson.status === 'completed') return;
    setDraggedLesson(lesson as Lesson);
  };

  const handleDrop = (date: Date) => {
    if (!draggedLesson) return;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const newDateStr = `${year}-${month}-${day}`;

    if (draggedLesson.isFromTemplate) {
      // STEP 1 – Cancel original template
      addLesson({
        studentId: draggedLesson.studentId,
        date: draggedLesson.date,
        startTime: draggedLesson.startTime,
        endTime: draggedLesson.endTime || calculateEndTime(draggedLesson.startTime, 30),
        status: 'cancelled',
        isOneOff: false,
        notes: 'שיעור מהמערכת שבוטל עקב גרירה'
      });

      // STEP 2 – Create scheduled lesson in the new date
      const endTime = calculateEndTime(draggedLesson.startTime, 30);
      addLesson({
        studentId: draggedLesson.studentId,
        date: newDateStr,
        startTime: draggedLesson.startTime,
        endTime,
        status: 'scheduled',
        isOneOff: true,
        notes: `שיעור הועבר מ־${draggedLesson.date}`
      });

    } else {
      updateLesson(draggedLesson.id, { 
        date: newDateStr,
        notes: `שיעור הועבר מ-${draggedLesson.date}`
      });
    }

    setDraggedLesson(null);
    loadData();
    toast({ description: 'השיעור הועבר בהצלחה' });
  };

  const handleOpenBankTime = (lesson: LessonWithStudent, e: React.MouseEvent) => {
    e.stopPropagation();
    if (lesson.status !== 'completed') return;
    setEditingLesson(lesson as Lesson);
    setBankTimeChange(0);
    setMarkAsNoShow(false);
    setShowBankTimeDialog(true);
  };

  const handleLessonDoubleClick = (lesson: LessonWithStudent, e: React.MouseEvent) => {
    e.stopPropagation();
    if (lesson.status === 'completed') {
      handleOpenBankTime(lesson, e);
    } else if (!lesson.isFromTemplate) {
      // Edit time for non-completed, non-template lessons
      setEditingLesson(lesson as Lesson);
      setEditedTime(lesson.startTime);
      setShowEditTimeDialog(true);
    }
  };

  const handleDayDoubleClick = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    setNewLessonDate(dateStr);
    setShowAddDialog(true);
  };

  const handleSaveBankTime = async () => {
    if (!editingLesson) return;
    
    const lesson = lessons.find(l => l.id === editingLesson.id);
    
    // אם סימנו "תלמידה נעדרה"
    if (markAsNoShow) {
      setUndoStack([...undoStack, { action: 'update', data: lesson }]);
      const currentNotes = editingLesson.notes || '';
      updateLesson(editingLesson.id, {
        notes: currentNotes ? `${currentNotes}\n⚠️ תלמידה נעדרה` : '⚠️ תלמידה נעדרה'
      });
      
      toast({ description: 'השיעור נשאר כהתקיים + סומנה נעדרות' });
    }
    // אם מפחיתים בדיוק 30 דקות - מוחקים את השיעור לגמרי
    else if (bankTimeChange === -30) {
      setUndoStack([...undoStack, { action: 'delete', data: lesson }]);
      deleteLesson(editingLesson.id);
      
      toast({ description: 'השיעור נמחק לצמיתות (כולל המיספור)' });
    } 
    // עדכון בנק זמן רגיל
    else {
      setUndoStack([...undoStack, { action: 'update', data: lesson }]);
      const currentNotes = editingLesson.notes || '';
      const newNote = `בנק זמן: ${bankTimeChange > 0 ? '+' : ''}${bankTimeChange} דקות`;
      
      updateLesson(editingLesson.id, {
        notes: currentNotes ? `${currentNotes}\n${newNote}` : newNote
      });
      
      toast({ description: 'בנק הזמן עודכן' });
    }
    
    setShowBankTimeDialog(false);
    setMarkAsNoShow(false);
    loadData();
  };


  const handleSaveEditedTime = async () => {
    if (!editingLesson || !editedTime) return;

    const lesson = lessons.find(l => l.id === editingLesson.id);
    const student = students.find(s => s.id === editingLesson.studentId);
    const studentName = student ? `${student.firstName} ${student.lastName}` : 'לא ידוע';
    
    setUndoStack([...undoStack, { action: 'update', data: lesson }]);

    const endTime = calculateEndTime(editedTime, 30);
    updateLesson(editingLesson.id, {
      startTime: editedTime,
      endTime
    });

    setShowEditTimeDialog(false);
    loadData();
    toast({ description: 'שעת השיעור עודכנה' });
  };

  const handleAddLesson = () => {
    // Check if either student or custom name is provided
    if ((!newLessonStudent && !customStudentName) || !newLessonDate || !newLessonTime) {
      toast({
        title: 'שגיאה',
        description: 'יש למלא את כל השדות',
        variant: 'destructive'
      });
      return;
    }

    const endTime = calculateEndTime(newLessonTime, 30);
    
    // If using custom name, add it to notes
    const lessonData: any = {
      studentId: newLessonStudent || 'one-time-student',
      date: newLessonDate,
      startTime: newLessonTime,
      endTime,
      status: 'scheduled',
      isOneOff: true
    };
    
    if (customStudentName) {
      lessonData.notes = `תלמידה חד פעמית: ${customStudentName}`;
    }
    
    addLesson(lessonData);

    setShowAddDialog(false);
    setNewLessonStudent('');
    setNewLessonDate('');
    setNewLessonTime('');
    setCustomStudentName('');
    loadData();
    toast({ description: 'השיעור נוסף' });
  };

  const getBankTimeFromNotes = (notes?: string): number => {
    if (!notes) return 0;
    const matches = notes.match(/בנק זמן: ([+-]?\d+)/g);
    if (!matches) return 0;
    
    return matches.reduce((sum, match) => {
      const value = parseInt(match.match(/([+-]?\d+)/)?.[1] || '0');
      return sum + value;
    }, 0);
  };

  const handleToggleHoliday = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    if (isHoliday(dateStr)) {
      deleteHoliday(dateStr);
      toast({ description: 'היום חזר לפעילות' });
    } else {
      addHoliday(dateStr);
      toast({ description: 'היום סומן כחופשה' });
    }
    loadData();
  };

  const hasLessonsOnDate = (date: Date): boolean => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    // Check if there's an active template
    const activeTemplate = getActiveScheduleTemplate();
    if (!activeTemplate) return false;
    
    const dayOfWeek = date.getDay();
    const dayKey = dayOfWeek.toString();
    const daySchedule = activeTemplate.schedule[dayKey] || {};
    
    // If there are any scheduled lessons for this day
    return Object.keys(daySchedule).length > 0;
  };

  const weekDates = getWeekDates(currentWeek);
  const isCurrentWeekPast = isWeekInPast(currentWeek);

  return (
    <div className="space-y-6">
      <Card className="card-gradient card-shadow">
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-4">
            <CardTitle className="text-2xl">יומן שיעורים</CardTitle>
            
            <div className="flex gap-2 flex-wrap">
              <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">תצוגה שבועית</SelectItem>
                  <SelectItem value="day">תצוגה יומית</SelectItem>
                  <SelectItem value="year">תצוגה שנתית</SelectItem>
                  <SelectItem value="student">לפי תלמידה</SelectItem>
                </SelectContent>
              </Select>

              {viewMode === 'student' && (
                <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="בחרי תלמידה" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map(student => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.firstName} {student.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={handleUndo}
                disabled={undoStack.length === 0}
              >
                <Undo2 className="h-4 w-4 mr-2" />
                ביטול פעולה
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleExportJSON}
              >
                <Download className="h-4 w-4 mr-2" />
                שמירה
              </Button>

              <Button onClick={() => setShowAddDialog(true)} className="hero-gradient">
                <Plus className="h-4 w-4 mr-2" />
                הוסף שיעור
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {viewMode === 'week' && (
            <>
              {/* Week Navigation */}
              <div className="flex justify-between items-center mb-6">
                <Button onClick={handlePrevWeek} variant="outline" size="sm">
                  <ChevronRight className="h-4 w-4 ml-2" />
                  שבוע קודם
                </Button>
                <h3 className="text-lg font-semibold">
                  {fmtDate(weekDates[0])} - {fmtDate(weekDates[5])}
                </h3>
                <Button onClick={handleNextWeek} variant="outline" size="sm">
                  שבוע הבא
                  <ChevronLeft className="h-4 w-4 mr-2" />
                </Button>
              </div>

              {/* Weekly Grid */}
              <div className={`grid grid-cols-6 gap-3 ${isCurrentWeekPast ? 'bg-yellow-50/50 p-4 rounded-lg' : ''}`}>
                {weekDates.map((date, index) => {
                  const dayLessons = getLessonsForDate(date);
                  const dayPerformances = getPerformancesForDate(date);
                  const hasCollision = checkTimeCollision(date);
                  const today = new Date();
                  const isToday = date.getDate() === today.getDate() && 
                                  date.getMonth() === today.getMonth() && 
                                  date.getFullYear() === today.getFullYear();
                  
                  const year = date.getFullYear();
                  const month = String(date.getMonth() + 1).padStart(2, '0');
                  const day = String(date.getDate()).padStart(2, '0');
                  const dateStr = `${year}-${month}-${day}`;
                  const isDayHoliday = isHoliday(dateStr);
                  
                  return (
                    <div
                      key={index}
                      className={`border rounded-lg p-3 min-h-[200px] ${
                        isToday ? 'border-primary border-2' : 'border-border'
                      } ${isDayHoliday ? 'bg-gray-100' : ''}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDrop(date)}
                      onDoubleClick={() => handleDayDoubleClick(date)}
                    >
                      <div className="text-center mb-3 pb-2 border-b">
                        <div className="font-semibold text-sm flex items-center justify-center gap-1">
                          {dayNames[index]}
                          {hasCollision && <AlertTriangle className="h-3 w-3 text-destructive" />}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {fmtDate(date, { day: 'numeric', month: 'numeric' })}
                        </div>
                        {isDayHoliday && (
                          <Badge variant="outline" className="text-[10px] mt-1 bg-red-100 text-red-700">
                            חופשה
                          </Badge>
                        )}
                      </div>

                      {isDayHoliday ? (
                        <div className="text-center text-muted-foreground text-sm py-4">
                          🏖️ יום חופשה
                        </div>
                      ) : (
                        <div className="space-y-2">
                        {dayPerformances.map((perf) => (
                          <div
                            key={perf.id}
                            className="p-2 rounded text-xs bg-purple-100 border border-purple-300"
                          >
                            <div className="flex justify-between items-start mb-1">
                              <div className="font-medium text-purple-900">
                                {perf.timeEstimate || 'ללא שעה'}
                              </div>
                            </div>
                            <div className="font-medium text-purple-900 mb-1">
                              🎵 {perf.name}
                            </div>
                            <Badge variant="outline" className="text-[10px] bg-purple-200 text-purple-900">
                              {perf.status === 'open' ? 'פתוחה' : 'סגורה'}
                            </Badge>
                          </div>
                        ))}
                        {dayLessons
                          .filter(lesson => lesson.status !== 'cancelled')
                          .map((lesson) => {
                          const bankTime = getBankTimeFromNotes(lesson.notes);
                          const hasCollision = checkLessonCollision(lesson, date);
                          
                          return (
                            <div
                              key={lesson.id}
                              draggable={lesson.status !== 'completed'}
                              onDragStart={() => handleDragStart(lesson)}
                              onDoubleClick={(e) => handleLessonDoubleClick(lesson, e)}
                              className={`p-2 rounded text-xs ${
                                lesson.status === 'completed'
                                  ? 'bg-[#8B2942]/10 border border-[#8B2942]/30 cursor-pointer'
                                  : lesson.isFromTemplate
                                  ? 'bg-blue-50 border border-blue-200 cursor-move text-black'
                                  : 'bg-secondary/30 border border-border cursor-pointer text-black'
                              } ${hasCollision ? 'ring-2 ring-destructive' : ''}`}
                            >
                              <div className="flex justify-between items-start mb-1">
                                <div className="font-medium flex items-center gap-1">
                                  {lesson.startTime}
                                  {hasCollision && <AlertTriangle className="h-3 w-3 text-destructive" />}
                                </div>
                                {lesson.status !== 'completed' && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-4 w-4 p-0"
                                    onClick={(e) => handleDeleteLesson(lesson, e)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                              
                              <div className="font-medium mb-1">
                                {lesson.student
                                  ? `${lesson.student.firstName} ${lesson.student.lastName}`
                                  : 'לא ידוע'}
                              </div>

                              {hasCollision && (
                                <div className="text-[10px] text-destructive font-medium mb-1">
                                  ⚠️ התנגשות עם הופעה
                                </div>
                              )}

                              {lesson.lessonNumber && (
                                <Badge variant="outline" className="text-[10px] mb-1">
                                  שיעור #{lesson.lessonNumber}
                                </Badge>
                              )}

                              {lesson.isSwapped && (
                                <Badge className="bg-red-600 text-white text-[10px] mb-1">
                                  הוחלף
                                </Badge>
                              )}

                              {bankTime !== 0 && (
                                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {bankTime > 0 ? '+' : ''}{bankTime} דק'
                                </div>
                              )}

                              {lesson.status !== 'completed' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="w-full mt-2 h-6 text-xs"
                                  onClick={() => handleMarkCompleted(lesson)}
                                >
                                  <Check className="h-3 w-3 mr-1" />
                                  סמן כהתקיים
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {viewMode === 'day' && (
            <DayView
              selectedDay={selectedDay || new Date()}
              setSelectedDay={setSelectedDay}
              getLessonsForDate={getLessonsForDate}
              getPerformancesForDate={getPerformancesForDate}
              isHoliday={isHoliday}
              handleMarkCompleted={handleMarkCompleted}
              handleDeleteLesson={handleDeleteLesson}
              handleLessonDoubleClick={handleLessonDoubleClick}
              getBankTimeFromNotes={getBankTimeFromNotes}
              checkLessonCollision={checkLessonCollision}
            />
          )}

          {viewMode === 'year' && (
            <YearView
              year={currentYear}
              onYearChange={setCurrentYear}
              holidays={holidays}
              onToggleHoliday={handleToggleHoliday}
              hasLessonsOnDate={hasLessonsOnDate}
            />
          )}

          {viewMode === 'student' && selectedStudent && (
            <StudentLessonView
              studentId={selectedStudent}
              students={students}
              lessons={lessons}
              calculateLessonNumber={calculateLessonNumber}
              getBankTimeFromNotes={getBankTimeFromNotes}
            />
          )}
        </CardContent>
      </Card>

      {/* Add Lesson Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>הוספת שיעור חד פעמי</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>תלמידה רשומה</Label>
              <Select 
                value={newLessonStudent} 
                onValueChange={(value) => {
                  setNewLessonStudent(value);
                  setCustomStudentName(''); // Clear custom name when selecting from list
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="בחרי תלמידה מהרשימה" />
                </SelectTrigger>
                <SelectContent>
                  {students.map(student => (
                    <SelectItem key={student.id} value={student.id}>
                      {student.firstName} {student.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="text-center text-sm text-muted-foreground">או</div>

            <div>
              <Label>תלמידה חד פעמית (הזנה ידנית)</Label>
              <Input
                type="text"
                value={customStudentName}
                onChange={(e) => {
                  setCustomStudentName(e.target.value);
                  setNewLessonStudent(''); // Clear selected student when typing custom name
                }}
                placeholder="שם התלמידה"
              />
            </div>

            <div>
              <Label>תאריך *</Label>
              <Input
                type="date"
                value={newLessonDate}
                onChange={(e) => setNewLessonDate(e.target.value)}
              />
            </div>

            <div>
              <Label>שעה *</Label>
              <Input
                type="time"
                value={newLessonTime}
                onChange={(e) => setNewLessonTime(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                ביטול
              </Button>
              <Button onClick={handleAddLesson} className="hero-gradient">
                הוסף
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bank Time Dialog */}
      <Dialog open={showBankTimeDialog} onOpenChange={setShowBankTimeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>עריכת בנק זמן</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Checkbox לסימון נעדרות */}
            <div className="flex items-center space-x-2 space-x-reverse">
              <Checkbox
                id="noShow"
                checked={markAsNoShow}
                onCheckedChange={(checked) => setMarkAsNoShow(checked === true)}
              />
              <Label htmlFor="noShow" className="cursor-pointer">
                התלמידה לא הגיעה לשיעור
              </Label>
            </div>
            
            <div>
              <Label>שינוי בדקות (+ הוספה / − הפחתה)</Label>
              <NumberStepper
                value={bankTimeChange}
                onValueChange={(n) => setBankTimeChange(n)}
                step={5}
                allowNegative
                disabled={markAsNoShow}
                placeholder="לדוגמה: 15 או -10"
                unit="דק׳"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowBankTimeDialog(false)}>
                ביטול
              </Button>
              <Button onClick={handleSaveBankTime} className="hero-gradient">
                שמור
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Time Dialog */}
      <Dialog open={showEditTimeDialog} onOpenChange={setShowEditTimeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>עריכת שעת שיעור</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>שעת התחלה</Label>
              <Input
                type="time"
                value={editedTime}
                onChange={(e) => setEditedTime(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowEditTimeDialog(false)}>
                ביטול
              </Button>
              <Button onClick={handleSaveEditedTime} className="hero-gradient">
                שמור
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Component for student view
const StudentLessonView = ({
  studentId,
  students,
  lessons,
  calculateLessonNumber,
  getBankTimeFromNotes
}: {
  studentId: string;
  students: Student[];
  lessons: Lesson[];
  calculateLessonNumber: (student: Student, date: string, id?: string) => number;
  getBankTimeFromNotes: (notes?: string) => number;
}) => {
  const student = students.find(s => s.id === studentId);
  if (!student) return null;

  const studentLessons = lessons
    .filter(l => l.studentId === studentId && l.status === 'completed')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(l => ({
      ...l,
      lessonNumber: calculateLessonNumber(student, l.date, l.id),
      bankTime: getBankTimeFromNotes(l.notes)
    }));

  const totalBankTime = studentLessons.reduce((sum, l) => sum + l.bankTime, 0);
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">
        {student.firstName} {student.lastName}
      </h3>

      <div className="space-y-2">
        {studentLessons.map(lesson => {
          const isFuture = lesson.date > today;
          
          return (
            <div
              key={lesson.id}
              className={`p-3 rounded border ${
                isFuture
                  ? 'bg-gray-100 text-gray-400 border-gray-300'
                  : lesson.status === 'completed'
                  ? 'bg-[#8B2942]/10 border-[#8B2942]/30'
                  : 'bg-secondary/20 border-border'
              }`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-medium">
                    {formatDate(lesson.date)} - {lesson.startTime}
                  </div>
                  {lesson.lessonNumber > 0 && (
                    <div className="text-sm">שיעור #{lesson.lessonNumber}</div>
                  )}
                  {lesson.bankTime !== 0 && (
                    <div className="text-sm text-muted-foreground">
                      בנק זמן: {lesson.bankTime > 0 ? '+' : ''}{lesson.bankTime} דקות
                    </div>
                  )}
                </div>
                {lesson.status === 'completed' && (
                  <Badge variant="outline" className="bg-[#8B2942]/10">
                    הושלם
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-4 bg-secondary/20 rounded-lg">
        <div className="font-semibold">סיכום בנק זמן: {totalBankTime > 0 ? '+' : ''}{totalBankTime} דקות</div>
      </div>
    </div>
  );
};

// Component for Day View
const DayView = ({
  selectedDay,
  setSelectedDay,
  getLessonsForDate,
  getPerformancesForDate,
  isHoliday,
  handleMarkCompleted,
  handleDeleteLesson,
  handleLessonDoubleClick,
  getBankTimeFromNotes,
  checkLessonCollision
}: any) => {
  const [currentDate, setCurrentDate] = useState(selectedDay || new Date());
  
  const dayLessons = getLessonsForDate(currentDate);
  const dayPerformances = getPerformancesForDate(currentDate);
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, '0');
  const day = String(currentDate.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  const isDayHoliday = isHoliday(dateStr);

  const handlePrevDay = () => {
    const prevDay = new Date(currentDate);
    prevDay.setDate(prevDay.getDate() - 1);
    setCurrentDate(prevDay);
    setSelectedDay(prevDay);
  };

  const handleNextDay = () => {
    const nextDay = new Date(currentDate);
    nextDay.setDate(nextDay.getDate() + 1);
    setCurrentDate(nextDay);
    setSelectedDay(nextDay);
  };

  return (
    <div className="space-y-6">
      {/* Day Navigation */}
      <div className="flex justify-between items-center">
        <Button onClick={handlePrevDay} variant="outline" size="sm">
          <ChevronRight className="h-4 w-4 ml-2" />
          יום קודם
        </Button>
        <h3 className="text-lg font-semibold">
          {fmtDate(currentDate, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </h3>
        <Button onClick={handleNextDay} variant="outline" size="sm">
          יום הבא
          <ChevronLeft className="h-4 w-4 mr-2" />
        </Button>
      </div>

      {isDayHoliday && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
          <div className="text-2xl mb-2">🏖️</div>
          <div className="font-semibold text-red-700">יום חופשה</div>
        </div>
      )}

      {!isDayHoliday && (
        <div className="space-y-4">
          {dayPerformances.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">הופעות</h4>
              <div className="space-y-2">
                {dayPerformances.map((perf) => (
                  <div
                    key={perf.id}
                    className="p-4 rounded-lg bg-purple-100 border border-purple-300"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-medium text-purple-900 text-lg">
                        🎵 {perf.name}
                      </div>
                      <Badge variant="outline" className="bg-purple-200 text-purple-900">
                        {perf.status === 'open' ? 'פתוחה' : 'סגורה'}
                      </Badge>
                    </div>
                    <div className="text-sm text-purple-800">
                      שעה: {perf.timeEstimate || 'ללא שעה'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dayLessons.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">שיעורים</h4>
              <div className="space-y-2">
                {dayLessons.map((lesson) => {
                  const bankTime = getBankTimeFromNotes(lesson.notes);
                  const hasCollision = checkLessonCollision(lesson, currentDate);
                  
                  return (
                    <div
                      key={lesson.id}
                      onDoubleClick={(e) => handleLessonDoubleClick(lesson, e)}
                      className={`p-4 rounded-lg border ${
                        lesson.status === 'completed'
                          ? 'bg-[#8B2942]/10 border-[#8B2942]/30 cursor-pointer'
                          : lesson.isFromTemplate
                          ? 'bg-blue-50 border border-blue-200 text-black'
                          : 'bg-secondary/30 border border-border cursor-pointer text-black'
                      } ${hasCollision ? 'ring-2 ring-destructive' : ''}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-medium text-lg flex items-center gap-2">
                            {lesson.startTime}
                            {hasCollision && <AlertTriangle className="h-4 w-4 text-destructive" />}
                          </div>
                          <div className="font-medium">
                            {lesson.student
                              ? `${lesson.student.firstName} ${lesson.student.lastName}`
                              : 'לא ידוע'}
                          </div>
                        </div>
                        {lesson.status !== 'completed' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => handleDeleteLesson(lesson, e)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      {hasCollision && (
                        <div className="text-sm text-destructive font-medium mb-2">
                          ⚠️ התנגשות עם הופעה
                        </div>
                      )}

                      {lesson.lessonNumber && (
                        <Badge variant="outline" className="mb-2">
                          שיעור #{lesson.lessonNumber}
                        </Badge>
                      )}

                      {bankTime !== 0 && (
                        <div className="text-sm text-muted-foreground flex items-center gap-1 mb-2">
                          <Clock className="h-4 w-4" />
                          בנק זמן: {bankTime > 0 ? '+' : ''}{bankTime} דקות
                        </div>
                      )}

                      {lesson.status !== 'completed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full mt-2"
                          onClick={() => handleMarkCompleted(lesson)}
                        >
                          <Check className="h-4 w-4 mr-2" />
                          סמן כהתקיים
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {dayLessons.length === 0 && dayPerformances.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              אין שיעורים או הופעות ביום זה
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Component for Year View
const YearView = ({
  year,
  onYearChange,
  holidays,
  onToggleHoliday,
  hasLessonsOnDate
}: {
  year: number;
  onYearChange: (year: number) => void;
  holidays: string[];
  onToggleHoliday: (date: Date) => void;
  hasLessonsOnDate: (date: Date) => boolean;
}) => {
  const monthNames = [
    'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
  ];

  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month: number, year: number) => {
    return new Date(year, month, 1).getDay();
  };

  return (
    <div className="space-y-6">
      {/* Year Navigation */}
      <div className="flex justify-between items-center mb-6">
        <Button onClick={() => onYearChange(year - 1)} variant="outline" size="sm">
          <ChevronRight className="h-4 w-4 ml-2" />
          שנה קודמת
        </Button>
        <h3 className="text-2xl font-semibold">{year}</h3>
        <Button onClick={() => onYearChange(year + 1)} variant="outline" size="sm">
          שנה הבאה
          <ChevronLeft className="h-4 w-4 mr-2" />
        </Button>
      </div>

      {/* 12 Months Grid */}
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 12 }).map((_, monthIndex) => {
          const daysInMonth = getDaysInMonth(monthIndex, year);
          const firstDay = getFirstDayOfMonth(monthIndex, year);
          
          return (
            <div key={monthIndex} className="border rounded-lg p-3">
              <h4 className="text-center font-semibold mb-2 text-sm">{monthNames[monthIndex]}</h4>
              <div className="grid grid-cols-7 gap-1 text-xs">
                {/* Day headers */}
                {['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map((day, i) => (
                  <div key={i} className="text-center font-semibold text-muted-foreground p-1">
                    {day}
                  </div>
                ))}
                
                {/* Empty cells for days before month starts */}
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="p-1"></div>
                ))}
                
                {/* Days of the month */}
                {Array.from({ length: daysInMonth }).map((_, dayIndex) => {
                  const day = dayIndex + 1;
                  const date = new Date(year, monthIndex, day);
                  const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isHoliday = holidays.includes(dateStr);
                  const hasLessons = hasLessonsOnDate(date);
                  const isToday = 
                    new Date().getDate() === day &&
                    new Date().getMonth() === monthIndex &&
                    new Date().getFullYear() === year;
                  
                  return (
                    <div
                      key={day}
                      onClick={() => onToggleHoliday(date)}
                      className={`p-1 text-center rounded cursor-pointer transition-colors ${
                        isHoliday
                          ? 'bg-red-200 text-red-800 font-bold'
                          : hasLessons
                          ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                          : 'hover:bg-gray-100'
                      } ${isToday ? 'ring-2 ring-primary' : ''}`}
                      title={isHoliday ? 'חופשה - לחץ להסרה' : hasLessons ? 'יש שיעורים - לחץ לסימון חופשה' : 'לחץ לסימון חופשה'}
                    >
                      {day}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-4 justify-center text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-100 border border-blue-200 rounded"></div>
          <span>יש שיעורים</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-200 border border-red-300 rounded"></div>
          <span>חופשה</span>
        </div>
      </div>
    </div>
  );
};

export default LessonJournal;
