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
- `src/lib/financialDurability.ts` captures the loaded financial baseline and detects changes to recurring payments, one-time payments, per-lesson payments/ledger, performance financial data, school-year financial records, prior-year balance settlement records, and student billing fields.
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
- **Attendance policy confirmed 2026-10-09:** A lesson marked `status='completed'` counts as a delivered/numbered/billable lesson even if the note says `תלמידה נעדרה`. Do not subtract such lessons or recalculate refunds based only on an absence note; cancelled lessons remain excluded.
- Closed-year refunds for inactive/former students remain payable and must appear prominently in the year-end closing and annual reports, regardless of current active status. Highlight *unsettled* positive balances before long scrollable tables; do not change financial snapshots to fix visibility.

### Critical rule: numbering is not billing

`startingLessonNumber` is a numbering/comparison baseline. Billing depends on the reason for that baseline.

- `regular`: starts at #1 and is billed for 38 lessons.
- `midyear_join`: a student who actually joins late is billed only for the remaining numbered lessons through #38. Example: starts at #3 => 36 billable lessons; base target = full annual amount × 36/38.
- `carryover_credit`: a student who starts at #3 because two extra lessons were carried from the previous year is still billed for 38 new-year lessons. The #3 start is numbering only.

This distinction is stored in the per-student `schoolYearRecords` bucket and must never be inferred from the number alone once an explicit year record exists.

### Annual price

The manager enters the full 38-lesson annual price. Mid-year proration is calculated automatically from the start reason and starting lesson number. A prior-year financial credit/debt is recorded separately at close and does not affect the new-year amount until the manager explicitly confirms its settlement method. It does not change the 38-lesson entitlement for a regular/carryover year.

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
5. records the signed financial closing balance for settlement, but does not leave a non-zero monetary opening balance active until the manager explicitly chooses how to settle it;
6. updates legacy student payment/numbering fields so existing screens remain compatible;
7. persists the changes through the existing sync flow.

Inactive students receive the archive but no new annual card.

`FinancialYearGate` wraps the normal admin route. The application has already completed `hybridSync.loadDataOnInit()` before this gate runs. The gate completes the date-gated rollover, materializes `musicSystem_priorYearBalances`, converts non-zero automatic settlement decisions into a pending state, neutralizes any transient automatic monetary opening balance in the new annual card, syncs, and verifies canonical Dropbox latest before editable admin screens are unlocked. The historical approved 2026 migration is not a dependency of every admin startup.

Per-lesson prior-year price, completed-lesson count, due total, paid total, verified opening balance and signed close remain frozen before the editable admin UI is unlocked. This prevents a new-year price edit after September 1 from rewriting the finished year's close. The Payments shell keeps an idempotent fallback.

### Lesson numbering

`src/lib/lessonNumbering.ts` is the central school-year-aware numbering source. Numbering counts completed lessons only within the lesson's Sep–Aug school year and uses the corresponding year record's starting number. A marked prior-year debt-makeup lesson is excluded from current-year numbering.

## Payments UI

The payment data model already contains all 12 academic months, September through August. The annual payments viewport must allow horizontal access to August rather than clipping it.

### Prior-year debt / credit settlement — September 2026

- `musicSystem_priorYearBalances` is the operational settlement bucket for balances brought from the immediately preceding school year.
- Sign convention is from the student's perspective: positive means money/value owed to the student; negative means debt owed by the student.
- The settlement table is shown prominently at the top of the Payments screen for both annual and per-lesson students. It shows the payment track, signed balance, frozen source details, current settlement status and the available manager actions. Positive/credit cells are green; negative/debt cells are red.
- A non-zero calculated balance starts as **pending**. The system must never decide automatically that a monetary debt/credit is carried to lessons. Existing pre-policy automatic `lessons + settled` rows without a manager confirmation marker are normalized back to pending before the admin UI opens.
- Zero balances are considered balanced and require no action. Rows that cannot be calculated reliably remain `requiresVerification=true`; they cannot be settled until the manager explicitly verifies/edits the amount.
- Each new school year gets a clean Sep–Aug payment view. Historical recurring and per-lesson payment rows remain preserved, but active calculations and filters are scoped to the selected school year and do not mix old rows into the new year.
- Explicit **transfer to next year** sets `settlementMethod='lessons'`, records a manager confirmation marker, and only then applies the verified signed balance to the next-year annual card or per-lesson ledger as an opening value. It does not copy prior-year payment rows into the new year.
- Explicit **cash settlement** requires an execution date. Student debt creates positive teacher income; student credit/refund creates a negative `oneTimePayments` cash flow. The deterministic cash row uses the actual execution date for both `paidDate` and month attribution, so monthly, daily and yearly reports count the action on the date it actually happened even though it settles an older school year.
- The cash action label follows the sign: debt is marked `שולם`; credit is marked `הוחזר`. Reopening a settlement removes the deterministic cash row or removes the monetary carry-forward and returns the row to pending.
- Editing the signed closing amount manually clears any prior settlement decision and returns the row to pending. The row becomes `source='manual'` and `requiresVerification=false` only because the manager supplied the amount explicitly.
- Every explicit prior-year settlement action performs a normal sync and then reads **canonical Dropbox latest** back. The UI may display `נשמר ואומת` only when the settlement row, deterministic cash row (when applicable), and annual opening balance effect all match the intended action. Historical fallback data never satisfies this verification.
- The deterministic cash row id is scoped by target school year and student, so repeated edits update the same settlement instead of creating duplicates.
- The Dropbox Worker has a server-side merge guard for `musicSystem_priorYearBalances` inside the serialized `PlatformWriteGate`, so a later whole-snapshot upload cannot silently erase a newer settlement row. Client read-back verification remains required for manager actions.
- Per-lesson closing is snapshotted from completed lessons, the lesson price in force at close, year-scoped payments and any verified opening balance. The snapshot stores source lesson price, completed-lesson count, opening balance, due, paid totals, provenance and cutoff so later price changes cannot rewrite the historical close.
- Special 2026 rule: `/Apps/lovale db/backups/2026/08/30.json` is the approved historical source for per-lesson pricing and activity for school year 2026 (`2025-09-01..2026-08-31`). The migration must never reconstruct 2026 from a current/2027 lesson price and must not use or reconsider `31.json`.
- The approved 2026 migration computes `sourceTotalDue = completed lessons in 2026 × sourceLessonPrice`, filters per-lesson payments to the exact 2026 date range (using `paymentDate` when present), includes an opening balance only when that opening is independently verified, and computes `signedBalance = opening + paid - due`.
- Reliable 2026 rows are written with `requiresVerification=false` and provenance `approved_2026_snapshot`. Only a specific record whose inputs cannot be verified may remain `requiresVerification=true`; the system must not turn all 2026 per-lesson rows into legacy/manual rows.
- The approved 2026 snapshot is calculation input only. Before any production mutation, the migration reads canonical Dropbox latest and creates an identical versioned backup. It then modifies only the operational prior-year-balance bucket on top of current live data, syncs through the canonical path, and reads canonical latest back to verify the migrated values. Current 2027 data must never be replaced by the historical `30.json` snapshot.
- The 2026 migration is idempotent and must not overwrite a manually verified close, an already-settled cash close, or a row already proven to come from the approved snapshot.
- The approved 2026 per-lesson migration was completed in production on 2026-09-09 for 11 records; all 11 were verified and none required verification. Those migration-created default `lessons` states are historical automatic defaults, not manager decisions, and are normalized to pending by the new settlement gate unless an explicit manager confirmation exists.
- From school year 2027 onward, normal admin rollover freezes the same per-lesson source fields with `live_rollover` provenance before the admin can edit the new year's price/terms.
- If a prior per-lesson opening balance is itself unresolved, the next closing remains unresolved rather than compounding an invented value.
- Payment-method changes and payment-method filters are scoped to the selected school year; they must never rewrite or infer from arbitrary historical payment rows.
- Payment business dates generated by the payment screen use `Asia/Jerusalem`, not UTC day boundaries.
- Signed negative `תשלומים אחרים` must stay visible in annual, monthly and daily summaries rather than disappearing behind positive-only rendering.
- `priorYearBalances` is part of the financial-durability projection and must be verified against canonical Dropbox latest like other financial state.

## Student lessons, discounts and practice reports (2026-10-08)

- Each student card now has a labelled lesson-report action. It shows completed lessons by academic year (Sep 1–Aug 31), including older years, for annual and per-lesson students. Source records and closed school-year snapshots remain unchanged.
- In the individual student editor, the annual discount is entered as a manual fixed NIS amount (`annualDiscountAmount`) and reduces the standard full-year price unless the manager explicitly sets a manual annual price. Historical percent-only student records are converted for editing using the configured annual base, without rewriting closed-year snapshots. Cohort-discount settings remain a separate existing mechanism.
- Practice registration previously triggered cloud sync twice: internally in `addPracticeSession` and again in the student component. The duplicate sync trigger was removed, and the practice form checks the new session exists locally before reporting a local registration. The UI no longer calls the queued upload a confirmed cloud save; confirmation is represented only by the canonical-sync status. Practice dates now use Asia/Jerusalem rather than UTC.
- Cloud durability of practice writes is controlled by the canonical dirty-bucket read-back checks in `scripts/patch-sync-runtime-efficiency.mjs`. Real production student-account add/edit/delete/reload/multidevice tests remain required before claiming end-to-end certainty.

## Annual tenure discounts in NIS (2026-10-14)

- Tuition cohort discounts are **fixed NIS amounts**, not percentages. The discount is computed by the current Sep–Aug school year relative to the student's original start date. Per-lesson students are excluded.
- Configurable defaults: `priorYearDiscount=200` NIS (joined the preceding year), `additionalYearDiscount=100` NIS per earlier joining year, `maxTenureDiscount=500` NIS. Joined this year or later: zero. The effective discount is capped by the full annual rate.
- In school year 2027: joined in school year 2027 → 0; 2026 → 200; 2025 → 300; 2024 → 400; 2023 or earlier → 500 NIS.
- Existing legacy `cohortDiscounts` values were **percentages** and must never be reinterpreted as shekel amounts. Stored student annual prices, individual fixed discounts, current annual terms and closed-year financial snapshots are preserved. A manager must explicitly click “Apply calculated price” for an existing student.


## TOBY PLAY music training (feature branch, 2026-10-18)
- First TOBY PLAY slice was merged from `feature/toby-play-music-training-20261018` at student-repo commit `cbf07c2051d7e70994f2270d5280ffd9b04eae97` and deployed on 2026-10-18 via website-repo Actions run `39137512409`. The `deploy-students` job successfully verified the exact built asset on `students.tobymusic.club`; the unchanged public website deploy job was skipped.
- Admin assigns `Student.musicPlaySettings` via the new "רמות אימון" control inside each student card; it uses the existing `updateStudent` storage/Dropbox synchronization mechanism. The highest opened level unlocks all lower levels; all higher levels are disabled for the student. An unconfigured student defaults to level 1.
- The 6 initial tiers are: basic treble, continuous treble, extended treble, bass, grand staff, and grand staff with multiple noteheads. Each exercise is constrained by the student's treble/bass natural-note range, approved rhythmic durations and steps/mixed motion. Four 4/4 bars are generated as exact beat sums.
- Student dashboard adds `TOBY PLAY` with a horizontal notation strip: current event highlighted, subsequent events visible, progress moves after the event's beat duration, and metronome offers four count-in beats. Touch, computer keys and supported Web MIDI are prototype inputs; microphone pitch recognition is **not implemented**.
- Individual event evaluation compares expected and played pitches and onsets. Recent attempts (max 30) are stored additively in the student's data object; this is a preliminary client-side write, **not a verified multi-device append-only receipt protocol**. Don't claim cloud durability until actual production sync read-back is verified.
- Current notation is a simple SVG prototype (individual eighth flags; no beaming, rests, accidentals or imported scores). Full engraving, polyphonic timing calibration and double-staff refinements still need quality checks and real-instrument tests.
- Initial GitHub checks (`npm run test:music`, `npx tsc --noEmit`, `npm run build`) passed before release. The teacher studio is now available for interactive product review, but real-instrument/browser tests, multi-device Dropbox read-back checks for recorded attempts, and professional engraving/notation checks are **still pending**. Do not describe these unverified capabilities as production-complete.

- Music rules regression tests are available via `npm run test:music` and run in the PR validation workflow before the production build.

- Admin dashboard has an isolated TOBY PLAY sandbox with 3 presets, pitch/rhythm/BPM/chord controls. It uses a synthetic student and `preview` mode, which MUST never write to student records or Dropbox. Teacher can try it before assigning levels to real students.

- Student TOBY PLAY tab is only visible after the manager explicitly configures `musicPlaySettings`; other students are not exposed to the beta. Admin preview deep link: `/admin#music-play`, or the equivalent normal authenticated admin route. Rhythm mode evaluates onset taps (screen, Space, or MIDI) and deliberately does not score note duration yet.

- The teacher studio includes local-only feedback notes and a clipboard report (configuration + feedback, no PII) for iterative improvements. No database writes are made by this panel.

- Generated exercises offer reference playback via a cancellable Web Audio context that plays event pitches and durations separately from scoring.

## TOBY PLAY — melodic ear memory (feature branch, 2026-10-18)
- The next playable exercise is **מנגינה סודית**: five short ear-memory rounds per session. Students listen to a generated natural-note melody and reproduce its pitch sequence from two to four on-screen choices or keyboard digits 1–4. The game shows progression, correct-note rate, and perfect-round stars; teacher preview remains write-free.
- Generation is constrained by the student's currently unlocked tier and configured treble/bass ranges. The generator refuses a clef with fewer than two approved notes, and does not expand the teacher-approved pitch limits merely to make the game playable. Levels 4–6 may use the bass clef; at levels 5–6 the game chooses one eligible clef per round (not polyphonic hearing).
- Audio is synthesized in the browser, with replay enabled and no raw audio uploaded. This is an **ear-memory prototype**, not a calibrated pitch-transcription assessment. Its result has `mode='ear'`; timing is explicitly not measured (`timing=0`).
- Five-round completion appends one attempt using the existing student update path (max 30 attempts); cross-device persistence remains **unverified**, and the UI must not claim verified cloud storage. No score history is written in teacher preview mode.
- The feature is limited to an extra game, not a replacement of the existing continuous note-reading/rhythm games. Microphone input, complete notation, real-instrument audio checks, and Dropbox read-back QA remain open.

## TOBY PLAY — 2026-10-18 teacher feedback corrections (feature)
- Teacher-reported note highlight obscured staff: highlight background is behind staff lines; active rectangle becomes transparent outline.
- TOBY PLAY separates **שליפת תווים** (two full beats per event, accept correct pitches anywhere in its window) from **נגינה מדויקת במקצב** (pitches and onsets BOTH must match). The existing independent rhythm tapping and ear-memory modes remain.
- Strict play requires an eight-click human-response calibration in the selected input mode, at least five distinct matched taps; measured mean response offset is corrected and a one-sample-standard-deviation timing tolerance is applied with a minimum 50ms device-jitter floor. Calibration with >180ms SD is rejected. Treat it as in-browser human/device calibration, NOT externally validated clinical response norms or accredited musical assessment.
- Names on buttons/reports use Israeli octave terminology: `C4=דו ראשון`, `A4=לה ראשון=440Hz`, `C5=דו שני`, `C3=דו קטן`, `C2=דו גדול`; MIDI values remain unmodified.
- PC note-key instructions explicitly ask to switch keyboard layout to English (EN).
- Continuous React notation state updates are rate-limited (~8 fps while audio timing is on the Web Audio clock), and the teacher sandbox no longer forces remount through `key={revision}`. No global app reload or sync behavior is changed. Browser-level reload, actual tablet input jitter, and student score persistence still require production/manual verification.

## TOBY PLAY performance stability follow-up (2026-10-18)
- Teacher's earlier fixes (note highlight behind staff, two beats for recall, calibrated exact-onset performance, English keyboard instruction, and Israeli octave names anchored to A4=440Hz) are already in production source and were preserved.
- Progress animation no longer triggers periodic React score renders. Playback timing and judgement remain on the Web Audio clock; only cursor/event changes update React, with an SVG ref for in-note progress. Count-in updates only when the visible integer changes.
- The active-note marker is now a small triangle away from the staff, not a frame crossing stave lines; the pale background is painted *behind* five staff lines and notes.
- Browsers receive a beforeunload warning during active playing/calibration, and when the ear game is listening/answering. This cannot force a browser to block reload, but prevents many accidental interruptions.
- Code/CI checks must be green; user-device audio, tablet performance, and unrelated extension/browser-triggered reloads remain to be tested with the teacher.


## Audited correction after deletion of duplicated lessons (2026-10-18)

- A manually deleted completed lesson changes source records, not a previously frozen annual close automatically. Reconciliation must not overwrite payments, financial receipts, settlement decisions, or student profile fields.
- \`scripts/reconcile-closed-lessons.mjs\` audits the input JSON and can generate a separate proposal. Export requires an explicit \`--student-id\` for every targeted student and is blocked while any duplicate completed student+date+start/end slot remains.
- Proposed changes are limited to closed annual year calculation fields and rollover opening lesson/bank values only where they still exactly match the previous auto-generated carryover. Customized opening terms are preserved.
- Any difference between the recalculated financial close and \`priorYearBalances\` is reported for manager review, without changing a settled amount or issuing cash/refund changes. Never infer the 2026 annual tuition rate from the 2027 student card.
- It is not invoked at startup and performs no Dropbox writes. Validate with \`node --test scripts/reconcile-closed-lessons.test.mjs\`. An operator must compare against canonical current Dropbox data, reconcile cash receipts, and verify a safe import through the existing staged JSON workflow.

## TOBY PLAY — per-student recall progression (2026-10-18, feature draft)
- Recall levels are an **append-only per-student sequence**, stored in `Student.musicPlaySettings.recallLevels`. The first teacher-approved profile is that student's level 1; saving a changed teaching profile explicitly adds level 2, 3, etc., preserving earlier assignments and attempts. The old fixed six-tier settings are kept only for compatibility with other legacy performance/rhythm games.
- Teacher controls independent exact natural-note allowlists for treble and bass, created either from an inclusive note range or by explicit note selection; allowed diatonic motion (unison, second through octave, or free); number/location of staff(s); simultaneous notes per event (1–4) and placement (treble, bass, split, randomized); and minimum number of notation events. Generator refuses impossible ranges/intervals/chords instead of silently widening teacher-approved note sets.
- Recall notation uses hollow noteheads without stems on correct clefs. Recall supports two answer styles: **play the pitch** (on-screen note keys, computer keyboard, Web MIDI, optional monophonic microphone detection), and **speak the note name** (screen labels or browser Web Speech Recognition when available). Speech services may process audio externally; never imply browser speech is offline or that speech recognition is always supported. Monophonic microphone pitch detection is an experimental browser-local input, explicitly disabled for multiple simultaneous pitches.
- Student chooses extra events beyond teacher's minimum (0–48), BPM 40–180, and either a two-beat metronome window for each event or an elapsed-time-only, response-advanced exercise. Student preferences live in `musicPlaySettings.recallPreferences`; teacher preview never writes them.
- Virtual piano highlights approved notes only when the allowed range is sufficiently small and within one clef; for large ranges or two staves the highlight is intentionally suppressed rather than misleading.
- Personal level scores record level sequence and stable profile id; results are local updates on the existing sync path, **not verified multi-device receipts**. Microphone and Hebrew speech require real-device manual QA. Preexisting school/finance data, other game scores and Dropbox sync are not migrated or rewritten.

## TOBY PLAY recall input and staff feedback (2026-10-18)
- A recall note entered up to **0.25 beat before** its target window may be accepted; routing prefers an unfinished current note when appropriate and otherwise assigns to the next note if its pitch matches. A note entered earlier than the configured pickup is not treated as a correctly timed next note. This is deliberately a forgiving recall rule; strict timed-playing still uses individual reaction calibration and must not borrow the recall tolerance.
- SVG staff lines are painted again **above hollow noteheads**, preserving a visible continuous line through line-based pitches such as G. Active state does not mask stave lines, even with multiple staves.
- Verify on a real touchscreen, computer keyboard and microphone before claiming device-level completion; these code changes are not clinical reaction-time calibration.

## TOBY PLAY — accessible computer key map for recall (2026-10-19)
- Personal recall shows a pitch-to-computer-key legend **directly below the on-screen answer pads**, between the score staff and the optional piano illustration. It stays visible in both note-playing and spoken-note-name answer modes, including before starting and while exercising.
- Key letters A/S/D/F/G/H/J/K/L (with English keyboard layout) map in displayed allowed-note order for pitch-playing; keys 1–9 map the same order for note-name mode. Each keycap displays the precise Hebrew pitch and octave. On-screen pads mirror the same labels.
- Only the first nine notes have computer-key shortcuts; any additional allowed pitches are explicitly labelled as screen/MIDI-only, with no misleading keyboard mapping. Changes are presentation/keyboard routing only; no changes to student records, score persistence, Dropbox or timing/scoring rules.
- Real browser/tablet keyboard and screen-height validation remain pending until end-to-end device review.

## TOBY PLAY — pitch-aligned recall buttons and computer keyboard (2026-10-19)
- Per teacher UX request, removed the organ/piano illustration from personalized recall. On-screen touch answer pads appear in an ascending pitch staircase: lower notes are physically lower on the screen, with higher notes rising from left to right. The strip scrolls horizontally when needed, keeping touch targets reachable.
- Before an exercise starts (or after it ends/stops) and only if the allowed pitch set has 1–9 notes, the area directly beneath touch pads displays illuminated *computer* keycaps and pitch/octave labels. This guidance is hidden **while running** to prioritize reading notation.
- Playing mode maps physical A S D F G H J K L positions identically in English and Hebrew (ש ד ג כ ע י ח ל ך), including fallback from key labels. Name-reading mode retains physical number keys 1–9. Keyboard shortcuts are enabled only for 1–9 allowed notes; when there are **more than nine** approved pitches, no computer-key shortcut or keyboard diagram is available at all. Screen touch, MIDI and microphone/speech where supported remain available.
- No changes to student assignments, game timing/evaluation, attempts, Dropbox sync or public website. CI and live student-only deployment must be verified; real-device layout, hardware keyboards and audio QA are still pending.

## TOBY PLAY — separate name-recall and performance-recall input surfaces (2026-10-19)
- The student's personal recall module now presents two explicitly selectable answer modes (persisted in the existing optional `recallPreferences.answer`, no schema migration): **שליפה בהקראה** (speak a note name into browser Hebrew Web Speech microphone, or press the note-name button; physical computer number keys 1–9 are available only when there are at most nine approved notes) and **שליפה בנגינה** (monophonic local mic pitch estimate, Web MIDI keyboard, *interactive screen piano* or *interactive flute fingering*). These are distinct input surfaces and do not alter scoring: both resolve to the teacher-allowed MIDI note identity. The strict timed-performance game remains separate.
- In play mode the screen piano is newly interactive (replaces previous decorative organ), supports horizontal scrolling and physically positioned white/black keys, and enables only teacher-approved notes. Above 9 approved notes there is still no computer-key shortcut (legacy policy), but the clickable on-screen instrument, MIDI, and supported microphone remain usable. The physical EN/HE keycap cheat sheet remains hidden during an active exercise; this is distinct from the interactive on-screen piano which remains available while answering.
- Screen concert flute offers a simplified Boehm closed-G# flute fingering interface for **natural notes C4–C6 only**, with left/right finger pads, thumb, Eb pinky, low-C foot key, and an explicit register selector (a flute fingering by itself cannot identify its sounding octave). Students press/release keys and submit fingering; unmatched, unsupported or out-of-assignment notes are rejected rather than mapped to invented pitches. No audio/synthetic blowing from the graphical flute. This is an educational first version, not an exhaustive manufacturer-validated fingering chart; verify higher registers/alternates before widening. Reference: Yamaha flute fingering guide and Tunable flute chart (standard concert flute).
- Browser speech recognition must remain separate from microphone pitch detection. Speech uses he-IL and restarts in supported browsers if the recognition service ends mid-exercise, with a stop/error guard. Monophonic pitch detection ignores held notes until a fresh onset/pitch change to prevent repeatedly grading the same sustained sound. Speech recognition may require a browser service sending audio externally; this is disclosed to users.
- Teacher preview mode must never write student data, and the existing score/store/Dropbox semantics are unchanged (cloud durability still unverified). Real microphone/speech/MIDI testing on the user's hardware and mobile browsers is **required** before claiming device-level completion.


## Sight-reading exercise generator — feature branch (2026-10-20)

- Branch: `feature/sight-reading-local-engraving-20261020`; **not production-ready; do not deploy or merge until engraving and CI are verified.**
- Teacher's MXL `מקצבים מכל הסוגים על 2 פעמות.mxl` yielded 74 approved two-quarter-beat templates. Canonical typed compact representation in `src/lib/sightReadingPatterns.ts`; all templates must sum to 8 sixteenth-note units.
- `buildRhythmBar` constructs 2/4, 3/4, 4/4 and 5/4 from *only* approved patterns. For odd beats, a half template is permitted only at an existing exactly-one-quarter boundary; no note or rest may be split.
- `src/components/admin/SightReadingWorkspace.tsx` is a first-stage teacher-only tab integrated in `AdminDashboard.tsx`. It creates 16 rows with configurable bar count, key signature, clef, pitch classes and range, and MusicXML download.
- **Unfinished**: exact graphic rhythm selector reproducing source beaming, per-pitch temporary accidentals, local Verovio/Bravura bundling, professional live score preview, PDF, exercises archive/search, assignment/email sending, and visual verification. Do not claim these are implemented.
- Next integration should bundle the Verovio WASM via Vite and a lockfile-pinned package, run local and filtered-browser checks, ensure notation rendering on every staff including system clef/time/key, and preserve the source MXL beaming metadata (the currently stored canonical patterns retain durations and rests only).
- Student assignments should reuse the existing master/assignment mechanism and canonical Dropbox JSON merge path, never use unverified parallel persistence.

## Inline sight-reading preview (2026-10-20)

- Teacher admin `קריאה מהדף` now includes a self-contained SVG renderer (`src/components/admin/SightReadingNotation.tsx`) for all 74 rhythm choices **without staves** and for generated 16-line scores **on staves** within the admin tab; it does not need to load external libraries at runtime.
- This is an operational first-pass notation preview, not a verified Finale/MuseScore-equivalent engraving engine. Visual spacing, detailed beams, accidentals, layout and print/PDF require further expert QA. MusicXML export remains available.
- Do not claim the renderer reproduces all original MXL beam groupings: the library currently preserves event order, rests and note lengths, not MXL beam metadata.

## Exact source-beam and local professional engraving (October 2026, feature PR #57)

- Teacher's original 74-measure MXL and corresponding `מקצבים.pdf` are authoritative for rhythmic grouping. Every measure has source-specific primary/secondary `<beam>` instructions, including partial-beam hooks. These are encoded as `SOURCE_BEAMS` alongside durations in `src/lib/sightReadingPatterns.ts`; do not recalculate beam groupings based on beat boundaries or note values.
- Source beam directives are included in each generated MusicXML note in `SightReadingWorkspace.tsx`. Preserve originals even when concatenating two patterns per 4/4 bar. Half-pattern slices need special caution regarding beams crossing the slicing point.
- New `SightReadingVerovio.tsx` uses locally bundled npm `verovio@6.3.0` and the included SMuFL Bravura font to render on-page SVG scores and pattern previews. Avoid any external CDN at runtime. The previous hand-drawn SVG notation in `SightReadingNotation.tsx` must not be used as a musical engraving source.
- Regression script `scripts/test-sight-reading-engraving.mjs` verifies the 74 rhythm/beam alignments and native Verovio SVG output; PR CI includes it.
- **Not yet production-verified**: filtered-browser module loading, on-screen SVG sanitization, visual alignment and print layout, graphical catalog rest-beams and hidden staff settings. Do not deploy or claim Finale-identical glyphs without browser inspection; Finale Maestro is not distributed by this project.

## Verovio SVG glyph preservation — 2026-10-20

- The teacher observed staves and beams with missing noteheads, clefs and time-signature glyphs. Earlier component `SightReadingVerovio.tsx` passed SVG through DOMPurify before injecting with `dangerouslySetInnerHTML`; this can strip Verovio SMuFL symbol definitions/references. Exact browser-side cause still needs visual confirmation.
- New rendering uses full trusted Verovio SVG as an isolated `data:image/svg+xml` image, preserving glyph definitions without injecting arbitrary SVG markup into the DOM. Keep teacher-controlled text XML-escaped and do not reintroduce SVG HTML sanitization/injection for this renderer.
- `scripts/test-sight-reading-engraving.mjs` checks source beams, native Verovio SVG output and isolated image presentation. Browser verification of all glyphs, title, key and time signature is required after deploy.

## Sight-reading extensions — 2026-10-20
- Work branch: `feature/sightreading-pitch-rhythm-catalog-20261020`. Teacher sets exact named pitch endpoints, e.g. G3 (small octave)–C5 (second octave); reference A4=440 Hz. Selected pitch letters additionally filter notes inside the exact endpoints.
- The 74 source patterns are grouped for selection by the shortest value appearing in a template (half, quarter, eighth, sixteenth), keeping original MXL beaming.
- Melodic restrictions: steps only (diatonic difference <=1), steps/thirds (<=2), default max fifth (<=4), optional max octave (<=7), with max 2 successive leaps. Optional consecutive short notes (eighth/sixteenth) on same pitch.
- Every newly generated exercise is given a unique ID, sequence number and automatic title if blank, and appended to the `musicSystem_sightReadingArchive` canonical sync bucket with XML and searchable metadata. The user is explicitly informed that read-back verification of Dropbox durability is not yet implemented, so queueing a sync is not proven cloud persistence.
- Previously generated exercises from earlier versions were not archived; cannot recover them from this new bucket retroactively.
- Teacher may download an A4 PDF or upload it once to Dropbox via existing `workerApi.uploadAttachment` and create per-`studentId` `FileEntry` rows in the existing student files area. These operations are guarded against duplicate assignment of the same archived exercise/student pair, but **student-view verification and canonical Dropbox read-back have not yet been tested**. Do not claim confirmed end-to-end delivery.
- Future work **not implemented**: secure email attachment sending, verified student-device PDF access, two-staff piano authoring and editing. Do not claim these features complete.
