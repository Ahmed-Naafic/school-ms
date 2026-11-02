# Technical Design

Feature: Teacher Management

Version: 1.7

Status: Approved (Phase 4 approved by Product Owner). Implementation (Phase 6) complete: all 8 work packages, including ACR-001 (WP6) and the Completion Review's transactional-atomicity fix. Phase 7 (Validation) complete. Phase 9 (independent code review) complete. **v1.7: Department entirely removed** by post-Acceptance Product Owner decision — see Change History and `docs/03-business/Teacher-Management.md` v1.4.

---

# Overview

This document designs the technical approach for the Business Specification approved in `docs/03-business/Teacher-Management.md`.

It applies the already-approved architecture (`System-Architecture.md`, `Folder-Structure.md`), technology stack (`Technology-Decisions.md`), and standards (`Database-Standards.md`, `API-Standards.md`, `Security-Standards.md`, `Naming-Conventions.md`) to this specific feature. No new technology, pattern, or architecture is introduced here.

This feature also carries ACR-001 (`docs/01-architecture/Architecture-Decision-Records/ACR-001-Employment-vs-Authentication-Ownership.md`): Authentication & Authorization's own `{ source, reason }` operation-context parameter for Teacher account activation/deactivation. **Implemented as of WP6 (Phase 6)** — see Dependencies and Risks below.

---

# Architecture

- Implemented as a feature module: `backend/src/features/teachers/` — Folder-Structure.md already anticipates this exact module name in its feature list (backend, web, and mobile all already list `teachers/`/`teacher/`).
- Onboarding triggers Authentication & Authorization's account-creation service for the new Teacher's login account (role `TEACHER`), via the same narrow, one-directional interface call Student Management already uses for `STUDENT` — never reaching into that feature's internals, per Decision-Making-Principles' Feature Ownership and Loose Coupling.
- **Employment status and account status are modeled as two entirely separate fields on two separate entities, per ACR-001 and Business Rules #4/#5.** `Teacher.employmentStatus` (this feature's own field) and `Account.status` (Authentication & Authorization's own field, already in the schema) are never merged or derived from one another at the data layer. The synchronization Business Rule #5 requires is implemented as one-directional behavior in this feature's service layer: each employment-status transition function calls Authentication & Authorization's existing activate/deactivate functions as its last step. Authentication & Authorization's own code has no awareness of `employmentStatus` at all — the coupling only ever runs in this feature's direction, matching how Student Management's Transfer/Withdrawal/Graduation already call the same deactivation service without Authentication & Authorization knowing about `StudentStatus`.
- **This feature always identifies its own calls with an explicit operation context, `{ source: 'teacher_management', reason: null }`, per ACR-001 (revised after a Phase 5 review found an earlier "structural, not a runtime flag" framing unworkable — both this feature's internal call and School Admin's direct override reach the identical Authentication & Authorization function, so the distinction must be an explicit, passed value).** Every call from `teachers.service.js` into `authService.deactivateAccount`/`reactivateAccount` passes this exact context; Authentication & Authorization's service layer uses `source` to know a reason is never required for this feature's own calls, regardless of the target's role. This feature never passes `source: 'authentication_override'` — that value is reserved for Authentication & Authorization's own controller, used only when School Admin invokes the override endpoint directly.
- Each of the five employment-status transitions named in the Business Specification (Return from Leave, Resign, Rehire, Terminate, Retire) plus the initial Onboarding transition into Active is implemented as its own named service function with its own allowed-from-status guard — the same "named transition, not a generic status setter" pattern Student Management already established for Promote/Transfer/Withdraw/Restore/Graduate. A single generic `setEmploymentStatus(id, anyStatus)` function is deliberately not provided, since it would let a caller skip a transition's specific guard (e.g., reaching `TERMINATED` without ever having been `ACTIVE`) or its specific account-sync behavior. See the Employment Status Transition Matrix below for every allowed transition.
- **Guard by construction: `PATCH /teachers/{id}` (the general profile-update endpoint) never accepts `employmentStatus`, `employeeId`, `schoolId`, or `accountId` in its request DTO — these four fields are structurally absent from that endpoint's payload shape, not merely rejected by a runtime check.** `employmentStatus` may only be written by the six named transition service functions (Onboarding plus the five named transitions), each of which also performs the corresponding Authentication & Authorization synchronization call in the same operation, per Business Rule #5. Without this exclusion, the profile-update path could otherwise be used to change a Teacher's employment status without triggering the account-synchronization side effect or passing through any transition's allowed-from-status guard — silently reproducing, on this feature's own side of ACR-001's boundary, the exact employment/account divergence ACR-001 was created to prevent on Authentication's side. `employeeId` is immutable per Business Rule #8; `schoolId` and `accountId` are structural, set once at Onboarding and never re-assignable by any client request, consistent with Multi-Tenancy.md's "tenant ownership must never be optional" and Database-Standards.md's "primary keys must never contain business meaning" reasoning extended to identity-defining foreign keys.
- A Teacher's "subject specializations" (Business Rule #11) are stored as plain descriptive data (a list of strings), not a foreign key to any Subject entity — Subject Management does not exist yet, and per the Business Specification's own Relationships section this is deliberately descriptive information, not a functional assignment, avoiding the exact placeholder-model anti-pattern the Roadmap has already called out twice (Class Management ahead of Student Management; Teacher Management itself in its own Purpose section).
- **Future Integration Readiness:** Timetable, Attendance, and Exam Management (none built yet) will each eventually need to reference a Teacher. Per Decision-Making-Principles' Feature Ownership and Loose Coupling, and mirroring Class Management's Technical Design — which explicitly designed a narrow public interface (`getClassById`, `getSuggestedNextClass`, `getFinalClass`) anticipating Student Management as a future consumer before Student Management itself existed — those future features must consume Teacher Management through a small, narrow read interface (e.g., "get Teacher by ID," "is this Teacher currently Active") rather than querying the `teachers` table directly or duplicating Teacher data into their own schema. This feature's own Implementation should expose that interface from the outset, even though no consumer exists yet, so Timetable/Attendance/Exam Management's own future Technical Design work does not have to modify this feature's internals to gain read access.

---

## Employment Status Transition Matrix

Every allowed `employmentStatus` transition is listed below. **Any transition not listed in this table is rejected** with a 409 Conflict (see Error Handling) — there is no generic status setter, and no transition is permitted by omission or inference.

| Endpoint | Allowed From Status | To Status | Account Sync (Business Rule #5) |
|---|---|---|---|
| `POST /teachers` (Onboarding) | *(none — record creation)* | `ACTIVE` | Account created and enabled |
| `PATCH /teachers/{id}/leave` | `ACTIVE` | `ON_LEAVE` | No account change |
| `PATCH /teachers/{id}/return-from-leave` | `ON_LEAVE` | `ACTIVE` | Account enabled |
| `PATCH /teachers/{id}/resign` | `ACTIVE`, `ON_LEAVE` | `RESIGNED` | Account disabled |
| `PATCH /teachers/{id}/rehire` | `RESIGNED` | `ACTIVE` | Account enabled |
| `PATCH /teachers/{id}/terminate` | `ACTIVE`, `ON_LEAVE` | `TERMINATED` | Account disabled |
| `PATCH /teachers/{id}/retire` | `ACTIVE`, `ON_LEAVE` | `RETIRED` | Account disabled |

- **`TERMINATED` and `RETIRED` are terminal states**, per Business Rule #6: no endpoint transitions a Teacher out of either. Attempting any transition endpoint against a `TERMINATED` or `RETIRED` Teacher is rejected — including `rehire`, which only accepts `RESIGNED` as its source status.
- **Validation order, for every transition endpoint:** (1) the target Teacher's current `employmentStatus` is checked against the table's "Allowed From Status" column — a mismatch is rejected before anything else happens; (2) only once that guard passes does the service layer persist the new `employmentStatus`; (3) the Authentication & Authorization account-synchronization call (per Business Rule #5's mapping) happens after the new status is persisted, in the same transaction/operation, so persistence and synchronization always succeed or fail together, per Database-Standards.md's Transactions section — never a state where one happened and the other did not.
- `resign`, `terminate`, and `retire` all accept `ACTIVE` or `ON_LEAVE` as their source status, since the Business Specification does not restrict any of these three outcomes to only one prior state; this is the Technical Design's own completion of Business Workflow #4's generic "School Admin changes a Teacher's employment status among Active, On Leave, Resigned, Terminated, and Retired," not a new business rule — Business Rule #6 already settles which transitions are reversible (`ON_LEAVE` → `ACTIVE`, `RESIGNED` → `ACTIVE`) and which are terminal (`TERMINATED`, `RETIRED`).

---

# Database Impact

Conceptual data shape only — field-level schema is a separate Database Design exercise if the Product Owner wants one produced.

- A **Teacher** entity capturing the following fields, each marked required or optional per Database-Standards.md's "columns should be required unless there is a valid business reason for allowing NULL":
  - `schoolId` — required. Owning-school reference; every Teacher belongs to exactly one school, per Multi-Tenancy.md.
  - `accountId` — required, unique. Reference to the Teacher's own Account (Authentication & Authorization's entity, one-to-one, same pattern as Student), set once at Onboarding.
  - `employeeId` — required, system-generated, unique within `schoolId`, immutable after creation, per Business Rule #8.
  - `fullName` — required.
  - `contactPhone` — optional. One of the two approved personal contact fields the Teacher may self-edit, per Business Rule #10.
  - `contactAddress` — optional. The other approved personal contact field.
  - `joiningDate` — required. An Onboarding always records when employment began.
  - `employmentType` — optional, a plain string (see Risks for why this is not an enum yet).
  - `qualifications` — optional, a plain string.
  - `subjectSpecializations` — optional, a string list (defaults to an empty list).
  - `relevantExperience` — optional, a plain string.
  - `employmentStatus` — required, defaults to `ACTIVE` (`TeacherEmploymentStatus` enum: `ACTIVE` / `ON_LEAVE` / `RESIGNED` / `TERMINATED` / `RETIRED`, PascalCase enum name and UPPER_SNAKE_CASE values per Naming-Conventions.md's Enums section, matching `StudentStatus`'s existing pattern).
  - `createdAt` / `updatedAt` — required, standard timestamps per Database-Standards.md.
- Terminated and Retired are terminal `employmentStatus` values, never a separate `deletedAt` column — the status field itself is the soft-delete signal, per Business Rule #7 and Database-Standards.md's Soft Delete Policy, the same approach `StudentStatus` and `ClassStatus` already use.
- No hard-delete operation exists anywhere in this feature's repository layer for a Teacher record, regardless of `employmentStatus` — consistent with Business Rule #7 and matching Class Management's precedent of providing no delete endpoint at all for a Class or Section.
- Relationship: Teacher → School is many-to-one, required. Teacher → Account is one-to-one, required. No relationship to Class, Subject, Department, or Timetable exists in this feature's own schema, per the Business Specification's Scope (v1.4 removed the Department relationship entirely).
- Uniqueness constraints, per Database-Standards.md's "protect the database itself, not only via application validation": `employeeId` unique within `schoolId` (not platform-wide).
- Teacher lifecycle audit events are written to the platform's shared audit log mechanism, consistent with the standard audit record (Tenant, User, Action, Timestamp) defined in Multi-Tenancy.md — the same mechanism every other feature's design already uses. An employment-status change's audit record additionally carries the previous status, the new status, and an optional reason in its `metadata` field, per Business Rule #13 and the standard audit record's existing `metadata` column — the same pattern Student Management's Class Correction audit already uses.
- Indexing: `schoolId` on Teacher (every roster/listing query and the uniqueness constraint above are scoped to it); `schoolId` + `employmentStatus` together on Teacher, since roster filtering by employment status is an expected query shape, per Database-Standards.md's indexing guidance.

---

# API Design

High-level shape only — exact routes, payloads, and per-case status codes belong in a separate API Specification if requested.

- REST, versioned under `/api/v1`, per API-Standards.md. Resource name is plural: `/teachers`, consistent with Naming-Conventions.md's API Endpoints section.
- Conceptual endpoints: onboard a Teacher (`POST /teachers`, School-Admin-only; internally invokes Authentication & Authorization's account-creation), read a single Teacher (`GET /teachers/{id}`, School-Admin-only, tenant-scoped — returns 404 if the Teacher does not belong to the caller's own school, never leaking another school's data, consistent with every other resource in this API), update a Teacher's profile (`PATCH /teachers/{id}`, School-Admin-only, covering employment and professional information), and one endpoint per named employment-status transition — `PATCH /teachers/{id}/leave`, `PATCH /teachers/{id}/return-from-leave`, `PATCH /teachers/{id}/resign`, `PATCH /teachers/{id}/rehire`, `PATCH /teachers/{id}/terminate`, `PATCH /teachers/{id}/retire` — mirroring Student Management's promote/transfer/withdraw/restore-withdrawal/graduate pattern, itself following School & Platform Management's suspend/reactivate/close/reopen precedent for state-transition actions; see the Employment Status Transition Matrix under Architecture for exactly which source status each accepts. A Teacher roster/list endpoint (`GET /teachers`, School-Admin-only, paginated and filterable by `employmentStatus` per API-Standards.md) and a Teacher's own record endpoints (`GET /teachers/me`, `PATCH /teachers/me` — restricted to approved personal contact fields — both Teacher-only) round out the Teacher surface.
- **`PATCH /teachers/{id}`'s request DTO excludes `employmentStatus`, `employeeId`, `schoolId`, and `accountId` entirely — these fields do not exist in that endpoint's accepted shape.** `employmentStatus` is writable only by the six transition endpoints above; `employeeId`, `schoolId`, and `accountId` are never writable by any client request after Onboarding. A request body containing any of these four fields on `PATCH /teachers/{id}` is rejected with a 422, per Validation Strategy.
- **(Removed v1.7)** This section previously documented `/departments` reference-list endpoints. Removed entirely by Product Owner decision — see `docs/03-business/Teacher-Management.md` v1.4 and this document's Change History.
- Every endpoint requires a valid JWT and passes through the same Authentication/Authorization middleware chain designed in Authentication & Authorization's Technical Design; no separate authentication mechanism is introduced.
- `GET /teachers/me` and `PATCH /teachers/me` resolve the Teacher from the authenticated user's own token — never from a client-supplied `teacherId` — so a Teacher can never view or edit another Teacher's record by manipulating a request, per Multi-Tenancy.md's API Rules and Business Rule #12.
- `PATCH /teachers/me`'s request shape includes only the approved personal contact fields (`contactPhone`, `contactAddress`); any other field present is rejected by validation, per Business Rule #10 and the Validation Strategy below — the same mass-assignment protection precedent from School & Platform Management's Phase 9 code review finding.

---

# Backend Design

- New feature module `backend/src/features/teachers/`, structured per Folder-Structure.md (controller, service, repository, validation, routes, dto, types, utils, tests).
- `TeacherController`, `TeacherService`, `TeacherRepository`, per Naming-Conventions.md's Services/Repositories/Controllers sections.
- The service layer enforces: `employeeId`, `schoolId`, and `accountId` are set once at Onboarding and are never accepted by the update-profile function's own DTO at all — not merely rejected at runtime, but absent from the type the function accepts, the same "guard by construction" applied to `employmentStatus` below; each employment-status transition function checks its own specific allowed-from-status precondition, per the Employment Status Transition Matrix under Architecture (e.g., `returnFromLeave` only succeeds from `ON_LEAVE`, `rehire` only from `RESIGNED`, `resign`/`terminate`/`retire` only from `ACTIVE` or `ON_LEAVE`), rejecting with a 409 before any write occurs if the precondition fails; only once the precondition passes does the function persist the new `employmentStatus` and then, in the same operation, call Authentication & Authorization's activate/deactivate service per Business Rule #5's mapping (`ACTIVE` → activate; `ON_LEAVE` → no account call; `RESIGNED`/`TERMINATED`/`RETIRED` → deactivate) — persistence always happens before the Authentication & Authorization call, and both happen within the same transaction, per Database-Standards.md's Transactions section; `PATCH /teachers/me` writes only the approved personal contact fields, rejecting any other field present in the request body.
- Onboarding's call into Authentication & Authorization's account-creation service, and each employment-status transition's call into its activate/deactivate service, are this feature's only cross-feature dependencies — direct in-process service calls, consistent with System-Architecture.md's Modular Monolith style, not network calls.
- Repository layer is the only code touching Prisma, per Coding-Standards.md.

---

# Frontend Design

- `web/src/features/teachers/` (React/Vite/JavaScript): Teacher roster (list, filterable by employment status), Onboarding form, employment-status transition controls, and profile editing — all School-Admin-only screens, per the Business Specification's Permissions section and System-Architecture.md's Applications section (School Admin is a Web-only role).
- The frontend never re-implements any employment-status transition's allowed-from-status guard or the account-synchronization default; it only reflects what the backend returns and enforces, per System-Architecture.md's Business Logic Ownership rule.
- No Teacher-facing screen exists in the Web application — Teacher is exclusively a Mobile-application role, per System-Architecture.md, the same split Student Management already established for Student.

---

# Mobile Design

- `mobile/lib/features/teacher/` (Flutter) — Folder-Structure.md already anticipates this exact module name: a read-only screen showing the authenticated Teacher's own profile and employment information (Business Workflow #6), plus an edit screen limited to the two approved personal contact fields (`contactPhone`, `contactAddress`).
- No other field is editable from this screen — employment information, professional information, and employment status are rendered read-only, per Business Rule #10; the same restriction is enforced server-side regardless of what the client sends, per Validation Strategy below.
- Same API, same behavior, same rules as any other client — no separate business logic on Mobile, per System-Architecture.md.

---

# Validation Strategy

- All validation happens server-side, in the feature's `validation/` layer, before reaching the service layer — never trust client input, per Coding-Standards.md and API-Standards.md.
- Enforces the Business Specification's Validation Rules directly: a Teacher cannot be onboarded without an owning school; `employmentStatus` always has a defined value, defaulting to `ACTIVE`; `employeeId` is never accepted in a create-time client payload beyond triggering generation, and never accepted at all in any update payload; `PATCH /teachers/me` accepts only `contactPhone` and `contactAddress` — any other field present in the request body is rejected with a 422, the same whitelist-not-blacklist approach used to close the mass-assignment vulnerability found in School & Platform Management's code review.
- **`PATCH /teachers/{id}` accepts only profile fields (`fullName`, `contactPhone`, `contactAddress`, `joiningDate`, `employmentType`, `qualifications`, `subjectSpecializations`, `relevantExperience`) — a request body containing `employmentStatus`, `employeeId`, `schoolId`, or `accountId` is rejected with a 422**, the same whitelist approach applied to `PATCH /teachers/me`, closing the gap the first Technical Design Review identified.
- For every employment-status transition endpoint, validation of the allowed-from-status precondition (per the Employment Status Transition Matrix) always runs before persistence, and persistence always completes before the Authentication & Authorization synchronization call — an out-of-order failure (e.g., synchronizing the account before confirming the transition is even valid) is not an acceptable implementation, per Database-Standards.md's Transactions section.

---

# Security Considerations

- Every endpoint requires authentication, role permission, and tenant (school) ownership checks, in that order, per Security-Standards.md's Authorization Security section — identical middleware chain to every other feature, no new mechanism introduced.
- `GET /teachers/me` and `PATCH /teachers/me` derive the Teacher's identity strictly from the authenticated token, never a client-supplied identifier, per Security-Standards.md's Authorization Security section and Multi-Tenancy.md's API Rules — this is the specific control preventing one Teacher from viewing or editing another's record (an IDOR-class risk if implemented naively), the same control `/students/me` already relies on.
- Teacher personal, employment, and professional information is sensitive/PII data; it is handled only within this feature's own module and is never duplicated into another feature's data, per Security-Standards.md's Sensitive Data Protection section.
- Every Teacher lifecycle event (Onboarding, profile update, employment-status change, reinstatement) produces an audit record, per this feature's own Audit Requirements and Security-Standards.md's Auditability section. An employment-status change's audit record additionally carries the previous status, the new status, and an optional reason, per Business Rule #13.
- Account activation/deactivation triggered by an employment-status transition immediately revokes or restores the Teacher's refresh-token eligibility, per Authentication & Authorization's and Security-Standards.md's Session and Token Management section — no new revocation mechanism is introduced here; this feature only triggers the existing one, exactly as Student Management already does for Transfer/Withdrawal/Graduation.
- **This feature's own code never disables a Teacher's account for any reason other than the six named employment-status transitions above**, and every such call identifies itself with `{ source: 'teacher_management', reason: null }` (see Architecture). The administrative/security override path ACR-001 approved (School-Admin-invoked via `auth.controller.js`, `source: 'authentication_override'`, `reason`-required for a Teacher target) is Authentication & Authorization's own endpoint, not reimplemented here — see Dependencies for the code gap this still has on that side.

---

# Performance Considerations

- The Teacher roster endpoint must be paginated, per API-Standards.md's Pagination rule — a school-wide unfiltered Teacher list is not an acceptable query shape at scale.
- `schoolId` + `employmentStatus` should be indexed together, since roster and dashboard queries are expected to filter on both, per Database-Standards.md's indexing guidance.

---

# Error Handling

- Consistent with API-Standards.md's status codes: 403 when a non-School-Admin role attempts a management action or a Teacher attempts to access another Teacher's record, 404 when `GET /teachers/{id}` or any `{id}`-based endpoint targets a Teacher outside the caller's own school (never a 403 that would confirm the record exists in another tenant), 409 for any employment-status transition not listed in the Employment Status Transition Matrix for the Teacher's current status (e.g., `return-from-leave` on a Teacher who is not `ON_LEAVE`, or any transition attempted on a `TERMINATED`/`RETIRED` Teacher) or a duplicate `employeeId` within a school, 422 for validation errors (including a `PATCH /teachers/{id}` or `PATCH /teachers/me` request containing any disallowed field, per Validation Strategy).
- Errors never expose internal implementation details, per Coding-Standards.md.

---

# Dependencies

- **Authentication & Authorization** — Accepted, with a completed Technical Design (v1.4, amended by ACR-001 during this feature's own Business Review and refined during this feature's own Phase 5 review). Onboarding and every employment-status transition call into its account-creation and activate/deactivate functions respectively, always passing `{ source: 'teacher_management', reason: null }`. **ACR-001 code gap closed (WP6):** `backend/src/features/auth/auth.service.js`, `auth.controller.js`, and `auth.validation.js` now implement the `{ source, reason }` operation-context parameter, verified by both unit tests (`auth.service.test.js`, `auth.validation.test.js`) and a new integration suite (`auth.routes.test.js`'s "Account activation/deactivation override" block) covering the full matrix: Teacher override with/without reason, non-Teacher targets, the permission matrix, tenant isolation, and the Teacher Management-sourced call path end-to-end.
- **School & Platform Management** — Accepted, with a completed Technical Design. Every Teacher belongs to a school this feature creates and keeps active. No blocker.
- **Class Management, Subject Management, Timetable, Attendance Management, Exam Management** — no dependency in either direction at this stage. This feature does not reference Class, Subject, or Timetable data (subject specializations are stored as plain descriptive strings, per Architecture above), and none of those features are required for this feature's own Implementation. Per Architecture's Future Integration Readiness note, when Timetable, Attendance Management, or Exam Management are eventually built, they must consume this feature through a narrow read interface (e.g., "get Teacher by ID," "is this Teacher currently Active") rather than querying the `teachers` table directly — this feature's own Implementation should expose that interface from the outset.
- **Security Standards** — already authored; no gap.
- **Audit Logs** — this feature produces audit events from day one; the Audit Logs feature's own review/search capability is scheduled later in the Roadmap but does not block this feature's own Implementation, consistent with how every prior feature's design already treats this.

---

# Risks

- **ACR-001 code gap — closed (WP6).** The `{ source, reason }` operation-context parameter is implemented, per Dependencies above.
- **Existing Authentication & Authorization test revision — done.** `auth.service.test.js`'s pre-ACR-001 Teacher-deactivation test was split into the reason-supplied (succeeds), reason-omitted (now correctly rejects, per Business Rule #25), and Teacher Management-sourced (succeeds without a reason) cases.
- **Employment Type, Qualifications, Subject Specializations, and Relevant Experience field shape** — Business Rule #11 explicitly leaves the exact field list for Employment and Professional Information to this Technical Design. This document models them as simple nullable/descriptive fields (a plain string for Employment Type, a string list for Subject Specializations) rather than richer structures (enumerated Employment Type values, multiple structured Qualification entries), consistent with "Simplicity Wins" and "Avoid Premature Abstraction" — if the Product Owner later wants structured or enumerated versions of these fields, that is a schema migration, not a redesign.
- **No reinstatement path for Terminated or Retired** — this is correct, not a gap: Business Rule #6 makes both permanent within this feature, exactly mirroring Student Management's Transfer/Graduation permanence, with the same explicitly-tracked limitation (no in-application correction path until Administrative Corrections, a backlog feature, is designed and built).

---

# Definition of Done

This feature's Implementation is not complete until it satisfies the project's Definition of Done — see `docs/02-standards/Definition-of-Done.md`.

---

# Change History

- v1.0 — Initial technical design, following Business Specification and Business Review approval (`docs/03-business/Teacher-Management.md` v1.2, Accepted).
- v1.1 — First Technical Design Review returned "Requires Revision" (1 Critical, 2 Major, 3 Minor, 2 Suggestion findings). All resolved: (Critical) `PATCH /teachers/{id}` now explicitly excludes `employmentStatus`, `employeeId`, `schoolId`, and `accountId` from its accepted DTO, closing the account-synchronization bypass the review identified; (Major) added the Employment Status Transition Matrix, specifying every allowed transition, that any transition not listed is rejected, that `TERMINATED`/`RETIRED` are terminal, and that validation precedes persistence which precedes Authentication synchronization; (Major) added `GET /teachers/{id}`, tenant-scoped and School-Admin-only; (Minor) named the `employeeId` field explicitly and specified required/optional status for every Teacher field; (Minor) defined `GET /departments`'s archived-entry behavior (excluded by default, `?includeArchived=true` for the management screen); (Suggestion) added a Future Integration Readiness note directing Timetable/Attendance Management/Exam Management toward a narrow read interface, mirroring Class Management's precedent for Student Management. A second Technical Design Review found one further Minor issue, fixed in this same version: `PATCH /departments/{id}` now also excludes `status`/`schoolId` from its DTO, consistent with the same guard-by-construction principle applied to Teacher, since archiving is only reachable through the dedicated `/archive` endpoint. Approved.
- v1.2 — Phase 5 (Implementation Planning) review found that this document's "structural, not a runtime flag" description of the internal-vs-override distinction was unworkable: both callers reach the identical Authentication & Authorization function, and the framing would have broken an existing regression test if implemented literally. Replaced throughout with an explicit operation-context parameter, `{ source: 'teacher_management', reason: null }`, that this feature always passes on every call into Authentication & Authorization. Updated Architecture, Security Considerations, Dependencies, and Risks accordingly, matching Authentication & Authorization's own Technical Design v1.4.
- v1.3 — WP6 (Implementation, Phase 6) delivered the `{ source, reason }` operation-context parameter in `backend/src/features/auth/`, and updated every WP3 call site in `backend/src/features/teachers/teachers.service.js` to pass `{ source: 'teacher_management', reason: null }`. The ACR-001 code gap tracked since v1.1 is closed; Dependencies and Risks updated accordingly.
- v1.4 — Phase 6 Completion Review found the Architecture and Employment Status Transition Matrix's "same transaction/operation, so persistence and synchronization always succeed or fail together" guarantee was not actually implemented — `onboardTeacher` and every employment-status transition performed two independent, sequential writes, with no rollback if the second (Authentication & Authorization) call failed after the first had already committed. Fixed by wrapping both writes in a genuine `prisma.$transaction`, per `teachers.repository.js`/`auth.repository.js` gaining an optional `tx` parameter on the functions this required. This document's own correctness claim is now actually true, not just documented.
- v1.5 — Phase 7 Validation found this document's own Error Handling section ("409 for... a duplicate `employeeId` or Department name within a school") was not actually implemented for Department: `createDepartment`/`updateDepartment` had no uniqueness precheck, so a name collision reached Prisma's constraint unguarded and surfaced as an unhandled 500. Fixed by adding `findDepartmentByName` to `teachers.repository.js` and a precheck in both service functions, mirroring `classes.service.js`'s existing pattern for the identical situation. Phase 7 re-run and closed: Accepted.
- v1.6 — Phase 9 independent code review (`docs/00-governance/Code-Review-Report.md`) found three Major issues, none requiring a change to this feature's own code: (1) Onboarding accepted a syntactically invalid email with no format check anywhere in the call chain, since `onboardTeacher` calls `authService.createAccount` in-process, bypassing `auth.validation.js`'s own route-level check — fixed in Authentication & Authorization's `createAccount`/`createInitialSchoolAdmin` (a shared root cause also affecting Student Management), not here. (2) The ACR-001 override endpoints leaked cross-tenant account existence via a 401-vs-403 status-code distinction — fixed in Authentication & Authorization, unrelated to this feature's own tenant-isolation logic (already verified correct). (3) A routine Return from Leave/Rehire could silently undo an active administrative override — fixed via a new `Account.deactivatedByOverride` field and Authentication-and-Authorization.md Business Rule #26; this feature's own Business Rules and code are unchanged, but a new integration test (`teachers.routes.test.js`) exercises the fix end-to-end through this feature's own transition endpoints, and the corresponding Edge Case was added to Teacher-Management.md (v1.3). All three fixes verified live and covered by new automated tests; full suite (419 tests) passing. Phase 9 complete.
- v1.7 — Post-Acceptance Product Owner decision (`docs/03-business/Teacher-Management.md` v1.4): Department removed entirely, not renamed. Domain clarification established that the school organizes around curriculum Subjects, needed by multiple future modules (Subject Management, Class Management, Timetable, Exams, Marks, Report Cards) — a Department/Subject entity inside Teacher Management would duplicate the future Subject Management feature. Removed: the `Department` entity and `DepartmentStatus` enum from Database Impact; `Teacher.departmentId`; all `/departments` API endpoints; Department-specific Backend Design, Validation Strategy, Security Considerations, Performance Considerations, and Error Handling text; the "Department is deliberately per-school" Risk. This reaches into already-shipped code (this feature completed Phase 6/7/9 before this change) — see `backend/prisma/migrations/` for the corresponding schema migration and `docs/00-governance/Development-Roadmap.md` for the full removal record.
