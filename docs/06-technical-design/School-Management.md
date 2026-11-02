# Technical Design

Feature: School & Platform Management

Version: 1.4

Status: Accepted. Phase 7 Validation and an independent code review both passed — see `docs/08-validation/School-Management.md` and `docs/00-governance/Code-Review-Report.md`. Amended by ACR-003 (`docs/01-architecture/Architecture-Decision-Records/ACR-003-School-Education-Levels.md`) — School gains Education Levels. Also amended, without a formal ACR, by School Schedule Management's additive change to `createSchool`'s own sequencing (see Architecture and Change History below). This feature's own Feature Acceptance is not reopened.

---

# Overview

This document designs the technical approach for the Business Specification approved in `docs/03-business/School-Management.md`.

It applies the already-approved architecture (`System-Architecture.md`, `Folder-Structure.md`), technology stack (`Technology-Decisions.md`), and standards (`Database-Standards.md`, `API-Standards.md`, `Security-Standards.md`) to this specific feature. No new technology, pattern, or architecture is introduced here.

---

# Architecture

- Implemented as a feature module: `backend/src/features/schools/` — Folder-Structure.md already anticipates this exact module name in its feature list.
- School creation must trigger creation of the school's first School Admin account, which is Authentication & Authorization's responsibility. This is a cross-feature interaction: the `schools` feature calls Authentication & Authorization's public service interface (a single "create initial admin account" call), never reaching into that feature's internals — per Decision-Making-Principles' Feature Ownership and Loose Coupling principles.
- The School entity is the tenant record referenced by every other feature (Student, Teacher, Attendance, Fees, etc.) via a `schoolId` foreign key, per Multi-Tenancy.md.
- Standard roles and permissions are not part of this feature's data model — they are the fixed `UserRole` enum owned by Authentication & Authorization, per the Business Specification's Business Rule #9.
- Platform-level shared configuration (system settings, reference data) is explicitly out of scope — descoped per the Business Specification v1.1 (YAGNI; no approved feature needs it) — and is not designed here. Tracked as a future backlog feature, Platform Configuration.
- **School Schedule Management** — `createSchool` now also calls that feature's own narrow interface function (`createDefaultScheduleForSchool`) to create the school's default School Calendar and default "Morning" Shift, in the same transactional/compensating-rollback sequence already used for the first School Admin account (see v1.2's own compensating-rollback fix, extended one step further here). A direct in-process service call, consistent with this feature's existing Authentication & Authorization dependency below — not a shared database transaction, and not a schema change to `School` itself. No formal ACR was raised for this change since it adds no field and changes no Business Rule of this feature; it is purely a sequencing addition to an already-existing creation flow.
- **(ACR-003) `EducationLevel` is a small, fixed, platform-wide enum (`PRIMARY`, `SECONDARY`), not a managed reference list** — consistent with "Avoid Premature Abstraction," since a third level is a genuine schema change the Product Owner would need to approve, not routine data entry. This feature exposes exactly one new narrow-interface read function for Subject Management's future consumption — "does School X currently have Education Level Y" — the same pattern Class Management already established for Student Management (`getClassById`, etc.) and Class Management extended for Student Management again in ACR-002 (`listActiveSectionsForClass`). Subject Management never queries the `schools` table directly.

---

# Database Impact

Conceptual data shape only — field-level schema is a separate Database Design exercise if the Product Owner wants one produced.

- A school entity capturing: a platform-wide unique name/identifier (core identifying information, Super-Admin-editable only), operational profile fields (contact details, academic year settings — School-Admin-editable), a lifecycle status (active / suspended / closed), and a subscription status (e.g., active / trial / expired) tracked as an **independent field**, not derived from lifecycle status — per Business Rule #13, expiration never automatically changes lifecycle status.
- The distinction between "core identifying information" and "operational profile information" (Business Rule #14) is enforced at the service/authorization layer, not necessarily as separate tables — both can live on the same school record, with field-level write permission checked per role.
- "Closed" is a distinct lifecycle status from "suspended," consistent with Business Rule #12; a closed school follows Database-Standards.md's Soft Delete Policy — the record is preserved and marked inactive, never hard-deleted.
- Relationship: School → many Users/Accounts (Authentication & Authorization's entity), matching the `schoolId` relationship already designed there.
- Authentication/authorization-adjacent audit events (school created, suspended, reactivated, closed, subscription changed) are written to the platform's shared audit log mechanism, consistent with the standard audit record (Tenant, User, Action, Timestamp) defined in Multi-Tenancy.md — the same mechanism Authentication & Authorization's Technical Design already uses.
- The unique school name/identifier must be indexed, consistent with Database-Standards.md's indexing guidance and this feature's uniqueness requirement.
- **(ACR-003) `educationLevels` — a non-empty list of `EducationLevel` values (`PRIMARY` / `SECONDARY`), required, defaulting to `[PRIMARY]` at the database level.** A scalar enum array (matching the precedent `Teacher.subjectSpecializations: String[]` already set for a small, bounded, per-record list) rather than a join table — there is no per-value metadata to justify one, per "Avoid Premature Abstraction." Treated as core identifying/structural information (Super-Admin-only write), the same category as the school's name. **Backfill for existing schools**: default to `[PRIMARY]` only, not `[PRIMARY, SECONDARY]` — deliberately the more conservative choice, since *adding* an Education Level is fully supported going forward (Super Admin can always add Secondary later) but *removing* one is not (per ACR-003, out of scope for this version); under-provisioning is recoverable, over-provisioning is not, so the narrower default is the safer one.

---

# API Design

High-level shape only — exact routes, payloads, and per-case status codes belong in a separate API Specification if requested.

- REST, versioned under `/api/v1`, per API-Standards.md.
- Conceptual endpoints: create school (Super-Admin-only; internally invokes Authentication & Authorization's account-creation for the first School Admin), update school core identity (Super-Admin-only), update school operational profile (School Admin or Super Admin, distinct fields from core identity), suspend school, reactivate school, close school, reopen a closed school (a distinct action from reactivate, per Business Rule #12), manage subscription status, view platform-wide statistics (Super-Admin-only, aggregate-only), manage platform-level shared configuration (Super-Admin-only).
- Every endpoint requires a valid JWT and passes through the same Authentication/Authorization middleware chain designed in Authentication & Authorization's Technical Design; no separate authentication mechanism is introduced for this feature.
- Platform-wide statistics endpoints return aggregate data only and must never expose one school's underlying records to another, per the Business Specification's Business Rule #10.
- **(ACR-003) `PATCH /schools/{id}/education-levels` (Super-Admin-only), body `{ educationLevels: EducationLevel[] }`.** A dedicated endpoint, not folded into the existing core-identity or operational-profile update endpoints, since it has its own distinct validation (never empty, only adds — see Validation Strategy) and its own audit action. Always replaces the full set in one request (the client sends the complete desired list, e.g. `["PRIMARY", "SECONDARY"]`, not a single level to add) — simpler than a separate add/remove pair of endpoints while removal remains unsupported; the service layer still enforces "never fewer levels than the school currently has" (see Validation Strategy) even though the wire shape is a full replace.

---

# Backend Design

- New feature module `backend/src/features/schools/`, structured per Folder-Structure.md (controller, service, repository, validation, routes, dto, types, utils, tests).
- The service layer enforces: which role may write which fields (core identity vs. operational profile), that suspension is always a manual action (never derived from subscription status), and that "reopen" (closed → active) is a distinct operation from "reactivate" (suspended → active).
- **(ACR-003)** The Education Level update function rejects a submitted set that is empty, or that omits any level the school already has (an implicit removal) — it only ever grows the set or leaves it unchanged, never shrinks it, per the Business Specification's "removal not supported yet." The narrow-interface read function Subject Management will consume (`hasEducationLevel(schoolId, level)` or equivalent) is a plain, side-effect-free query, added from the outset per this feature's own Future Integration Readiness precedent (mirroring Class Management's).
- School creation's call into Authentication & Authorization's account-creation service is the only cross-feature dependency; it is a direct in-process service call, consistent with System-Architecture.md's Modular Monolith style (not a separate network call).
- Repository layer is the only code touching Prisma, per Coding-Standards.md.

---

# Frontend Design

- `web/src/features/schools/` (React/Vite/JavaScript): school onboarding form, platform statistics dashboard, and suspend/reactivate/close controls — all Super-Admin-only screens.
- The same module's UI also serves School Admin's own operational profile editing, scoped by role: the backend enforces which fields are writable, the frontend simply reflects that per System-Architecture.md's Business Logic Ownership rule.
- Only the Web application is involved — Teacher and Student (the Mobile application's users) have no permissions in this feature, per the Business Specification's Permissions section.

---

# Mobile Design

Not applicable. Teacher and Student — the only roles using the Mobile application, per System-Architecture.md — have no permissions related to school lifecycle or platform-level configuration.

---

# Validation Strategy

- All validation happens server-side, per Coding-Standards.md and API-Standards.md.
- Enforces the Business Specification's Validation Rules directly: school name unique platform-wide, a defined lifecycle status at all times, a first School Admin account required at creation, no operational fields mandatory beyond name and the first School Admin's requirements (per Business Rule #16).
- **(ACR-003)** `educationLevels` must be a non-empty array of valid `EducationLevel` values, with no duplicates. The service layer additionally rejects a submission that would remove a level the school currently has (see Backend Design) — a check that requires loading the current record, so it stays in the service layer, not the shape-only validation layer, mirroring this project's established validation/service split (e.g. Teacher Management's Section-belongs-to-Class check).

---

# Security Considerations

- Every school-lifecycle endpoint requires the Super Admin role, enforced server-side via the same Authentication/Authorization middleware designed in Authentication & Authorization's Technical Design — never trusted from client-supplied role claims, per Security-Standards.md's Authorization Security section.
- School Admin's operational-profile-editing endpoint enforces field-level write restriction on the server; any client-side field graying-out is a convenience only, per Security-Standards.md.
- Every lifecycle-changing action (create, suspend, reactivate, close, reopen, subscription change) produces an audit record, per this feature's Audit Requirements and Security-Standards.md's Auditability section.
- Business Rule #15 (multiple Super Admin accounts) requires no new security design — Authentication & Authorization's role model already allows more than one account to hold the same role.
- **(ACR-003)** The Education Level update endpoint requires the Super Admin role, enforced server-side via the same middleware chain as every other lifecycle endpoint in this feature — never a School-Admin-writable field, unlike operational profile.

---

# Performance Considerations

- Platform-wide statistics aggregate across every school; at scale, this must not be computed as a large unfiltered query per request, per Database-Standards.md's performance guidance. Indexed, aggregate-friendly queries are sufficient at current expected scale; a caching or materialized-view approach is a future optimization, not a current requirement (no school data exists yet).
- The unique school name/identifier must be indexed, since onboarding and lookups depend on it directly.

---

# Error Handling

- Consistent with API-Standards.md's status codes: 403 when a non-Super-Admin role attempts a lifecycle action, 409 for an invalid state transition (e.g., attempting to reactivate a closed school through the ordinary reactivate action instead of the distinct reopen action), 422 for validation errors.
- **(ACR-003)** 422 for an empty `educationLevels` array, an invalid enum value, or a submission that omits a level the school currently has (an implicit, unsupported removal) — all treated as validation errors on the submitted set, not a 409 state-conflict, since there's no ambiguity about current vs. desired state the way a lifecycle transition has.
- Errors never expose internal implementation details, per Coding-Standards.md.

---

# Dependencies

- **Authentication & Authorization** — school creation directly invokes its account-creation service for the first School Admin. Both features are now Approved with completed Technical Designs; because of this tight coupling, Implementation Planning should sequence them together rather than treating them as fully independent, even though they remain separate business features and separate feature modules.
- **Security Standards** — already authored; no gap.
- **(ACR-003) Subject Management** (future) — depends on this feature's Education Levels to validate Subject-to-School assignment. Not a dependency in the other direction: this feature has no reference to Subject data and does not wait on Subject Management's own Implementation.
- **School Schedule Management** — `createSchool` now depends on that feature's `createDefaultScheduleForSchool` narrow interface function, called via direct in-process service call before the first School Admin account is created. Not a dependency in the other direction beyond that one call: this feature has no reference to Calendar/Shift data.
- No other blocking dependencies remain for this feature.

---

# Risks

- **Tight coupling with Authentication & Authorization** — school creation's dependency on account creation should be kept to a single, narrow, stable interface call, per the Constitution's Loose Coupling principle, so that changes to one feature don't ripple unpredictably into the other.
- **Platform statistics at scale** — not a current risk (35+ schools exist from development/testing so far, still small), but flagged for revisiting once real data volume exists, per Performance Considerations above.
- **(ACR-003) Backfill default is a judgment call, not a Product Owner-specified value.** Existing schools default to `[PRIMARY]` on migration, reasoned from asymmetric recoverability (see Database Impact) rather than an explicit instruction — flagged here in case the Product Owner wants a different default applied retroactively via a follow-up data correction.
- **(ACR-003) No removal path for an Education Level** is a deliberate, accepted limitation of this version, not a gap — mirrors this project's existing pattern of shipping a narrower, well-understood capability first (e.g. Class Management's own no-hard-delete stance) rather than speculatively building removal-with-dependency-checking before anything actually depends on Education Levels yet.

---

# Definition of Done

This feature's Implementation is not complete until it satisfies the project's Definition of Done — see `docs/02-standards/Definition-of-Done.md`.

---

# Change History

- v1.0 — Initial technical design.
- v1.1 — Phase 7 Validation found platform-level shared configuration was designed here but never implemented, and nothing needs it. Removed from Architecture, Database Impact, Frontend Design, Security Considerations, Error Handling, and Risks, per the Business Specification's v1.1 descope decision. See `docs/08-validation/School-Management.md`.
- v1.2 — Independent code review (Phase 9) found and fixed: a mass-assignment vulnerability on the operational-profile endpoint (now allow-listed at both validation and service layers); `createSchool` was not transactional, risking a permanent orphan school (now a compensating rollback); and a login information-disclosure inconsistency in Authentication & Authorization's code (message ordering fixed there). See `docs/00-governance/Code-Review-Report.md`.
- v1.3 — ACR-003 (`docs/01-architecture/Architecture-Decision-Records/ACR-003-School-Education-Levels.md`): added `School.educationLevels` (non-empty `EducationLevel[]`, Super-Admin-only, defaults to `[PRIMARY]` for existing schools on migration), a dedicated `PATCH /schools/{id}/education-levels` endpoint (full-replace shape, but the service layer rejects any submission that would remove a currently-held level), and a new narrow-interface read function for Subject Management's future consumption. No change to this feature's existing lifecycle/identity/profile design.
- v1.4 — School Schedule Management (Accepted) added a call to that feature's `createDefaultScheduleForSchool` narrow interface function inside `createSchool`, creating the school's default School Calendar and default "Morning" Shift in the same creation sequence as the first School Admin account. A sequencing addition to Architecture and Dependencies only — no schema change, no new endpoint, no Business Rule change to this feature itself, and no formal ACR raised.
