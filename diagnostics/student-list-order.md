# Student list ordering

All UI consumers of `getStudents()` receive the canonical student array sorted in ascending Hebrew alphabetical order by `lastName`, then `firstName`, then `id` for a stable tie-break.

The ordering is presentation-oriented only; no student records are deleted and no billing/history semantics are changed.
