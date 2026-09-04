import { getManagerCode, isDevMode } from './devMode';

const WORKER_BASE_URL = 'https://lovable-dropbox-api.w0504124161.workers.dev';

export type CanonicalDropboxReadResult = {
  success: boolean;
  data?: Record<string, any>;
  error?: string;
};

const isFailureEnvelope = (data: any): boolean =>
  Boolean(data && typeof data === 'object' && (data.success === false || data.ok === false));

const unwrapDataEnvelope = (data: any): Record<string, any> | undefined => {
  if (data && typeof data === 'object' && data.success === true && data.data && typeof data.data === 'object') {
    return data.data as Record<string, any>;
  }
  return data && typeof data === 'object' ? data as Record<string, any> : undefined;
};

/**
 * Critical verification must read the canonical Dropbox latest object only.
 * Unlike workerApi.downloadLatest(), this helper deliberately does NOT fall
 * back to an older healthy version when latest is unavailable/corrupt.
 */
export async function downloadCanonicalDropboxLatest(): Promise<CanonicalDropboxReadResult> {
  if (isDevMode()) return { success: false, error: 'DEV_MODE_BLOCKED' };

  const managerCode = getManagerCode();
  const params = new URLSearchParams({ action: 'download_latest', managerCode });
  try {
    const response = await fetch(`${WORKER_BASE_URL}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-store',
        'X-Sonata-Manager-Code': managerCode,
      },
      cache: 'no-store',
    });
    if (!response.ok) {
      return { success: false, error: `DOWNLOAD_LATEST_HTTP_${response.status}` };
    }
    const raw = await response.json().catch(() => undefined);
    if (!raw || isFailureEnvelope(raw)) {
      return { success: false, error: 'DOWNLOAD_LATEST_FAILURE_ENVELOPE' };
    }
    const data = unwrapDataEnvelope(raw);
    if (!data) return { success: false, error: 'DOWNLOAD_LATEST_INVALID_DATA' };
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'DOWNLOAD_LATEST_FAILED' };
  }
}
