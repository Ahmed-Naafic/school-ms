# Authentication & Authorization

Version: 1.8

Status:
- Accepted — see `docs/08-validation/Authentication-and-Authorization.md` and `docs/00-governance/Code-Review-Report.md`. Amended by ACR-001 (see Change History v1.3), by Teacher Management's Phase 9 code review (v1.4), by ACR-010 (v1.5), by ACR-011 (v1.6, implemented v1.7), and by ACR-012 (v1.8, implemented v1.8); ACR-010's Manager role remains documentation-only pending a consuming feature's own Technical Design phase (see ACR-010's Consequences), while ACR-011/ACR-012's Administrative Password Reset is fully implemented within this feature's own code (`backend/src/features/auth/*`) — not a reopening of this feature's own Feature Acceptance.

---

# Purpose

Every other feature in the School Management System depends on knowing two things before allowing any action: who is acting, and what that person is allowed to do.

Authentication solves the first problem: confirming that a person is who they claim to be before granting access to the system.

Authorization solves the second problem: determining what an already-identified person is permitted to see and do, based on their role and the school they belong to.

Without this feature, no other business rule in the system can be enforced — permissions, school isolation, and auditability all depend on it. This is why it is the first feature built, ahead of any school-specific functionality.

---

# Scope

## Included

- Verifying a user's identity before granting access (login).
- Ending an active session on request (logout).
- Establishing initial access for a newly created account.
- Allowing a user to recover access after forgetting their credentials.
- Allowing a user to change their own credentials.
- Protecting accounts against repeated unauthorized access attempts (account lockout).
- Activating and deactivating user accounts.
- Assigning and changing a user's role.
- Enforcing that every action a user takes is limited to their role's permissions and their own school.
- Enforcing that no user can access another school's data, except Super Admin.

## Not Included

- The specific screens, dashboards, or actions available to each role once authenticated — those are defined in each role's relevant business feature document (e.g. Student Management, Teacher Management).
- School creation and school lifecycle management (suspending/activating a school) — owned by the Super Admin's platform-management responsibilities, referenced here only where it affects a user's ability to log in.
- Payment, fee, or financial authorization logic — owned by Fees Management.
- Parent Portal access — not an approved role today; see Future Enhancements.
- Any specific technology, protocol, or implementation mechanism used to identify a user or maintain access — that is a Technical Design decision, not a business rule.

---

# Actors

- **Super Admin** — the platform owner; not tied to any school.
- **School Admin** — administrator of one school.
- **Manager** — school-scoped staff member with attendance-specific administrative access, created and managed by School Admin; distinct from School Admin and never inheriting its permissions. Added by **ACR-010** (`docs/01-architecture/Architecture-Decision-Records/ACR-010-Manager-Role-Introduction.md`).
- **Accountant** — finance-scoped staff member of one school.
- **Teacher** — teaching staff member of one school.
- **Student** — learner enrolled in one school.

Every actor above is a **User** as defined in the Project Glossary: anyone who can log into the system.

---

# Permissions

## Super Admin

- May create the first School Admin account as part of school onboarding. School creation itself is governed by School-Management.md, not this document.
- May create additional Super Admin accounts. This is the only in-application way a new Super Admin account is created; the very first Super Admin account is created through a one-time platform bootstrap process instead (see Business Rules).
- School suspension and reactivation are School & Platform Management actions (see School-Management.md); the effect here is that every user of that school, except Super Admin, immediately loses or regains the ability to log in.
- May not directly manage individual Teacher, Student, or Accountant accounts within a school.
- May not perform day-to-day authorization actions inside a school's own operations.

## School Admin

- May create user accounts for Teachers, Accountants, Managers, and (where applicable) Students within their own school.
- For Teacher accounts specifically: ordinary activation and deactivation driven by an employment-lifecycle event (Onboarding, an employment-status change, or Reinstatement) is initiated by Teacher Management, not directly here, per ACR-001 (`docs/01-architecture/Architecture-Decision-Records/ACR-001-Employment-vs-Authentication-Ownership.md`). School Admin retains a separate, independent ability to activate or deactivate a Teacher's account directly through this feature as an administrative or security override, outside the ordinary employment-lifecycle workflow; every such override must record a reason, is independently audited, and must never modify the Teacher's employment status in Teacher Management (Business Rule #25).
- May deactivate and reactivate Accountant, Manager, and Student accounts within their own school. Manager has no employment-lifecycle-driven counterpart to Teacher Management today — School Admin manages a Manager's account directly, the same simple shape as Accountant and Student (Business Rule #27, added by **ACR-010**).
- May directly initiate an Administrative Password Reset for a Teacher, Manager, or Accountant account within their own school, immediately invalidating that account's current password and requiring the account owner to establish a new one themselves through the existing Forgotten Password Recovery mechanism — never a password School Admin sets, sees, or retains (Business Rules #29–30, added by **ACR-011**). Does not extend to Student accounts, to another School Admin's account, or to Super Admin's account.
- May assign and change the role of a user within their own school.
- May not create or manage accounts belonging to another school.
- May not create another School Admin account under any circumstance. Every School Admin account — whether the first for a school or an additional one — is created only by Super Admin.
- May not access or manage the Super Admin's own account.

## Manager

**Added by ACR-010** (`docs/01-architecture/Architecture-Decision-Records/ACR-010-Manager-Role-Introduction.md`).

- May log in and log out using their own credentials.
- May change their own password.
- May request recovery of a forgotten password for their own account.
- Has attendance-specific access as defined in Attendance-Management.md (recording Student attendance by checkpoint; recording daily Teacher/Accountant staff attendance) — this document does not itself define that access, only the account/role mechanics.
- May not create, modify, deactivate, or view the credentials of any other user's account, including another Manager's — Manager account management is School Admin's authority alone in this version (Business Rule #28). This explicitly includes the Administrative Password Reset added by **ACR-011**: a Manager may never reset another Manager's, a Teacher's, or an Accountant's password — that authority belongs to School Admin alone (Business Rule #29).
- May not perform any School Admin administrative action. A Manager never inherits School Admin's own permissions, by omission — nothing grants a Manager any capability beyond what is explicitly defined for the role.
- May not change their own role or permissions.
- May not record or view-for-correction another Manager's or an Admin's (School Admin's) attendance — Attendance-Management.md Business Rules #16 and #20 govern this; it is not restated here.

## Accountant, Teacher, Student

- May log in and log out using their own credentials.
- May change their own password.
- May request recovery of a forgotten password for their own account.
- May not create, modify, deactivate, or view the credentials of any other user's account — this includes the Administrative Password Reset added by **ACR-011**: an Accountant or Teacher may never reset another Accountant's, Teacher's, or Manager's password; that authority belongs to School Admin alone, within their own school (Business Rule #29). Student is unaffected either way — Administrative Password Reset does not extend to Student accounts at all.
- May not change their own role or permissions.

## All Authenticated Users

- May only perform actions permitted by their current role.
- May only access data belonging to their own school, except Super Admin.

---

# Business Workflow

## 1. Platform Bootstrap (One Time Only)

1. Before any school, School Admin, or ordinary account exists, exactly one Super Admin account is created through a one-time bootstrap process, separate from the ordinary application and from every other account-creation rule in this document — there is no "creator" role for the very first Super Admin.
2. The bootstrapped account is created in a "must change credentials" state.
3. On its first successful login, the bootstrapped account is required to establish its own permanent credentials before it can perform any other action, achieving the same intent as Business Rule #9 (initial credentials are not retained by whoever set the account up) even though no in-application creator exists for this one case.
4. From this point forward, every additional Super Admin account is created by an existing Super Admin through the ordinary application, following the same account-creation rules as any other role.

## 2. Account Creation

1. An authorized role (Super Admin for a School Admin account, or School Admin for staff/Student accounts within their school) creates a new user account.
2. The account is created with exactly one role and, unless the user is Super Admin, exactly one owning school.
3. The new user is given a way to establish their own initial credentials rather than the creator choosing a password on their behalf.
4. The account is inactive for ordinary use until the new user completes initial setup.

## 3. Login

1. A user provides their identity and proves it via their credentials.
2. The system verifies the identity is genuine.
3. If verified, the system determines the user's role and owning school (or platform-level access, for Super Admin).
4. Access is granted, scoped to that role and school.
5. If verification fails, access is denied and the failed attempt is counted toward the account's lockout threshold.

## 4. Logout

1. A user ends their own active access at will.
2. Once logged out, the user must authenticate again to regain access.

## 5. Forgotten Password Recovery

1. A user who cannot log in requests password recovery.
2. The system verifies the request genuinely comes from the account owner through a secure, verifiable method.
3. Once verified, the user establishes a new password.
4. The previous password no longer grants access.

## 6. Account Lockout

1. The system counts consecutive failed login attempts for an account.
2. Once a defined threshold is reached, the account is temporarily locked, and further login attempts are denied even with correct credentials.
3. The account becomes available again automatically after a defined cool-down period, or sooner if School Admin manually unlocks it (or Super Admin, for a School Admin's own account).

## 7. Role and Account Status Changes

1. An authorized role changes a user's role, or activates/deactivates their account.
2. For a Teacher account, this is either (a) triggered by Teacher Management as the consequence of an employment-lifecycle event, per ACR-001, or (b) invoked directly here by School Admin as an administrative or security override, which must record a reason and is independently audited, and never changes the Teacher's employment status in Teacher Management (Business Rule #25).
3. The change takes effect immediately — any access the user attempts afterward reflects the new role or status, regardless of when they last logged in.

## 8. Authorization Check (applies to every action, in every feature)

1. Before any action is performed, the system confirms the user is authenticated.
2. The system confirms the user's role permits the requested action.
3. The system confirms the data being accessed belongs to the user's own school (unless the user is Super Admin).
4. If any check fails, the action is denied.

---

# Business Rules

1. Every protected action in the system requires the user to be authenticated first.
2. Every user belongs to exactly one school, except Super Admin, who belongs to the platform and no single school.
3. A user's permissions are always determined by their current role — never by what they were allowed to do in the past.
4. A user may only access data belonging to their own school. Super Admin is the only exception.
5. A school's first School Admin account is created by Super Admin as part of school onboarding, per School-Management.md. School creation itself is governed there, not here.
6. Only School Admin may create, deactivate, or reactivate Teacher, Accountant, Manager, and Student accounts within their own school. For Teacher accounts, see Business Rule #25 for how this interacts with Teacher Management's employment-lifecycle-driven account changes. For Manager accounts, see Business Rules #27–28 (added by **ACR-010**).
7. No user may grant themselves a role or permission they do not already have.
8. No user, including an administrator, may view another user's password.
9. A newly created account must have its initial credentials established by the account owner, not assigned and retained by the creator.
10. Repeated failed login attempts on an account must result in a temporary lockout.
11. A locked account cannot be accessed with correct credentials until the lockout condition is resolved.
12. A deactivated account cannot authenticate under any circumstance until it is reactivated by an authorized role.
13. A password reset is only valid if the requester's identity as the account owner can be verified.
14. Every meaningful authentication and authorization event must be recorded for audit purposes.
15. When a school is suspended (per School-Management.md), every user of that school, except Super Admin, immediately loses the ability to log in.
16. Every enrolled Student is issued individual login credentials. There is no parent-mediated login access until a Parent Portal role is approved (see Future Enhancements).
17. An account lockout resolves automatically after a defined cool-down period. School Admin may also manually unlock any account within their own school before the cool-down expires.
18. If a School Admin is locked out or loses access, Super Admin has the authority to restore it — the same authority Super Admin already holds to create a school's first School Admin account.
19. Every School Admin account — whether the first for a school or any additional one — is created only by Super Admin. A School Admin may not create another School Admin account.
20. There is no limit on concurrent active sessions per user. The Web and Mobile applications are used by distinct, non-overlapping role sets, so this does not currently present a business conflict.
21. Every account must have at least one verified recovery contact captured at creation time. Password recovery is only permitted through that verified contact.
22. Every denied authorization attempt is recorded for audit purposes, not only repeated or suspicious ones.
23. Exactly one Super Admin account is created through a one-time platform bootstrap process, separate from every other account-creation rule in this document. It is created in a "must change credentials" state and is required to establish its own permanent credentials on first login.
24. Every Super Admin account beyond the first is created by an existing Super Admin through the ordinary application, following the same account-creation rules as any other role (Business Rule #9 applies normally here, unlike the bootstrap case).
25. For a Teacher account, activation and deactivation ordinarily occurs only as a consequence of an employment-lifecycle event recorded by Teacher Management (Onboarding, an employment-status change, or Reinstatement), per ACR-001 (`docs/01-architecture/Architecture-Decision-Records/ACR-001-Employment-vs-Authentication-Ownership.md`). School Admin retains an independent ability to activate or deactivate a Teacher's account directly through this feature as an administrative or security override; every such override must record the acting user and a reason, must be independently audited in addition to Business Rule #14's general requirement, and must never modify the Teacher's employment status — Teacher Management remains the sole source of truth for employment state regardless of any override performed here.
26. While an account is deactivated via the administrative/security override described in Business Rule #25, an employment-lifecycle-driven reactivation (Teacher Management's Return from Leave or Rehire) is refused, not silently applied — the override remains in effect until explicitly lifted through this same override capability. This closes a gap found during Teacher Management's Phase 9 code review: an ordinary, unrelated HR action must never be able to undo a deliberate, reason-recorded security lockdown as a side effect.
27. **(Added by ACR-010)** Manager is a distinct role from School Admin, tenant-scoped to exactly one school like every role except Super Admin (Business Rule #2). A Manager account's lifecycle (creation, deactivation, reactivation) is managed directly by School Admin, the same simple shape as Accountant and Student accounts — Manager has no employment-lifecycle-driven counterpart to Teacher Management's own account synchronization in this version.
28. **(Added by ACR-010)** A Manager's permissions never include School Admin's own administrative permissions, and are limited to exactly what is explicitly granted to the Manager role (in this version, the attendance-specific access defined in Attendance-Management.md). A Manager may not create, deactivate, reactivate, or otherwise manage another Manager's account, or any other user's account — that authority belongs to School Admin alone unless a future amendment explicitly extends it.
29. **(Added by ACR-011)** School Admin may directly initiate an Administrative Password Reset for a Teacher, Manager, or Accountant account, but only when that account belongs to the same school as the acting School Admin — the same tenant scope Business Rule #6 already applies to account creation/deactivation/reactivation for these roles. This authority does not extend to Student accounts, to another School Admin's account, or to Super Admin's account, and is never granted to any role other than School Admin — a Manager, Teacher, or Accountant may never reset another Manager's, Teacher's, or Accountant's password through this or any mechanism.
30. **(Added by ACR-011; amended by ACR-012)** An Administrative Password Reset immediately invalidates the target account's current password, sets the account to the same "must establish new credentials" state a newly created account starts in (Business Rule #9), and revokes every active session for that account. In every password-reset delivery mode except `development` (i.e. every mode capable of actually delivering a real recovery message to the account owner), no password value is ever generated, stored in plaintext, displayed, or transmitted by this action — the account owner alone establishes their own new password through the existing Forgotten Password Recovery mechanism (Business Workflow §5), and Business Rule #8 ("No user, including an administrator, may view another user's password") applies without exception. **Only** when the platform's password-reset delivery mode is `development` — an environment with no real delivery channel at all, and never valid in a real deployment, per this document's own existing `development`-mode convention — the reset instead generates a temporary password and returns it once to the acting School Admin to relay directly, so the account owner can log in and is then required to establish their own permanent password on that very login, per Business Rule #9. This one-time value is never persisted in plaintext, never included in the audit record, and never retrievable a second time.

---

# Edge Cases

| Situation | Expected Behavior |
|---|---|
| Correct credentials, but the account is deactivated | Access denied. |
| Correct credentials, but the user's school has been suspended | Access denied. |
| A user's role is changed while they are actively using the system | Their next action reflects the new role, not the old one. |
| A user forgets their password and can no longer verify their identity through the normal recovery method | Requires escalation to an authorized role; exact escalation path is an open question. |
| A legitimate user repeatedly mistypes their password and triggers a lockout | The lockout must be resolvable without permanently denying a legitimate user access. |
| A School Admin account is deactivated or locked out | Super Admin has authority to restore access, so the school is never left without a path to administrative access (see Business Rules #18). |
| Two users at different schools happen to share the same name or similar identifying details | The system must be able to uniquely identify each user regardless of name similarity. |
| A user attempts an action their role does not permit | Action denied; the attempt may be subject to audit logging. |
| A Super Admin account needs to be suspended or recovered | Mitigated by the platform supporting more than one Super Admin account (School-Management.md Business Rule #15); another Super Admin can act. There is deliberately no in-application way to suspend or remove the very last remaining Super Admin account, to avoid the platform ever having zero administrators. |
| A Teacher's account is deactivated via the administrative/security override (Business Rule #25), and Teacher Management then attempts Return from Leave or Rehire on the same Teacher | Rejected; the override remains in effect until explicitly lifted through the override endpoint itself, per Business Rule #26. |
| A School Admin attempts to override-deactivate/reactivate an account belonging to a Teacher/Accountant/Student in another school | Rejected with the same 404 a genuinely nonexistent account would get — never a 403, which would confirm the account exists in another tenant, per Multi-Tenancy.md's API Rules. |
| A Manager attempts to create, deactivate, or reactivate another Manager's account | Rejected, per Business Rule #28 — only School Admin holds this authority in this version. |
| A Manager attempts to perform a School-Admin-level administrative action | Rejected — a Manager never inherits School Admin's permissions, per Business Rule #28. |
| A School Admin attempts an Administrative Password Reset on a Teacher/Manager/Accountant account belonging to another school | Rejected with the same 404 a genuinely nonexistent account would get — never a 403, per Multi-Tenancy.md's API Rules, the same tenant-isolation-leak protection Business Rule #6's other account actions already follow. |
| A School Admin attempts an Administrative Password Reset on a Student, another School Admin, or Super Admin's account | Rejected — Business Rule #29 scopes this authority to Teacher/Manager/Accountant only. |
| A Manager, Teacher, or Accountant attempts to reset another user's password via Administrative Password Reset | Rejected — this authority belongs to School Admin alone, per Business Rule #29. |
| A Teacher/Manager/Accountant's password is administratively reset while they have an active session | The session is revoked immediately, alongside the password invalidation — access does not persist past the reset regardless of when the user last authenticated, per Business Rule #30. |
| An Administrative Password Reset is performed while the platform's password-reset delivery mode is `disabled` | The account's password is still invalidated with no replacement value shown (same as any non-`development` mode, per Business Rule #30, ACR-012) — but the account owner's own subsequent Forgotten Password Recovery request is itself rejected in `disabled` mode, per `requestPasswordReset`'s own existing behavior. The account is left genuinely inaccessible until an operator intervenes some other way; this is a known, pre-existing limitation of `disabled` mode generally, not something ACR-012 introduces or resolves. |

---

# Validation Rules

- Every user must have a unique way of being identified across the entire platform — never ambiguous, even across different schools.
- A password (or equivalent credential) must meet the minimum strength requirements defined in Security Standards.
- A password reset request must be verifiable as originating from the legitimate account owner before it is honored.
- An account cannot be created without exactly one assigned role.
- An account cannot be created without an owning school, except for Super Admin.
- Every account must have at least one verified recovery contact captured at creation time; password recovery is only permitted through that verified contact. The specific channel (e.g., email, SMS) is a Technical Design decision.

---

# Relationships

- Every business feature in the system depends on Authentication & Authorization to determine who is acting and what they are permitted to do.
- **Multi-Tenancy** — every authenticated session is scoped to one school, except Super Admin, who operates at the platform level.
- **School & Platform Management** — school creation, suspension, and reactivation are owned there; this document only defines the effect of those states on a user's ability to log in.
- **Student Management / Teacher Management** — account creation for Students and Teachers is initiated through this feature when those records are established. For Teachers specifically, ordinary account activation/deactivation is also initiated by Teacher Management as a consequence of employment-lifecycle events, per ACR-001; this feature separately retains an independent administrative/security override capability, subject to Business Rule #25.
- **Attendance Management** — the feature that originated the Manager role (**ACR-010**). This document owns only the Manager role's existence and account lifecycle (Business Rules #6, #27–28); Attendance-Management.md owns everything Manager may actually do — its attendance-recording authority, the checkpoint model, and the constraint that a Manager may never record another Manager's or an Admin's attendance.
- **Audit Logs** — every authentication and authorization event of business significance is recorded there.

---

# Reports

This feature does not produce end-user-facing reports.

Authentication and authorization activity is captured as audit trail data rather than as a standalone report; see Audit Requirements below and Audit-Logs.md.

---

# Notifications

- A newly created account triggers a notification to the new user with instructions to establish their initial access.
- A password reset request triggers a notification to the account owner with recovery instructions.
- An account lockout triggers a notification to the affected user informing them of the lockout.
- A role or account status change may trigger a notification to the affected user (exact scope is an open question).

The delivery channel for these notifications (e.g. email, SMS, in-app) is a Technical Design decision, not a business rule.

---

# Audit Requirements

The following events must be recorded, each including Tenant (school), User, Action, and Timestamp per the standard audit record defined in Multi-Tenancy.md:

- Platform bootstrap (initial Super Admin account created)
- Successful login
- Failed login attempt
- Logout
- Account created
- Account activated
- Account deactivated
- Account locked
- Account unlocked
- Password reset requested
- Password reset completed
- Password changed
- Role assigned or changed
- Denied authorization attempt (action attempted outside the user's permissions) — every occurrence is recorded, not only repeated or suspicious ones
- Teacher account activated or deactivated via administrative/security override (recorded with the standard audit fields plus an explicit reason, per Business Rule #25)
- Administrative Password Reset performed (recorded with the standard audit fields — Tenant, acting School Admin, target account, Timestamp — and never any password value, per Business Rules #8 and #30, added by **ACR-011**)

---

# Acceptance Criteria

- Every actor's permissions for account creation, login, and role management are unambiguous.
- Every business rule governing account lifecycle (creation, activation, deactivation, lockout, recovery) is defined.
- Tenant isolation is respected in every authentication and authorization scenario described.
- Every edge case has either a defined expected business behavior or is captured as an open question.
- All audit requirements are defined.
- This document is reviewed and approved by the Product Owner before Technical Design begins.

---

# Open Questions

None remain. All nine questions from the original Business Review were resolved (Business Rules #16–22; "Account Lockout" and "Account Activation / Deactivation" added to Project-Glossary.md). The one related item that was tracked in School-Management.md — platform continuity if Super Admin's account becomes inaccessible — is now resolved there (Business Rule #15) and here (Business Rules #23–24, and the Platform Bootstrap workflow).

---

# Future Enhancements

- Multi-factor authentication.
- Single Sign-On (SSO) or social login.
- Parent Portal access, once that role is approved.
- Configurable password and session policies per school.
- Self-registration with an invite code, if the business ever wants to reduce School Admin's account-creation workload.

---

# Change History

- v1.0 — Initial approved specification.
- v1.1 — Phase 7 (Validation) confirmed all 24 Business Rules. One defect (login's school-suspension check revealed a specific message before password verification, letting an unauthenticated caller enumerate account existence and another tenant's suspension state) was found during School & Platform Management's Phase 9 code review and fixed here: the check now runs only after password verification succeeds. See `docs/08-validation/Authentication-and-Authorization.md` and `docs/00-governance/Code-Review-Report.md`.
- v1.2 — This feature's own independent code review (Phase 9) found and fixed: two more pre-authentication enumeration oracles in `login` (the locked-account and no-password-set-up checks, same class as the v1.1 fix); Super Admin could bypass the "may not directly manage Teacher/Student/Accountant accounts" restriction; `changeRole` could corrupt the tenant-ownership invariant and served as an undocumented Super-Admin-granting path (now rejected outright — Super Admin status is only ever granted through account creation); and password-reset/initial-setup tokens were logged in plaintext with no production safeguard (now gated behind an explicit `PASSWORD_RESET_DELIVERY_MODE` configuration, defaulting to `disabled`). Feature Acceptance granted. See `docs/00-governance/Code-Review-Report.md`.
- v1.3 — ACR-001 (Employment vs Authentication Ownership) approved during Teacher Management's Phase 3 Business Review, which found that this feature's generic Teacher account activate/deactivate action (Business Rule #6) was never reconciled with Teacher Management's employment-status-driven account synchronization. Added Business Rule #25: ordinary Teacher account changes are now owned by Teacher Management; this feature retains only a narrower administrative/security override, which must record actor and reason and must never modify Teacher Management's employment status. Updated Permissions, Business Workflow #7, Relationships, and Audit Requirements accordingly. Documentation-only amendment — implementation is deferred to Teacher Management's own Phase 6, since this feature has already completed Feature Acceptance. See `docs/01-architecture/Architecture-Decision-Records/ACR-001-Employment-vs-Authentication-Ownership.md`.
- v1.4 — Teacher Management's Phase 9 independent code review found two defects in this feature's own code, both fixed here: (1) `assertCanManageAccount` returned a different status code (403) for a real cross-tenant account than a nonexistent one (401), letting the response alone confirm an account exists outside the caller's own school — both cases now return 404, consistent with every other tenant-scoped resource; the "account not found" case across `deactivateAccount`/`reactivateAccount`/`unlockAccount`/`changeRole` was also corrected from 401 (`AuthenticationError`, meant for failed authentication, not a missing resource) to 404. (2) A routine employment-lifecycle reactivation could silently undo a deliberate, reason-recorded administrative/security override — added Business Rule #26 and a new `Account.deactivatedByOverride` field so an override remains in effect until explicitly lifted through the override endpoint itself. Also closed a shared gap this same review found in `createAccount`/`createInitialSchoolAdmin`: neither validated email format, since in-process callers (Teacher Management's Onboarding, Student Management's Admission) never reach `auth.validation.js`'s own check — both now validate format directly. See `docs/00-governance/Code-Review-Report.md`.
- v1.5 — **ACR-010** (Manager Role Introduction) approved: Attendance Management's Business Discovery required a Manager actor distinct from every existing role, which did not exist in this document's role set. Added Manager to Actors and Permissions (its own dedicated block: baseline account actions plus a pointer to Attendance-Management.md for its actual attendance-specific capability — never School Admin's administrative permissions), amended Business Rule #6 to include Manager account creation/deactivation/reactivation by School Admin, and added Business Rules #27–28 (Manager's simple, School-Admin-direct account lifecycle with no Teacher-Management-style employment split; a Manager can never manage another Manager's account or inherit School Admin's permissions). Updated Permissions → School Admin, Edge Cases, and Relationships (new Attendance Management entry) accordingly. Documentation-only amendment, per ACR-010 — no `UserRole` enum change, no Prisma migration, no API or service/controller change; implementation is deferred to whichever feature's own future Technical Design phase actually needs it. Feature Acceptance not reopened.
- v1.6 — **ACR-011** (Administrative Password Reset for School-Scoped Staff) approved: School Admin previously had no way to directly unblock a Teacher, Manager, or Accountant who could not complete the fully self-service Forgotten Password Recovery flow, despite already holding direct account-lifecycle authority (create/deactivate/reactivate) over those three roles. Added Business Rules #29–30: School Admin may initiate an Administrative Password Reset for a Teacher/Manager/Accountant within their own school only (never Student, another School Admin, or Super Admin, and never granted to Super Admin or laterally between Manager/Teacher/Accountant); the reset invalidates the current password and forces the same "must establish new credentials" state a newly created account starts in (Business Rule #9) plus an immediate session revocation — no password value is ever generated, stored in plaintext, displayed, or transmitted by this action, so Business Rule #8 required no amendment at all. Updated Permissions (School Admin, Manager, Accountant/Teacher/Student blocks), added five new Edge Cases rows, and added "Administrative Password Reset performed" to Audit Requirements. Also added a Project Glossary entry. Documentation-only amendment, per ACR-011 — no `UserRole` enum change, no Prisma migration, no API or service/controller change; implementation explicitly deferred pending separate authorization, per the Product Owner's own instruction. Feature Acceptance not reopened.
- v1.7 — **ACR-011 implemented.** `auth.repository.js` gained `resetPasswordAdministratively` (sets `passwordHash: null, status: MUST_CHANGE_CREDENTIALS`, mirroring `createAccount`'s own shape exactly); `auth.service.js` gained `resetPasswordAdministratively(accountId, actingUser)` enforcing Business Rules #29–30 exactly (`SCHOOL_ADMIN`-only; target role restricted to `TEACHER`/`MANAGER`/`ACCOUNTANT` — deliberately narrower than `assertCanManageAccount`'s own Student-inclusive scope; 403 on role-scope mismatch, 404 on cross-school, matching `assertCanManageAccount`'s own established distinction; revokes all active sessions; records the `ADMINISTRATIVE_PASSWORD_RESET` audit action with no password value in its metadata); a new route `PATCH /accounts/:accountId/reset-password` gated `requireRole('SCHOOL_ADMIN')` only — `SUPER_ADMIN` is never named on this route, so it is rejected by the same role-allow-list mechanism this project already uses everywhere else, no new middleware required. Frontend: `AccountManagementPage.jsx` renders a "Reset Password" action only when the acting user is `SCHOOL_ADMIN` and the target row's role is `TEACHER`/`MANAGER`/`ACCOUNTANT`. 8 new integration tests added (`auth.routes.test.js`) covering every branch of Business Rules #29–30, including the audit-metadata-never-contains-a-password-value assertion; full backend suite (40 suites, 1087 tests) passes with zero regressions. Verified live in the browser as School Admin (Reset Password renders only for Teacher/Manager/Accountant rows, action flips status to "Setup pending" immediately) and as Super Admin (no such action anywhere, by construction). `npm run build` succeeds.
- v1.8 — **ACR-012** (Development-Mode Temporary Password Display) approved and implemented: amended Business Rule #30 with a narrow, environment-gated exception — when `PASSWORD_RESET_DELIVERY_MODE=development` only, an Administrative Password Reset now generates a real temporary password (via the existing hashing mechanism) and returns it once to the acting School Admin, instead of invalidating with no replacement value. Every other delivery mode is unchanged from ACR-011/v1.7. Added a `disabled`-mode Edge Case row documenting a known, pre-existing lockout gap this ACR does not resolve. The temporary password is never logged, never included in the audit record, and never retrievable a second time. See `docs/01-architecture/Architecture-Decision-Records/ACR-012-Development-Mode-Temporary-Password-Display.md`.
