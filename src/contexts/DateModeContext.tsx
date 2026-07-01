import { createContext, useContext, useState, ReactNode } from 'react';

type DateMode = 'gregorian' | 'hebrew';

interface DateModeContextType {
  dateMode: DateMode;
  setDateMode: (mode: DateMode) => void;
  formatDate: (dateStr?: string) => string;
}

// המרת מספר יום לאותיות עבריות
function hebrewDayNum(n: number): string {
  const map: Record<number, string> = {
    1:'א',2:'ב',3:'ג',4:'ד',5:'ה',6:'ו',7:'ז',8:'ח',9:'ט',
    10:'י',11:'יא',12:'יב',13:'יג',14:'יד',15:'טו',16:'טז',
    17:'יז',18:'יח',19:'יט',20:'כ',21:'כא',22:'כב',23:'כג',
    24:'כד',25:'כה',26:'כו',27:'כז',28:'כח',29:'כט',30:'ל'
  };
  return map[n] || String(n);
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
      const [y, m, day] = dateStr.split('-').map(Number);
      const date = new Date(y, m - 1, day, 12, 0, 0);
      const formatter = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
      const parts = formatter.formatToParts(date);
      const rawDay = parts.find(p => p.type === 'day')?.value || '';
      const rawMonth = parts.find(p => p.type === 'month')?.value || '';
      const rawYear = parts.find(p => p.type === 'year')?.value || '';
      // המרת יום לאותיות עבריות נקיות
      const dayNum = parseInt(rawDay.replace(/\D/g, ''), 10);
      const dayStr = hebrewDayNum(dayNum || 0) || rawDay;
      // ניקוי ניקוד וגרשיים מהחודש והשנה
      const monthClean = rawMonth.replace(/[\u05B0-\u05C7]/g, '');
      const yearClean = rawYear.replace(/[\u05F4\u05F3"']/g, '');
      return `${dayStr} ${monthClean} ${yearClean}`.trim();
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
