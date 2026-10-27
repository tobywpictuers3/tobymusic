import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Calendar, Plus, Edit, Settings, Save, X } from 'lucide-react';
import { getScheduleTemplates, addScheduleTemplate, updateScheduleTemplate, getStudentsForCurrentYearLists } from '@/lib/storage';
import { ScheduleTemplate, WeeklyScheduleData } from '@/lib/types';
import { toast } from '@/hooks/use-toast';

const ScheduleTemplateManager = () => {
  const [templates, setTemplates] = useState(getScheduleTemplates());
  const [editingTemplate, setEditingTemplate] = useState<ScheduleTemplate | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [scheduleData, setScheduleData] = useState<WeeklyScheduleData>({});
  const [customTimeSlots, setCustomTimeSlots] = useState<{ [dayIndex: string]: string[] }>({});
  
  const students = getStudentsForCurrentYearLists();
  const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

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
      updateScheduleTemplate(editingTemplate.id, {
        name: templateName,
        effectiveDate,
        schedule: scheduleData
      });
      toast({
        title: 'הצלחה',
        description: 'התבנית עודכנה בהצלחה'
      });
    } else {
      addScheduleTemplate({
        name: templateName,
        effectiveDate,
        isActive: templates.length === 0, // First template is active by default
        schedule: scheduleData
      });
      toast({
        title: 'הצלחה',
        description: 'התבנית נוצרה בהצלחה'
      });
    }

    setTemplates(getScheduleTemplates());
    setIsDialogOpen(false);
  };

  const handleActivateTemplate = (templateId: string) => {
    // Import the new function
    import('@/lib/storage').then(({ activateScheduleTemplate }) => {
      activateScheduleTemplate(templateId);
      setTemplates(getScheduleTemplates());
      toast({
        title: 'הצלחה',
        description: 'התבנית הופעלה בהצלחה. כל התבניות האחרות הושבתו.'
      });
    });
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

  return (
    <Card className="card-gradient card-shadow">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-2xl flex items-center gap-2">
            <Settings className="h-6 w-6" />
            ניהול תבניות מערכת
          </CardTitle>
          <Button onClick={handleCreateTemplate} className="hero-gradient">
            <Plus className="h-4 w-4 mr-2" />
            תבנית חדשה
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Templates List */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-4">תבניות קיימות</h3>
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
                      תחילת תוקף: {new Date(template.effectiveDate).toLocaleDateString('he-IL')}
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

export default ScheduleTemplateManager;