# School & Platform Management — Validation Report

Version: 1.0

Status: Passed. One scope gap found and resolved (descoped by Product Owner decision); one finding cross-referenced to Authentication & Authorization's own validation.

Feature: School & Platform Management

Validated against: `docs/03-business/School-Management.md` (v1.0), `docs/06-technical-design/School-Management.md`, `docs/07-implementation-planning/School-Management.md`

Date: 2026-07-14

---

# Method

Hands-on verification via direct API calls (`curl`) against the running backend, using `superadmin@example.com` (Super Admin), `classtest-admin@example.com` and `other-admin@example.com` (School Admins of two different schools, for tenant-isolation and permission checks). One throwaway school was created and driven through its full lifecycle (Suspend → Reactivate → Close → Reopen) solely to exercise these transitions.

---

# Business Rules

| # | Rule | Check performed | Result |
|---|---|---|---|
| 1 | Only Super Admin creates a new school | School Admin → `POST /schools` | 403 — confirmed |
| 2 | Every new school created with exactly one initial School Admin | Code inspection: `createSchool` calls `createInitialSchoolAdmin` in the same transaction-equivalent flow before returning | Confirmed |
| 3 | A school is a fully isolated tenant from creation | Cross-tenant checks below | Confirmed |
| 4 | Only Super Admin suspends/reactivates/closes | Structural: all four lifecycle routes gated `requireRole('SUPER_ADMIN')` | Confirmed |
| 5 | Suspension immediately blocks login for that school's users (except Super Admin); never alters data | Code inspection of `auth.service.js`'s `login` (checks `account.school.lifecycleStatus !== 'ACTIVE'`) and `authenticate` middleware (re-checks on every subsequent request, not just at login) | Confirmed — see also the cross-referenced finding below |
| 6 | Reactivating restores login access | Suspend → Reactivate cycle on a throwaway school | Confirmed |
| 7 | Super Admin never performs day-to-day business operations | Structural: no School/Platform route touches Student/Class/etc. data | Confirmed |
| 8 | Closure follows Archive Before Delete | `closeSchool` only flips `lifecycleStatus`, never deletes the row | Confirmed |
| 9 | Platform-level shared configuration is Super-Admin-only and platform-wide; standard roles are fixed, not user-editable | **Partially unimplemented — see Finding below.** The "fixed roles, not editable" half is true (structural: `UserRole` is a Prisma enum, no route anywhere edits it). The "platform-level shared configuration (system settings, reference data)" half was never built. | Gap found |
| 10 | Platform-wide statistics are Super-Admin-only, aggregate-only | `GET /schools/statistics` → School Admin 403; Super Admin gets `{totalSchools, activeSchools, suspendedSchools, closedSchools}` only, no per-school breakdown | Confirmed |
| 11 | Every lifecycle action is audited | `recordAuditEvent` confirmed at every call site: `SCHOOL_CREATED`, `SCHOOL_PROFILE_UPDATED`, `SCHOOL_SUSPENDED`, `SCHOOL_REACTIVATED`, `SCHOOL_CLOSED`, `SCHOOL_REOPENED`, `SCHOOL_SUBSCRIPTION_STATUS_CHANGED` | Confirmed |
| 12 | Suspension is temporary/reversible; closure is permanent and distinct; reopening ≠ reactivating | Reactivating a Closed school → 409 ("Use the reopen action instead"); Suspending a Closed school → 409 ("must be reopened first"); Reopen → succeeds only from Closed | Confirmed |
| 13 | Subscription status change never auto-suspends | Set `subscriptionStatus: 'EXPIRED'` on an Active school → `lifecycleStatus` remained `ACTIVE` | Confirmed |
| 14 | School Admin updates operational profile only; Super Admin updates core identity only | School Admin → `PATCH /schools/:id/profile` succeeds; School Admin → `PATCH /schools/:id/identity` → 403 | Confirmed |
| 15 | Platform supports more than one Super Admin | Structural: `createAccount` permits Super Admin to create additional `SUPER_ADMIN` accounts; no uniqueness constraint limits this to one | Confirmed |
| 16 | Onboarding requires only name + first School Admin email | `validateCreateSchool` requires exactly these two fields, nothing else | Confirmed |

---

# Finding: Business Rule #9's "platform-level shared configuration" was never implemented

The Business Specification (Scope, Business Rule #9) and the Implementation Plan's own Scope section both state platform-level shared configuration (system settings, reference data such as countries/currencies/languages) is included in this pass. No code implements this: no Prisma model, no service function, no route, anywhere in `backend/src/features/schools/`. Nothing in the rest of the codebase currently reads or needs such data (no feature references a country/currency/language field).

This is a **scope gap**, not a code defect — the existing code does everything it does correctly; it's that a piece of approved scope was never built.

**Resolved**: Product Owner decision — consciously descope platform-level shared configuration from this feature (YAGNI; no approved feature needs it), rather than build it speculatively. `docs/03-business/School-Management.md` (v1.1), `docs/06-technical-design/School-Management.md` (v1.1), and `docs/07-implementation-planning/School-Management.md` (v1.1) all updated accordingly. Tracked as a new backlog feature, **Platform Configuration**, in `docs/00-governance/Development-Roadmap.md`.

---

# Cross-Referenced Finding: school-suspension login message is more specific than the account-existence message it sits next to

`auth.service.js`'s `login` function explicitly documents its own design principle in-line: "Generic message regardless of which check fails, to avoid account enumeration, per Security-Standards.md" — applied to the account-existence/deactivated check. Two lines later, the school-lifecycle check (the code that enforces *this* feature's Business Rule #5) throws a distinct, specific message ("Your school is not currently active") — and does so **before password verification**, meaning it's reachable by anyone who knows or guesses a valid email at a suspended/closed school, without needing the correct password.

This is Authentication & Authorization's code, not School & Platform Management's, so it is not fixed here — it is carried forward to that feature's own Phase 7 Validation / Phase 9 review for a decision, since changing login's error-message ordering is a security-sensitive behavior change, not a mechanical fix.

---

# Permissions & Security

| Check | Expected | Result |
|---|---|---|
| No auth token → `GET /schools` | 401 | 401 — confirmed |
| School Admin → `POST /schools` | 403 | 403 — confirmed |
| Cross-tenant: School Admin B → `GET` School A by ID | 403 (via `assertSameSchool`) | 403 — confirmed. Note: this differs from Class/Student Management's convention of 404 for cross-tenant access; no written standard mandates one over the other (checked `Multi-Tenancy.md` and `Security-Standards.md` — neither specifies), so this is a documented inconsistency, not a confirmed violation. Left to the independent code review's judgment. |
| Duplicate school name | 409 | 409 — confirmed |
| `schoolId`/tenant context always from the authenticated user | Code inspection — no route accepts a client-supplied tenant override | Confirmed |

---

# Regression

General CRUD, lifecycle transitions, and statistics all re-confirmed working after this session's unrelated Class/Student Management fixes (no shared code was touched).

---

# Outcome

All 16 Business Rules confirmed (Business Rule #9 confirmed as revised — shared configuration consciously descoped, not silently dropped). One finding cross-referenced to Authentication & Authorization's own Phase 7 Validation (school-suspension login message). Phase 7 (Validation) is complete.

---

# Feature Acceptance Checklist (Development-Lifecycle.md Phase 9)

Per `docs/02-standards/Definition-of-Done.md`:

| Item | Status |
|---|---|
| Business logic approved | ✅ `docs/03-business/School-Management.md` v1.1, Approved (shared-config descope reflected) |
| Edge cases reviewed | ✅ Business Spec's Edge Cases table; re-verified in this Validation Report |
| Technical design completed | ✅ `docs/06-technical-design/School-Management.md` v1.1 |
| Security considered | ✅ Security Considerations section; re-verified above. One cross-referenced finding (login message specificity) carried to Authentication & Authorization's own review. |
| Validation completed | ✅ This report |
| Development / implementation completed | ✅ Backend + Web, built and working (minus the consciously descoped shared-configuration scope) |
| Standards followed | ✅ Feature-based architecture, repository-only Prisma access, RBAC via `requireRole`/`assertSameSchool`, audit events on every lifecycle action |
| Code is clean | ✅ No code smells identified on inspection during this closeout |
| No known issues remain | ✅ None specific to this feature (the shared-config gap is resolved via conscious descope, not an open issue) |
| Tests passed | ✅ `schools.validation.test.js` + `schools.service.test.js` (unit, 22 tests) and `schools.routes.test.js` (integration, 15 tests) — all passing. See `backend/src/features/schools/*.test.js`. |
| Code reviewed | ✅ Independent review by an isolated agent with no access to this implementation's history. Found 2 Critical + 2 Major findings (one Major shared with Authentication & Authorization's own login code); all fixed, covered by new tests, and verified live against the running application. See `docs/00-governance/Code-Review-Report.md`. |
| Documentation updated | ✅ Business Spec, Technical Design, and Implementation Planning docs all updated this pass |

All items satisfied. Feature Acceptance may proceed.

---

# Amendment (v1.1) — ACR-003

School gained `educationLevels` (`PRIMARY`/`SECONDARY`, defaulting to `[PRIMARY]`), Super-Admin-only, per `docs/01-architecture/Architecture-Decision-Records/ACR-003-School-Education-Levels.md`. This exists to give the future Subject Management feature a stable, narrow interface (`hasEducationLevel`) to validate Subject assignment against — a school can only be assigned Subjects belonging to an Education Level it offers. New Business Rule #17 (appended, not renumbered) in `docs/03-business/School-Management.md` v1.3.

Re-verified for this amendment:
- **Automated**: 12 new backend tests (4 service unit for `updateEducationLevels`, 3 unit for the narrow-interface `hasEducationLevel`, 5 validation unit) plus 5 integration tests in `schools.routes.test.js` — default `[PRIMARY]` on a fresh school; School Admin gets 403; empty array gets 422; Super Admin can grow the set; an attempt to shrink back gets 409 and leaves the record unchanged. Full backend suite: 429/429 passing.
- **Live, in the running Web app (Playwright)**: `SchoolDetailPage`'s "Platform administration" card now shows an "Education Levels offered" Checkbox pair, defaulting to the school's current levels. Growing the set (checking Secondary and saving) succeeds with a success toast and both boxes reflect the new state. Attempting to remove an already-offered level (unchecking Primary and saving) is rejected by the backend with a clear error toast ("Cannot remove Education Level(s) PRIMARY — removal is not supported yet.").
- **Bug found and fixed during this live verification**: the checkbox form did not revert to the school's true persisted levels after a rejected removal — it kept showing the invalid, unsaved attempt (e.g. Primary unchecked) even though the backend had rejected the change and nothing was actually removed. This would have misled a Super Admin into believing a removal succeeded when it hadn't. Fixed in `SchoolDetailPage.jsx`: `saveEducationLevels` now rethrows after showing its error toast, and `EducationLevelsForm`'s save handler catches that rejection and resets its local checkbox state back to `school.educationLevels`. Re-verified live: two consecutive rejected removal attempts now correctly leave both checkboxes reflecting the true persisted state (`[PRIMARY, SECONDARY]`), with the error toast still shown.

No regression to any of the checks this report already covered.
