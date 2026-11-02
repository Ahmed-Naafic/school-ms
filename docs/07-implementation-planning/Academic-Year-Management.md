# Implementation Planning

Feature: Academic Year Management

Version: 1.0

Status: Drafted, following Technical Design approval. Awaiting Phase 5 review and explicit Product Owner approval — implementation must not begin before that.

---

# Scope

This plan implements the `academic-years` feature module as designed in `docs/06-technical-design/Academic-Year-Management.md` (v1.0, Approved), **scoped to Backend and Web only**, following the same per-application scoping precedent already established by Subject Management and every prior feature's plan: Backend defines the business rules and API contract; Web covers School Admin's full management workflow; Mobile is out of scope (no Flutter project exists yet).

Covered in this pass: Academic Year creation (including the school's-first-year-auto-becomes-Current behavior), update, the Active/Archived lifecycle, Current-year designation (via the single dedicated `setCurrentAcademicYear` transition function), the archive-requires-replacement-if-Current guard, the overlap and duplicate-derived-label checks, and the Stable Public Service Interface for future consumers.

Out of scope for this pass, per the Business Specification's own Not Included / Future Considerations:
- Any actual wiring of a consumer to the Stable Public Service Interface — Student Management's own future ACR to consume Academic Year instead of its free-text field is separate, later work, not part of this plan.
- Migrating existing free-text `Enrollment.academicYear` values — explicitly descoped by the Business Specification.
- Term/Semester sub-structure.
- Mobile.

---

# Work Packages

Each package below maps to the specific Business Specification rules and Technical Design sections it implements, so every task traces back to an approved decision — nothing here introduces new business logic.

## WP1 — Database Schema & Migration

**Maps to:** Technical Design's Database Impact section; Business Rules #2, #3, #5, #8, #9.

- `backend/prisma/schema.prisma`:
  - New `AcademicYearStatus` enum (`ACTIVE` / `ARCHIVED`), matching `ClassStatus`/`SubjectStatus`'s existing naming convention.
  - New `AcademicYear` model: `schoolId` (FK to `School`), `startDate`, `endDate` (both required), `status` (`AcademicYearStatus`, default `ACTIVE`), `isCurrent` (Boolean, default `false`), timestamps. **No `name`/`label` column** — the derived label is a presentation concern only, per Technical Design Requirement #5.
  - `@@index([schoolId])`.
- `backend/prisma/migrations/` — new migration generated from the schema change, **including one hand-written raw-SQL statement**: `CREATE UNIQUE INDEX "academic_years_school_current_unique" ON "academic_years"("schoolId") WHERE "isCurrent" = true;` — the identical justified exception to "only Prisma accesses the database" that Class Management's own `isFinal` migration already established (Prisma's schema DSL cannot express a partial unique constraint).
- Purely additive — no existing table altered, no backfill or data-loss consideration.

## WP2 — Academic Year Core Backend (Create / Update / List)

**Maps to:** Business Rules #1, #2, #3, #4, #6, #9; Technical Design's API Design and Validation Strategy.

- `backend/src/features/academic-years/academic-years.repository.js` — the only file touching Prisma for this feature, per Coding-Standards.md.
- `backend/src/features/academic-years/academic-years.service.js`:
  - `createAcademicYear(schoolId, { startDate, endDate }, actingUser)` — runs the overlap check (Active *and* Archived Academic Years, per Business Rule #3) and the duplicate-derived-label check (Business Rule #4) before inserting; if this is the school's first-ever Academic Year (count of existing rows for the school is zero), calls `setCurrentAcademicYear` (WP3) as part of the same creation instead of leaving `isCurrent: false` (Business Rule #9).
  - `updateAcademicYear(schoolId, id, { startDate, endDate }, actingUser)` — re-runs both checks against the updated range, regardless of the target's Active/Archived status (Business Rule #6).
  - `listAcademicYears(schoolId, { status })` — the school's own Academic Years, optionally filtered.
- `backend/src/features/academic-years/academic-years.validation.js` — shape-only checks: `startDate`/`endDate` required, valid dates, `endDate` strictly after `startDate`; and (per the Phase 9 lesson from Subject Management's own code review) a `validateListAcademicYears` shape-check on the `status` query filter, built in from the start this time rather than discovered as a gap later.
- `backend/src/features/academic-years/academic-years.controller.js`, `academic-years.routes.js` — `POST /academic-years`, `PATCH /academic-years/{id}`, `GET /academic-years`, all School-Admin-only, `schoolId` always from the token.
- `backend/src/features/academic-years/index.js` — module's public router export, following every existing feature's pattern.

## WP3 — Lifecycle & Current-Designation Backend

**Maps to:** Business Rules #5, #7, #8, #9; Technical Design's Architecture and Backend Design sections (the `setCurrentAcademicYear` requirement).

- `academic-years.service.js`:
  - **`setCurrentAcademicYear(schoolId, academicYearId, tx?)`** — the single dedicated transition function (Technical Design Requirement #7). Inside one `prisma.$transaction` (or the passed-in `tx`, when called from within `archiveAcademicYear`'s own transaction): unsets `isCurrent` on whichever Academic Year in the school currently holds it, if any, then sets it on the target. **No other function in this module writes `isCurrent` directly** — this is the module's own internal choke point, not just a convention.
  - `designateCurrentAcademicYear(schoolId, academicYearId, actingUser)` — the `PATCH .../current` endpoint's service function: rejects if the target is Archived (Business Rule #8); no-ops if already Current; otherwise calls `setCurrentAcademicYear`.
  - `archiveAcademicYear(schoolId, academicYearId, newCurrentAcademicYearId, actingUser)` — no-ops if already Archived (Business Rule #5). If the target is not Current, archives directly. If the target *is* Current, requires `newCurrentAcademicYearId` (validated: exists, same school, `status: ACTIVE`, different record) and performs the archive plus `setCurrentAcademicYear(schoolId, newCurrentAcademicYearId, tx)` inside one transaction (Business Rule #9) — rejects with 409 if `newCurrentAcademicYearId` is missing or invalid in this situation.
  - `reactivateAcademicYear(schoolId, academicYearId, actingUser)` — no-op if already Active (Business Rule #5); otherwise reactivates. Reactivating never changes `isCurrent` — a reactivated Academic Year returns to Active but not automatically to Current.
- `academic-years.routes.js` — `PATCH /academic-years/{id}/archive`, `/reactivate`, `/current`, all School-Admin-only.

## WP4 — Stable Public Service Interface (Public Interface)

**Maps to:** Technical Design's Backend Design section; Requirement #3 ("foundational entity").

- `academic-years.service.js` exports three read-only, side-effect-free functions, built now even though no consumer exists yet, per this project's established Future Integration Readiness precedent (School & Platform Management's `hasEducationLevel`, Class Management's `getClassById`/`getSuggestedNextClass`/`getFinalClass`, Subject Management's `getSubjectById`/`isSubjectAssignedToSchool`):
  - `getAcademicYearById(schoolId, id)`
  - `getCurrentAcademicYear(schoolId)`
  - `listActiveAcademicYears(schoolId)`
- No future feature may reach into `academic-years.repository.js` or query `AcademicYear` directly — every future cross-feature interaction (starting with Student Management's own eventual ACR) goes through one of these three functions, the same Loose Coupling discipline this project has followed since ACR-001.

## WP5 — Audit Logging Integration

**Maps to:** Business Rule #13; Technical Design's Security Considerations.

- Every WP2/WP3 write function calls the shared audit-recording utility after its write succeeds: `ACADEMIC_YEAR_CREATED`, `ACADEMIC_YEAR_UPDATED`, `ACADEMIC_YEAR_ARCHIVED`, `ACADEMIC_YEAR_REACTIVATED`, `ACADEMIC_YEAR_CURRENT_CHANGED` (recorded with the previous Current Academic Year's id, if any, and the new one, in `metadata`). All carry the school's own `schoolId` — unlike Subject Management, there is no platform-wide/`null`-tenant case here, since Academic Year is always school-scoped.
- Following the lesson from Subject Management's own Phase 7 Validation (where audit-log *persistence* had no dedicated test, only mocked-call assertions), this plan's own Testing Strategy includes a real-database audit-persistence check from the start, not discovered as a gap later.

## WP6 — Web Frontend (School Admin)

**Maps to:** Technical Design's Frontend Design section; Business Specification's Permissions.

- `web/src/features/academic-years/pages/AcademicYearsListPage.jsx` — School-Admin-only list, each row showing the computed `YYYY/YYYY` label and a Current indicator, with create/edit/archive/reactivate/designate-Current actions, following `ClassesListPage.jsx`'s established list-page pattern.
- `web/src/features/academic-years/utils/format-academic-year-label.js` — `formatAcademicYearLabel(startDate, endDate)`, the same shape as Class Management's existing `formatClassSectionName` utility; used everywhere the label is shown, since it is never stored (Technical Design Requirement #5).
- `web/src/features/academic-years/components/CreateAcademicYearDialog.jsx`, `EditAcademicYearDialog.jsx` — date-picker inputs for `startDate`/`endDate` only, no name field.
- `web/src/features/academic-years/components/ArchiveAcademicYearDialog.jsx` (or an inline extension of the list page's archive action) — if the target is the school's Current Academic Year, requires selecting a different Active Academic Year to become Current before confirming, reflecting (not re-implementing) the backend's own `newCurrentAcademicYearId` requirement; if no other Active Academic Year exists, explains that a replacement must exist first.
- `web/src/features/academic-years/services/academic-years.service.js` — API client calls for all of the above.
- `web/src/app/App.jsx`, `web/src/app/Layout.jsx` — a new `/academic-years` route and sidebar nav entry, School-Admin-only, following the exact pattern already established for `/classes`, `/students`, `/subjects`.
- The frontend never re-implements any backend guard (overlap, duplicate-label, archive-requires-replacement, Current-only-Active) — it only reflects what the backend returns, per System-Architecture.md's Business Logic Ownership rule.

---

# Stable Public Service Interface

(Restated from WP4 for visibility, per Implementation Planning Requirement #6's precedent from Subject Management.) The only functions another feature module may call directly, in-process:

- `getAcademicYearById(schoolId, id)`
- `getCurrentAcademicYear(schoolId)`
- `listActiveAcademicYears(schoolId)`

Everything else in `academic-years.service.js`, and all of `academic-years.repository.js`, is module-private.

---

# Files Affected

All new files, except where noted.

| Area | Files | New / Modified |
|---|---|---|
| Database | `backend/prisma/schema.prisma`, `backend/prisma/migrations/` | Modified / New |
| Academic Year backend | `backend/src/features/academic-years/{academic-years.controller,academic-years.service,academic-years.repository,academic-years.validation,academic-years.routes,index}.js` + test files | New |
| Web | `web/src/features/academic-years/{pages,components,services,utils}/*` | New |
| Web app shell | `web/src/app/App.jsx`, `web/src/app/Layout.jsx`, `web/src/app/nav-icons.jsx` | Modified |
| Mobile | none this pass | Out of scope — see Scope |

No `backend/src/shared/` additions are expected — this feature reuses the existing shared audit utility and existing middleware chain.

---

# Dependencies

- **School & Platform Management** — Accepted and implemented; every Academic Year belongs to a school it creates and keeps active. One-directional: no reverse dependency. No blocker.
- **Authentication & Authorization** — every endpoint depends on its existing role-enforcement middleware; no new authentication mechanism, no blocker.
- **Student Management, Attendance Management, Timetable, Exam Management, Marks, Fees Management, Report Cards** (all future) — each is an *inbound* future dependency (they will consume the Stable Public Service Interface once built); none of them block this feature's own Implementation, and this plan builds nothing on their behalf.
- No blocking dependency remains for this feature.

---

# Risk Assessment

- **Accepted Technical Debt (Product Owner decision, carried from Technical Design): the overlap check and the duplicate-derived-label check have no database-level backstop.** Implementation must not attempt to work around this with ad hoc locking or retries beyond the single application transaction already designed — the accepted trade-off is that a genuine concurrent-write race (two simultaneous creates for the same school) could, in the worst case, both succeed and leave overlapping or duplicate-labeled Academic Years persisted, unlike Subject Management's own race (which the database's unique constraint caught and converted to a clean idempotent success). This plan's own Testing Strategy tests the correct sequential/non-concurrent behavior only; it does not attempt to prove concurrency safety that the design deliberately doesn't provide.
- **`setCurrentAcademicYear` must remain the only code path that writes `isCurrent`.** A future addition (in this pass or later) that sets `isCurrent` directly, bypassing this function, would silently reintroduce the two-Current-years risk the partial unique index only partially guards against (it prevents two simultaneously-stored `true` rows, but cannot detect zero `true` rows for a school that should have one). Code review at Phase 9 should specifically grep for direct `isCurrent` writes outside this one function.
- **First-Academic-Year-auto-becomes-Current logic (WP2) must be part of the same transaction as the insert**, not a separate follow-up write — otherwise a failure between the two steps could leave a school's first Academic Year created but not Current, silently violating Business Rule #9 with no error surfaced.
- **Archive-with-replacement (WP3) is the widest single transaction in this feature** (validate replacement, unset old Current, set new Current, archive the original — all atomic). Getting the ordering wrong (e.g., archiving before the Current hand-off completes) could leave a school briefly, or on partial failure permanently, without any Current Academic Year. This is exactly the scenario Technical Design's Risks section flagged for Phase 7 Validation to specifically test.

---

# Testing Strategy

Per `docs/05-templates/Test-Plan-Template.md`'s categories, applied to this feature:

## Functional Tests
- `createAcademicYear` succeeds for a valid, non-overlapping, non-duplicate-label range and defaults `status` to `ACTIVE`.
- A school's first-ever Academic Year is created with `isCurrent: true`; its second Academic Year is created with `isCurrent: false`.
- `updateAcademicYear` changes dates freely (regardless of Active/Archived status) and re-derives the label accordingly.
- `archiveAcademicYear` / `reactivateAcademicYear` transition correctly and are no-ops when redundantly repeated.
- `designateCurrentAcademicYear` correctly unsets the previous Current and sets the new one, atomically.
- `listAcademicYears` / the three Stable Public Service Interface functions return the expected filtered/scoped results.

## Permission Tests
- Every endpoint rejects non-School-Admin callers (Super Admin, Teacher, Student, Accountant) with 403.
- A School Admin from School A receives 404 (never a leaked 403) when targeting an Academic Year belonging to School B.

## Validation Tests
- `POST /academic-years` rejects missing/invalid dates and `endDate <= startDate` with 422.
- `GET /academic-years` rejects an invalid `status` query filter with 422 (built in from the start — see WP2).
- `POST /academic-years` rejects an overlapping range (against both an Active and an Archived existing Academic Year) with 409.
- `POST /academic-years` rejects a range whose derived label duplicates an existing one, even when the dates themselves don't overlap, with 409.
- `PATCH /academic-years/{id}/current` rejects designating an Archived Academic Year as Current with 409.
- `PATCH /academic-years/{id}/archive` rejects archiving the Current Academic Year without a valid `newCurrentAcademicYearId` with 409.

## Edge Case Tests
- Every "Situation → Expected Behavior" row in the Business Specification's Edge Cases table.
- Archiving the school's *only* Academic Year (which is therefore Current) with no `newCurrentAcademicYearId` available at all — rejected, since no valid replacement can exist.
- Designating a different Active Academic Year as Current, then archiving the one that was previously Current — succeeds, since the hand-off already happened.
- Editing an Archived Academic Year's dates — permitted, re-checked against overlap/duplicate-label rules.
- Two Academic Years with non-overlapping date ranges that nonetheless derive the same `YYYY/YYYY` label (e.g. differently-scoped ranges within the same start/end year pair) — rejected on the label check specifically, confirming it runs independently of the overlap check.

## Integration Tests
- The full `POST /academic-years` → `PATCH .../archive` (with replacement) → `GET /academic-years` round trip, exercised via real HTTP routes, confirming the Current designation actually moved.
- Real `audit_logs` table queries (not mocked) confirming at least one `ACADEMIC_YEAR_CREATED` and one `ACADEMIC_YEAR_CURRENT_CHANGED` row persist correctly with the school's own `schoolId` — built in from the start, per the lesson from Subject Management's own Phase 7 Validation finding.

## Regression Tests
- Existing School, Class, Student, Teacher, Auth, and Subject test suites re-run and passing unchanged — this plan touches no existing backend file, and only additively modifies `App.jsx`/`Layout.jsx`/`nav-icons.jsx` on the frontend.

---

# Definition of Done Coverage

Mapped against `docs/02-standards/Definition-of-Done.md`'s checklist:

| Item | Coverage in this plan |
|---|---|
| Business logic approved | `docs/03-business/Academic-Year-Management.md` v1.1, Accepted (Phase 3 Business Review). |
| Edge cases reviewed | Business Specification's Edge Cases table plus this plan's own Testing Strategy Edge Case Tests. |
| Technical design completed | `docs/06-technical-design/Academic-Year-Management.md` v1.0, Approved. |
| Security considered | Technical Design's Security Considerations; this plan's Risk Assessment (`setCurrentAcademicYear` as the sole write path, accepted concurrency debt explicitly scoped). |
| Validation completed | This plan's Validation Tests category; shape vs. service-layer split per the Technical Design's Validation Strategy. |
| Development / implementation completed | Tracked per work package (WP1–WP6) during Phase 6; not yet started as of this plan. |
| Standards followed | Naming-Conventions.md, Database-Standards.md, API-Standards.md, Security-Standards.md all cited per relevant Work Package above. |
| Code is clean | Enforced at Phase 6/Phase 9 (code review), not this planning phase. |
| No known issues remain | This plan's Risk Assessment items must each be closed (not merely acknowledged) before Phase 7 Validation, except the explicitly Accepted Technical Debt item, which is closed by definition (accepted, not fixed). |
| Tests passed | This plan's Testing Strategy (all six categories) must pass before Phase 7. |
| Code reviewed | Per Development-Lifecycle.md Phase 9, an independent code review is required before Feature Acceptance, consistent with every prior feature. |
| Documentation updated | Business Specification, Technical Design, and this plan are already current; `docs/08-validation/Academic-Year-Management.md` to be produced at Phase 7. |

Every item is either already satisfied at the planning level or has an explicit, named place in this plan where it will be satisfied — none are silently deferred without a tracked location.

---

# Estimated Impact

Comparable in shape to Subject Management's own first pass: no multi-state lifecycle transition matrix (only Active/Archived), but one genuinely intricate piece of logic — the atomic archive-with-Current-replacement transaction — that deserves the same care Teacher Management's WP3 (six employment transitions) or Student Management's Promotion logic received. Smaller in raw file count than Subject Management (no platform-wide/tenant-less entity complexity, no dependency-validation registry), but the `setCurrentAcademicYear` choke-point discipline (Risk Assessment) is a correctness-critical detail worth the same rigor as Class Management's own `isFinal` transaction logic it's modeled on.

---

# Change History

- v1.0 — Initial implementation plan, following Technical Design approval (`docs/06-technical-design/Academic-Year-Management.md` v1.0, Approved). Scoped to Backend + Web; Mobile deferred, consistent with every prior feature's plan. Carries forward the Technical Design's own Accepted Technical Debt decision (no DB-level backstop for overlap/duplicate-label checks) into this plan's Risk Assessment and Testing Strategy, scoping tests to sequential behavior only, not concurrency guarantees the design doesn't provide.
