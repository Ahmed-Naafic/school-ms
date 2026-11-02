# Implementation Planning

Feature: Teacher Subject Assignment

Version: 1.0

Status: Approved, following Phase 4 (Technical Design Review) approval (`docs/06-technical-design/Teacher-Subject-Assignment.md` v1.1, Approved). Awaiting Phase 6 (Implementation).

---

# Scope

This pass implements the `teacher-subject-assignments` feature module as designed in `docs/06-technical-design/Teacher-Subject-Assignment.md`, **scoped to Backend and Web only**, per Product Owner precedent: Implementation Plans are scoped per application, and Mobile is a separate, later phase (Student Management's own Mobile self-service screen is deferred the same way).

Covered in this pass: assignment creation (with the full eligibility gate — ACTIVE Teacher, ACTIVE Subject assigned to the school, ACTIVE Class and, when applicable, ACTIVE Section, non-Archived Academic Year), listing/filtering (by Academic Year, Teacher, Subject, Class, Section), correction and ending via one `PATCH` endpoint, the dedicated Replace Teacher workflow, selective copying between Academic Years, the Subject Management dependency-validation registration, and the Teacher self-service **backend** endpoint (`GET /teacher-subject-assignments/me`) — built now even though its Mobile UI is deferred, mirroring how `GET /students/me` was built well ahead of any Mobile screen existing to call it.

Out of scope for this pass:
- **Mobile** (`mobile/lib/features/teacher/`) — no Flutter project exists yet at all. Teacher's own read-only assignment view is tracked as part of the same future Mobile bootstrap phase Student Management's own Student self-service screen is waiting on — not omitted work, just not this pass.
- Summary/workload reports and any notification scenario — both explicitly deferred by the Business Specification's own Reports and Notifications sections.

---

# Files Affected

All new files in the feature module — this is its first implementation.

- `backend/src/features/teacher-subject-assignments/` — controller, service, repository, validation, routes, tests, `index.js`.
- `backend/src/features/teachers/teachers.service.js` — **one new additive export**, `getTeacherById(schoolId, teacherId)`, alongside the existing (unchanged) `getTeacherOrThrow`. No other change to Teacher Management's own code.
- `backend/src/features/subjects/subjects.service.js` — no code change; this feature calls the already-existing `registerRemovalDependencyCheck` at its own module-load time.
- `backend/prisma/schema.prisma` — new `TeacherSubjectAssignment` model (no new enum — status is derived, never stored) plus a migration. The migration's generated SQL is followed by a hand-written `CREATE UNIQUE INDEX ... NULLS NOT DISTINCT ... WHERE "effectiveEndDate" IS NULL` statement, the same pattern Academic Year Management's own `isCurrent` migration already used for a raw-SQL addition Prisma's schema DSL cannot express.
- `backend/src/app.js` — new `const teacherSubjectAssignmentsRoutes = require('./features/teacher-subject-assignments');` and route registration at `/api/v1/teacher-subject-assignments`.
- `web/src/features/teacher-subject-assignments/` — pages, components, services. School-Admin-only, per the Technical Design's Frontend Design section.
- `web/src/app/App.jsx` and `web/src/app/Layout.jsx` — new `/teacher-subject-assignments` route and sidebar nav entry (School Admin only), following the exact pattern already established for `/academic-years`, `/subjects`, etc.
- No `mobile/` files in this pass — see Scope above.

---

# Dependencies

- **Class Management** — Accepted and implemented (`backend/src/features/classes/classes.service.js`), exposing exactly the narrow interface this feature needs: `getClassById`, `listActiveSectionsForClass`. No blocker, no interface change required.
- **Subject Management** — Accepted and implemented (`backend/src/features/subjects/subjects.service.js`), exposing `getSubjectById`, `isSubjectAssignedToSchool`, and `registerRemovalDependencyCheck`. No blocker, no interface change required — this feature is purely a new *consumer* of the existing registry.
- **Teacher Management** — Accepted and implemented (`backend/src/features/teachers/teachers.service.js`). **Requires one small, additive interface change**: a new `getTeacherById(schoolId, teacherId)` export, non-throwing, matching the contract every other narrow interface in this project already uses. This was the feature's own identified Technical Design dependency; it is a same-day, in-this-pass addition, not a separate blocking phase — Teacher Management's own Feature Acceptance is not reopened by it, the same category of change ACR-002 and ACR-003 already made to other already-Accepted features.
- **Academic Year Management** — Accepted and implemented (`backend/src/features/academic-years/academic-years.service.js`), exposing `getAcademicYearById`, `getCurrentAcademicYear`. No blocker, no interface change required.
- **Mobile bootstrap** — not a blocker for *this pass*, since Mobile is explicitly out of scope here (see Scope above). Tracked as a prerequisite for the future Mobile phase, alongside Student Management's own already-deferred Student self-service screen.

---

# Risks

- **Concurrency must be built correctly from the first line of code, not patched after a review finds it.** This is the third feature in this project with a "one Active/Current record per scope" invariant (`Class.isFinal`, `AcademicYear.isCurrent`, now this feature's Business Rule #4) — the first two both shipped their initial Implementation with an unlocked check-then-act race that an independent code review later caught. The Technical Design already specifies the per-school advisory lock and the `NULLS NOT DISTINCT` partial unique index; Implementation's job is to actually acquire that lock as the *first* statement inside every relevant transaction (`createAssignment`, `replaceTeacher`, each `copyAssignments` candidate) — not to reproduce the same gap a third time.
- **This is the first feature with four simultaneous Accepted-feature dependencies, plus one additive interface change to a fifth.** Class, Subject, Teacher, and Academic Year Management are all consumed in the same write path. Keep every one of these calls behind its own narrow interface function; this feature must never query another feature's tables directly, per the Constitution's Loose Coupling principle — the broadest cross-feature surface built so far, wider than Student Management's own two-dependency (Auth + Class) original design.
- **`NULLS NOT DISTINCT` requires Postgres 15+.** This project's `docker-compose.yml` already runs Postgres 16, so this is not expected to be a real blocker — but it is a genuine, new-to-this-migration infrastructure dependency worth confirming against the actual running database before the migration is applied, since no prior migration in this project has needed this specific syntax.
- **Replace Teacher and each copy candidate must call the exact same internal assertion sequence `createAssignment` uses, not a hand-rolled partial re-implementation of it.** Technical Design Review specifically found and fixed a draft where Replace Teacher only re-checked the new Teacher, missing Subject/Class/Section/Academic-Year eligibility. Implementation should structure this as one shared internal function all three write paths call, to make it structurally impossible for them to drift apart again.
- **The Teacher self-service backend endpoint (`GET /teacher-subject-assignments/me`) has no UI to verify it against this pass.** Verification here is necessarily API-level (integration tests, direct `curl`), not a live click-through — the same situation Student Management's own Student self-service has been in since its own Implementation, and will remain in until Mobile is bootstrapped.

---

# Estimated Impact

Comparable in shape to Student Management's own ACR-004 pass (a new cross-feature narrow-interface consumer, plus one small additive interface change elsewhere), but larger in scope: this is a brand-new feature module built from scratch, not an amendment to an already-Accepted feature, with five distinct write actions (create, correct/end, replace, copy, plus the dependency-validation registration) rather than two. It is also this project's first feature to depend on four already-Accepted features at once. Backend carries the bulk of this pass's complexity (the shared assertion helpers, the locked-transaction write paths, the two extension-point registrations); Web is a full CRUD/Replace/Copy admin surface, structurally similar to Academic Year Management's own Web UI; Mobile is explicitly out of scope.

---

# Change History

- v1.0 — Initial Implementation Plan, following Phase 4 (Technical Design Review) approval.
