# Technical Design

Feature: Subject Management

Version: 1.1

Status: Approved. Implementation (Phase 6) and Validation (Phase 7) complete. An independent code review (Phase 9) found and fixed 2 Major findings — see `docs/00-governance/Code-Review-Report.md` and this document's own Change History.

---

# Overview

This document designs the technical approach for the Business Specification approved in `docs/03-business/Subject-Management.md` (v1.1, Accepted). It applies the already-approved architecture (`System-Architecture.md`, `Folder-Structure.md`), technology stack (`Technology-Decisions.md`), and standards (`Database-Standards.md`, `API-Standards.md`, `Security-Standards.md`) to this specific feature. No new technology, pattern, or architecture is introduced here.

This design stays entirely within the approved Business Specification's Business Rules. No new business rule is introduced anywhere below; every design decision either directly implements an existing Business Rule or is a pure implementation-mechanism choice (storage shape, endpoint shape, error-code mapping) that the Business Specification deliberately left open (per its own Business Decisions Required, resolved in v1.1: exact field list and dependency-validation mechanism are both Technical Design's to decide).

No genuine business ambiguity was uncovered while producing this design — every decision below resolves cleanly against the approved Business Specification. No Architecture Question is raised.

---

# Architecture

- Implemented as a feature module: `backend/src/features/subjects/` — Folder-Structure.md already anticipates this exact module name in its feature list (backend and web both).
- **Subject is this project's first platform-wide, non-tenant-scoped domain entity** (Business Rule #12) — every other feature module (`schools`, `students`, `teachers`, `classes`) owns records scoped to exactly one `schoolId`. Subject Management deliberately breaks that pattern: the `Subject` table carries no `schoolId` at all; only the assignment join (`SchoolSubject`, see Database Impact) is tenant-scoped. This is a direct implementation of Business Rule #12, not a new architectural precedent invented here.
- Subject-to-School assignment is validated against the target School's Education Levels through School & Platform Management's existing narrow interface, `schoolsService.hasEducationLevel(schoolId, level)` (already implemented as part of ACR-003 — see `docs/06-technical-design/School-Management.md` v1.3, Backend Design). Subject Management never queries the `schools` table directly, per Business Rule #6 and this project's established Loose Coupling pattern (ACR-001, ACR-002, ACR-003).
- **Dependency-validation extension point** (Business Rule #8, Business Workflow #5.2–5.3) is designed as an in-process registry, not a stub function: `subjects.service.js` exports `registerRemovalDependencyCheck(name, checkFn)`, where `checkFn` is an async function `(schoolId, subjectId) => string | null` — returning a human-readable blocking reason, or `null` if that checker has no objection. `removeSubjectFromSchool` runs every registered checker in sequence before performing the removal, and rejects with the first non-null reason returned. This satisfies the Business Specification's explicit requirement that "a future dependent feature can register its own check without Subject Management needing to change its own removal logic" (Workflow #5.3) without writing any of those future checkers now — the registry starts empty, per Requirement #6 (design the extension point, not the future academic modules). Every feature module is `require`d by `app.js` before the server starts listening (per this project's existing bootstrap order), so a future dependent feature's own module-level `registerRemovalDependencyCheck(...)` call is guaranteed to run before any HTTP request can reach the removal endpoint — no explicit initialization-order coordination is needed beyond what already exists.
- Standard roles and permissions are not part of this feature's data model — Super Admin / School Admin remain the fixed `UserRole` enum values owned by Authentication & Authorization, enforced the same way every other feature enforces them (`requireRole`).

---

# Database Impact

Conceptual data shape only — field-level schema is a separate Database Design exercise if the Product Owner wants one produced.

- **`Subject`** — the platform-wide catalog entity (Business Rule #12):
  - `name` (string, required) and `educationLevel` (the existing `EducationLevel` enum — `PRIMARY` / `SECONDARY` — added to the schema by ACR-003; reused here, not redefined).
  - `status` (a new `SubjectStatus` enum, `ACTIVE` / `ARCHIVED`, defaulting to `ACTIVE`), following the exact naming convention already established by `ClassStatus` (`ACTIVE` / `ARCHIVED`) — per Business Rules #4 and #5, Archive Before Delete, never a third state.
  - A composite uniqueness constraint on `(name, educationLevel)` — the direct implementation of Business Rule #3's per-Education-Level uniqueness scoping. Two Subjects named "English" can coexist only because they differ on `educationLevel`.
  - No `schoolId` field — Subject is not owned by any school, per Business Rule #12.
  - **Field list beyond name and Education Level**: none, for this version. The Business Specification's Business Decisions Required (v1.1) explicitly left this open as a Technical Design decision; per "Avoid Premature Abstraction" and "Simplicity Wins" (Decision-Making-Principles #15, #2), no consumer of Subject data exists yet that needs a short code, description, or any other field beyond what Business Rule #3's uniqueness check already requires. Adding a field later (e.g., a short code, once Timetable or Report Cards need a compact display form) is a straightforward additive migration, not a breaking change to this design.
  - Never hard-deleted, regardless of `status`, per Business Rule #4 and Database-Standards.md's Soft Delete Policy.
- **`SchoolSubject`** — the tenant-scoped assignment join, modeling "this School currently has this Subject":
  - `schoolId` (FK to `School`) and `subjectId` (FK to `Subject`), each indexed — `schoolId` for the School Admin read-access query (Business Rule #10, Workflow #6), `subjectId` for future dependent features' own lookups (Business Rule #9).
  - `assignedAt` (timestamp) and `assignedById` (the acting Super Admin's user id) — captures who assigned it and when, feeding the Audit Requirements' assignment event without a second, redundant audit-only table.
  - `removedAt` (nullable timestamp) and `removedById` (nullable) — **the assignment row is soft-removed, never hard-deleted**, consistent with Database-Standards.md's project-wide Soft Delete Policy (already applied to every other lifecycle-bearing record in this system — Schools, Classes, Students, Teachers). This is a storage-mechanism choice, not a new business rule: the Business Specification only commits to "removal" as a concept (Business Rule #8) and to every assignment change being audited (Business Rule #11); preserving the row instead of deleting it is how this feature satisfies that audit requirement without a separate audit-only table, exactly the same reasoning School & Platform Management already used for its own lifecycle events.
  - A composite uniqueness constraint on `(schoolId, subjectId)` — covering the row's entire lifetime, not just its currently-active state. Re-assigning a Subject after a prior removal reactivates the same row (clears `removedAt`/`removedById`, refreshes `assignedAt`/`assignedById`) rather than inserting a second row for the same pair — this keeps the uniqueness constraint simple (no partial/filtered index needed) while still preserving the full assign → remove → reassign history implicitly through the timestamp fields.
  - "Currently assigned" is defined as `removedAt IS NULL`; every read path (School Admin's own list, Super Admin's platform view, the `hasEducationLevel`-style narrow interface future features will consume) filters on this.
- Both new tables follow the existing `id String @id @default(uuid())` convention used throughout this schema.
- **Audit events use the existing shared `AuditLog` table as-is — no schema change needed there.** `AuditLog.schoolId` is already nullable ("some platform-level actions ... have no school"), added for the bootstrap Super Admin event and directly reusable here: Subject creation/update/archive/reactivate write a `null`-`schoolId` audit record (Subject is platform-wide, per Business Rule #12), while Subject assignment/removal write the target School's `schoolId`, per Business Rule #11's per-event Tenant field. The six audit actions are `SUBJECT_CREATED`, `SUBJECT_UPDATED`, `SUBJECT_ARCHIVED`, `SUBJECT_REACTIVATED`, `SUBJECT_ASSIGNED_TO_SCHOOL`, `SUBJECT_ASSIGNMENT_REMOVED`, one per event in the Business Specification's Audit Requirements, following this project's existing `FEATURE_EVENT` naming convention.

---

# API Design

High-level shape only — exact routes, payloads, and per-case status codes belong in a separate API Specification if requested.

- REST, versioned under `/api/v1`, per API-Standards.md.
- **Subject catalog (Super Admin only)**:
  - `POST /subjects` — create a Subject (`name`, `educationLevel`).
  - `PATCH /subjects/{id}` — update a Subject's editable fields (`name`; `educationLevel` only if the Subject currently has zero School assignments, per Business Rule #2 — enforced in the service layer, not shape validation).
  - `PATCH /subjects/{id}/archive` — archive (idempotent no-op if already Archived, per Business Rule #4).
  - `PATCH /subjects/{id}/reactivate` — reactivate (idempotent no-op if already Active, per Business Rule #4).
  - `GET /subjects` — the full, platform-wide catalog, optionally filterable by `educationLevel` and/or `status` (query params) — Super Admin only, per Business Rule #10.
- **Subject-to-School assignment**: modeled as discrete, explicit actions (per Business Rule #7's "two independent, explicitly separate actions" — a full-replace-array shape, like ACR-003's own Education Levels endpoint, would make "which removal was rejected by dependency validation" awkward to report back to the client):
  - `POST /schools/{schoolId}/subjects/{subjectId}` — assign (Super Admin only; idempotent no-op if already currently assigned, per Business Rule #7/Workflow #4.3; rejected if the School lacks the Subject's Education Level, per Business Rule #6; rejected if the Subject is Archived, per Business Rule #5).
  - `DELETE /schools/{schoolId}/subjects/{subjectId}` — remove (Super Admin only; runs the dependency-validation registry, per Business Rule #8, before soft-removing the `SchoolSubject` row).
  - `GET /schools/{schoolId}/subjects` — list a school's currently-assigned Subjects, including each Subject's current `status` so an Archived-but-still-assigned Subject is clearly marked, per Business Rule #5. Accessible to Super Admin for any school, and to School Admin for their own school only (same tenant-isolation enforcement mechanism already established elsewhere in this project), per Business Rule #10.
- Every endpoint requires a valid JWT and passes through the same Authentication/Authorization middleware chain already designed in Authentication & Authorization's Technical Design; no new authentication mechanism is introduced.

---

# Backend Design

- New feature module `backend/src/features/subjects/`, structured per Folder-Structure.md (controller, service, repository, validation, routes, dto, types, utils, tests) — the same shape every prior feature module already follows.
- The service layer enforces every data-dependent Business Rule this feature owns: Education Level immutability once assigned (Business Rule #2), Archived-Subject assignment rejection (Business Rule #5), the `hasEducationLevel` check against School & Platform Management's narrow interface (Business Rule #6), assignment idempotency (Business Rule #7), and the dependency-validation registry walk before removal (Business Rule #8).
- `registerRemovalDependencyCheck(name, checkFn)` (see Architecture) is exported from `subjects.service.js` alongside the feature's own public functions, so a future dependent feature's own service module can `require('../subjects/subjects.service').registerRemovalDependencyCheck(...)` at its own module load time — the same shape as every other narrow-interface export already used in this project (e.g. `hasEducationLevel`, `listActiveSectionsForClass`), just inverted: here, dependents push a check in, rather than Subject Management pulling data out.
- Repository layer is the only code touching Prisma, per Coding-Standards.md. `SchoolSubject` reads always filter `removedAt: null` for "currently assigned" queries; a separate repository function (not exposed by any route in this version) can read the full history including removed rows, for a future audit/reporting need.
- Subject Management's own service layer calls School & Platform Management's `hasEducationLevel(schoolId, level)` as a direct in-process function call, consistent with System-Architecture.md's Modular Monolith style — the same pattern School & Platform Management itself already established when it added that function for this exact purpose (ACR-003).
- **(Phase 9 code review, v1.1)** `assignSubjectToSchool`'s check-then-act sequence (look up an existing assignment, then create or reactivate one) is a genuine race under concurrent identical requests — live-reproduced (2 of 15 truly concurrent requests returned an unhandled 500 from a raw Prisma `P2002` unique-constraint collision). Fixed by catching `P2002` specifically around the create/reactivate call and re-fetching the concurrent winner's row as the same idempotent success the non-concurrent already-assigned path already returns (no duplicate audit write). The database's `(schoolId, subjectId)` unique constraint remains the real backstop, per Database-Standards.md's "protect the database itself" — this fix only makes the *application's* response to that backstop being hit a clean success instead of a raw 500.

---

# Frontend Design

- `web/src/features/subjects/` (React/Vite/JavaScript):
  - A Super-Admin-only `SubjectsListPage` — the platform-wide catalog, filterable by Education Level and status, with create/edit/archive/reactivate actions, following the same list-page conventions already established by `TeachersListPage` and `SchoolsListPage`.
  - Subject-to-School assignment is managed from the School's own detail page — a new "Subjects" section added to `SchoolDetailPage.jsx`'s existing Super-Admin-only "Platform administration" card (the same location the Education Levels checkbox form (ACR-003) was added), listing currently-assigned Subjects with an assign/remove control, following the same pattern.
- **School Admin's read-only view**: a new, simpler page (e.g. `MySubjectsPage`) showing only the Subjects assigned to their own school, reusing the same `GET /schools/{schoolId}/subjects` endpoint scoped implicitly to their own `schoolId` from the token — no write affordance anywhere on this page, per Business Rule #1.
- Only the Web application is involved — Teacher and Student (the Mobile application's users) have no permissions in this feature, per the Business Specification's Actors and Permissions sections.

---

# Mobile Design

Not applicable. Teacher and Student — the only roles using the Mobile application, per System-Architecture.md — have no permissions related to Subject definition, lifecycle, or School assignment, per the Business Specification's Actors section.

---

# Validation Strategy

- All validation happens server-side, per Coding-Standards.md and API-Standards.md.
- **Shape-only validation** (no database read required): `name` is a required non-empty string; `educationLevel` must be one of the existing `EducationLevel` enum values (`PRIMARY` / `SECONDARY`) — the same shape-validation pattern already used for School & Platform Management's Education Levels endpoint (ACR-003). **(Phase 9 code review, v1.1)** `GET /subjects`'s own `status`/`educationLevel` query filters are shape-validated the same way, before reaching the service layer — a gap found during code review (an invalid filter previously reached Prisma unvalidated and surfaced as an unhandled 500), fixed to match Teacher/Student Management's own list-endpoint validation.
- **Service-layer, data-dependent validation** (requires loading current state, per this project's established validation/service split — e.g. Teacher Management's Section-belongs-to-Class check, School & Platform Management's Education Level removal check):
  - Duplicate `(name, educationLevel)` rejected at creation (Business Rule #3).
  - `educationLevel` update rejected once the Subject has at least one currently-assigned School (Business Rule #2) — checked by counting non-removed `SchoolSubject` rows for that Subject.
  - Assignment rejected if the target School currently lacks the Subject's Education Level (Business Rule #6, via `hasEducationLevel`).
  - Assignment rejected if the Subject's `status` is `ARCHIVED` (Business Rule #5).
  - Removal rejected if any registered dependency checker returns a blocking reason (Business Rule #8).

---

# Security Considerations

- Every Subject-catalog and assignment write endpoint (create, update, archive, reactivate, assign, remove) requires the Super Admin role, enforced server-side via the same Authentication/Authorization middleware chain every other feature already uses — never trusted from client-supplied role claims, per Security-Standards.md's Authorization Security section.
- `GET /schools/{schoolId}/subjects` enforces the same tenant-isolation mechanism already established elsewhere in this project for a School Admin accessing their own school's data (`assertSameSchool` or equivalent) — a School Admin requesting another school's `schoolId` must be rejected, never silently scoped down.
- `GET /subjects` (the platform-wide catalog) is Super-Admin-only; School Admin has no route that returns catalog data beyond their own school's current assignments, per Business Rule #10.
- Every write action produces an audit record, per this feature's Audit Requirements and Security-Standards.md's Auditability section.

---

# Performance Considerations

- The Subject catalog is expected to remain small and curated (tens, not thousands, of records — Super Admin manually defines each one, per the Business Specification's explicit descope of bulk import), so no special indexing or pagination strategy is required beyond the composite uniqueness index already needed for Business Rule #3.
- `SchoolSubject` is indexed on both `schoolId` and `subjectId` independently (Database Impact) to keep both read directions — "this school's Subjects" and a future "which schools have this Subject" — efficient without a table scan.

---

# Error Handling

Consistent with API-Standards.md's status codes, and this project's established convention (School & Platform Management's ACR-003 endpoint) of using 422 for shape-only problems and 409 for state-dependent conflicts:

- 422 — missing/empty `name`, invalid `educationLevel` enum value; **(Phase 9 code review, v1.1)** an invalid `status` or `educationLevel` value on `GET /subjects`'s own query filters (previously an unhandled 500).
- 409 — duplicate `(name, educationLevel)` on creation; an `educationLevel` update attempted while the Subject has at least one School assignment; assigning an Archived Subject; assigning a Subject to a School that lacks the required Education Level; a removal blocked by the dependency-validation registry.
- 403 — a non-Super-Admin role attempting any write action; a School Admin requesting another school's assigned-Subjects list.
- 404 — Subject or School not found, including cross-tenant access to `GET /schools/{schoolId}/subjects` for a `schoolId` that isn't the requesting School Admin's own — following the newer, more common convention already adopted by Class and Student Management (404 rather than School Management's own 403, an already-documented, pre-existing inconsistency across this codebase per `docs/08-validation/School-Management.md`; not introduced or resolved by this design).
- Errors never expose internal implementation details, per Coding-Standards.md.

---

# Dependencies

- **School & Platform Management** — Subject-to-School assignment is validated through its existing `hasEducationLevel` narrow interface (ACR-003, already implemented). This is a one-directional dependency: School & Platform Management has no reference to Subject data and does not wait on this feature's own Implementation.
- **Authentication & Authorization** — every endpoint depends on its existing role-enforcement middleware; no new authentication mechanism.
- **Class Management, Teacher Management, Timetable, Exams, Marks, Report Cards** (all future) — each is an *inbound* future dependency on this feature (they will consume Subject data and register their own removal-dependency checks), not the other way around; none of them block this feature's own Implementation.
- No blocking dependency remains for this feature.

---

# Risks

- **The dependency-validation registry currently has zero registered checkers.** Removal always succeeds today (Business Rule #8's own stated interim behavior) — this is expected, not a defect, but worth flagging so a future reviewer doesn't mistake an always-succeeding removal for a missed check.
- **Registry initialization-order dependency**, mitigated but not eliminated by this design: a future dependent feature must remember to call `registerRemovalDependencyCheck` at its own module load time (not lazily, inside a request handler) for its check to be active before any request is served. Flagged here for that future feature's own Technical Design to explicitly follow, mirroring how this design itself documents the requirement rather than leaving it implicit.
- **`SchoolSubject`'s soft-delete-and-reactivate shape** (reusing one row across assign → remove → reassign cycles, rather than a fresh row each time) trades a small amount of historical granularity (the exact previous `assignedAt`/`assignedById` from before a removal is overwritten on reassignment) for a simpler uniqueness constraint. If a future reporting need requires full historical granularity (every discrete assign/remove event, not just the current cycle), that is a future reconsideration, not a decision made now, consistent with "Avoid Premature Abstraction."

---

# Definition of Done

This feature's Implementation is not complete until it satisfies the project's Definition of Done — see `docs/02-standards/Definition-of-Done.md`.

---

# Change History

- v1.0 — Initial Technical Design, following Phase 4 per the Business Specification's Phase 3 (Business Review) approval (`docs/03-business/Subject-Management.md` v1.1, Accepted). Defines the `Subject` (platform-wide catalog) and `SchoolSubject` (tenant-scoped assignment join, soft-removable) entities, the dependency-validation extension point as an in-process registry, and the full API/validation/security/error-handling design. No new business rule introduced; no business ambiguity uncovered. Awaiting Product Owner approval before Phase 5 (Implementation Planning) begins.
- v1.1 — Independent Phase 9 code review (`docs/00-governance/Code-Review-Report.md`) found and fixed 2 Major findings, both live-reproduced against the running backend: `assignSubjectToSchool`'s check-then-act sequence raced under concurrent identical requests, surfacing an unhandled 500 (Prisma `P2002`) instead of the intended idempotent success — fixed by catching the collision and recovering the concurrent winner's row; and `GET /subjects`'s query filters had no shape validation, surfacing an unhandled 500 for an invalid `status`/`educationLevel` value — fixed with a new `validateListSubjects`, matching Teacher/Student Management's own list-endpoint convention. A pre-existing test-coverage gap (no test proving Education Level unlocks after a Subject's only assignment is removed, despite the Implementation Plan's own Risk Assessment calling for one) was also closed. No change to this feature's own Business Rules or data model. Full backend suite: 503/503.
