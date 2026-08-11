import PaymentManagement from '@/components/admin/PaymentManagement';
import AnnualSchoolYearReport from '@/components/admin/AnnualSchoolYearReport';

/**
 * Keeps the existing payment calculations untouched and fixes only the annual
 * table viewport. Both annual payment tables already contain September-August;
 * this shell makes every month reachable on narrow screens and lets wide
 * screens use the available width instead of clipping the last columns.
 */
export default function PaymentManagementShell() {
  return (
    <div data-toby-payments-shell>
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
      <PaymentManagement />
      <AnnualSchoolYearReport />
    </div>
  );
}
