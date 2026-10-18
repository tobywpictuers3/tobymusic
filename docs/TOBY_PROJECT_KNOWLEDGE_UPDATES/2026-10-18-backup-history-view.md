# Backup-history view — 2026-10-18

Scope: **read-only UI presentation**. Do not change Dropbox uploads, synchronization, retention, backup files, or restore transactions.

The BackupHistory component now samples the versions returned by the existing Worker list endpoint to at most one snapshot per 00:00–11:59 and 12:00–23:59 slot in Asia/Jerusalem. It displays up to 30 sampled rows at first and can reveal additional *already fetched* rows in groups of 30. Existing restore actions remain unchanged.

**Not complete / not deployed:** The existing `workerApi.listVersions()` calls `list_versions?limit=25`. The Dropbox Worker source/cursor contract has not been established in the canonical repositories. The UI therefore shows a coverage warning if 25 raw versions were returned and does **not** claim that filtering dates searches all Dropbox backups. Reaching 30 sampled versions / 15 days and searching arbitrary old dates requires a server-side date/cursor pagination contract and tests against the actual Worker, respecting Cloudflare subrequest limits. Never treat loaded local results as the complete archive.

Validation still needed: build + RTL UI test, verify server paging/date search against live Worker, and production deployment asset verification.
