import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/safe-ui/card';
import { Button } from '@/components/safe-ui/button';
import { Label } from '@/components/safe-ui/label';
import { NumberStepper } from '@/components/ui/number-stepper';
import { Coins } from 'lucide-react';
import { getTuitionSettings, saveTuitionSettings, type TuitionSettings } from '@/lib/tuitionSettings';
import { toast } from '@/hooks/use-toast';

interface TuitionSettingsCardProps {
  onSaved?: (settings: TuitionSettings) => void;
}

const TuitionSettingsCard = ({ onSaved }: TuitionSettingsCardProps) => {
  const [settings, setSettings] = useState(() => getTuitionSettings());
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveTuitionSettings({
        annualRate: settings.annualRate,
        lessonRate: settings.lessonRate,
      });
      setSettings(saved);
      onSaved?.(saved);
      toast({
        title: 'התעריפים נשמרו',
        description: 'השינוי נשמר מקומית ומסתנכרן ל-Dropbox ברקע. התעריפים ישמשו כברירת מחדל לתלמידות חדשות; מחירים קיימים לא משתנים אוטומטית.',
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
          תעריפים כלליים
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          אלו תעריפי ברירת המחדל. תלמידה קיימת שומרת את המחיר שנקבע לה, ובכרטיס תלמידה ניתן לבחור מחיר ידני או הנחת ותק.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="genericAnnualRate">תעריף שנתי מלא — 38 שיעורים</Label>
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
            <Label htmlFor="genericLessonRate">תעריף לשיעור חד־פעמי</Label>
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
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="hero-gradient">
            {saving ? 'שומרת...' : 'שמור תעריפים כלליים'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default TuitionSettingsCard;
