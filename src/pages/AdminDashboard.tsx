import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  LogOut, Users, Calendar, CreditCard, MessageSquare,
  FileText, Settings, Music, History, Trophy, Phone
} from 'lucide-react';
import {
  setCurrentUser, getCurrentUser,
  clearPracticeAndMedalData, setDevMode
} from '@/lib/storage';
import { toast } from '@/hooks/use-toast';
import { hybridSync } from '@/lib/hybridSync';
import { PrintPDFButton } from '@/components/ui/print-pdf-button';
import { SaveButton } from '@/components/ui/save-button';
import { UnreadMessagesBadge } from '@/components/ui/unread-messages-badge';
import SyncStatusBadge from '@/components/ui/SyncStatusBadge';
import { clearClientCaches } from '@/lib/cacheManager';
import { ThemeToggle } from '@/brand/ThemeToggle';
import { DateModeProvider, useDateMode } from '@/contexts/DateModeContext';

import StudentsManagement from '@/components/admin/StudentsManagement';
import LessonJournal from '@/components/admin/LessonJournal';
import Metronome from './Metronome';
import PaymentManagement from '@/components/admin/PaymentManagement';
import PerformancesManagement from '@/components/admin/PerformancesManagement';
import BackupImport from '@/components/admin/BackupImport';
import BackupHistory from '@/components/admin/BackupHistory';
import AdminPracticeStats from '@/components/admin/AdminPracticeStats';
import MessagingTab from '@/components/admin/MessagingTab';
import GlobalMessageAdminTools from '@/components/admin/GlobalMessageAdminTools';
import FixedScheduleTab from '@/components/admin/FixedScheduleTab';
import YemotSettingsCard from '@/components/admin/YemotSettingsCard';

/** רקעי סקשן מותג — אותה תמונת "במה ריקה" המשמשת באתר הראשי (tobymusic.club),
    כדי לשמור על שפה עיצובית אחידה בין הפלטפורמות (במקום 4 תמונות רקע שלא קיימות באתר) */
const BRAND_BGS = ["/assets/stage/empty-dark.webp"];

const BrandSection = ({ index, children }: { index: number; children: React.ReactNode }) => {
  const bg = BRAND_BGS[index % BRAND_BGS.length];
  return (
    <div
      className="relative rounded-xl overflow-hidden"
      style={{
        backgroundImage: `url(${bg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0 bg-white/60 dark:bg-transparent pointer-events-none" />
      <div className="relative z-10 p-4">{children}</div>
    </div>
  );
};

function DateToggle() {
  const { dateMode, setDateMode } = useDateMode();
  return (
    <button
      onClick={() => setDateMode(dateMode === 'gregorian' ? 'hebrew' : 'gregorian')}
      className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium bg-background hover:bg-muted transition-colors"
      title="החלף בין תצוגת תאריך לועזי / עברי"
    >
      {dateMode === 'gregorian' ? 'לועזי' : 'עברי'}
    </button>
  );
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const isStorybook = typeof window !== 'undefined' && window.location?.port === '6006';
  const [activeTab, setActiveTab] = useState('journal');

  const [user, setUser] = useState<any>(() => {
    const existing = getCurrentUser();
    if (existing) return existing;
    if (isStorybook) return { id: 'storybook-admin', type: 'admin', name: 'Storybook Admin' } as any;
    return null;
  });

  useEffect(() => {
    const isDevMode = sessionStorage.getItem('musicSystem_devMode') === 'true';
    if (isDevMode) setDevMode(true);
  }, []);

  useEffect(() => {
    if (!isStorybook) return;
    try {
      const existing = getCurrentUser();
      if (!existing || existing.type !== 'admin') {
        const mockAdmin = { id: 'storybook-admin', type: 'admin', name: 'Storybook Admin' } as any;
        setCurrentUser(mockAdmin);
        setUser(mockAdmin);
      } else {
        setUser(existing);
      }
      sessionStorage.setItem('musicSystem_devMode', 'true');
      setDevMode(true);
      window.history.replaceState({}, '', '/admin/default');
    } catch {
      /* no-op */
    }
  }, [isStorybook]);

  const getTabName = (tab: string) => {
    const tabNames: Record<string, string> = {
      journal: 'יומן שיעורים',
      students: 'תלמידות',
      payments: 'תשלומים',
      performances: 'הופעות',
      practice: 'נתוני אימונים',
      messages: 'תקשורת',
      yemot: 'ימות המשיח',
      backup: 'גיבוי',
      'fixed-schedule': 'מערכת קבועה',
      history: 'היסטוריה'
    };
    return tabNames[tab] || 'תצוגה';
  };

  useEffect(() => {
    if (!user || user.type !== 'admin') {
      if (isStorybook) return;
      navigate('/');
    }
  }, [user, isStorybook, navigate]);

  if (!user || user.type !== 'admin') return null;

  const handleLogout = async () => {
    await clearClientCaches();
    sessionStorage.removeItem('musicSystem_devMode');
    setDevMode(false);
    setCurrentUser(null);
    setUser(null);
    navigate('/');
    toast({ title: 'התנתקות מוצלחת', description: 'נתראה בפעם הבאה!' });
  };

  const handleClearPracticeData = () => {
    const confirmClear = window.confirm(
      '⚠️ האם את בטוחה שברצונך למחוק את כל נתוני האימונים והמדליות?\n\n' +
      'הפעולה תמחק:\n✗ כל שיעורי האימון הרשומים\n✗ כל ההישגים החודשיים\n✗ כל המדליות שנצברו\n\nפעולה זו לא ניתנת לביטול!'
    );

    if (confirmClear) {
      try {
        clearPracticeAndMedalData();
        toast({
          title: '✅ הנתונים נמחקו בהצלחה',
          description: 'כל נתוני האימונים והמדליות נמחקו. הדף יתרענן.'
        });
        setTimeout(() => window.location.reload(), 1500);
      } catch (error) {
        toast({
          title: '❌ שגיאה במחיקת הנתונים',
          description: 'אירעה תקלה. נסי שוב.',
          variant: 'destructive'
        });
      }
    }
  };

  return (
    <DateModeProvider>
      <div className="relative z-10 min-h-screen musical-gradient overflow-hidden page-enter">
        {/* Sticky Header */}
        <div className="sticky top-0 z-50 bg-gradient-to-b from-background via-background to-background/95 backdrop-blur-sm border-b border-primary/20 shadow-lg">
          <div className="container mx-auto p-2 sm:p-4">
            <div className="card-gradient card-shadow rounded-xl p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <h1 className="text-lg sm:text-2xl md:text-3xl font-bold text-gold title-glow text-center sm:text-right leading-tight">
                  <span className="block sm:inline">דשבורד ניהול</span>
                  <span className="hidden sm:inline"> - מערכת שיעורי נגינה</span>
                </h1>

                <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center justify-center sm:justify-end">
                  <DateToggle />
                  <ThemeToggle />
                  <UnreadMessagesBadge userId="admin" />
                  <SyncStatusBadge />

                  <div className="relative">
                    <SaveButton />
                    <div className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                    </div>
                  </div>

                  <PrintPDFButton contentId="main-content" tabName={getTabName(activeTab)} />

                  <Button
                    onClick={handleLogout}
                    variant="outline"
                    size="sm"
                    className="border-gold text-wine hover:bg-destructive hover:text-primary-foreground h-9 sm:h-10"
                  >
                    <LogOut className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">התנתק</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="max-h-screen overflow-y-auto">
          <div id="main-content" className="container mx-auto p-4 space-y-6 pt-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList
                dir="ltr"
                className="w-full h-auto card-gradient card-shadow rounded-xl justify-start overflow-x-auto overflow-y-hidden p-1 gap-1 scrollbar-thin"
              >
                <TabsTrigger value="journal" className="shrink-0 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-2 min-h-[40px]">
                  <Calendar className="h-4 w-4" />
                  יומן שיעורים
                </TabsTrigger>

                <TabsTrigger value="students" className="shrink-0 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-2 min-h-[40px]">
                  <Users className="h-4 w-4" />
                  תלמידות
                </TabsTrigger>

                <TabsTrigger value="payments" className="shrink-0 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-2 min-h-[40px]">
                  <CreditCard className="h-4 w-4" />
                  תשלומים
                </TabsTrigger>

                <TabsTrigger value="performances" className="shrink-0 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-2 min-h-[40px]">
                  <Music className="h-4 w-4" />
                  הופעות
                </TabsTrigger>

                <TabsTrigger value="practice" className="shrink-0 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-2 min-h-[40px]">
                  <Trophy className="h-4 w-4" />
                  נתוני אימונים
                </TabsTrigger>

                <TabsTrigger value="messages" className="shrink-0 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-2 min-h-[40px]">
                  <MessageSquare className="h-4 w-4" />
                  תקשורת
                </TabsTrigger>

                <TabsTrigger value="yemot" className="shrink-0 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-2 min-h-[40px]">
                  <Phone className="h-4 w-4" />
                  ימות המשיח
                </TabsTrigger>

                <TabsTrigger value="aids" className="shrink-0 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap">
                  <span>🎵</span>
                  <span className="hidden sm:inline">עזרים</span>
                </TabsTrigger>

                <TabsTrigger value="backup" className="shrink-0 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-2 min-h-[40px]">
                  <FileText className="h-4 w-4" />
                  גיבוי
                </TabsTrigger>

                <TabsTrigger value="fixed-schedule" className="shrink-0 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-2 min-h-[40px]">
                  <Settings className="h-4 w-4" />
                  מערכת קבועה
                </TabsTrigger>

                <TabsTrigger value="history" className="shrink-0 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-2 min-h-[40px]">
                  <History className="h-4 w-4" />
                  היסטוריה
                </TabsTrigger>
              </TabsList>

              <TabsContent value="students" className="fade-slide-in">
                <BrandSection index={0}>
                  <StudentsManagement />
                </BrandSection>
              </TabsContent>

              <TabsContent value="journal" className="fade-slide-in">
                <BrandSection index={1}>
                  <LessonJournal />
                </BrandSection>
              </TabsContent>

              <TabsContent value="fixed-schedule" className="fade-slide-in">
                <BrandSection index={2}>
                  <FixedScheduleTab />
                </BrandSection>
              </TabsContent>

              <TabsContent value="payments" className="fade-slide-in">
                <BrandSection index={3}>
                  <PaymentManagement />
                </BrandSection>
              </TabsContent>

              <TabsContent value="performances" className="fade-slide-in">
                <BrandSection index={0}>
                  <PerformancesManagement />
                </BrandSection>
              </TabsContent>

              <TabsContent value="practice" className="fade-slide-in">
                <BrandSection index={1}>
                  <AdminPracticeStats />
                </BrandSection>
              </TabsContent>

              <TabsContent value="messages" className="fade-slide-in">
                <BrandSection index={2}>
                  <GlobalMessageAdminTools />
                  <MessagingTab />
                </BrandSection>
              </TabsContent>

              <TabsContent value="yemot" className="fade-slide-in">
                <BrandSection index={3}>
                  <YemotSettingsCard />
                </BrandSection>
              </TabsContent>

              <TabsContent value="aids" className="fade-slide-in">
                <Metronome />
              </TabsContent>

              <TabsContent value="backup" className="fade-slide-in">
                <div className="space-y-6">
                  <BrandSection index={3}>
                    <div>
                      <h2 className="text-xl font-bold text-gold mb-4">ניקוי נתוני אימונים ומדליות</h2>
                      <p className="text-sm text-foreground mb-4">
                        לחצי על הכפתור למטה כדי למחוק את כל נתוני האימונים, ההישגים החודשיים והמדליות.
                        פעולה זו תאפשר להתחיל מחדש מנקודת שוויון.
                      </p>
                      <Button onClick={handleClearPracticeData} variant="destructive" className="w-full sm:w-auto">
                        🧹 מחק כל נתוני אימונים ומדליות
                      </Button>
                    </div>
                  </BrandSection>

                  <BackupImport />
                </div>
              </TabsContent>

              <TabsContent value="history" className="fade-slide-in">
                <BrandSection index={0}>
                  <BackupHistory />
                </BrandSection>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </DateModeProvider>
  );
};

export default AdminDashboard;
