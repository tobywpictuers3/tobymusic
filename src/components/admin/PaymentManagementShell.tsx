import PaymentManagement from '@/components/admin/PaymentManagement';
import AnnualSchoolYearReport from '@/components/admin/AnnualSchoolYearReport';

/**
 * Keeps the existing payment calculations untouched and fixes only the annual
 * table viewport: the data already contains September-August, but the old
 * overflow-x-hidden container could clip August on narrower screens.
 */
export default function PaymentManagementShell() {
  return (
    <div data-toby-payments-shell>
      <style>{`
        [data-toby-payments-shell] div[class*="overflow-x-hidden"] {
          overflow-x: auto !important;
        }
        [data-toby-payments-shell] div[class*="overflow-x-hidden"] > table {
          min-width: 1480px;
        }
      `}</style>
      <PaymentManagement />
      <AnnualSchoolYearReport />
    </div>
  );
}
