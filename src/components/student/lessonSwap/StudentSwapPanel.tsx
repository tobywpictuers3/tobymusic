import { useState, useImperativeHandle, forwardRef, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Student, Lesson, SwapRequest } from '@/lib/types';
import { addSwapRequest, performLessonSwap, getLessons, addLesson, updateLesson } from '@/lib/storage';
import { addMessage } from '@/lib/messages';
import { authorizeSwap } from '@/lib/workerAuth';
import { ArrowLeftRight, X, MousePointerClick } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface StudentSwapPanelProps {
  student: Student;
  lessons: Lesson[];
  students: Student[];
  onMount?: (ref: { handleLessonDoubleClick: (lesson: Lesson) => void }) => void;
  onStepChange?: (step: 1 | 2 | 3 | 4) => void;
  onSwapCompleted?: () => void;
}

export interface StudentSwapPanelRef {
  handleLessonDoubleClick: (lesson: Lesson) => void;
}

// Helper: Check if lesson is in the future (allow up to 10 minutes before)
const isFutureLesson = (lesson: Lesson): boolean => {
  const now = new Date();
  const lessonDateTime = new Date(`${lesson.date}T${lesson.startTime}`);
  const tenMinutesBefore = new Date(lessonDateTime.getTime() - 10 * 60 * 1000);
  return now < tenMinutesBefore;
};

const StudentSwapPanel = forwardRef<StudentSwapPanelRef, StudentSwapPanelProps>(
  ({ student, lessons, students = [], onMount, onStepChange, onSwapCompleted }, ref) => {
    // Step-based state management
    const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
    const [myLessonId, setMyLessonId] = useState<string>('');
    const [mySwapCode, setMySwapCode] = useState<string>('');
    const [targetLessonId, setTargetLessonId] = useState<string>('');
    const [targetSwapCode, setTargetSwapCode] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    
    // Refs to prevent infinite loops in auto-advance
    const hasAutoAdvancedToStep2 = useRef(false);
    const hasAutoAdvancedToStep3 = useRef(false);
    const hasAutoAdvancedToStep4 = useRef(false);
    
    // Use ref to track currentStep in real-time (solves race condition)
    const currentStepRef = useRef<1 | 2 | 3 | 4>(1);

    const myFutureLessons = lessons.filter(
      (lesson) => lesson.studentId === student.id && isFutureLesson(lesson)
    );

    const allFutureLessons = lessons.filter(isFutureLesson);

    const availableTargetLessons = allFutureLessons.filter(
      (lesson) => lesson.id !== myLessonId
    );

    const isMyCodeValid = mySwapCode === student.swapCode;

    const mySelectedLesson = myLessonId ? lessons.find(l => l.id === myLessonId) : null;
    const targetSelectedLesson = targetLessonId ? lessons.find(l => l.id === targetLessonId) : null;

    // Sync ref with state for real-time access
    useEffect(() => {
      currentStepRef.current = currentStep;
      console.log('[StudentSwapPanel] currentStepRef updated to:', currentStep);
    }, [currentStep]);

    // Auto-advance to step 2 when valid code is entered
    useEffect(() => {
      if (currentStep === 1 && isMyCodeValid && !hasAutoAdvancedToStep2.current) {
        console.log('[StudentSwapPanel] Auto-advancing to step 2');
        hasAutoAdvancedToStep2.current = true;
        setCurrentStep(2);
      }
    }, [mySwapCode, isMyCodeValid]);

    // Auto-advance to step 3 when my lesson is selected
    useEffect(() => {
      if (currentStep === 2 && myLessonId && !hasAutoAdvancedToStep3.current) {
        console.log('[StudentSwapPanel] Auto-advancing to step 3');
        hasAutoAdvancedToStep3.current = true;
        setCurrentStep(3);
      }
    }, [myLessonId]);

    // Auto-advance to step 4 when target lesson is selected
    useEffect(() => {
      if (currentStep === 3 && targetLessonId && !hasAutoAdvancedToStep4.current) {
        console.log('[StudentSwapPanel] Auto-advancing to step 4');
        hasAutoAdvancedToStep4.current = true;
        setCurrentStep(4);
      }
    }, [targetLessonId]);

    // Reset refs when going back to step 1
    useEffect(() => {
      if (currentStep === 1) {
        hasAutoAdvancedToStep2.current = false;
        hasAutoAdvancedToStep3.current = false;
        hasAutoAdvancedToStep4.current = false;
      }
    }, [currentStep]);

    // Handle lesson click from weekly schedule - auto-detect based on currentStep
    // Use ref to get real-time currentStep value (solves race condition)
    const handleLessonDoubleClick = useCallback((lesson: Lesson) => {
      // Read current step from ref for real-time value
      const step = currentStepRef.current;
      
      console.log('🔍 handleLessonDoubleClick called', { 
        lessonId: lesson.id, 
        lessonStudentId: lesson.studentId,
        currentStudentId: student.id,
        currentStep: step, 
        myLessonId, 
        targetLessonId 
      });

      // Validate future lesson
      if (!isFutureLesson(lesson)) {
        toast({ 
          description: 'ניתן לבחור רק שיעורים עתידיים', 
          variant: 'destructive' 
        });
        return;
      }

      // Auto-detect what to select based on currentStep
      if (step === 2) {
        console.log('📍 Step 2: Selecting MY lesson');
        // Step 2: Select MY lesson
        if (lesson.studentId === student.id) {
          setMyLessonId(lesson.id);
          console.log('✅ MY lesson selected:', lesson.id);
          toast({ description: '✓ השיעור שלי נבחר בהצלחה' });
        } else {
          console.log('❌ Not student lesson:', lesson.studentId, 'vs', student.id);
          toast({ 
            description: 'זה לא השיעור שלך - בחרי שיעור שרשום על שמך', 
            variant: 'destructive' 
          });
        }
      } else if (step === 3) {
        console.log('📍 Step 3: Selecting TARGET lesson');
        // Step 3: Select TARGET lesson
        if (lesson.id !== myLessonId && isFutureLesson(lesson)) {
          setTargetLessonId(lesson.id);
          console.log('✅ TARGET lesson selected:', lesson.id);
          toast({ description: '✓ השיעור המבוקש נבחר בהצלחה' });
        } else {
          console.log('❌ Cannot select:', { isSameAsMyLesson: lesson.id === myLessonId, isFuture: isFutureLesson(lesson) });
          toast({ 
            description: 'לא ניתן לבחור שיעור זה', 
            variant: 'destructive' 
          });
        }
      } else {
        console.log('❌ Not in selection step, currentStep:', step);
        // Not in selection mode
        toast({ 
          description: 'השלימי את השלבים הקודמים', 
          variant: 'destructive' 
        });
      }
    }, [student.id, myLessonId, targetLessonId]);

    // Expose the handler to parent via ref
    useImperativeHandle(ref, () => ({
      handleLessonDoubleClick
    }));

    // Call onMount when component mounts
    useEffect(() => {
      if (onMount) {
        onMount({ handleLessonDoubleClick });
      }
    }, []);

    // Notify parent of step changes
    useEffect(() => {
      console.log('[StudentSwapPanel] Step changed to:', currentStep);
      if (onStepChange) {
        onStepChange(currentStep);
      }
    }, [currentStep, onStepChange]);

    const handleSubmitClick = () => {
      if (!myLessonId || !targetLessonId) {
        toast({
          title: 'שגיאה',
          description: 'יש לבחור שני שיעורים להחלפה',
          variant: 'destructive',
        });
        return;
      }

      if (!isMyCodeValid) {
        toast({
          title: 'שגיאה',
          description: 'קוד ההחלפה שלך שגוי',
          variant: 'destructive',
        });
        return;
      }

      // Show confirmation dialog before proceeding
      setShowConfirmDialog(true);
    };

    const handleConfirmedSubmit = async () => {
      setShowConfirmDialog(false);
      setIsProcessing(true);

      try {
        // Get lessons and students from props
        let myLesson = lessons.find(l => l.id === myLessonId);
        let targetLesson = lessons.find(l => l.id === targetLessonId);

        if (!myLesson || !targetLesson) {
          throw new Error('שיעורים לא נמצאו');
        }

        // Materialize template lessons before creating swap request
        // For swaps, we need to:
        // 1. Create a real lesson for each party at their NEW slot
        // 2. Create a "cancelled" marker at their ORIGINAL slot to prevent template regeneration
        const materializeForSwap = (lesson: Lesson, newStudentId: string): Lesson => {
          // If lesson is not from template, return as-is (no need to materialize)
          if (!lesson.isFromTemplate) return lesson;
          
          // Create a cancelled marker at the original slot to block template regeneration
          addLesson({
            studentId: lesson.studentId,
            date: lesson.date,
            startTime: lesson.startTime,
            endTime: lesson.endTime,
            status: 'cancelled' as const,
            notes: 'שיעור שהוחלף - מיקום מקורי',
            isOneOff: false
          });
          
          // Create a real lesson at this slot with the NEW studentId
          const realLesson = addLesson({
            studentId: newStudentId,
            date: lesson.date,
            startTime: lesson.startTime,
            endTime: lesson.endTime,
            status: 'scheduled' as const,
            isSwapped: true,
            notes: 'שיעור שהוחלף',
            isOneOff: false
          });
          
          return realLesson;
        };

        // For template lessons, we need to handle the swap differently
        const myIsTemplate = myLesson.isFromTemplate;
        const targetIsTemplate = targetLesson.isFromTemplate;

        const targetStudent = students.find(s => s.id === targetLesson.studentId);

        if (!targetStudent) {
          throw new Error('תלמידת יעד לא נמצאה');
        }

        // The other student's swap code is checked by the server (browsers don't get others' codes).
        // The server's approval lets this device's next save move lessons between the two of them.
        const targetCheck = targetSwapCode ? await authorizeSwap(targetStudent.id, targetSwapCode) : 'wrong_code';

        // CRITICAL: Both codes MUST be correct - no pending system
        if (!isMyCodeValid || targetCheck !== 'ok') {
          toast({
            title: 'שגיאה',
            description: targetCheck === 'too_many'
              ? 'יותר מדי ניסיונות. נסי שוב בעוד כמה דקות'
              : targetCheck === 'unavailable'
                ? 'אין חיבור לשרת. נסי שוב'
                : 'שני הקודים חייבים להיות נכונים לביצוע החלפה',
            variant: 'destructive',
          });
          setIsProcessing(false);
          return; // EXIT - no SwapRequest created, no message sent
        }

        // Perform the swap based on whether lessons are from template
        if (myIsTemplate || targetIsTemplate) {
          // At least one is a template - handle by creating proper lessons
          
          // For my slot: create cancelled marker (my original) + real lesson with target's studentId
          if (myIsTemplate) {
            materializeForSwap(myLesson, targetStudent.id);
          } else {
            // My lesson is real - just update studentId
            updateLesson(myLesson.id, { 
              studentId: targetStudent.id, 
              isSwapped: true,
              notes: 'שיעור שהוחלף'
            });
          }
          
          // For target slot: create cancelled marker (target's original) + real lesson with my studentId
          if (targetIsTemplate) {
            materializeForSwap(targetLesson, student.id);
          } else {
            // Target lesson is real - just update studentId
            updateLesson(targetLesson.id, { 
              studentId: student.id, 
              isSwapped: true,
              notes: 'שיעור שהוחלף'
            });
          }
        } else {
          // Both are real lessons - use the standard swap
          const swapStatus: 'approved' = 'approved';
          const swapRequestData: Omit<SwapRequest, 'id' | 'lastModified'> = {
            requesterId: student.id,
            targetId: targetStudent.id,
            date: myLesson.date,
            time: myLesson.startTime,
            targetDate: targetLesson.date,
            targetTime: targetLesson.startTime,
            reason: `החלפה אוטומטית עם שני קודים`,
            status: swapStatus,
            createdAt: new Date().toISOString(),
          };
          const savedRequest = addSwapRequest(swapRequestData);
          performLessonSwap(savedRequest);
        }

        // Format lesson details for success message
        const myLessonDetails = `${format(new Date(myLesson.date), 'dd/MM/yyyy', { locale: he })} בשעה ${myLesson.startTime}`;

        // Send swap notice to all parties
        addMessage({
          senderId: 'system',
          senderName: 'מערכת',
          recipientIds: [student.id, targetStudent.id, 'admin'],
          subject: '✓ שיעור הוחלף',
          content: `שיעור הוחלף בין ${student.firstName} ${student.lastName} ו-${targetStudent.firstName} ${targetStudent.lastName}.\nתאריך: ${myLesson.date}\nשעה: ${myLesson.startTime}`,
          type: 'swap_notice',
          starred: { 
            [student.id]: true, 
            [targetStudent.id]: true, 
            'admin': true 
          },
        });
        
        toast({
          title: 'הצלחה!',
          description: 'ההחלפה בוצעה בהצלחה',
        });

        // Refresh parent component to reload all lessons including templates
        if (onSwapCompleted) {
          onSwapCompleted();
        }

        // Reset form
        setCurrentStep(1);
        setMyLessonId('');
        setMySwapCode('');
        setTargetLessonId('');
        setTargetSwapCode('');
      } catch (error) {
        console.error('Error processing swap:', error);
        toast({
          title: 'שגיאה',
          description: error instanceof Error ? error.message : 'שגיאה בביצוע ההחלפה',
          variant: 'destructive',
        });
      } finally {
        setIsProcessing(false);
      }
    };

    const formatLessonDisplay = (lesson: Lesson | null) => {
      if (!lesson) return null;

      const lessonStudent = students.find((s) => s.id === lesson.studentId);
      const studentName = lessonStudent
        ? `${lessonStudent.firstName} ${lessonStudent.lastName}`
        : 'לא ידוע';

      return (
        <div className="mt-2 p-4 bg-green-50 dark:bg-green-950/20 border-2 border-green-500 rounded-lg">
          <div className="flex justify-between items-start">
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                  <span className="text-white text-sm font-bold">✓</span>
                </div>
                <div className="font-semibold text-green-700 dark:text-green-400">
                  {lesson.date} | {lesson.startTime}-{lesson.endTime}
                </div>
              </div>
              <div className="text-sm text-muted-foreground mr-8">
                {studentName}
              </div>
              {lesson.notes && (
                <div className="text-xs text-muted-foreground mr-8">
                  {lesson.notes}
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (lesson.id === myLessonId) setMyLessonId('');
                if (lesson.id === targetLessonId) setTargetLessonId('');
              }}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      );
    };

    return (
      <>
        <Card className="card-gradient card-shadow mt-6">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <ArrowLeftRight className="h-6 w-6" />
              החלפת שיעורים
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Step 1: Code Entry */}
              <Card className={currentStep === 1 ? 'border-2 border-primary' : 'opacity-60'}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Badge variant={currentStep > 1 ? 'default' : 'outline'}>
                      {currentStep > 1 ? '✓' : '1'}
                    </Badge>
                    הזיני קוד החלפה
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div>
                    <Label>קוד ההחלפה שלי</Label>
                    <Input
                      type="password"
                      placeholder="הזיני קוד החלפה (4 ספרות)"
                      value={mySwapCode}
                      onChange={(e) => setMySwapCode(e.target.value)}
                      maxLength={4}
                      disabled={currentStep > 1}
                    />
                    {mySwapCode && !isMyCodeValid && (
                      <p className="text-sm text-destructive mt-1">קוד שגוי</p>
                    )}
                    {mySwapCode && isMyCodeValid && (
                      <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                        קוד נכון ✓ - עברי לשלב הבא
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Step 2: My Lesson Selection */}
              <Card className={currentStep === 2 ? 'border-2 border-primary' : 'opacity-60'}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Badge variant={currentStep > 2 ? 'default' : currentStep === 2 ? 'outline' : 'secondary'}>
                      {currentStep > 2 ? '✓' : '2'}
                    </Badge>
                    בחרי את השיעור שלך להחלפה
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {currentStep === 2 && !myLessonId && (
                    <div className="p-4 bg-primary/10 border-2 border-primary rounded-lg">
                      <p className="text-center font-semibold">
                        👆 לחצי על השיעור שלך במערכת השעות למעלה
                      </p>
                    </div>
                  )}
                  {formatLessonDisplay(mySelectedLesson)}
                </CardContent>
              </Card>

              {/* Step 3: Target Lesson Selection */}
              <Card className={currentStep === 3 ? 'border-2 border-primary' : 'opacity-60'}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Badge variant={currentStep > 3 ? 'default' : currentStep === 3 ? 'outline' : 'secondary'}>
                      {currentStep > 3 ? '✓' : '3'}
                    </Badge>
                    בחרי את השיעור המבוקש
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {currentStep === 3 && !targetLessonId && (
                    <div className="p-4 bg-primary/10 border-2 border-primary rounded-lg">
                      <p className="text-center font-semibold">
                        👆 לחצי על השיעור המבוקש במערכת השעות למעלה
                      </p>
                    </div>
                  )}
                  {formatLessonDisplay(targetSelectedLesson)}
                </CardContent>
              </Card>

              {/* Step 4: Optional Target Code + Submit */}
              <Card className={currentStep === 4 ? 'border-2 border-primary' : 'opacity-60'}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Badge variant={currentStep === 4 ? 'outline' : 'secondary'}>4</Badge>
                    קוד החלפה של התלמידה השנייה (אופציונלי)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>קוד החלפה של התלמידה השנייה</Label>
                    <Input
                      type="password"
                      placeholder="לאישור אוטומטי - הזיני קוד"
                      value={targetSwapCode}
                      onChange={(e) => setTargetSwapCode(e.target.value)}
                      maxLength={4}
                      disabled={currentStep < 4}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      לשתי התלמידות חייב להיות קוד החלפה נכון. אם אין לך את הקוד של התלמידה השנייה – לא ניתן לבצע החלפה.
                    </p>
                  </div>

                  {/* Submit Button */}
                  <Button
                    onClick={handleSubmitClick}
                    disabled={!myLessonId || !targetLessonId || !isMyCodeValid || isProcessing || currentStep < 4}
                    className="w-full mt-4"
                    size="lg"
                  >
                    {isProcessing ? 'מעבד...' : 'אשר והגש בקשה'}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        {/* Confirmation Dialog */}
        <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>אישור החלפת שיעור</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-4 text-right">
                  <p className="font-semibold text-foreground">הינך מעוניינת להחליף:</p>
                  
                  {mySelectedLesson && (
                    <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                      <p className="font-semibold text-primary">📅 השיעור שלך:</p>
                      <p className="text-sm">
                        {format(new Date(mySelectedLesson.date), 'dd/MM/yyyy', { locale: he })} 
                        {' '}בשעה{' '}
                        {mySelectedLesson.startTime}
                      </p>
                    </div>
                  )}

                  <div className="flex justify-center">
                    <ArrowLeftRight className="h-6 w-6 text-primary" />
                  </div>

                  {targetSelectedLesson && (
                    <div className="p-3 bg-secondary/10 rounded-lg border border-secondary/20">
                      <p className="font-semibold text-secondary-foreground">📅 השיעור המבוקש:</p>
                      <p className="text-sm">
                        {format(new Date(targetSelectedLesson.date), 'dd/MM/yyyy', { locale: he })}
                        {' '}בשעה{' '}
                        {targetSelectedLesson.startTime}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {(() => {
                          const targetStudent = students.find(s => s.id === targetSelectedLesson.studentId);
                          return targetStudent ? `${targetStudent.firstName} ${targetStudent.lastName}` : '';
                        })()}
                      </p>
                    </div>
                  )}

                  <p className="font-semibold text-foreground pt-2">האם את בטוחה?</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row-reverse gap-2">
              <AlertDialogAction onClick={handleConfirmedSubmit}>
                אישור
              </AlertDialogAction>
              <AlertDialogCancel>ביטול</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }
);

StudentSwapPanel.displayName = 'StudentSwapPanel';

export default StudentSwapPanel;
