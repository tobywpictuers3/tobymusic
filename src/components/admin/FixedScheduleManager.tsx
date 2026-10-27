import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Calendar, Plus, Edit, Settings, Save, X, Eye, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getScheduleTemplates, addScheduleTemplate, activateScheduleTemplate, getStudentsForCurrentYearLists, getLessons } from '@/lib/storage';
import { calculateEnhancedLessonNumber } from '@/lib/lessonNumbering';
import { ScheduleTemplate, WeeklyScheduleData, Student, Lesson } from '@/lib/types';
import { toast } from '@/hooks/use-toast';
import { format, addDays, startOfWeek, addWeeks, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import { he } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const FixedScheduleManager = () => {
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<ScheduleTemplate | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [scheduleData, setScheduleData] = useState<WeeklyScheduleData>({});
  const [customTimeSlots, setCustomTimeSlots] = useState<{ [dayIndex: string]: string[] }>({});
  
  // View state
  const [viewMode, setViewMode] = useState<'weekly' | 'monthly'>('weekly');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedStudent, setSelectedStudent] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  
  const [students, setStudents] = useState<Student[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  
  const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setTemplates(getScheduleTemplates());
    setStudents(getStudentsForCurrentYearLists());
    setLessons(getLessons());
  };

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateName('');
    setEffectiveDate('');
    setScheduleData({});
    setCustomTimeSlots({});
    setIsDialogOpen(true);
  };

  const handleEditTemplate = (template: ScheduleTemplate) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setEffectiveDate(template.effectiveDate);
    setScheduleData(template.schedule);
    
    // Extract custom time slots from existing schedule
    const extractedTimeSlots: { [dayIndex: string]: string[] } = {};
    Object.keys(template.schedule).forEach(dayIndex => {
      extractedTimeSlots[dayIndex] = Object.keys(template.schedule[dayIndex] || {}).sort();
    });
    setCustomTimeSlots(extractedTimeSlots);
    setIsDialogOpen(true);
  };

  const handleSaveTemplate = () => {
    if (!templateName || !effectiveDate) {
      toast({
        title: 'שגיאה',
        description: 'יש למלא שם ותאריך תחילת תוקף',
        variant: 'destructive'
      });
      return;
    }

    if (editingTemplate) {
      toast({
        title: 'הצלחה',
        description: 'התבנית עודכנה בהצלחה'
      });
    } else {
      // When creating a new template, check if there are existing active templates
      const activeTemplates = templates.filter(t => t.isActive);
      
      addScheduleTemplate({
        name: templateName,
        effectiveDate,
        isActive: activeTemplates.length === 0, // Only set as active if no other active templates
        schedule: scheduleData
      });
      
      toast({
        title: 'הצלחה',
        description: 'התבנית נוצרה בהצלחה'
      });
    }

    loadData();
    setIsDialogOpen(false);
  };

  const handleActivateTemplate = (templateId: string) => {
    const result = activateScheduleTemplate(templateId);
    if (result) {
      loadData();
      toast({
        title: 'הצלחה',
        description: 'התבנית הופעלה בהצלחה. כל התבניות האחרות הושבתו.'
      });
    } else {
      toast({
        title: 'שגיאה',
        description: 'לא ניתן להפעיל את התבנית',
        variant: 'destructive'
      });
    }
  };

  const handleScheduleChange = (dayOfWeek: string, timeSlot: string, studentId: string) => {
    const newScheduleData = { ...scheduleData };
    
    if (!newScheduleData[dayOfWeek]) {
      newScheduleData[dayOfWeek] = {};
    }
    
    if (studentId) {
      newScheduleData[dayOfWeek][timeSlot] = {
        studentId,
        duration: 30
      };
    } else {
      delete newScheduleData[dayOfWeek][timeSlot];
    }
    
    setScheduleData(newScheduleData);
  };

  const getStudentNameById = (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    return student ? `${student.firstName} ${student.lastName}` : 'לא ידוע';
  };

  const addTimeSlot = (dayIndex: string, timeSlot: string) => {
    if (!timeSlot || timeSlot.length !== 5 || !timeSlot.includes(':')) {
      toast({
        title: 'שגיאה',
        description: 'יש להזין שעה בפורמט HH:MM',
        variant: 'destructive'
      });
      return;
    }
    
    const newCustomTimeSlots = { ...customTimeSlots };
    if (!newCustomTimeSlots[dayIndex]) {
      newCustomTimeSlots[dayIndex] = [];
    }
    
    if (!newCustomTimeSlots[dayIndex].includes(timeSlot)) {
      newCustomTimeSlots[dayIndex] = [...newCustomTimeSlots[dayIndex], timeSlot].sort();
      setCustomTimeSlots(newCustomTimeSlots);
    }
  };

  const removeTimeSlot = (dayIndex: string, timeSlot: string) => {
    const newCustomTimeSlots = { ...customTimeSlots };
    if (newCustomTimeSlots[dayIndex]) {
      newCustomTimeSlots[dayIndex] = newCustomTimeSlots[dayIndex].filter(slot => slot !== timeSlot);
    }
    setCustomTimeSlots(newCustomTimeSlots);
    
    // Also remove from schedule data
    const newScheduleData = { ...scheduleData };
    if (newScheduleData[dayIndex]?.[timeSlot]) {
      delete newScheduleData[dayIndex][timeSlot];
    }
    setScheduleData(newScheduleData);
  };

  // View helpers
  const getWeekDates = (date: Date) => {
    const startDate = startOfWeek(date, { weekStartsOn: 0 }); // Sunday
    return Array.from({ length: 7 }, (_, i) => addDays(startDate, i));
  };

  const getMonthDates = (date: Date) => {
    return eachDayOfInterval({
      start: startOfMonth(date),
      end: endOfMonth(date)
    });
  };

  const getLessonsForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return lessons.filter(lesson => lesson.date === dateStr);
  };

  const getFilteredLessons = (dayLessons: Lesson[]) => {
    let filtered = dayLessons;
    
    if (selectedStudent !== 'all') {
      filtered = filtered.filter(lesson => lesson.studentId === selectedStudent);
    }
    
    return filtered;
  };

  const getLessonNumber = (lesson: Lesson) => {
    const result = calculateEnhancedLessonNumber(lesson.studentId, lesson.date, lesson.id);
    return result.lessonNumber;
  };

  const activeTemplate = templates.find(t => t.isActive);

  return (
    <Card className="card-gradient card-shadow">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-2xl flex items-center gap-2">
            <Settings className="h-6 w-6" />
            מערכת קבועה
          </CardTitle>
          <div className="flex gap-2">
            <Button onClick={handleCreateTemplate} className="hero-gradient">
              <Plus className="h-4 w-4 mr-2" />
              תבנית חדשה
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="templates" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="templates">ניהול תבניות</TabsTrigger>
            <TabsTrigger value="view">תצוגת מערכת</TabsTrigger>
          </TabsList>
          
          <TabsContent value="templates" className="space-y-4">
            {/* Active Template Display */}
            {activeTemplate && (
              <div className="p-4 bg-primary/5 border border-primary rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{activeTemplate.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      תחילת תוקף: {format(new Date(activeTemplate.effectiveDate), 'dd/MM/yyyy', { locale: he })}
                      {activeTemplate.activatedAt && (
                        <> • הופעלה: {format(new Date(activeTemplate.activatedAt), 'dd/MM/yyyy HH:mm', { locale: he })}</>
                      )}
                    </p>
                  </div>
                  <Badge className="bg-primary text-primary-foreground">פעילה</Badge>
                </div>
              </div>
            )}

            {/* Templates List */}
            <div>
              <h3 className="text-lg font-semibold mb-4">כל התבניות</h3>
              <div className="space-y-2">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className={`p-4 rounded-lg border ${
                      template.isActive 
                        ? 'border-primary bg-primary/5' 
                        : 'border-muted bg-muted/20'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="font-medium">{template.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          תחילת תוקף: {format(new Date(template.effectiveDate), 'dd/MM/yyyy', { locale: he })}
                          {template.isActive && ' • פעילה כעת'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditTemplate(template)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {!template.isActive && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleActivateTemplate(template.id)}
                          >
                            הפעל
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {templates.length === 0 && (
                  <p className="text-muted-foreground text-center py-8">
                    אין תבניות מערכת. צור תבנית ראשונה כדי להתחיל.
                  </p>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="view" className="space-y-4">
            {!activeTemplate ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">אין מערכת פעילה. יש להפעיל תבנית כדי לצפות במערכת.</p>
              </div>
            ) : (
              <>
                {/* Controls */}
                <div className="flex flex-wrap gap-4 items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setViewMode(viewMode === 'weekly' ? 'monthly' : 'weekly')}
                    >
                      {viewMode === 'weekly' ? 'תצוגה חודשית' : 'תצוגה שבועית'}
                    </Button>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentDate(viewMode === 'weekly' ? addWeeks(currentDate, -1) : addDays(currentDate, -30))}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <span className="font-medium">
                      {viewMode === 'weekly' 
                        ? `שבוע ${format(currentDate, 'dd/MM/yyyy', { locale: he })}`
                        : format(currentDate, 'MMMM yyyy', { locale: he })
                      }
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentDate(viewMode === 'weekly' ? addWeeks(currentDate, 1) : addDays(currentDate, 30))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="סנן לפי תלמידה" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">כל התלמידות</SelectItem>
                        {students.map((student) => (
                          <SelectItem key={student.id} value={student.id}>
                            {student.firstName} {student.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Calendar className="h-4 w-4 mr-2" />
                          {selectedDate ? format(selectedDate, 'dd/MM/yyyy') : 'בחר תאריך'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={selectedDate}
                          onSelect={setSelectedDate}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    
                    {(selectedStudent !== 'all' || selectedDate) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedStudent('all');
                          setSelectedDate(undefined);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Schedule View */}
                {viewMode === 'weekly' ? (
                  <div className="grid grid-cols-7 gap-2">
                    {getWeekDates(currentDate).map((date, dayIndex) => {
                      const dayLessons = getLessonsForDay(date);
                      const filteredLessons = getFilteredLessons(dayLessons);
                      const shouldHighlight = selectedDate && isSameDay(date, selectedDate);
                      
                      return (
                        <div key={dayIndex} className={cn("border rounded-lg p-2", shouldHighlight && "ring-2 ring-primary")}>
                          <h3 className="font-medium text-center mb-2">
                            {dayNames[dayIndex]}
                            <br />
                            <span className="text-sm text-muted-foreground">
                              {format(date, 'dd/MM')}
                            </span>
                          </h3>
                          <div className="space-y-1">
                            {filteredLessons
                              .sort((a, b) => a.startTime.localeCompare(b.startTime))
                              .map((lesson) => {
                                const student = students.find(s => s.id === lesson.studentId);
                                const lessonNumber = getLessonNumber(lesson);
                                
                                return (
                                  <div
                                    key={lesson.id}
                                    className={cn(
                                      "p-2 rounded text-xs",
                                      lesson.status === 'completed' && "bg-green-100 text-green-800",
                                      lesson.status === 'cancelled' && "bg-red-100 text-red-800",
                                      lesson.status === 'scheduled' && "bg-blue-100 text-blue-800"
                                    )}
                                  >
                                    <div className="font-medium">{lesson.startTime}</div>
                                    <div>{student ? `${student.firstName} ${student.lastName}` : ''}</div>
                                    {lessonNumber > 0 && (
                                      <div className="text-xs text-muted-foreground">
                                        שיעור #{lessonNumber}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid grid-cols-7 gap-1">
                    {/* Month headers */}
                    {dayNames.map((day) => (
                      <div key={day} className="p-2 text-center font-medium text-sm">
                        {day}
                      </div>
                    ))}
                    
                    {/* Month days */}
                    {getMonthDates(currentDate).map((date) => {
                      const dayLessons = getLessonsForDay(date);
                      const filteredLessons = getFilteredLessons(dayLessons);
                      const shouldHighlight = selectedDate && isSameDay(date, selectedDate);
                      
                      return (
                        <div
                          key={date.toISOString()}
                          className={cn(
                            "border rounded p-1 min-h-[80px]",
                            shouldHighlight && "ring-2 ring-primary"
                          )}
                        >
                          <div className="text-sm font-medium mb-1">
                            {format(date, 'd')}
                          </div>
                          <div className="space-y-1">
                            {filteredLessons.slice(0, 3).map((lesson) => {
                              const student = students.find(s => s.id === lesson.studentId);
                              const lessonNumber = getLessonNumber(lesson);
                              
                              return (
                                <div
                                  key={lesson.id}
                                  className={cn(
                                    "text-xs p-1 rounded",
                                    lesson.status === 'completed' && "bg-green-100",
                                    lesson.status === 'cancelled' && "bg-red-100",
                                    lesson.status === 'scheduled' && "bg-blue-100"
                                  )}
                                >
                                  <div>{lesson.startTime}</div>
                                  <div className="truncate">{student ? `${student.firstName} ${student.lastName}` : ''}</div>
                                  {lessonNumber > 0 && (
                                    <div>#{lessonNumber}</div>
                                  )}
                                </div>
                              );
                            })}
                            {filteredLessons.length > 3 && (
                              <div className="text-xs text-muted-foreground">
                                +{filteredLessons.length - 3} עוד
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Template Editor Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? 'עריכת תבנית מערכת' : 'יצירת תבנית מערכת חדשה'}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6">
              {/* Template Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="templateName">שם התבנית</Label>
                  <Input
                    id="templateName"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="למשל: מערכת חורף 2024"
                  />
                </div>
                <div>
                  <Label htmlFor="effectiveDate">תאריך תחילת תוקף</Label>
                  <Input
                    id="effectiveDate"
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Schedule Grid */}
              <div>
                <h4 className="font-medium mb-4">מערכת שבועית - הזנת שעות ידנית</h4>
                <div className="grid grid-cols-7 gap-4 mb-6">
                  {dayNames.map((day, dayIndex) => (
                    <div key={dayIndex} className="space-y-2">
                      <h5 className="font-medium text-center">{day}</h5>
                      <div className="flex gap-1">
                        <Input
                          type="time"
                          placeholder="שעה"
                          className="text-xs"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const timeSlot = (e.target as HTMLInputElement).value;
                              addTimeSlot(dayIndex.toString(), timeSlot);
                              (e.target as HTMLInputElement).value = '';
                            }
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                            if (input?.value) {
                              addTimeSlot(dayIndex.toString(), input.value);
                              input.value = '';
                            }
                          }}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {(customTimeSlots[dayIndex.toString()] || []).map((timeSlot) => (
                          <div key={timeSlot} className="flex items-center gap-1">
                            <div className="text-xs font-medium bg-muted/50 px-2 py-1 rounded min-w-[50px]">
                              {timeSlot}
                            </div>
                            <Select
                              value={scheduleData[dayIndex.toString()]?.[timeSlot]?.studentId || 'no-lesson'}
                              onValueChange={(value) => handleScheduleChange(dayIndex.toString(), timeSlot, value === 'no-lesson' ? '' : value)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="תלמיד" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="no-lesson">אין שיעור</SelectItem>
                                {students.map((student) => (
                                  <SelectItem key={student.id} value={student.id}>
                                    {student.firstName} {student.lastName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => removeTimeSlot(dayIndex.toString(), timeSlot)}
                              className="h-8 w-8 p-0"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  * כל שיעור הוא 30 דקות. הזן שעת התחלה והמערכת תחשב אוטומטית עד 30 דקות אחרי.
                </p>
              </div>

              {/* Save Button */}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  ביטול
                </Button>
                <Button onClick={handleSaveTemplate} className="hero-gradient">
                  <Save className="h-4 w-4 mr-2" />
                  שמור תבנית
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default FixedScheduleManager;