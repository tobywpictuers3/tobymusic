import { logger } from "@/lib/logger";
import { isDevMode, getManagerCode } from "@/lib/devMode";

export interface WorkerResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

const WORKER_BASE_URL = "https://lovable-dropbox-api.w0504124161.workers.dev";

/* ===========================================================
   HEADERS HELPERS — VERY IMPORTANT !
   =========================================================== */

const getJsonHeaders = () => ({
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Sonata-Manager-Code": getManagerCode(),
});

const buildWorkerUrl = (
  action: string,
  query?: Record<string, string | number | boolean | undefined>
) => {
  const params = new URLSearchParams({
    action,
    managerCode: getManagerCode(),
  });

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.set(key, String(value));
      }
    });
  }

  return `${WORKER_BASE_URL}?${params.toString()}`;
};

const getWorkerError = (data: any, fallback = "Worker request failed") => {
  if (data && typeof data === "object") {
    return data.error || data.message || fallback;
  }
  return fallback;
};

const isFailureEnvelope = (data: any) =>
  data && typeof data === "object" && (data.success === false || data.ok === false);

const unwrapDataEnvelope = (data: any) => {
  if (
    data &&
    typeof data === "object" &&
    data.success === true &&
    data.data &&
    typeof data.data === "object"
  ) {
    return data.data;
  }
  return data;
};

// NOTICE:
// 1. UploadAttachment MUST NOT use Accept or Content-Type
// 2. Only X-Sonata-Manager-Code is allowed
// 3. Body MUST be FormData with NO headers set by us
// 4. Setting Content-Type manually breaks multipart upload

/* ===========================================================
   NORMALIZERS (important for StudentFiles)
   =========================================================== */

export type UploadAttachmentResultNormalized = {
  path: string;
  webViewLink: string;
  url: string;
  name: string;
  size?: number;
  type?: string;
};

function normalizeUploadAttachmentResult(raw: any): UploadAttachmentResultNormalized {
  const data = raw?.data && typeof raw.data === "object" ? raw.data : raw;

  const path = data?.path;
  const webViewLink = data?.webViewLink;
  const name = data?.name;

  if (!path || !webViewLink || !name) {
    throw new Error(
      `upload_attachment: missing fields (path/webViewLink/name). Got: ${JSON.stringify(raw)}`
    );
  }

  return {
    path,
    webViewLink,
    url: webViewLink,
    name,
    size: data?.size,
    type: data?.type,
  };
}

/* ===========================================================
   GMAIL API HELPERS
   =========================================================== */

async function callWorkerGmail<T>(
  action: string,
  opts: {
    method?: "GET" | "POST";
    body?: any;
    query?: Record<string, string | number>;
  } = {}
): Promise<T> {
  const method = opts.method || "GET";
  const managerCode = getManagerCode();

  const queryString = new URLSearchParams({
    action,
    managerCode,
    ...(opts.query
      ? Object.fromEntries(Object.entries(opts.query).map(([k, v]) => [k, String(v)]))
      : {}),
  }).toString();

  const url = `${WORKER_BASE_URL}/?${queryString}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Sonata-Manager-Code": managerCode,
  };

  const response = await fetch(url, {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(opts.body || {}) : null,
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.ok === false) {
    const msg = data?.error || `Worker request failed: ${response.status} ${response.statusText}`;
    throw new Error(msg);
  }

  return data as T;
}

/* ===========================================================
   EXPORT: Worker API
   =========================================================== */

export const workerApi = {
  /* -----------------------------------------------------------
     1. Download Latest Database JSON
     ----------------------------------------------------------- */
  downloadLatest: async (): Promise<WorkerResponse> => {
    if (isDevMode()) {
      logger.warn("DEV MODE: downloadLatest blocked");
      return { success: false, error: "DEV_MODE_BLOCKED" };
    }

    try {
      const r = await fetch(buildWorkerUrl("download_latest"), {
        method: "GET",
        headers: {
          "Cache-Control": "no-store",
          "X-Sonata-Manager-Code": getManagerCode(),
        },
        cache: "no-store",
      });

      if (!r.ok) {
        const txt = await r.text();
        logger.error("downloadLatest failed:", txt);
        return { success: false, error: txt };
      }

      const data = await r.json();
      if (isFailureEnvelope(data)) {
        return { success: false, error: getWorkerError(data, "DOWNLOAD_LATEST_FAILED"), data };
      }
      return { success: true, data: unwrapDataEnvelope(data) };
    } catch (err) {
      logger.error("downloadLatest error:", err);
      return { success: false, error: (err as Error).message };
    }
  },

  /* -----------------------------------------------------------
     2. Upload Full Database (versioned)
     ----------------------------------------------------------- */
  uploadVersioned: async (db: any): Promise<WorkerResponse> => {
    if (isDevMode()) {
      logger.warn("DEV MODE: uploadVersioned blocked");
      return { success: false, error: "DEV_MODE_BLOCKED" };
    }

    try {
      const r = await fetch(buildWorkerUrl("upload_versioned"), {
        method: "POST",
        headers: getJsonHeaders(),
        body: JSON.stringify(db),
      });

      if (!r.ok) {
        const txt = await r.text();
        logger.error("uploadVersioned failed:", txt);
        return { success: false, error: txt };
      }

      const data = await r.json();
      return { success: true, data };
    } catch (err) {
      logger.error("uploadVersioned error:", err);
      return { success: false, error: (err as Error).message };
    }
  },

  /* -----------------------------------------------------------
     3. Upload Attachment (multipart/form-data)
     IMPORTANT: normalized return shape for StudentFiles
     ----------------------------------------------------------- */
  uploadAttachment: async (file: File): Promise<WorkerResponse<UploadAttachmentResultNormalized>> => {
    if (isDevMode()) {
      logger.warn("DEV MODE: uploadAttachment blocked");
      return { success: false, error: "DEV_MODE_BLOCKED" };
    }

    try {
      const formData = new FormData();
      formData.append("file", file);

      logger.info("Uploading attachment:", {
        name: file.name,
        size: file.size,
        type: file.type,
      });

      const response = await fetch(buildWorkerUrl("upload_attachment"), {
        method: "POST",
        headers: {
          "X-Sonata-Manager-Code": getManagerCode(),
        },
        body: formData,
        mode: "cors",
        cache: "no-store",
      });

      if (!response.ok) {
        const text = await response.text();
        logger.error("Failed to upload attachment:", text);
        return { success: false, error: text };
      }

      const result = await response.json();
      logger.info("Attachment uploaded (raw):", result);

      const normalized = normalizeUploadAttachmentResult(result);
      logger.info("Attachment uploaded (normalized):", normalized);

      return { success: true, data: normalized };
    } catch (error) {
      logger.error("uploadAttachment error:", error);
      return { success: false, error: (error as Error).message };
    }
  },

  /* -----------------------------------------------------------
     4. Delete Attachment
     ----------------------------------------------------------- */
  deleteAttachment: async (path: string): Promise<WorkerResponse> => {
    if (isDevMode()) {
      logger.warn("DEV MODE: deleteAttachment blocked");
      return { success: false, error: "DEV_MODE_BLOCKED" };
    }

    try {
      const r = await fetch(buildWorkerUrl("delete_attachment"), {
        method: "POST",
        headers: getJsonHeaders(),
        body: JSON.stringify({ path }),
        cache: "no-store",
      });

      if (!r.ok) {
        const txt = await r.text();
        if (txt.includes("path_lookup/not_found")) {
          logger.warn("deleteAttachment: file already missing in Dropbox, treating as success");
          return { success: true, data: { ignored: true, reason: "path_lookup/not_found" } };
        }
        logger.error("deleteAttachment failed:", txt);
        return { success: false, error: txt };
      }

      const data = await r.json();
      logger.info("Attachment deleted:", data);
      return { success: true, data };
    } catch (err) {
      logger.error("deleteAttachment error:", err);
      return { success: false, error: (err as Error).message };
    }
  },

  /* -----------------------------------------------------------
     5. List Versions
     ----------------------------------------------------------- */
  listVersions: async (): Promise<WorkerResponse> => {
    if (isDevMode()) {
      logger.warn("DEV MODE: listVersions blocked");
      return { success: false, error: "DEV_MODE_BLOCKED" };
    }

    try {
      const r = await fetch(buildWorkerUrl("list_versions"), {
        method: "GET",
        headers: {
          "Cache-Control": "no-store",
          "X-Sonata-Manager-Code": getManagerCode(),
        },
        cache: "no-store",
      });

      if (!r.ok) {
        const txt = await r.text();
        logger.error("listVersions failed:", txt);
        return { success: false, error: txt };
      }

      const data = await r.json();
      if (isFailureEnvelope(data)) {
        return { success: false, error: getWorkerError(data, "LIST_VERSIONS_FAILED"), data };
      }
      const unwrapped = unwrapDataEnvelope(data);
      logger.info("listVersions success:", unwrapped);
      return { success: true, data: unwrapped };
    } catch (err) {
      logger.error("listVersions error:", err);
      return { success: false, error: (err as Error).message };
    }
  },

  /* -----------------------------------------------------------
     6. Download by Path
     ----------------------------------------------------------- */
  downloadByPath: async (path: string): Promise<WorkerResponse> => {
    if (isDevMode()) {
      logger.warn("DEV MODE: downloadByPath blocked");
      return { success: false, error: "DEV_MODE_BLOCKED" };
    }

    try {
      const r = await fetch(buildWorkerUrl("download_by_path"), {
        method: "POST",
        headers: getJsonHeaders(),
        body: JSON.stringify({ path }),
        cache: "no-store",
      });

      if (!r.ok) {
        const txt = await r.text();
        logger.error("downloadByPath failed:", txt);
        return { success: false, error: txt };
      }

      const data = await r.json();
      if (isFailureEnvelope(data)) {
        return { success: false, error: getWorkerError(data, "DOWNLOAD_BY_PATH_FAILED"), data };
      }
      return { success: true, data: unwrapDataEnvelope(data) };
    } catch (err) {
      logger.error("downloadByPath error:", err);
      return { success: false, error: (err as Error).message };
    }
  },

  /* -----------------------------------------------------------
     Legacy Methods
     ----------------------------------------------------------- */
  saveData: async (data: any): Promise<WorkerResponse> => {
    return workerApi.uploadVersioned(data);
  },

  loadData: async (): Promise<WorkerResponse> => {
    return workerApi.downloadLatest();
  },

  /* -----------------------------------------------------------
     Gmail: Import Recent Messages
     ----------------------------------------------------------- */
  gmailImportRecent: async (params?: {
    max?: number;
    q?: string;
  }): Promise<WorkerResponse<{ imported: number; messages: any[] }>> => {
    if (isDevMode()) {
      logger.warn("DEV MODE: gmailImportRecent blocked");
      return { success: false, error: "DEV_MODE_BLOCKED" };
    }

    try {
      const result = await callWorkerGmail<{
        ok: true;
        imported: number;
        messages: any[];
      }>("gmail_import_recent", {
        method: "GET",
        query: {
          max: params?.max ?? 20,
          q: params?.q ?? "",
        },
      });

      return { success: true, data: result };
    } catch (err) {
      logger.error("gmailImportRecent error:", err);
      return { success: false, error: (err as Error).message };
    }
  },

  /* -----------------------------------------------------------
     Gmail: Send Message and Add to Local
     ----------------------------------------------------------- */
  gmailSendAndAdd: async (message: any): Promise<WorkerResponse<{ message: any }>> => {
    if (isDevMode()) {
      logger.warn("DEV MODE: gmailSendAndAdd blocked");
      return { success: false, error: "DEV_MODE_BLOCKED" };
    }

    try {
      const result = await callWorkerGmail<{ ok: true; message: any }>("gmail_send_and_add", {
        method: "POST",
        body: { message },
      });

      return { success: true, data: result };
    } catch (err) {
      logger.error("gmailSendAndAdd error:", err);
      return { success: false, error: (err as Error).message };
    }
  },

  /* -----------------------------------------------------------
     Gmail: Modify Labels (Read/Star/Trash)
     ----------------------------------------------------------- */
  gmailModifyLabels: async (args: {
    gmailMessageId: string;
    add?: string[];
    remove?: string[];
  }): Promise<WorkerResponse> => {
    if (isDevMode()) {
      logger.warn("DEV MODE: gmailModifyLabels blocked");
      return { success: false, error: "DEV_MODE_BLOCKED" };
    }

    try {
      const result = await callWorkerGmail<{ ok: true }>("gmail_modify_labels", {
        method: "POST",
        body: args,
      });

      return { success: true, data: result };
    } catch (err) {
      logger.error("gmailModifyLabels error:", err);
      return { success: false, error: (err as Error).message };
    }
  },
};
