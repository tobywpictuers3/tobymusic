import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Clock, Save } from 'lucide-react';
import { getStudentsForCurrentYearLists, getActiveScheduleTemplate, syncStudentWithTemplate } from '@/lib/storage';
import { toast } from '@/hooks/use-toast';
import { clearClientCaches } from '@/lib/cacheManager';

interface StudentScheduleViewProps {
  onSave?: () => void;
}

const StudentScheduleView = ({ onSave }: StudentScheduleViewProps) => {
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [hasChanges, setHasChanges] = useState(false);
  
  const students = getStudentsForCurrentYearLists();
  const activeTemplate = getActiveScheduleTemplate();
  const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const timeSlots = Array.from({ length: 14 }, (_, i) => {
    const hour = 8 + i;
    return `${hour.toString().padStart(2, '0')}:00`;
  });

  const selectedStudent = students.find(s => s.id === selectedStudentId);

  const getStudentTimeSlots = () => {
    if (!activeTemplate || !selectedStudentId) return [];
    
    const slots: Array<{ day: number; time: string; dayName: string }> = [];
    
    Object.entries(activeTemplate.schedule).forEach(([dayOfWeek, daySchedule]) => {
      Object.entries(daySchedule).forEach(([timeSlot, lessonData]) => {
        if (lessonData.studentId === selectedStudentId) {
          slots.push({
            day: parseInt(dayOfWeek),
            time: timeSlot,
            dayName: dayNames[parseInt(dayOfWeek)]
          });
        }
      });
    });
    
    return slots.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
  };

  const handleAddTimeSlot = (dayOfWeek: number, timeSlot: string) => {
    if (!selectedStudentId) return;
    
    syncStudentWithTemplate(selectedStudentId, dayOfWeek, timeSlot, true);
    setHasChanges(true);
    toast({
      title: 'הצלחה',
      description: 'השיעור נוסף למערכת הקבועה'
    });
  };

  const handleRemoveTimeSlot = (dayOfWeek: number, timeSlot: string) => {
    if (!selectedStudentId) return;
    
    syncStudentWithTemplate(selectedStudentId, dayOfWeek, timeSlot, false);
    setHasChanges(true);
    toast({
      title: 'הצלחה',
      description: 'השיעור הוסר מהמערכת הקבועה'
    });
  };

  const handleSave = async () => {
    await clearClientCaches();
    setHasChanges(false);
    onSave?.();
    toast({
      title: 'הצלחה',
      description: 'השינויים נשמרו בהצלחה'
    });
  };

  return (
    <Card className="card-gradient card-shadow">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-2xl flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            צפייה במערכת תלמיד
          </CardTitle>
          {hasChanges && (
            <Button onClick={handleSave} className="hero-gradient">
              <Save className="h-4 w-4 mr-2" />
              שמור שינויים
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Student Selection */}
        <div className="mb-6">
          <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
            <SelectTrigger className="w-[300px]">
              <SelectValue placeholder="בחר תלמיד לצפייה במערכת" />
            </SelectTrigger>
            <SelectContent>
              {students.map((student) => (
                <SelectItem key={student.id} value={student.id}>
                  {student.firstName} {student.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedStudent && (
          <>
            {/* Student Info */}
            <div className="mb-6 p-4 bg-secondary/30 rounded-lg">
              <h3 className="font-semibold text-lg mb-2">{selectedStudent.firstName} {selectedStudent.lastName}</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <strong>טלפון:</strong> {selectedStudent.phone}
                </div>
                <div>
                  <strong>דוא"ל:</strong> {selectedStudent.email}
                </div>
                <div>
                  <strong>תאריך התחלה:</strong> {new Date(selectedStudent.startDate).toLocaleDateString('he-IL')}
                </div>
              </div>
            </div>

            {/* Current Schedule */}
            <div className="mb-6">
              <h4 className="font-medium mb-4 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                מערכת קבועה נוכחית
              </h4>
              
              {getStudentTimeSlots().length > 0 ? (
                <div className="grid gap-2">
                  {getStudentTimeSlots().map((slot, index) => (
                    <div
                      key={index}
                      className="flex justify-between items-center p-3 bg-primary/10 border border-primary/20 rounded-lg"
                    >
                      <div>
                        <span className="font-medium">{slot.dayName}</span>
                        <span className="text-muted-foreground mr-2">
                          {slot.time} - {slot.time.split(':')[0].padStart(2, '0')}:30
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemoveTimeSlot(slot.day, slot.time)}
                      >
                        הסר
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">אין שיעורים קבועים למתמיד זה</p>
              )}
            </div>

            {/* Add Time Slot */}
            <div className="p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium mb-4">הוספת שיעור למערכת הקבועה</h4>
              <div className="grid grid-cols-7 gap-2">
                {dayNames.map((dayName, dayIndex) => (
                  <div key={dayIndex} className="space-y-2">
                    <h5 className="text-sm font-medium text-center">{dayName}</h5>
                    {timeSlots.map((timeSlot) => {
                      const isOccupied = activeTemplate?.schedule[dayIndex.toString()]?.[timeSlot];
                      const isCurrentStudent = isOccupied?.studentId === selectedStudentId;
                      
                      return (
                        <Button
                          key={timeSlot}
                          variant={isCurrentStudent ? "default" : isOccupied ? "secondary" : "outline"}
                          size="sm"
                          className="w-full text-xs h-8"
                          disabled={isOccupied && !isCurrentStudent}
                          onClick={() => {
                            if (isCurrentStudent) {
                              handleRemoveTimeSlot(dayIndex, timeSlot);
                            } else if (!isOccupied) {
                              handleAddTimeSlot(dayIndex, timeSlot);
                            }
                          }}
                        >
                          {timeSlot}
                        </Button>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-primary rounded"></div>
                  <span>התלמיד הנוכחי</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-secondary rounded"></div>
                  <span>תפוס</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border border-border rounded"></div>
                  <span>פנוי</span>
                </div>
              </div>
            </div>
          </>
        )}

        {!activeTemplate && (
          <div className="text-center py-8 text-muted-foreground">
            <p>אין תבנית מערכת פעילה. צור תבנית מערכת כדי לנהל שיעורים קבועים.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default StudentScheduleView;