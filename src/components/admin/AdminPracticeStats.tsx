import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/safe-ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/safe-ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/safe-ui/select';
import { Input } from '@/components/safe-ui/input';
import { Label } from '@/components/safe-ui/label';
import { Badge } from '@/components/safe-ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/safe-ui/tabs';
import { TrendingUp, Trophy, Flame, Calendar, User, ShoppingBag } from 'lucide-react';
import { getStudents, getPracticeSessions, getStudentPracticeSessions, getStudentMedalRecords, getStudentStatistics } from '@/lib/storage';
import { Student, PracticeSession } from '@/lib/types';
import { recalcAllForStudent } from '@/lib/practiceEngine';
import { getCurrentStreak } from '@/lib/medalEngine';
import AdminStoreManagement from './AdminStoreManagement';
import { useDateMode } from '@/contexts/DateModeContext';

interface LeaderboardEntry {
  studentId: string;
  studentName: string;
  totalMinutes: number;
  maxDailyMinutes: number;
  maxStreak: number;
}

const AdminPracticeStats = () => {
  const { formatDate } = useDateMode();
  const [students, setStudents] = useState<Student[]>([]);
  const [viewMode, setViewMode] = useState<'leaderboard' | 'student' | 'daily'>('leaderboard');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [studentSessions, setStudentSessions] = useState<PracticeSession[]>([]);
  const [dailySessions, setDailySessions] = useState<PracticeSession[]>([]);
  const [activeTab, setActiveTab] = useState<'stats' | 'store'>('stats');

  useEffect(() => {
    const allStudents = getStudents();
    setStudents(allStudents);
    calculateLeaderboard(allStudents);
  }, []);

  useEffect(() => {
    if (viewMode === 'student' && selectedStudentId) {
      loadStudentData();
    } else if (viewMode === 'daily') {
      loadDailyData();
    }
  }, [viewMode, selectedStudentId, selectedDate, endDate]);

  const calculateLeaderboard = (studentList: Student[]) => {
    const entries: LeaderboardEntry[] = studentList.map(student => {
      const sessions = getStudentPracticeSessions(student.id);
      
      // Calculate total minutes
      const totalMinutes = sessions.reduce((sum, s) => sum + s.durationMinutes, 0);

      // Try cache first
      const cached = getStudentStatistics(student.id);
      let maxDailyMinutes: number;

      // Use medalEngine for streak (derived, not stored)
      const maxStreak = getCurrentStreak(student.id);
      
      if (cached) {
        maxDailyMinutes = cached.maxDaily;
      } else {
        const stats = recalcAllForStudent(student.id);
        maxDailyMinutes = stats.maxDaily;
      }

      return {
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        totalMinutes,
        maxDailyMinutes,
        maxStreak,
      };
    });

    // Sort by max daily minutes descending
    entries.sort((a, b) => b.maxDailyMinutes - a.maxDailyMinutes);
    setLeaderboard(entries);
  };

  const loadStudentData = () => {
    if (!selectedStudentId) return;
    const sessions = getStudentPracticeSessions(selectedStudentId);
    setStudentSessions(sessions.sort((a, b) => b.date.localeCompare(a.date)));
  };

  const loadDailyData = () => {
    const allSessions = getPracticeSessions();
    const filtered = allSessions.filter(s => {
      return s.date >= selectedDate && s.date <= endDate;
    });
    setDailySessions(filtered.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)));
  };

  const getStudentName = (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    return student ? `${student.firstName} ${student.lastName}` : 'לא ידוע';
  };

  const getMedalsForStudent = (studentId: string) => {
    const medals = getStudentMedalRecords(studentId);
    return medals.filter(m => !m.used);
  };

  return (
    <div className="space-y-6">
      {/* Main Tabs for Stats vs Store */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'stats' | 'store')}>
        <TabsList className="mb-4">
          <TabsTrigger value="stats" className="gap-2">
            <Trophy className="h-4 w-4" />
            לוח מצטיינות
          </TabsTrigger>
          <TabsTrigger value="store" className="gap-2">
            <ShoppingBag className="h-4 w-4" />
            חנות
          </TabsTrigger>
        </TabsList>

        <TabsContent value="store">
          <AdminStoreManagement />
        </TabsContent>

        <TabsContent value="stats">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5" />
                נתוני אימונים - מערכת ניהול
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <Label>בחרי תצוגה</Label>
                  <Select value={viewMode} onValueChange={(v: any) => setViewMode(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="leaderboard">לוח מצטיינות כללי</SelectItem>
                      <SelectItem value="student">היסטוריה לפי תלמידה</SelectItem>
                      <SelectItem value="daily">אימונים לפי תאריך</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {viewMode === 'student' && (
                  <div className="flex-1">
                    <Label>בחרי תלמידה</Label>
                    <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                      <SelectTrigger>
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
                  </div>
                )}

                {viewMode === 'daily' && (
                  <>
                    <div className="flex-1">
                      <Label>מתאריך</Label>
                      <Input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                      />
                    </div>
                    <div className="flex-1">
                      <Label>עד תאריך</Label>
                      <Input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Leaderboard View */}
          {viewMode === 'leaderboard' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  לוח מצטיינות כללי
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">מקום</TableHead>
                      <TableHead className="text-right">שם</TableHead>
                      <TableHead className="text-right">סה"כ דקות אימון</TableHead>
                      <TableHead className="text-right">מקסימום יומי</TableHead>
                      <TableHead className="text-right">רצף מקסימלי</TableHead>
                      <TableHead className="text-right">מדליות פעילות</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaderboard.map((entry, index) => (
                      <TableRow key={entry.studentId}>
                        <TableCell className="font-bold">
                          {index === 0 && '🥇'}
                          {index === 1 && '🥈'}
                          {index === 2 && '🥉'}
                          {index > 2 && `#${index + 1}`}
                        </TableCell>
                        <TableCell className="font-medium">{entry.studentName}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{entry.totalMinutes} דק'</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-green-500 text-green-700">
                            {entry.maxDailyMinutes} דק'
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-orange-500 text-orange-700">
                            {entry.maxStreak} ימים
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="default">
                            {getMedalsForStudent(entry.studentId).length} 🏅
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Student History View */}
          {viewMode === 'student' && selectedStudentId && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  היסטוריית אימונים - {getStudentName(selectedStudentId)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="text-center p-4 bg-background/50 rounded-lg border">
                      <div className="text-sm text-muted-foreground mb-2">סה"כ אימונים</div>
                      <div className="text-2xl font-bold text-primary">
                        {studentSessions.length}
                      </div>
                    </div>
                    <div className="text-center p-4 bg-background/50 rounded-lg border">
                      <div className="text-sm text-muted-foreground mb-2">סה"כ דקות</div>
                      <div className="text-2xl font-bold text-blue-600">
                        {studentSessions.reduce((sum, s) => sum + s.durationMinutes, 0)} דק'
                      </div>
                    </div>
                    <div className="text-center p-4 bg-background/50 rounded-lg border">
                      <div className="text-sm text-muted-foreground mb-2">מדליות פעילות</div>
                      <div className="text-2xl font-bold text-yellow-600">
                        {getMedalsForStudent(selectedStudentId).length} 🏅
                      </div>
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">תאריך</TableHead>
                        <TableHead className="text-right">שעה</TableHead>
                        <TableHead className="text-right">משך (דק')</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {studentSessions.map((session) => (
                        <TableRow key={session.id}>
                          <TableCell>{formatDate(session.date)}</TableCell>
                          <TableCell>
                            {session.startTime && session.endTime 
                              ? `${session.startTime} - ${session.endTime}`
                              : 'לא רשום'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{session.durationMinutes} דק'</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Daily Sessions View */}
          {viewMode === 'daily' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  אימונים בטווח התאריכים
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4 p-4 bg-background/50 rounded-lg border">
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground mb-2">סה"כ אימונים בטווח</div>
                    <div className="text-3xl font-bold text-primary">
                      {dailySessions.length} אימונים
                    </div>
                    <div className="text-lg text-muted-foreground mt-2">
                      {dailySessions.reduce((sum, s) => sum + s.durationMinutes, 0)} דקות סה"כ
                    </div>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">תלמידה</TableHead>
                      <TableHead className="text-right">תאריך</TableHead>
                      <TableHead className="text-right">שעה</TableHead>
                      <TableHead className="text-right">משך (דק')</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailySessions.map((session) => (
                      <TableRow key={session.id}>
                        <TableCell className="font-medium">
                          {getStudentName(session.studentId)}
                        </TableCell>
                        <TableCell>{formatDate(session.date)}</TableCell>
                        <TableCell>
                          {session.startTime && session.endTime 
                            ? `${session.startTime} - ${session.endTime}`
                            : 'לא רשום'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{session.durationMinutes} דק'</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminPracticeStats;
