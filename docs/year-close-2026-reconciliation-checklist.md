# Year-close 2026 reconciliation checklist

This is an operational checklist, **not** an executed data migration.

- Read current canonical Dropbox latest and an immutable versioned backup before changing financial state.
- Compare previously approved balance settlements with current `musicSystem_priorYearBalances`, `musicSystem_schoolYearRecords`, and payment records by stable student ID.
- Keep source cashflow event dates and accounting-year attribution distinct.
- For transferred credits, verify the target-year opening balance is already reflected before marking settled; never apply the same credit twice.
- For cash settled/refunded cases, require an existing receipt or documented manager confirmation and use a verified settlement date rather than inventing one.
- Keep genuinely unresolved accounts pending.
- Make changes idempotent and audit-marked, then read canonical Dropbox latest again to verify.
- Run CI, review and merge once before any deployment. Do not store student PII in build diagnostics.
