# Technical Design

Feature: Authentication & Authorization

Version: 1.6

Status: Accepted. Phase 7 Validation and an independent code review both passed (4 Critical + 2 Major findings fixed, 1 Major accepted as tracked debt) — see `docs/08-validation/Authentication-and-Authorization.md` and `docs/00-governance/Code-Review-Report.md`. Amended by ACR-001 (v1.3–v1.5) and by Teacher Management's own Phase 9 code review (v1.6 below); the code changes both imply were delivered via Teacher Management's own lifecycle, not a reopening of this feature's own Feature Acceptance.

---

# Overview

This document designs the technical approach for the Business Specification approved in `docs/03-business/Authentication-and-Authorization.md`.

It applies the already-approved architecture (`System-Architecture.md`, `Folder-Structure.md`), technology stack (`Technology-Decisions.md`: JWT authentication, RBAC authorization, Node.js/Express, PostgreSQL/Prisma), and standards (`Database-Standards.md`, `API-Standards.md`, `Coding-Standards.md`) to this specific feature. No new technology, pattern, or architecture is introduced here.

---

# Architecture

- Implemented as a feature module, per Folder-Structure.md: `backend/src/features/auth/` (controller, service, repository, validation, routes, dto, types, utils, tests).
- Cross-cutting pieces live in the shared locations Folder-Structure.md already designates for them: `backend/src/middlewares/` holds the Authentication middleware (JWT verification) and Authorization middleware (role, permission, and tenant checks); `backend/src/shared/` holds generic, non-business helpers (e.g. token utilities, password-hashing utility). Feature-specific logic (e.g. lockout threshold behavior) stays inside `features/auth/service`, never in shared code, per Folder-Structure.md's rule that shared code carries no business knowledge.
- Every request flows: Authentication middleware → Authorization middleware → feature controller, matching the Business Specification's "Authorization Check" workflow and System-Architecture.md's Security Model.
- Authentication is stateless (JWT), consistent with Technology-Decisions.md's reasoning (mobile-friendly, REST-compatible). No server-side session store is introduced.
- Authorization is role-based (RBAC). Role is a fixed, closed set — consistent with the `UserRole` enum already defined in Naming-Conventions.md (`SUPER_ADMIN`, `SCHOOL_ADMIN`, `ACCOUNTANT`, `TEACHER`, `STUDENT`) — rather than a dynamic, database-driven role/permission table. This follows Decision-Making-Principles' "Avoid Premature Abstraction": nothing in the approved Business Specification requires per-school custom roles today. The role-to-permission mapping (which role may perform which action) is maintained in code/config, not as separate database tables.
- Platform bootstrap (Business Rule #23) is implemented as a Prisma seed script — not an API endpoint — run once at initial deployment, outside the normal request/authorization pipeline. It is idempotent: it checks whether any Super Admin account already exists before creating one.

---

# Database Impact

Conceptual data shape only — field-level schema is a separate Database Design exercise if the Product Owner wants one produced.

- An account entity capturing: a platform-wide unique identifier, a hashed credential (never plain text), role (enum), an owning-school reference (nullable — null only for Super Admin), account status (active / locked / deactivated / must-change-credentials), a failed-login counter and last-failed-attempt timestamp (for lockout), a verified recovery contact reference, and standard `createdAt` / `updatedAt` timestamps per Database-Standards.md.
- The bootstrap Super Admin account is created via Prisma's seed mechanism, reading its email and initial credential from environment configuration (never hardcoded), per Naming-Conventions.md's environment-variable convention. This is the one explicitly-justified exception to Database-Standards.md's "never seed business data unless explicitly required" — the Business Specification requires it. The seed script is idempotent and never creates a second Super Admin if one already exists.
- Relationship: account → school is many-to-one and nullable only for Super Admin, matching Multi-Tenancy.md's tenant-ownership model.
- Deactivation follows Database-Standards.md's Soft Delete Policy and the Archive Before Delete principle: an account is never hard-deleted, only marked inactive.
- Authentication/authorization events are written to the platform's shared audit log mechanism (owned by the Audit Logs feature), not a separate table — consistent with the standard audit record (Tenant, User, Action, Timestamp) defined in Multi-Tenancy.md.
- Indexing: the unique account identifier must be indexed for fast lookup during login, per Database-Standards.md.
- **`deactivatedByOverride` (Boolean, default `false`)** — true only while the account's current `DEACTIVATED` status came from the administrative/security override (Business Rule #25), not from an owning feature's own lifecycle sync; cleared on any reactivation. Added by Teacher Management's Phase 9 code review so an owning feature's routine reactivation can refuse to silently undo a deliberate override (Business Rule #26).

---

# API Design

High-level shape only — exact routes, payloads, and status-code-per-case belong in a separate API Specification if requested.

- REST, versioned under `/api/v1`, per API-Standards.md.
- Conceptual endpoints: login, logout, password-recovery request, password-reset confirmation, authenticated password change, account creation (role-gated — Super Admin creating a School Admin or another Super Admin; School Admin creating staff/Student), account activation/deactivation (role-gated), account unlock (role-gated), role assignment/change (role-gated). The bootstrap Super Admin is not an endpoint at all — it is the seed script described under Architecture and Database Impact.
- **Account activation/deactivation now takes an explicit operation context, per ACR-001 (`docs/01-architecture/Architecture-Decision-Records/ACR-001-Employment-vs-Authentication-Ownership.md`), replacing an earlier "structural, not a runtime flag" framing that a Phase 5 review found unworkable in practice — both callers reach the identical service function, so the distinction must be an explicit, passed value, not an assumption about who's calling.** `deactivateAccount`/`reactivateAccount` accept a context object of the shape `{ source: 'teacher_management' | 'authentication_override', reason: string | null }`: `auth.controller.js`'s own HTTP handlers always set `source: 'authentication_override'` (with `reason` taken from the request body, defaulting to `null`); Teacher Management's internal, in-process call always sets `source: 'teacher_management'`, `reason: null`. A `reason` is required — enforced in the service layer, after the target account is loaded, per Business Rule #25 — only when `source` is `authentication_override` **and** the target account's role is `TEACHER`; every other combination (any `teacher_management` call, or an `authentication_override` call against a non-Teacher account) proceeds without one. This must never write to Teacher Management's `employmentStatus` field — this feature has no reference to that field at all, keeping the two features' data fully decoupled.
- **`auth.validation.js` performs request-shape validation only** (e.g., `reason`, if present, must be a non-empty string) — it has no repository access and cannot know a target account's role, so it never enforces *whether* a reason is required. That role-dependent decision belongs entirely to the service layer, which is the only layer that has already loaded the target account.
- **A `context.source` other than `authentication_override` is refused by `reactivateAccount` while the target account's `deactivatedByOverride` is true** (Business Rule #26) — enforced in the service layer, after the target account is loaded, the same place the reason requirement is enforced. Only a call carrying `source: 'authentication_override'` itself can lift its own override; `deactivateAccount` preserves an already-true `deactivatedByOverride` even when the call itself is `teacher_management`-sourced, so a routine disable reached while already override-deactivated (e.g. `resign`) never silently downgrades the marker.
- Only login, password-recovery request, and password-reset confirmation are public (unauthenticated). Every other endpoint requires a valid JWT plus an authorization check, per API-Standards.md's Authentication/Authorization rules.
- Tenant context for every authorized request comes from the authenticated user, never from client-supplied input, per Multi-Tenancy.md's API Rules.

---

# Backend Design

- New feature module `backend/src/features/auth/`, structured per Folder-Structure.md.
- Controllers coordinate requests only; business logic (lockout rules, role-assignment rules) lives in the service layer; the repository layer is the only code touching Prisma, per Coding-Standards.md.
- Password hashing uses bcrypt; access tokens expire after 15 minutes; refresh tokens are tracked server-side by reference and expire after 7 days — per Security-Standards.md.

---

# Frontend Design

- `web/src/features/auth/` (React/Vite/JavaScript): login page, forgot-password flow, and account-management screens for the roles that use the Web application (Super Admin, School Admin, Accountant), per System-Architecture.md.
- The frontend never re-implements authorization decisions; it only reflects what the backend permits, per System-Architecture.md's Business Logic Ownership rule.

---

# Mobile Design

- `mobile/lib/features/auth/` (Flutter): login and password-recovery screens for the roles that use the Mobile application (Teacher, Student), per System-Architecture.md.
- Same API, same behavior, same rules as Web — no separate business logic on mobile.

---

# Validation Strategy

- All validation happens server-side, in the feature's `validation/` layer, before reaching the service layer — never trust client input, per Coding-Standards.md and API-Standards.md.
- Enforces the Business Specification's Validation Rules directly: platform-wide unique identifier, minimum password strength (algorithm/policy pending Security Standards), a verified recovery contact captured at account creation, exactly one role, exactly one owning school unless Super Admin.

---

# Security Considerations

- Authentication: JWT, per Technology-Decisions.md. Access tokens expire after 15 minutes; refresh tokens are server-tracked by reference and expire after 7 days, per Security-Standards.md.
- Password storage: bcrypt, per Security-Standards.md.
- Authorization: role + permission + tenant ownership checked on every request, tenant context never trusted from the client, per Multi-Tenancy.md.
- Account lockout: 5 consecutive failed attempts trigger a 15-minute automatic lockout, counted per account rather than per IP, per Security-Standards.md — this is the concrete definition of Business Rule #17's "defined cool-down period."
- Logout, deactivation, lockout, and role changes immediately revoke the refresh token; a still-valid access token remains usable only for the remainder of its 15-minute window, per Security-Standards.md's Session and Token Management section.
- Failed-login responses must not reveal whether the identifier or the password was wrong, to avoid account enumeration — a standard security practice, not a new project standard.
- The bootstrap Super Admin's initial credential (from environment configuration) is never logged, and the account cannot perform any action beyond changing its own credentials until it does so, per Business Rule #23.
- There is deliberately no endpoint capable of deactivating, locking, or removing the last remaining Super Admin account, per the Business Specification's Edge Cases — the platform must never be left with zero administrators.
- Per ACR-001, the existing "Account activated"/"Account deactivated" audit events now carry the operation context's `reason` in `metadata` whenever one was supplied — populated for an `authentication_override` call against a Teacher account (where it's required), optionally present for an `authentication_override` call against any other role, and always absent for a `teacher_management` call. This lets the audit trail distinguish an ordinary employment-lifecycle-driven change from an override without a new audit action code and without this feature needing any awareness of Teacher Management's own employment-status concept.

Security-Standards.md has been authored; this section now reflects its concrete requirements, and the gap flagged in the previous version of this document is resolved.

---

# Performance Considerations

- Authentication and authorization run on every request — must be efficient. Avoid unnecessary database round-trips per request; role/permission checks can be resolved from the JWT's claims plus an in-request cache, not a fresh query per check.
- The unique account identifier must be indexed, per Database-Standards.md, since login performance depends on it directly.

---

# Error Handling

- Consistent with API-Standards.md's status codes: 401 for failed authentication, 403 for failed authorization, 422 for validation errors, 404 for a target account that does not exist *or* is outside the caller's authority along a tenant boundary (a School Admin targeting an account in another school) — never a 403 for the latter case, which would confirm the account exists somewhere outside the caller's own tenant, per Multi-Tenancy.md's API Rules. A role-scope mismatch that isn't a tenant boundary (e.g. Super Admin targeting a Teacher/Accountant/Student account directly) remains 403, since Super Admin isn't tenant-bound in the way that matters here. Fixed by Teacher Management's Phase 9 code review — previously the target-not-found case used 401 (`AuthenticationError`, meant for failed authentication, not a missing resource) and the tenant-boundary case used 403.
- Errors never expose internal implementation details, per Coding-Standards.md.

---

# Dependencies

- **School & Platform Management** — approved, with its own completed Technical Design and Implementation Plan. Non-Super-Admin account creation still depends on a school existing to reference, but this is no longer a blocker for either feature, since bootstrap (Business Rule #23) allows Super Admin's own account — and therefore the ability to create the first school — to exist independently of any school.
- **Security Standards** — resolved; Security-Standards.md now exists and its requirements are reflected throughout this document.
- **Audit Logs** — this feature produces audit events from day one; the Audit Logs feature's own review/search capability is scheduled later in the Roadmap but does not block Authentication's own implementation.
- **Teacher Management** — not a dependency for this feature's own (already-complete) Implementation. Per ACR-001, `deactivateAccount`/`reactivateAccount` now have the third, explicit operation-context parameter (`{ source, reason }`); Teacher Management's WP6 delivered it (see Change History v1.5) and WP3's call sites in `teachers.service.js` pass `source: 'teacher_management'`.

---

# Risks

- **Coupling / blast radius** — nearly every other feature depends on this one; changes to its interfaces after Implementation will have wide impact. Extra care is warranted to keep the module's public interface stable, per the Constitution's Loose Coupling principle.
- **Role model rigidity** — the enum-based, fixed-role approach is the simplest solution for what's approved today, but would require a schema migration if the Product Owner later wants per-school custom roles or granular, admin-configurable permissions. Not a current requirement, so not designed for now, per "Avoid Premature Abstraction" — flagged here as a known trade-off, not a defect.
- **ACR-001 code gap — closed.** `backend/src/features/auth/auth.service.js`, `auth.controller.js`, and `auth.validation.js` now implement the `{ source, reason }` operation-context parameter, delivered by Teacher Management's WP6 (its own files/tests, not this feature's — this feature's own Implementation was not reopened). Verified by this feature's existing test suite (still passing, with the one deliberate revision below) plus a new integration suite in `auth.routes.test.js` covering the full override matrix.
- **`auth.service.test.js`'s former "lets a School Admin deactivate a Teacher in their own school" case — revised, not just re-run.** It called `deactivateAccount` with no context at all; under the new default (`{ source: 'authentication_override', reason: null }`), that exact call now correctly rejects for a Teacher target, per Business Rule #25 — the intended effect of an approved business rule, not a regression. Split into a reason-supplied case (succeeds), a reason-omitted case (now correctly rejects), and a Teacher Management-sourced case (succeeds without a reason).

---

# Definition of Done

This feature's Implementation is not complete until it satisfies the project's Definition of Done — see `docs/02-standards/Definition-of-Done.md`.

---

# Change History

- v1.0 — Initial technical design.
- v1.1 — Phase 7 Validation confirmed all 24 Business Rules by code inspection and targeted live/automated testing. One defect found via School & Platform Management's Phase 9 code review: `login`'s school-suspension check (Error Handling's 401 case) revealed a specific, distinguishing message before password verification, contradicting this document's own anti-enumeration intent. Fixed: the check now runs only after password verification succeeds. See `docs/08-validation/Authentication-and-Authorization.md` and `docs/00-governance/Code-Review-Report.md`.
- v1.2 — This feature's own independent code review (Phase 9) found and fixed 4 Critical and 2 Major findings, and accepted 1 Major as tracked debt: two more `login` enumeration oracles (locked account, no-password-set-up); Super Admin bypassing the Teacher/Student/Accountant management restriction; `changeRole` risking tenant-invariant corruption via an undocumented Super-Admin-promotion path (now rejected outright); password-reset tokens logged in plaintext (now gated behind a new `PASSWORD_RESET_DELIVERY_MODE` configuration, `backend/src/config/password-reset.js`, defaulting to `disabled`); refresh tokens not revoked on lockout/role-change (now fixed); the automatic lockout-cooldown unlock not audited (now fixed); per-account rate limiting (accepted as tracked debt — the current limiter is source-IP-only). See `docs/00-governance/Code-Review-Report.md`.
- v1.3 — ACR-001 (`docs/01-architecture/Architecture-Decision-Records/ACR-001-Employment-vs-Authentication-Ownership.md`) approved during Teacher Management's Business Review, amending Authentication-and-Authorization.md's Business Specification to v1.3 (Business Rule #25). Updated API Design, Security Considerations, Dependencies, and Risks to reflect the resulting two-call-shape design for Teacher account activation/deactivation (internal, reason-less call from Teacher Management vs. School-Admin-invoked override requiring a `reason`). Documentation-only; the corresponding code change is scoped into Teacher Management's own Implementation (Phase 6), tracked as a Risk here.
- v1.4 — Teacher Management's Phase 5 (Implementation Planning) review found the v1.3 "structural, not a runtime flag" framing unworkable: both the internal and override callers reach the identical `deactivateAccount`/`reactivateAccount` functions, so no purely structural signal exists to distinguish them, and the framing would have broken an existing regression test. Replaced with an explicit operation-context parameter, `{ source: 'teacher_management' | 'authentication_override', reason }`, set by the caller: `auth.controller.js` always sets `source: 'authentication_override'`; Teacher Management's internal call always sets `source: 'teacher_management'`. Clarified that `auth.validation.js` performs request-shape validation only (is `reason` a non-empty string, if present) and never the role-dependent "is a reason required" decision, which stays in the service layer. Updated API Design, Security Considerations, Dependencies, and Risks accordingly; flagged that the existing `auth.service.test.js` Teacher-deactivation test needs revising (not just re-running) to reflect Business Rule #25's now-enforced behavior.
- v1.5 — Teacher Management's WP6 (Implementation, Phase 6) delivered the code this document had tracked as a gap since v1.3: `assertOverrideReasonProvided` added to `auth.service.js`, `validateAccountOverride` added to `auth.validation.js` (shape-only, per v1.4's design), both controller functions updated to build and pass the `authentication_override` context. `auth.service.test.js`'s pre-ACR-001 Teacher-deactivation test split into three cases (reason-supplied, reason-omitted, Teacher Management-sourced); a new `auth.routes.test.js` "Account activation/deactivation override" suite added, since neither endpoint previously had route-level test coverage at all. This feature's own Feature Acceptance is not reopened — the change is isolated to the override mechanism ACR-001 introduced.
- v1.6 — Teacher Management's Phase 9 independent code review found and fixed two defects in this feature's own code: (1) `assertCanManageAccount` returned 403 for a real cross-tenant account vs. 401 for a nonexistent one — both now 404, and the target-not-found case across `deactivateAccount`/`reactivateAccount`/`unlockAccount`/`changeRole` corrected from `AuthenticationError` (401) to `NotFoundError` (404); (2) a routine reactivating transition could silently undo an active administrative override — added `Account.deactivatedByOverride` and Business Rule #26, enforced by a new `assertNotBlockedByActiveOverride` in `auth.service.js`. Also closed a shared gap this review found: `createAccount`/`createInitialSchoolAdmin` never validated email format, since in-process callers (Teacher Management's Onboarding, Student Management's Admission) bypass `auth.validation.js`'s own `EMAIL_REGEX` entirely — both now call a shared `assertValidEmailFormat`. All fixes covered by new unit tests (`auth.service.test.js`) and integration tests (`auth.routes.test.js`, `teachers.routes.test.js`), and verified live against the running application. See `docs/00-governance/Code-Review-Report.md`.
