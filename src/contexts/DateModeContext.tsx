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

      // יום: אם ספרה ערבית → המר לאות עברית. אם כבר אות → נקה גרשיים
      const dayAsNum = parseInt(rawDay.replace(/\D/g, ''), 10);
      const dayStr   = (!isNaN(dayAsNum) && dayAsNum > 0 && dayAsNum <= 30)
        ? hebrewDayNum(dayAsNum)
        : cleanHebrew(rawDay);

      return `${dayStr} ${cleanHebrew(rawMonth)} ${cleanHebrew(rawYear)}`.trim();
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
