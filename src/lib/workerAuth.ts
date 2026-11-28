/**
 * Worker access credentials.
 *
 * The students API (lovable-dropbox-api) only gives data to the manager or to a
 * real student. This module:
 *  - remembers the student's personal code inside the logged-in user record
 *    (cleared on logout together with the user),
 *  - adds the right header to every request the app sends to the Worker,
 *  - lets the login screen ask the Worker whether a code is valid
 *    (`action=access_check`, answered by the gate itself, no data returned).
 */

export const WORKER_ORIGIN = 'https://lovable-dropbox-api.w0504124161.workers.dev';

type StoredUser = { type?: string; adminCode?: string; accessCode?: string; studentId?: string };

// Code typed on the login screen, used before the user record exists.
let pendingStudentCode = '';

export const setPendingStudentCode = (code: string) => {
  pendingStudentCode = code.trim();
};

const readStoredUser = (): StoredUser | null => {
  try {
    const raw = sessionStorage.getItem('musicSystem_currentUser') || localStorage.getItem('musicSystem_currentUser');
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    return null;
  }
};

export const getWorkerCredentials = (): { manager: string; student: string } => {
  const user = readStoredUser();
  const manager = user?.type === 'admin' ? String(user.adminCode || '') : '';
  const student = pendingStudentCode || (user?.type === 'student' ? String(user.accessCode || '') : '');
  return { manager, student };
};

export const hasWorkerCredentials = (): boolean => {
  const { manager, student } = getWorkerCredentials();
  return Boolean(manager || student);
};

/** A student who logged in before this change has no stored code: she logs in once more. */
export const isStudentWithoutCode = (): boolean => {
  const user = readStoredUser();
  return user?.type === 'student' && !user.accessCode;
};

const isWorkerUrl = (input: RequestInfo | URL): boolean => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return url.startsWith(WORKER_ORIGIN);
};

let installed = false;

/** Wrap window.fetch so every Worker call carries the caller's credential. */
export const installWorkerAuthHeaders = () => {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    // access_check carries exactly the code being tested, nothing else.
    if (!isWorkerUrl(input) || String(input instanceof Request ? input.url : input).includes('action=access_check')) {
      return originalFetch(input, init);
    }
    const { manager, student } = getWorkerCredentials();
    if (!manager && !student) return originalFetch(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (manager && !headers.get('X-Sonata-Manager-Code')) headers.set('X-Sonata-Manager-Code', manager);
    if (!manager && student && !headers.get('X-Sonata-Student-Code')) headers.set('X-Sonata-Student-Code', student);
    const grants = getSwapGrantHeader();
    if (!manager && grants && !headers.get('X-Swap-Grant')) headers.set('X-Swap-Grant', grants);
    return originalFetch(input, { ...init, headers });
  };
};

/* ---------- lesson swap approval ----------
 * The other student's swap code is checked by the server (browsers no longer receive
 * other students' swap codes). The server returns a grant valid for 15 minutes; saves
 * in that time carry it, and only then may a save move lessons between the two students. */
let swapGrants: { grant: string; until: number }[] = [];

export const getSwapGrantHeader = (): string => {
  const now = Date.now();
  swapGrants = swapGrants.filter((g) => g.until > now);
  return swapGrants.map((g) => g.grant).join(',');
};

export type SwapAuthorizeResult = 'ok' | 'wrong_code' | 'too_many' | 'unavailable';

export const authorizeSwap = async (targetStudentId: string, targetCode: string): Promise<SwapAuthorizeResult> => {
  try {
    const response = await fetch(`${WORKER_ORIGIN}/?action=swap_authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetStudentId, targetCode: targetCode.trim() }),
      cache: 'no-store',
    });
    if (response.status === 429) return 'too_many';
    if (response.status === 403) return 'wrong_code';
    if (!response.ok) return 'unavailable';
    const data = await response.json().catch(() => ({}));
    if (!data?.grant) return 'unavailable';
    swapGrants.push({ grant: String(data.grant), until: Date.now() + 14 * 60e3 });
    return 'ok';
  } catch {
    return 'unavailable';
  }
};

export type AccessCheckResult = 'ok' | 'denied' | 'too_many' | 'unavailable';

/** Ask the Worker whether this code belongs to a student (or the manager). */
export const checkWorkerAccess = async (kind: 'student' | 'manager', code: string): Promise<AccessCheckResult> => {
  const header = kind === 'manager' ? 'X-Sonata-Manager-Code' : 'X-Sonata-Student-Code';
  try {
    const response = await fetch(`${WORKER_ORIGIN}/?action=access_check`, {
      method: 'GET',
      headers: { [header]: code.trim() },
      cache: 'no-store',
    });
    if (response.status === 200) return 'ok';
    if (response.status === 429) return 'too_many';
    if (response.status === 401 || response.status === 403) return 'denied';
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
};
