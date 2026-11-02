# School Schedule Management — Validation Report

Version: 1.1

Status: Passed, for the complete feature including the Architecture Update (Periods). Phase 7 found no implementation defects in either scope; Phase 9 found and fixed one Major cross-feature concurrency defect in the original scope's additive Class Management integration, and one further Major defect in Period's own scope (`reorderShift` crashing on an Archived Shift id) — see Addendum.

Feature: School Schedule Management

Validated against (original Calendar/Shift scope): `docs/03-business/School-Schedule-Management.md` (v1.1), `docs/06-technical-design/School-Schedule-Management.md` (v1.1), `docs/07-implementation-planning/School-Schedule-Management.md` (v1.0)

Validated against (Architecture Update — Periods): `docs/03-business/School-Schedule-Management.md` (v1.2), `docs/06-technical-design/School-Schedule-Management.md` (v1.3), `docs/07-implementation-planning/School-Schedule-Management.md` (v1.3)

Date: 2026-07-22 (original scope); 2026-07-31 (Architecture Update — Periods, Phase 7 and Phase 9)

---

# Method

Two complementary layers of verification, neither substituting for the other:

1. **The automated suite** (`backend/src/features/school-schedule/*.test.js`) — 39 unit tests (repository and cross-feature services mocked, `prisma.$transaction` mocked per this project's established pattern) plus 31 integration tests (real HTTP via `supertest`, real dev database, no mocks, including a genuine concurrent-request test). Plus the small, additive changes this feature made to Class Management's and School & Platform Management's own test suites.
2. **Independent hands-on verification performed in this pass**, going beyond what the automated suite already proves — run as a standalone script directly against the real running app and real database, not through Jest:
   - A real Teacher account (onboarded, credentials established, logged in) actually calling `GET /school-calendar` and `GET /shifts` — **this feature's own integration suite never exercised this positive case**; it only confirmed non-Teacher roles are rejected, substituting a Super Admin token for the negative case to avoid spending the password-reset rate limiter's shared budget. This pass closed that gap with a real Teacher token.
   - Renaming the auto-created default "Morning" Shift to something else, confirming Business Rule #7's own Business Review resolution ("Morning" is only the initial name, never protected) actually holds in the running system, and that renaming doesn't disturb `isDefault`/`status` — the automated suite's own correction test used a different, explicitly-created Shift, never the auto-created one specifically.
   - Attempting to archive a freshly-created school's sole Shift immediately after school creation (Business Rule #9), and confirming no write route exists at all at the Super Admin oversight path (404, not 403).
   - A direct SQL/Prisma spot-check against genuinely pre-existing data (not created during this feature's own Implementation): the three earliest Classes in the database, created long before this feature existed, all correctly reference their own school's Default "Morning" Shift — confirming the migration backfill actually worked against real historical data, not just the fixtures this feature's own tests created.
   - A source-level grep confirming no feature outside `school-schedule.repository.js` ever queries `prisma.schoolCalendar`/`prisma.shift` directly (Business Rule #21, Loose Coupling) — the only other match was this feature's own integration test file.
   - A source-level grep of every write to `isDefault`, to check the same "choke point" discipline Academic Year Management's own report verified for `isCurrent`. Result is *not* a single choke point the way `isCurrent` is: `isDefault` is written from `setDefaultShift` (the swap path, called only by `designateDefaultShift`) **and** directly as `isDefault: true` inside `createDefaultScheduleForSchool`'s own insert. Verified this second write is safe despite bypassing the swap function: it only ever runs once, at school creation, before any other Shift exists for that school, so there is no existing `true` row to collide with. Recorded here explicitly rather than either overstating a single choke point that doesn't exist, or leaving the divergence unexamined.

---

# Business Rules

| # | Rule | Check performed | Result |
|---|---|---|---|
| 1 | Single source of truth for a school's operating schedule; future calendar features reserved for this same module | Structural — feature exists, owns `SchoolCalendar`/`Shift` exclusively | Confirmed |
| 2 | Exactly one active Calendar config per school | `SchoolCalendar.schoolId` is `@unique`; integration suite confirms one row per school | Confirmed |
| 3 | Somalia Default Calendar + default "Morning" Shift auto-created together at school creation; fixed, built-in, not Super-Admin-configurable | Integration suite (new school → both present immediately); migration backfill spot-checked against 62 pre-existing schools during Implementation, re-spot-checked here against genuinely pre-existing Class/Shift data | Confirmed |
| 4 | Each weekday exactly one classification, never both/neither | Structural — only `workingDays` is stored, Weekend Days always the derived complement, so the invalid state is unrepresentable; validation tests confirm invalid/duplicate values rejected | Confirmed |
| 5 | At least one Working Day and one Weekend Day always | Unit + integration tests: empty array and full 7-day array both rejected with 422 | Confirmed |
| 6 | Calendar is a current configuration only, never versioned; historical Timetable/Attendance/Exam records remain authoritative | Structural — no history table exists for `SchoolCalendar`, updates are in place. The "historical records remain authoritative" half is not yet reachable, since Timetable/Attendance/Exam Management don't exist yet | Confirmed (as far as currently reachable) |
| 7 | Shift Names configurable; "Morning" is only the auto-created Shift's initial name, never protected | Hands-on: the real auto-created "Morning" Shift for a fresh school was successfully renamed via `PATCH`, with `isDefault`/`status` unaffected | Confirmed |
| 8 | Exactly one Default Shift per school | Partial unique index (`shifts_school_default_shift_unique`, structural); integration suite confirms designating a new Default un-defaults the previous one | Confirmed |
| 9 | A school must always have at least one active Shift | Integration + hands-on: a freshly-created school (with only its own default Shift) cannot archive it; a school reduced to one active Shift by repeated archiving also cannot archive the last one | Confirmed |
| 10 | Default Shift must always be Active; archiving the current Default requires designating a replacement first | Integration suite: designating an Archived Shift as Default → 409; archiving the current Default Shift → 409 | Confirmed |
| 11 | Designating a Shift as Default is a dedicated action, not a side effect of a general edit | `PATCH /shifts/{id}` Guard-by-Construction test confirms `isDefault` in the body is rejected; the dedicated `/designate-default` route is the only path that ever sets it (see Method's choke-point note) | Confirmed |
| 12 | Active Shift time ranges may never overlap | Unit + integration tests: create/edit/reactivate all reject an overlapping range with 409 | Confirmed |
| 13 | Shift Display Order unique and contiguous (1..N) among active Shifts; reordering renumbers affected Shifts | Unit + integration tests: reorder produces a contiguous renumbered sequence | Confirmed |
| 14 | Archiving removes a Shift from the active Display Order sequence and renumbers the remainder; restoring appends to the end | Integration suite: archived Shift's `displayOrder` becomes `null`, remaining active Shifts renumbered; reactivated Shift appended to the end, never as Default | Confirmed |
| 15 | Every Class references exactly one active Shift via a required `shiftId`; existing Classes backfilled to their school's Default Shift | Migration backfill covered all 108 pre-existing Classes (verified during Implementation); re-spot-checked here directly against the 3 earliest, genuinely pre-existing Classes in the database, all correctly pointing at their own school's "Morning" Shift; integration suite confirms new Classes default correctly and reject invalid/cross-school `shiftId` | Confirmed |
| 16 | A Shift cannot be archived while one or more active Classes reference it | Integration suite: archiving a Shift referenced by an active Class → 409 | Confirmed |
| 17 | Archiving a Shift never rewrites historical data | Structural — archived Shifts remain queryable via `GET`, never deleted; no data loss observed in any archive test | Confirmed |
| 18 | Calendar/Shift configuration belongs to exactly one school; no cross-school access | Integration suite: School B cannot see School A's Shifts; cross-tenant correction attempt → 404, not 403 | Confirmed |
| 19 | Every new school gets the same fixed, built-in defaults; no Super-Admin-configurable platform template | Hands-on: no write route exists at all at the Super Admin oversight path (`PATCH .../school-calendar` → 404); code inspection confirms `schoolScheduleAdminRouter` defines only `GET` routes | Confirmed |
| 20 | Shifts belong to the school, not to any specific Academic Year; persist across years | Structural — `Shift` has no `academicYearId` field at all; schema inspection confirms | Confirmed |
| 21 | Other modules must consume this feature's data exclusively through its own published interfaces | Source-level grep: no feature outside `school-schedule.repository.js` queries `prisma.schoolCalendar`/`prisma.shift` directly; Class Management consumes only `validateShift`/`getActiveShift` | Confirmed |
| 22 | This feature does not implement Timetable, Attendance, Exams, or Teacher Assignments | Structural/scope confirmation — no such code exists in this module | Confirmed |

---

# Permissions & Security

| Check | Expected | Result |
|---|---|---|
| No auth token → `GET /school-calendar` | 401 | 401 — confirmed |
| Super Admin → `GET /school-calendar` (own-view path) | 403 (Super Admin's role here is the separate oversight path, not this one) | 403 — confirmed |
| A real Teacher account → `GET /school-calendar`, `GET /shifts` | 200 (read-only Permissions grant) | 200 — confirmed via hands-on script (gap in the automated suite, closed this pass) |
| A real Teacher account → `PATCH /school-calendar`, `POST /shifts` | 403 | 403 — confirmed via hands-on script |
| Cross-tenant: School Admin B → `PATCH` a School A Shift | 404, not 403 (this project's established convention) | 404 — confirmed (integration suite) |
| Super Admin → `GET /schools/{id}/school-calendar`, `GET /schools/{id}/shifts` (oversight path) | 200 | 200 — confirmed |
| School Admin → oversight path for a *different* school | 403 | 403 — confirmed |
| Any role → a write verb at the oversight path | No such route exists (404) | 404 — confirmed via hands-on script |
| `schoolId` always derived from the authenticated token on the own-view path | Code inspection — no own-view route accepts a client-supplied `schoolId` | Confirmed |
| `isDefault` write paths | Two, both individually safe — see Method's choke-point note | Confirmed safe |

---

# Validation & Error Handling

| Check | Expected | Result |
|---|---|---|
| `PATCH /school-calendar` with empty or full-7-day `workingDays` | 422 | 422 — confirmed |
| `PATCH /school-calendar` with an invalid `DayOfWeek` value or duplicates | 422 | 422 — confirmed |
| `POST`/`PATCH /shifts` with missing/invalid `name`/`startTime`/`endTime`, or `endTime` not after `startTime` | 422 | 422 — confirmed |
| `PATCH /shifts/{id}` with `displayOrder`/`isDefault`/`status` in the body | 422 (Guard by Construction) | 422 — confirmed |
| `PATCH /shifts/{id}/sequence` with a non-positive/non-integer `position` | 422 | 422 — confirmed |
| Create/edit/reactivate a Shift into an overlapping range | 409 | 409 — confirmed |
| Designate an Archived Shift as Default | 409 | 409 — confirmed |
| Archive the only active Shift, the current Default Shift, or a Shift referenced by an active Class | 409 in each case | 409 — confirmed |
| Correct/reorder/archive a nonexistent or cross-tenant Shift | 404 | 404 — confirmed |
| Errors never leak internal implementation details | Every response above returned a clean `{ success, message, errors }` envelope | Confirmed |

---

# Edge Cases

All rows in the Business Specification's Edge Cases table are covered by the automated integration suite, re-verified here by reading each test against its corresponding row, with two rows additionally re-confirmed by this pass's own hands-on script (the Teacher positive-view case, and the sole-active-Shift-immediately-after-creation case). The row about a Shift archived while historical records (e.g. Timetable entries) reference it is not yet reachable, since Timetable doesn't exist yet — consistent with how Academic Year Management's own Phase 7 report treated its own not-yet-reachable rows.

---

# Regression

Full backend suite (31 suites, 730 tests, including every other feature's own tests) passes unchanged after this feature's Implementation and this Validation pass. This feature's own additive changes to School & Platform Management (`createSchool`) and Class Management (`createClass`/`updateClass`, `countActiveClassesByShift`) are each covered by new tests in those features' own existing test files, not modifications to previously-passing tests — the one exception being two `classes.service.test.js` assertions that necessarily changed shape (the expected `repository.create` payload now includes `shiftId`), which is an expected, correct consequence of the new required field, not a defect.

---

# Performance

No load/scale testing performed — out of scope per the Technical Design's Performance Considerations. A Shift list per school is expected to remain small (a handful of Shifts, manually created by School Admin), the same reasoning already applied to Academic Year Management's and Class Management's own lists.

---

# Accepted Technical Debt — Reconfirmed, Not Re-Litigated

The Technical Design's own Architecture section already establishes that Shift time overlap has no database-level backstop (the same Accepted Technical Debt already approved for Academic Year Management's own date-range overlap check) — the per-school advisory lock is the safeguard here, not a Postgres exclusion constraint. This Validation pass does not treat that as a finding; it was already a deliberate, documented trade-off before Implementation began, and this pass's own concurrency test (see below) reconfirms the lock actually serializes the writes it's meant to.

---

# Concurrency

Unlike Academic Year Management's own Phase 7 report — whose sequential-only hands-on checks missed the two concurrency defects a later independent code review found — this feature's Implementation already included a genuine concurrent-request test from the start (`backend/src/features/school-schedule/school-schedule.routes.test.js`'s own Concurrency describe block), firing real simultaneous Shift-creation requests against the running database and confirming the per-school advisory lock leaves exactly one Active row, never a corrupted or duplicated state. This pass re-ran that test independently (see Regression) rather than treating its presence in the suite as sufficient on its own — it passed again.

---

# Architecture Update (Periods) — Validation

Validated against `docs/03-business/School-Schedule-Management.md` (v1.2), `docs/06-technical-design/School-Schedule-Management.md` (v1.3), `docs/07-implementation-planning/School-Schedule-Management.md` (v1.3, WP10–WP15). Period's Implementation (Phase 6) had already landed in the same `school-schedule` module as Shift's own code (no new feature module); this pass is the first Phase 7 Validation performed against it.

## Method

1. **The automated suite** — `backend/src/features/school-schedule/school-schedule.routes.test.js`'s own "Architecture Update (Periods)" describe block (real HTTP via `supertest`, real dev database): default Period structure at school creation, the setup wizard with custom fields, full Period CRUD and lifecycle, the `updateShift` containment retrofit, tenant isolation, Super Admin oversight, audit trail persistence, and two dedicated concurrency tests (Period writes racing each other under the `shiftId` lock; `updateShift` racing a Period write under the fixed two-lock order) — plus `school-schedule.service.test.js`'s own mocked unit coverage for the same surface.
2. **Independent hands-on verification performed in this pass**, going beyond what the automated suite already proves:
   - A direct repro script (not a Jest test) calling `reorderShift` on a genuinely Archived Shift id against the real database — see Addendum's Major finding below. Re-run after the fix to confirm a clean `ConflictError` rather than the original crash.
   - Confirmed, by reading `backend/src/features/school-schedule/school-schedule.service.js` line by line against Technical Design v1.3's Architecture Update, that every Period write path (`createPeriod`, `updatePeriod`, `reorderPeriod`, `archivePeriod`, `reactivatePeriod`) acquires `acquireShiftLock` before any read or write, and that `updateShift` acquires `acquireSchoolLock` then `acquireShiftLock`, in that fixed order, matching the Review's own required invariant exactly — no code path acquires them in the reverse order.
   - Confirmed `assertPeriodNoOverlap`/`assertPeriodFitsWithinShift` both correctly skip a `null`-timed Period in both directions (an unconfigured Period neither overlaps anything nor can be overlapped) — the specific risk Technical Design's own Risks section flagged as needing explicit test coverage, not just an assumption.
   - Confirmed the wizard's assembly/naming algorithm (`buildPeriodStructureSlots`) against a non-default input, matching the automated suite's own dedicated test for this.
   - `npx vite build` re-run for the Web frontend (`web/src/features/school-schedule/{components,pages,services}` — `ShiftPeriodsPanel.jsx`, `CreatePeriodDialog.jsx`, `EditPeriodDialog.jsx`, and the wizard fields added to `CreateShiftDialog.jsx`): clean build, no errors; `school-schedule.service.js`'s API client calls confirmed to match `school-schedule.routes.js` exactly, route for route.

## Business Rules (Architecture Update — Periods)

| # | Rule | Check performed | Result |
|---|---|---|---|
| 23 | Periods belong to Shifts, and Shifts belong to Schools; a Period cannot exist without a Shift and may never be moved across Shifts | Structural — `Period.shiftId` is required and immutable through every write path; no endpoint accepts a `shiftId` change | Confirmed |
| 24 | A Period has Name, Type (`TEACHING`/`BREAK`), Start/End Time, Display Order, Shift, Active/Archived status; no other Period Type in v1 | Schema + validation (`VALID_PERIOD_TYPES`) confirm only two values accepted | Confirmed |
| 25 | Period Start/End Time optional until configured; when configured, Start before End, no overlap with other active Periods in the same Shift, and full containment inside the parent Shift's own hours | Integration suite: unconfigured creation, containment rejection (422), overlap rejection (409), all confirmed; `null`-time skip logic hands-on confirmed in both directions (Method, above) | Confirmed |
| 26 | A Period's Display Order unique and contiguous (1..N) among active Periods within the same Shift; reordering renumbers affected Periods | Integration suite: reorder produces a contiguous renumbered sequence scoped to one Shift | Confirmed |
| 27 | Archiving a Period removes it from that Shift's active sequence and renumbers the remainder; restoring appends to the end | Integration suite: archived Period's `displayOrder` becomes `null`, remaining active Periods renumbered; reactivated Period appended to the end | Confirmed |
| 28 | Zero, one, or multiple Break Periods are all valid; Breaks follow the same ordering/status/time rules as Teaching Periods | Wizard structure test confirms exactly one Break in the default (6/Yes/3) case; no structural constraint prevents zero or multiple | Confirmed |
| 29 | Timetable may assign lessons only to active Teaching Periods, never during Break Periods | Not yet reachable — Timetable did not exist when this feature's Architecture Update was designed, per the Business Specification's own Out-of-Scope framing at that time. **Superseded**: Timetable Management has since shipped and its own Business Rule #29-equivalent (never scheduling a Lesson on a Break Period) is validated in `docs/08-validation/Timetable.md`, not here — recorded for traceability, not re-verified in this document | Confirmed (via Timetable's own Validation Report) |
| 30 | Timetable, Attendance, Exam Management, Teacher/Student Daily Schedule consume Period definitions but may not create or modify them | Source-level grep: no feature outside `school-schedule.repository.js` queries `prisma.period` directly; Timetable Management's own `timetable.service.js` consumes only `validatePeriod`/`getShiftPeriods`/`getPeriodById`, matching Business Rule #21's published-interface list exactly | Confirmed |

## Permissions & Security (Architecture Update — Periods)

| Check | Expected | Result |
|---|---|---|
| A Teacher account → `GET /shifts/{id}/periods`, `GET /periods/{id}` | 200 (read-only Permissions grant) | 200 — confirmed (integration suite) |
| A Teacher account → any Period write endpoint | 403 | 403 — confirmed |
| Cross-tenant: a different school's token → a Period belonging to another school's Shift | 404, not 403 | 404 — confirmed (integration suite, "Tenant isolation and Permissions") |
| Super Admin oversight → `GET /schools/{id}/shifts/{shiftId}/periods` | 200, read-only (no write route exists at this path) | 200 — confirmed; oversight-view/owner-view parity also confirmed (see Errors and Fixes below) |
| Every Period lifecycle action produces an audit record | `PERIOD_CREATED`/`PERIOD_UPDATED`/`PERIOD_SEQUENCE_CHANGED`/`PERIOD_ARCHIVED`/`PERIOD_REACTIVATED`/`PERIOD_STRUCTURE_CREATED` | Confirmed — real `audit_logs` row queried, not mocked |

## Validation & Error Handling (Architecture Update — Periods)

| Check | Expected | Result |
|---|---|---|
| `POST`/`PATCH /periods` with an invalid `type`, missing `name`, or only one of `startTime`/`endTime` | 422 | 422 — confirmed |
| A configured Period outside its parent Shift's own operating hours | 422 | 422 — confirmed |
| Two configured active Periods overlapping in the same Shift | 409 | 409 — confirmed |
| `PATCH /periods/{id}` with `displayOrder`/`status` in the body | 422 (Guard by Construction) | 422 — confirmed |
| `POST /shifts` wizard fields: non-positive `teachingPeriodCount`, `breakAfterPeriod` exceeding it | 422 | 422 — confirmed |
| `updateShift` narrowing operating hours that would strand a configured Period | 409 | 409 — confirmed (dedicated test, Technical Design Review finding) |

## Concurrency (Architecture Update — Periods)

Two dedicated real-database concurrency tests, both passing: (1) genuinely simultaneous Period writes for the same Shift, confirming the `shiftId`-scoped advisory lock serializes them; (2) a genuinely concurrent `updateShift` (narrowing the range) and `createPeriod`/`updatePeriod` (valid under the old range), confirming the fixed `schoolId`-then-`shiftId` lock order prevents the cross-lock-key race Technical Design Review originally found — the two outcomes are never simultaneously "both succeeded" into a stranded Period.

## Regression (Architecture Update — Periods)

Full backend suite, after the fixes recorded in the Addendum below: **34 suites, 847 tests passing** — up from the pre-Period baseline of 731 (original scope) plus this Architecture Update's own new coverage, with zero suites now excluded. This supersedes the prior working assumption (recorded in an earlier draft of this report and in `docs/00-governance/Code-Review-Report.md`'s own Timetable section) that `school-schedule.routes.test.js` was a pre-existing, unrelated, rate-limit-exhausted artifact requiring exclusion from the count — see Addendum for the actual root cause, which was specific to this file's own fixture design, not an environmental flake.

---

# Outcome

All 22 Business Rules of the original Calendar/Shift scope confirmed (Rule #6's second half is confirmed only as far as currently reachable, since no downstream consumer of Calendar/Shift data exists yet — expected, not a gap, per the Business Specification's own Out-of-Scope Items). All 8 additional Business Rules of the Architecture Update (Periods, #23–#30) confirmed, #29 via Timetable Management's own later Validation Report. All Permission/Security, Validation/Error-Handling, and Regression checks pass for both scopes. **Two real coverage gaps were found in the original scope's own automated suite during this pass** — the Teacher role's positive access case, and the auto-created "Morning" Shift's renamability — both closed with independent hands-on verification against the live system rather than left as an assumption. No defect in the original scope's implementation itself was found. **Phase 7 (Validation) is complete for both scopes.**

Independent code review and Phase 9 (Feature Acceptance) found and fixed one Major cross-feature concurrency defect in the original scope, and one further Major defect specific to Period (a crash, not a concurrency race); see Addendum below. **Phase 9 is now complete for the entire feature, including the Architecture Update.**

---

# Addendum (Phase 9 Code Review)

## Original scope (Calendar/Shift)

School Schedule Management's independent Phase 9 code review found one Major finding: a concurrent `archiveShift` plus `createClass({ shiftId })` could cross the boundary between School Schedule Management and Class Management unless both sides shared the same per-school advisory lock. The Shift archive path was already locked; the Class creation/update shift-reference path now acquires the same lock and keeps its sequence-position read inside the locked transaction.

The temporary repro was replaced with permanent integration coverage in `backend/src/features/school-schedule/school-schedule.routes.test.js`. Full backend regression after the fix: 31 suites, 731 tests passing.

## Architecture Update (Periods)

**Major finding: `reorderShift` crashed with an unhandled `TypeError` (a raw 500, not a clean rejection) when given an Archived Shift's id**, rather than the 409 every sibling lifecycle action returns for the same category of misuse. Root cause: `reorderShift` loaded the target Shift via `getShiftOrThrow` (existence + tenant check only, no status check), then searched for it inside `listActiveShiftsBySchool`'s own result — which structurally excludes Archived Shifts, since they hold no `displayOrder`. An Archived target therefore resolved to `undefined`, which the renumbering step then tried to read `.id` from, crashing instead of rejecting. This is the exact class of gap `reorderClass` (Class Management) and this feature's own `reorderPeriod` (one level down) already explicitly guard against — `reorderShift` was the one sibling that did not.

**Verified live**: a standalone repro script (`prisma.school.create` → `createDefaultScheduleForSchool` → a second Shift → `designateDefaultShift` on the second → `archiveShift` on the first, now-non-Default "Morning" Shift → `reorderShift` on that same now-Archived id) reproduced `TypeError: Cannot read properties of undefined (reading 'id')` against the real database, before being fixed and re-run to confirm a clean `ConflictError`.

**Fix**: `reorderShift` now checks `target.status !== 'ACTIVE'` immediately after `getShiftOrThrow` and rejects with 409 ("An archived Shift cannot be reordered"), mirroring `reorderPeriod`'s own existing guard exactly. New permanent regression coverage added at both layers: `school-schedule.service.test.js` (mocked) and `school-schedule.routes.test.js` (real HTTP, real database).

**Second finding, test-infrastructure not product**: `school-schedule.routes.test.js` itself failed deterministically, not flakily, on every run once the Architecture Update's own "Period Suite" fixture was added — three `createTestSchoolAdmin` calls in one file (`schoolA`, `schoolB`, and the new `periodSchool`) each spend 2 requests against `passwordResetLimiter`'s shared 5-per-15-minute production security budget (`/password-reset/request` and `/password-reset/confirm` share one limiter instance), for 6 total against a limit of 5. This had been carried in this project's own working assumptions as "a pre-existing, unrelated, rate-limit-exhausted environment artifact" since the addition of the Period Suite fixture, without the specific arithmetic ever being traced. Root-caused in this pass and fixed properly, not re-excluded a second time: a new `createTestSchoolAdminDirect` test helper (`backend/src/shared/test-helpers.js`) creates a School Admin token by calling `schools.service.createSchool` in-process and minting a JWT directly via `shared/jwt.js`, the same "bypass HTTP, flip Account state via Prisma, sign the token directly" technique already established elsewhere in this project's own test-writing conventions — spending zero password-reset-limiter budget. `periodSchool`'s own creation now uses this helper; `schoolA`/`schoolB` are unchanged (they still need a real password-reset round trip, since some of their own tests exercise that flow's edge cases, and two schools alone stay within budget).

A second, unrelated bug surfaced once the rate-limit failures stopped masking it: the "Super Admin oversight (read-only)" Period test asserted a hardcoded `toHaveLength(7)` against a Shift that an *earlier* test in the same file (`School Admin can create and read Periods`) had already grown to 8 Periods — a test-ordering assumption, not a product defect. Fixed by asserting the oversight view returns exactly what the owner's own view returns for that Shift, rather than a fixed count.

Full backend regression after all three fixes: **34 suites, 847 tests passing**, with `school-schedule.routes.test.js` itself passing cleanly and completely — no suite excluded from this count for any reason.

---

# Change History

- v1.0 — Initial Validation Report, following Phase 6 Implementation. Two coverage gaps found in this feature's own automated suite (Teacher role positive-access case; auto-created default Shift's renamability) and closed via independent hands-on verification against the real running system; both were pre-existing correct behavior the tests simply hadn't exercised, not defects. Migration backfill re-confirmed against genuinely pre-existing Class/Shift data, not just this feature's own test fixtures. `isDefault`'s write paths found to be two, not one — both verified individually safe, recorded precisely rather than overstating a single choke point. No defect found.
- v1.1 — Phase 7 Validation performed for the Architecture Update (Periods), and Phase 9 (Feature Acceptance) completed for the entire feature. Business Rules #23–#30 confirmed; #29 confirmed via Timetable Management's own later Validation Report rather than re-verified here, since Timetable is the actual consumer. Phase 9 found and fixed one Major defect specific to Period (`reorderShift` crashing rather than rejecting cleanly on an Archived Shift id) plus root-caused and fixed a long-standing test-infrastructure issue previously carried as "pre-existing, unrelated, rate-limit-exhausted" without ever being traced to its actual cause (a fixture arithmetic error against `passwordResetLimiter`'s shared budget) and a related test-ordering assertion bug. Full backend suite now passes completely — 34 suites, 847 tests, zero exclusions.
