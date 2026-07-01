type WorkerUploadRequest = {
  id: number;
  db: any;
  workerBaseUrl: string;
  managerCode: string;
};

const getWorkerError = (data: any, fallback = 'Worker request failed') => {
  if (data && typeof data === 'object') {
    return data.error || data.message || fallback;
  }
  return fallback;
};

const isFailureEnvelope = (data: any) =>
  data && typeof data === 'object' && (data.success === false || data.ok === false);

self.onmessage = async (event: MessageEvent<WorkerUploadRequest>) => {
  const { id, db, workerBaseUrl, managerCode } = event.data;

  try {
    const params = new URLSearchParams({
      action: 'upload_versioned',
      managerCode: managerCode || '',
    });

    const response = await fetch(`${workerBaseUrl}?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Sonata-Manager-Code': managerCode || '',
      },
      body: JSON.stringify(db),
      cache: 'no-store',
    });

    if (!response.ok) {
      const text = await response.text();
      self.postMessage({ id, success: false, error: text });
      return;
    }

    const data = await response.json().catch(() => ({}));
    if (isFailureEnvelope(data)) {
      self.postMessage({ id, success: false, error: getWorkerError(data, 'UPLOAD_VERSIONED_FAILED'), data });
      return;
    }

    self.postMessage({ id, success: true, data });
  } catch (error) {
    self.postMessage({
      id,
      success: false,
      error: error instanceof Error ? error.message : 'UPLOAD_WORKER_ERROR',
    });
  }
};

export {};