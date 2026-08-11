const DEV_FAKE_DATE_KEY = 'musicSystem_devFakeDate';

let nativeDateConstructor: DateConstructor | null = null;
let installed = false;
let fakeDateIso: string | null = null;

const readStoredFakeDate = (): string | null => {
  if (typeof window === 'undefined') return null;
  const value = sessionStorage.getItem(DEV_FAKE_DATE_KEY);
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
};

const getFakeTimestamp = (): number | null => {
  if (!fakeDateIso || !nativeDateConstructor) return null;
  const value = new nativeDateConstructor(`${fakeDateIso}T12:00:00`);
  const timestamp = value.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const getDevFakeDate = (): string | null => fakeDateIso ?? readStoredFakeDate();

export const setDevFakeDate = (value: string): void => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Invalid fake date. Expected YYYY-MM-DD.');
  }

  const DateCtor = nativeDateConstructor || globalThis.Date;
  const parsed = new DateCtor(`${value}T12:00:00`);
  const [year, month, day] = value.split('-').map(Number);
  const valid = Number.isFinite(parsed.getTime()) &&
    parsed.getFullYear() === year &&
    parsed.getMonth() + 1 === month &&
    parsed.getDate() === day;

  if (!valid) throw new Error('Invalid fake date.');

  fakeDateIso = value;
  if (typeof window !== 'undefined') sessionStorage.setItem(DEV_FAKE_DATE_KEY, value);
};

export const clearDevFakeDate = (): void => {
  fakeDateIso = null;
  if (typeof window !== 'undefined') sessionStorage.removeItem(DEV_FAKE_DATE_KEY);
};

/**
 * Installs a Date proxy for the developer route only.
 * - new Date() and Date.now() use the selected fake day at local noon.
 * - new Date(explicitValue), Date.parse and Date.UTC keep native behaviour.
 * - No production data/sync behaviour is changed by this module.
 */
export const installDevFakeClock = (): void => {
  if (installed || typeof window === 'undefined') return;

  nativeDateConstructor = globalThis.Date;
  fakeDateIso = readStoredFakeDate();
  const NativeDate = nativeDateConstructor;

  const FakeDate = new Proxy(NativeDate, {
    construct(target, args) {
      const fakeTimestamp = getFakeTimestamp();
      if (args.length === 0 && fakeTimestamp !== null) {
        return Reflect.construct(target, [fakeTimestamp]);
      }
      return Reflect.construct(target, args);
    },
    apply(target, thisArg, args) {
      const fakeTimestamp = getFakeTimestamp();
      if (args.length === 0 && fakeTimestamp !== null) {
        return new target(fakeTimestamp).toString();
      }
      return Reflect.apply(target, thisArg, args);
    },
    get(target, prop, receiver) {
      if (prop === 'now') {
        return () => {
          const fakeTimestamp = getFakeTimestamp();
          return fakeTimestamp ?? target.now();
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  (globalThis as typeof globalThis & { Date: DateConstructor }).Date = FakeDate as DateConstructor;
  installed = true;
};

export const restoreNativeClock = (): void => {
  if (!installed || !nativeDateConstructor) return;
  (globalThis as typeof globalThis & { Date: DateConstructor }).Date = nativeDateConstructor;
  installed = false;
  nativeDateConstructor = null;
};
