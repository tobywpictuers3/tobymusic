import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/safe-ui/card';
import { Button } from '@/components/safe-ui/button';
import { Input } from '@/components/safe-ui/input';
import { Label } from '@/components/safe-ui/label';
import { Play, Square, Clock, Trophy, Loader2 } from 'lucide-react';
import { addPracticeSession, getStudentPracticeSessions } from '@/lib/storage';
import { PracticeSession } from '@/lib/types';
import { toast } from '@/hooks/use-toast';
import confetti from 'canvas-confetti';
import { CelebrationToast } from './CelebrationToast';
import PracticeStatsRow from './PracticeStatsRow';
import CompactLeaderboard from './CompactLeaderboard';
import MonthlyAchievements from './MonthlyAchievements';
import PracticeHistory from './PracticeHistory';
import { hybridSync } from '@/lib/hybridSync';
import { 
  getCurrentStreak,
  checkForNewDailyMilestone,
  checkForNewStreakMilestone,
} from '@/lib/medalEngine';

interface PracticeTrackingProps {
  studentId: string;
}

const PracticeTracking = ({ studentId }: PracticeTrackingProps) => {
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualStartTime, setManualStartTime] = useState('');
  const [manualEndTime, setManualEndTime] = useState('');
  const [activeCelebration, setActiveCelebration] = useState<{ message: string; medal: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    loadSessions();
  }, [studentId, refreshKey]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isTracking && startTime) {
      interval = setInterval(() => {
        const now = new Date();
        const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);
        setElapsedSeconds(elapsed);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTracking, startTime]);

  const loadSessions = () => {
    const studentSessions = getStudentPracticeSessions(studentId);
    setSessions(studentSessions);
  };

  const showCelebration = (message: string, medal: string) => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#FFD700', '#FFA500', '#FF6347']
    });
    setActiveCelebration({ message, medal });
  };

  const checkAndShowCelebrations = (dateForCheck: string, newMinutes: number) => {
    const existingTotal = sessions
      .filter(s => s.date === dateForCheck)
      .reduce((sum, s) => sum + s.durationMinutes, 0);
    
    const previousMinutes = existingTotal;
    const newTotal = previousMinutes + newMinutes;
    
    const dailyMilestone = checkForNewDailyMilestone(previousMinutes, newTotal);
    if (dailyMilestone) {
      showCelebration(dailyMilestone.message, dailyMilestone.medal);
      return;
    }
    
    const today = new Date().toISOString().split('T')[0];
    if (dateForCheck === today) {
      const previousStreak = getCurrentStreak(studentId);
      const streakMilestone = checkForNewStreakMilestone(previousStreak - 1, previousStreak);
      if (streakMilestone) {
        showCelebration(streakMilestone.message, streakMilestone.medal);
      }
    }
  };

  const saveWithRetry = async (sessionData: Omit<PracticeSession, 'id' | 'createdAt'>): Promise<boolean> => {
    try {
      setIsSaving(true);
      
      const sessionHash = `${sessionData.studentId}-${sessionData.date}-${sessionData.startTime}-${sessionData.endTime}`;
      const existingSessions = getStudentPracticeSessions(studentId);
      
      const isDuplicate = existingSessions.some(s => 
        `${s.studentId}-${s.date}-${s.startTime}-${s.endTime}` === sessionHash
      );
      
      if (isDuplicate) {
        toast({
          title: '⚠️ אימון כבר קיים',
          description: 'אימון זה כבר נרשם במערכת',
          variant: 'destructive',
          duration: 3000,
        });
        return false;
      }
      
      checkAndShowCelebrations(sessionData.date, sessionData.durationMinutes);
      addPracticeSession(sessionData);
      
      const result = await hybridSync.onDataChange();
      
      if (result.synced) {
        toast({
          title: '✅ נשמר!',
          description: `${sessionData.durationMinutes} דקות נשמרו`,
          duration: 3000,
        });
      } else if (result.success) {
        toast({
          title: '💾 נשמר מקומית',
          description: 'יסונכרן אוטומטית',
          duration: 3000,
        });
      } else {
        toast({
          title: '❌ שמירה נכשלה',
          description: result.message || 'בדקי חיבור',
          variant: 'destructive',
          duration: 4000,
        });
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: '❌ שגיאה',
        variant: 'destructive',
        duration: 4000,
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartTracking = () => {
    setIsTracking(true);
    setStartTime(new Date());
    setElapsedSeconds(0);
    toast({
      title: 'התחלת אימון',
      description: 'בהצלחה!',
    });
  };

  const handleStopTracking = async () => {
    if (!startTime) return;

    const endTime = new Date();
    const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

    if (durationMinutes < 1) {
      toast({
        title: 'אימון קצר מדי',
        variant: 'destructive',
      });
      setIsTracking(false);
      setStartTime(null);
      return;
    }

    const sessionData = {
      studentId,
      date: new Date().toISOString().split('T')[0],
      startTime: startTime.toTimeString().slice(0, 5),
      endTime: endTime.toTimeString().slice(0, 5),
      durationMinutes,
    };

    const saved = await saveWithRetry(sessionData);
    setIsTracking(false);
    setStartTime(null);
    setElapsedSeconds(0);

    if (saved) {
      setRefreshKey(k => k + 1);
    }
  };

  const handleManualEntry = async () => {
    if (!manualStartTime || !manualEndTime || !manualDate) {
      toast({
        title: 'שגיאה',
        description: 'יש למלא את כל השדות',
        variant: 'destructive',
      });
      return;
    }

    const [startHour, startMin] = manualStartTime.split(':').map(Number);
    const [endHour, endMin] = manualEndTime.split(':').map(Number);
    const durationMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);

    if (durationMinutes <= 0) {
      toast({
        title: 'שגיאה',
        description: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה',
        variant: 'destructive',
      });
      return;
    }

    const sessionData = {
      studentId,
      date: manualDate,
      startTime: manualStartTime,
      endTime: manualEndTime,
      durationMinutes,
    };

    const saved = await saveWithRetry(sessionData);

    if (saved) {
      setManualStartTime('');
      setManualEndTime('');
      setManualDate(new Date().toISOString().split('T')[0]);
      setRefreshKey(k => k + 1);
    }
  };

  return (
    <>
      {activeCelebration && (
        <CelebrationToast
          message={activeCelebration.message}
          medal={activeCelebration.medal}
          onClose={() => setActiveCelebration(null)}
        />
      )}
      
      <div className="space-y-4">
        {/* 1. Practice Tracking Card */}
        <Card className="card-gradient">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trophy className="h-5 w-5" />
              מעקב אימונים
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-center gap-4">
              {!isTracking ? (
                <Button
                  size="lg"
                  onClick={handleStartTracking}
                  className="hero-gradient"
                >
                  <Play className="h-5 w-5 mr-2" />
                  התחלת אימון
                </Button>
              ) : (
                <div className="text-center space-y-3">
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2 text-base font-semibold">
                      <Clock className="h-4 w-4 animate-pulse text-primary" />
                      אימון פעיל
                    </div>
                    <div className="text-3xl font-bold text-primary" dir="ltr">
                      {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, '0')}
                    </div>
                  </div>
                  <Button
                    size="default"
                    variant="destructive"
                    onClick={handleStopTracking}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        שומר...
                      </>
                    ) : (
                      <>
                        <Square className="h-4 w-4 mr-2" />
                        סיום אימון
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

            <div className="border-t pt-3">
              <h3 className="font-semibold text-sm mb-2">הזנה ידנית</h3>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <Label htmlFor="manualDate" className="text-xs">תאריך</Label>
                  <Input
                    id="manualDate"
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="manualStart" className="text-xs">התחלה</Label>
                  <Input
                    id="manualStart"
                    type="time"
                    value={manualStartTime}
                    onChange={(e) => setManualStartTime(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="manualEnd" className="text-xs">סיום</Label>
                  <Input
                    id="manualEnd"
                    type="time"
                    value={manualEndTime}
                    onChange={(e) => setManualEndTime(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex items-end">
                  <Button 
                    onClick={handleManualEntry} 
                    className="w-full h-8 text-sm"
                    disabled={isSaving}
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'רישום'}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. Stats Row - horizontal KPIs */}
        <PracticeStatsRow studentId={studentId} />

        {/* 3. Compact 6-category Leaderboard */}
        <CompactLeaderboard />

        {/* 4. Monthly Achievements */}
        <MonthlyAchievements studentId={studentId} />

        {/* 5. Practice History */}
        <PracticeHistory 
          studentId={studentId} 
          refreshKey={refreshKey}
          onRefresh={() => setRefreshKey(k => k + 1)}
        />
      </div>
    </>
  );
};

export default PracticeTracking;
