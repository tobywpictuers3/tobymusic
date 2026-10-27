
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquare, Send } from 'lucide-react';
import { getStudentsForCurrentYearLists, getLessons, addSwapRequest } from '@/lib/storage';
import { toast } from '@/hooks/use-toast';
import { addMessage } from '@/lib/messages';

interface SwapRequestFormProps {
  studentId: string;
}

const SwapRequestForm = ({ studentId }: SwapRequestFormProps) => {
  const [selectedDate, setSelectedDate] = useState('');
  const [targetStudentId, setTargetStudentId] = useState('');
  const [reason, setReason] = useState('');
  
  const students = getStudentsForCurrentYearLists().filter(s => s.id !== studentId);
  const lessons = getLessons().filter(l => l.studentId === studentId);
  
  // Get upcoming lessons for the current student
  const today = new Date().toISOString().split('T')[0];
  const upcomingLessons = lessons.filter(l => l.date >= today && l.status === 'scheduled');

  const handleSubmitRequest = () => {
    if (!selectedDate || !targetStudentId || !reason.trim()) {
      toast({
        title: 'שגיאה',
        description: 'יש למלא את כל השדות',
        variant: 'destructive',
      });
      return;
    }

    // Get the lesson time from the selected lesson
    const selectedLesson = upcomingLessons.find(l => l.date === selectedDate);
    if (!selectedLesson) {
      toast({
        title: 'שגיאה',
        description: 'שיעור לא נמצא',
        variant: 'destructive',
      });
      return;
    }

    addSwapRequest({
      requesterId: studentId,
      targetId: targetStudentId,
      date: selectedDate,
      time: selectedLesson.startTime,
      reason: reason.trim(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    // Send swap request message to admin
    const allStudents = getStudentsForCurrentYearLists();
    const requester = allStudents.find(s => s.id === studentId);
    const target = allStudents.find(s => s.id === targetStudentId);

    if (requester && target) {
      const messageContent = `בקשת החלפת שיעור חדשה\n\nמבקש: ${requester.firstName} ${requester.lastName}\nשיעור מקורי: ${selectedDate} בשעה ${selectedLesson.startTime}\n\nמבוקש להחליף עם: ${target.firstName} ${target.lastName}\n\nסיבה: ${reason.trim()}`;
      
      addMessage({
        senderId: studentId,
        senderName: `${requester.firstName} ${requester.lastName}`,
        recipientIds: ['admin'],
        subject: 'בקשת החלפת שיעור',
        content: messageContent,
        type: 'swap_request',
      });
    }

    // Reset form
    setSelectedDate('');
    setTargetStudentId('');
    setReason('');

    toast({
      title: 'הבקשה נשלחה בהצלחה',
      description: 'הבקשה נשלחה למנהלת לאישור',
    });
  };

  const getStudentName = (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    return student ? `${student.firstName} ${student.lastName}` : '';
  };

  const formatLessonOption = (lesson: any) => {
    const date = new Date(lesson.date).toLocaleDateString('he-IL');
    return `${date} - ${lesson.startTime}`;
  };

  return (
    <Card className="card-gradient card-shadow">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center gap-2">
          <MessageSquare className="h-6 w-6" />
          בקשת החלפת שיעור חד פעמי
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">
            כאן תוכלי לבקש החלפת שיעור חד פעמי עם תלמידה אחרת. 
            הבקשה תישלח למנהלת לאישור ותקבלי עדכון על סטטוס הבקשה.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="lesson-date">בחירת שיעור להחלפה</Label>
            <Select value={selectedDate} onValueChange={setSelectedDate}>
              <SelectTrigger>
                <SelectValue placeholder="בחרי שיעור להחלפה" />
              </SelectTrigger>
              <SelectContent>
                {upcomingLessons.map((lesson) => (
                  <SelectItem key={lesson.id} value={lesson.date}>
                    {formatLessonOption(lesson)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="target-student">עם איזו תלמידה תרצי להחליף?</Label>
            <Select value={targetStudentId} onValueChange={setTargetStudentId}>
              <SelectTrigger>
                <SelectValue placeholder="בחרי תלמידה" />
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

          <div>
            <Label htmlFor="reason">סיבת החלפה</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="אנא פרטי את הסיבה להחלפה (למשל: אירוע משפחתי, בחינה, וכו')"
              rows={4}
            />
          </div>

          <Button 
            onClick={handleSubmitRequest}
            className="w-full hero-gradient hover:scale-105 transition-musical"
            size="lg"
          >
            <Send className="h-4 w-4 mr-2" />
            שליחת בקשה
          </Button>
        </div>

        {upcomingLessons.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            אין שיעורים קרובים זמינים להחלפה
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SwapRequestForm;
