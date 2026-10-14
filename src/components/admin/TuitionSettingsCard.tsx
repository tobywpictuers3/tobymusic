import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/safe-ui/card';
import { Button } from '@/components/safe-ui/button';
import { Label } from '@/components/safe-ui/label';
import { NumberStepper } from '@/components/ui/number-stepper';
import { Coins } from 'lucide-react';
import { getSchoolYearForDate, getSchoolYearLabel } from '@/lib/schoolYear';
import {
  getCohortDiscountAmount,
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

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveTuitionSettings({
        annualRate: settings.annualRate,
        lessonRate: settings.lessonRate,
        priorYearDiscount: settings.priorYearDiscount,
        additionalYearDiscount: settings.additionalYearDiscount,
        maxTenureDiscount: settings.maxTenureDiscount,
      });
      setSettings(saved);
      onSaved?.(saved);
      toast({
        title: 'התעריפים נשמרו',
        description: 'התעריפים והנחות הוותק בשקלים נשמרו. מחירי תלמידות קיימות וסגירות שנה לא שונו אוטומטית.',
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
            המחיר השנתי הוא מחיר מלא ל־38 שיעורים. הנחות הוותק הן בסכומים קבועים בשקלים, לפי שנת ההתחלה, ומחושבות מחדש בכל 1 בספטמבר.
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
          <div className="font-semibold flex items-center gap-2"><Coins className="h-4 w-4" />הנחת ותק שנתית (בשקלים)</div>
          <p className="text-xs text-muted-foreground">
            בשנת ההצטרפות אין הנחת ותק. בשנה שאחריה ניתנת הנחה ראשונית, וכל שנה נוספת מוסיפה סכום עד לתקרה.
            במסלול לפי שיעור אין הנחה שנתית זו.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="priorYearDiscount">התחילה בשנה שעברה — הנחה</Label>
              <NumberStepper id="priorYearDiscount" value={settings.priorYearDiscount}
                onValueChange={(v) => setSettings(s => ({...s, priorYearDiscount: Math.max(0,v)}))}
                min={0} step={50} unit="₪" />
            </div>
            <div>
              <Label htmlFor="additionalYearDiscount">לכל שנת ותק נוספת — תוספת</Label>
              <NumberStepper id="additionalYearDiscount" value={settings.additionalYearDiscount}
                onValueChange={(v) => setSettings(s => ({...s, additionalYearDiscount: Math.max(0,v)}))}
                min={0} step={50} unit="₪" />
            </div>
            <div>
              <Label htmlFor="maxTenureDiscount">תקרת הנחה שנתית</Label>
              <NumberStepper id="maxTenureDiscount" value={settings.maxTenureDiscount}
                onValueChange={(v) => setSettings(s => ({...s, maxTenureDiscount: Math.max(0,v)}))}
                min={0} step={100} unit="₪" />
            </div>
          </div>
          <div className="rounded bg-muted/50 p-3">
            <p className="text-xs font-semibold mb-2">דוגמה לשנה"ל {getSchoolYearLabel(currentSchoolYear)}</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              {[0,1,2,3,4,5].map(age => {
                const joinYear = currentSchoolYear - age;
                const discount = getCohortDiscountAmount(settings, String(joinYear - 1) + '-09-01', currentSchoolYear);
                return <div key={age} className="rounded border bg-background p-2">
                  התחילה ב־{getSchoolYearLabel(joinYear)}: <strong>₪{discount.toLocaleString('he-IL')}</strong>
                </div>;
              })}
            </div>
          </div>
        </div>

        <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          לעדכון מחיר שמור לתלמידה קיימת לחצי ״החל מחיר מחושב״ בטבלת התמחור. אין שינוי אוטומטי לנתונים היסטוריים או למחיר ידני.
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
