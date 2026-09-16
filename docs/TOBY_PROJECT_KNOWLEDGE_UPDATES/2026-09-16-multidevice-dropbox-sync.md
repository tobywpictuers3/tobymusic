# TOBY Music — Multi-device Dropbox sync hardening — 2026-09-16

This document extends `TOBY_PROJECT_KNOWLEDGE.md` with the production invariants introduced for simultaneous admin use from multiple browsers/devices.

## Source of truth

- Production student state remains the **canonical latest versioned JSON in Dropbox** through the existing Dropbox Worker.
- Historical healthy versions are recovery/read-only sources. They must never be used as the base of an automatic production write.

## Multi-device write invariant

- A browser/device must never upload an unrelated stale full snapshot simply because some local field changed.
- Each device keeps a durable local journal of the top-level `musicSystem_*` buckets it actually changed and that have not yet been verified in Dropbox.
- Before a normal write, the client reads canonical latest, applies only its pending dirty buckets on top of that canonical state, and then uploads the merged candidate.
- Array/entity buckets continue to use id + `lastModified`/`createdAt` conflict resolution and tombstones. Unchanged buckets remain exactly as provided by canonical latest.
- A write is **not** considered cloud-successful merely because the upload endpoint returned success.
- After upload, the client must read canonical latest again and verify that its intended local delta is satisfied. If another device wrote during the race window, the client re-merges against the new canonical latest and retries a bounded number of times.
- The green sync indicator may only be updated after canonical read-back verification succeeds (or after a successful read-only canonical reconciliation with no local write pending).
- If verification fails, pending dirty keys remain pending and the UI must show a sync error rather than claim durable success.

## Read-only reconciliation

- Background/focus reconciliation is **read-only** when the current device has no pending dirty buckets. It must not upload a full local snapshot just to reconcile.
- A visible admin session performs a lightweight canonical reconciliation once per minute.
- Returning focus/visibility to a tab triggers an immediate reconciliation, throttled to avoid duplicate requests.
- When a true remote delta is applied, the admin data views are invalidated/remounted so data written from another device becomes visible without relying on stale component state.
- Hidden tabs do not spend periodic Dropbox reads.

## Manual Dropbox download

- The admin action “הורדה מדרופבוקס” must perform a dedicated strict canonical pull.
- It must not call general bootstrap logic that can merge a local snapshot and then report success regardless of the Worker result.
- If local pending changes exist, the client first attempts the verified canonical write path; it must not silently discard those changes.
- A failed canonical pull is an error and must not display a success toast.

## Compatibility

- The dirty-key journal is persisted locally so a reload does not forget pending work.
- For one upgrade transition only, an existing pre-journal local snapshot marked unsynced may seed the pending journal from its stored snapshot index; this favors preserving potentially unsynced production edits over silently discarding them.
- `/dev-admin` remains isolated and does not participate in Dropbox synchronization.

## Implementation

- Build-time guard: `scripts/patch-sync-runtime-efficiency.mjs` installs these invariants together with the existing sync cutover patches.
- The patch fails the production build if required multi-device markers are missing or if the legacy `beforeunload` full-snapshot writer survives.
- PR #34 is the implementation vehicle. Production is not considered fixed until PR #34 is merged, the student production deployment succeeds, and the live domain serves the build containing this change.
