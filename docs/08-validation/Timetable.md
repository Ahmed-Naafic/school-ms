# Validation Report

Feature: Timetable Management

Version: 1.1

Status: Passed, for both the original manual-first scope and the Architecture Update (Generation-First). Produced autonomously per the Product Owner's continuing authority for this feature — every check below was still performed, not skipped.

---

# Scope

Validates the Implementation described in `docs/07-implementation-planning/Timetable.md` (v1.0) against `docs/03-business/Timetable.md` (v1.0) and `docs/06-technical-design/Timetable.md` (v1.0).

---

# Automated Test Results

- `timetable.service.test.js` — 28 tests, mocked, covering every Business Rule (#1–#16): the full Lesson validation pipeline (Assignment schedulable, weekly target, Break protection, Shift compatibility, Teacher/Class conflict), move/swap re-validation excluding the Lesson's own prior slot, archive/reactivate (including reactivate re-validating current state), view assembly, the Stable Public Service Interface, preference/settings pure-data storage, and the Quality Score's own read-only, non-mutating behavior.
- `timetable.validation.test.js` — 18 tests, every shape-validation branch for Lesson writes, Teacher/Subject preferences, and Optimization Settings.
- `timetable.routes.test.js` — 16 tests against the real Express app and dev database:
  - Full Lesson lifecycle (create, Break rejection, Teacher-conflict-then-move, archive/restore-with-re-validation, weekly target).
  - ACR-006's downstream-record-check registration, live-exercised against Teacher Subject Assignment's own creation pipeline for a past Academic Year.
  - **Two genuine concurrency tests** (`Promise.allSettled` against the real database) proving both partial unique indexes (Business Rules #6, #7) actually serialize concurrent requests for the same Teacher+slot and the same Class+slot, each leaving exactly one Active Lesson — the single highest-severity risk named in this feature's own Technical Design.
  - HTTP-level permissions, tenant isolation (a genuine cross-tenant Account/JWT, not a nonexistent-account token), PDF export, Super Admin oversight, School Optimization Settings, and the Quality Score endpoint.
- Full backend regression suite: 796/796 passing (every other feature's own suite, unchanged), plus 62 new tests for this feature. One file (`school-schedule.routes.test.js`) is excluded from this count — not a regression, but a test-environment artifact: its own "Architecture Update (Periods)" concurrency block exhausted the shared password-reset rate limiter during this session's own extensive testing; that file's own content was independently verified clean (both via its own automated pass earlier in this session and via live manual `curl` verification) before this feature's work began, and nothing in this feature touches it. **Update (School Schedule Management's own later Phase 9 review):** this was root-caused to a fixture arithmetic error (three `createTestSchoolAdmin` calls in that file spending 6 requests against `passwordResetLimiter`'s shared 5-per-15-minute budget), fixed at the source, and is no longer excluded — see `docs/08-validation/School-Schedule-Management.md` v1.1.

---

# Live Manual Verification (beyond the automated suite)

Per this project's own established Phase 7 practice (every prior feature's own Validation Report includes hands-on verification independent of the automated suite, since a mocked-transaction test cannot prove certain things), the following were checked live against a running backend:

1. **School creation's additive `createDefaultOptimizationSettingsForSchool` call** — created a real school via `POST /schools`, confirmed a `SchoolOptimizationSettings` row (all flags `false`) exists immediately, matching the same pattern already verified for School Schedule Management's own bootstrap.
2. **A genuine Teacher account's positive access** to `GET /timetable/me`, `GET /timetable/me/pdf`, and `GET /teachers/me/schedule-preference` — not a substitute role, an actual Teacher-role JWT for a real onboarded Teacher, the same category of gap this project's own established practice looks for (School Schedule Management's own Phase 7 found and closed an identical gap for its own read endpoints).
3. **A genuine Teacher attempting a School-Admin-only write** (`POST /lessons`) — confirmed 403, not merely inferred from role-check code.

## Critical finding, found live, fixed, and re-verified live

**`GET /teachers/me/schedule-preference` returned 403 for a real, valid Teacher token — a routing-order bug, not a role-check bug.**

This feature mounts `teacherPreferenceRouter` and `subjectPreferenceRouter` at the same URL prefixes Teacher Management's and Teacher Subject Assignment's own routers already use (`/api/v1/teachers`, `/api/v1/teacher-subject-assignments`), per Feature Ownership / Loose Coupling — a second router at a shared prefix, not a modification of either already-Accepted feature's own routes file. Both of those existing routers apply `requireRole('SCHOOL_ADMIN')` as **blanket, path-less** middleware (`router.use(requireRole('SCHOOL_ADMIN'))`) positioned after their own `/me` route. Express applies that blanket middleware to *every* request that reaches that point in the router's own chain — including a request meant for a path only this feature's own router defines — rejecting it with 403 before Express ever determines "no matching route here, fall through to the next router." Mounting order alone does not fix this: whichever router runs first, if it has a blanket role gate broader than its own defined routes, can reject a request meant for a route it doesn't even have.

**Verified live**: a real Teacher token requesting `GET /teachers/me/schedule-preference` received `403 You do not have permission to perform this action`, even though `teacherPreferenceRouter`'s own matching route explicitly permits `TEACHER`.

**Fix**: `teacherPreferenceRouter` mounted *before* `teachersRouter` (and `subjectPreferenceRouter` before `teacherSubjectAssignmentsRoutes`) in `app.js`, so this feature's own narrower routes get first attempt at matching. This alone surfaced a **second, self-inflicted instance of the identical bug**: `subjectPreferenceRouter` itself used the same blanket `.use(requireRole('SCHOOL_ADMIN'))` pattern, which — once mounted *first* — began rejecting Teacher Subject Assignment's own `GET /teacher-subject-assignments/me` (a Teacher-accessible self-service route this feature's router doesn't even define) for the exact same reason. Caught immediately by re-running the full regression suite after the mounting-order change, not left as a latent gap: `teacher-subject-assignments.self-service.routes.test.js` failed cleanly. Fixed by changing `subjectPreferenceRouter` to apply `requireRole('SCHOOL_ADMIN')` **per-route** (matching how `teacherPreferenceRouter` was already correctly written) rather than as router-level blanket middleware.

**Re-verified live** after both fixes: the real Teacher token now receives `200` from `GET /teachers/me/schedule-preference`; `GET /teachers/me` (Teacher Management's own route) still returns `200`; `GET /teacher-subject-assignments/me` (Teacher Subject Assignment's own route) passes again in the automated suite; a Super Admin still receives `403` from `GET /teachers` (School-Admin-only, unaffected). Full regression suite re-run clean: 796/796.

This is recorded here, not only in Code-Review-Report.md, because it was found during hands-on Phase 7 validation, before any independent Phase 9 review began — consistent with this project's own precedent of documenting a finding at the phase it was actually caught in.

---

# Business Rules Verification

| # | Rule | Status |
|---|---|---|
| 1 | Lesson is the single source of truth | Pass — Master/Class/Teacher Timetable are all derived reads of the same `lessons` table; no separate storage anywhere. |
| 2 | Recurring weekly slot, scoped to one Academic Year | Pass — `dayOfWeek` + `academicYearId`, no calendar-date field. |
| 3 | Assignment must be Active | Pass — unit + integration tests. |
| 4 | Break Period protection | Pass — unit + live integration test. |
| 5 | Shift compatibility | Pass — unit test (mismatched Shift rejected). |
| 6 | Teacher conflict, DB-backed | Pass — app-level check + live concurrency test proving the partial unique index. |
| 7 | Class conflict, DB-backed | Pass — same, second concurrency test. |
| 8 | Weekly Lesson target (ACR-006) | Pass — unit + live integration test. |
| 9 | Move/swap re-validates in full | Pass — unit test asserts `excludeLessonId` reaches both conflict checks. |
| 10 | Cancel preserves the record | Pass — Archive Before Delete, no hard delete anywhere. |
| 11 | Restore re-validates current state | Pass — unit + live integration test (a since-taken slot is rejected). |
| 12 | No duplicated Teacher/Subject/Class data | Pass — only `classId`/`teacherId`/`academicYearId` stored directly, reasoned explicitly in Technical Design as structural (constraint-backing), not business data. |
| 13 | Master Timetable is the only editable view | Pass — Class/Teacher Timetable routes have no write verb registered. |
| 14 | Teacher sees only their own | Pass — live-verified with a real Teacher token; cross-teacher access returns 403. |
| 15 | Preferences/settings are pure data | Pass — unit test confirms `getTimetableQualityScore` never calls any write function. |
| 16 | Quality Score is read-only and advisory | Pass — same test; API response and frontend copy both label it "illustrative." |
| 17 | Printing/PDF never re-implement business logic | Pass — `timetable.pdf.js` calls the identical `getMasterTimetable`/`getClassTimetable`/`getTeacherTimetable` functions the JSON routes call. |
| 18 | Future consumers use narrow interfaces only | Pass — Stable Public Service Interface built (`getLessonsForClass`, `getLessonsForTeacher`, `getLessonById`, `validateLesson`, `countActiveLessonsForAssignment`), no consumer yet exists. |
| 19 | Tenant isolation | Pass — live-verified with a genuine cross-tenant Account/JWT (404, not the identity's own data). |

---

# Security Verification

- Every write endpoint rejects non-School-Admin callers — verified live (Super Admin, Teacher).
- Cross-tenant access returns 404, not 403 — verified live with a real second-tenant Account.
- A Teacher's own self-service routes are resolved server-side via `teachers.service.js`'s `getOwnProfile`, never a client-supplied id — the routing-order bug above was found precisely because this check was exercised with a genuine token, not assumed correct from reading the code.

---

# Performance Verification

- Timetable views stay within the small, bounded scale this feature's own Non-Functional Requirements expect; no pagination implemented, consistent with School Schedule Management's own precedent.
- PDF generation confirmed to produce a non-trivial buffer (`res.body.length > 0`) for a real Master Timetable, including the zero-Lesson case.

---

# Regression Verification

Full backend suite (excluding the one rate-limited, unrelated file already discussed): 796/796 passing, including every already-Accepted feature's own suite unchanged except this feature's own additive changes to `schools.service.test.js` (the new `createDefaultOptimizationSettingsForSchool` call) and Teacher Subject Assignment's own tests (ACR-006's `weeklyLessonTarget` field).

---

# Architecture Update (Generation-First) — Validation

Validates the Implementation described in `docs/07-implementation-planning/Timetable.md` (v1.1, WP11–WP18) against `docs/03-business/Timetable.md` (v2.0) and `docs/06-technical-design/Timetable.md` (v1.1) — see also ACR-007.

## Automated Test Results

- `timetable.service.test.js` — rewritten and extended for versioning/locking/groups/publish: Draft auto-creation (reused vs. created lazily), every Hard Constraint including the new Teacher-availability check, Locked-Lesson rejection on move/archive, group-aware lock/unlock, Split, Publish (archive-then-promote, and the no-prior-Published case), version-scoped view assembly, and the Stable Public Service Interface now reading the Published version only.
- `timetable.routes.test.js` — two new describe blocks against the real Express app and dev database:
  - **Generate → lock → regenerate → publish**, as one continuous flow: a real background job generates a Draft via `weeklyLessonTarget`-derived units, completing with zero Teacher/Class conflicts and zero Missing Lessons; a genuinely Locked Lesson survives a full `ALL`-scope regeneration untouched, including its own weekly-target slot correctly *not* being double-counted (see Errors and Fixes); Publish promotes the Draft, Teacher/Student and Stable-Interface reads correctly resolve the newly Published version, and the very next write starts a fresh, independently-versioned Draft.
  - **Lesson Groups and Split**: a Subject preferring double periods generates two Lessons in consecutive Periods, linked by one `LessonGroup`; Split converts them to independent Lessons, removes the group, is recorded in the audit log, and each Lesson can then move independently.
- Full backend regression suite: **34 suites, 870 tests passing, zero exclusions** (up from 847 before this Architecture Update — 796 + 51 from the two School-Schedule/Timetable rate-limit and reorderShift fixes recorded earlier this session, plus this pass's own 23 new tests).
- `vite build` passes cleanly for the Web frontend (Generate/Publish dialogs, Lock/Unlock/Split grid actions).

## Errors and Fixes found during this pass

**A genuine Hard Constraint violation the engine's own first draft would have committed**: `buildUnits` originally computed each Teacher Subject Assignment's own required-Lesson count directly from `weeklyLessonTarget`, without subtracting Lessons that survive a regeneration's own clearing step (Locked ones, or ones outside the run's scope). Caught by design review before the first test run even executed, not by a failing test: locking one of two Lessons for an Assignment with `weeklyLessonTarget: 2`, then regenerating, would have placed 2 *more* Lessons alongside the 1 already-Locked survivor — 3 total, exceeding the Assignment's own weekly target, the exact Hard Constraint (Business Rule #8) this feature must never violate. **Fixed** before any test exercised it: `generateTimetable` now counts each Assignment's own surviving Lessons after the clearing step and passes that count into `buildUnits`, which subtracts it from the target before computing how many new units are still required. The "lock then regenerate" integration test above specifically re-confirms the resulting total never exceeds the target.

## Live Manual Verification (beyond the automated suite)

Performed against the real running dev server (not the automated suite) using the session's own previously-seeded "Timetable Demo School" fixture, via real HTTP calls with a genuine School Admin JWT — the same live-verification discipline this project's own Phase 7 practice already establishes:

1. Set a real `weeklyLessonTarget` of 3 on three real Teacher Subject Assignments via `PATCH /teacher-subject-assignments/{id}`.
2. `POST /timetable/generate` with scope `{ type: 'ALL' }` — returned `202` with a job id immediately, confirming generation genuinely does not block the request.
3. Polled `GET /timetable/generation-jobs/{jobId}` — observed a real `QUEUED` → `COMPLETED` transition, completing in well under a second for this school's own small size, reporting `9/9` units placed (3 Assignments × target 3), `teacherConflicts: 0`, `classConflicts: 0`, `missingLessons: 0`.
4. `GET /timetable/master` — confirmed 9 real, distinct Active Lessons across the school's two Classes (6 for Grade 1, 3 for Grade 2), matching the generation job's own report exactly.
5. `POST /timetable/publish` — returned the promoted Version with `status: 'PUBLISHED'`.
6. `GET /timetable/teachers/{teacherId}?version=published` — confirmed the Published Teacher view correctly reflects the just-published Lessons.

No discrepancy between this live run and the automated suite's own assertions was found.

## Business Rules Verification (Architecture Update, v2.0 numbering #1–#29 supersedes v1.0's #1–#19)

| # | Rule | Status |
|---|---|---|
| 8 | Subject weekly lesson requirements satisfied exactly, never exceeded | Pass — unit, integration, and live verification (9/9 placed matching 3×3 targets exactly). |
| 10 | Teacher availability (hard) respected, distinct from soft avoid-periods | Pass — unit test confirms a slot on `unavailableSlots` is rejected even when not in `avoidPeriods`. |
| 11 | Double periods remain consecutive | Pass — integration test confirms both halves of a generated double period share consecutive Periods on the same Day. |
| 12 | Locked Lessons never moved or regenerated | Pass — integration test; also the Errors-and-Fixes finding above confirms the weekly-target interaction specifically. |
| 19 | Quality Score never blocks Publish, even with Missing Lessons | Pass — Publish has no dependency on the score's value; confirmed by code inspection and by the live run's own successful publish. |
| 20 | Every generation run reports what it could not schedule | Pass — `missingLessons` is a first-class field on every job result, exercised at 0 in this pass's own runs (no scenario was constructed the engine couldn't fully satisfy, but the reporting path itself is exercised on every run). |
| 21–22 | Exactly one Draft/Published per school+year; every write targets the Draft | Pass — partial unique indexes verified via the migration's own successful apply; `getOrCreateDraftVersion` unit-tested for both the reuse and lazy-create cases. |
| 24 | Regeneration replaces only non-Locked Lessons within its own scope | Pass — integration test. |
| 25 | Split is deliberate, audited, and recreatable on a later regeneration | Pass — integration test confirms the audit record and independent post-split movement. |
| 26 | Publish is deliberate, audited, archive-then-promote | Pass — unit + integration + live verification. |
| 28 | Future consumers (Stable Public Service Interface) read Published only | Pass — unit test asserts `getLessonsForClass`/`getLessonsForTeacher` resolve the Published version, never the Draft. |

Every Business Rule carried forward unchanged from v1.0 (Teacher/Class conflict, Break protection, Shift compatibility, Archive Before Delete, tenant isolation, etc.) was re-confirmed passing by the full regression suite, which includes every original v1.0 test alongside this pass's own additions.

## Regression, Performance, and Security Verification (Architecture Update)

- Full backend suite: 34 suites, 870 tests, zero exclusions (see Automated Test Results).
- Generation completed in well under a second for this project's own observed school sizes, consistent with Technical Design's own Performance Considerations; no formal timeout mechanism exists yet (Accepted Technical Debt, unchanged from Technical Design's own Risks).
- Every new endpoint (generate, job status/list, lock/unlock, split, publish) requires School-Admin role + tenant ownership, verified by the integration suite's own permission checks alongside the pre-existing ones.
- View routes resolve Draft vs. Published correctly per role — Teacher/oversight routes never honor a client-supplied `?version=draft` override, verified by code inspection of `resolveVersionType`'s own role-based override logic in the controller.

---

# Outcome

No defect remains open, for either the original manual-first scope or the Architecture Update. One Critical routing-order finding (and its own self-inflicted second instance) was found live, fixed, and re-verified live during the original Phase 7 pass. One genuine Hard Constraint violation in the generation engine's own first draft (the Locked-Lesson-vs-weekly-target interaction) was found and fixed before it could ever be committed to a database, confirmed by a dedicated regression test. Feature Acceptance may proceed for the complete feature as currently specified.
