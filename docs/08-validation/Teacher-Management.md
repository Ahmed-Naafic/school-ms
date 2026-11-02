# Validation Report

Feature: Teacher Management

Version: 1.2

Status: Accepted. All 14 Business Rules, Permissions, Security, Validation & Error Handling, and Regression checks pass. The one Major finding from v1.0 (Department name-uniqueness error handling) has been fixed and re-verified. See Outcome. **v1.2 note: Department (including former Business Rule #9, referenced throughout this report) was removed entirely by a post-Acceptance Product Owner decision** — see `docs/03-business/Teacher-Management.md` v1.4 and `docs/00-governance/Development-Roadmap.md`. This report is left as a historical, point-in-time record of what was actually validated and is not rewritten; it is superseded for anything Department-related.

Validated against: `docs/03-business/Teacher-Management.md` v1.2, `docs/06-technical-design/Teacher-Management.md` v1.4, `docs/07-implementation-planning/Teacher-Management.md` v1.1.

Date: 2026-07-19

---

# Method

Two complementary passes, consistent with how Class-Management.md and Student-Management.md were validated:

1. **Automated regression suite** — the full backend suite (18 suites, 401 tests: `teachers.validation.test.js`, `teachers.service.test.js`, `teachers.routes.test.js`, `teachers.self-service.routes.test.js`, plus the ACR-001 additions to `auth.service.test.js`/`auth.validation.test.js`/`auth.routes.test.js`, and every pre-existing suite for School & Platform Management and Authentication & Authorization) re-run immediately before this validation pass: **401/401 passing**.
2. **Independent hands-on verification** — a fresh set of scripted scenarios exercising the real Express app, real database, and real service/repository code end-to-end (via `supertest` against the actual `app` instance, the same transport the integration tests use, chosen over literal `curl` only because the dev-mode password-reset token is observable solely via `console.log` on the handling process). This is independent of, and supplements rather than repeats, the suite in (1): it walks fresh scenarios built directly from the Business Specification's numbered Business Rules and Edge Cases, not from the existing test files. Two brand-new School Admins (different schools, for tenant-isolation checks), three brand-new Teachers, and one Department were created from scratch and driven through onboarding, every entry in the Employment Status Transition Matrix, Department archiving, self-service, and the ACR-001 administrative-override path. 63 individual assertions were made across 3 scripted runs (split into separate Node processes to respect the password-reset rate limiter's 5-requests/15-minute budget, the same constraint the automated suite itself works around by splitting `teachers.self-service.routes.test.js` into its own file).
3. The backend dev server (port 4000) and frontend dev server (port 5173) were confirmed running and healthy; the Teacher Management UI (Teachers list, Onboard dialog, employment-status transitions, Departments page) was already verified hands-on via Playwright during Implementation (WP8) — not repeated here, since Phase 7 targets the business logic and API surface, and no frontend code changed since that verification.

---

# Business Rules

| # | Business Rule | Check Performed | Result |
|---|---|---|---|
| 1 | Only School Admin may onboard a Teacher into their own school | Onboarded a Teacher as School Admin; confirmed a second School Admin (different school) gets 404 reading it; Teacher role itself gets 403 attempting to onboard | Pass |
| 2 | A Teacher belongs to exactly one school | Every Teacher created scoped to `actingUser.schoolId`; no client-supplied school on create | Pass |
| 3 | Every onboarded Teacher is issued individual login credentials via Authentication & Authorization's existing mechanics | Onboarding created a working `Account` (role `TEACHER`); completed the standard password-reset/initial-credential-setup flow and logged in successfully | Pass |
| 4 | Teacher Management owns the employment lifecycle; Authentication & Authorization's account action is reserved for administrative/security override (ACR-001) | Confirmed `PATCH /teachers/{id}` structurally rejects `employmentStatus` (422); confirmed the six named transition endpoints are the only path that changes it; confirmed Authentication's override endpoint (`PATCH /auth/accounts/{id}/deactivate`) is a fully separate path | Pass |
| 5 | Employment-status changes synchronize account status by default (Active→enable, On Leave→unchanged, Resigned/Terminated/Retired→disable); override only via ACR-001, which requires a reason, is audited, and never touches `employmentStatus` | Verified account enabled/disabled at every transition; verified On Leave leaves the account logged-in-capable; verified the ACR-001 override requires a reason for a Teacher target (422 without one), succeeds with one, disables login without changing `employmentStatus`, and reactivation restores login without touching `employmentStatus` | Pass |
| 6 | Return from Leave and Rehire are reversible; Terminated and Retired are permanent (no reinstatement) | Exercised On Leave→Active and Resigned→Active; confirmed `return-from-leave` and `rehire` both rejected (409) against a Terminated Teacher, and `rehire` rejected (409) against a Retired Teacher | Pass |
| 7 | Terminated/Retired records are archived and retained permanently, never hard-deleted | Read a Terminated Teacher's record after the transition — still present and readable; no delete endpoint exists in the routes | Pass |
| 8 | Every Teacher gets a system-generated, immutable, school-scoped Employee/Staff ID | Confirmed `employeeId` (format `EMP-XXXXXXXX`) generated at Onboarding; confirmed `PATCH /teachers/{id}` rejects a client-supplied `employeeId` (422) | Pass |
| 9 | Department is optional, controlled-list only, School Admin-owned, Archive Before Delete | Created, archived a Department; confirmed archived entries excluded from default `GET /departments` and included with `?includeArchived=true`; confirmed an archived Department is rejected for new assignment (409, `ConflictError`) while an existing Teacher record referencing it remains valid; confirmed a non-existent Department reference is rejected (404); confirmed a duplicate Department name within a school is rejected (409) on both create and rename, while the same name is allowed across two different schools — see Validation & Error Handling below | Pass |
| 10 | Only School Admin may update employment/professional information; Teacher self-service is limited to approved personal contact fields | Confirmed Teacher can update `contactPhone`; confirmed Teacher's own `PATCH /teachers/me` rejects `employmentStatus`, `qualifications`, and `fullName` (422 each) | Pass |
| 11 | Teacher profile has four categories (Personal, Employment, Professional, System Information) | Confirmed onboarding payload and returned record carry `fullName`/`contactPhone`/`contactAddress` (Personal), `employeeId`/`joiningDate`/`employmentStatus`/`employmentType`/`departmentId` (Employment), `qualifications`/`subjectSpecializations`/`relevantExperience` (Professional), and `accountId`/`schoolId`/`createdAt`/`updatedAt` (System) | Pass |
| 12 | A Teacher may access only their own profile; never another Teacher's record | Confirmed `GET/PATCH /teachers/me` resolve from the token; confirmed a Teacher gets 403 on `GET /teachers` (roster) and 403 reading another Teacher by id | Pass |
| 13 | Every lifecycle event and Department change is recorded for audit | `recordAuditEvent` calls present at every service function exercised (Onboarding, profile update, every transition, Department create/update/archive) — confirmed by code inspection of `teachers.service.js`, consistent with the automated suite's own audit-event assertions | Pass |
| 14 | No payroll, salary, leave-balance, performance-review, contract, or tax fields modeled | Confirmed absent from the Prisma schema, DTOs, and every request/response payload observed | Pass |

---

# Permissions & Security

| Check | Result |
|---|---|
| Unauthenticated request rejected (401) | Pass |
| Super Admin has no operational access to the Teacher roster (403) — consistent with School-Management.md's "Super Admin never part of day-to-day operations" | Pass |
| Teacher role blocked from School-Admin-only actions: onboarding (403), roster listing (403), reading another Teacher (403), changing their own employment status (403) | Pass |
| School Admin cannot read, edit, or transition a Teacher belonging to another school (404, not 403 — never confirms existence in another tenant) | Pass |
| School Admin cannot modify a Department belonging to another school (404) | Pass |
| `GET/PATCH /teachers/me` resolve strictly from the authenticated token, never a client-supplied id (IDOR check) | Pass |
| ACR-001 override endpoint requires a reason for a Teacher target and is independently audited by Authentication & Authorization, per Business Rule #25 there | Pass |
| Guard by construction: `employmentStatus`, `employeeId`, `schoolId`, `accountId` all rejected (422) on `PATCH /teachers/{id}`; `status`/`schoolId` rejected on `PATCH /departments/{id}` (per Technical Design, verified via automated suite) | Pass |

---

# Validation & Error Handling

| Check | Result |
|---|---|
| Duplicate Teacher onboarding email rejected | Pass (409) |
| `employeeId` rejected on profile update | Pass (422) |
| `employmentStatus`, `schoolId`, `accountId` rejected on profile update | Pass (422 each) |
| Non-existent Department reference rejected | Pass (404) |
| Archived Department rejected for new assignment | Pass (409, `ConflictError` — correctly distinct from the 404 a genuinely non-existent Department gets) |
| Any transition not listed in the Employment Status Transition Matrix rejected | Pass (409) — verified `rehire` from `ON_LEAVE` and `return-from-leave` from `ACTIVE` |
| Transition attempted against a Terminated/Retired Teacher rejected | Pass (409) |
| Teacher self-service payload with a disallowed field rejected | Pass (422) |
| ACR-001 override without a reason, against a Teacher target, rejected | Pass (422) |
| Duplicate Department name within the same school (create and rename) | Pass (409) — fixed, see below |
| Same Department name permitted across two different schools | Pass (201 for both) |
| Renaming a Department to its own current name (no false self-conflict) | Pass (200) |

**Finding (Major, resolved): duplicate Department name was not handled, contradicting the approved Technical Design.**

`docs/06-technical-design/Teacher-Management.md`'s Error Handling section states: "409 for... a duplicate `employeeId` or Department name within a school." `POST /departments` with a name already used in the same school instead threw an unhandled `PrismaClientKnownRequestError` (`P2002`, unique constraint on `(schoolId, name)`), caught only generically by the global error handler as `500 Internal Server Error` — not the documented `409`.

- **Root cause:** `teachers.service.js`'s `createDepartment` (and `updateDepartment`, sharing the same `(schoolId, name)` constraint on a rename) called `repository.createDepartment`/`repository.updateDepartment` directly with no pre-check, unlike this project's own established pattern for the identical situation — `classes.service.js`'s `createClass`/`updateClass` (Class Management, already Accepted) call `repository.findByName` first and throw `ConflictError` before ever reaching Prisma.
- **Fix applied:** added `findDepartmentByName(schoolId, name)` to `teachers.repository.js`; `createDepartment` and `updateDepartment` in `teachers.service.js` now precheck and throw `ConflictError` (→ 409) on a match, mirroring `classes.service.js` exactly. `updateDepartment`'s check excludes the Department's own current row (`existing.id !== departmentId`), so renaming to the same name is not a false conflict. Scoped correctly to `(schoolId, name)` — the same name is still permitted across two different schools.
- **Verification:** 7 new automated tests added (3 unit — `teachers.service.test.js`: duplicate-on-create rejected, duplicate-on-rename rejected, no false self-conflict; 4 integration — `teachers.routes.test.js`: duplicate create returns 409 not 500, duplicate rename returns 409 not 500, self-rename succeeds, same name across two schools both succeed). Full suite now 408/408. Also re-confirmed hands-on against the real running app in a fresh process (create → 201, duplicate create → 409 with a clean message, rename-to-duplicate → 409), not just via the test suite.

---

# Regression

| Area | Result |
|---|---|
| Full backend automated suite (18 suites / 408 tests, spanning Authentication & Authorization, School & Platform Management, Class Management, Student Management, and Teacher Management — 401 pre-existing plus 7 new for the Department name-uniqueness fix) | Pass — 408/408 |
| Authentication & Authorization's pre-existing account activate/deactivate behavior for non-Teacher roles (Student, School Admin, Super Admin) | Pass — unaffected by ACR-001's `{ source, reason }` addition; `source` defaults such that every pre-existing call site's behavior is unchanged, verified by the untouched, still-passing tests for those paths |
| Student Management's onboarding/transition endpoints | Pass — untouched by this feature; full suite green |
| No cross-tenant leakage introduced (School Admin B against School A's Teachers/Departments) | Pass |

---

# Performance

- The Teacher roster endpoint (`GET /teachers`) is paginated and filterable by `employmentStatus`/`departmentId`, per the Technical Design's Performance Considerations; confirmed the response shape supports filtering. No load testing performed — consistent with Class-Management.md's and Student-Management.md's own Validation Reports, which note this is not yet a load-bearing concern at this project stage.
- `GET /departments` is intentionally unpaginated (small, bounded per-school list, per Technical Design) — confirmed the response is a plain array/list shape appropriate for that.

---

# Outcome

All 14 Business Rules pass hands-on and automated verification. Permissions, Security, Regression, and the Employment Status Transition Matrix (all 7 transitions, both terminal states, both reversible paths) are fully verified, including the ACR-001 administrative-override boundary end-to-end (reason requirement, independence from `employmentStatus`, audit).

The one Major finding raised in v1.0 (duplicate Department name returning an undocumented `500` instead of the Technical Design's specified `409`) has been fixed, covered by 7 new automated tests (408/408 passing), and independently re-confirmed hands-on against the real running system. No known issues remain.

**Phase 7 (Validation) is complete.**

---

# Feature Acceptance Checklist

Mapped to `docs/02-standards/Definition-of-Done.md`:

- ☑ Business logic approved (Phase 3, second review: Accepted)
- ☑ Edge cases reviewed (Business Specification's Edge Cases section; all exercised above)
- ☑ Technical design completed (Phase 4, v1.4: Approved)
- ☑ Security considered (Phase 4 Security Considerations; verified above — IDOR, tenant isolation, guard by construction, audit)
- ☑ Validation completed (this report — Accepted)
- ☑ Development / implementation completed (Phase 6: all 8 Work Packages, Completion Review findings fixed)
- ☑ Standards followed (Coding-Standards.md's repository-only-touches-Prisma rule, Naming-Conventions.md, API-Standards.md — including the Department name-uniqueness fix, which brings this feature in line with Class Management's own precedent)
- ☑ Code is clean
- ☑ No known issues remain
- ☑ Tests passed (408/408 automated; all independent hands-on assertions passing)
- ☐ Code reviewed — Phase 9's independent code review has not yet run for this feature
- ☑ Documentation updated (this report; Development-Roadmap.md and Project-Overview.md updated to reflect this status)

Not yet Done — only "Code reviewed" (Phase 9) remains outstanding.

---

# Change History

- v1.0 — Initial Phase 7 Validation Report. Automated suite (401/401) plus independent hands-on verification (63 assertions across onboarding, the full Employment Status Transition Matrix, Department lifecycle, self-service, tenant isolation, and the ACR-001 override path) found 13/14 Business Rules fully pass; one Major finding (duplicate Department name returns 500, not the Technical Design's documented 409). Status: Requires Revision.
- v1.1 — Major finding fixed: `teachers.repository.js` gained `findDepartmentByName`; `teachers.service.js`'s `createDepartment`/`updateDepartment` now precheck and throw `ConflictError` (409), mirroring Class Management's existing `findByName` pattern exactly, with the rename path correctly excluding self-conflict. 7 new automated tests added (408/408 passing); fix re-confirmed hands-on against the real running system. All 14 Business Rules now pass without qualification. Status: Accepted. Phase 7 complete.
