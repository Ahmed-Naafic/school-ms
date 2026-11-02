# Implementation Planning

Feature: Timetable Management

Version: 1.1

Status: **v1.0 Approved and fully implemented/validated/accepted for the manual-first scope.** **Architecture Update (Generation-First) — this plan is extended with WP11–WP18, following `docs/06-technical-design/Timetable.md` v1.1's own Architecture Update.** Produced autonomously under the same continuing authority as v1.0.

---

# Scope

Implements the `timetable` feature module as designed in `docs/06-technical-design/Timetable.md` (v1.1, including the Architecture Update), scoped to **Backend and Web only** — Mobile is out of scope (no Flutter project exists yet), consistent with every prior feature's own plan.

Covered (v1.0, already implemented): `Lesson` (create/move-swap/cancel/restore, Master/Class/Teacher Timetable views, printing, PDF export), `TeacherSchedulePreference`/`SubjectSchedulePreference`/`SchoolOptimizationSettings` (store/retrieve only), the Timetable Quality Score (read-only), the Stable Public Service Interface, ACR-006's additive `TeacherSubjectAssignment.weeklyLessonTarget` and downstream-record-check registration, and School & Platform Management's additive `createDefaultOptimizationSettingsForSchool` call.

**Covered (Architecture Update, WP11–WP18, this pass):** `TimetableVersion` (Draft/Published/Archived) and its migration/backfill; the generation engine and its background-job execution; `LessonGroup` (double periods) and the Split action; Locking; Publish; the reshaped, structured Quality Score; Web frontend changes for all of the above.

Out of scope, per the Business Specification's own Out-of-Scope Items: Term-scoped generation, per-Lesson Publishing, a real job queue/worker infrastructure, a formal CSP/SAT solver, date-specific Lesson overrides, Room, bulk PDF export, Mobile.

---

# Work Packages

## WP1 — Database Schema & Migrations

**Maps to:** Technical Design's Database Impact; Business Rules #6, #7, #8, #12.

- New migration: `LessonStatus` enum; `Lesson` model (`schoolId`, `academicYearId`, `classId`, `teacherId`, `teacherSubjectAssignmentId`, `dayOfWeek DayOfWeek`, `periodId`, `status`, timestamps; `@@index([schoolId])`, `@@index([schoolId, teacherId])`, `@@index([schoolId, classId])`).
- Hand-written raw SQL in the same migration: the two partial unique indexes (`lessons_teacher_slot_unique`, `lessons_class_slot_unique`), both `WHERE status = 'ACTIVE'`.
- Separate migration: `GapPreference` enum; `TeacherSchedulePreference`, `SubjectSchedulePreference`, `SchoolOptimizationSettings` models, per Database Impact's own field lists.
- Separate migration (ACR-006): `TeacherSubjectAssignment.weeklyLessonTarget Int?` — nullable, no backfill needed.
- No ordering dependency between these three migrations and each other, but all three must exist before WP2 begins.

## WP2 — Lesson Core & Lifecycle Backend

**Maps to:** Business Rules #1–#12; Technical Design's Backend Design.

- `timetable.repository.js` — `findLessonById`, `listActiveLessonsBySchool`, `listActiveLessonsByTeacherSlot`/`listActiveLessonsByClassSlot` (the two conflict-check queries), `createLesson`, `updateLesson`, `acquireSchoolLock`.
- `timetable.service.js` — `getLessonOrThrow`, `assertAssignmentSchedulable`, `assertPeriodSchedulable`, `assertNoTeacherConflict`, `assertNoClassConflict`, `createLesson`, `updateLesson`, `archiveLesson`, `reactivateLesson` — every write path acquiring the per-school advisory lock as its first statement, per Technical Design's Risks section.
- `timetable.validation.js` — shape-only: `teacherSubjectAssignmentId`/`periodId` non-empty, `dayOfWeek` a valid enum value.
- `timetable.controller.js`, `.routes.js` — `POST /lessons`, `PATCH /lessons/{id}`, `PATCH /lessons/{id}/archive`, `PATCH /lessons/{id}/reactivate`, School-Admin-only.

## WP3 — Teacher Subject Assignment additive change (ACR-006)

**Maps to:** Business Rule #8; ACR-006.

- `teacher-subject-assignments.service.js`/`.validation.js` gain `weeklyLessonTarget` support in `createAssignment`/`correctAssignment` (shape: positive integer or absent).
- Timetable module registers its downstream-record checker with `teacherSubjectAssignmentsService.registerDownstreamRecordCheck` at load time, backed by this feature's own `countActiveLessonsForAssignment`.

## WP4 — Timetable Views (Master / Class / Teacher)

**Maps to:** Business Rules #9, #13, #14; Technical Design's Backend Design (view assembly) and API Design.

- `timetable.service.js` gains `getMasterTimetable(schoolId)`, `getClassTimetable(schoolId, classId)`, `getTeacherTimetable(schoolId, teacherId)` — each resolving display-only Teacher/Subject/Class/Period names through the owning features' own narrow interfaces, never a direct table join.
- `timetable.controller.js`/`.routes.js` — `GET /timetable/master`, `GET /timetable/classes/{classId}`, `GET /timetable/teachers/{teacherId}`, `GET /timetable/me` (Teacher self-service, resolved from the token).
- Super Admin oversight: `GET /schools/{schoolId}/timetable/master`, `.../classes/{classId}`, `.../teachers/{teacherId}` (read-only, mirroring every prior feature's own nested-route precedent).

## WP5 — Stable Public Service Interface

**Maps to:** Technical Design's Backend Design.

`timetable.service.js` exports `getLessonsForClass`, `getLessonsForTeacher`, `getLessonById`, `validateLesson`, `countActiveLessonsForAssignment` — built now even though no consumer exists yet, per this project's Future Integration Readiness precedent.

## WP6 — Preferences and School Optimization Settings

**Maps to:** Business Rules #15, #16 (partial); Technical Design's Database Impact and API Design.

- `timetable.repository.js`/`.service.js` gain plain CRUD (no enforcement logic) for `TeacherSchedulePreference`, `SubjectSchedulePreference`, `SchoolOptimizationSettings` — store and return only.
- `timetable.validation.js` gains shape checks for each preference/settings shape.
- Routes: `GET`/`PUT /teachers/{teacherId}/schedule-preference`, `GET`/`PUT /teachers/me/schedule-preference` (Teacher self-service), `GET`/`PUT /teacher-subject-assignments/{id}/schedule-preference`, `GET`/`PATCH /school-optimization-settings` (top-level path, not nested under `/schools/{schoolId}`, to avoid colliding with the Super Admin oversight router's own `:schoolId` mount).
- School & Platform Management additive change: `schools.service.js`'s `createSchool` gains a call to `createDefaultOptimizationSettingsForSchool`, alongside its existing `createDefaultScheduleForSchool` call.

## WP7 — Timetable Quality Score

**Maps to:** Business Rule #16; Technical Design's Backend Design.

- `timetable.service.js` gains `getTimetableQualityScore(schoolId)` — a read-only computation over the current Active Lesson set and whatever preference/settings rows exist, explicitly labeled illustrative in both its own API response and this document.
- Route: `GET /timetable/quality-score` (School-Admin-only).

## WP8 — Printing and PDF Export

**Maps to:** Business Rule #17; Technical Design's Architecture and Backend Design.

- New dependency: `pdfkit` (backend).
- `timetable.pdf.js` — `generateTimetablePdf(schoolId, viewType, targetId)`, calling WP4's own view-assembly functions, laying the result out via `pdfkit` into a `Buffer`.
- Routes: `GET /timetable/master/pdf`, `.../classes/{classId}/pdf`, `.../teachers/{teacherId}/pdf`, `.../me/pdf` — same permission rules as their JSON counterparts.
- Web: a print-formatted CSS layout for each of the three view pages (`window.print()`, no new dependency) and an "Export PDF" button calling the corresponding `/pdf` route.

## WP9 — Audit Logging Integration

**Maps to:** Business Specification's Audit Requirements.

- Every WP2/WP6 write function calls the shared audit-recording utility: `LESSON_CREATED`, `LESSON_UPDATED`, `LESSON_ARCHIVED`, `LESSON_REACTIVATED`, `TEACHER_SCHEDULE_PREFERENCE_UPDATED`, `SUBJECT_SCHEDULE_PREFERENCE_UPDATED`, `SCHOOL_OPTIMIZATION_SETTINGS_UPDATED`.

## WP10 — Web Frontend

**Maps to:** Technical Design's Frontend Design.

- `web/src/features/timetable/` — services, Master Timetable grid page (School-Admin, create/move/swap/cancel/restore via a two-step "select source, select destination" interaction), read-only Class Timetable and Teacher Timetable pages, a Teacher-facing "My Timetable" page, a Preferences page (School Admin: any Teacher/Assignment; Teacher: own only), a School Optimization Settings toggle panel, a Quality Score readout (labelled illustrative).
- Print buttons (CSS print layout) and Export PDF buttons on all three view pages.
- `web/src/app/App.jsx`, `Layout.jsx`, `nav-icons.jsx` — new routes and nav entries, School-Admin plus a Teacher-scoped "My Timetable" entry.

---

# Architecture Update (Generation-First) — Work Packages

## WP11 — Database Schema & Migration (Versioning, Groups, Jobs, Locking)

**Maps to:** Technical Design's Database Impact (Architecture Update).

- `backend/prisma/schema.prisma`: `TimetableVersionStatus`/`TimetableGenerationJobStatus` enums; `TimetableVersion`, `LessonGroup`, `TimetableGenerationJob` models; `Lesson` gains `timetableVersionId` (required, backfilled), `locked`, `lessonGroupId`, `sequenceInGroup`; `TeacherSchedulePreference` gains `unavailableSlots`.
- Single migration, hand-edited: `timetableVersionId` added nullable, backfilled (one `PUBLISHED` `TimetableVersion` per existing distinct schoolId+academicYearId pair, every existing Lesson attached to it), then set `NOT NULL`; the two existing Lesson conflict partial unique indexes dropped and recreated scoped to `timetableVersionId` instead of `academicYearId`; two new partial unique indexes for `TimetableVersion`'s own Draft/Published-per-school-year invariant.

## WP12 — Timetable Version Resolution & Draft Lifecycle

**Maps to:** Technical Design's Backend Design (Architecture Update — Architecture, View resolution).

- `timetable.service.js` gains `getOrCreateDraftVersion(schoolId, academicYearId, tx)` — the single choke point every write path (WP2's existing create/update/archive/reactivate, plus every new write path below) now calls first.
- `resolveTimetableVersion(schoolId, academicYearId, { versionType })` — shared by WP4's existing view-assembly functions, now parameterized by `DRAFT`/`PUBLISHED`.
- WP2's existing Lesson write paths (`createLesson`, `updateLesson`, `archiveLesson`, `reactivateLesson`) are retrofitted to resolve/write into the current Draft via WP12's own helper — a required modification to already-shipped v1.0 code, not new surface area on its own.

## WP13 — Generation Engine & Quality Score

**Maps to:** Technical Design's Backend Design (Generation Engine, Quality Score computation).

- `timetable.generation.js` (new file, kept separate from `timetable.service.js` for the same single-responsibility reasoning `timetable.pdf.js` already established) — `generateTimetable(schoolId, academicYearId, scope, jobId)`: unit resolution, most-constrained-first ordering, per-unit candidate filtering (Hard Constraints) and scoring (Soft Preferences), Missing-Lesson reporting, Lesson Group placement for double-period units.
- `computeQualityScore(lessons, { preferences, settings })` — shared pure function, called by both a completed job's own result computation and the standalone on-demand endpoint (WP7's existing `getTimetableQualityScore`, reshaped to call this instead of its own v1.0 formula).
- WP2's existing conflict-check helpers (`assertNoTeacherConflict`, `assertNoClassConflict`, `assertPeriodSchedulable`) are reused by the engine's own per-candidate filtering — never a second, parallel implementation of the same Hard Constraints.

## WP14 — Background Job Mechanism

**Maps to:** Technical Design's Backend Design (Job Execution Model).

- `timetable.jobs.js` (new file) — `startGenerationJob(schoolId, academicYearId, scope, actingUser)`: creates the `TimetableGenerationJob` row, fires `setImmediate(() => runGenerationJob(jobId))` without awaiting it, returns the job id immediately. `runGenerationJob(jobId)`: loads the job, sets `RUNNING`, calls WP13's engine, updates progress fields as it proceeds, sets `COMPLETED`/`FAILED`.
- `timetable.controller.js`/`.routes.js` — `POST /timetable/generate` (202, `{ jobId }`), `GET /timetable/generation-jobs/{jobId}`, `GET /timetable/generation-jobs`.

## WP15 — Lesson Groups (Double Periods) & Split

**Maps to:** Technical Design's Backend Design (Lesson Group operations).

- `timetable.repository.js`/`.service.js` gain `getLessonGroupOrThrow`, group-aware move/swap/lock/unlock/delete (both member Lessons updated together, one transaction), `splitLessonGroup(schoolId, groupId, actingUser)`.
- WP2's existing move/swap/delete controllers are retrofitted to detect a `lessonGroupId` and delegate to the group-aware path instead of the single-Lesson path.
- Route: `PATCH /lesson-groups/{id}/split`.

## WP16 — Locking

**Maps to:** Technical Design's Backend Design (Architecture — locked).

- `timetable.service.js` gains `lockLesson`/`unlockLesson(schoolId, lessonId, actingUser)` (group-aware, per WP15). Every existing and new Lesson-mutating path (move, swap, delete, reactivate, and the generation engine's own clearing/placement step) checks `locked` first and rejects with 409 (or, for the engine, simply excludes the Lesson from its own candidate/clearing set — never an error, since the engine's job is to work around Locked Lessons, not fail because of them).
- Routes: `PATCH /lessons/{id}/lock`, `PATCH /lessons/{id}/unlock`.

## WP17 — Publish

**Maps to:** Technical Design's Backend Design (Publish).

- `timetable.service.js` gains `publishTimetableVersion(schoolId, academicYearId, actingUser)` — locked transaction, Archive-then-Promote (old Published → ARCHIVED if any, Draft → PUBLISHED).
- Route: `POST /timetable/publish`.
- WP4's existing view routes gain the `?version=draft|published` query parameter, server-resolved per role per Technical Design's Security Considerations (never client-overridable for Teacher/Student/oversight contexts).

## WP18 — Web Frontend (Architecture Update)

**Maps to:** Technical Design's Frontend Design (Architecture Update).

- `web/src/features/timetable/` — Master Timetable page becomes primarily a review/adjust screen (Lock/Unlock, Split, Move, Delete per cell; manual Create Lesson demoted to a secondary action); a Generate control with scope selection and job-progress polling; a Publish control with confirmation and a Draft/Published indicator; the Quality Score readout reshaped to the new multi-component result.
- No change to the read-only Class/Teacher Timetable pages' own shape, beyond reading whichever version the backend resolves for their context.

---

# Files Affected

| Area | Files | New / Modified |
|---|---|---|
| Database | `backend/prisma/schema.prisma`, four migrations total (three v1.0, one Architecture Update) | Modified / New |
| Timetable backend | `backend/src/features/timetable/{timetable.controller,timetable.service,timetable.repository,timetable.validation,timetable.routes,timetable.pdf,timetable.generation,timetable.jobs,index}.js` + test files | New (v1.0 files) / New (`timetable.generation.js`, `timetable.jobs.js`) / Modified (controller/service/repository/routes for versioning, groups, locking, publish) |
| Teacher Subject Assignment | `backend/src/features/teacher-subject-assignments/{teacher-subject-assignments.service,teacher-subject-assignments.validation}.js` | Modified (ACR-006) |
| School & Platform Management | `backend/src/features/schools/schools.service.js` | Modified (one additive insert) |
| Backend dependency | `backend/package.json` | Modified (`pdfkit`) |
| Web | `web/src/features/timetable/{pages,components,services}/*` | New (v1.0) / Modified (Architecture Update: Generate/Publish/Lock/Split controls) |
| Web app shell | `web/src/app/App.jsx`, `Layout.jsx`, `nav-icons.jsx` | Modified |
| Mobile | none this pass | Out of scope |

---

# Dependencies

- **Teacher Subject Assignment** — requires ACR-006's additive field and consumes its downstream-check registry, plus its own `SubjectSchedulePreference.doublePeriodPreferred` (already implemented) for Lesson Group generation. Does not reopen its Feature Acceptance.
- **School Schedule Management** (Period Management) — consumed via `getPeriodById`/`validatePeriod`/`getShiftById`/`getShiftPeriods` only.
- **Class Management, Teacher Management, Academic Year Management, Subject Management** — all Accepted; narrow-interface consumption only.
- **School & Platform Management** — one small additive change (WP6). Does not reopen its Feature Acceptance.
- No other blocking dependency remains for this feature. The Architecture Update introduces no new cross-feature dependency beyond what v1.0 already required — it is entirely internal to this module's own schema and logic.

---

# Risk Assessment

- **The two partial unique indexes (Teacher conflict, Class conflict) are this feature's single highest-severity risk.** Both must be verified under genuine concurrent load, not merely unit-tested against mocks — see Testing Strategy's Integration Tests.
- **The school-scoped advisory lock must be acquired as literally the first statement of every Lesson write transaction**, matching the lesson this project has now learned four times — Implementation must not defer this to "add it later if code review finds a gap."
- **`pdfkit` is a new dependency and a new code path.** Implementation should confirm it round-trips a realistic grid correctly.
- **The Quality Score formula is not Product-Owner-specified.** Implementation must keep it clearly labeled illustrative in both the API and the UI, never presented as authoritative.
- **ACR-006's downstream-check registration is a genuinely new code path for Teacher Subject Assignment.** Testing Strategy includes a dedicated live check.
- **(Architecture Update) The generation engine is entirely new, non-trivial algorithmic code — this project's own first constraint-satisfaction-shaped implementation.** Testing Strategy must include deterministic fixtures proving every Hard Constraint is genuinely unbreakable by the engine, not just "usually satisfied" in the common case.
- **(Architecture Update) The re-scoping of Lesson's own conflict indexes from `academicYearId` to `timetableVersionId` is a real behavior change requiring a careful backfill.** Implementation must verify, against real pre-existing data, that the backfill correctly attaches every existing Lesson to a `PUBLISHED` version and that the re-scoped indexes still block the exact conflicts they always did.
- **(Architecture Update) No background job queue/worker infrastructure exists — a crashed process leaves a job stuck at `RUNNING` forever.** Accepted Technical Debt, explicitly recorded, not silently absent from planning.
- **(Architecture Update) Publish does not seed the next Draft from the just-published state — flagged as a genuine open ambiguity in Technical Design, not silently resolved.** Testing Strategy should include a test asserting the actual (empty-next-Draft) behavior explicitly, so this is a documented, verified decision rather than an accidental side effect discovered later.
- **(Architecture Update) `unavailableSlots` requires new Web UI with no existing form to extend it from.**

---

# Testing Strategy

## Functional Tests
- `createLesson` succeeds for a valid slot; rejects an inactive/at-target Assignment, a Break Period, a Shift mismatch, a Locked target.
- `updateLesson` re-validates in full, excluding the Lesson's own prior slot; rejects a move against a Locked Lesson.
- `archiveLesson`/`reactivateLesson` — reactivate re-validates against current state.
- `getMasterTimetable`/`getClassTimetable`/`getTeacherTimetable` return correctly shaped, correctly scoped grids, resolving Draft vs. Published per the requested/role-resolved version.
- The five Stable Public Service Interface functions return expected results, resolved against the Published Version.
- `generateTimetablePdf` produces a non-empty PDF buffer for each view type, including an empty-Timetable case.
- **(Architecture Update)** `getOrCreateDraftVersion` creates exactly one Draft on first call, returns the same one on subsequent calls, never creates a second.
- **(Architecture Update)** `generateTimetable` places every required unit when enough valid slots exist; reports a unit as Missing (never silently drops it) when none do; never produces a Teacher or Class conflict; correctly places both halves of a double-period unit as a `LessonGroup` in consecutive Periods, or neither half at all.
- **(Architecture Update)** `startGenerationJob`/`runGenerationJob` transition Queued → Running → Completed (or Failed on a thrown error), with progress fields advancing monotonically.
- **(Architecture Update)** `lockLesson`/`unlockLesson`, group-aware, reject a move/swap/delete/regeneration-replacement against a Locked target.
- **(Architecture Update)** `splitLessonGroup` converts both Lessons to independent rows, removes the group, preserves all Lesson data.
- **(Architecture Update)** `publishTimetableVersion` archives the prior Published version (if any) and promotes the Draft; a subsequent write creates a fresh, empty Draft.
- **(Architecture Update)** `computeQualityScore` produces all seven components; conflicts are always 0 for engine-placed Lessons.

## Permission Tests
- Every write endpoint (including generate/lock/unlock/split/publish) rejects non-School-Admin callers with 403.
- A Teacher requesting a different Teacher's `{teacherId}` view/PDF/preference gets 403; their own (Published Version only) gets 200.
- A School Admin from School A gets 404 targeting School B's Lesson/Teacher/Class/Version/Job.
- The Super Admin oversight routes are read-only and always resolve the Published Version, never accepting a `?version=draft` override.

## Validation Tests
- `POST`/`PATCH /lessons` reject missing/invalid fields with 422; reject a Locked target with 409.
- Preference/settings endpoints reject invalid shapes with 422, including `unavailableSlots` entries.
- `POST /timetable/generate` rejects an invalid `scope` shape with 422.
- `POST /timetable/publish` rejects with 409 when no Draft exists.

## Edge Case Tests
- Every "Situation → Expected Behavior" row in the Business Specification's Edge Cases table, including the Architecture Update's own new rows (Locked Lesson protection, Missing Lesson reporting, Split-then-regenerate, Publish with Missing Lessons/low score).

## Integration Tests
- A concurrency test firing genuinely simultaneous `createLesson` calls for the *same* Teacher+slot against the real database, confirming the advisory lock plus the partial unique index together allow exactly one to succeed — now scoped to the same `timetableVersionId`, plus a companion test proving the *same* slot succeeds independently in a *different* Version (Draft vs. Published) at the same time.
- The same shape for the *same* Class+slot.
- A live check that ACR-006's downstream-check registration actually requires a reason when correcting a past-year Assignment already referenced by an Active Lesson.
- Real `audit_logs` queries confirming `LESSON_CREATED`, a generation job's own started/completed events, `LESSON_LOCKED`, `LESSON_GROUP_SPLIT`, and `TIMETABLE_PUBLISHED` all persist correctly.
- **(Architecture Update)** An end-to-end test: configure a small realistic school (a few Classes/Teachers/Subjects/Assignments), call `POST /timetable/generate` with scope `ALL`, poll until Completed, assert zero Teacher/Class conflicts and a sensible Missing-Lessons count, then Publish and confirm the Teacher-facing read resolves the newly Published version.

## Regression Tests
- Existing School, Class, Student, Teacher, Auth, Subject, Academic Year, Teacher Subject Assignment, and School Schedule Management suites re-run and passing unchanged.
- This feature's own v1.0 test suite re-run and passing, updated only where the Architecture Update's own retrofits (Draft-scoping every write, Locked-Lesson checks) change an existing test's own expected shape — new assertions, not silently altered ones.

---

# Definition of Done Coverage

| Item | Coverage |
|---|---|
| Business logic approved | `docs/03-business/Timetable.md` v2.0, Approved. |
| Technical design completed | `docs/06-technical-design/Timetable.md` v1.1, Approved. |
| Validation completed | This plan's Validation Tests; validation/service split per Technical Design. |
| Implementation completed | v1.0 (WP1–WP10) already implemented; Architecture Update (WP11–WP18) tracked during this pass's own Phase 6. |
| Tests passed | This plan's Testing Strategy, all six categories. |
| Code reviewed | Per Development-Lifecycle.md Phase 9, an independent review before Feature Acceptance — required again for the Architecture Update specifically, since it is a materially new code path (the generation engine), not a re-review of unchanged v1.0 code. |
| Documentation updated | `docs/08-validation/Timetable.md` updated with an Architecture Update section; Documentation-Map.md/Project-Glossary.md/Development-Roadmap.md updated to reflect the reversal. |

---

# Estimated Impact

**v1.0** was comparable in scope to School Schedule Management's own first pass. **The Architecture Update is larger** — it introduces this project's first real algorithmic engine (constraint-satisfaction-shaped generation), its first background-job mechanism (no prior feature has needed one), a new top-level versioning concept every existing Lesson had to be retrofitted/backfilled into, and a new grouped-entity concept (Lesson Groups) with its own override workflow (Split). No new cross-feature dependency is introduced — the entire Architecture Update is internal to this module's own schema and logic, unlike v1.0's own two additive changes to other already-Accepted features.

---

# Change History

- v1.0 — Initial Implementation Plan, produced autonomously per the Product Owner's phase-gate waiver, following Technical Design Review approval.
- v1.1 — **Architecture Update (Generation-First)**, following the Business Specification's v2.0 reversal and Technical Design's own v1.1 Architecture Update. Adds WP11 (Database Schema — `TimetableVersion`/`LessonGroup`/`TimetableGenerationJob`, Lesson's new fields, the conflict-index re-scoping and its backfill), WP12 (Draft resolution/lifecycle, retrofitted into v1.0's own existing write paths), WP13 (the generation engine and reshaped Quality Score), WP14 (the background job mechanism), WP15 (Lesson Groups and Split), WP16 (Locking), WP17 (Publish), WP18 (Web frontend for all of the above). Records, as risks rather than silently resolved: no job-crash recovery mechanism (Accepted Technical Debt), and Publish not seeding the next Draft from the just-published state (a genuine open ambiguity Technical Design flagged rather than silently picked a side on). No new cross-feature dependency is introduced by this Architecture Update.
