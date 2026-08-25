import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarClock, Clock, Sparkles } from 'lucide-react';
import { getScheduleTemplates, getStudents } from '@/lib/storage';
import { ScheduleTemplate } from '@/lib/types';

interface StudentFixedScheduleProps {
  studentId: string;
}

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** בחירת המערכת להצגה:
 *  1) אם קיימת מערכת שתוקפה עתידי — מציגים את הקרובה ביותר (עם סימון "עתידה להתחיל").
 *  2) אחרת — המערכת התקפה כיום (isActive, או האחרונה שתוקפה כבר החל). */
export const pickTemplateToShow = (
  templates: ScheduleTemplate[]
): { template: ScheduleTemplate | null; upcoming: boolean; current: ScheduleTemplate | null } => {
  const today = todayKey();
  const withDate = [...templates].filter(Boolean);

  const future = withDate
    .filter((t) => t.effectiveDate && t.effectiveDate > today)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));

  const started = withDate
    .filter((t) => !t.effectiveDate || t.effectiveDate <= today)
    .sort((a, b) => (a.effectiveDate || '').localeCompare(b.effectiveDate || ''));

  const current = withDate.find((t) => t.isActive) || started[started.length - 1] || null;

  if (future.length > 0) return { template: future[0], upcoming: true, current };
  return { template: current, upcoming: false, current };
};

const StudentFixedSchedule = ({ studentId }: StudentFixedScheduleProps) => {
  const templates = getScheduleTemplates();
  const students = getStudents();

  const { template, upcoming, current } = useMemo(() => pickTemplateToShow(templates), [templates]);

  const mySlots = useMemo(() => {
    if (!template?.schedule) return [] as { day: number; time: string }[];
    const rows: { day: number; time: string }[] = [];
    Object.keys(template.schedule).forEach((day) => {
      const slots = template.schedule[day] || {};
      Object.keys(slots).forEach((time) => {
        if (slots[time]?.studentId === studentId) rows.push({ day: Number(day), time });
      });
    });
    return rows.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
  }, [template, studentId]);

  const studentName = (id: string) => {
    const s = students.find((st) => st.id === id);
    return s ? `${s.firstName} ${s.lastName}` : '';
  };

  const formatDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('he-IL') : '');

  if (!template) {
    return (
      <Card className="card-gradient card-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <CalendarClock className="h-5 w-5" />
            מערכת קבועה
          </CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">עדיין לא הוגדרה מערכת קבועה.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {upcoming && (
        <div className="rounded-xl border-2 border-accent bg-accent/10 p-4 flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-accent shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-base">
              מערכת חדשה — {template.name}
            </div>
            <div className="text-sm">
              מערכת זו עתידה להתחיל בתאריך <strong>{formatDate(template.effectiveDate)}</strong>
              {current && current.id !== template.id && (
                <> · עד אז בתוקף: <strong>{current.name}</strong></>
              )}
            </div>
          </div>
        </div>
      )}

      <Card className="card-gradient card-shadow">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
            <CalendarClock className="h-5 w-5" />
            {template.name}
            <Badge variant={upcoming ? 'outline' : 'default'}>
              {upcoming ? `מתחילה ב-${formatDate(template.effectiveDate)}` : 'בתוקף'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <div className="font-semibold mb-2">השיעורים הקבועים שלי</div>
            {mySlots.length === 0 ? (
              <div className="text-sm text-muted-foreground">אין לך שיעור קבוע במערכת זו.</div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {mySlots.map((slot) => (
                  <div
                    key={`${slot.day}-${slot.time}`}
                    className="flex items-center justify-between rounded-lg border-2 border-primary/30 bg-primary/10 p-3"
                  >
                    <span className="font-semibold">יום {DAY_NAMES[slot.day]}</span>
                    <span className="flex items-center gap-1 font-mono text-lg">
                      <Clock className="h-4 w-4" />
                      {slot.time}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="font-semibold mb-2">המערכת השבועית המלאה</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {DAY_NAMES.map((dayName, dayIdx) => {
                const slots = template.schedule?.[String(dayIdx)] || {};
                const times = Object.keys(slots).sort();
                if (times.length === 0) return null;
                return (
                  <div key={dayIdx} className="rounded-lg border bg-card/60 p-3">
                    <div className="font-semibold mb-2">{dayName}</div>
                    <div className="space-y-1">
                      {times.map((time) => {
                        const isMine = slots[time]?.studentId === studentId;
                        return (
                          <div
                            key={time}
                            className={`flex justify-between gap-2 rounded px-2 py-1 text-sm ${
                              isMine ? 'bg-primary/15 font-bold' : 'text-muted-foreground'
                            }`}
                          >
                            <span className="font-mono">{time}</span>
                            <span className="truncate">
                              {slots[time]?.studentName || studentName(slots[time].studentId)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentFixedSchedule;
