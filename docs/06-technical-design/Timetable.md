# Technical Design

Feature: Timetable Management

Version: 1.3

Status: **Architecture Update (Generation-First) — Approved.** Following the Business Specification's own v2.0 architecture reversal (`docs/03-business/Timetable.md` v2.0, Approved): manual Lesson creation is no longer the primary workflow; this document now designs the generation engine, its background-job execution model, Lesson Groups (double periods), Locking, and Draft/Published Timetable Versioning, in addition to the v1.0 design below, which remains valid and unchanged in every respect the Architecture Update does not touch. See the Architecture Update (Generation-First) section.

**Implemented (Weekly Subject Allocation Integration):** `TeacherSubjectAssignment.weeklyLessonTarget` and `SubjectSchedulePreference.doublePeriodPreferred` are both formally removed. The generation engine's `buildUnits` and the manual-write `assertAssignmentSchedulable` (v1.0 Backend Design) now call Weekly Subject Allocation's own `getWeeklyPeriodsForAssignment` instead — see the Architecture Update Backend Design's Generation Engine subsection and Generation Pre-Flight Gates subsection below for the concrete shipped design (the Needs-Review gate throws a descriptive `Error`, caught by the job's own existing try/catch and persisted as `status: FAILED` + `errorMessage`, per the Job Execution Model — not an HTTP 409, since generation is a fire-and-forget background job with no synchronous request left open to reject). A second, brand-new pre-flight gate — the Teacher Weekly Capacity Hard Constraint (Business Rule #30, `docs/03-business/Timetable.md` v2.2) — was added in the same pass; see Generation Pre-Flight Gates below.

---

# Overview

This document designs the technical approach for the Business Specification approved in `docs/03-business/Timetable.md` (v1.0).

It applies the already-approved architecture (`System-Architecture.md`, `Folder-Structure.md`), technology stack (`Technology-Decisions.md`), and standards (`Database-Standards.md`, `API-Standards.md`, `Security-Standards.md`) to this specific feature. Two genuinely new technology choices are introduced (PDF generation, print-formatted rendering) — both flagged explicitly below, the same way native `TIME` columns were flagged when School Schedule Management introduced them.

This design applies this project's own recurring concurrency lesson from its first draft: every "exactly one X" or "no two X share Y" invariant this project has ever shipped without a per-scope advisory lock from day one has later been found racing under concurrent load (Subject Management, Academic Year Management, and — found live during its own Phase 9 — School Schedule Management's `Class`/`Shift` boundary). Every Lesson write path below acquires a per-school advisory lock as its first statement, from this feature's first Implementation pass.

---

# Architecture

- Implemented as a feature module: `backend/src/features/timetable/` — singular-feature, kebab-case, matching every prior feature's own module-naming convention.
- **`Lesson` is the single stored entity — the "single source of truth" the Business Specification requires.** Master/Teacher/Class Timetable are never separate tables; each is a differently-filtered, differently-shaped read of the same `Lesson` rows, computed at read time in the service layer.
- **Lesson's own reference shape is a deliberate reconciliation of two requirements that appear to pull in different directions**: the Business Specification's own "Do not duplicate Teacher, Subject, or Class information inside Lesson" instruction, and this project's own established "every uniqueness invariant needs a real database-level partial unique index backstop" convention (which cannot span a join). Resolved as follows:
  - `teacherSubjectAssignmentId` is the one required, semantically meaningful reference — it alone carries Teacher, Subject, Class, and Section context. Nothing about Teacher/Subject identity is ever separately stored.
  - `classId` and `teacherId` **are** stored directly on `Lesson`, copied from the chosen Teacher Subject Assignment at write time and never independently editable through any API — these are not "duplicated business information" in the sense the Business Specification means (no name, no descriptive data, nothing a caller could set independently of the Assignment); they exist solely so Business Rules #6 and #7's own conflict-prevention invariants can be expressed as genuine partial unique indexes, the same category of "structural reference needed for a database constraint" already used elsewhere in this project (e.g., `Enrollment` storing both `classId` and `sectionId` even though a Section's own class is derivable).
  - `academicYearId` is likewise stored directly (copied from the Assignment), scoping every conflict check to one Academic Year's own Timetable, the same way Teacher Subject Assignment itself already scopes its own uniqueness by `academicYearId`.
  - **`shiftId` is deliberately *not* stored on `Lesson` at all**, despite being named as a conceptual reference in the Business Specification's own architecture list. A Lesson's Shift is always fully determined by its own `periodId` (`Period.shiftId`), and must always equal its Class's own assigned Shift (`Class.shiftId`, via the Assignment) — storing it a third time would create a fact with three possible sources of truth instead of one. Business Rule #5 ("Shift compatibility") is enforced as a **cross-validation at write time** (the chosen Period's own `shiftId` must equal the Assignment's own Class's `shiftId`), not a stored column — the same "derive, don't duplicate, cross-validate at the boundary" choice this project already made for `Period` never storing its own `schoolId`.
  - Term is not modeled at all — no Term concept exists anywhere in this project yet (confirmed by inspecting every existing model); Lesson is scoped to Academic Year only, consistent with Teacher Subject Assignment's own scope.
- **`dayOfWeek` reuses School Schedule Management's own `DayOfWeek` enum** — no new enum. A Lesson's day is a recurring weekday, the same representation Working Days already use, not a specific calendar date (Business Rule #2).
- **Two Postgres partial unique indexes, both scoped to Active Lessons only**, back Business Rules #6 and #7:
  1. `(teacherId, academicYearId, dayOfWeek, periodId)` — a Teacher conflict.
  2. `(classId, academicYearId, dayOfWeek, periodId)` — a Class conflict.

  Hand-written raw SQL appended to the generated migration, the same justified exception to "only Prisma accesses the database" every partial-unique-index addition in this project already establishes (`Class.isFinal`, `AcademicYear.isCurrent`, `Shift.isDefault`).
- **A single per-school advisory lock (`pg_advisory_xact_lock(hashtext(schoolId))`) guards every Lesson write** (create, update/move/swap, cancel, restore) — applied from this feature's first Implementation pass, per the Overview's own stated lesson. A school-scoped lock, not a finer-grained one, because Business Rules #6/#7's own conflict checks span every Teacher and every Class in the school at once (a Teacher conflict check must see every other Lesson in the school referencing that Teacher, regardless of which Class it belongs to) — the same reasoning that made Shift's own lock school-scoped rather than Period's own shift-scoped lock.
- **`TeacherSchedulePreference`, `SubjectSchedulePreference`, and `SchoolOptimizationSettings` are pure data models with no enforcement logic reading them in this version** — per the Business Specification's own explicit "store, don't act on" scope. `SubjectSchedulePreference` is keyed by `teacherSubjectAssignmentId`, not by Subject alone, since preferences like "maximum lessons per day" are meaningful per Class-Subject-Year combination, not a platform-wide Subject property (mirroring where Business Rule #8's own weekly target was placed, ACR-006).
- **The Timetable Quality Score is a pure read-time computation, never stored.** It reads the current Active Lesson set plus whatever preference/settings rows exist and produces a score; nothing about its output changes any stored data, and no other function in this feature ever reads its own output.
- **(New technology choice) Server-side PDF generation via `pdfkit`.** No prior feature in this project has generated a PDF. `pdfkit` is chosen over `puppeteer`/headless-Chrome-based rendering because it is a pure-JS, dependency-light library well-suited to programmatic tabular layout (a Timetable grid), with no new runtime (no bundled Chromium) — a materially smaller new-technology footprint for a single feature's modest need, per Decision-Making-Principles' "avoid disproportionate new complexity." Flagged here for the same reason native `TIME` columns were flagged when introduced — it sets precedent for any future feature needing PDF export (Report Cards, in particular).
- **(New pattern) Print-formatted rendering via a dedicated CSS print stylesheet + `window.print()`**, no new frontend dependency at all — the standard, zero-dependency browser mechanism, consistent with "avoid disproportionate new complexity" for a requirement that has an already-solved, already-free answer.
- **Both PDF generation and the on-screen view call the exact same underlying "assemble this view's own rows" service function** — `getMasterTimetable`/`getClassTimetable`/`getTeacherTimetable` are the single source every consumer (JSON API response, PDF renderer, print-formatted page) reads from, per Business Rule #17's own explicit requirement that printing/PDF never re-implement business logic.

---

# Database Impact

## New enum

```prisma
enum LessonStatus {
  ACTIVE
  ARCHIVED
}
```

Kept distinct from `ClassStatus`/`ShiftStatus`/`PeriodStatus`, per this project's own "one status enum per owning entity" convention.

## `Lesson`

- `id`, `schoolId` (direct column — a top-level, heavily-queried-by-school entity, the same category as `TeacherSubjectAssignment`, not a lightweight child like `Period`), `academicYearId`, `classId`, `teacherId` (all three copied from the chosen `teacherSubjectAssignmentId` at write time, never independently settable), `teacherSubjectAssignmentId` (FK), `dayOfWeek DayOfWeek`, `periodId` (FK to `Period`), `status LessonStatus @default(ACTIVE)`, timestamps.
- Foreign keys to `School`, `AcademicYear`, `Class`, `Teacher`, `TeacherSubjectAssignment`, `Period` all use the project's default (RESTRICT-like) `onDelete` behavior — none of these parents are ever hard-deleted through ordinary operation, the same reasoning already applied to `Class.shiftId`.
- Indexes: `@@index([schoolId])`, `@@index([schoolId, teacherId])`, `@@index([schoolId, classId])` — every list/filter query this feature runs is scoped by one of these.
- **Two hand-written partial unique indexes** (raw SQL, appended to the generated migration):
  ```sql
  CREATE UNIQUE INDEX "lessons_teacher_slot_unique" ON "lessons"("teacherId", "academicYearId", "dayOfWeek", "periodId") WHERE "status" = 'ACTIVE';
  CREATE UNIQUE INDEX "lessons_class_slot_unique" ON "lessons"("classId", "academicYearId", "dayOfWeek", "periodId") WHERE "status" = 'ACTIVE';
  ```

## `TeacherSchedulePreference`

- `id`, `schoolId`, `teacherId` (`@unique` — at most one preference row per Teacher, ever; updated in place, never re-created), `preferredPeriods Json?` (an array of Period ids — a `Json` column, not a many-to-many join table, since this list has no per-value metadata and is read as a whole, never queried by individual Period, per "Avoid Premature Abstraction," the same reasoning `School.educationLevels` used a scalar array over a join table), `avoidPeriods Json?` (same shape), `preferBeforeBreak Boolean?`, `preferAfterBreak Boolean?`, `preferredWorkingDays DayOfWeek[]`, `preferredShiftId String?` (FK to `Shift`, nullable), `maxLessonsPerDay Int?`, `maxConsecutiveLessons Int?`, `gapPreference GapPreference?` (a small new enum: `MINIMIZE` / `ALLOW` / `NO_PREFERENCE`), `spreadFreePeriods Boolean?`, timestamps.

## `SubjectSchedulePreference`

- `id`, `schoolId`, `teacherSubjectAssignmentId` (`@unique` — at most one preference row per Assignment), `preferredPeriods Json?`, `avoidPeriods Json?`, `preferredDays DayOfWeek[]`, `avoidDays DayOfWeek[]`, `consecutivePeriodsRequired Boolean?`, `spreadAcrossWeek Boolean?`, `maxLessonsPerDay Int?`, timestamps. **(Weekly Subject Allocation Integration) `doublePeriodPreferred Boolean?` has been removed** — Double Period preference is now a per-Grade/Form, per-Subject concept (`WeeklySubjectAllocationSubject.doublePeriodRequired`), read via `getWeeklyPeriodsForAssignment`, not a per-Assignment one.

## `SchoolOptimizationSettings`

- `id`, `schoolId` (`@unique` — at most one row per school, mirroring `SchoolCalendar`'s own "exactly one, updated in place" shape), `balanceTeacherWorkloads Boolean @default(false)`, `balanceFirstLastPeriods Boolean @default(false)`, `minimizeTeacherGaps Boolean @default(false)`, `distributeSubjectsFairly Boolean @default(false)`, timestamps. Auto-created (all defaults `false`) alongside the school's own default Calendar/Shift/Period bootstrap — see Backend Design.

## `TeacherSubjectAssignment` (ACR-006's own additive change, now removed)

- `weeklyLessonTarget Int?` (added by ACR-006) **has been removed** — see "Implemented (Weekly Subject Allocation Integration)" in the Status block above and Change History v1.3. Dropped via migration, with no automatic value migration into an initial Weekly Subject Allocation, per that feature's own Business Review resolution.

---

# API Design

High-level shape only.

- REST, versioned under `/api/v1`, per API-Standards.md.
- **Lesson writes (School-Admin-only), flat resource, mirroring every other feature's own single-resource shape:**
  - `POST /lessons` — create. Body: `teacherSubjectAssignmentId`, `dayOfWeek`, `periodId`.
  - `PATCH /lessons/{id}` — move/swap. Body: same three fields, all re-validated in full (Business Rule #9).
  - `PATCH /lessons/{id}/archive` — cancel.
  - `PATCH /lessons/{id}/reactivate` — restore.
- **Timetable views (School-Admin and Teacher, scoped per Permissions):**
  - `GET /timetable/master` — every Active Lesson for the school, grouped by Class then Day/Period (School-Admin-only).
  - `GET /timetable/classes/{classId}` — one Class's own Timetable (School-Admin).
  - `GET /timetable/teachers/{teacherId}` — one Teacher's own Timetable (School-Admin; also reachable by that same Teacher for their own id — enforced server-side, not by trusting a client-supplied match).
  - `GET /timetable/me` — the authenticated Teacher's own Timetable, resolved from the token, mirroring Teacher Management's own `teachers/me` self-service pattern.
- **Printing/PDF export, mirroring the view routes exactly, one additional path segment:**
  - `GET /timetable/master/pdf`, `GET /timetable/classes/{classId}/pdf`, `GET /timetable/teachers/{teacherId}/pdf`, `GET /timetable/me/pdf` — same permission rules as their view counterparts, `Content-Type: application/pdf`.
  - Printing itself has no dedicated backend route — the Web frontend's own print-formatted layout renders from the same `GET` view response already fetched; only PDF export needs a server round trip.
- **Preferences and settings (School-Admin for any Teacher/Assignment in their school; Teacher for their own preference only):**
  - `GET`/`PUT /teachers/{teacherId}/schedule-preference`, `GET`/`PUT /teachers/me/schedule-preference` (Teacher self-service).
  - `GET`/`PUT /teacher-subject-assignments/{id}/schedule-preference` (School-Admin-only — Teacher Subject Assignment has no Teacher-self-service concept for this, since it's a Class/Subject-scoped preference, not a purely personal one).
  - `GET`/`PATCH /school-optimization-settings` (School-Admin-only, resolved from the token, no id in the path — a singleton, the same shape `GET`/`PATCH /school-calendar` already uses). A top-level path, not nested under `/schools/{schoolId}`, for the same reason `/school-calendar` isn't — avoids any path-matching ambiguity with the Super Admin oversight router's own `/schools/{schoolId}` mount.
- **Quality Score (School-Admin, read-only):**
  - `GET /timetable/quality-score`.
- **Super Admin oversight (read-only), mirroring every prior feature's own nested-route precedent:**
  - `GET /schools/{schoolId}/timetable/master`, `GET /schools/{schoolId}/timetable/classes/{classId}`, `GET /schools/{schoolId}/timetable/teachers/{teacherId}`.
- Every endpoint requires a valid JWT and passes through the same Authentication/Authorization middleware chain every other feature already uses.

---

# Backend Design

- New feature module `backend/src/features/timetable/`, structured per Folder-Structure.md (controller, service, repository, validation, routes, tests), plus a `timetable.pdf.js` helper module for the PDF-rendering concern specifically (kept separate from `timetable.service.js` so the reusable "assemble this view's own rows" functions stay free of any rendering-format concern, per Coding-Standards.md's single-responsibility guidance).
- **Shared internal helpers, the same "call the shared helper, never a partial re-implementation" discipline every prior feature already established:**
  - `getLessonOrThrow(schoolId, lessonId, tx)`.
  - `assertAssignmentSchedulable(schoolId, teacherSubjectAssignmentId, excludeLessonId, tx)` — Business Rules #3, #8: loads the Assignment via Teacher Subject Assignment's own narrow interface, rejects if not Active. **(Weekly Subject Allocation Integration, implemented)** The weekly-target room check no longer reads `weeklyLessonTarget` (removed) — it calls `weeklySubjectAllocationsService.getWeeklyPeriodsForAssignment(schoolId, assignment.classId, assignment.academicYearId, assignment.subjectId)`; when a line exists, the current Active Lesson count for that Assignment (excluding the Lesson being edited), within its own Timetable Version, must stay below its own `weeklyPeriods`; when no line exists, no cap applies at all — the same "no target set" reading the removed field's own null/unset case used to have.
  - `assertPeriodSchedulable(schoolId, periodId, classId, tx)` — Business Rules #4, #5: loads the Period via School Schedule Management's own `getPeriodById`, rejects if not Active, rejects if `type !== 'TEACHING'`, rejects if the Period's own `shiftId` does not match the Class's own `shiftId` (read via Class Management's own `getClassById`).
  - `assertNoTeacherConflict(schoolId, { teacherId, academicYearId, dayOfWeek, periodId }, excludeLessonId, tx)` and `assertNoClassConflict(...)` — Business Rules #6, #7: a plain existence check against the same two columns the partial unique indexes cover, giving a clean `409` before ever hitting the database constraint (the index itself is the backstop, not the primary mechanism, the same "app-level check plus DB-level backstop" pattern every other invariant in this project already follows).
- **`createLesson(schoolId, { teacherSubjectAssignmentId, dayOfWeek, periodId }, actingUser)`** — inside `prisma.$transaction`: `acquireSchoolLock` first, then the full assertion pipeline above in order (Assignment schedulable → Period schedulable/Shift-compatible → Teacher conflict → Class conflict), then insert with `classId`/`teacherId`/`academicYearId` copied from the Assignment.
- **`updateLesson(schoolId, lessonId, { teacherSubjectAssignmentId, dayOfWeek, periodId }, actingUser)`** — identical pipeline, `excludeLessonId` set to the Lesson's own id throughout so it never conflicts with itself.
- **`archiveLesson`/`reactivateLesson`** — the same lock-then-load-then-transition shape every other feature's own archive/reactivate pair uses; `reactivateLesson` re-runs the *entire* assertion pipeline against the Lesson's own stored `teacherSubjectAssignmentId`/`dayOfWeek`/`periodId` before restoring (Business Rule #11), the same "an archived record cannot assume its old state is still valid" principle already applied to Shift and Period reactivation.
- **View assembly — `getMasterTimetable`, `getClassTimetable`, `getTeacherTimetable`** — each a plain, read-only query over Active Lessons (scoped by school, and additionally by class/teacher where relevant), joined only through each feature's own narrow interface calls (never a direct query against another feature's table) to attach the display-only Teacher name, Subject name, Class name, Period name/times needed to render a cell. Grouping/shaping (rows = Classes vs. rows = Days) happens in the service layer, not the repository — the repository returns flat Lesson rows plus their resolved display fields; the service shapes them into the grid a given view needs.
- **`getTimetableQualityScore(schoolId)`** — reads the current Active Lesson set and whatever `TeacherSchedulePreference`/`SubjectSchedulePreference`/`SchoolOptimizationSettings` rows exist, and computes a simple, explicitly-labeled-as-illustrative composite score (e.g., percentage of Lessons whose Day/Period falls within that Teacher's or Assignment's own preferred set, penalized for exceeding a stated max-per-day/max-consecutive value) — no Product-Owner-approved weighting scheme exists yet, so the exact formula is implementation-documented here as a placeholder future auto-generation work can refine, never presented to the user as an authoritative metric (the API response and frontend copy both say "illustrative," per the Business Specification's own "advisory, not a gate" framing).
- **`generateTimetablePdf(schoolId, viewType, targetId)` (in `timetable.pdf.js`)** — calls the same `getMasterTimetable`/`getClassTimetable`/`getTeacherTimetable` function the JSON view route calls, then lays the resulting grid out via `pdfkit` into a `Buffer`, returned to the controller for streaming as the HTTP response body. No duplicate query logic, no duplicate business logic — purely a rendering step over an already-assembled view.
- **`createDefaultOptimizationSettingsForSchool(schoolId)`** — called from School & Platform Management's own `createSchool`, alongside its existing `createDefaultScheduleForSchool` call, the same "additive insert into an already-Accepted feature's own creation flow" pattern already used twice (Auth's initial admin account, School Schedule's own Calendar/Shift/Period bootstrap) — creates one `SchoolOptimizationSettings` row with every flag `false`.
- **ACR-006's downstream-record-check registration** — at this module's own load time (matching Teacher Subject Assignment's own existing registration-at-load-time convention): `teacherSubjectAssignmentsService.registerDownstreamRecordCheck('timetable', async (schoolId, academicYearId, classId, subjectId) => { ... })`, checking whether any Active Lesson references a Teacher Subject Assignment matching that scope.
- Cross-feature calls are this feature's only dependencies for validation, per System-Architecture.md's Modular Monolith style — Teacher Subject Assignment, School Schedule Management, Class Management, Teacher Management, Academic Year Management, all consumed through their own already-published narrow interfaces, never a direct table query.
- Repository layer is the only code touching Prisma, per Coding-Standards.md.

## Stable Public Service Interface

Per this project's established pattern — the only functions another feature module may call directly, in-process; everything else in this module is private.

- `getLessonsForClass(schoolId, classId, { status })` — a Class's own Lesson list, for future Attendance/Exam Management consumption.
- `getLessonsForTeacher(schoolId, teacherId, { status })` — a Teacher's own Lesson list, for a future Teacher Daily Schedule.
- `getLessonById(schoolId, lessonId)` — returns `null` on a miss or cross-school id, never throws, the same contract every other narrow interface in this project already uses.
- `validateLesson(schoolId, lessonId)` — boolean, the same role `validateShift`/`validatePeriod` already play one layer down.
- `countActiveLessonsForAssignment(schoolId, teacherSubjectAssignmentId)` — read-only; the one function ACR-006's own downstream-check and this feature's own weekly-target assertion both use, exposed publicly too since a future feature (e.g., a Teacher Subject Assignment UI wanting to show "3 of 5 Lessons scheduled") could reasonably need it. Its own role in the weekly-target assertion is unchanged by the Weekly Subject Allocation Integration — only where the *target* itself now comes from has changed (see `assertAssignmentSchedulable` above), not how the current count is derived.

No future feature may reach into this module's repository or query `Lesson`/preference/settings tables directly — the same Loose Coupling discipline every prior feature already establishes.

---

# Frontend Design

- `web/src/features/timetable/` (React/Vite/JavaScript): a Master Timetable grid page (rows = Classes, columns = Day×Period, School-Admin-only, with cell click-to-create/edit and drag-free move via a simple "select source cell, select destination cell" two-step interaction — no drag-and-drop library introduced, per "avoid disproportionate new complexity," consistent with this project's own established keyboard-operable-first UI preference); a read-only Class Timetable page and Teacher Timetable page (rows = Days, columns = Periods); a Teacher-facing "My Timetable" page (Teacher role, reusing the same read-only Teacher Timetable component scoped to the token's own Teacher id); a Preferences page (School Admin: any Teacher's or Assignment's preferences; Teacher: their own only); a School Optimization Settings toggle panel; a Quality Score readout, clearly labelled "illustrative."
- Each of the three view pages gets a "Print" button (opens the browser's native print dialog against a dedicated print-media CSS layout of the same already-fetched data) and an "Export PDF" button (calls the corresponding `/pdf` endpoint, triggers a file download).
- The frontend never re-implements any backend guard (conflict checks, Break protection, Shift compatibility, weekly target) — it only reflects what the backend returns/rejects, per System-Architecture.md's Business Logic Ownership rule. The Quality Score's own formula is never recomputed client-side.
- `web/src/app/App.jsx`, `Layout.jsx`, `nav-icons.jsx` — new routes (`/timetable`, `/timetable/classes/:id`, `/timetable/teachers/:id`, `/timetable/me`, `/timetable/preferences`, `/timetable/optimization-settings`), School-Admin nav entries plus a Teacher-scoped "My Timetable" nav entry.

---

# Mobile Design

- `mobile/lib/features/teacher/` (Flutter): a read-only "My Timetable" screen, calling the already-built `GET /timetable/me`. Deferred to the same future Mobile implementation phase every other Teacher/Student self-service screen in this project is already waiting on — the Flutter project itself does not exist yet.

---

# Validation Strategy

- All validation happens server-side, per Coding-Standards.md and API-Standards.md.
- Shape-only in `validation/`: `teacherSubjectAssignmentId`/`periodId` (non-empty strings), `dayOfWeek` (valid `DayOfWeek` enum value); preference/settings fields shape-checked against their own declared types (booleans are booleans, `maxLessonsPerDay`/`maxConsecutiveLessons` are positive integers when present, `gapPreference` is one of the three enum values, day/period arrays contain only valid enum values/existing ids' shapes).
- Data-dependent checks (Assignment Active + weekly-target room, Period Active + Teaching-type + Shift match, Teacher conflict, Class conflict) all stay in the service layer's assertion helpers, per this project's established validation/service split.
- `PATCH /lessons/{id}` accepts exactly the same three fields `POST /lessons` does — no Guard-by-Construction whitelist gap, since there is no separate "status" or derived field a client could otherwise smuggle in (status changes only through the dedicated archive/reactivate actions).

---

# Security Considerations

- Every endpoint requires authentication, role permission, and tenant (school) ownership checks, in that order, per Security-Standards.md's Authorization Security section.
- `GET /timetable/teachers/{teacherId}` and `.../pdf` additionally check that a Teacher-role caller's own id matches `{teacherId}` — resolved server-side from the token, never trusting a client-supplied match; a mismatch returns 403 (a Teacher attempting another Teacher's id), consistent with this project's existing "self-service must be self-scoped, enforced server-side" convention (Teacher Management's own `teachers/me`).
- Cross-tenant access to another school's Lesson, preference, or settings row returns 404, not 403, per this project's established convention.
- Every Lesson lifecycle event and every preference/settings change produces an audit record.
- The Super Admin oversight routes are read-only — no write route exists at any of those paths.
- PDF responses set `Content-Disposition` appropriately (inline for print-preview-style consumption, or attachment for direct download — a frontend/UX choice, not a security one) and never leak another school's data through a guessable id, since every route resolves tenant ownership identically to its JSON-view counterpart before generating anything.

---

# Performance Considerations

- Timetable views are expected to stay small and bounded per school (at most Classes × Days × active Periods Lessons — realistically a few hundred rows even for a large school); no pagination is implemented, consistent with School Schedule Management's and Class Management's own precedent for small, bounded lists.
- `Lesson.schoolId`, `.teacherId`, `.classId` are all indexed, since every query this feature runs is scoped by one of them.
- PDF generation is synchronous, in-request — acceptable at this feature's expected scale (a single view's worth of rows); a future bulk-export capability generating many PDFs at once should reconsider this (background job queue) at that time, not now (YAGNI).

---

# Error Handling

- Consistent with API-Standards.md's status codes: 401/403 for authentication/role failures (including a Teacher requesting another Teacher's Timetable/preferences), 404 for a nonexistent or cross-tenant Lesson/Teacher/Class/preference/settings row, 422 for validation errors, 409 for state-conflict errors.
- **422** — missing/invalid `teacherSubjectAssignmentId`/`dayOfWeek`/`periodId`; an invalid preference/settings field shape.
- **409** — a Teacher conflict (Business Rule #6); a Class conflict (Business Rule #7); a Period that is a Break (Business Rule #4); a Period whose Shift does not match the Class's own Shift (Business Rule #5); a Teacher Subject Assignment that is not Active, or already at its own weekly target (Business Rules #3, #8); restoring a Lesson into a slot since taken by a different Lesson (Business Rule #11).
- Errors never expose internal implementation details, per Coding-Standards.md.

---

# Dependencies

- **Teacher Subject Assignment** — Accepted (or Approved-through-Implementation-Planning at minimum, per Development-Roadmap.md's own sequencing note for this feature). Requires ACR-006's additive `weeklyLessonTarget` field and consumes its downstream-record-check registry.
- **School Schedule Management** (including its Period Management addition) — its own Feature Acceptance need not be fully closed for this feature to depend on it, the same precedent Teacher Subject Assignment itself already set by being built against Academic Year Management while still Approved-through-Implementation-Planning; this feature consumes `getPeriodById`/`validatePeriod`/`getShiftById` only.
- **Class Management, Teacher Management, Academic Year Management, Subject Management** — all Accepted; consumed only through their own already-published narrow interfaces.
- **School & Platform Management** — Accepted. Requires one small, additive change: `createSchool` gains a call to `createDefaultOptimizationSettingsForSchool`, the same category of change already made three times.
- No other feature is a dependency of this one. Attendance Management, Exam Management, Teacher Daily Schedule, Student Daily Schedule are all future *consumers*, not dependencies.

---

# Risks

- **Two, not one, hard-conflict partial unique indexes are being introduced together for the first time in this project.** Both must be verified independently under real concurrency, not assumed correct together just because each is individually modeled on already-proven precedent.
- **The Teacher/Class conflict check spans the whole school, not one Class or one Teacher** — meaning the per-school advisory lock genuinely needs to be school-scoped (not finer-grained), unlike Period's own shift-scoped lock; a narrower lock here would not actually prevent the conflicts this feature exists to prevent.
- **PDF generation (`pdfkit`) is a brand-new dependency and a brand-new code path for this project** — flagged for Technical Design Review's explicit attention as the first instance of server-side document generation, the same way native `TIME` columns were flagged when first introduced.
- **The Timetable Quality Score's own formula is not Product-Owner-specified** — implemented as an explicitly-labeled illustrative heuristic, not a hidden, silently-authoritative business rule. If the Product Owner wants a different weighting scheme, that is a future, separate decision — this version's formula must remain clearly marked as provisional in both the API response and the frontend copy.
- **ACR-006's downstream-record-check registration is Teacher Subject Assignment's first real consumer of a previously-unused extension point** — worth confirming live that a correction to a past-Academic-Year Assignment already referenced by a Lesson actually requires a reason, not just that the registration call doesn't crash.
- **`classId`/`teacherId`/`academicYearId` stored directly on `Lesson`, copied from the Assignment, must never drift from the Assignment's own current values.** Since a Teacher Subject Assignment's own `classId`/`teacherId`/`academicYearId` are themselves immutable after creation (Teacher Subject Assignment has no "change the Class" or "change the Teacher" correction path — only Replace Teacher, which creates a new Assignment), this drift risk does not actually exist in practice, but is worth stating explicitly as the reasoning that makes storing a copy safe here, rather than assuming it without checking.

---

# Architecture Update (Generation-First)

Following `docs/03-business/Timetable.md` v2.0's Product Owner-directed reversal of the manual-first architecture. Everything in this section is additive to, or a stated modification of, the v1.0 design above — nothing here contradicts Business Rules #1–#17 (v1.0 numbering) that carried forward unchanged into v2.0.

## Architecture

- **`TimetableVersion` is the new top-level scoping entity every Lesson now belongs to.** A school's own Draft/Published/Archived working copy of its Timetable for one Academic Year. This is the single biggest structural change: `Lesson`'s own Teacher/Class conflict partial unique indexes (v1.0's Database Impact) are re-scoped from `academicYearId` to `timetableVersionId`, because the same Teacher/Class/Day/Period slot now legitimately exists as independent Lesson rows across a school's Draft and Published versions simultaneously — that is two different working copies, not a conflict. `timetableVersionId` already implies a single Academic Year (a Version is itself scoped to one), so no scoping precision is lost.
- **Exactly one DRAFT and exactly one PUBLISHED `TimetableVersion` per (schoolId, academicYearId) at a time**, enforced the same way every other "exactly one X" invariant in this project is: a partial unique index per status value (see Database Impact), not application logic alone. Any number of ARCHIVED versions accumulate as history — no partial unique index needed for that status, the same "only the flagged states need uniqueness, history is unbounded" reasoning `Shift.isDefault`/`AcademicYear.isCurrent` already established.
- **Every Lesson write (generation or manual) resolves and writes into the school's own current Draft Version, auto-creating one if none exists.** A shared helper, `getOrCreateDraftVersion(schoolId, academicYearId, tx)`, is the single choke point every write path (manual create/update/archive/reactivate/lock/unlock, generation, split) calls — never a partial re-implementation. This is the same "auto-create a sensible default on first need" pattern this project has used repeatedly (Default Shift, Default Calendar, default Optimization Settings), applied here to a lazily-created Draft instead of an eagerly-created-at-school-creation default, since a Draft's own existence is meaningless before there is anything to draft.
- **Publishing is a single, explicit transition, not a background job** — validate the Draft (structurally: it exists; no further business validation is required, since every Lesson in it already passed Hard Constraint validation at write time), set it to `PUBLISHED`, and set whatever was previously `PUBLISHED` (if anything) to `ARCHIVED`, inside one locked transaction. This is fast (a handful of row updates, no re-computation), so unlike generation itself it does not need the background-job treatment.
- **`LessonGroup` models a double period as two ordinary, linked `Lesson` rows — never a single Lesson spanning two Periods.** This was an explicit Product Owner decision (over a spanning-Lesson alternative), preserving the existing one-Lesson-per-Period data model so Attendance and every other future per-Period feature keep working against individual Lesson rows unmodified. Each Lesson in a group carries `lessonGroupId` and `sequenceInGroup` (1 or 2); the group itself carries no scheduling data of its own — it is purely a linking record.
- **`locked` is a plain Boolean on `Lesson`, not a separate entity or status value.** A Locked Lesson is still `ACTIVE`/`ARCHIVED` in the ordinary sense; `locked` is an orthogonal flag the generation engine and every move/swap/delete path must check and refuse to touch, the same "Guard by Construction, dedicated action only" discipline `isDefault`/`isFinal` already established — no write path may set `locked` as a side effect of any other change.
- **The generation engine is a pragmatic, deterministic-enough heuristic — not a formal CSP/SAT solver, and no new solver library is introduced.** Real classroom timetabling is NP-hard in general; a from-scratch general solver would be a disproportionate new-technology decision for this pass (this project has never introduced a heavy algorithmic dependency, and Decision-Making-Principles' Consistency Over Preference cuts against introducing one unilaterally here). The engine instead uses **most-constrained-first greedy placement with preference-weighted slot scoring** (see Backend Design's Generation Engine subsection) — every Hard Constraint is a hard filter (a candidate slot that fails one is never considered, full stop); every Soft Preference is a scoring weight among the slots that survive the hard filters. This is a genuinely new algorithmic code path for this project, flagged here the same way `pdfkit` and native `TIME` columns were each flagged as this project's own first instance of something.
- **Generation runs as a background job — the Product Owner's own explicit choice over a synchronous request**, given a real school's generation (many Classes × Periods × constraints) is not guaranteed to finish inside a single HTTP round trip. **No job queue/worker infrastructure exists anywhere in this project**, and introducing one (Redis + BullMQ, or similar) would be a disproportionately large new-technology decision for this one feature. The simplest mechanism that fits this project's current single-process architecture is used instead: `TimetableGenerationJob` is a DB-persisted status/progress row; starting a job creates that row and fires an async function that is never awaited by the request handler (fire-and-forget via `setImmediate`), so the HTTP response returns the job id immediately while the actual work continues in the same Node process. **This is Accepted Technical Debt, not an oversight**: a process crash mid-run leaves a job stuck at `RUNNING` forever, with no automatic recovery — see Risks.
- **Scope (`ALL`/`CLASS`/`TEACHER`/`DAY`) is a single Json column on `TimetableGenerationJob`, not four nullable scalar columns** — its shape genuinely varies by type and is never queried by its own sub-fields, only read back whole once the job resolves what to do, the same reasoning already applied to `TeacherSchedulePreference.preferredPeriods`/`avoidPeriods`.
- **`unavailableSlots` is a new, deliberately separate field from `TeacherSchedulePreference.avoidPeriods`** — Business Rule #10 (v2.0 numbering) names Teacher availability as a Hard Constraint, distinct from the existing soft avoid-periods preference; conflating them would mean either silently promoting every Teacher's avoid-periods list to a hard block (breaking the existing "soft, may be violated if necessary" contract) or having no way to express a genuine hard unavailability at all. `unavailableSlots` carries a `dayOfWeek` per entry (`avoidPeriods` does not, since it's a school-wide-per-weekday-only preference) — availability is naturally day-specific ("not available Monday afternoons"), which the existing field's own shape cannot express.

---

## Database Impact (Architecture Update)

## New enums

```prisma
enum TimetableVersionStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

enum TimetableGenerationJobStatus {
  QUEUED
  RUNNING
  COMPLETED
  FAILED
}
```

## `TimetableVersion`

- `id`, `schoolId` (FK), `academicYearId` (FK), `status TimetableVersionStatus @default(DRAFT)`, `publishedAt DateTime?`, timestamps. `lessons Lesson[]` and `generationJobs TimetableGenerationJob[]` back-relations.
- Two partial unique indexes (hand-written raw SQL, the same justified exception this project's every prior "exactly one X" invariant already established):
  ```sql
  CREATE UNIQUE INDEX "timetable_versions_school_year_draft_unique" ON "timetable_versions"("schoolId", "academicYearId") WHERE "status" = 'DRAFT';
  CREATE UNIQUE INDEX "timetable_versions_school_year_published_unique" ON "timetable_versions"("schoolId", "academicYearId") WHERE "status" = 'PUBLISHED';
  ```
- `@@index([schoolId, academicYearId])` — every query this feature runs against Versions is scoped by both.

## `LessonGroup`

- `id`, `schoolId` (plain column, no `@relation` — the same "reference without a full bidirectional relation" precedent `AuditLog.schoolId` already established, since this is a lightweight linking record, not a domain entity needing its own navigable relation to `School`), timestamps, `lessons Lesson[]`.
- `@@index([schoolId])`.

## `TimetableGenerationJob`

- `id`, `schoolId`, `academicYearId` (both plain columns, same reasoning as `LessonGroup.schoolId` — a transient tracking record, not a domain entity), `timetableVersionId String?` (FK, nullable — set once the job resolves/creates the Draft it writes into), `status TimetableGenerationJobStatus @default(QUEUED)`, `scope Json`, `totalUnits Int @default(0)`, `placedUnits Int @default(0)`, `currentPhase String?`, `result Json?` (the completed Quality Score + statistics), `errorMessage String?`, `requestedById String`, timestamps plus `startedAt`/`completedAt`.
- `@@index([schoolId])`.

## `Lesson` (additive change to this feature's own already-implemented model)

- New: `timetableVersionId String` (FK, required — every Lesson belongs to exactly one Version), `locked Boolean @default(false)`, `lessonGroupId String?` (FK, nullable), `sequenceInGroup Int?`.
- The two existing partial unique indexes are **re-scoped** from `academicYearId` to `timetableVersionId`:
  ```sql
  CREATE UNIQUE INDEX "lessons_teacher_slot_unique" ON "lessons"("timetableVersionId", "teacherId", "dayOfWeek", "periodId") WHERE "status" = 'ACTIVE';
  CREATE UNIQUE INDEX "lessons_class_slot_unique" ON "lessons"("timetableVersionId", "classId", "dayOfWeek", "periodId") WHERE "status" = 'ACTIVE';
  ```
- New index: `@@index([lessonGroupId])`.
- **Migration note**: `timetableVersionId` is added nullable, then every pre-existing Lesson (there is no "Draft/Published" concept before this migration — every existing Lesson simply *was* the Timetable) is backfilled into a newly-created `PUBLISHED` `TimetableVersion` per distinct (schoolId, academicYearId) pair, then the column is set `NOT NULL`. No Draft version is created by this backfill — the first write against each school creates its own Draft lazily, per Architecture above.

## `TeacherSchedulePreference` (additive)

- New: `unavailableSlots Json?` — an array of `{ dayOfWeek, periodId }` objects (see Architecture above for why this is a separate field from `avoidPeriods`).

---

## API Design (Architecture Update)

- **Generation:**
  - `POST /timetable/generate` — School-Admin-only. Body: `{ scope: { type: 'ALL' | 'CLASS' | 'TEACHER' | 'DAY', classId?, teacherId?, dayOfWeek? } }`. Returns `202` with `{ jobId }` immediately — never the finished result.
  - `GET /timetable/generation-jobs/{jobId}` — School-Admin-only, polled by the frontend. Returns `{ status, totalUnits, placedUnits, currentPhase, result?, errorMessage? }`.
  - `GET /timetable/generation-jobs` — School-Admin-only, recent job history for the school (list, most recent first).
- **Locking:**
  - `PATCH /lessons/{id}/lock`, `PATCH /lessons/{id}/unlock` — School-Admin-only. Applies to the whole Lesson Group if the target Lesson belongs to one.
- **Lesson Groups:**
  - `PATCH /lesson-groups/{id}/split` — School-Admin-only, dedicated action, no body — converts both member Lessons into ordinary independent Lessons and removes the group.
- **Publishing:**
  - `POST /timetable/publish` — School-Admin-only, body `{ academicYearId }` (defaults to the school's own Current Academic Year when omitted, mirroring Teacher Subject Assignment's own default pattern) — validates and publishes the current Draft.
- **Quality Score (reshaped from v1.0's simple score into a structured result, same route):**
  - `GET /timetable/quality-score` — now returns `{ overallQuality, teacherConflicts, classConflicts, missingLessons, teacherPreferenceSatisfaction, subjectDistribution, teacherGapScore, workloadBalance }`, matching a completed generation job's own `result` shape exactly, so the frontend has one shape to render whether it's showing a fresh job's result or an on-demand score for the current Draft.
- **Existing view/PDF/Lesson-write routes (v1.0) are unchanged in path and shape**, except: `GET` view routes gain an optional `?version=draft|published` query param (School-Admin-only meaningfully chooses; defaults to `draft` for School-Admin's own Master/Class/Teacher Timetable pages, always `published` for Teacher's own `/timetable/me` and Super Admin's oversight routes, regardless of any query param supplied); `PATCH /lessons/{id}` and the archive/reactivate/create paths now reject with `409` if the target Lesson is Locked (Business Rule #12, v2.0 numbering).

---

## Backend Design (Architecture Update)

### Generation Engine

- `generateTimetable(schoolId, academicYearId, scope, jobId, tx-per-step)` — the core engine, invoked by the job runner (see Job Execution below), never called synchronously from a controller. **(Weekly Subject Allocation Integration, implemented)** Its very first two actions, before scope is even resolved, are the two pre-flight gates described in Generation Pre-Flight Gates below — either one throws a plain, descriptive `Error` that aborts the entire run before Step 1.
- **Step 1 — Resolve scope into a unit list.** For `ALL`: every Active Teacher Subject Assignment for the school + Academic Year. For `CLASS`/`TEACHER`: filtered to that Class's or Teacher's own Assignments. For `DAY`: every Assignment, but candidate slots are restricted to that one Day only (existing non-Locked Lessons on other Days are left untouched). **(Weekly Subject Allocation Integration, implemented — supersedes the original `weeklyLessonTarget`/`doublePeriodPreferred` reading below)** Each Assignment's own required-lesson unit count and double-period flag are now both read in one call, `weeklySubjectAllocationsService.getWeeklyPeriodsForAssignment(schoolId, assignment.classId, academicYearId, assignment.subjectId)`: `target = allocationLine ? allocationLine.weeklyPeriods : 0` (a missing line means **zero** required units — never a silent default of one, the deliberate departure from the original `weeklyLessonTarget || 1` reading, matching Weekly Subject Allocation's own Business Review resolution) and `wantsDouble = allocationLine ? allocationLine.doublePeriodRequired : false`. `SubjectSchedulePreference` is still read for its other fields (preferred/avoid periods, etc.) — only the double-period flag's own source moved. A unit is a single Period placement, except when `wantsDouble` is true, in which case units are paired two-at-a-time into double-period requirements wherever the target count allows an even pairing (an odd remainder is placed as one single-Period unit).
- **Step 2 — Clear non-Locked Lessons within scope**, in the current Draft (auto-created if missing) — `ALL`: every non-Locked Lesson for the school; `CLASS`/`TEACHER`: only that Class's/Teacher's own; `DAY`: only that Day's own. Locked Lessons (and Lessons outside the scope) are never touched, per Business Rule #24 (v2.0 numbering).
- **Step 3 — Most-constrained-first ordering.** Units are sorted by how few Hard-Constraint-satisfying candidate slots they currently have (computed against the Draft's own state as it stands *after* Step 2's clearing, recomputed as placement proceeds) — the classic constraint-satisfaction heuristic of resolving the most-constrained variables first, minimizing how often a later unit finds zero slots left purely due to placement order rather than genuine infeasibility.
- **Step 4 — For each unit, in that order:**
  1. Build the candidate slot list: every (Day, Period) combination where the Period is `TEACHING` (never `BREAK`), belongs to the unit's own Class's Shift, is a Working Day for the school, and — for `DAY`-scoped runs — matches the requested Day.
  2. Apply every Hard Constraint as a filter, removing any candidate that would: double-book the Teacher (Business Rule #6) or Class (Business Rule #7) against any other Active Lesson already in this Draft (including ones just placed earlier in this same run); fall on a Teacher's own `unavailableSlots` entry (Business Rule #10); or, for a double-period unit, fail to have its own very next Period (by that Shift's own active Display Order) also survive every one of these same filters for the second half.
  3. If zero candidates survive: record the unit as **Missing** (Business Rule #20) and continue to the next unit — never fail the whole run.
  4. Otherwise, score every surviving candidate against the Soft Preferences that apply (Teacher's own preferred/avoid periods, before/after-break preference, preferred days/shift, max-lessons-per-day, max-consecutive, gap preference, spread-free-periods; the Assignment's own preferred/avoid periods/days, spread-across-week, max-lessons-per-day; the school's own balance-workloads/balance-first-last/minimize-gaps/distribute-subjects-fairly settings, each read from `SchoolOptimizationSettings`) — a simple additive weighted score, not a formal multi-objective solver; pick the single highest-scoring candidate (ties broken by the lowest Display Order, for determinism).
  5. Place the Lesson (or both halves of a double-period unit, linked via a new `LessonGroup`); update the job's `placedUnits`/`currentPhase` progress fields; continue.
- **Step 5 — Compute the Quality Score** (see below) over every Active Lesson now in the Draft within the run's own scope, store it as the job's `result`, mark the job `COMPLETED`.
- This algorithm is intentionally **not** a backtracking solver — once a unit is placed, it is never reconsidered or undone to make room for a later, harder-to-place unit. This is a deliberate simplicity trade-off (a real backtracking solver has unbounded worst-case runtime, which conflicts with "simplest maintainable mechanism" and the background-job model's own need for boundedness) — the most-constrained-first ordering in Step 3 is what keeps this an acceptable trade-off in practice, not a formal guarantee. Flagged in Risks.

### Generation Pre-Flight Gates (Weekly Subject Allocation Integration, implemented)

Two checks run as the very first two statements of `generateTimetable`, before scope is resolved (Step 1) or anything is cleared (Step 2) — either one throws a plain `Error`, which the Job Execution Model's own existing try/catch persists as `status: FAILED` + `errorMessage` (never a partial or corrupted Draft, since nothing has been touched yet).

- **`assertNoNeedsReviewAllocations(schoolId, academicYearId)`** — calls Weekly Subject Allocation's own Stable Public Service Interface function `isSchoolNeedsReview(schoolId, academicYearId)`; if it reports `true` (one or more allocations' saved figures no longer match their Grade/Form's current calculated available periods), throws with a message naming the condition and telling the Administrator to review and re-save every Needs-Review allocation before retrying. This reuses an already-designed Weekly Subject Allocation concept — no new Business Rule of its own, just a new caller of an existing one, per Business Specification's Validation Rule #16.
- **`assertNoTeacherOverCapacity(schoolId, academicYearId)`** — Business Rule #30, `docs/03-business/Timetable.md` v2.2. For every distinct Teacher with at least one Active Teacher Subject Assignment for the school + Academic Year (via `getAllActiveTeacherIdsForSchool`, a small local helper over `teacherSubjectAssignmentsService.listAssignments`), calls Teacher Subject Assignment's own new narrow interface function `getTeacherWeeklyCommitmentAndCapacity(schoolId, teacherId, academicYearId)` (see `docs/06-technical-design/Teacher-Subject-Assignment.md` v1.5 for that function's own full design — committed periods summed via Weekly Subject Allocation across every Active Assignment; capacity as Working Days × Teaching Periods summed once per distinct Shift the Teacher's own Classes use). Every Teacher whose `committed > capacity` is collected (name resolved via `teachersService.getTeacherById`, never a raw id shown to the Administrator); if the collection is non-empty, throws one `Error` listing every over-committed Teacher by name with their own committed/capacity figures (e.g., `"X is assigned 38 periods/week but is only available for 35"`), joined into a single message — never one thrown error per Teacher, so the Administrator sees every offender in one pass rather than fixing them one at a time across repeated failed attempts.
- **Enforcement lives here, and only here — never as a write-time check on Weekly Subject Allocation's own `createAllocation`/`correctAllocation`, nor on Teacher Subject Assignment's own `createAssignment`/`correctAssignment`/`replaceTeacher`.** A Weekly Subject Allocation edit alone (raising one Grade/Form's own Subject periods) can push a shared Teacher over capacity with zero Teacher Subject Assignment writes occurring at all — so a write-time gate on either feature's own side could never be reliable by itself; only a check performed at the moment generation actually needs the guarantee can be trusted. This mirrors the same reasoning already used for `isSchoolNeedsReview` (also enforced only here, never at Weekly Subject Allocation's own write paths).
- Capacity is deliberately **not** reduced by the Teacher's own `unavailableSlots` (`TeacherSchedulePreference`, Business Rule #10/#23) — that finer-grained, per-slot exclusion is already correctly and separately handled by Step 4's own existing Hard Constraint filter at actual placement time (a slot-unavailable Teacher simply has fewer surviving candidate slots per unit, which already correctly surfaces as a Missing Lesson if it makes a unit unplaceable). This pre-flight gate exists only to catch the unambiguous, coarser case: the full week being over-committed regardless of any one Teacher's own specific availability pattern.

### Quality Score computation

- `computeQualityScore(lessons, { preferences, settings })` — a pure function over an already-assembled Lesson list, shared between a completed generation job's own `result` and the standalone `GET /timetable/quality-score` endpoint (which calls it on-demand against whatever is currently in the Draft, generated or not):
  - `teacherConflicts`/`classConflicts` — always `0` by construction for anything the engine placed (Hard Constraints are never violated); a non-zero value here is only reachable if manual edits somehow bypassed validation, so this doubles as a self-check, not just a report.
  - `missingLessons` — count of required units the current generation run (or, for an on-demand score, a re-derivation of "how many units *should* exist per current weekly targets vs. how many Active Lessons actually exist") could not place.
  - `teacherPreferenceSatisfaction`/`subjectDistribution`/`teacherGapScore`/`workloadBalance` — each a simple percentage (matched-criteria-count over applicable-criteria-count, or a normalized variance-based measure for balance/gap scores), explicitly documented as illustrative, per v1.0's own already-established "not Product-Owner-weighted" caveat — carried forward unchanged in spirit, now applied to a richer, multi-component score instead of one single number.
  - `overallQuality` — a simple unweighted average of the above percentage components (Missing Lessons and the two conflict counts converted to a penalty-based percentage contribution) — again, explicitly illustrative.

### Job Execution Model

- `POST /timetable/generate`'s controller creates the `TimetableGenerationJob` row (`status: QUEUED`), responds `202` with the job id, then calls `setImmediate(() => runGenerationJob(jobId))` — deliberately not awaited, so the response has already been sent by the time the actual work starts.
- `runGenerationJob(jobId)` — loads the job, sets `status: RUNNING` + `startedAt`, resolves (or creates) the target Draft `TimetableVersion`, calls the Generation Engine above, updating `placedUnits`/`currentPhase` after each unit so a concurrent poll reflects real progress, and finally sets `status: COMPLETED` + `result` + `completedAt`, or `status: FAILED` + `errorMessage` if the engine throws.
- Every DB write inside the engine (`await`ed Prisma calls between placements) naturally yields the Node.js event loop, so this does not fully block other requests for the run's own duration — a pragmatic property of the algorithm's own DB-call-per-placement shape, not a formal scheduling guarantee.
- **No recovery mechanism exists for a job stuck at `RUNNING` after a process crash** — Accepted Technical Debt, see Risks.

### Lesson Group operations

- `getLessonGroupOrThrow(schoolId, groupId, tx)` — loads the group and its member Lessons, tenant-checked via the Lessons' own `schoolId`.
- Move/swap/lock/unlock/delete, when the target Lesson has a `lessonGroupId`, apply the same operation to both member Lessons inside one transaction — never leaving a group half-moved, half-locked, or half-deleted.
- **`splitLessonGroup(schoolId, groupId, actingUser)`** — inside a locked transaction: loads the group, sets `lessonGroupId`/`sequenceInGroup` to `null` on both member Lessons, deletes the now-empty `LessonGroup` row, records the audit event. No re-validation of Hard Constraints is needed — splitting changes no Lesson's own Day/Period/Teacher/Class, only removes the grouping link.

### Publish

- **`publishTimetableVersion(schoolId, academicYearId, actingUser)`** — inside a locked transaction (the same per-school advisory lock every other Lesson write already acquires): loads the current Draft (`NotFoundError` if none exists — Validation Rule #15), loads the current Published version if any (`setDefaultShift`'s own unset-then-set pattern, one layer up: Archive-then-Promote instead of Unset-then-Set, since a Version's own three-state status has no "unset" analogue), sets the old Published to `ARCHIVED` (if one existed), sets the Draft to `PUBLISHED` + `publishedAt: now()`, records the audit event.
- After publishing, the *next* Lesson write (manual or generation) auto-creates a brand-new empty Draft (per Architecture's own `getOrCreateDraftVersion` helper) — there is no "the Draft becomes the Published version and a new Draft appears instantly cloned from it" behavior; the Draft starts empty again, requiring a fresh Generate or manual rebuild. This is a genuine, deliberate simplification for this version, flagged in Risks — not the behavior a School Admin might intuitively expect (that editing continues from where Publish left off), and worth Product Owner attention in a future round if it proves surprising in practice.

### View resolution (Draft vs. Published)

- `resolveTimetableVersion(schoolId, academicYearId, { versionType })` — a shared helper every view-assembly function (`getMasterTimetable`, `getClassTimetable`, `getTeacherTimetable`) now calls first: `versionType: 'DRAFT'` loads the current Draft (or returns an empty result if none exists yet — matching v1.0's own "no Classes have any Lessons yet" empty state); `'PUBLISHED'` loads the current Published version (or empty if never published). The controller layer decides which to request per Security Considerations below — never a client-suppliable override for Teacher/Student/oversight contexts.

---

## Frontend Design (Architecture Update)

- Master Timetable becomes primarily a **review/adjust** screen: after generation, it shows the Draft's own Lessons with per-cell Lock/Unlock, Move, Delete, and (for grouped cells) Split actions, plus a "Create Lesson" action demoted to a secondary/advanced control, not the page's own primary call-to-action.
- A **Generate** control (with scope selection: All / by Class / by Teacher / by Day) starts a job and shows a progress indicator (polling `GET /timetable/generation-jobs/{id}`) until it completes, then displays the resulting Quality Score and any Missing Lessons inline.
- A **Publish** control, with a confirmation dialog, and a Draft/Published indicator so the Administrator always knows which one they are looking at.
- The frontend never re-implements the engine, the Quality Score formula, or any Hard Constraint — it only reflects what the backend returns/rejects, unchanged from v1.0's own Business Logic Ownership principle.

---

## Mobile Design (Architecture Update)

- No change — the future `GET /timetable/me` consuming screen reads the Published Version only, which was already the intended behavior; the Architecture Update makes that explicit rather than changing it.

---

## Validation Strategy (Architecture Update)

- Shape-only: generation's own `scope` object (a valid `type`, and the corresponding `classId`/`teacherId`/`dayOfWeek` present and well-formed for that type); `unavailableSlots` entries (each a valid `{ dayOfWeek, periodId }` pair).
- Data-dependent (service layer): a Lock/Unlock/Split/generate/publish request's own target(s) belong to the acting School Admin's own school; a Locked Lesson rejects any move/swap/delete/reactivate attempt with `409` before any other check runs; Publish requires an existing Draft.

---

## Security Considerations (Architecture Update)

- Generation, job polling, locking, splitting, and publishing all require School-Admin role + tenant ownership, identical to every other write in this feature.
- **View routes serving a Teacher, a Student (future), or Super Admin's oversight path always resolve to the Published Version server-side — never a client-suppliable `?version=` override for these roles**, so a Teacher can never peek at an Administrator's own in-progress Draft by manipulating a query parameter.
- Every generation job, lock/unlock, split, and publish action produces an audit record, per Audit Requirements.

---

## Performance Considerations (Architecture Update)

- Generation is expected to complete in, at most, low tens of seconds for this project's own observed school sizes (a handful of Classes/Shifts per school) — acceptable for the background-job model chosen; no formal timeout is enforced in this version (a run that somehow never finishes simply never transitions out of `RUNNING`, the same Accepted Technical Debt as a process crash).
- `TimetableGenerationJob` list/detail queries are indexed by `schoolId`; no pagination implemented for job history, consistent with this project's own "small, bounded list" precedent elsewhere.

---

## Error Handling (Architecture Update)

- **202** — `POST /timetable/generate` (job accepted, not yet complete).
- **409** — any move/swap/delete/reactivate attempt against a Locked Lesson; `POST /timetable/publish` with no existing Draft.
- Errors never expose internal implementation details, unchanged from v1.0.

---

## Risks (Architecture Update)

- **No recovery mechanism for a generation job stuck at `RUNNING` after a process crash.** Explicitly Accepted Technical Debt (see Database Impact/Job Execution Model above) — a future enhancement may add a staleness-based auto-fail (e.g., a job `RUNNING` for longer than some threshold with no progress-field movement is presumed dead), but nothing like that is built in this pass.
- **The generation engine is a greedy, most-constrained-first heuristic, not a backtracking solver — it can report a unit as Missing that a smarter algorithm, willing to undo an earlier placement, might have been able to fit.** This is a deliberate, bounded-runtime trade-off, not a bug; the Quality Score's own `missingLessons` count exists precisely so this limitation is visible to the Administrator, never silently hidden.
- **Publishing does not seed the next Draft from the just-published state — a fresh Draft starts empty.** Flagged explicitly as a possible future point of Administrator confusion (see Backend Design's Publish subsection) — worth confirming during Validation whether this matches Product Owner intent literally, or whether "the Administrator continues to review and adjust" (Business Specification's own Business Workflow, step 5) implies the Draft should instead continue from what was just published. Implementation proceeds with the empty-Draft reading as the more literal interpretation of the Product Owner's own stated Publish algorithm ("replace the current Published timetable with the Draft. Archive the previous Published timetable.") since no explicit "and immediately clone it back into a new Draft" step was named — but this is recorded here as a genuine ambiguity, not a silently-resolved one.
- **`unavailableSlots` is a brand-new hard-constraint data shape with no existing UI to populate it** (Teacher preferences today have no day-specific input) — Web frontend work for this field is real, new surface area, not a trivial addition to an existing form.
- **The two Lesson conflict partial unique indexes' re-scoping from `academicYearId` to `timetableVersionId` is a genuine behavior change for any already-existing data** — verified via the migration's own backfill (every pre-existing Lesson is attached to a `PUBLISHED` Version per its own prior `academicYearId`), but worth an explicit regression check that the re-scoped indexes still prevent the exact conflicts they always did, now just also correctly allowing the same slot to exist in a separate Draft simultaneously.

---

# Definition of Done

This feature's Implementation is not complete until it satisfies the project's Definition of Done — see `docs/02-standards/Definition-of-Done.md`.

---

# Change History

- v1.0 — Initial Technical Design and Technical Design Review, conducted in one autonomous pass per the Product Owner's phase-gate waiver. Establishes `Lesson` as the single source of truth (with the deliberate `classId`/`teacherId`/`academicYearId` structural-reference exception to "do not duplicate," reasoned explicitly against this project's own partial-unique-index convention); two partial unique indexes for Teacher/Class conflict prevention; a school-scoped advisory lock across every Lesson write path from day one; `TeacherSchedulePreference`/`SubjectSchedulePreference`/`SchoolOptimizationSettings` as pure data with no enforcement; a read-only, explicitly-illustrative Quality Score; `pdfkit`-based PDF export and CSS-print-based printing, both sharing the same view-assembly functions the JSON API uses; ACR-006's additive `TeacherSubjectAssignment.weeklyLessonTarget` and first real use of that feature's own downstream-record-check registry.
- v1.1 — **Architecture Update (Generation-First)**, following the Business Specification's own v2.0 reversal of the manual-first design. Designs: `TimetableVersion` (Draft/Published/Archived, two new partial unique indexes, Lesson's own conflict indexes re-scoped to it); a most-constrained-first greedy generation engine with preference-weighted scoring (deliberately not a formal CSP/backtracking solver, and no new solver dependency introduced); a DB-persisted, fire-and-forget background job mechanism for generation (no queue/worker infrastructure introduced — Accepted Technical Debt around crash recovery, explicitly flagged); `LessonGroup` for double periods (two linked ordinary Lessons, not a spanning-Lesson concept, per the Product Owner's own explicit choice) with a dedicated, audited Split action; `locked` as a Guard-by-Construction flag protecting a Lesson from any regeneration or move; a school-wide Draft/Published Publish action (the Product Owner's own explicit choice over per-Lesson granularity); a restructured, multi-component Quality Score shared between a completed generation job's own result and the standalone on-demand endpoint. One genuine open ambiguity is recorded, not silently resolved: whether Publishing should seed the next Draft from the just-published state (implementation proceeds with an empty next-Draft reading, the more literal interpretation of the Product Owner's own stated algorithm).
- v1.2 — Forward-reference only, no design change: Weekly Subject Allocation's own Technical Design (`docs/06-technical-design/Weekly-Subject-Allocation.md` v1.0) names this feature's own generation engine for amendment once that feature is Accepted — see the Status block above for the precise scope. No schema, business rule, or endpoint change is made in this revision.
- v1.3 — **Weekly Subject Allocation Integration, implemented.** `TeacherSubjectAssignment.weeklyLessonTarget` and `SubjectSchedulePreference.doublePeriodPreferred` (both ACR-006) are formally removed via migration, with no automatic value migration into an initial Weekly Subject Allocation, per that feature's own Business Review resolution (a per-Assignment target and a per-Grade/Form-per-Subject allocation are not guaranteed to reconcile to the same total, so no reconciliation is attempted). Every read site — `buildUnits`' own required-unit/double-period reading (Generation Engine Step 1) and `assertAssignmentSchedulable`'s own weekly-target room check (v1.0 Backend Design) — now calls Weekly Subject Allocation's own `getWeeklyPeriodsForAssignment`; a missing allocation line means **zero** required units, never a silent default of one, a deliberate departure from the prior `weeklyLessonTarget || 1` reading. **New: two Generation Pre-Flight Gates** (see Backend Design's own new subsection) — `assertNoNeedsReviewAllocations` (reuses Weekly Subject Allocation's existing Needs-Review concept, no new Business Rule) and `assertNoTeacherOverCapacity` (new Business Rule #30, `docs/03-business/Timetable.md` v2.2, raised directly by the Product Owner: a Teacher's total committed weekly periods across every one of their own Classes must never exceed their own weekly capacity). Both gates run as the first two statements of `generateTimetable`, before any Lesson is placed, throwing a descriptive `Error` the job runner's own existing try/catch already persists as `status: FAILED` + `errorMessage` — no change to the Job Execution Model itself was needed. Enforcement was deliberately placed only at generation's own pre-flight step, never at Weekly Subject Allocation's or Teacher Subject Assignment's own write paths, because a Weekly Subject Allocation edit alone can invalidate a Teacher's total commitment with zero Teacher Subject Assignment writes occurring — no write-time gate on either feature's own side could ever be fully reliable by itself. The new capacity check deliberately does not additionally subtract a Teacher's own `unavailableSlots` — that per-slot exclusion is already correctly handled by Step 4's own existing Hard Constraint filter at placement time; this gate only catches the coarser, unambiguous case of the full week being over-committed. New, additive read function consumed from Teacher Subject Assignment: `getTeacherWeeklyCommitmentAndCapacity` (`docs/06-technical-design/Teacher-Subject-Assignment.md` v1.5).
