# Technical Design

Feature: Academic Year Management

Version: 1.1

Status: Approved. Implementation (Phase 6) and Validation (Phase 7) complete. An independent code review (Phase 9) found and fixed 2 Critical concurrency findings — see `docs/00-governance/Code-Review-Report.md` and this document's own Change History.

---

# Overview

This document designs the technical approach for the Business Specification approved in `docs/03-business/Academic-Year-Management.md` (v1.1, Accepted). It applies the already-approved architecture (`System-Architecture.md`, `Folder-Structure.md`), technology stack (`Technology-Decisions.md`), and standards (`Database-Standards.md`, `API-Standards.md`, `Security-Standards.md`) to this specific feature. No new technology, pattern, or architecture is introduced here.

This design stays entirely within the approved Business Specification's Business Rules. No new business rule is introduced anywhere below; every decision either directly implements an existing Business Rule or is a pure implementation-mechanism choice the Business Specification left to Technical Design.

No genuine business ambiguity was uncovered while producing this design — every decision below resolves cleanly against the approved Business Specification. No Architecture Question is raised.

---

# Architecture

- Implemented as a feature module: `backend/src/features/academic-years/` — Folder-Structure.md's feature-based convention extends naturally to this name, the same way it already anticipated `subjects/`.
- **Academic Year is school-scoped, like the overwhelming majority of entities in this system** (Business Rule #2) — unlike Subject Management's platform-wide `Subject`, every `AcademicYear` row carries a `schoolId` and is created/managed the same tenant-scoped way Class, Student, and Teacher already are. `schoolId` is always taken from the authenticated School Admin's own token, never client input, per this project's Multi-Tenancy convention.
- **Exactly-one-Current-per-school is the same invariant shape Class Management already solved for its own "exactly one final Class"** (Class-Management.md Business Rule #7, `Class.isFinal`). This design reuses that exact precedent: a `isCurrent` boolean column plus a partial unique index (`WHERE "isCurrent" = true`), with the atomic swap performed by the application in a single transaction — the same two-layer defense (application-level atomicity as the primary mechanism, the database constraint as a backstop against a bypass or a bug) Class Management already established for `isFinal`.
- **Per Technical Design Requirement #7, all Current-designation changes route through one dedicated service function**, `setCurrentAcademicYear`, which is the *only* code path permitted to write `isCurrent`. Creation (for a school's first-ever Academic Year) and archive-with-replacement both call into this same function internally rather than duplicating its transaction logic — see Backend Design.
- **The derived `YYYY/YYYY` label is a presentation concern, not a stored field, per Technical Design Requirement #5.** No `label` or `name` column exists on `AcademicYear`. The label is computed from `startDate`/`endDate` wherever it's displayed (frontend) or needs comparing (service-layer duplicate-label check) — see Database Impact and Validation Strategy for the consequence this has on how uniqueness is enforced.
- Standard roles and permissions are not part of this feature's data model — School Admin is the fixed `UserRole` enum value owned by Authentication & Authorization, enforced the same way every other feature enforces it (`requireRole`).

---

# Database Impact

Conceptual data shape only — field-level schema is a separate Database Design exercise if the Product Owner wants one produced.

- **`AcademicYear`**:
  - `schoolId` (FK to `School`), indexed — every Academic Year belongs to exactly one school (Business Rule #2).
  - `startDate`, `endDate` (both required) — the only fields Business Rule #3/#4 require; there is deliberately no `name`/`label` column (Architecture, above).
  - `status` (a new `AcademicYearStatus` enum, `ACTIVE` / `ARCHIVED`, defaulting to `ACTIVE`), following the exact naming convention already established by `ClassStatus` and `SubjectStatus`.
  - `isCurrent` (Boolean, defaulting to `false`) — mirrors `Class.isFinal`'s exact shape. A **partial unique index** — `CREATE UNIQUE INDEX ... ON academic_years("schoolId") WHERE "isCurrent" = true` — added via raw SQL in this model's own migration, the identical justified exception Class Management's own migration already uses (Prisma's schema DSL cannot express a partial unique constraint directly).
  - No `schoolId`-and-date-range database-level exclusion constraint (Business Rule #3's overlap check) and no database-level uniqueness backstop for the derived-label check (Business Rule #4) — both are enforced only in the service layer. See Risks for why this asymmetry (a DB backstop for the Current invariant, but not for these two) is a deliberate, documented trade-off, not an oversight.
  - Never hard-deleted, regardless of `status`, per Business Rule #5 and Database-Standards.md's Soft Delete Policy.
- No change to any existing model. `Enrollment.academicYear` (Student Management's existing free-text field) is untouched, per Business Rule #12 and Business Specification's own Scope (no migration of existing data, no consumption wiring in this pass).

---

# API Design

High-level shape only — exact routes, payloads, and per-case status codes belong in a separate API Specification if requested.

- REST, versioned under `/api/v1`, per API-Standards.md. All routes School-Admin-only, tenant-scoped from the authenticated token — the same shape as Class Management's own routes (`schoolId` never a route parameter or body field; always the token's own).
- `POST /academic-years` — create (`startDate`, `endDate`). If this is the school's first-ever Academic Year, it is created with `isCurrent: true` automatically (Business Rule #9); otherwise `isCurrent: false`.
- `GET /academic-years` — list the caller's own school's Academic Years, optionally filterable by `status`.
- `PATCH /academic-years/{id}` — update `startDate`/`endDate`, re-validated against the same overlap and duplicate-label checks as creation, regardless of the target's `status` (Business Rule #6).
- `PATCH /academic-years/{id}/archive` — archive. Body accepts an optional `newCurrentAcademicYearId`. If the target is not the school's Current Academic Year, the field is ignored and archiving proceeds as an ordinary state transition. **If the target *is* the school's Current Academic Year, `newCurrentAcademicYearId` is required** — referencing a different, Active Academic Year in the same school — and the archive plus the Current hand-off happen atomically in one transaction, via `setCurrentAcademicYear` (Business Rule #9). Missing or invalid `newCurrentAcademicYearId` in that situation is rejected with 409.
- `PATCH /academic-years/{id}/reactivate` — reactivate (idempotent no-op if already Active, per Business Rule #5).
- `PATCH /academic-years/{id}/current` — designate this Academic Year as the school's Current one, via `setCurrentAcademicYear`. Idempotent no-op if already Current (Business Rule #8); rejected if the target is Archived.
- Every endpoint requires a valid JWT and passes through the same Authentication/Authorization middleware chain already designed in Authentication & Authorization's Technical Design.

---

# Backend Design

- New feature module `backend/src/features/academic-years/`, structured per Folder-Structure.md (controller, service, repository, validation, routes, tests) — the same shape every prior feature module already follows.
- **`setCurrentAcademicYear(schoolId, academicYearId, tx?)`** — the single dedicated transition function required by Technical Design Requirement #7. Performs, in one `prisma.$transaction`: (1) unset `isCurrent` on whichever Academic Year in the school currently holds it, if any; (2) set `isCurrent: true` on the target. Called from three places, never duplicated: `createAcademicYear` (school's first-ever year), the dedicated `designateCurrentAcademicYear` service function (the `PATCH .../current` endpoint), and `archiveAcademicYear` when a `newCurrentAcademicYearId` hand-off is supplied. Accepts an optional `tx` (Prisma transaction client) so `archiveAcademicYear` can call it *within* its own outer transaction when archive-and-swap must be atomic together, rather than nesting two separate transactions.
- **`archiveAcademicYear(schoolId, academicYearId, newCurrentAcademicYearId?, actingUser)`** — loads the target; if `isCurrent` is true, requires `newCurrentAcademicYearId` (validated: exists, same school, `status: ACTIVE`, not the same record being archived), and performs the archive plus `setCurrentAcademicYear` inside one transaction (Business Rule #9). If `isCurrent` is false, archives directly. **(Phase 9 code review, v1.1)** The entire read-decide-write sequence — including the very first read of `isCurrent`/`status` — now happens inside one transaction that first acquires a Postgres advisory lock scoped to the school (`pg_advisory_xact_lock(hashtext(schoolId))`, via a new `repository.acquireSchoolLock`), not a plain read followed by a conditional write outside any lock. `designateCurrentAcademicYear` acquires the identical lock for the identical reason — see Risks.
- **Overlap check** (Business Rule #3) — a service-layer function loads every Academic Year for the school (Active *and* Archived, per the Business Review's explicit "archiving never frees a date range" decision) and rejects if the candidate `[startDate, endDate]` range intersects any existing one, inclusive of shared boundary dates (a range ending the same day another begins is treated as overlapping — the more conservative reading, consistent with this project's general preference for the safer default where the Business Specification didn't pin down the exact boundary case). Re-run on both create and update.
- **Duplicate-derived-label check** (Business Rule #4) — since the label isn't stored, this is computed in the service layer: derive `YYYY/YYYY` from each existing Academic Year's `startDate`/`endDate` years, compare against the candidate's derived label, reject on a match. Re-run on both create and update, in the same service-layer pass as the overlap check (both need the same "every Academic Year in this school" read).
- Repository layer is the only code touching Prisma, per Coding-Standards.md.
- **Stable narrow interface for future consumers** (per Requirement #3's "foundational entity" framing, and this project's established Future Integration Readiness precedent — e.g. School & Platform Management's `hasEducationLevel`, Class Management's `getClassById`/`getSuggestedNextClass`/`getFinalClass`, Subject Management's `getSubjectById`/`isSubjectAssignedToSchool`): three read-only functions exported from the outset even though nothing consumes them yet — `getAcademicYearById(schoolId, id)`, `getCurrentAcademicYear(schoolId)`, `listActiveAcademicYears(schoolId)`. Student Management's own future ACR is expected to consume Academic Year data only through these, never a direct table query, per Business Rule #11.

---

# Frontend Design

- `web/src/features/academic-years/` (React/Vite/JavaScript):
  - `AcademicYearsListPage` — School-Admin-only, lists the school's Academic Years with each row's computed `YYYY/YYYY` label (a small `formatAcademicYearLabel(startDate, endDate)` utility, the same shape as Class Management's existing `formatClassSectionName` utility), a Current indicator, and create/edit/archive/reactivate/designate-Current actions, following the same list-page conventions already established by `ClassesListPage`.
  - `CreateAcademicYearDialog` / `EditAcademicYearDialog` — date-picker inputs for `startDate`/`endDate` only; no name/label field, consistent with Business Rule #4.
  - Archiving the Current Academic Year: if the School Admin attempts to archive the row currently marked Current, the dialog first requires selecting a different Active Academic Year to become Current (populated from the school's other Active years) before confirming — reflecting, not re-implementing, the backend's own `newCurrentAcademicYearId` requirement, per System-Architecture.md's Business Logic Ownership rule. If no other Active Academic Year exists, the dialog explains that a replacement must exist first, since the backend would reject the request otherwise.
- Only the Web application is involved — Teacher and Student (the Mobile application's users) have no permissions in this feature, per the Business Specification's Actors and Permissions sections.

---

# Mobile Design

Not applicable. Teacher and Student — the only roles using the Mobile application, per System-Architecture.md — have no permissions related to Academic Year management, per the Business Specification's Actors section.

---

# Validation Strategy

- All validation happens server-side, per Coding-Standards.md and API-Standards.md.
- **Shape-only validation**: `startDate` and `endDate` are both required valid dates; `endDate` must be strictly after `startDate` — a basic structural-validity check, not a business-policy choice, the same category as Subject Management's "name must be non-empty."
- **Service-layer, data-dependent validation** (requires loading current state, per this project's established validation/service split):
  - Overlap against every existing Academic Year in the school, Active and Archived (Business Rule #3).
  - Duplicate derived label against every existing Academic Year in the school (Business Rule #4).
  - Archiving the Current Academic Year requires a valid `newCurrentAcademicYearId` (Business Rule #9).
  - Only an Active Academic Year may be designated Current (Business Rule #8).

---

# Security Considerations

- Every Academic Year endpoint requires the School Admin role, enforced server-side via the same Authentication/Authorization middleware chain every other feature already uses — never trusted from client-supplied role claims.
- `schoolId` is always derived from the authenticated token; no route accepts a client-supplied `schoolId`, the same discipline Class Management already applies (stricter than School Management's or Subject Management's own school-targeted routes, which do accept a path `schoolId` for Super Admin's cross-school reach — Academic Year Management has no Super Admin surface at all, so this simpler, token-only pattern applies cleanly).
- Every write action produces an audit record, per this feature's Audit Requirements and Security-Standards.md's Auditability section.

---

# Performance Considerations

- An Academic Year list per school is expected to be small (a handful of years at most — School Admin manually creates each one), so the "load every Academic Year in the school" pattern used by the overlap and duplicate-label checks is not a performance concern at any realistic scale, the same reasoning Class Management's own reorder logic already relies on for its own school-scoped full-list reads.
- The partial unique index on `isCurrent` and the standard index on `schoolId` are both cheap, standard-sized indexes.

---

# Error Handling

Consistent with API-Standards.md's status codes, and this project's established convention of 422 for shape-only problems and 409 for state-dependent conflicts:

- 422 — missing/invalid `startDate` or `endDate`, or `endDate` not after `startDate`.
- 409 — an overlapping date range (Active or Archived); a duplicate derived label; designating an Archived Academic Year as Current; archiving the Current Academic Year without a valid `newCurrentAcademicYearId`, or with one that doesn't reference a different, Active Academic Year in the same school.
- 403 — a non-School-Admin role attempting any action.
- 404 — Academic Year not found, including cross-tenant access (a School Admin targeting another school's Academic Year) — the same 404-not-403 convention Class, Teacher, and Student Management already use.
- Errors never expose internal implementation details, per Coding-Standards.md.

---

# Dependencies

- **School & Platform Management** — every Academic Year belongs to a school created and kept active by that feature. No reverse dependency: School & Platform Management has no reference to Academic Year data.
- **Authentication & Authorization** — every endpoint depends on its existing role-enforcement middleware; no new authentication mechanism.
- **Student Management, Attendance Management, Timetable, Exam Management, Marks, Fees Management, Report Cards** (all future) — each is an *inbound* future dependency on this feature (they will consume Academic Year data through the narrow interface described in Backend Design); none of them block this feature's own Implementation, and none are touched by this design.
- No blocking dependency remains for this feature.

---

# Risks

- **Accepted Technical Debt (Product Owner decision)**: overlap validation is performed within the application transaction, with no database-level backstop — unlike the Current-designation invariant, which does have one (the partial unique index on `isCurrent`). A database-level solution exists (a PostgreSQL `EXCLUDE` constraint over a `daterange`, requiring the `btree_gist` extension) but is not adopted for this version. If future deployment characteristics introduce high write concurrency for Academic Year operations, the implementation may be upgraded to that `EXCLUDE` constraint — no API or business-rule change would be required, since the constraint would only enforce, at the database layer, the same overlap rule the application already enforces (Business Rule #3). The residual check-then-act race in the meantime is the same class of accepted debt already on record for this project (e.g. Teacher Management's Department-name-uniqueness race, `Code-Review-Report.md`), not a new category of risk. The duplicate-derived-label check (Business Rule #4) has the same shape of gap, for the same reason (no stored label column to index, per Requirement #5), and is covered by this same accepted-debt decision.
- **`setCurrentAcademicYear` is the single required choke point for `isCurrent` writes (Requirement #7).** A future maintainer adding a new code path that writes `isCurrent` directly (bypassing this function) would silently reintroduce the two-Current-years risk the partial unique index only partially guards against (it prevents two *simultaneously stored* Current rows, but a caller could still, e.g., set `isCurrent: false` on the wrong row without also setting another one true, leaving the school with zero Current — which the partial index cannot detect, since it only constrains rows where `isCurrent = true`). Code review at Phase 9 should specifically verify no other write path touches `isCurrent`.
- **(Phase 9 code review, v1.1 — resolved, not merely flagged) Two Critical concurrency findings, both live-reproduced.** (1) `archiveAcademicYear`'s "not Current" fast path read `isCurrent` once, outside any transaction, and acted on that stale read — a concurrent `designateCurrentAcademicYear` on the same record raced past it, producing a record simultaneously `ARCHIVED` and `isCurrent: true`. (2) `createAcademicYear`'s "is this the first Academic Year" check-then-act was unlocked — concurrent first-year creations for the same school produced an uncaught Prisma `P2002` on the losing request (4 of 8 concurrent requests returned 500 in live testing), the same class of gap Subject Management's own Phase 9 review had already found and fixed once (`assignSubjectToSchool`), not carried forward here. **Fixed** by acquiring a Postgres advisory lock scoped to the school (`pg_advisory_xact_lock`) for the full duration of each function's read-decide-write sequence — not a savepoint or P2002 recovery, since a real Postgres statement failure mid-transaction aborts the whole transaction, making "catch and continue in the same transaction" unsound here (unlike Subject Management's non-transactional `assignSubjectToSchool`, where a plain try/catch around the write was sufficient). Both findings independently reconfirmed as fixed against the running server using the identical reproduction steps. See `docs/00-governance/Code-Review-Report.md`.
- **No automated defense against the Current designation becoming empty** (Business Rule #9's "may never become empty") **beyond `archiveAcademicYear`'s own guard.** Since `isCurrent` empty is not something a partial unique index can detect (it constrains at most one `true`, not at least one), this invariant is enforced entirely by application logic having exactly one legitimate path to archive/deactivate a Current Academic Year. Flagged here for Phase 7 Validation to specifically test, not just Phase 9 code review.

---

# Definition of Done

This feature's Implementation is not complete until it satisfies the project's Definition of Done — see `docs/02-standards/Definition-of-Done.md`.

---

# Change History

- v1.0 — Initial Technical Design, following Phase 4 per the Business Specification's Phase 3 (Business Review) approval (`docs/03-business/Academic-Year-Management.md` v1.1, Accepted). Defines the school-scoped `AcademicYear` entity (no stored label, per Requirement #5), the `isCurrent` partial-unique-index pattern reused from Class Management's `isFinal`, and `setCurrentAcademicYear` as the single dedicated transition function per Requirement #7. No new business rule introduced; no business ambiguity uncovered. Awaiting Product Owner approval before Phase 5 (Implementation Planning) begins.
- v1.1 — Independent Phase 9 code review (`docs/00-governance/Code-Review-Report.md`) found and fixed 2 Critical findings, both live-reproduced against the running backend: a concurrent archive + designate-Current race could corrupt a record into simultaneously `ARCHIVED` and `isCurrent: true` (`archiveAcademicYear`'s stale, unlocked read of `isCurrent`); and concurrent first-Academic-Year creations for the same school could 500 (an uncaught Prisma `P2002` on `createAcademicYear`'s unlocked check-then-act). Both fixed with a Postgres advisory lock scoped per school, wrapping each function's entire read-decide-write sequence — the same root-cause fix applied consistently to both `archiveAcademicYear` and `designateCurrentAcademicYear`. A Medium audit-persistence test-coverage gap was also closed. No change to this feature's own Business Rules or data model. Full backend suite: 564/564.
