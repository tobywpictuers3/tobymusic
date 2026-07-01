import { createContext, useContext, useState, ReactNode } from 'react';

type DateMode = 'gregorian' | 'hebrew';

interface DateModeContextType {
  dateMode: DateMode;
  setDateMode: (mode: DateMode) => void;
  formatDate: (dateStr?: string) => string;
}

const DateModeContext = createContext<DateModeContextType>({
  dateMode: 'gregorian',
  setDateMode: () => {},
  formatDate: (d) => d || '-',
});

export function DateModeProvider({ children }: { children: ReactNode }) {
  const [dateMode, setDateMode] = useState<DateMode>('gregorian');

  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return '-';
    if (dateMode === 'gregorian') {
      return dateStr.split('-').reverse().join('/');
    }
    try {
      // T12:00:00 מונע הזזות timezone שמשנות את היום
      const date = new Date(dateStr + 'T12:00:00');
      return new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(date);
    } catch {
      return dateStr.split('-').reverse().join('/');
    }
  };

  return (
    <DateModeContext.Provider value={{ dateMode, setDateMode, formatDate }}>
      {children}
    </DateModeContext.Provider>
  );
}

export function useDateMode() {
  return useContext(DateModeContext);
}
