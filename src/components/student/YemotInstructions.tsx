import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PhoneCall, ShieldCheck } from 'lucide-react';

const branches = [
  ['1', 'שמיעת הודעות המורה', 'הקישי 1 והמתיני. ההודעה העדכנית של המורה תושמע במלואה.'],
  ['2', 'למורה בלבד', 'הקלטת הודעה חדשה לתלמידות.'],
  ['3', 'שמיעת בקשות החלפה', 'שמיעת בקשות פתוחות של תלמידות המעוניינות להחליף שיעור.'],
  ['4', 'פרסום בקשת החלפה', 'אמרי בבירור את שמך, מועד השיעור הקבוע והמועד המבוקש. לסיום הקישי סולמית.'],
  ['5', 'ביצוע החלפה שסוכמה', 'הכיני את קודי ההחלפה, התאריכים והשעות של שתי התלמידות. תאריך ושעה מוקשים בארבע ספרות.'],
  ['6', 'דיווח אימון ידני', 'הקישי תאריך בארבע ספרות ומספר דקות, ולסיום הקישי סולמית.'],
  ['7', 'שעון אימון בזמן אמת', 'הקישי 7 בתחילת האימון ושוב בסיומו, מאותו מספר טלפון.'],
  ['8', 'האזור האישי', 'שמיעת הודעות פרטיות. הודעה שנשמעה תסומן כנקראה.'],
];

export default function YemotInstructions() {
  return (
    <Card className="overflow-hidden border-[#C9A961]/50 bg-[#0F0F12] text-[#F5F1EA] shadow-2xl" dir="rtl">
      <CardHeader className="items-center border-b border-[#6B1F2A] bg-gradient-to-b from-[#1a1014] to-[#0F0F12] text-center">
        <Badge className="mb-2 bg-[#C9A961] text-[#0F0F12]">בתקופת הרצה</Badge>
        <CardTitle className="text-3xl text-[#C9A961]">מערכת התלמידות הטלפונית</CardTitle>
        <div className="text-xl font-semibold text-[#FFE5A0]">077-227-6778</div>
        <p className="max-w-2xl text-sm leading-7 text-white/80">המערכת מזהה אותך לפי מספר הטלפון. אם המספר אינו מזוהה, הקישי את הקוד האישי בן ארבע הספרות.</p>
      </CardHeader>
      <CardContent className="space-y-5 p-5 md:p-8">
        <div className="grid gap-3 md:grid-cols-2">
          {branches.map(([number, title, description]) => (
            <div key={number} className="rounded-xl border border-[#C9A961]/25 bg-[#140c0f] p-4 transition hover:border-[#C9A961]/70">
              <div className="mb-2 flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#8B2A37] text-lg font-bold text-white">{number}</span><h3 className="font-bold text-[#FFE5A0]">{title}</h3></div>
              <p className="text-sm leading-6 text-white/80">{description}</p>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-3 rounded-xl border-r-4 border-[#C9A961] bg-[#1a1014] p-4"><ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-[#C9A961]" /><p className="text-sm leading-6">במקרה של תקלה רשמי באיזו שלוחה היית, מה הקשת, מה נאמר ובאיזו שעה התקשרת.</p></div>
        <div className="text-center"><Button asChild className="bg-gradient-to-l from-[#6B1F2A] via-[#C9A961] to-[#FFE5A0] font-bold text-[#0F0F12] hover:opacity-90"><a href="tel:0772276778"><PhoneCall className="ml-2 h-5 w-5" />לחיוג מהיר</a></Button></div>
      </CardContent>
    </Card>
  );
}
