import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Mail, Phone, MessageCircle } from "lucide-react";
import { getStudents, setCurrentUser, setDevMode } from "@/lib/storage";
import { toast } from "@/hooks/use-toast";
import { useAccessMode } from "@/contexts/AccessModeContext";
import { ThemeToggle } from "@/brand/ThemeToggle";
import { SiteLink } from "@/brand/SiteLink";
import { ASSETS } from "@/brand/assets";
import BsiataDishmaya from "@/components/ui/BsiataDishmaya";
import { verifyAdminCode, verifyDevCode, verifyPublicCode } from "@/lib/authCodes";

const Homepage = () => {
  const [adminCode, setAdminCode] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const navigate = useNavigate();
  const { setAccessMode } = useAccessMode();

  const handleAdminLogin = async () => {
    if (verifyAdminCode(adminCode)) {
      setDevMode(false);
      sessionStorage.removeItem("musicSystem_devMode");
      setCurrentUser({ type: "admin", adminCode });
      navigate("/admin");
      toast({ title: "ברוך הבא!", description: "התחברת כמנהל מערכת" });
    } else {
      toast({ title: "שגיאה", description: "קוד מנהל שגוי", variant: "destructive" });
    }
  };

  const handleDevAdminLogin = async () => {
    if (verifyDevCode(adminCode)) {
      setDevMode(true);
      sessionStorage.setItem("musicSystem_devMode", "true");
      setCurrentUser({ type: "admin", adminCode });
      navigate("/dev-admin");
      toast({ title: "🔧 מצב מפתחים", description: "נכנסת למצב מפתחים מבודד (ללא Worker)" });
    } else {
      toast({ title: "שגיאה", description: "קוד מפתחים שגוי", variant: "destructive" });
    }
  };

  const handleStudentLogin = () => {
    if (!studentCode.trim()) {
      toast({ title: "שגיאה", description: "אנא הקישי את הקוד האישי שלך", variant: "destructive" });
      return;
    }

    if (verifyPublicCode(studentCode.trim())) {
      setAccessMode("public");
      setCurrentUser({ type: "public_view" });
      navigate("/student/public");
      toast({ title: "מצב תצוגה כללית", description: "נכנסת למצב צפייה בלבד" });
      return;
    }

    const students = getStudents();
    let student = students.find((s) => s.personalCode === studentCode.trim());
    if (!student) student = students.find((s) => s.phone === studentCode.trim());

    if (student) {
      setAccessMode("private");
      setCurrentUser({ type: "student", studentId: student.id });
      navigate(`/student/${student.id}`);
      toast({ title: "ברוכה הבאה לאזור האישי!", description: `שלום ${student.firstName} ${student.lastName}` });
    } else {
      toast({
        title: "שגיאה",
        description: "קוד אישי שגוי. פני למנהלת לקבלת הקוד הנכון",
        variant: "destructive",
      });
    }
  };

  const surface = "card-homepage hover-sparkle";

  return (
    <div className="min-h-screen relative overflow-x-hidden page-enter">
      <BsiataDishmaya />

   <header className="sticky top-0 z-50">
  <div className="relative flex items-start justify-center px-4 pt-2 pb-1 md:pt-3 md:pb-2">
    <div className="absolute left-4 top-3 flex items-center gap-2">
      <SiteLink />
      <ThemeToggle />
    </div>

    <div
      className="
        relative mx-auto overflow-hidden
        w-[280px] sm:w-[360px] md:w-[520px] lg:w-[680px]
        h-[80px] sm:h-[100px] md:h-[140px] lg:h-[180px]
      "
    >
      <img
        src={ASSETS.logos.noBackground}
        alt="Toby Music Logo"
        className="
          absolute left-1/2 top-[54%]
          w-full h-full object-contain drop-shadow-2xl
          -translate-x-1/2 -translate-y-[50%]
          scale-[2.45]
        "
      />
    </div>
  </div>
</header>

      {/* Main Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center px-4 pb-10 pt-6">
        {/* Welcome */}
        <div className="w-full max-w-2xl mb-8">
          <Card className={surface}>
            <CardContent className="p-6 text-center">
              <h1 className="text-2xl md:text-3xl font-bold mb-4 text-foreground">
                ברוכות הבאות למערכת המוסיקלית של טובי וינברג
              </h1>
              <div className="text-sm md:text-base leading-relaxed space-y-1 text-foreground/80">
                <p>דרך מערכת זו תוכלי לנהל ולהתנהל עם כל הנושאים הטכניים של השיעורים-</p>
                <p>מערכת השיעורים, החלפות, נתוני תשלומים ועוד.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Login Cards */}
        <div className="w-full max-w-4xl grid md:grid-cols-2 gap-6 mb-8">
          <Card className={`glow-gold ${surface}`}>
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-lg md:text-xl font-bold text-gold">כניסת מנהל</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <div>
                <Label htmlFor="admin-code" className="text-sm font-medium text-gold">
                  קוד מנהל
                </Label>
                <Input
                  id="admin-code"
                  type="password"
                  value={adminCode}
                  onChange={(e) => setAdminCode(e.target.value)}
                  placeholder="הקש קוד מנהל"
                  className="mt-1 bg-black/10 border-gold text-[#800020] placeholder:text-gold/50"
                  onKeyDown={(e) => e.key === "Enter" && handleAdminLogin()}
                />
              </div>
              <Button
                onClick={handleAdminLogin}
                className="w-full btn-confirm font-semibold py-3"
              >
                כניסה
                <ArrowRight className="h-4 w-4 mr-2" />
              </Button>
            </CardContent>
          </Card>

          <Card className={`glow-gold ${surface}`}>
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-lg md:text-xl font-bold text-gold">אזור אישי</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <div>
                <Label htmlFor="student-code" className="text-sm font-medium text-gold">
                  קוד אישי
                </Label>
                <Input
                  id="student-code"
                  type="text"
                  value={studentCode}
                  onChange={(e) => setStudentCode(e.target.value)}
                  placeholder="הקישי קוד אישי"
                  className="mt-1 bg-black/10 border-gold text-[#800020] placeholder:text-gold/50"
                  onKeyDown={(e) => e.key === "Enter" && handleStudentLogin()}
                />
              </div>
              <Button
                onClick={handleStudentLogin}
                className="w-full btn-gold font-semibold py-3"
              >
                כניסה לאזור אישי
                <ArrowRight className="h-4 w-4 mr-2" />
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Contact */}
        <Card className={`w-full max-w-3xl mb-8 ${surface}`}>
          <CardContent className="p-6 space-y-3">
            <p className="font-semibold text-lg text-center text-foreground">פרטי קשר:</p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-foreground">
              <Mail className="h-4 w-4" />
              <span>תוכלי ליצור קשר גם במייל:</span>
              <a
                href="mailto:toby.musicartist@gmail.com"
                className="hover:opacity-80 transition-opacity font-medium underline underline-offset-4"
              >
                toby.musicartist@gmail.com
              </a>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-foreground">
              <Phone className="h-4 w-4" />
              <span>או בנייד:</span>
              <a
                href="tel:0504124161"
                className="hover:opacity-80 transition-opacity font-medium underline underline-offset-4"
              >
                0504124161
              </a>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-foreground">
              <MessageCircle className="h-4 w-4" />
              <span>כמו כן נשלחות הודעות עידכון גם לווטסאפ הטלפוני:</span>
              <a
                href="tel:0733837098"
                className="hover:opacity-80 transition-opacity font-medium underline underline-offset-4"
              >
                0733837098
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Signature */}
        <Card className={`w-full max-w-2xl mb-8 ${surface}`}>
          <CardContent className="p-6 text-center space-y-2">
            <p className="text-2xl font-semibold title-glow text-foreground">להשתמע!</p>
            <p className="text-xl font-bold text-foreground">טובי וינברג</p>
            <p className="italic text-foreground/80 text-lg">איתך, כל הדרך אל המוסיקה</p>
          </CardContent>
        </Card>

        {/* Dev */}
        <Card className={`w-full max-w-md ${surface}`}>
          <CardContent className="pt-6 space-y-3">
            <p className="text-xs text-foreground/70 text-center mb-2">כניסת מפתחים</p>
            <Input
              type="password"
              value={adminCode}
              onChange={(e) => setAdminCode(e.target.value)}
              placeholder="קוד מפתחים"
              className="bg-black/10 border-border text-foreground text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleDevAdminLogin()}
            />
            <Button onClick={handleDevAdminLogin} variant="outline" className="w-full text-sm">
              כניסה למצב מפתחים
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Homepage;
