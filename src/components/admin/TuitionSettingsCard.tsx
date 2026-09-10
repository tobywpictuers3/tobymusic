import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/safe-ui/card';
import { Button } from '@/components/safe-ui/button';
import { Label } from '@/components/safe-ui/label';
import { NumberStepper } from '@/components/ui/number-stepper';
import { Coins, Percent } from 'lucide-react';
import { getStudents } from '@/lib/storage';
import { getSchoolYearForDate, getSchoolYearLabel } from '@/lib/schoolYear';
import {
  getCohortSchoolYear,
  getTuitionSettings,
  saveTuitionSettings,
  type TuitionSettings,
} from '@/lib/tuitionSettings';
import { toast } from '@/hooks/use-toast';

interface TuitionSettingsCardProps {
  onSaved?: (settings: TuitionSettings) => void;
}

const TuitionSettingsCard = ({ onSaved }: TuitionSettingsCardProps) => {
  const [settings, setSettings] = useState(() => getTuitionSettings());
  const [saving, setSaving] = useState(false);
  const currentSchoolYear = getSchoolYearForDate();

  const cohortYears = useMemo(() => {
    const years = new Set<number>();
    for (let year = currentSchoolYear; year >= currentSchoolYear - 9; year -= 1) years.add(year);
    getStudents().forEach(student => {
      const year = getCohortSchoolYear(student.startDate);
      if (year) years.add(year);
    });
    Object.keys(settings.cohortDiscounts || {}).forEach(key => {
      const year = Number(key);
      if (Number.isFinite(year)) years.add(year);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [currentSchoolYear, settings.cohortDiscounts]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveTuitionSettings({
        annualRate: settings.annualRate,
        lessonRate: settings.lessonRate,
        cohortDiscounts: settings.cohortDiscounts,
      });
      setSettings(saved);
      onSaved?.(saved);
      toast({
        title: 'התעריפים נשמרו',
        description: 'התעריף השנתי, מחיר השיעור והנחות הוותק נשמרו. שנים שכבר נסגרו אינן משתנות רטרואקטיבית.',
      });
    } catch {
      toast({
        title: 'שמירת התעריפים נכשלה',
        description: 'השינוי לא סומן כשמור. נסי שוב לאחר בדיקת החיבור.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="card-gradient card-shadow">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Coins className="h-5 w-5" />
          תמחור שכר לימוד
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">
            המחיר השנתי הוא מחיר מלא ל־38 שיעורים. תאריך ההתחלה של כל תלמידה קובע את קבוצת הוותק שלה, והמערכת יכולה לחשב את המחיר השנתי לפי ההנחה של שנת ההצטרפות.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="genericAnnualRate">מחיר שנתי מלא — 38 שיעורים</Label>
            <NumberStepper
              id="genericAnnualRate"
              value={settings.annualRate}
              onValueChange={(annualRate) => setSettings(current => ({ ...current, annualRate: Math.max(0, annualRate) }))}
              step={100}
              min={0}
              unit="₪"
            />
          </div>
          <div>
            <Label htmlFor="genericLessonRate">מחיר לשיעור</Label>
            <NumberStepper
              id="genericLessonRate"
              value={settings.lessonRate}
              onValueChange={(lessonRate) => setSettings(current => ({ ...current, lessonRate: Math.max(0, lessonRate) }))}
              step={10}
              min={0}
              unit="₪"
            />
          </div>
        </div>

        <div className="rounded-lg border p-4 space-y-4">
          <div className="flex items-center gap-2 font-semibold">
            <Percent className="h-4 w-4" />
            הנחת ותק לפי שנת התחלה
          </div>
          <p className="text-xs text-muted-foreground">
            לדוגמה: תלמידה שהתחילה בשנת 2025-26 שייכת תמיד לקבוצת 2025-26, גם בשנים הבאות. 0% פירושו מחיר מלא.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {cohortYears.map(year => {
              const key = String(year);
              const discount = Number(settings.cohortDiscounts?.[key] || 0);
              return (
                <div key={year} className="rounded-md border bg-background/70 p-3">
                  <Label htmlFor={`cohort-${year}`}>התחילה בשנת {getSchoolYearLabel(year)}</Label>
                  <NumberStepper
                    id={`cohort-${year}`}
                    value={discount}
                    onValueChange={(value) => setSettings(current => ({
                      ...current,
                      cohortDiscounts: {
                        ...current.cohortDiscounts,
                        [key]: Math.min(100, Math.max(0, value)),
                      },
                    }))}
                    step={1}
                    min={0}
                    max={100}
                    unit="%"
                  />
                  <div className="mt-1 text-xs text-muted-foreground">
                    מחיר מלא לאחר הנחה: ₪{Math.round(settings.annualRate * (1 - discount / 100) * 100) / 100}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          שינוי תמחור אינו משנה אוטומטית סגירות שנה היסטוריות. בכרטיס תלמידה ניתן לשמור מחיר ידני במקרה חריג.
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="hero-gradient">
            {saving ? 'שומרת...' : 'שמור תמחור'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default TuitionSettingsCard;
