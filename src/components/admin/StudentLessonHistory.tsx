import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/safe-ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/safe-ui/table';
import { Button } from '@/components/safe-ui/button';
import { Badge } from '@/components/safe-ui/badge';
import { Star, Trash2, Undo2 } from 'lucide-react';
import { getLessons, updateLesson } from '@/lib/storage';
import { Student, Lesson } from '@/lib/types';
import { toast } from '@/hooks/use-toast';
import { Textarea } from '@/components/safe-ui/textarea';
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
import LessonPracticeStats from './LessonPracticeStats';
import { getSchoolYearForDate, getSchoolYearLabel, getStudentSchoolYearRecords } from '@/lib/schoolYear';

interface StudentLessonHistoryProps {
  student: Student;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const StudentLessonHistory = ({ student, open, onOpenChange }: StudentLessonHistoryProps) => {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(getSchoolYearForDate());
  const [gradingLesson, setGradingLesson] = useState<string | null>(null);
  const [gradeNotes, setGradeNotes] = useState<string>('');
  const [previousGrade, setPreviousGrade] = useState<{ lessonId: string; grade?: number; gradeNotes?: string } | null>(null);
  const [deletingLesson, setDeletingLesson] = useState<string | null>(null);

  useEffect(() => {
    if (open && student) {
      const studentLessons = getLessons()
        .filter(lesson => lesson.studentId === student.id)
        .filter(lesson => lesson.status === 'completed')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      setLessons(studentLessons);
      setSelectedYear(getSchoolYearForDate());
    }
  }, [student?.id, open]);

  // Only completed lessons count as lessons received; closed-year snapshots stay untouched.
  const archivedYears = getStudentSchoolYearRecords(student.id).map(record => record.schoolYear);
  const years = [...new Set([getSchoolYearForDate(), ...archivedYears, ...lessons.map(lesson => getSchoolYearForDate(lesson.date))])]
    .sort((a, b) => b - a);
  const visibleLessons = selectedYear === 'all'
    ? lessons
    : lessons.filter(lesson => getSchoolYearForDate(lesson.date) === selectedYear);
  const yearLessonCount = (year: number) => lessons.filter(lesson => getSchoolYearForDate(lesson.date) === year).length;

  const handleGrade = (lessonId: string, grade: number) => {
    const lesson = lessons.find(l => l.id === lessonId);
    if (lesson) {
      // Save previous state for undo
      setPreviousGrade({
        lessonId,
        grade: lesson.grade,
        gradeNotes: lesson.gradeNotes
      });
      
      updateLesson(lessonId, { ...lesson, grade, gradeNotes });
      setLessons(prev => prev.map(l => l.id === lessonId ? { ...l, grade, gradeNotes } : l));
      setGradingLesson(null);
      setGradeNotes('');
      toast({
        title: 'הצלחה',
        description: `ציון ${grade}/5 נשמר בהצלחה`
      });
    }
  };

  const handleUndo = () => {
    if (previousGrade) {
      const lesson = lessons.find(l => l.id === previousGrade.lessonId);
      if (lesson) {
        updateLesson(previousGrade.lessonId, { 
          ...lesson, 
          grade: previousGrade.grade, 
          gradeNotes: previousGrade.gradeNotes 
        });
        setLessons(prev => prev.map(l => 
          l.id === previousGrade.lessonId 
            ? { ...l, grade: previousGrade.grade, gradeNotes: previousGrade.gradeNotes } 
            : l
        ));
        toast({
          title: 'בוטל',
          description: 'הפעולה האחרונה בוטלה בהצלחה'
        });
        setPreviousGrade(null);
      }
    }
  };

  const handleDeleteGrade = (lessonId: string) => {
    const lesson = lessons.find(l => l.id === lessonId);
    if (lesson) {
      // Save previous state for undo
      setPreviousGrade({
        lessonId,
        grade: lesson.grade,
        gradeNotes: lesson.gradeNotes
      });
      
      updateLesson(lessonId, { ...lesson, grade: undefined, gradeNotes: undefined });
      setLessons(prev => prev.map(l => l.id === lessonId ? { ...l, grade: undefined, gradeNotes: undefined } : l));
      setDeletingLesson(null);
      toast({
        title: 'נמחק',
        description: 'התיעוד נמחק בהצלחה'
      });
    }
  };

  const openGrading = (lessonId: string) => {
    const lesson = lessons.find(l => l.id === lessonId);
    setGradingLesson(lessonId);
    setGradeNotes(lesson?.gradeNotes || '');
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>דו״ח שיעורים - {student.firstName} {student.lastName}</span>
              {previousGrade && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUndo}
                  className="gap-2"
                >
                  <Undo2 className="h-4 w-4" />
                  ביטול פעולה אחרונה
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
        
        <div className="space-y-3 mb-4" dir="rtl">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 p-3">
            <div>
              <strong>סיכום שיעורים שהתקיימו</strong>
              <p className="text-xs text-muted-foreground">שנת לימודים: 1 בספטמבר עד 31 באוגוסט. ההיסטוריה נשמרת גם לשנים קודמות.</p>
            </div>
            <label className="text-sm font-medium">הצגת שנה:
              <select className="ms-2 rounded-md border bg-background px-3 py-2" value={selectedYear === 'all' ? 'all' : String(selectedYear)} onChange={e => setSelectedYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
                <option value="all">כל השנים</option>
                {years.map(year => <option key={year} value={year}>{getSchoolYearLabel(year)}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {years.map(year => (
              <button key={year} type="button" onClick={() => setSelectedYear(year)} className={`rounded-lg border p-3 text-right transition-colors ${selectedYear === year ? 'border-primary bg-primary/10' : 'bg-background hover:bg-muted/60'}`}>
                <div className="text-xs text-muted-foreground">שנת {getSchoolYearLabel(year)}</div>
                <div className="text-lg font-bold">{yearLessonCount(year)} שיעורים</div>
              </button>
            ))}
          </div>
          <div className="font-semibold text-sm">בדו״ח הנבחר: {visibleLessons.length} שיעורים · בכל השנים: {lessons.length}</div>
        </div>
        {visibleLessons.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            לא נמצאו שיעורים שהושלמו
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>תאריך</TableHead>
                <TableHead>שעה</TableHead>
                <TableHead>ציון ש"ב</TableHead>
                <TableHead>הערות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleLessons.map((lesson, index) => (
                <TableRow key={lesson.id}>
                  <TableCell>{new Date(lesson.date).toLocaleDateString('he-IL')}</TableCell>
                  <TableCell>{lesson.startTime} - {lesson.endTime}</TableCell>
                  <TableCell>
                    {gradingLesson === lesson.id ? (
                      <div className="flex flex-col gap-2 min-w-[300px]">
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map(grade => (
                            <Button
                              key={grade}
                              size="sm"
                              variant={lesson.grade === grade ? 'default' : 'outline'}
                              onClick={() => handleGrade(lesson.id, grade)}
                              className="w-8 h-8 p-0"
                            >
                              {grade}
                            </Button>
                          ))}
                        </div>
                        <Textarea
                          placeholder="הערות נוספות (לא חובה)"
                          value={gradeNotes}
                          onChange={(e) => setGradeNotes(e.target.value)}
                          className="min-h-[60px]"
                        />
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setGradingLesson(null);
                              setGradeNotes('');
                            }}
                          >
                            ביטול
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col gap-1">
                            {lesson.grade ? (
                              <>
                                <Badge variant="secondary" className="text-sm w-fit">
                                  {lesson.grade}/5
                                </Badge>
                                {lesson.gradeNotes && (
                                  <p className="text-xs text-muted-foreground">{lesson.gradeNotes}</p>
                                )}
                              </>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openGrading(lesson.id)}
                              title="ערוך ציון"
                            >
                              <Star className="h-4 w-4" />
                            </Button>
                            {lesson.grade && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDeletingLesson(lesson.id)}
                                title="מחק תיעוד"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                        <LessonPracticeStats studentId={student.id} lesson={lesson} />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{lesson.notes || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!deletingLesson} onOpenChange={() => setDeletingLesson(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>מחיקת תיעוד</AlertDialogTitle>
          <AlertDialogDescription>
            האם את בטוחה שאת רוצה למחוק את התיעוד של השיעור? פעולה זו תמחק את הציון וההערות.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>ביטול</AlertDialogCancel>
          <AlertDialogAction onClick={() => deletingLesson && handleDeleteGrade(deletingLesson)}>
            מחק
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  );
};

export default StudentLessonHistory;
