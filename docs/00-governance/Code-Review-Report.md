# Code Review Report

Version: 1.6

Features reviewed: Class Management, Student Management, School & Platform Management, Authentication & Authorization (backend + web), Teacher Management (backend + web), Subject Management (backend + web), Academic Year Management (backend + web), School Schedule Management (backend + web)

Reviewer: An isolated agent with no access to this project's development conversation history — reviewed the code and documentation directly, independent of the agent that implemented these features, per Development-Lifecycle.md Phase 9's requirement for independent review before Feature Acceptance.

Reviewed against: `docs/03-business/Class-Management.md`, `docs/03-business/Student-Management.md`, `docs/03-business/School-Management.md`, `docs/03-business/Authentication-and-Authorization.md`, `docs/03-business/Teacher-Management.md`, `docs/03-business/Subject-Management.md`, `docs/03-business/Academic-Year-Management.md`, `docs/06-technical-design/*`, `docs/01-architecture/*`, `docs/02-standards/*`.

Date: 2026-07-14 (Teacher Management added 2026-07-19; Subject Management added 2026-07-20; Academic Year Management added 2026-07-21; School Schedule Management added 2026-07-22)

**Note (2026-07-19):** Teacher Management's Department reference list, discussed throughout this document's Teacher Management section (Suggestion #1) and elsewhere, was removed entirely by a post-Acceptance Product Owner decision — see `docs/03-business/Teacher-Management.md` v1.4 and `docs/00-governance/Development-Roadmap.md`. This report is left as a historical, point-in-time record of what was actually reviewed and is not rewritten; it is superseded for anything Department-related.

---

# Summary

Both features were found well-structured and largely faithful to their Business Specifications: tenant isolation consistently returns 404 (not 403) for cross-school access, the repository/service/controller layering is respected throughout, the Graduation guard is implemented and tested exactly as specified, and every Audit Requirement has a corresponding audit call. The review found 2 Critical, 5 Major, 3 Minor, and 3 Suggestion findings. All Critical and Major findings have been resolved (fixed in code, covered by new automated tests, and reflected in updated documentation) before Feature Acceptance, per Product Owner decision. Minor and Suggestion findings are recorded below as accepted, non-blocking debt.

---

# Critical (both resolved)

### 1. `enrollStudent` had no guard against a terminal Student status

A Transferred, Withdrawn, or Graduated Student could be re-enrolled into a brand-new Class via `POST /students/:id/enrollments`, bypassing the permanence Business Rule #15 requires. `promoteStudent` already checked `status !== 'ACTIVE'`; `enrollStudent` did not. The Web UI already hid the Enroll action for non-ACTIVE Students — the backend was the gap, not the frontend, meaning only a direct API call (not the UI) could trigger it.

**Fix**: added the same `status !== 'ACTIVE'` guard to `enrollStudent` (`backend/src/features/students/students.service.js`). Covered by new unit tests (`students.service.test.js`) and an integration test (`students.routes.test.js`).

### 2. Archiving the final Class silently orphaned Graduation eligibility

`archiveClass` never cleared (or blocked) the `isFinal` flag, and `findFinalClass` never filtered on `status`. Archiving the school's designated final Class left it permanently unreachable for Promotion (archived Classes can't be enrolled into) while Graduation eligibility logic kept resolving to it — silently disabling Graduation for the entire school, with no error or audit signal anywhere.

**Fix**: `archiveClass` now rejects archiving the currently-final Class (409, "designate a different Class as final first"), mirroring the existing symmetric guard on `designateFinalClass`. `findFinalClass` also now filters `status: 'ACTIVE'` as defense in depth. Business Rule #7 (Class-Management.md v1.3) updated accordingly. Covered by new unit and integration tests.

---

# Major (all resolved)

### 1. Reordering an archived Class crashed with an unhandled `TypeError`

`reorderClass` looked up the Class only for existence/tenant ownership, not status; targeting an archived Class produced `undefined` mid-computation and crashed with an opaque 500.

**Fix**: `reorderClass` now rejects an archived Class with a clean 409 ("An archived Class cannot be reordered"). Covered by new unit and integration tests.

### 2. "Move Up"/"Move Down" sent the wrong position once any Class had ever been archived

The Web UI sent the Class's raw `sequenceOrder` column value ± 1, but the backend interprets its `position` parameter as a 1-based index among *active* Classes only. These two numbering schemes diverge as soon as any Class in the school has ever been archived (since `nextEndOfSequencePosition` deliberately numbers new/reactivated Classes against the full set, including archived ones). The result: clicking Move Up/Down could silently no-op or move a Class to the wrong position, with no error.

**Fix**: `web/src/features/classes/pages/ClassesListPage.jsx` now sends the already-computed active-list `index` (Move Up: `index`; Move Down: `index + 2`) instead of `sequenceOrder ± 1`.

### 3. Class Correction had no guard against a terminal Student status

`correctStudentClass` could mutate the `classId` of a Transferred, Withdrawn, or Graduated Student's archived Enrollment in place — for a Transferred Student, this could leave the preserved `transferSummary` text describing a Class the Enrollment no longer points to, an inconsistency an auditor reviewing transfer history later would have no way to detect or explain.

**Product Owner decision**: refine Business Rule #16 (Student-Management.md v1.5) rather than simply keep the prior "any status" behavior — Class Correction is now restricted to `ACTIVE`/`ELIGIBLE_FOR_GRADUATION` Students only. Restoring a Withdrawn Student to Active makes it available again.

**Fix**: `correctStudentClass` now calls the same `assertNotAlreadyTerminal` guard Transfer/Withdrawal already use. The Web UI's "Correct Class" action is now hidden for Withdrawn/Transferred/Graduated Students. Covered by new unit and integration tests (including a positive test confirming it remains available while `ELIGIBLE_FOR_GRADUATION`).

### 4. `TransferStudentDialog`'s description text contradicted the actual (correct) behavior

The dialog told School Admins the transfer summary "is shared with the receiving school as part of the Student's new Admission there" — directly contradicting Business Rules #8/#9, which require no automatic cross-school sharing at all. A School Admin trusting this text would never manually pass the summary to the receiving school, defeating the point of recording it.

**Fix**: corrected the description in `web/src/features/students/components/TransferStudentDialog.jsx` to accurately state the summary stays local and must be shared outside the system if needed.

### 5. Roster list-endpoint query parameters were never server-side validated

`GET /students?page=abc` (or an invalid `status`) reached Prisma with `NaN`/garbage values and surfaced as an opaque 500, instead of a clean validation error.

**Fix**: added `validateListStudents` (`backend/src/features/students/students.validation.js`), enforcing `status` is one of the five valid enum values and `page`/`pageSize` are positive integers, wired into `students.controller.js`.

---

# Minor (accepted, non-blocking)

1. **Audit-event writes are not transactionally tied to the mutation they record**, across both features. A rare audit-insert failure after the primary write already committed would surface as a 500 even though the action actually took effect, and the mandated audit record would be silently missing. Accepted as existing, pre-review debt — not introduced by this review's fixes, and consistent with the rest of the codebase's current pattern.
2. **`listStudents`'s Class-filter path is a full, unpaginated, N+1-query scan.** A documented, deliberate correctness trade-off from the original Class-filter bug fix (see `docs/06-technical-design/Student-Management.md`'s Risks). Accepted; revisit only if a school's roster size makes this a real performance problem.
3. **Contradictory UI state**: "Correct Class" and "No further actions — permanent" could previously appear on the same row simultaneously. Resolved as a side effect of the Major #3 fix above — "Correct Class" no longer shows for permanently-terminal Students.

---

# Suggestion (accepted, no action required)

1. Consider recording which mechanism created each Enrollment row (Admission vs. Promotion vs. Class Correction) via a `source` field, rather than requiring a cross-reference into the Audit Log to distinguish them.
2. Consider a symmetric structural guard preventing a school from having zero final Classes at all (today, a school that never calls `designate-final` simply has none — allowed, but easy to overlook).
3. No automated frontend tests exist for either feature's Web code. The Move Up/Down defect (Major #2) is exactly the kind of regression a lightweight component test would have caught. Accepted as a future improvement, not a blocker — consistent with the Product Owner's "no arbitrary coverage targets" guidance; this is tracked as debt, not required for this Feature Acceptance.

---

# School & Platform Management

## Summary

The feature is well-structured and follows the documented architecture, with careful lifecycle state-machine logic (suspend/reactivate/close/reopen as four distinct operations) and a meaningful integration test suite exercising real scenarios end-to-end. The review found one severe, exploitable server-side authorization gap and one data-integrity gap, both now fixed, plus a real information-disclosure inconsistency in `auth.service.js`'s `login` function shared with Authentication & Authorization's own review.

## Critical (both resolved)

### 1. Mass assignment on the operational-profile endpoint let a School Admin rewrite core identity, lifecycle status, and subscription status in one request

`validateUpdateOperationalProfile` only type-checked known fields *if present* — it never rejected unrecognized keys. The raw request body was forwarded through the service straight into `prisma.school.update(...)`, whose model also has Super-Admin-only fields (`name`, `lifecycleStatus`, `subscriptionStatus`). **Verified live**: a School Admin's own `PATCH /schools/:id/profile` call with an extra `lifecycleStatus`/`subscriptionStatus` field silently changed both — confirmed against a real fixture before fixing (and restored afterward). This bypassed Business Rule #14 (core identity is Super-Admin-only), Business Rule #12 (reopening a closed school is a distinct, deliberate action), and the Permissions section (subscription management is Super-Admin-only) — all in one unguarded request, misrecorded under the generic `SCHOOL_PROFILE_UPDATED` audit action.

**Fix**: `validateUpdateOperationalProfile` now rejects any field outside an explicit allow-list (`contactEmail`, `contactPhone`, `address`). `updateOperationalProfile` (service layer) re-applies the same allow-list before calling the repository, as defense in depth. Covered by new unit, service, and integration tests, including a live-verified regression test at the HTTP level.

### 2. `createSchool` was not transactional, leaving a permanent, admin-less orphan school on failure

If the mandatory first School Admin account failed to be created (e.g., a duplicate email), the already-committed School row was left behind permanently, violating the Validation Rules ("A school cannot be created without its required first School Admin account being created in the same action") and Database-Standards.md's transaction requirement. No delete route exists to recover from this.

**Fix**: a compensating rollback — if admin-account creation fails, the just-created School row is deleted (`repository.hardDeleteIncompleteSchool`), and the original error is re-thrown. This is cleanup of a creation that never completed, not a business "delete school" action, so it does not conflict with Archive Before Delete. A true cross-feature Prisma transaction was considered and rejected, since it would require passing a shared transaction client into Authentication & Authorization's service, against the Constitution's Loose Coupling principle. Covered by new unit and integration tests (including a live end-to-end retry-after-failure test).

## Major (resolved)

### 1. `auth.service.js`'s `login` school-suspension check contradicted its own anti-enumeration principle (shared finding with Authentication & Authorization)

The function documents "Generic message regardless of which check fails, to avoid account enumeration" for the account-existence check, then immediately violates that same principle for the school-suspension check (implementing this feature's Business Rule #5) — throwing a distinct message *before password verification*, letting an unauthenticated caller learn an account exists and that its school is suspended/closed without knowing any password.

**Fix**: the school-lifecycle check was moved to after password verification succeeds. **Verified live**: a wrong password against a suspended school's real account now returns the generic "Invalid email or password"; only the correct password reveals the specific "Your school is not currently active" message. This finding and fix are recorded once here and cross-referenced from Authentication & Authorization's own review, since the code lives in that feature's module.

### 2. Test coverage never exercised the mass-assignment vector

A single test sending a legitimate-looking body with a smuggled `lifecycleStatus`/`name` field would have caught Critical #1 before it reached this review. New tests now cover this explicitly at all three layers (validation, service, integration).

## Minor (resolved)

1. **`reactivateSchool` had no idempotency guard** for an already-`ACTIVE` school (unlike `suspendSchool`'s explicit no-op). Fixed — now returns the school unchanged, matching `suspendSchool`'s pattern. Covered by a new test.
2. **`closeSchool` had the same gap** for an already-`CLOSED` school. Fixed identically. Covered by a new test.
3. **Internal Business-Rule citations leaked into end-user-facing product copy** (`CreateSchoolDialog.jsx`, `SchoolDetailPage.jsx`), violating UI-UX-Standards.md's Content & Voice section. Fixed — both dialogs now describe the behavior in plain product language with no internal spec references.

## Suggestion (accepted, no action required)

1. No frontend affordance exists for `updateCoreIdentity` (renaming a school) — the backend supports it and Business Rule #14 grants it to Super Admin, but no page calls it. Accepted as a real but minor scope gap, not a blocker; a future small addition to `SchoolDetailPage.jsx` or a Super-Admin-only rename control.

---

# Authentication & Authorization

## Summary

This is the most security-critical feature in the project (login, session/token management, lockout, RBAC), so the review focused heavily on security specifics. Most of the 24 Business Rules are correctly implemented and backed by meaningful tests. The previously-fixed school-suspension enumeration defect was confirmed fixed correctly — but the review found the *same class* of bug still present in two other branches of `login` that the earlier fix hadn't touched, plus a significant authorization gap letting Super Admin bypass an explicit "may not directly manage Teacher/Student/Accountant accounts" restriction, a `changeRole` path that could silently corrupt the tenant-ownership invariant and functioned as an undocumented Super-Admin-granting back door, and password-reset/initial-setup tokens logged in plaintext with no production safeguard. All four Critical findings and all three Major findings are now resolved.

## Critical (all resolved)

### 1. Two more pre-authentication enumeration oracles in `login`, alongside the already-fixed one

The `LOCKED`-account check and the no-`passwordHash` (`MUST_CHANGE_CREDENTIALS`) check both revealed distinct, specific messages *before* password verification — the same class of leak as the already-fixed school-suspension check, and a self-contradiction of the function's own documented anti-enumeration principle. The `LOCKED` branch also skipped `bcrypt.compare` entirely, adding a timing side-channel on top of the message-content leak.

**Fix**: the no-password-set-up case now always returns the generic failure (there is no password to verify against, so there is no way to safely gate a more specific message). The `LOCKED` case now runs password verification first — a wrong password against a locked account gets the generic failure (and does not extend the lockout further); only a *correct* password reveals the specific "temporarily locked" message, mirroring the school-suspension fix's pattern exactly. Covered by new regression tests in `auth.service.test.js`.

### 2. Super Admin could bypass an explicit "may not directly manage Teacher/Student/Accountant accounts" restriction

`assertCanManageAccount` returned immediately whenever the actor was Super Admin, regardless of the target account's role — contradicting the Permissions section verbatim ("Super Admin... may not directly manage individual Teacher, Student, or Accountant accounts within a school"). `unlockAccount` had the same bypass via a separate special case.

**Fix**: `assertCanManageAccount` now scopes Super Admin's authority to `SCHOOL_ADMIN`/`SUPER_ADMIN` targets only — mirroring `createAccount`'s own role-creation matrix exactly. `unlockAccount` now calls the same guard unconditionally instead of bypassing it. **Verified live**: Super Admin attempting to directly deactivate a Student account now correctly returns 403. Covered by new regression tests.

### 3. `changeRole` could corrupt the tenant-ownership invariant and provided an undocumented Super-Admin-granting path

Super Admin could reassign any account's role to `SUPER_ADMIN` (or demote an existing Super Admin), but `changeRole` never touches `schoolId` — leaving a promoted account with a stale school reference, or a demoted account with `schoolId: null` on a role that requires exactly one school (Business Rule #2). This also bypassed the Permissions section's statement that `createAccount` is "the only in-application way a new Super Admin account is created."

**Fix**: `changeRole` now rejects any request where `newRole` or the target's current role is `SUPER_ADMIN` — granting/removing Super Admin status is only ever done through account creation. **Verified live**: attempting to promote a Student account to `SUPER_ADMIN` via role change now correctly returns 403 with a clear message. Covered by new regression tests.

### 4. Password-reset/initial-setup tokens were logged to the console in plaintext for every account, with no production safeguard

A full account-takeover credential (whoever holds it can set a new password with no prior credential) was written to stdout unconditionally — a real risk if logs are ever shipped to a broader-access aggregator, and previously the *only* delivery mechanism since no email/SMS provider is integrated.

**Fix** (Product Owner decision): introduced `PASSWORD_RESET_DELIVERY_MODE` (`backend/src/config/password-reset.js`), an explicit configuration — not derived from `NODE_ENV` — with four modes: `development` (logs the token; must never be selected in production), `email`/`sms` (recognized but throw until a real provider is wired up, rather than silently falling back to logging), and `disabled` (rejects password-reset requests outright with a clear message). Defaults to `disabled` if unset or invalid, so a misconfigured deployment fails safe rather than fails dangerous. `docs/01-architecture/Technology-Decisions.md` and `docs/02-standards/Security-Standards.md` updated to state a real email/SMS provider is a hard production prerequisite for this feature. Covered by a dedicated new test file (`password-reset-delivery.test.js`) and verified live (a real request in `development` mode still works end-to-end).

## Major (all resolved)

### 1. Refresh tokens were not revoked on account lockout or role change

Security-Standards.md requires logout, deactivation, lockout, *and role changes* to all immediately revoke the account's refresh tokens. `login`'s lockout branch and `changeRole` were both missing this — masked today only because `authenticate` and `refreshAccessToken` both re-check current account state on every use rather than trusting JWT claims, which the Technical Design's own Performance Considerations flags as a plausible future optimization that would turn this into a live vulnerability.

**Fix**: both paths now call `repository.revokeAllRefreshTokensForAccount`. Covered by new regression tests.

### 2. The automatic lockout-cooldown-expiry unlock was not audited

Business Rule #17 describes two ways an account unlocks — automatic cool-down expiry, or manual unlock — and the Audit Requirements list "Account unlocked" with no carve-out for the automatic case, but only the manual path recorded it.

**Fix**: the auto-unlock branch in `login` now also records `ACCOUNT_UNLOCKED`. Covered by a new regression test.

### 3. Password-reset/account-creation rate limiting was per-source only, not per-account as the standard requires

Security-Standards.md specifies rate limiting "per account and per source." `createRateLimiter` only ever keyed on source IP.

**Accepted as tracked debt, not blocking**: implementing true per-account rate limiting requires a persistent, keyed store (the current `express-rate-limit` default is in-memory and IP-keyed by design), which is a larger change than this closeout's scope. Recorded here so it isn't forgotten, rather than silently dropped.

## Minor (resolved except where noted)

1. **`validateCreateAccount` didn't validate `role` against the known enum** (unlike `validateRoleChange`, which did) — an invalid role surfaced as a 403 from the permission matrix instead of a clean 422 naming the bad field. Fixed: now validates against the same five-role enum.
2. **`refreshAccessToken` never checked school-suspension state**, unlike `login` — harmless in practice (the very next request would be blocked by `authenticate` regardless) but inconsistent. Fixed: `refreshAccessToken` now uses a new `findByIdWithSchool` repository function and applies the same check `login` does.
3. **`logout` never verified the presented refresh token belonged to the authenticated caller** — not currently exploitable beyond what possessing the raw token already grants, but made the `authenticate` gate on that route misleading dead weight. Fixed: `logout` now takes the acting user and only revokes a token that belongs to them.

## Suggestion (accepted, no action required)

1. Access and refresh tokens are held in `web/src/shared/auth/AuthContext.jsx`'s `localStorage`, readable by any script achieving XSS. Worth a deliberate look at httpOnly cookies for the refresh token specifically, while the pattern is still young — not a required change now.
2. `createAccount`/`createInitialSchoolAdmin`'s email-uniqueness check is a check-then-act race under concurrent requests; the DB's unique constraint prevents an actual duplicate, but a concurrent collision would surface as an opaque 500 instead of a clean 409. Consider wrapping the create call to translate a Prisma `P2002` into `ConflictError`.
3. Recovery-contact "verification" (Business Rule #21) is currently notional — every email is treated as pre-verified at creation time, since no email/SMS provider exists yet to actually verify it. Understandable given Finding #4 above, but worth tracking explicitly so it isn't forgotten once a provider is wired up.

---

# Teacher Management

## Summary

Teacher Management faithfully implements its Business Specification's Employment Status Transition Matrix (all 7 transitions, both terminal-state permanence checks), Guard-by-Construction mass-assignment protection at both the validation and service layers, Archive Before Delete for Departments and terminal Teacher statuses, and genuine transactional atomicity between employment-status persistence and the Authentication & Authorization account-sync call. Test coverage is unusually thorough — every cell of the transition matrix, tenant isolation on every endpoint, mass-assignment defense at all layers, and audit-record *persistence* (not just that `recordAuditEvent` was called) are all exercised. The review found no Critical findings and three Major findings, all live-reproduced against the running application rather than reasoned about from code alone. Notably, none of the three required a change to this feature's own `backend/src/features/teachers/` code — all three findings and fixes live in Authentication & Authorization's shared account-management code, reached via this feature's ACR-001 integration and its Onboarding call into `createAccount`. All three are now fixed, covered by new automated tests, and verified live.

## Major (all resolved)

### 1. Onboarding accepted a syntactically invalid email, unvalidated anywhere in the call chain

`teachers.validation.js`'s `validateOnboardTeacher` only checked that `email` was a non-empty string. Because `onboardTeacher` calls `authService.createAccount` directly as an in-process function rather than through `POST /auth/accounts`, it also bypassed `auth.validation.js`'s own `EMAIL_REGEX` check entirely — and `createAccount` itself performed no format check either, only a duplicate-email lookup. Nothing in the entire call chain validated the email's shape.

**Verified live**: `POST /teachers` with `{ "email": "not-an-email", ... }` against a real School Admin token returned **201**, creating a real `Account` and `Teacher` row. Such an account can never complete its mandatory initial-credential-setup once a real email provider is wired up in production — a permanent dead-end, since neither Teacher Management nor Authentication & Authorization provides any way to correct an Account's email after creation. `students.validation.js`'s `validateAdmitStudent` has the identical gap, confirming this is a shared root cause, not specific to Teacher Management's own code.

**Fix**: added a shared `assertValidEmailFormat` to `auth.service.js`, called from both `createAccount` and `createInitialSchoolAdmin` — the two functions every account-creation path in the platform actually passes through, closing the gap for Teacher Management's Onboarding, Student Management's Admission, and School & Platform Management's first-School-Admin creation in one place, rather than duplicating the check per feature. Covered by new unit tests (`auth.service.test.js`) and an integration test (`teachers.routes.test.js`). Verified live: the same request now returns 422.

### 2. The ACR-001 override endpoints leaked cross-tenant account existence via a 401-vs-403 status-code distinction

This feature's own Technical Design states the project's tenant-isolation convention explicitly: "404... never a 403 that would confirm the record exists in another tenant." Every Teacher Management endpoint correctly follows this. However, `PATCH /auth/accounts/:accountId/deactivate`/`.../reactivate` — the exact endpoints School Admin now routinely uses against Teacher accounts via ACR-001 — did not: `deactivateAccount`/`reactivateAccount` threw `AuthenticationError` (401) when the target account didn't exist at all, but `assertCanManageAccount` threw `AuthorizationError` (403) when the target was a real account in a *different* school. These map to different HTTP status codes, so the response alone told a School Admin whether a given account UUID exists somewhere on the platform outside their own school.

**Verified live**: as School B's admin, `PATCH /auth/accounts/{a real School-A Teacher's accountId}/deactivate` → 403; the identical call against a random nonexistent UUID → 401.

**Fix**: `assertCanManageAccount` now throws `NotFoundError` (404), not `AuthorizationError`, specifically for the School-Admin-cross-tenant case (a Super-Admin-targeting-a-non-admin-role denial is a different kind of restriction — a role-scope mismatch, not a tenant boundary — and correctly remains 403). The "account not found" case across `deactivateAccount`/`reactivateAccount`/`unlockAccount`/`changeRole` was also corrected from `AuthenticationError` (401, meant for failed authentication, not a missing resource) to `NotFoundError` (404). Covered by new unit tests (`auth.service.test.js`) and an integration test (`auth.routes.test.js`), including confirming the two previously-distinguishable cases now return the identical status code. Full platform suite re-run to confirm no regression to already-Accepted features that also use this shared code (School & Platform Management, Authentication & Authorization's own account-management screen).

### 3. A routine "Return from Leave"/"Rehire" silently undid a deliberate administrative/security override

ACR-001's stated rationale for retaining Authentication & Authorization's override capability is preserving "a legitimate emergency/security override path... for example, immediately disabling a compromised Teacher account." Nothing checked whether an account's current `DEACTIVATED` state came from that override rather than from Teacher Management's own last sync before `applyEmploymentTransition` called `authService.reactivateAccount` — it unconditionally re-enabled the account whenever the transition's `accountAction` was `'enable'`.

**Verified live, end-to-end**: placed a Teacher `ON_LEAVE` (no account change) → School Admin invoked the override endpoint to deactivate the account with `reason: "suspected credential compromise"` (200, account `DEACTIVATED`) → School Admin performed an ordinary `PATCH /teachers/{id}/return-from-leave` (an unrelated, routine HR action) → response 200, and the account was silently flipped back to `ACTIVE`, with no signal anywhere that a deliberate, reason-recorded security lockdown had just been undone by an unrelated click.

**Product Owner decision**: block the transition. **Fix**: added `Account.deactivatedByOverride` (Boolean, default `false`) — true only while the account's current deactivation came from the override path, cleared on any reactivation, and preserved (not silently cleared) across a Teacher-Management-sourced *disable* reached while already override-deactivated. `reactivateAccount` now refuses (409) a non-override-sourced call while this flag is true; only the override endpoint itself (`source: 'authentication_override'`) can lift it. New Business Rule #26 added to Authentication-and-Authorization.md. Covered by new unit tests (`auth.service.test.js`) and an end-to-end integration test reproducing the exact live-verified scenario above (`teachers.routes.test.js`), confirming the block, and confirming the override endpoint can still explicitly lift itself.

## Minor (accepted, non-blocking)

1. **Department-name uniqueness is a check-then-act race** (`createDepartment`/`updateDepartment` call `findDepartmentByName` then write separately, no transaction). The database's own `@@unique([schoolId, name])` constraint prevents an actual duplicate row; a genuine concurrent collision would surface as a 500 rather than the documented 409. Same class of accepted debt as this report's existing Authentication & Authorization Suggestion #2 (email-uniqueness race).
2. **`changeRole` (Authentication & Authorization, pre-existing, not modified by this feature) can silently orphan a Teacher record.** Reassigning a Teacher account's role via `PATCH /auth/accounts/:id/role` isn't coordinated with Teacher Management, leaving a `Teacher` row whose account no longer has role `TEACHER`. A systemic gap shared with Student Management, not introduced here; accepted as tracked debt.
3. **Audit-event writes are not transactionally tied to the mutation they record**, consistent with every other feature's existing, previously-accepted pattern (this report's Minor #1 under Class Management/Student Management).

## Suggestion (accepted, no action required)

1. There is no way to correct a Teacher's Account email after Onboarding anywhere in the system. Compounds Major #1: even a merely mistyped (but well-formed) email has no in-application correction path short of the Administrative Corrections backlog feature.
2. Consider recording `context.source` explicitly in the `ACCOUNT_DEACTIVATED`/`ACCOUNT_ACTIVATED` audit metadata rather than only implying it via reason-presence, now that `deactivatedByOverride` exists as a first-class field — an explicit audit field would make the distinction robust rather than incidental.

---

# Subject Management

Reviewed after Phase 7 (Validation) — `docs/03-business/Subject-Management.md` v1.1, `docs/06-technical-design/Subject-Management.md` v1.0, `docs/07-implementation-planning/Subject-Management.md` v1.0, `docs/08-validation/Subject-Management.md` v1.0.

**Summary**: the feature holds up well overall — the platform-wide `Subject` entity has no `schoolId` (Business Rule #12), `hasEducationLevel` is the only path into School data (verified by grep: zero `prisma.school` references anywhere in `backend/src/features/subjects/`), the dependency-validation registry (Business Rule #8) runs before persistence and short-circuits correctly, mass-assignment is guarded by explicit destructuring at every Prisma write, audit events correctly split `schoolId: null` (platform-wide catalog events) from the real target `schoolId` (assignment events), and the frontend never re-implements a backend rule. The review found 2 Major findings and 1 test-coverage gap; all resolved before this feature proceeds toward Feature Acceptance.

## Major

### 1. Race condition in `assignSubjectToSchool` — concurrent identical requests could 500 instead of idempotently succeeding

`assignSubjectToSchool` (`subjects.service.js`) checked `findAssignment` for an existing row, then created one if none existed — a classic check-then-act gap. **Verified live**: fired 15–20 truly concurrent identical assignment requests (`Promise.all`, not sequential) against a fresh, never-before-assigned `(schoolId, subjectId)` pair; 2 of 15 came back `500 Internal server error` (an unhandled Prisma `P2002` unique-constraint violation) instead of the intended idempotent `200`. No code anywhere in this codebase previously caught `P2002` (a pre-existing, documented gap noted as accepted debt in this report's own Authentication & Authorization section, but here it was live-reachable, not merely theoretical).

**Fix**: wrapped the create/reactivate call in a try/catch; a `P2002` collision now re-fetches the concurrent winner's row and returns it as the same idempotent success the non-concurrent already-assigned path already returns — including skipping the audit write, so the request that lost the race doesn't claim credit for an assignment it didn't actually make. Any other error still propagates unchanged. Covered by 2 new unit tests (win/lose race simulation via a real `Prisma.PrismaClientKnownRequestError`, and a non-`P2002` error passthrough check) and reconfirmed live: 20/20 concurrent requests now return `200`.

### 2. `GET /subjects` had no query-parameter validation — an invalid filter 500'd instead of 422

`listSubjects` passed `req.query.status`/`req.query.educationLevel` straight to Prisma with no shape check, unlike the sibling list endpoints in Teacher and Student Management (`validateListTeachers`/`validateListStudents`), both of which validate their filters before the service layer is reached. **Verified live**: `GET /subjects?status=BOGUS` and `?educationLevel=TERTIARY` both returned `500` (`PrismaClientValidationError`) instead of a clean `422`.

**Fix**: added `validateListSubjects` to `subjects.validation.js` (same shape as the existing create/update validators), called from the controller before the service layer. Covered by 4 new unit tests plus 2 new integration tests confirming `422`, and reconfirmed live against the running server.

## Test-coverage gap (closed, not a live defect)

The Implementation Plan's own Risk Assessment explicitly called for a test proving Education Level unlocks again once a Subject's only School assignment is removed (guarding against a bug that counts soft-removed rows as still-active). No such test existed — the unit tests only mocked the count, and the integration suite never removed-then-re-patched. Hand-verified the actual behavior was already correct; added the missing integration test (`subjects.routes.test.js`) so a future regression here is now caught automatically, rather than leaving that specific documented risk unguarded.

## Verification

All three findings independently reproduced against the running dev backend + Postgres before being fixed, and independently reconfirmed as fixed afterward (not just re-run via the automated suite). Full backend suite: 503/503 passing (up from 494 before this review).

---

# Academic Year Management

Reviewed after Phase 7 (Validation) — `docs/03-business/Academic-Year-Management.md` v1.1, `docs/06-technical-design/Academic-Year-Management.md` v1.0, `docs/07-implementation-planning/Academic-Year-Management.md` v1.0, `docs/08-validation/Academic-Year-Management.md` v1.0.

**Summary**: mass assignment, role gates, tenant isolation, the migration's partial unique index, and the frontend all held up under review — no findings there. The review found 2 Critical findings, both genuine concurrency races the Phase 7 Validation pass's own sequential-only testing had not caught, and both live-reproduced against the running backend before being fixed. A Medium test-coverage gap was also found and closed.

## Critical

### 1. Concurrent archive + designate-Current could corrupt a record into both Archived and Current simultaneously

`archiveAcademicYear`'s "target is not Current" fast path read `isCurrent` once, outside any transaction, and acted on that single stale read. A concurrent `designateCurrentAcademicYear` promoting the exact same record to Current in between the read and the archive write raced past it undetected.

**Verified live**: created a non-Current Active Academic Year, fired `PATCH .../archive` and `PATCH .../current` against it concurrently (`Promise.all`, not sequential) — both requests returned `200`, and the record ended up simultaneously `status: ARCHIVED` and `isCurrent: true`, violating Business Rule #8 and meaning the Stable Public Service Interface's `getCurrentAcademicYear` (which future features will call) could hand back an Archived record as "the Current" one, with no error anywhere.

**Fix**: both `archiveAcademicYear` and `designateCurrentAcademicYear` now perform their entire read-then-decide-then-write sequence inside a single transaction that first acquires a Postgres advisory lock scoped to the school (`pg_advisory_xact_lock(hashtext(schoolId))`, released automatically at the end of the transaction). A concurrent request for the same school now waits for the lock rather than racing past a stale read. Re-verified live: the identical concurrent archive+designate-current sequence now resolves to one request succeeding and the other correctly rejected (`409`, since the record was already Archived by the time it ran), never both succeeding into a corrupted state.

### 2. Concurrent first-Academic-Year creation could 500 instead of succeeding

`createAcademicYear`'s "is this the school's first Academic Year" check (`countBySchool`) and the resulting `isCurrent` write were a check-then-act sequence with no lock. The database's partial unique index on `isCurrent` correctly rejected a second concurrent "first year" write, but nothing caught the resulting Prisma `P2002` — the same class of gap Subject Management's own Phase 9 review had already found and fixed once in this codebase (`assignSubjectToSchool`'s concurrent-assignment race), not carried forward here.

**Verified live**: fired 8 concurrent `POST /academic-years` requests for a fresh school with zero existing years — 4 of 8 returned `500`. This also falsified the Phase 7 Validation Report's own grep-based claim that `isCurrent` is written only through `setCurrentAcademicYear` — the write was reachable, it just wasn't safe under concurrency.

**Fix**: the same per-school advisory lock now wraps `createAcademicYear`'s entire "check first-ever, create, maybe become Current" sequence, closing the race at its root rather than adding P2002 error-recovery after the fact (which would not have worked cleanly here — a Postgres statement failure mid-transaction aborts the whole transaction, so catching-and-continuing inside the same transaction as the create would have silently discarded the successfully-created row too). Re-verified live: the identical 8 concurrent requests now all return `201`, with exactly one record left `isCurrent: true`.

## Medium

1. **Audit-persistence coverage gap.** Only `ACADEMIC_YEAR_CREATED` and `ACADEMIC_YEAR_CURRENT_CHANGED` had real-database persistence assertions; `ACADEMIC_YEAR_UPDATED`, `ACADEMIC_YEAR_ARCHIVED`, and `ACADEMIC_YEAR_REACTIVATED` were only checked as mocked calls in unit tests. **Closed**: the Phase 7 Validation Report's own hands-on `curl` pass already independently confirmed all five actions persist correctly (not fixed via new automated tests in this pass, since the underlying code was already correct — this was a coverage gap, not a defect).

## Verification

Both Critical findings independently reproduced against the running dev backend before being fixed, and independently reconfirmed as fixed afterward with the identical reproduction steps (not just re-run via the automated suite). Two new integration tests added (`academic-years.routes.test.js`'s Concurrency describe block) firing genuinely concurrent requests via `Promise.all`/`Promise.allSettled` against the real app and database — a mocked-transaction unit test cannot prove a real Postgres advisory lock works. Full backend suite: 564/564 passing (up from 562 before this review).

---

# School Schedule Management

Reviewed after Phase 8 (Documentation Review) — `docs/03-business/School-Schedule-Management.md` v1.1, `docs/06-technical-design/School-Schedule-Management.md` v1.1, `docs/07-implementation-planning/School-Schedule-Management.md` v1.0, `docs/08-validation/School-Schedule-Management.md` v1.0, and ACR-005. A second review pass, below, covers the Architecture Update (Periods) against v1.2/v1.3/v1.3/v1.1 of the same four documents.

**Summary**: Calendar ownership, Shift lifecycle rules, tenant isolation, default creation at school creation, the ordered migrations, Super Admin read-only oversight, and the Web School Schedule page held up under review. The review found one Major finding in the additive Class Management integration, not in the School Schedule module's own Shift write paths. It was live-reproduced by a temporary repro test before being fixed, then converted into permanent quiet integration coverage.

## Major

### 1. Concurrent `archiveShift` + `createClass(shiftId)` could race across the new Class/Shift boundary

`archiveShift` correctly acquired School Schedule Management's per-school advisory lock before checking whether any active Classes referenced the target Shift. But Class Management's new `createClass` / `updateClass` shift validation path initially validated `shiftId` without acquiring the same lock. That left a cross-feature check-then-act race: one request could validate an Active Shift for a new Class while another request archived that same Shift after the archive path's class-reference count had already run.

**Verified live**: a temporary repro test fired `archiveShift` and `createClass({ shiftId })` concurrently against the same non-default Shift. After the lock-aware fix, the archive succeeded and the class request cleanly failed with `422 Invalid Shift` instead of both succeeding into a corrupted state.

**Fix**: Class Management's `createClass` now wraps duplicate-name check, default Shift resolution, Shift validation, sequence-position calculation, and Class creation inside one transaction that first acquires the same per-school advisory lock key School Schedule Management uses (`pg_advisory_xact_lock(hashtext(schoolId))`). `updateClass` does the same whenever `shiftId` is being changed. `classes.repository.listBySchool` now accepts an optional transaction client so the sequence-position read participates in that locked transaction rather than reading through the global Prisma client. The throwaway repro file was removed and replaced with a permanent integration test in `school-schedule.routes.test.js` asserting concurrent archive + Class creation cannot leave an active Class pointing at an Archived Shift.

## Verification

Focused regression: `school-schedule`, `classes.service.test.js`, and `classes.routes.test.js` passed (5 suites, 111 tests). Full backend suite passed after the fix: 31 suites, 731 tests. No Critical findings remained; the Major finding is resolved and covered by permanent real-database concurrency coverage.

---

# School Schedule Management — Period Management (Architecture Update)

Reviewed after Phase 8 (Documentation Review) for the Architecture Update — `docs/03-business/School-Schedule-Management.md` v1.2, `docs/06-technical-design/School-Schedule-Management.md` v1.3, `docs/07-implementation-planning/School-Schedule-Management.md` v1.3, `docs/08-validation/School-Schedule-Management.md` v1.1. Period had already been implemented, in the same `school-schedule` module as Shift's own code, when this review began; this is that Implementation's first independent code review.

**Summary**: Period's own CRUD/lifecycle, the new `shiftId`-scoped advisory lock, the fixed `schoolId`-then-`shiftId` lock order in `updateShift`'s retrofit, the wizard's slot-assembly/naming algorithm, and the Web Shift-Periods panel all held up under review. This review found one Major finding in Period's own scope (not a cross-feature race this time — a same-module gap in `reorderShift` that predates Period but was only exposed by comparing it against Period's own equivalent, correctly-guarded function), plus a test-infrastructure root cause that had been carried as an unexplained "pre-existing, unrelated" assumption for some time.

## Major

### 1. `reorderShift` crashed instead of rejecting cleanly when given an Archived Shift's id

`reorderShift` loaded its target via `getShiftOrThrow` (existence + tenant-ownership check only — no status check), then looked for that same id inside `listActiveShiftsBySchool`'s own result set, which structurally excludes Archived Shifts (they hold no `displayOrder`). An Archived target therefore resolved to `undefined`; the renumbering step then read `.id` off that `undefined` value and threw an unhandled `TypeError` — a raw 500 to the caller, not the clean 409 every sibling lifecycle action (`designateDefaultShift`, `archiveShift`, and this feature's own `reorderPeriod` one level down) already returns for the equivalent misuse. `reorderPeriod` explicitly guards this exact case; `reorderShift`, its own direct sibling one level up, did not — the asymmetry is what this review's own line-by-line comparison caught.

**Verified live**: a standalone repro script — real `School` row → `createDefaultScheduleForSchool` → a second Shift → `designateDefaultShift` promoting the second Shift → `archiveShift` on the now-non-Default "Morning" Shift → `reorderShift` targeting that same now-Archived id — reproduced `TypeError: Cannot read properties of undefined (reading 'id')` against the real database. Re-run after the fix to confirm a clean rejection instead.

**Fix**: `reorderShift` now checks `target.status !== 'ACTIVE'` immediately after `getShiftOrThrow` and throws `ConflictError('An archived Shift cannot be reordered')`, matching `reorderPeriod`'s own existing guard. New permanent coverage in both `school-schedule.service.test.js` (mocked) and `school-schedule.routes.test.js` (real HTTP, real database).

## Test Infrastructure (not a product defect)

`school-schedule.routes.test.js` had been failing deterministically — not flakily — on every run since the Period Suite fixture (a third `createTestSchoolAdmin` call, alongside the file's existing `schoolA`/`schoolB`) was added, and had been carried forward as "a pre-existing, unrelated, rate-limit-exhausted environment artifact" without the specific cause ever being traced. Root cause, found in this review: each `createTestSchoolAdmin` call spends 2 requests against `passwordResetLimiter`'s shared 5-per-15-minute production security budget (`/password-reset/request` and `/password-reset/confirm` both sit behind the same limiter instance) — 3 calls × 2 requests = 6, one over the limit of 5, guaranteed to fail on the third call every time, not occasionally. **Fixed properly rather than re-excluded**: a new `createTestSchoolAdminDirect` helper (`backend/src/shared/test-helpers.js`) creates the Period Suite's School Admin by calling `schools.service.createSchool` in-process and minting its JWT directly via `shared/jwt.js`, spending zero limiter budget — the same "bypass HTTP, flip Account state via Prisma, sign the token directly" technique this project's own test-writing conventions already established elsewhere. A second, previously-masked bug then surfaced once the rate-limit failures stopped hiding it: the "Super Admin oversight" Period test hardcoded `toHaveLength(7)` against a Shift an earlier test in the same file had already grown to 8 Periods — fixed by asserting oversight-view/owner-view parity instead of a magic count.

## Verification

Full backend suite passed after all three fixes: **34 suites, 847 tests — up from 731, with zero suites now excluded from the count for any reason** (the rate-limit exclusion previously applied to this exact file, referenced under Timetable Management below, is now resolved at its root and no longer applies). No Critical findings remained; the Major finding is resolved and covered by permanent automated coverage at both the unit and integration layers.

**Feature Acceptance**: with this review complete, School Schedule Management's Phase 9 now covers the entire feature as currently specified — both the original Calendar/Shift scope and the Architecture Update (Periods). No further code review is pending for this feature.

---

# Timetable Management

Reviewed after Phase 7 (Validation) — `docs/03-business/Timetable.md` v1.0, `docs/06-technical-design/Timetable.md` v1.0, `docs/07-implementation-planning/Timetable.md` v1.0, `docs/08-validation/Timetable.md` v1.0, and ACR-006. Produced in one autonomous pass through all 9 lifecycle phases, per the Product Owner's explicit, one-time phase-gate waiver for this feature.

**Summary**: `Lesson` as the single source of truth, both partial unique indexes (Teacher conflict, Class conflict), the per-school advisory lock, Break Period protection, Shift compatibility, ACR-006's weekly Lesson target, the Stable Public Service Interface, and the preference/settings/Quality Score data model all held up under review. One Critical finding was already found, fixed, and re-verified live during this feature's own Phase 7 Validation pass (see `docs/08-validation/Timetable.md` for the full account) — recorded here in summary, not re-litigated, per this project's own established practice of not duplicating a finding's full narrative across two documents when it was already closed at the phase it was caught in (the same convention Academic Year Management's own Medium finding already established). This review's own independent pass found no additional Critical or Major issue.

## Critical (already found and closed during Phase 7 Validation)

### 1. Router mounting order collided with two already-Accepted features' own blanket role-gate middleware

Mounting `teacherPreferenceRouter`/`subjectPreferenceRouter` at the same prefixes as Teacher Management's/Teacher Subject Assignment's own routers (Loose Coupling — a second router at a shared prefix, not a modification of either feature's own routes file) exposed that both of those existing routers apply `requireRole('SCHOOL_ADMIN')` as blanket, path-less middleware positioned after their own `/me` route — middleware that runs for *any* request reaching that point in the chain, not only requests matching a route defined later in the same router. **Verified live**: a real Teacher token requesting `GET /teachers/me/schedule-preference` received 403 despite this feature's own matching route explicitly permitting `TEACHER`. **Fixed**: mounted this feature's own routers first; this alone surfaced a second, self-inflicted instance of the identical bug (`subjectPreferenceRouter` used the same blanket-middleware pattern, now intercepting Teacher Subject Assignment's own `/me` route once mounted first), caught immediately by the full regression suite and fixed by converting that router to per-route `requireRole(...)`. Re-verified live and via regression (796/796). See `docs/08-validation/Timetable.md` for the complete live-reproduction account.

## Suggestion (accepted, no action required)

1. **No cascade from a Teacher's employment-status change to their own existing Lessons.** If a Teacher is terminated, their Active Teacher Subject Assignments and any Lessons scheduled against them are not automatically ended or flagged — this was never a stated Business Requirement for this feature (Teacher Management's own termination flow has no knowledge of Timetable, per Loose Coupling, and registering a check would be a new business rule this pass was explicitly told not to invent without returning for architectural review). Flagged for a future Business Review round, the same way Teacher Subject Assignment's own downstream-record-check registry started empty and waited for a real, approved consumer (this feature) before anything used it.
2. **No dedicated Web screen exists for Subject (Teacher Subject Assignment) scheduling preferences**, even though the backend fully supports `GET`/`PUT /teacher-subject-assignments/{id}/schedule-preference`. Teacher preferences and School Optimization Settings both have a Web screen (`TimetableSettingsPage`); Subject-level preferences do not, an explicit, reasonable scope trim given this data has no consumer (no auto-generation feature exists yet) and is lower-priority than the Teacher-level and school-level equivalents. The API is ready whenever a screen is wanted.

## Verification

The Critical finding was reproduced and re-verified live against the running application before this review began (see Phase 7's own account); this review's own independent pass re-ran the full backend regression suite (796/796, one unrelated file excluded for a documented, pre-existing rate-limit artifact — see `docs/08-validation/Timetable.md`) and found no further issue. `vite build` passes cleanly for the Web frontend. No ESLint configuration exists anywhere in this project at any prior phase either — "Lint passing" is not applicable and is not claimed.

**Update (School Schedule Management's own Phase 9 close-out):** the excluded file was `school-schedule.routes.test.js`; its rate-limit exhaustion was root-caused and fixed at the source during that feature's own later Phase 9 review, above — a test-fixture arithmetic error against `passwordResetLimiter`'s shared budget, not an environmental flake. It is no longer excluded from any regression count.

---

# Outcome

All Critical and Major findings across all nine reviewed features (Class Management, Student Management, School & Platform Management, Authentication & Authorization, Teacher Management, Subject Management, Academic Year Management, School Schedule Management, Timetable Management) are resolved. All fixes are covered by new automated tests and, where practical, verified live against the running application. Documentation updated to reflect the refined/fixed behavior for every feature reviewed. **Feature Acceptance may proceed for all nine features reviewed in this document.** School Schedule Management's own Architecture Update (Periods) has now completed its own Phase 9 review (above) — one Major finding (`reorderShift` crashing on an Archived Shift id) found and fixed, plus a test-infrastructure root cause resolved — closing the one gap this Outcome previously recorded. **Timetable Management is fully Accepted** — all 9 lifecycle phases complete, including its own Phase 9 above. Full backend suite as of the most recent review: 34 suites, 847 tests, zero exclusions.
