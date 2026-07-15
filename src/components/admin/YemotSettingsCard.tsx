import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/safe-ui/card';
import { Input } from '@/components/safe-ui/input';
import { Label } from '@/components/safe-ui/label';
import { Button } from '@/components/safe-ui/button';
import { Badge } from '@/components/safe-ui/badge';
import { Phone, Save, ShieldCheck } from 'lucide-react';
import { getIntegrationSettings, saveIntegrationSettings } from '@/lib/storage';
import { hybridSync } from '@/lib/hybridSync';
import { toast } from '@/hooks/use-toast';

interface YemotSettings {
  apiBaseUrl?: string;
  apiSecret?: string;
  syncEnabled?: boolean;
  teacherPhone?: string;
  teacherCode?: string;
  yemotSystemNumber?: string;
  yemotCampaignTemplateId?: string;
  yemotCampaignCallerId?: string;
}

const YemotSettingsCard = () => {
  const [settings, setSettings] = useState<YemotSettings>({
    apiBaseUrl: '',
    apiSecret: '',
    syncEnabled: true,
    teacherPhone: '',
    teacherCode: '',
    yemotSystemNumber: '0772276778',
    yemotCampaignTemplateId: '',
    yemotCampaignCallerId: '0772276778',
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const current = (getIntegrationSettings() || {}) as YemotSettings;
    setSettings(prev => ({ ...prev, ...current }));
  }, []);

  const update = (key: keyof YemotSettings, value: string | boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    const phone = String(settings.teacherPhone || '').replace(/\D/g, '');
    const code = String(settings.teacherCode || '').trim();

    if (phone && phone.length < 9) {
      toast({ title: 'מספר טלפון לא תקין', description: 'יש להזין מספר מלא.', variant: 'destructive' });
      return;
    }
    if (code && !/^\d{4}$/.test(code)) {
      toast({ title: 'קוד מורה לא תקין', description: 'קוד המורה חייב להכיל בדיוק ארבע ספרות.', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      saveIntegrationSettings({
        ...settings,
        teacherPhone: phone,
        teacherCode: code,
      } as any);

      const synced = await hybridSync.manualSync();
      if (!synced) {
        throw new Error('הנתונים נשמרו בדפדפן אך לא התקבל אישור מהענן');
      }

      toast({
        title: 'ההגדרות נשמרו בענן',
        description: 'הזיהוי הטלפוני והגדרות ימות המשיח זמינים כעת למערכת הטלפונית.',
      });
    } catch (error) {
      toast({
        title: 'שמירת ההגדרות לא הושלמה',
        description: error instanceof Error ? error.message : 'אירעה שגיאה בסנכרון לענן. נסי שוב.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          סנכרון ימות המשיח
          <Badge variant={settings.syncEnabled ? 'default' : 'secondary'}>
            {settings.syncEnabled ? 'פעיל' : 'מושבת'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border p-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <ShieldCheck className="h-4 w-4" />
            המפתחות הסודיים אינם נשמרים בפלטפורמה
          </div>
          <p className="mt-1">כאן נשמרים רק פרטי הזיהוי והגדרות ההפעלה. טוקן ימות המשיח נשמר ב־GitHub וב־Cloudflare.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="yemot-system">מספר מערכת</Label>
            <Input id="yemot-system" value={settings.yemotSystemNumber || ''} onChange={e => update('yemotSystemNumber', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="teacher-phone">מספר הטלפון של המורה</Label>
            <Input id="teacher-phone" dir="ltr" placeholder="05XXXXXXXX" value={settings.teacherPhone || ''} onChange={e => update('teacherPhone', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="teacher-code">קוד מורה – ארבע ספרות</Label>
            <Input id="teacher-code" dir="ltr" inputMode="numeric" maxLength={4} placeholder="0000" value={settings.teacherCode || ''} onChange={e => update('teacherCode', e.target.value.replace(/\D/g, '').slice(0, 4))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="campaign-template">מזהה תבנית שיחה להודעות אישיות</Label>
            <Input id="campaign-template" dir="ltr" placeholder="אופציונלי בשלב זה" value={settings.yemotCampaignTemplateId || ''} onChange={e => update('yemotCampaignTemplateId', e.target.value.trim())} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="caller-id">זיהוי יוצא לצלצול הודעה חדשה</Label>
            <Input id="caller-id" dir="ltr" value={settings.yemotCampaignCallerId || ''} onChange={e => update('yemotCampaignCallerId', e.target.value)} />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <input type="checkbox" checked={settings.syncEnabled !== false} onChange={e => update('syncEnabled', e.target.checked)} />
              סנכרון טלפוני פעיל
            </label>
          </div>
        </div>

        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
          <Save className="h-4 w-4" />
          {isSaving ? 'שומרת ומסנכרנת…' : 'שמירת הגדרות'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default YemotSettingsCard;
