import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import PaymentManagement from '@/components/admin/PaymentManagement';
import AnnualSchoolYearReport from '@/components/admin/AnnualSchoolYearReport';
import { getTithePaid, isDevMode } from '@/lib/storage';
import { hydrateTithePaidFromHistory, persistTitheMonthDurably } from '@/lib/titheDurability';
import { toast } from '@/hooks/use-toast';

/**
 * Keeps the existing payment calculations untouched, fixes the annual table
 * viewport, and adds a durability boundary around the existing tithe buttons.
 * PaymentManagement keeps its legacy tithePaid map for old JSON compatibility;
 * the shell records each explicit change in append-only titheHistory and waits
 * for Dropbox verification in normal mode.
 */
export default function PaymentManagementShell() {
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const clickSnapshotRef = useRef<Record<string, boolean> | null>(null);

  useLayoutEffect(() => {
    hydrateTithePaidFromHistory();
    setReady(true);
  }, []);

  useEffect(() => {
    const handleImport = () => {
      hydrateTithePaidFromHistory();
      setRevision(value => value + 1);
    };

    window.addEventListener('toby:storage-imported', handleImport);
    return () => window.removeEventListener('toby:storage-imported', handleImport);
  }, []);

  const handlePaymentClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest('button');
    const label = button?.textContent?.trim();

    if (label !== 'הופרש' && label !== 'לא הופרש') return;

    clickSnapshotRef.current = { ...getTithePaid() };

    // Let PaymentManagement's existing handler update the legacy map first,
    // then detect the exact month that changed and persist the durable event.
    window.setTimeout(async () => {
      const before = clickSnapshotRef.current || {};
      const after = { ...getTithePaid() };
      clickSnapshotRef.current = null;

      const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
      const changedMonthKeys = Array.from(allKeys).filter(key => before[key] !== after[key]);

      for (const monthKey of changedMonthKeys) {
        const result = await persistTitheMonthDurably(monthKey, after[monthKey] === true);

        if (result.synced) {
          toast({ description: '✅ סימון המעשר נשמר ואומת בדרופבוקס' });
        } else if (result.success && isDevMode()) {
          toast({ description: '🧪 סימון המעשר נשמר במצב הבדיקה בלבד' });
        } else {
          toast({
            title: '⚠️ שמירת המעשר לא אומתה',
            description: result.message,
            variant: 'destructive',
          });
        }
      }
    }, 0);
  };

  if (!ready) return null;

  return (
    <div data-toby-payments-shell onClickCapture={handlePaymentClickCapture}>
      <style>{`
        /* PaymentManagement's annual views still use overflow-x-hidden.
           Override that only inside the payments shell. */
        [data-toby-payments-shell] div[class*="overflow-x-hidden"] {
          overflow-x: auto !important;
          overflow-y: auto !important;
          max-width: 100% !important;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior-x: contain;
          touch-action: pan-x pan-y;
          scrollbar-gutter: stable;
        }

        /* 1320px is enough for all 12 months + summary columns on a normal
           desktop while still preserving readable cells. Smaller screens
           simply scroll horizontally. */
        [data-toby-payments-shell] div[class*="overflow-x-hidden"] > table {
          width: 1320px !important;
          min-width: 1320px !important;
          max-width: none !important;
        }

        /* Keep the first column useful while scrolling across months. */
        [data-toby-payments-shell] div[class*="overflow-x-hidden"] > table th:first-child,
        [data-toby-payments-shell] div[class*="overflow-x-hidden"] > table td:first-child {
          min-width: 145px !important;
        }

        /* Make the horizontal scrollbar intentionally visible on browsers
           that support WebKit scrollbar styling. Mobile touch scrolling still
           works even when the OS uses overlay scrollbars. */
        [data-toby-payments-shell] div[class*="overflow-x-hidden"]::-webkit-scrollbar {
          height: 12px;
        }
        [data-toby-payments-shell] div[class*="overflow-x-hidden"]::-webkit-scrollbar-track {
          background: hsl(var(--muted));
        }
        [data-toby-payments-shell] div[class*="overflow-x-hidden"]::-webkit-scrollbar-thumb {
          background: hsl(var(--primary) / 0.55);
          border-radius: 999px;
          border: 2px solid hsl(var(--muted));
        }

        @media (min-width: 1600px) {
          [data-toby-payments-shell] div[class*="overflow-x-hidden"] > table {
            width: 100% !important;
            min-width: 1320px !important;
          }
        }

        @media (max-width: 768px) {
          [data-toby-payments-shell] div[class*="overflow-x-hidden"] {
            overflow-x: scroll !important;
          }
          [data-toby-payments-shell] div[class*="overflow-x-hidden"] > table {
            width: 1320px !important;
            min-width: 1320px !important;
          }
        }
      `}</style>
      <PaymentManagement key={`payments-${revision}`} />
      <AnnualSchoolYearReport key={`annual-report-${revision}`} />
    </div>
  );
}
