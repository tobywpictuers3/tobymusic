# TOBY Music — Project Knowledge

> Central operational knowledge for the student platform repository `tobywpictuers3/tobymusic`.
> Do not place API keys, tokens, passwords, cookies, or secret environment values in this file.

## Sources of truth

- Student platform source code: this GitHub repository, branch `main` after reviewed merges.
- Production student data: latest versioned JSON persisted through the existing Dropbox Worker flow.
- The browser keeps application state in memory; existing storage export/import dynamically persists `musicSystem_*` buckets.
- Lovable is a development interface, not the authoritative copy after GitHub connection.

## Data safety

- Do not delete historical lessons/payments during migrations.
- Prefer additive, backward-compatible records and idempotent operations.
- Any year rollover must be safe to run repeatedly and must not create duplicate archives or duplicate transfers.
- Existing versioned Dropbox backup/history remains the recovery path.

## Developer sandbox and fake clock

- `/dev-admin` is an isolated developer environment. It activates `devMode`, which uses the in-memory `devData` store and does not sync changes to the Worker/Dropbox.
- A real downloaded JSON may be loaded into the developer environment for rehearsal without writing it back to production.
- `src/lib/devFakeClock.ts` provides a developer-only fake clock. It is installed only while `/dev-admin` is mounted and restores the native browser clock when leaving that route.
- In fake-clock mode, zero-argument `new Date()` and `Date.now()` use the selected simulated day; explicit date parsing keeps native behaviour.
- The fake date is stored only in `sessionStorage` and must never become a production configuration or be persisted into Dropbox data.
- Changing the fake date remounts the admin dashboard but deliberately keeps the isolated `devData` in memory, so a loaded JSON can be tested across 30.8, 31.8, 1.9 and 2.9 without re-importing it.
- The primary rollover rehearsal is: load JSON -> 30.8 no rollover -> 31.8 annual report available -> 1.9 rollover -> run 1.9 again and verify idempotency -> 2.9 verify stable post-rollover state.

## Critical persistence guards (August 2026)

### Explicit local JSON restore

- Importing a backup is a replacement transaction for application data, not an overlay on top of the currently loaded buckets.
- Authentication/session state is outside the application-data replacement and must not be copied from or removed by a backup import.
- In `/dev-admin`, a local JSON import is written directly into isolated `devData`. It must never call the Worker/Dropbox and must never reload the browser page, because a reload would destroy the in-memory rehearsal data. A PII-free browser event remounts the admin dashboard so all tabs re-read the imported dev data.
- In normal admin mode, an explicit restore waits for any active sync to become idle, temporarily quiesces the heavy download+merge path for the short critical restore window, replaces the active application buckets, uploads the exact snapshot immediately, then reads the latest Worker/Dropbox snapshot back and verifies it before reporting durable success.
- Normal mode may reload after an import only when that read-back verification succeeds. A failed or unverified upload must remain visibly failed/unverified and must not be reported as a successful durable restore.
- Older JSON backups remain supported; missing optional buckets receive safe empty defaults rather than causing the restore to fail.

### Tithe / maaser durability

- `musicSystem_tithePaid` remains the backward-compatible baseline used by historical JSON backups.
- New tithe changes also append an immutable event to `musicSystem_titheHistory`. Each event contains only `id`, `monthKey`, `paid`, and `updatedAt`; it contains no student PII.
- Current tithe state is derived by starting from legacy `tithePaid` and applying `titheHistory` in deterministic timestamp/id order. Therefore a backup with no history still behaves exactly as before.
- `titheHistory` is merged as an append-only union by event id. The merge guard is installed before the first Worker load so an older whole-map snapshot cannot erase a newer tithe event.
- In `/dev-admin`, tithe changes are local to `devData` only.
- In normal mode, a tithe change is not considered durably saved merely because it was queued. The application performs an immediate cloud write and reads the latest Worker/Dropbox snapshot back; the UI may say the change is verified only when the newly created history event is present in that read-back.
- Critical tithe writes are serialized. Before creating a new history event, the app waits for an already-running sync to become idle and temporarily quiesces new full download+merge syncs until the exact event has been read back from Dropbox. This prevents a full sync that captured an older snapshot from applying it after a newly verified tithe write.
- If the cloud write or verification fails, the UI must show an explicit warning and must not claim the tithe state is safely persisted.

## School-year model (introduced August 2026)

### Year boundaries

- A school year runs from September 1 through August 31.
- `schoolYear=2026` means `2025-09-01..2026-08-31`.
- `schoolYear=2027` means `2026-09-01..2027-08-31`.
- The first automated rollover is the close of school year 2026 on/after `2026-09-01`.

### Standard annual contract

- Standard annual students have a 38-lesson full-year contract.
- Per-lesson students (`paymentType='per_lesson'`) are excluded from the 38-lesson rollover logic.

### Critical rule: numbering is not billing

`startingLessonNumber` is a numbering/comparison baseline. Billing depends on the reason for that baseline.

- `regular`: starts at #1 and is billed for 38 lessons.
- `midyear_join`: a student who actually joins late is billed only for the remaining numbered lessons through #38. Example: starts at #3 => 36 billable lessons; base target = full annual amount × 36/38.
- `carryover_credit`: a student who starts at #3 because two extra lessons were carried from the previous year is still billed for 38 new-year lessons. The #3 start is numbering only.

This distinction is stored in the per-student `schoolYearRecords` bucket and must never be inferred from the number alone once an explicit year record exists.

### Annual price

The manager enters the full 38-lesson annual price. Mid-year proration is calculated automatically from the start reason and starting lesson number. Financial credit/debt carried from a prior year is applied separately to the amount still due; it does not change the 38-lesson entitlement for a regular/carryover year.

### Bank time

Historical bank time is backward-compatible with lesson notes in the form `בנק זמן: +/-N דקות`.

- 5 minutes = 1/6 lesson.
- 30 minutes = 1 full lesson.
- Year-end calculations use integer sixths / 5-minute units to avoid floating-point drift.
- Historical notes are not deleted.

### Year-end report

From August 31, annual students have a live report containing:

- completed lessons in that school year;
- bank time and effective lesson sixths;
- expected lessons;
- original/base annual target;
- year-end reduction for undelivered lessons;
- final target;
- Sep–Aug payment details and total paid;
- closing financial debt/credit;
- excess lessons/bank time to carry forward.

If fewer lessons were delivered, the contractual lesson value is `baseTarget / expectedLessons`; the shortage value reduces that same year's final payment target. The resulting `paid + openingBalance - finalTarget` becomes the financial credit/debt.

### September 1 rollover

`ensureSchoolYearRollover()` is date-gated and idempotent. No new Cron is required; the admin application invokes it during normal admin loading.

On rollover it:

1. freezes the prior-year snapshot in `schoolYearRecords` as `closed`;
2. preserves all historical lessons and payments;
3. creates the new open annual record for active annual students;
4. carries excess whole lessons and residual bank minutes into new-year numbering;
5. carries the signed financial balance separately;
6. updates legacy student payment/numbering fields so existing screens remain compatible;
7. persists the changes through the existing sync flow.

Inactive students receive the archive but no new open annual card.

### Lesson numbering

`src/lib/lessonNumbering.ts` is the central school-year-aware numbering source. Numbering counts completed lessons only within the lesson's Sep–Aug school year and uses the corresponding year record's starting number. A marked prior-year debt-makeup lesson is excluded from current-year numbering.

## Payments UI

The payment data model already contains all 12 academic months, September through August. The annual payments viewport must allow horizontal access to August rather than clipping it.
