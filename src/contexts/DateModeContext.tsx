import { createContext, useContext, useState, ReactNode } from 'react';

type DateMode = 'gregorian' | 'hebrew';

interface DateModeContextType {
  dateMode: DateMode;
  setDateMode: (mode: DateMode) => void;
  formatDate: (dateStr?: string) => string;
}

// המרת מספר יום לאותיות עבריות (ללא גרשיים)
function hebrewDayNum(n: number): string {
  const map: Record<number, string> = {
    1:'א', 2:'ב', 3:'ג', 4:'ד', 5:'ה', 6:'ו', 7:'ז', 8:'ח', 9:'ט',
    10:'י', 11:'יא', 12:'יב', 13:'יג', 14:'יד', 15:'טו', 16:'טז',
    17:'יז', 18:'יח', 19:'יט', 20:'כ', 21:'כא', 22:'כב', 23:'כג',
    24:'כד', 25:'כה', 26:'כו', 27:'כז', 28:'כח', 29:'כט', 30:'ל'
  };
  return map[n] || String(n);
}

// המרת מספר שנה עברית לאותיות (ללא אלפים וגרשיים)
// למשל: 5786 → תשפו, 5787 → תשפז
function hebrewYearStr(n: number): string {
  const year = n % 1000;
  const hundreds: Record<number, string> = {
    100:'ק', 200:'ר', 300:'ש', 400:'ת',
    500:'תק', 600:'תר', 700:'תש', 800:'תת', 900:'תתק'
  };
  const tens: Record<number, string> = {
    10:'י', 20:'כ', 30:'ל', 40:'מ', 50:'נ', 60:'ס', 70:'ע', 80:'פ', 90:'צ'
  };
  const units: Record<number, string> = {
    1:'א', 2:'ב', 3:'ג', 4:'ד', 5:'ה', 6:'ו', 7:'ז', 8:'ח', 9:'ט'
  };
  const h = Math.floor(year / 100) * 100;
  const rem = year % 100;
  const t = Math.floor(rem / 10) * 10;
  const u = rem % 10;
  const h_str = hundreds[h] || '';
  // טו/טז — מקרים מיוחדים (לא יה/יו שהם שמות)
  const rem_str = rem === 15 ? 'טו' : rem === 16 ? 'טז'
    : (tens[t] || '') + (units[u] || '');
  return h_str + rem_str;
}

// ניקוי אות עברית: הסר ניקוד וגרשיים
function cleanHebrew(s: string): string {
  return s
    .replace(/[\u05B0-\u05C7]/g, '')   // ניקוד
    .replace(/[\u05F3\u05F4"'״׳]/g, '') // גרשיים
    .trim();
}

const DateModeContext = createContext<DateModeContextType>({
  dateMode: 'gregorian',
  setDateMode: () => {},
  formatDate: (d) => d || '-',
});

export function useDateMode() {
  return useContext(DateModeContext);
}

export function DateModeProvider({ children }: { children: ReactNode }) {
  const [dateMode, setDateMode] = useState<DateMode>('gregorian');

  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return '-';
    if (dateMode === 'gregorian') {
      return dateStr.split('-').reverse().join('/');
    }
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const date = new Date(y, m - 1, d, 12, 0, 0);
      const parts = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
        day: 'numeric', month: 'long', year: 'numeric',
      }).formatToParts(date);

      const rawDay   = parts.find(p => p.type === 'day')?.value   || '';
      const rawMonth = parts.find(p => p.type === 'month')?.value || '';
      const rawYear  = parts.find(p => p.type === 'year')?.value  || '';

      // יום: ספרה ערבית → אותיות, אות עברית → נקה גרשיים
      const dayAsNum = parseInt(rawDay.replace(/\D/g, ''), 10);
      const dayStr   = (!isNaN(dayAsNum) && dayAsNum > 0 && dayAsNum <= 30)
        ? hebrewDayNum(dayAsNum)
        : cleanHebrew(rawDay);

      // שנה: ספרה ערבית → אותיות, אות עברית → נקה גרשיים
      const yearAsNum = parseInt(rawYear.replace(/\D/g, ''), 10);
      const yearStr   = (!isNaN(yearAsNum) && yearAsNum > 1000)
        ? hebrewYearStr(yearAsNum)
        : cleanHebrew(rawYear);

      return `${dayStr} ${cleanHebrew(rawMonth)} ${yearStr}`.trim();
    } catch (e) {
      return dateStr.split('-').reverse().join('/');
    }
  };

  return (
    <DateModeContext.Provider value={{ dateMode, setDateMode, formatDate }}>
      {children}
    </DateModeContext.Provider>
  );
}
