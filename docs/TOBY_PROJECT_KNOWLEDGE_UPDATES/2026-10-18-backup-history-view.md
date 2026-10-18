# Backup history: 24 raw versions — 2026-10-18

Manager-approved revised scope: show the **24 most recent raw backup versions** returned by the existing Dropbox Worker. No 12-hour sampling, no promise of two per day or 15 days of coverage, no pagination, and no server-side historical date search.

Only the existing history-screen `list_versions` request is changed from 25 to 24. The UI sorts by modification time, retains the existing date filter **within the fetched 24 only**, explicitly labels that restriction, and keeps all existing restore actions unchanged.

Do not change versioned Dropbox uploads, backup retention, synchronization, or the historical Dropbox files. Other callers of `workerApi.listVersions()` (e.g. recovery fallback) will also receive one fewer result; verify recovery behavior before merge.

Status: feature branch only; deployment and build/check verification are required before marking production complete.
