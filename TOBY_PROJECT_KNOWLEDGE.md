# TOBY Music — Project Knowledge

> Central operational knowledge for the student platform repository `tobywpictuers3/tobymusic`.
> Do not place API keys, tokens, passwords, cookies, or secret environment values in this file.

## Sources of truth

- Student platform source code: this GitHub repository, branch `main` after reviewed merges.
- Production student data: latest versioned JSON persisted through the existing Dropbox Worker flow.
- The browser keeps application state in memory; existing storage export/import dynamically persists `musicSystem_*` buckets.
- Lovable is a development interface, not the authoritative copy after GitHub connection.

## Production deployment

- The live student domain is `students.tobymusic.club` and the Cloudflare Worker/assets deployment name is `tobymusic-students-site`.
- The production deploy job lives in `tobywpictuers3/tobymusic-club-repo` on `main1`, in `.github/workflows/deploy.yml`, and checks out this repository's default `main` before building.
- `students.tobymusic.club` already has an externally managed DNS record. Do not delete, replace, or recreate that DNS record automatically.
- The Worker is attached over the existing DNS with a Cloudflare Worker Route: `students.tobymusic.club/*` in zone `tobymusic.club`. Do not use `custom_domain: true` for this hostname unless the DNS architecture is intentionally migrated first; that mode attempts to create/manage DNS and previously failed with Cloudflare code `100117`.
- A students deployment is successful only when the live-domain verification confirms that the HTML served by `students.tobymusic.club` references the exact main Vite asset produced by the current build and that asset is fetchable. A successful Worker upload alone is not sufficient proof of production deployment.
- The routing change was live-verified on 2026-08-11: the Worker Route deployed successfully and `students.tobymusic.club` served `/assets/index-EFa00CsQ.js`, the exact asset built from student-platform `main` at validation commit `afb853b1244532da55e6ac15f43df9dcc5ba4f55`.

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
- In normal admin mode, loading a local JSON enters a staged local-draft session. Before replacing memory, the app pauses future automatic Dropbox uploads/full download+merge syncs and waits for any already-running sync to finish.
- Loading the JSON itself never writes it to Dropbox. The imported data may be inspected and edited across admin tabs while the global sync remains paused.
- While a staged JSON is active, the global save button changes to `שמור JSON ל-Dropbox`; ordinary automatic save/sync calls remain local-only, and manual Dropbox download is disabled so the staged data cannot be silently replaced.
- Pressing the global save button uploads the current complete snapshot, reads the latest Worker/Dropbox snapshot back, and verifies equality. If data changed while the save was running, the app repeats with the newest snapshot before resuming normal sync.
- Automatic Dropbox sync resumes only after read-back verification succeeds. If upload or verification fails, the staged data remains in memory, sync remains paused, and the UI must show a warning rather than claim durable success.
- Leaving/reloading a page with an unsaved staged JSON triggers a browser warning. Reloading discards the in-memory draft and normal startup then returns to Dropbox as the production source of truth.
- Older JSON backups remain supported; missing optional buckets receive safe empty defaults rather than causing the restore to fail.

### Financial durability

- Ordinary money-related work must remain fast in the UI; do not add confirmation dialogs or blocking waits to every payment action.
- `src/lib/financialDurability.ts` captures the loaded financial baseline and detects changes to recurring payments, one-time payments, per-lesson payments/ledger, performance financial data, school-year financial records, and student billing fields.
- The existing fast save path runs normally. After a detected financial mutation, the app verifies the financial projection against the canonical latest Worker/Dropbox snapshot in the background.
- Historical Dropbox fallback versions are recovery/read-only data and must never satisfy financial verification.
- During the sync cutover, the financial durability layer is verifier-only. If canonical verification fails, it keeps the verification pending and shows a warning; it must not perform a second full-snapshot repair upload that bypasses the canonical sync path.
- When offline, financial verification remains pending and retries after connectivity returns. The UI must not silently claim verified cloud durability when verification has not succeeded.
- A staged local JSON session takes precedence over financial background verification: no financial verifier may write to Dropbox while local JSON sync is intentionally paused.
- Tithe/maaser uses the stronger append-only event mechanism below in addition to general financial protection.

### Sync cutover safety — September 2026

- `beforeunload` may warn about pending cloud changes, but it must not issue a `sendBeacon` or any other best-effort full-snapshot upload. Local durable state is retained and the normal authenticated sync/retry path resumes later.
- `workerApi.downloadLatest()` explicitly distinguishes canonical latest from a historical fallback. A historical fallback may be displayed for recovery, but it is read-only and must never become the base for an automatic merge-and-upload.
- Background full merge sync must stop rather than upload when the remote read is a historical fallback.
- Tombstones are not garbage-collected by a fixed client-side age such as 30 days. Client wall-clock age is not proof that all long-offline clients have observed a deletion. Tombstones remain until a server/revision/generation-aware GC protocol is implemented.
- The generic manager credential must not be removed from legacy request formats until the live Dropbox Worker authentication behavior is verified. Once header-only support is live-verified for a path, prefer the header and remove the credential from the URL/query string for that path.
- The feature-branch build runs `scripts/patch-sync-cutover-legacy-writers.mjs` in predev/prebuild and fails closed if the legacy unload writer, tombstone TTL, historical-fallback write path, or financial full-snapshot bypass survives.

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
