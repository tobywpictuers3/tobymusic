import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import PaymentManagement from '@/components/admin/PaymentManagement';
import AnnualSchoolYearReport from '@/components/admin/AnnualSchoolYearReport';
import PriorYearBalancesCard from '@/components/admin/PriorYearBalancesCard';
import HistoricalStudentPayments from '@/components/admin/HistoricalStudentPayments';
import TuitionSettingsCard from '@/components/admin/TuitionSettingsCard';
import StudentTuitionPricingTable from '@/components/admin/StudentTuitionPricingTable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getTithePaid, isDevMode } from '@/lib/storage';
import { hydrateTithePaidFromHistory, persistTitheMonthDurably } from '@/lib/titheDurability';
import { preparePriorYearSettlementRows } from '@/lib/priorYearSettlementFlow';
import { ensureSchoolYearRollover, getSchoolYearForDate } from '@/lib/schoolYear';
import { toast } from '@/hooks/use-toast';

/**
 * Keeps the existing payment calculations untouched, fixes the annual table
 * viewport, and adds durability boundaries around financial operations.
 * The normal admin route already performs the blocking year-close gate; this
 * shell keeps an idempotent fallback before the payment UI is shown.
 */
export default function PaymentManagementShell() {
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const clickSnapshotRef = useRef<Record<string, boolean> | null>(null);
  const currentSchoolYear = getSchoolYearForDate();

  useLayoutEffect(() => {
    hydrateTithePaidFromHistory();

    let active = true;
    void (async () => {
      try {
        await ensureSchoolYearRollover();
        preparePriorYearSettlementRows(getSchoolYearForDate());
      } finally {
        if (active) setReady(true);
      }
    })();

    return () => {
      active = false;
    };
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
        [data-toby-payments-shell] div[class*="overflow-x-hidden"] {
          overflow-x: auto !important;
          overflow-y: auto !important;
          max-width: 100% !important;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior-x: contain;
          touch-action: pan-x pan-y;
          scrollbar-gutter: stable;
        }
        [data-toby-payments-shell] div[class*="overflow-x-hidden"] > table {
          width: 1320px !important;
          min-width: 1320px !important;
          max-width: none !important;
        }
        [data-toby-payments-shell] div[class*="overflow-x-hidden"] > table th:first-child,
        [data-toby-payments-shell] div[class*="overflow-x-hidden"] > table td:first-child {
          min-width: 145px !important;
        }
        [data-toby-payments-shell] div[class*="overflow-x-hidden"]::-webkit-scrollbar { height: 12px; }
        [data-toby-payments-shell] div[class*="overflow-x-hidden"]::-webkit-scrollbar-track { background: hsl(var(--muted)); }
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
          [data-toby-payments-shell] div[class*="overflow-x-hidden"] { overflow-x: scroll !important; }
          [data-toby-payments-shell] div[class*="overflow-x-hidden"] > table {
            width: 1320px !important;
            min-width: 1320px !important;
          }
        }
      `}</style>

      <Tabs defaultValue="current" dir="rtl" className="space-y-5">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto p-1">
          <TabsTrigger value="current" className="shrink-0">שנה נוכחית</TabsTrigger>
          <TabsTrigger value="history" className="shrink-0">שנים קודמות וסגירת שנה</TabsTrigger>
          <TabsTrigger value="pricing" className="shrink-0">תמחור</TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="mt-0">
          <PaymentManagement key={`payments-${revision}`} />
        </TabsContent>

        <TabsContent value="history" className="mt-0 space-y-6">
          <PriorYearBalancesCard key={`prior-year-${revision}`} selectedBaseYear={currentSchoolYear - 1} />
          <HistoricalStudentPayments key={`payment-history-${revision}`} />
          <AnnualSchoolYearReport key={`annual-report-${revision}`} />
        </TabsContent>

        <TabsContent value="pricing" className="mt-0 space-y-6">
          <TuitionSettingsCard onSaved={() => setRevision(value => value + 1)} />
          <StudentTuitionPricingTable key={`student-pricing-${revision}`} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
