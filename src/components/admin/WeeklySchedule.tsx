import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Edit, Plus, ArrowRight, ArrowLeft, Save, Settings, Trash2, Move } from 'lucide-react';
import { getStudentsForCurrentYearLists, getLessons, addLesson, updateLesson, deleteLesson, deleteLessonCascade, getActiveScheduleTemplate, calculateLessonNumber } from '@/lib/storage';
import { toast } from '@/hooks/use-toast';
import ScheduleTemplateManager from './ScheduleTemplateManager';
import { Lesson } from '@/lib/types';
import { syncManager } from '@/lib/syncManager';
import { clearClientCaches } from '@/lib/cacheManager';

const WeeklySchedule = () => {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [editingLesson, setEditingLesson] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  const students = getStudentsForCurrentYearLists();
  const lessons = getLessons();
  const activeTemplate = getActiveScheduleTemplate();

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

  // Generate lessons from active template
  const generateLessonsFromTemplate = (weekDates: Date[]): Lesson[] => {
    if (!activeTemplate) return [];
    
    const generatedLessons: Lesson[] = [];
    const templateEffectiveDate = new Date(activeTemplate.effectiveDate);
    
    weekDates.forEach((date, dayIndex) => {
      // Only generate for dates after effective date
      if (date < templateEffectiveDate) return;
      
      const daySchedule = activeTemplate.schedule[dayIndex.toString()];
      if (!daySchedule) return;
      
      Object.entries(daySchedule).forEach(([timeSlot, scheduleInfo]) => {
        // Check if lesson already exists for this date/time/student
        const dateStr = date.toISOString().split('T')[0];
        const existingLesson = lessons.find(lesson => 
          lesson.date === dateStr && 
          lesson.startTime === timeSlot && 
          lesson.studentId === scheduleInfo.studentId
        );
        
        if (!existingLesson) {
          const [hours, minutes] = timeSlot.split(':').map(Number);
          const endTime = `${hours.toString().padStart(2, '0')}:${(minutes + 30).toString().padStart(2, '0')}`;
          
          generatedLessons.push({
            id: `template-${date.getTime()}-${timeSlot}-${scheduleInfo.studentId}`,
            studentId: scheduleInfo.studentId,
            date: dateStr,
            startTime: timeSlot,
            endTime: endTime,
            status: 'scheduled',
            isFromTemplate: true
          });
        }
      });
    });
    
    return generatedLessons;
  };

  const weekDates = getWeekDates(currentWeek);
  // שינוי סדר הימים - מימין לשמאל (ראשון ימינה)
  const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'מוצאי שבת'];
  const orderedWeekDates = weekDates.slice(); // Keep the same order for now
  const templateLessons = generateLessonsFromTemplate(weekDates);

  const getLessonsForDay = (date: Date): Lesson[] => {
    const dateStr = date.toISOString().split('T')[0];
    const actualLessons = lessons.filter(lesson => lesson.date === dateStr);
    const templateLessonsForDay = templateLessons.filter(lesson => lesson.date === dateStr);
    
    // Combine actual lessons with template lessons, avoiding duplicates
    const allLessons = [...actualLessons];
    templateLessonsForDay.forEach(templateLesson => {
      const exists = actualLessons.some(actual => 
        actual.startTime === templateLesson.startTime && 
        actual.studentId === templateLesson.studentId
      );
      if (!exists) {
        allLessons.push(templateLesson);
      }
    });
    
    return allLessons;
  };

  const getStudentName = (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    return student ? `${student.firstName} ${student.lastName}` : 'לא ידוע';
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

  const handleAddOneOffLesson = () => {
    setEditingLesson({
      studentId: '',
      date: weekDates[0].toISOString().split('T')[0],
      startTime: '09:00',
      endTime: '09:30',
      isOneOff: true,
      status: 'scheduled'
    });
    setIsEditDialogOpen(true);
  };

  const handleEditLesson = (lesson: Lesson) => {
    // If it's a template lesson, convert it to editable first
    if (lesson.isFromTemplate) {
      handleConvertTemplateLesson(lesson);
      return;
    }
    
    // Only allow editing future lessons or manual past edits
    const lessonDate = new Date(lesson.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (lessonDate < today && !lesson.isOneOff) {
      toast({
        title: 'שגיאה',
        description: 'לא ניתן לערוך שיעורי עבר מהמערכת הקבועה. השתמש בעריכה ידנית.',
        variant: 'destructive'
      });
      return;
    }
    
    setEditingLesson(lesson);
    setIsEditDialogOpen(true);
  };

  const handleSaveLesson = async () => {
    if (!editingLesson.studentId || !editingLesson.date || !editingLesson.startTime) {
      toast({
        title: 'שגיאה',
        description: 'יש למלא את כל השדות הנדרשים',
        variant: 'destructive'
      });
      return;
    }

    // Ensure 30-minute duration
    const [hours, minutes] = editingLesson.startTime.split(':').map(Number);
    const endMinutes = minutes + 30;
    const endHours = hours + Math.floor(endMinutes / 60);
    const adjustedEndMinutes = endMinutes % 60;
    
    const endTime = `${endHours.toString().padStart(2, '0')}:${adjustedEndMinutes.toString().padStart(2, '0')}`;

    const lessonData = {
      ...editingLesson,
      endTime,
      isOneOff: editingLesson.isOneOff || false,
      status: editingLesson.status || 'scheduled',
      isFromTemplate: false
    };

    const isUpdate = editingLesson.id && !editingLesson.id.startsWith('template-');
    const studentName = getStudentName(editingLesson.studentId);

    if (isUpdate) {
      updateLesson(editingLesson.id, lessonData);
      toast({
        title: 'הצלחה',
        description: 'השיעור עודכן בהצלחה'
      });
    } else {
      addLesson(lessonData);
      toast({
        title: 'הצלחה',
        description: 'השיעור נוסף בהצלחה'
      });
    }

    setIsEditDialogOpen(false);
    setEditingLesson(null);
  };

  const handleDeleteLesson = async (lessonId: string) => {
    // Only delete if it's a real lesson, not a template-generated one
    if (lessonId.startsWith('template-')) {
      toast({
        title: 'שגיאה',
        description: 'לא ניתן למחוק שיעור מהמערכת הקבועה. ערוך את המערכת במקום.',
        variant: 'destructive'
      });
      return;
    }
    
    await deleteLessonCascade(lessonId);
    toast({
      title: 'הצלחה',
      description: 'השיעור נמחק בהצלחה (כולל בקשות החלפה קשורות)'
    });
  };

  const handleConvertTemplateLesson = (templateLesson: Lesson) => {
    // Convert template lesson to real lesson for editing
    const realLesson = {
      ...templateLesson,
      id: undefined, // Remove template ID
      isFromTemplate: false
    };
    
    setEditingLesson(realLesson);
    setIsEditDialogOpen(true);
  };

  const handleSaveWeek = async () => {
    await clearClientCaches();
    // Save any pending changes
    setHasUnsavedChanges(false);
    toast({
      title: 'הצלחה',
      description: 'השינויים נשמרו בהצלחה'
    });
  };

  // Check if lesson has been swapped
  const isSwappedLesson = (lesson: Lesson) => {
    return lesson.notes?.includes('החלפה') || lesson.notes?.includes('שיעור שהוחלף');
  };

  if (showTemplateManager) {
    return <ScheduleTemplateManager />;
  }

  return (
    <Card className="card-gradient card-shadow">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-2xl flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            מערכת שבועית
            {activeTemplate && (
              <span className="text-sm text-muted-foreground font-normal">
                ({activeTemplate.name})
              </span>
            )}
          </CardTitle>
          <div className="flex gap-2">
            <Button onClick={handleAddOneOffLesson} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              שיעור חד פעמי
            </Button>
            <Button onClick={() => setShowTemplateManager(true)} variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              ניהול תבניות
            </Button>
            {hasUnsavedChanges && (
              <Button onClick={handleSaveWeek} className="hero-gradient">
                <Save className="h-4 w-4 mr-2" />
                שמור שינויים
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Week Navigation */}
        <div className="flex justify-between items-center mb-6">
          <Button onClick={handlePrevWeek} variant="outline" size="sm">
            <ArrowRight className="h-4 w-4" />
            שבוע קודם
          </Button>
          <h3 className="text-lg font-semibold">
            {weekDates[0].toLocaleDateString('he-IL')} - {weekDates[6].toLocaleDateString('he-IL')}
          </h3>
          <Button onClick={handleNextWeek} variant="outline" size="sm">
            שבוע הבא
            <ArrowLeft className="h-4 w-4 mr-2" />
          </Button>
        </div>

        {/* Weekly Calendar Grid - עם סדר ימים מימין לשמאל */}
        <div className="grid grid-cols-7 gap-2" dir="rtl">
          {orderedWeekDates.map((date, index) => {
            const dayLessons = getLessonsForDay(date);
            return (
              <div key={date.toISOString()} className="space-y-1">
                <div className="text-center p-2 bg-secondary/50 rounded-lg">
                  <div className="font-semibold text-sm">{dayNames[index]}</div>
                  <div className="text-xs text-muted-foreground">
                    {date.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}
                  </div>
                </div>
                <div className="space-y-1 min-h-[150px]">
                {dayLessons
                  .filter(lesson => lesson.status !== 'cancelled')
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                  .map((lesson, lessonIndex) => {
                      const currentDate = new Date().toISOString().split('T')[0];
                      const isFuture = lesson.date > currentDate;
                      const isCompleted = lesson.status === 'completed';
                      const isSwapped = isSwappedLesson(lesson);
                      const isFromTemplate = lesson.isFromTemplate || false;
                      
                      const lessonNumber = lesson.lockedNumber || calculateLessonNumber(lesson.studentId, lesson.date, lesson.id);
                      
                      return (
                        <div
                          key={lesson.id}
                          className={`p-1.5 border rounded text-xs group relative ${
                            isFromTemplate
                              ? 'bg-green-50 border-green-200 text-green-800'
                              : isSwapped 
                                ? 'bg-orange-50 border-orange-200 text-orange-800' 
                                : isFuture 
                                  ? 'bg-muted/50 text-muted-foreground border-muted/30' 
                                  : isCompleted 
                                    ? 'bg-blue-50 border-blue-200 text-blue-800' 
                                    : 'bg-primary/10 border-primary/20'
                          } transition-all duration-200 hover:shadow-sm`}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0" onClick={() => handleEditLesson(lesson)}>
                              <div className="font-medium cursor-pointer hover:underline text-xs truncate">
                                {getStudentName(lesson.studentId)}
                              </div>
                              <div className="text-[10px]">
                                {lesson.startTime}
                              </div>
                              <div className="text-[10px] mt-0.5">
                                #{lessonNumber}
                                {lesson.isOneOff && (
                                  <span className="mr-1 bg-yellow-100 text-yellow-800 px-1 rounded text-[9px]">
                                    חד פעמי
                                  </span>
                                )}
                                {isFromTemplate && (
                                  <span className="mr-1 bg-green-100 text-green-800 px-1 rounded text-[9px]">
                                    מהמערכת
                                  </span>
                                )}
                              {isSwapped && (
                                <span className="block bg-red-600 text-white px-1 rounded text-[9px] mt-0.5">
                                  הוחלף
                                </span>
                              )}
                              </div>
                            </div>
                            
                            {/* Action buttons - show on hover */}
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                              {!isFromTemplate && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteLesson(lesson.id);
                                  }}
                                  title="מחק שיעור"
                                >
                                  <Trash2 className="h-2 w-2" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-4 w-4 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditLesson(lesson);
                                }}
                                title={isFromTemplate ? "הוסף לשיעורים רגילים" : "ערוך שיעור"}
                              >
                                <Move className="h-2 w-2" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Controls */}
        <div className="mt-6 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm">
              נעילת עבר: פעיל
            </Button>
            <div className="text-sm text-muted-foreground">
              שיעורי עבר נעולים ולא יעודכנו בשינויי מערכת • שיעורים בירוק מגיעים מהמערכת הקבועה
            </div>
          </div>
        </div>

        {/* Edit Lesson Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingLesson?.id && !editingLesson.id.startsWith('template-') ? 'עריכת שיעור' : 'הוספת שיעור'}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="student">תלמיד</Label>
                <Select
                  value={editingLesson?.studentId || 'no-student'}
                  onValueChange={(value) => setEditingLesson({...editingLesson, studentId: value === 'no-student' ? '' : value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="בחר תלמיד" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no-student">בחר תלמיד</SelectItem>
                    {students.map((student) => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.firstName} {student.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="date">תאריך</Label>
                <Input
                  id="date"
                  type="date"
                  value={editingLesson?.date || ''}
                  onChange={(e) => setEditingLesson({...editingLesson, date: e.target.value})}
                />
              </div>
              
              <div>
                <Label htmlFor="startTime">שעת התחלה (משך שיעור: 30 דקות)</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={editingLesson?.startTime || ''}
                  onChange={(e) => setEditingLesson({...editingLesson, startTime: e.target.value})}
                />
              </div>
              
              <div>
                <Label htmlFor="status">סטטוס</Label>
                <Select
                  value={editingLesson?.status || 'scheduled'}
                  onValueChange={(value) => setEditingLesson({...editingLesson, status: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">מתוכנן</SelectItem>
                    <SelectItem value="completed">הושלם</SelectItem>
                    <SelectItem value="cancelled">בוטל</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="flex justify-end gap-2 mt-6">
              {editingLesson?.id && !editingLesson.id.startsWith('template-') && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    handleDeleteLesson(editingLesson.id);
                    setIsEditDialogOpen(false);
                  }}
                >
                  מחק
                </Button>
              )}
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                ביטול
              </Button>
              <Button onClick={handleSaveLesson} className="hero-gradient">
                שמור
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default WeeklySchedule;