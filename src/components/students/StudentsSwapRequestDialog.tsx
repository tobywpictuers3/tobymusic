
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, Send } from 'lucide-react';
import { getStudentsForCurrentYearLists, addSwapRequest } from '@/lib/storage';
import { toast } from '@/hooks/use-toast';

interface StudentsSwapRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedLesson: any;
}

const StudentsSwapRequestDialog = ({ open, onOpenChange, selectedLesson }: StudentsSwapRequestDialogProps) => {
  const [personalCode, setPersonalCode] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [targetTime, setTargetTime] = useState('');
  const [targetStudentName, setTargetStudentName] = useState('');
  const [reason, setReason] = useState('');
  const [step, setStep] = useState(1); // 1: code verification, 2: swap details

  const students = getStudentsForCurrentYearLists();

  const handleCodeVerification = () => {
    if (!personalCode.trim()) {
      toast({
        title: 'שגיאה',
        description: 'יש להקיש קוד אישי',
        variant: 'destructive',
      });
      return;
    }


    // Try to find by personalCode first
    let student = students.find(s => s.personalCode === personalCode.trim());
    
    // Fallback: if personalCode is empty or not found, try phone (backward compatibility)
    if (!student) {
      student = students.find(s => s.phone === personalCode.trim());
    }
    
    if (!student) {
      toast({
        title: 'שגיאה',
        description: 'קוד אישי שגוי',
        variant: 'destructive',
      });
      return;
    }

    // Check if the personal code matches the lesson's student
    if (student.id !== selectedLesson?.studentId) {
      toast({
        title: 'שגיאה',
        description: 'הקוד האישי לא תואם לתלמידה של השיעור הנבחר',
        variant: 'destructive',
      });
      return;
    }

    setStep(2);
  };

  const handleSubmitRequest = () => {
    if (!targetDate || !targetTime || !targetStudentName.trim()) {
      toast({
        title: 'שגיאה',
        description: 'יש למלא את כל השדות הנדרשים',
        variant: 'destructive',
      });
      return;
    }

    // Find target student by name
    const targetStudent = students.find(s => 
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(targetStudentName.toLowerCase())
    );

    if (!targetStudent) {
      toast({
        title: 'שגיאה',
        description: 'תלמידה לא נמצאה. אנא וודאי שהשם נכון',
        variant: 'destructive',
      });
      return;
    }

    addSwapRequest({
      requesterId: selectedLesson.studentId,
      targetId: targetStudent.id,
      date: selectedLesson.date,
      time: selectedLesson.startTime,
      targetDate: targetDate,
      targetTime: targetTime,
      reason: reason.trim() || 'לא צוינה סיבה',
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    // Reset form
    setPersonalCode('');
    setTargetDate('');
    setTargetTime('');
    setTargetStudentName('');
    setReason('');
    setStep(1);
    onOpenChange(false);

    toast({
      title: 'הבקשה נשלחה בהצלחה',
      description: 'הבקשה נשלחה למנהלת לאישור',
    });
  };

  const handleClose = () => {
    setPersonalCode('');
    setTargetDate('');
    setTargetTime('');
    setTargetStudentName('');
    setReason('');
    setStep(1);
    onOpenChange(false);
  };

  const getStudentName = (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    return student ? `${student.firstName} ${student.lastName}` : 'לא ידוע';
  };

  if (!selectedLesson) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            בקשת החלפת שיעור
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm mb-2">
                <strong>שיעור נבחר:</strong> {getStudentName(selectedLesson.studentId)}
              </p>
              <p className="text-sm mb-2">
                <strong>תאריך:</strong> {new Date(selectedLesson.date).toLocaleDateString('he-IL')}
              </p>
              <p className="text-sm">
                <strong>שעה:</strong> {selectedLesson.startTime} - {selectedLesson.endTime}
              </p>
            </div>

            <div>
              <Label htmlFor="personalCode">הקישי את הקוד האישי שלך לאימות זהות</Label>
              <Input
                id="personalCode"
                value={personalCode}
                onChange={(e) => setPersonalCode(e.target.value)}
                placeholder="קוד אישי"
                className="mt-2"
              />
            </div>

            <Button onClick={handleCodeVerification} className="w-full">
              המשך
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium">מבקשת החלפה עבור:</p>
              <p className="text-sm">
                {getStudentName(selectedLesson.studentId)} - {new Date(selectedLesson.date).toLocaleDateString('he-IL')} {selectedLesson.startTime}
              </p>
            </div>

            <div>
              <Label htmlFor="targetStudentName">שם התלמידה להחלפה *</Label>
              <Input
                id="targetStudentName"
                value={targetStudentName}
                onChange={(e) => setTargetStudentName(e.target.value)}
                placeholder="שם התלמידה"
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="targetDate">תאריך השיעור להחלפה *</Label>
              <Input
                id="targetDate"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="targetTime">שעת השיעור להחלפה *</Label>
              <Input
                id="targetTime"
                type="time"
                value={targetTime}
                onChange={(e) => setTargetTime(e.target.value)}
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="reason">סיבת החלפה (אופציונלי)</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="אנא פרטי את הסיבה להחלפה (לא חובה)"
                rows={3}
                className="mt-2"
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                חזור
              </Button>
              <Button onClick={handleSubmitRequest} className="flex-1 hero-gradient">
                <Send className="h-4 w-4 mr-2" />
                שלח בקשה
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default StudentsSwapRequestDialog;
