# Implementation Planning

Feature: Subject Management

Version: 1.0

Status: Approved. Implementation (Phase 6) is complete — this plan is a historical record of what was executed, not a living document. See `docs/08-validation/Subject-Management.md` (Phase 7) and `docs/00-governance/Code-Review-Report.md` (Phase 9 independent review, 2 Major findings fixed) for what happened after this plan was carried out.

---

# Scope

This plan implements the `subjects` feature module as designed in `docs/06-technical-design/Subject-Management.md` (v1.0, Approved), **scoped to Backend and Web only**, following the same per-application scoping precedent already established by Student Management and Teacher Management: Backend defines the business rules and API contract; Web covers both the Super Admin catalog/assignment workflow and School Admin's read-only view; Mobile is out of scope (no Flutter project exists yet, the same unresolved prerequisite every prior feature's plan has already flagged).

Covered in this pass: Subject definition (create/update/archive/reactivate), the platform-wide catalog, Subject-to-School assignment and removal (including the `hasEducationLevel` validation against ACR-003), the dependency-validation extension point (the registry mechanism itself — no future dependent feature's checker is implemented here, per the Technical Design's explicit scoping), and both Super Admin and School Admin web views.

Out of scope for this pass, per the Business Specification's own Not Included / Future Considerations:
- Any actual dependency checker (Class Subjects, Teacher Assignment, Timetable, Exams, Marks, Report Cards) — those are each a future feature's own Implementation, registering into the extension point this plan builds.
- Bulk Subject creation/import.
- Seeding the illustrative Primary/Secondary Subject lists as default platform data — explicitly descoped as a business decision (Business Specification Scope's Not Included); Super Admin creates Subjects through the UI/API this plan builds.
- Mobile.

---

# Work Packages

Each package below maps to the specific Business Specification rules and Technical Design sections it implements, so every task traces back to an approved decision — nothing here introduces new business logic.

## WP1 — Database Schema & Migration

**Maps to:** Technical Design's Database Impact section; Business Rules #2, #3, #4, #12.

- `backend/prisma/schema.prisma`:
  - New `SubjectStatus` enum (`ACTIVE` / `ARCHIVED`), matching `ClassStatus`'s existing naming convention.
  - New `Subject` model: `name` (string), `educationLevel` (reuses the existing `EducationLevel` enum from ACR-003 — no redefinition), `status` (`SubjectStatus`, default `ACTIVE`), timestamps. **No `schoolId`** — Subject is platform-wide, per Business Rule #12, the first model in this schema without one.
  - New `SchoolSubject` model: `schoolId` (FK to `School`), `subjectId` (FK to `Subject`), `assignedAt`, `assignedById`, `removedAt` (nullable), `removedById` (nullable).
  - `@@unique([name, educationLevel])` on `Subject` (Business Rule #3); `@@unique([schoolId, subjectId])` on `SchoolSubject` (covers the row's full lifetime, per the Technical Design's soft-remove-and-reactivate shape).
  - `@@index([schoolId])` and `@@index([subjectId])` on `SchoolSubject`, per the Technical Design's Performance Considerations.
- `backend/prisma/migrations/` — new migration generated from the schema change. Purely additive (two new tables, one new enum, no existing table altered) — no backfill or data-loss consideration, unlike ACR-003's `School.educationLevels` addition.

## WP2 — Subject Catalog Backend (Create / Update / Archive / Reactivate / List)

**Maps to:** Business Rules #1, #2, #3, #4, #10, #11; Technical Design's API Design (catalog endpoints) and Validation Strategy.

- `backend/src/features/subjects/subjects.repository.js` — the only file touching Prisma for this feature, per Coding-Standards.md.
- `backend/src/features/subjects/subjects.service.js`:
  - `createSubject({ name, educationLevel })` — rejects a duplicate `(name, educationLevel)` pair with 409, per Business Rule #3.
  - `updateSubject(id, fields)` — `name` always editable; `educationLevel` editable only if the Subject currently has zero non-removed `SchoolSubject` rows (Business Rule #2), else 409.
  - `archiveSubject(id)` / `reactivateSubject(id)` — each a no-op if the Subject is already in the target state, per Business Rule #4.
  - `listSubjects({ educationLevel, status })` — platform-wide, optionally filtered.
- `backend/src/features/subjects/subjects.validation.js` — shape-only checks: `name` non-empty string, `educationLevel` a valid enum value on create; on update, only the fields present are shape-checked, service layer owns the assignment-count guard.
- `backend/src/features/subjects/subjects.controller.js`, `subjects.routes.js` — `POST /subjects`, `PATCH /subjects/{id}`, `PATCH /subjects/{id}/archive`, `PATCH /subjects/{id}/reactivate`, `GET /subjects`, all Super-Admin-only.
- `backend/src/features/subjects/index.js` — module's public router export, following every existing feature's pattern.

## WP3 — School ↔ Subject Assignment Backend

**Maps to:** Business Rules #5, #6, #7, #10; Technical Design's Database Impact (`SchoolSubject`) and API Design (assignment endpoints).

- `subjects.service.js`:
  - `assignSubjectToSchool(schoolId, subjectId, actingUser)` — rejects with 409 if the Subject is `ARCHIVED` (Business Rule #5); rejects with 409 if `schoolsService.hasEducationLevel(schoolId, subject.educationLevel)` returns `false` (Business Rule #6, calling School & Platform Management's existing narrow interface, never querying `schools` directly); if a non-removed `SchoolSubject` row already exists for the pair, no-ops (Business Rule #7); otherwise creates a new row, or reactivates a previously soft-removed one for the same `(schoolId, subjectId)` pair (Technical Design's Database Impact).
  - `removeSubjectFromSchool(schoolId, subjectId, actingUser)` — walks the dependency-validation registry (WP4) before soft-removing (sets `removedAt`/`removedById`); rejects with 409 on the first blocking reason returned.
  - `listSchoolSubjects(schoolId)` — returns currently-assigned Subjects (`removedAt IS NULL`), including each Subject's `status` so an Archived-but-assigned Subject is clearly identifiable to the caller (Business Rule #5).
- `subjects.repository.js` — `SchoolSubject` CRUD, including the reactivate-existing-row-on-reassign path.
- `subjects.routes.js` — `POST /schools/{schoolId}/subjects/{subjectId}`, `DELETE /schools/{schoolId}/subjects/{subjectId}` (both Super-Admin-only), `GET /schools/{schoolId}/subjects` (Super Admin for any school; School Admin for their own school only, using the same tenant-isolation mechanism already established elsewhere in this project).

## WP4 — Dependency-Validation Extension Point (Public Interface)

**Maps to:** Business Rule #8; Business Workflow #5.2–5.3; Technical Design's Architecture section (the registry design) and Requirement #6 ("design the extension point, not the future academic modules").

- `subjects.service.js` exports `registerRemovalDependencyCheck(name, checkFn)` — appends `{ name, check: checkFn }` to an in-memory array; `removeSubjectFromSchool` (WP3) iterates this array in registration order, awaiting each `checkFn(schoolId, subjectId)`, and rejects on the first non-`null` return value.
- **No checker is registered anywhere in this pass.** The registry starts and remains empty; `removeSubjectFromSchool` always succeeds today, per Business Rule #8's own stated interim behavior. This work package delivers the mechanism only.
- Unit tests exercise the mechanism directly (register a fake checker within the test file, confirm both the allow and block paths work, confirm multiple registered checkers run in order and the first block short-circuits) — this is the only way to verify the extension point actually works before any real dependent feature exists to prove it.

## WP5 — Audit Logging Integration

**Maps to:** Business Rule #11; Technical Design's Database Impact (Audit events) and Audit Requirements.

- Every WP2/WP3 write function calls the shared audit-recording utility (the same one every other feature already uses) after its write succeeds: `SUBJECT_CREATED`, `SUBJECT_UPDATED`, `SUBJECT_ARCHIVED`, `SUBJECT_REACTIVATED` each carry `schoolId: null` (Subject is platform-wide, per Business Rule #12 — the first feature in this codebase to write a null-tenant audit record on its own primary write path, though the mechanism itself, `AuditLog.schoolId` being nullable, already exists for the bootstrap event); `SUBJECT_ASSIGNED_TO_SCHOOL` / `SUBJECT_ASSIGNMENT_REMOVED` carry the target `schoolId`.
- No new audit infrastructure required — `AuditLog.schoolId` is already nullable; this package only adds the six new action names, following Naming-Conventions.md's existing `FEATURE_EVENT` convention.

## WP6 — Web Frontend (Super Admin + School Admin)

**Maps to:** Technical Design's Frontend Design section; Business Specification's Permissions.

- `web/src/features/subjects/pages/SubjectsListPage.jsx` — Super-Admin-only platform catalog, filterable by Education Level and status, with create/edit/archive/reactivate actions, following `TeachersListPage.jsx`'s established list-page pattern.
- `web/src/features/subjects/components/CreateSubjectDialog.jsx`, `EditSubjectDialog.jsx` — following `OnboardTeacherDialog.jsx`/`EditTeacherDialog.jsx`'s pattern; `EditSubjectDialog` disables the Education Level field once the Subject has at least one assignment, reflecting (not re-implementing) the backend's own guard, per System-Architecture.md's Business Logic Ownership rule.
- `web/src/features/subjects/components/SubjectStatusBadge.jsx` — following `TeacherStatusBadge.jsx`'s pattern.
- `web/src/features/schools/pages/SchoolDetailPage.jsx` (**modified**, not new) — a new "Subjects" section added to the existing Super-Admin-only "Platform administration" card, alongside ACR-003's Education Levels form: lists the school's currently-assigned Subjects (Archived ones clearly marked), with an assign control (picks from Subjects matching the school's own Education Levels) and a remove action per row.
- `web/src/features/subjects/pages/MySubjectsPage.jsx` — a School-Admin-facing, read-only list of Subjects assigned to their own school, calling `GET /schools/{schoolId}/subjects` scoped implicitly to their own `schoolId` from the token. No write affordance anywhere on this page, per Business Rule #1.
- `web/src/features/subjects/services/subjects.service.js` — API client calls for all of the above.
- `web/src/app/App.jsx`, `web/src/app/Layout.jsx` — a single `/subjects` route with `allowedRoles: ['SUPER_ADMIN', 'SCHOOL_ADMIN']`, role-conditionally rendering `SubjectsListPage` (Super Admin) or `MySubjectsPage` (School Admin) — the same shared-route, role-conditional-rendering pattern `/accounts` (`AccountManagementPage`) already establishes in `App.jsx`, not a new routing convention.
- The frontend never re-implements any backend guard (uniqueness, Education-Level-match, Archived-rejection, dependency-validation) — it only reflects what the backend returns, per System-Architecture.md's Business Logic Ownership rule.

---

# Stable Public Service Interface

Per Implementation Planning Requirement #6, the following are the only functions Subject Management exposes for other feature modules to consume directly (in-process, per this project's Modular Monolith style) — everything else in `subjects.repository.js`, `subjects.validation.js`, and the internals of `subjects.service.js` remains module-private, per Coding-Standards.md's module-encapsulation discipline:

- **`getSubjectById(subjectId)`** — read-only lookup, for a future feature (e.g. Teacher Management, Timetable) needing to display a Subject's name/Education Level without duplicating that data.
- **`isSubjectAssignedToSchool(schoolId, subjectId)`** — a narrow boolean read, mirroring the exact shape of School & Platform Management's own `hasEducationLevel`, for a future feature (e.g. Class Management, before attaching a Subject to a Class's curriculum) to validate against this feature's assignment data without querying `SchoolSubject` directly.
- **`listSchoolSubjects(schoolId)`** — already built for WP3's own `GET /schools/{schoolId}/subjects` endpoint; also directly callable in-process by a future feature needing a school's full currently-assigned Subject list (e.g. a future Timetable screen populating a Subject picker).
- **`registerRemovalDependencyCheck(name, checkFn)`** — the WP4 extension point; the only way a future feature may influence this feature's own removal behavior, and the only inbound coupling surface this feature exposes.

No future feature may reach into `subjects.repository.js` or query `Subject`/`SchoolSubject` directly — every cross-feature interaction goes through one of the four functions above, the same Loose Coupling discipline this project has followed since ACR-001.

---

# Files Affected

All new files, except where noted.

| Area | Files | New / Modified |
|---|---|---|
| Database | `backend/prisma/schema.prisma`, `backend/prisma/migrations/` | Modified / New |
| Subject backend | `backend/src/features/subjects/{subjects.controller,subjects.service,subjects.repository,subjects.validation,subjects.routes,index}.js` + test files | New |
| Web (Super Admin) | `web/src/features/subjects/{pages,components,services}/*` | New |
| Web (School integration) | `web/src/features/schools/pages/SchoolDetailPage.jsx` | Modified |
| Web app shell | `web/src/app/App.jsx`, `web/src/app/Layout.jsx` | Modified |
| Mobile | none this pass | Out of scope — see Scope |

No `backend/src/shared/` additions are expected — this feature reuses the existing shared audit utility and the existing `AuditLog.schoolId` nullability, per the Technical Design's Database Impact section.

---

# Dependencies

- **School & Platform Management** — Accepted and implemented; `hasEducationLevel` (ACR-003) already exists and is called directly (in-process) by WP3. One-directional: School & Platform Management has no reference to Subject data and does not wait on this feature. No blocker.
- **Authentication & Authorization** — every endpoint depends on its existing role-enforcement middleware (`requireRole`); no new authentication mechanism, no blocker.
- **Class Management, Teacher Management, Timetable, Exams, Marks, Report Cards** (all future) — each is an *inbound* future dependency on this feature (they will consume the Stable Public Service Interface above and register their own removal-dependency checks); none of them block this feature's own Implementation, and this plan builds nothing on their behalf.
- No blocking dependency remains for this feature.

---

# Risk Assessment

- **First tenant-less entity in this codebase (`Subject`, no `schoolId`).** Any shared middleware or shared query helper that implicitly assumes every table has a `schoolId` (e.g., a generic tenant-scoping helper, if one exists in `backend/src/shared/`) must be checked against this feature's catalog endpoints specifically — `GET /subjects`, `POST /subjects`, etc. have no tenant to scope against at all, unlike literally every other write endpoint in this system. This is a new class of integration risk this plan is the first to encounter; explicit negative tests (confirming catalog endpoints work correctly with no `schoolId` anywhere in the request path) are required, not just positive-path tests.
- **Education-Level-immutability assignment-count check (WP2).** Must count only non-removed `SchoolSubject` rows — a bug that counts soft-removed rows too would incorrectly lock a Subject's Education Level forever even after every one of its assignments was removed, silently over-restricting Super Admin. Dedicated test: remove a Subject's only assignment, then confirm its Education Level becomes editable again.
- **Assign-after-remove reactivation path (WP3).** The "reactivate a previously soft-removed row" branch and the "insert a brand-new row" branch of `assignSubjectToSchool` must both be independently tested — a bug collapsing them (e.g., always inserting, violating the unique constraint on re-assignment) would surface as an unexpected 500 on a legitimate reassignment.
- **Dependency-validation registry has no real checker to prove it against (WP4).** Tested only via a fake, test-local checker (see WP4) — this is a deliberate, accepted limitation of this pass, not a gap to close now; the first real dependent feature's own Implementation Plan should include a route-level regression test re-confirming the registry still correctly blocks a removal once its own checker is registered, mirroring how Teacher Management's WP6 added regression coverage for a cross-feature integration point.
- **`hasEducationLevel` reuse must not regress into a direct `schools` table query** under implementation time pressure — code review should specifically confirm `subjects.repository.js` has no import of the `School` Prisma model at all, per the Technical Design's Loose Coupling requirement.

---

# Testing Strategy

Per `docs/05-templates/Test-Plan-Template.md`'s categories, applied to this feature:

## Functional Tests
- `createSubject` succeeds for a new `(name, educationLevel)` pair and defaults `status` to `ACTIVE`.
- `updateSubject` changes `name` freely; changes `educationLevel` only while the Subject has zero assignments.
- `archiveSubject` / `reactivateSubject` transition correctly and are no-ops when redundantly repeated.
- `assignSubjectToSchool` creates a new `SchoolSubject` row, or reactivates a previously soft-removed one, correctly in each case.
- `removeSubjectFromSchool` soft-removes (sets `removedAt`/`removedById`) rather than deleting the row.
- `listSubjects` / `listSchoolSubjects` return the expected filtered/scoped sets.

## Permission Tests
- Every Super-Admin-only endpoint (catalog CRUD, assign, remove, platform-wide `GET /subjects`) rejects School Admin, Teacher, and Student callers with 403.
- `GET /schools/{schoolId}/subjects` accepts Super Admin for any `schoolId` and School Admin only for their own; a School Admin targeting another school's `schoolId` is rejected with 404 (never 403), per the Technical Design's Error Handling section.

## Validation Tests
- `POST /subjects` rejects a missing/empty `name` and an invalid `educationLevel` value with 422.
- `POST /subjects` rejects a duplicate `(name, educationLevel)` pair with 409.
- `PATCH /subjects/{id}` rejects an `educationLevel` change with 409 once the Subject has at least one assignment.
- `POST /schools/{schoolId}/subjects/{subjectId}` rejects assignment of an `ARCHIVED` Subject with 409, and rejects assignment to a School lacking the Subject's Education Level with 409.

## Edge Case Tests
- Every "Situation → Expected Behavior" row in the Business Specification's Edge Cases table.
- Re-assigning a Subject previously removed from a School succeeds and reactivates the existing row rather than erroring on the unique constraint.
- Archiving a Subject that is currently assigned to one or more Schools leaves those assignments untouched and visible, but blocks any *new* assignment attempt.
- A dependency checker registered via `registerRemovalDependencyCheck` correctly blocks a removal it objects to, and a second, later-registered checker never runs once an earlier one has already blocked.

## Integration Tests
- `assignSubjectToSchool`'s actual call into `schoolsService.hasEducationLevel` is verified against a real School record (not mocked), consistent with this project's established preference for integration tests over mocks that could mask broken wiring.
- The full `POST /subjects` → `POST /schools/{schoolId}/subjects/{subjectId}` → `GET /schools/{schoolId}/subjects` → `DELETE /schools/{schoolId}/subjects/{subjectId}` round trip, exercised via real HTTP routes, not service-layer calls directly.

## Regression Tests
- Existing School & Platform Management, Class, Student, Teacher, and Auth test suites re-run and passing unchanged — this plan touches no existing feature's files except the additive `SchoolDetailPage.jsx` change in WP6, and no existing backend file at all.

---

# Definition of Done Coverage

Mapped against `docs/02-standards/Definition-of-Done.md`'s checklist:

| Item | Coverage in this plan |
|---|---|
| Business logic approved | `docs/03-business/Subject-Management.md` v1.1, Accepted (Phase 3 Business Review). |
| Edge cases reviewed | Business Specification's Edge Cases table plus this plan's own Testing Strategy Edge Case Tests. |
| Technical design completed | `docs/06-technical-design/Subject-Management.md` v1.0, Approved. |
| Security considered | Technical Design's Security Considerations; this plan's Risk Assessment (tenant-less-entity risk, `hasEducationLevel` boundary discipline). |
| Validation completed | This plan's Validation Tests category; shape vs. service-layer split per the Technical Design's Validation Strategy. |
| Development / implementation completed | Tracked per work package (WP1–WP6) during Phase 6; not yet started as of this plan. |
| Standards followed | Naming-Conventions.md, Database-Standards.md, API-Standards.md, Security-Standards.md all cited per relevant Work Package above. |
| Code is clean | Enforced at Phase 6/Phase 9 (code review), not this planning phase. |
| No known issues remain | This plan's Risk Assessment items must each be closed (not merely acknowledged) before Phase 7 Validation. |
| Tests passed | This plan's Testing Strategy (all six categories) must pass before Phase 7. |
| Code reviewed | Per Development-Lifecycle.md Phase 9, an independent code review is required before Feature Acceptance, consistent with every prior feature. |
| Documentation updated | Business Specification, Technical Design, and this plan are already current; `docs/08-validation/Subject-Management.md` to be produced at Phase 7. |

Every item is either already satisfied at the planning level or has an explicit, named place in this plan where it will be satisfied — none are silently deferred without a tracked location.

---

# Estimated Impact

Smaller in raw surface area than Teacher Management or Student Management (no multi-state lifecycle transition matrix — only Active/Archived, and only two write actions on the assignment side), but introduces one genuinely new class of complexity no prior feature's plan has had to handle: a platform-wide, tenant-less entity (`Subject`) coexisting in the same schema and API surface as every other feature's tenant-scoped entities, plus an inbound extension point (the dependency-validation registry) other features will register into later rather than this feature reaching out to them. Comparable in kind to School & Platform Management's own first pass (also a small, foundational, low-lifecycle-complexity feature), not to Teacher's or Student's wider transition surfaces.

---

# Change History

- v1.0 — Initial implementation plan, following Technical Design approval (`docs/06-technical-design/Subject-Management.md` v1.0, Approved). Scoped to Backend + Web; Mobile deferred, consistent with every prior feature's plan. Identifies the four-function Stable Public Service Interface per Implementation Planning Requirement #6.
