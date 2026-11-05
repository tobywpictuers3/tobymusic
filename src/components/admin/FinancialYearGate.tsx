import { useEffect, type ReactNode } from 'react';
import { ensureSchoolYearRollover, getSchoolYearForDate } from '@/lib/schoolYear';
import { preparePriorYearSettlementRowsDurably } from '@/lib/priorYearSettlementFlow';
import { reconcileApproved2026CloseDurably } from '@/lib/approved2026CloseReconciliation';
import { logger } from '@/lib/logger';

/**
 * Year-close is a task inside Payments, not an entry requirement.
 * The 2026 close is finished (manager decision 05.11.2026), so the global
 * year-close status banner is no longer shown. The idempotent background
 * rollover / reconciliation still runs silently; the durability checks inside
 * the settlement mutation functions remain mandatory before claiming success.
 */
export default function FinancialYearGate({ children }: { children: ReactNode }) {
  const currentSchoolYear = getSchoolYearForDate();

  useEffect(() => {
    void (async () => {
      try {
        const rollover = await ensureSchoolYearRollover();
        // Recover manager-approved 2026 close decisions before reconciling 2027 cash/credit openings.
        if (currentSchoolYear === 2027) {
          const approved = await reconcileApproved2026CloseDurably();
          if (!approved.verified) throw new Error('APPROVED_2026_CLOSE_NOT_VERIFIED');
        }
        const verification = await preparePriorYearSettlementRowsDurably(currentSchoolYear, { forceSync: rollover.changed });
        if (!verification.verified) throw new Error('PRIOR_YEAR_PREPARE_READBACK_MISMATCH');
      } catch (error) {
        logger.warn('Background year-close check did not verify:', error);
      }
    })();
  }, [currentSchoolYear]);

  return <>{children}</>;
}
