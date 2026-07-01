import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { LogOut, Calendar, User, Phone, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { getCurrentUser, setCurrentUser, getStudents } from "@/lib/storage";
import { toast } from "@/hooks/use-toast";
import { Student, Lesson } from "@/lib/types";
import { getAllLessonsIncludingTemplates } from "@/lib/lessonUtils";
import { clearClientCaches } from "@/lib/cacheManager";
import { ThemeToggle } from "@/brand/ThemeToggle";
import { ASSETS } from "@/brand/assets";

import EditableStudentDetails from "@/components/student/EditableStudentDetails";
import GeneralWeeklySchedule from "@/components/student/GeneralWeeklySchedule";
import ContactsList from "@/components/student/ContactsList";
import StudentFiles from "@/components/student/StudentFiles";
import PaymentAlert from "@/components/student/PaymentAlert";
import LessonHistory from "@/components/student/LessonHistory";
import PracticeTracking from "@/components/student/PracticeTracking";
import MessagesTopRow from "@/components/student/MessagesTopRow";
import GmailStyleMessages from "@/components/student/GmailStyleMessages";
import MedalCollection from "@/components/student/MedalCollection";
import MedalStore from "@/components/student/MedalStore";
import BackButton from "@/components/ui/back-button";
import { SaveButton } from "@/components/ui/save-button";
import { UnreadMessagesBadge } from "@/components/ui/unread-messages-badge";
import SyncStatusBadge from "@/components/ui/SyncStatusBadge";

import Metronome from "./Metronome";

import StudentSwapPanel, {
  StudentSwapPanelRef,
} from "@/components/student/lessonSwap/StudentSwapPanel";

/** Brand section backgrounds in order */
const BRAND_BGS = [
  ASSETS.backgrounds.red,
  ASSETS.backgrounds.gold,
  ASSETS.backgrounds.ard,
  ASSETS.backgrounds.lightGold,
];

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
      {/* Light mode: white overlay for 40% saturation. Dark mode: full saturation */}
      <div className="absolute inset-0 bg-white/60 dark:bg-transparent pointer-events-none" />
      <div className="relative z-10 p-4">{children}</div>
    </div>
  );
};


function StudentDateToggle() {
  const { dateMode, setDateMode } = useDateMode();
  return (
    <button
      onClick={() => setDateMode(dateMode === 'gregorian' ? 'hebrew' : 'gregorian')}
      className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium bg-background hover:bg-muted transition-colors"
      title="החלף תצוגת תאריך"
    >{dateMode === 'gregorian' ? 'ע"ב / לו' : 'לו / ע"ב'}</button>
  );
}

const StudentDashboard = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();

  const [student, setStudent] = useState<Student | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [activeTab, setActiveTab] = useState("practice");
  const [showAllMessages, setShowAllMessages] = useState(false);

  const [swapPanelRef, setSwapPanelRef] = useState<StudentSwapPanelRef | null>(null);
  const [currentSwapStep, setCurrentSwapStep] = useState<1 | 2 | 3 | 4>(1);
  const [isSwapSelectionActive, setIsSwapSelectionActive] = useState(false);

  useEffect(() => {
    setLessons(getAllLessonsIncludingTemplates());
  }, []);

  const refreshLessons = () => {
    setLessons(getAllLessonsIncludingTemplates());
  };

  useEffect(() => {
    setIsSwapSelectionActive(currentSwapStep === 2 || currentSwapStep === 3);
  }, [currentSwapStep]);

  useEffect(() => {
    const load = async () => {
      try {
        if (studentId === "public") { navigate("/", { replace: true }); return; }
        const current = getCurrentUser();
        if (!current) { navigate("/", { replace: true }); return; }
        const students = getStudents();
        const found = students.find((s) => s?.id === studentId);
        if (!found) {
          toast({ title: "תלמיד לא נמצא", description: "לא נמצאו פרטי תלמיד עבור הקישור הזה.", variant: "destructive" });
          navigate("/", { replace: true });
          return;
        }
        setStudent(found);
        setLessons(getAllLessonsIncludingTemplates());
      } catch (e) {
        console.error(e);
        toast({ title: "שגיאה", description: "לא הצלחנו לטעון את האזור האישי.", variant: "destructive" });
        navigate("/", { replace: true });
      }
    };
    load();
  }, [studentId, navigate]);

  const handleLogout = () => {
    setCurrentUser(null);
    clearClientCaches();
    toast({ title: "התנתקת בהצלחה" });
    navigate("/", { replace: true });
  };

  const handleStudentUpdate = () => {
    const students = getStudents();
    const found = students.find((s) => s?.id === student?.id);
    if (found) setStudent(found);
  };

  const handleLessonDoubleClick = (lesson: Lesson) => {
    swapPanelRef?.handleLessonDoubleClick(lesson);
  };

  if (!student) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-lg font-semibold">טוען אזור אישי…</div>
          <div className="text-sm text-muted-foreground mt-2">רגע אחד</div>
        </div>
      </div>
    );
  }

  const allStudents = getStudents();

  return (
    <DateModeProvider>
    <div className="relative z-10 min-h-screen p-4 md:p-8 space-y-6 page-enter">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <div className="text-xl md:text-2xl font-bold title-glow">
              אזור אישי — {student.firstName} {student.lastName}
            </div>
            <div className="text-sm text-muted-foreground">ID: {student.id}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap justify-end">
          <StudentDateToggle />
                <ThemeToggle />
          <UnreadMessagesBadge userId={student.id} />
          <SyncStatusBadge />
          <SaveButton />
          <Button variant="outline" onClick={handleLogout} className="gap-2">
            <LogOut className="w-4 h-4" />
            התנתקות
          </Button>
        </div>
      </div>

      {/* Top messages row — equal-width across full width */}
      <MessagesTopRow
        studentId={student.id}
        studentName={`${student.firstName} ${student.lastName}`}
      />

      <PaymentAlert studentId={student.id} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-10 gap-2 h-auto">
          <TabsTrigger value="practice">מעקב אימונים</TabsTrigger>
          <TabsTrigger value="schedule" className="gap-2">
            <Calendar className="w-4 h-4" />
            מערכת שבועית
          </TabsTrigger>
          <TabsTrigger value="aids">עזרים</TabsTrigger>
          <TabsTrigger value="medals">המדליות שלי</TabsTrigger>
          <TabsTrigger value="store">חנות</TabsTrigger>
          <TabsTrigger value="history">היסטוריית שיעורים</TabsTrigger>
          <TabsTrigger value="messages" className="gap-2">
            <FileText className="w-4 h-4" />
            הודעות
          </TabsTrigger>
          <TabsTrigger value="details" className="gap-2">
            <User className="w-4 h-4" />
            פרטים שלי
          </TabsTrigger>
          <TabsTrigger value="contacts" className="gap-2">
            <Phone className="w-4 h-4" />
            אנשי קשר
          </TabsTrigger>
          <TabsTrigger value="files">קבצים</TabsTrigger>
        </TabsList>

        <TabsContent value="practice" className="fade-slide-in space-y-6">
          <BrandSection index={0}>
            <PracticeTracking studentId={student.id} />
          </BrandSection>
        </TabsContent>

        <TabsContent value="schedule" className="fade-slide-in space-y-6">
          <BrandSection index={0}>
            <GeneralWeeklySchedule
              studentId={student.id}
              lessons={lessons}
              onLessonDoubleClick={handleLessonDoubleClick}
              isSelectionActive={isSwapSelectionActive}
              currentSwapStep={currentSwapStep}
            />
          </BrandSection>

          <BrandSection index={1}>
            <StudentSwapPanel
              student={student}
              lessons={lessons}
              students={allStudents}
              onMount={(ref) => setSwapPanelRef(ref)}
              onStepChange={(step) => setCurrentSwapStep(step)}
              onSwapCompleted={() => refreshLessons()}
            />
          </BrandSection>
        </TabsContent>

        <TabsContent value="aids" className="fade-slide-in space-y-6">
          <Metronome />
        </TabsContent>

        <TabsContent value="medals" className="fade-slide-in space-y-6">
          <BrandSection index={0}>
            <MedalCollection studentId={student.id} />
          </BrandSection>
        </TabsContent>

        <TabsContent value="store" className="fade-slide-in space-y-6">
          <BrandSection index={1}>
            <MedalStore studentId={student.id} />
          </BrandSection>
        </TabsContent>

        <TabsContent value="history" className="fade-slide-in space-y-6">
          <BrandSection index={2}>
            <LessonHistory student={student} />
          </BrandSection>
        </TabsContent>

        <TabsContent value="messages" className="fade-slide-in space-y-6">
          <GmailStyleMessages
            studentId={student.id}
            studentName={`${student.firstName} ${student.lastName}`}
          />
        </TabsContent>

        <TabsContent value="details" className="fade-slide-in space-y-6">
          <BrandSection index={3}>
            <EditableStudentDetails student={student} onUpdate={handleStudentUpdate} />
          </BrandSection>
        </TabsContent>

        <TabsContent value="contacts" className="fade-slide-in space-y-6">
          <ContactsList />
        </TabsContent>

        <TabsContent value="files" className="fade-slide-in space-y-6">
          <StudentFiles studentId={student.id} />
        </TabsContent>
      </Tabs>
    </div>
  </DateModeProvider>
  );
};

export default StudentDashboard;
