import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Save, Cloud, CloudOff, Loader2 } from 'lucide-react';
import { hybridSync } from '@/lib/hybridSync';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { useAccessMode } from '@/contexts/AccessModeContext';
import {
  commitLocalJsonDraftSession,
  getLocalJsonDraftState,
  subscribeLocalJsonDraftState,
} from '@/lib/localJsonDraft';

export const SaveButton = () => {
  const [isSaving, setIsSaving] = useState(false);
  const [draftActive, setDraftActive] = useState(() => getLocalJsonDraftState().active);
  const { checkWriteAccess } = useAccessMode();

  useEffect(() => subscribeLocalJsonDraftState(next => setDraftActive(next.active)), []);

  const handleSave = async () => {
    if (!checkWriteAccess()) {
      toast({
        title: '⚠️ מצב צפייה בלבד',
        description: 'זהו מצב צפייה בלבד. כדי לשמור נתונים, התחברי עם הקוד האישי שלך',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);

    try {
      const result = draftActive
        ? await commitLocalJsonDraftSession()
        : await hybridSync.onDataChange();

      if (result.success && (!draftActive || result.synced)) {
        toast({
          title: draftActive ? '✅ ה-JSON נשמר ואומת' : '✅ השמירה הושלמה בהצלחה',
          description: result.message,
        });
      } else if (result.success) {
        toast({
          title: '💾 נשמר מקומית',
          description: result.message,
        });
      } else {
        toast({
          title: draftActive ? '⚠️ ה-JSON עדיין מקומי' : '❌ שגיאה בשמירה',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      logger.error('Save error:', error);
      const errorMessage = error instanceof Error ? error.message : 'אירעה תקלה';
      toast({
        title: '❌ שגיאה קריטית בשמירה',
        description: errorMessage.includes('empty data')
          ? 'לא ניתן לשמור נתונים ריקים. אם הבעיה ממשיכה, אנא צרי קשר לתמיכה.'
          : draftActive
            ? 'ה-JSON נשאר מקומי והסנכרון ל-Dropbox נשאר מושהה. נסי שוב.'
            : 'אירעה תקלה. נסי שוב.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Button
      onClick={handleSave}
      disabled={isSaving}
      className="gap-2"
      variant="default"
      title={draftActive ? 'שמירת ה-JSON המקומי ואימותו ב-Dropbox; לאחר הצלחה הסנכרון האוטומטי חוזר לפעולה' : undefined}
    >
      {isSaving ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {draftActive ? 'שומר ומאמת...' : 'שומר...'}
        </>
      ) : draftActive ? (
        <>
          <CloudOff className="h-4 w-4" />
          <Save className="h-4 w-4" />
          שמור JSON ל-Dropbox
        </>
      ) : (
        <>
          <Cloud className="h-4 w-4" />
          <Save className="h-4 w-4" />
          שמור שינויים
        </>
      )}
    </Button>
  );
};
