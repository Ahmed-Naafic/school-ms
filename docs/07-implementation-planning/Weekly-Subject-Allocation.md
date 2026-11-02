# Implementation Planning

Feature: Weekly Subject Allocation

Version: 1.0

Status: **Drafted, following Phase 4 (Technical Design Review) approval** (`docs/06-technical-design/Weekly-Subject-Allocation.md` v1.1, Approved). **Not yet implemented — hard-blocked on Class Management's own "Architecture Update (Grade/Form)"** (`docs/07-implementation-planning/Class-Management.md` v1.3, WP-GF1–WP-GF6), which must complete first: this feature's entire schema references a `gradeLevelId` that does not exist as a real column anywhere until that addition ships.

---

# Scope

This pass implements the `weekly-subject-allocations` feature module as designed in `docs/06-technical-design/Weekly-Subject-Allocation.md`: creating and correcting a Weekly Subject Allocation (header + per-Subject line items) for a Grade/Form + Academic Year, the always-live available-weekly-teaching-periods calculation, the derived (never persisted) Needs-Review comparison, and the narrow Stable Public Service Interface Teacher Subject Assignment and Timetable Management will each consume once their own Technical Design docs are amended.

Out of scope for this pass (per the Business Specification's Out-of-Scope Items, all confirmed still deferred at Technical Design): a standalone Curriculum Management feature (ACR-008); per-Class allocation overrides; Term/Semester scoping; proactive push notification of a Needs-Review transition; copying an allocation forward between Academic Years.

**This pass does not touch Teacher Subject Assignment's or Timetable Management's own code.** Both are named, precisely-scoped future amendments (see Dependencies) — deliberately not part of this Implementation Planning pass, since amending an already-Accepted feature's own Technical Design before this feature has itself shipped would risk documenting a design that still changes. Teacher Subject Assignment's `weeklyLessonTarget` and Timetable's own generation-engine reliance on it remain unchanged and fully functional until that future, separately-planned pass.

---

# Files Affected

All new files — this is the module's first implementation.

- `backend/src/features/weekly-subject-allocations/` — controller, service, repository, validation, routes, tests, `index.js`.
- `web/src/features/weekly-subject-allocation/` — pages, components, services.
- Prisma schema — new `WeeklySubjectAllocation` model (schoolId, academicYearId FK, gradeLevelId FK, availablePeriodsAtSave, timestamps) and `WeeklySubjectAllocationSubject` model (weeklySubjectAllocationId FK, subjectId FK, weeklyPeriods, doublePeriodRequired, timestamps), plus one migration. No hand-written raw SQL is expected in this migration — both of this feature's own uniqueness constraints (`@@unique([schoolId, academicYearId, gradeLevelId])` and `@@unique([weeklySubjectAllocationId, subjectId])`) are ordinary, non-partial unique constraints Prisma's schema DSL already expresses directly, per Technical Design's Database Impact section — the first migration in this project's own recent run of Grade/Form-adjacent work that needs none.
- `web/src/app/App.jsx`, `web/src/app/Layout.jsx`, `web/src/app/nav-icons.jsx` — a new `/weekly-subject-allocation` route and sidebar entry, positioned as the first item under Timetable's own navigation group (above Generate Timetable), School-Admin-only.
- No mobile files — neither Teacher nor Student has any permission in this feature, per the Technical Design's Mobile Design section.

---

# Work Packages

Each package below maps to specific Business Specification rules and Technical Design sections, so every task traces back to an approved decision — nothing here introduces new business logic.

## WP1 — Database Schema & Migration

**Maps to:** Technical Design's Database Impact section.

- `backend/prisma/schema.prisma`:
  - New `WeeklySubjectAllocation` model: `schoolId` (FK), `academicYearId` (FK), `gradeLevelId` (FK to Class Management's `GradeLevel` — requires WP-GF1 already applied), `availablePeriodsAtSave Int`, timestamps. `@@unique([schoolId, academicYearId, gradeLevelId])`, `@@index([schoolId, academicYearId])`, `@@index([gradeLevelId])`.
  - New `WeeklySubjectAllocationSubject` model: `weeklySubjectAllocationId` (FK, `onDelete: Cascade`), `subjectId` (FK to Subject Management's platform-wide catalog), `weeklyPeriods Int`, `doublePeriodRequired Boolean @default(false)`, timestamps. `@@unique([weeklySubjectAllocationId, subjectId])`, `@@index([weeklySubjectAllocationId])`.
- No data backfill of any kind — this is a brand-new feature with no pre-existing rows to migrate, unlike every Grade/Form-adjacent change this project has made recently.
- **Hard prerequisite, not a soft ordering preference**: this migration cannot be written, let alone applied, before Class Management's own WP-GF1 migration (`GradeLevel`, `Class.gradeLevelId`) has already run in every environment this migration will ever target — `gradeLevelId`'s own foreign key has nothing to reference otherwise.

## WP2 — Allocation Core Backend (Create / Correct / List / Detail)

**Maps to:** Business Rules #1–#10, #14; Technical Design's Backend Design and Validation Strategy.

- `weekly-subject-allocations.repository.js` — the only file touching Prisma for this feature, per Coding-Standards.md. `findAllocationById`, `findAllocationByNaturalKey(schoolId, academicYearId, gradeLevelId)`, `listAllocationsBySchool({ academicYearId, gradeLevelId })`, `createAllocationWithSubjects` (header + lines in one transaction), `replaceAllocationSubjects` (delete-then-recreate the line-item set inside one transaction).
- `weekly-subject-allocations.service.js`:
  - `calculateAvailablePeriods(schoolId, gradeLevelId)` — resolves the Shift via `classesService.getGradeLevelShift`, then `schoolScheduleService.getWorkingDays(schoolId).length * schoolScheduleService.getShiftPeriods(schoolId, shiftId, { status: 'ACTIVE' }).filter(p => p.type === 'TEACHING').length`. Throws a clearly-named error when the Grade/Form has no member Classes yet (no Shift to derive a figure from) — Technical Design's own named edge case, needs its own dedicated error type so callers can distinguish it from an ordinary not-found.
  - `isAllocationCurrent(allocation)` — calls `calculateAvailablePeriods` and compares against `allocation.availablePeriodsAtSave`; **catches the "no Shift derivable" error specifically and returns `{ current: false, availablePeriodsNow: null }` rather than letting it propagate** — this is Technical Design Review's own second finding; implementing the `try/catch` here, not merely at the controller layer, is what makes every caller (list, detail, and the future generation pre-check) automatically safe without each needing its own duplicate handling.
  - `assertAllocationComplete(subjects, availablePeriods)` — sums `weeklyPeriods`, rejects (422) unless the sum exactly equals `availablePeriods`; rejects non-positive/non-integer values; rejects a duplicate `subjectId` within the array (also backed by the database's own unique constraint).
  - `assertSubjectsAssignable(schoolId, subjects)` — each `subjectId` exists, is ACTIVE, and is assigned to the school, via `subjectsService.getSubjectById`/`isSubjectAssignedToSchool`.
  - `createAllocation(schoolId, { academicYearId, gradeLevelId, subjects }, actingUser)` — validates `gradeLevelId` via `classesService.validateGradeLevel`, resolves/validates `academicYearId` (defaulting to Current), computes `availablePeriods`, runs both assertion helpers, inserts inside one transaction. Catches the database's own unique-constraint violation on `(schoolId, academicYearId, gradeLevelId)` and translates it to a clean 409 — no advisory lock needed (Technical Design's own Risks section already reasons why).
  - `correctAllocation(schoolId, allocationId, { subjects }, actingUser)` — loads the existing header, re-runs `calculateAvailablePeriods` fresh (never the stored snapshot), re-runs both assertion helpers, replaces the full line-item set, updates `availablePeriodsAtSave`. This single function is what resolves a Needs-Review allocation back to current — there is no separate acknowledgment action.
  - `listAllocations(schoolId, { academicYearId, gradeLevelId })`, `getAllocationDetail(schoolId, allocationId)` — both call `isAllocationCurrent` per row/record and include `availablePeriodsNow`/`needsReview` in their own return shape, never only the stored snapshot.
- `weekly-subject-allocations.validation.js` — shape-only: `gradeLevelId`/`academicYearId` (non-empty strings when present); `subjects` (non-empty array; each entry a `subjectId` string, a positive-integer `weeklyPeriods`, an optional boolean `doublePeriodRequired`). `PATCH /weekly-subject-allocations/{id}` rejects any field other than `subjects` (Guard by Construction) — `gradeLevelId`/`academicYearId` are immutable after creation.
- `weekly-subject-allocations.controller.js`, `.routes.js` — `GET /weekly-subject-allocations`, `GET /weekly-subject-allocations/{id}`, `POST /weekly-subject-allocations`, `PATCH /weekly-subject-allocations/{id}` — all School-Admin-only. No delete endpoint, no Super Admin route, per Technical Design's own API Design.

## WP3 — Subject Management Dependency-Check Registration

**Maps to:** Technical Design's Backend Design section — Technical Design Review's third finding.

- At this module's own load time (`index.js` or an equivalent bootstrap point, matching how Teacher Subject Assignment's own registration already runs): `subjectsService.registerRemovalDependencyCheck('weekly-subject-allocations', checkFn)`.
- `checkFn(schoolId, subjectId)` — queries for any `WeeklySubjectAllocationSubject` row (joined to its own header's `schoolId`) referencing that `(schoolId, subjectId)` pair; returns a human-readable blocking reason string if found, `null` otherwise — the identical shape Teacher Subject Assignment's own registered checker already uses. **This work package exists specifically because Technical Design Review found its absence was a genuine gap** — without it, Subject Management would allow archiving a Subject a current allocation line still references, silently breaking `getWeeklyPeriodsForAssignment`'s own future correctness. No change to Subject Management's own code is required — this module is simply another consumer of an already-existing extension point.

## WP4 — Stable Public Service Interface

**Maps to:** Technical Design's Stable Public Service Interface section.

`weekly-subject-allocations.service.js` exports, built now even though Teacher Subject Assignment and Timetable Management are not yet wired to call them (their own amendments are future, separately-planned work — see Dependencies), per this project's established Future Integration Readiness precedent:

- **`getWeeklyPeriodsForAssignment(schoolId, classId, academicYearId, subjectId)`** — resolves `classId → gradeLevelId` internally via `classesService.getClassById`, then looks up the matching allocation line; returns `{ weeklyPeriods, doublePeriodRequired }` or `null`. Takes `classId`, never `gradeLevelId` directly — Technical Design Review's own first finding, since the real future caller (Timetable's generation engine, iterating Teacher Subject Assignment rows) only ever has `classId` on hand.
- **`isSchoolNeedsReview(schoolId, academicYearId)`** — `true` if any allocation for that school + Academic Year currently fails `isAllocationCurrent`; `false` if none do, including when zero allocations exist yet.
- **`listAllocationsForGradeLevel(schoolId, gradeLevelId, academicYearId)`** — the full set of Subject/period/Double-Period rows for one Grade/Form + Academic Year, or an empty array.

No future feature may reach into this module's repository or query either table directly — the same Loose Coupling discipline every other narrow interface in this project already enforces.

## WP5 — Audit Logging Integration

**Maps to:** Business Specification's Audit Requirements; Technical Design's Security Considerations.

- `createAllocation` and `correctAllocation` both call the shared audit-recording utility after a successful write: `WEEKLY_SUBJECT_ALLOCATION_CREATED`, `WEEKLY_SUBJECT_ALLOCATION_CORRECTED`. Both carry the school's own `schoolId`.
- Per this project's own established lesson (first surfaced in Subject Management's own Phase 7 Validation, and deliberately re-applied by School Schedule Management's own Implementation Planning from the start): this plan's Testing Strategy includes a real-database audit-persistence check, not only a mocked-call assertion.

## WP6 — Web Frontend (School Admin)

**Maps to:** Technical Design's Frontend Design section; Business Specification's Permissions.

- `web/src/features/weekly-subject-allocation/pages/WeeklySubjectAllocationPage.jsx` — a Grade/Form picker (sourced from Class Management's own `/grade-levels` API, WP-GF2) and Academic Year picker (defaulting to Current), the calculated available figure, a running total against it, a per-Subject row (Subject picker, weekly-period number input, Double Period checkbox), and a save action disabled until the running total exactly matches.
- A Needs-Review badge/banner on any allocation whose `needsReview` field is `true`, showing `availablePeriodsNow` alongside the stale `availablePeriodsAtSave`.
- `web/src/features/weekly-subject-allocation/services/weekly-subject-allocation.service.js` — API client calls for all of the above.
- `web/src/app/App.jsx`, `.../Layout.jsx`, `.../nav-icons.jsx` — new `/weekly-subject-allocation` route and nav entry, positioned as the first item under Timetable's own navigation group, School-Admin-only.
- The frontend never re-implements the completeness/duplicate/positive-integer validation, the Needs-Review comparison, or the available-periods calculation itself; it only reflects what the backend returns, per System-Architecture.md's Business Logic Ownership rule.

---

# Dependencies

- **Class Management's own "Architecture Update (Grade/Form)"** (`docs/07-implementation-planning/Class-Management.md` v1.3, WP-GF1–WP-GF6) — **the single hard, blocking prerequisite in this entire plan.** WP1 above cannot be written, let alone applied, before Class Management's own WP-GF1 migration has already run. Nothing in this plan can begin implementation before that one completes.
- **School Schedule Management** — Accepted, with a completed Technical Design and Implementation. Consumed exclusively through its already-published `getWorkingDays`/`getShiftPeriods` interface; no change required.
- **Subject Management** — Accepted, with a completed Technical Design and Implementation. Consumed through its existing `getSubjectById`/`isSubjectAssignedToSchool` interface; this module additionally registers its own checker against the existing `registerRemovalDependencyCheck` extension point (WP3). No change to Subject Management's own code.
- **Academic Year Management** — Accepted, with a completed Technical Design and Implementation. Consumed through its existing `getAcademicYearById`/`getCurrentAcademicYear` interface; no change required.
- **Teacher Subject Assignment** and **Timetable Management** — both Accepted, with completed Technical Designs (currently v1.4 and v1.2 respectively, each already carrying a forward-reference note to this feature). **Neither is a blocker for this plan's own Implementation** — this feature's own Stable Public Service Interface (WP4) is built and independently testable without either consumer calling it yet, the same "build the interface, defer the consumer" precedent Class Management's own `getClassById` and School Schedule Management's own eight-function interface both already established. Their own amendments (removing `weeklyLessonTarget`/`doublePeriodPreferred`, wiring in `getWeeklyPeriodsForAssignment`/`isSchoolNeedsReview`) are a separate, future Implementation Planning pass, out of scope here.

---

# Risk Assessment

- **Migration sequencing is the single highest-severity risk in this plan, tighter than any prior cross-feature ordering constraint in this project.** Every prior "wait for feature X's migration first" case (ACR-005's `Class.shiftId` waiting on School Schedule Management's own backfill) still had that dependent feature able to define its *own* schema in parallel, gated only at migration-apply time. Here, this feature's own schema (WP1) cannot even be *written* in a way that type-checks against Prisma's own generated client until `GradeLevel` exists — there is no meaningful parallel-drafting path.
- **`calculateAvailablePeriods`'s own "no Shift derivable" error must be handled at exactly the two places Technical Design Review specifies — inside `isAllocationCurrent` itself (WP2), not only at the controller layer** — a partial fix (e.g., only wrapping the controller's own top-level call) would still let the error propagate uncaught from any other internal caller of `isAllocationCurrent`, silently reintroducing the exact crash Technical Design Review's second finding closed at the design level.
- **`assertSameShiftWithinGradeLevel`'s own correctness is entirely Class Management's responsibility, not this feature's** — this plan has no work package for it, deliberately: if that invariant is ever violated (two Active Classes in one `GradeLevel` on different Shifts), `getGradeLevelShift` would return an arbitrary one of the two, and `calculateAvailablePeriods` would silently compute a wrong figure with no error at all. This feature has no way to detect or defend against that failure mode itself — it is purely a consumer of Class Management's own guarantee. Worth an explicit cross-feature integration test (Testing Strategy) proving the guarantee actually holds, not just trusting the other feature's own test suite.
- **WP3's registration is easy to forget, since it has no user-visible symptom until a School Admin later tries to archive a Subject that happens to be referenced by a saved allocation** — the same "silent until exercised" risk profile Teacher Subject Assignment's own identical registration already carries. A dedicated Testing Strategy case (below) is the only real safeguard.
- **This plan intentionally does not amend Teacher Subject Assignment's or Timetable Management's own code** — the two named interface functions (WP4) will sit unused by any real caller until that future pass ships. This is a deliberate, documented sequencing choice (see Scope and Dependencies), not an oversight; it does mean this feature's own Feature Acceptance can complete before its full end-to-end value (an actually-consumed generation input) is realized, the same "interface ships ahead of its consumer" shape this project has accepted before (Class Management's own `getClassById` sat unused until Student Management called it).

---

# Testing Strategy

Per `docs/05-templates/Test-Plan-Template.md`'s categories, applied to this feature.

## Functional Tests
- `createAllocation` succeeds for a complete, valid `subjects` array and computes `availablePeriodsAtSave` correctly from a real Grade/Form + Shift + Schedule combination.
- `correctAllocation` replaces the full line-item set and updates `availablePeriodsAtSave` to a freshly-computed figure, never the stale one.
- `calculateAvailablePeriods` produces the exact worked examples from the Business Specification (5 Working Days × 7 Teaching Periods = 35; 5×6=30; 2×8=16).
- `isAllocationCurrent` correctly flags Needs Review after a Working Day is added/removed, after a Shift's own Teaching Period count changes, and after a different Shift is assigned — and correctly reports "current" when none of those have changed.
- The three Stable Public Service Interface functions return the expected results, including `getWeeklyPeriodsForAssignment`'s own `classId → gradeLevelId` internal resolution.

## Permission Tests
- Every endpoint rejects non-School-Admin callers (Super Admin, Teacher, Student, Accountant) with 403.
- A School Admin from School A receives 404 (never a leaked 403) targeting School B's allocation.
- No Super Admin route exists at all — confirm no `/schools/{schoolId}/weekly-subject-allocations` path is registered.

## Validation Tests
- `POST`/`PATCH` reject an incomplete total, an over-allocated total, a duplicate `subjectId`, and a non-positive/non-integer `weeklyPeriods`, each with 422.
- `POST` rejects a `subjectId` that doesn't exist, isn't Active, or isn't assigned to the school; a `gradeLevelId` that doesn't exist, is Archived, or belongs to a different school.
- `PATCH /weekly-subject-allocations/{id}` rejects any field other than `subjects` with 422 (Guard by Construction) — confirm `gradeLevelId`/`academicYearId` in the body are rejected.

## Edge Case Tests

Every "Situation → Expected Behavior" row in the Business Specification's Edge Cases table, including:
- A second `POST` for the same `(schoolId, academicYearId, gradeLevelId)` — 409, via the database's own unique-constraint catch.
- `calculateAvailablePeriods` against a `GradeLevel` with zero member Classes — a clear, distinct error at create/correct time (never a generic 500).
- **The same zero-Classes state, but for an already-saved allocation whose Grade/Form later lost every member Class** — `GET` list/detail and `isSchoolNeedsReview` all correctly report Needs-Review-equivalent status rather than throwing (Technical Design Review's own second finding, its own dedicated test).
- **Attempting to archive a Subject Management Subject still referenced by a current allocation line** — rejected via WP3's registered checker, mirroring Teacher Subject Assignment's own identical existing test for its own registration.
- **Two Active Classes ending up in the same `GradeLevel` on different Shifts** (simulating a Class Management defect, to prove this feature's own behavior in that scenario is a wrong-but-non-crashing computed figure, not an unhandled exception) — documents the accepted risk boundary named in Risk Assessment, does not assert this feature can detect or prevent it.

## Integration Tests
- The full `POST` → `GET` (confirm `needsReview: false`) → (simulate a School Schedule Management change) → `GET` (confirm `needsReview: true`, correct `availablePeriodsNow`) → `PATCH` (confirm `needsReview: false` again) round trip, exercised via real HTTP routes.
- Real `audit_logs` table queries (not mocked) confirming `WEEKLY_SUBJECT_ALLOCATION_CREATED` and `WEEKLY_SUBJECT_ALLOCATION_CORRECTED` rows persist correctly with the school's own `schoolId`.
- A cross-feature integration test creating a real `GradeLevel` with two Classes on the same Shift, confirming `getGradeLevelShift` and this feature's own `calculateAvailablePeriods` agree with a hand-computed expected value end-to-end.
- A real-database test proving WP3's registered checker actually blocks `archiveSubject` when a current allocation line references it, and that ending/replacing that allocation line (via `correctAllocation`) unblocks it again.

## Regression Tests
- Existing School, Class, Student, Teacher, Auth, Subject, Academic Year, Teacher Subject Assignment, School Schedule Management, and Timetable test suites re-run and passing unchanged — this feature makes no modification to any of their own code.
- Class Management's own Grade/Form test suite (from its own Implementation, WP-GF1–WP-GF6) re-run and passing unchanged.

---

# Definition of Done Coverage

Mapped against `docs/02-standards/Definition-of-Done.md`'s checklist:

| Item | Coverage in this plan |
|---|---|
| Business logic approved | `docs/03-business/Weekly-Subject-Allocation.md` v1.0, Approved (Business Review). |
| Edge cases reviewed | Business Specification's Edge Cases table plus this plan's own Testing Strategy Edge Case Tests. |
| Technical design completed | `docs/06-technical-design/Weekly-Subject-Allocation.md` v1.1, Approved (Phase 4 Technical Design Review). |
| Security considered | Technical Design's Security Considerations; this plan's Risk Assessment (WP3's registration, the cross-feature invariant trust boundary). |
| Validation completed | This plan's Validation Tests category; shape vs. service-layer split per the Technical Design's Validation Strategy. |
| Development / implementation completed | Tracked per work package: WP1–WP6, all pending Class Management's own WP-GF1–WP-GF6 completing first. |
| Standards followed | Naming-Conventions.md, Database-Standards.md, API-Standards.md, Security-Standards.md all cited per relevant Work Package above. |
| Code is clean | Enforced at Phase 6/Phase 9 (code review), not yet reached. |
| No known issues remain | This plan's Risk Assessment items are each named with an explicit mitigation or accepted boundary — none silently deferred without a tracked location. |
| Tests passed | This plan's Testing Strategy (all six categories) — not yet executed, Implementation not yet begun. |
| Code reviewed | Per Development-Lifecycle.md Phase 9, required before Feature Acceptance — not yet reached. |
| Documentation updated | Business Specification, Technical Design, and this plan are all current as of this revision. |

Every item is either already satisfied at the planning level or has an explicit, named place in this plan where it will be satisfied — none are silently deferred without a tracked location.

---

# Estimated Impact

A small, self-contained net-new module, structurally simpler than Teacher Subject Assignment (no Replace/Copy workflow, no derived-status column, no advisory lock) — closer in shape to School Schedule Management's own `SchoolCalendar` (a single-current-record-per-natural-key entity with a live, uncached calculation) crossed with a lightweight header-plus-lines shape (`Shift`/`Period`). No outbound modification to any already-Accepted feature's own code — the one cross-feature write-adjacent touchpoint (WP3's registration) is purely additive, consuming an already-existing extension point rather than requiring a change to Subject Management itself. The overwhelming majority of this plan's own real complexity is not in this feature's own code at all, but in the migration-sequencing dependency on Class Management's own not-yet-implemented Architecture Update — once that lands, this feature's own Implementation is comparatively straightforward.

---

# Change History

- v1.0 — Initial implementation plan, following Phase 4 (Technical Design Review) approval (`docs/06-technical-design/Weekly-Subject-Allocation.md` v1.1, Approved). Defines WP1 (Database Schema & Migration, hard-blocked on Class Management's own WP-GF1), WP2 (Allocation Core Backend, including the `isAllocationCurrent` error-handling fix from Technical Design Review), WP3 (Subject Management dependency-check registration — the third Technical Design Review finding, given its own dedicated work package precisely because it is easy to forget), WP4 (Stable Public Service Interface, `getWeeklyPeriodsForAssignment` using the corrected `classId`-based signature), WP5 (Audit Logging), and WP6 (Web Frontend). Explicitly excludes any amendment to Teacher Subject Assignment's or Timetable Management's own code from this pass's own scope — both are named, precisely-scoped future work, not vague deferrals. Not yet implemented.
