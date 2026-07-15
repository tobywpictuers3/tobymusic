const WORKER_URL = 'https://lovable-dropbox-api.w0504124161.workers.dev';

export interface GlobalDeleteResult {
  ok: boolean;
  messageId?: string;
  alreadyDeleted?: boolean;
  removedFromAllPlatformFolders?: boolean;
  removedFromYemotPlayback?: boolean;
  tombstoneCreated?: boolean;
  affectedRecordings?: string[];
  note?: string;
  error?: string;
}

export const deleteMessageGloballyAsAdmin = async (
  messageId: string,
  managerCode: string,
): Promise<GlobalDeleteResult> => {
  const cleanId = String(messageId || '').trim();
  const cleanCode = String(managerCode || '').trim();
  if (!cleanId) return { ok: false, error: 'חסר מזהה הודעה' };
  if (!cleanCode) return { ok: false, error: 'חסר קוד מנהל' };

  const response = await fetch(`${WORKER_URL}/?action=admin_global_delete_message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sonata-Manager-Code': cleanCode,
    },
    body: JSON.stringify({
      messageId: cleanId,
      reason: 'admin_global_delete_from_platform',
    }),
  });

  let data: GlobalDeleteResult;
  try {
    data = await response.json();
  } catch {
    data = { ok: false, error: `שגיאת שרת ${response.status}` };
  }

  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'מחיקת ההודעה מכל המערכת נכשלה');
  }
  return data;
};
