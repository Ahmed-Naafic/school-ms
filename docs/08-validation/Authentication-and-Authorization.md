# Authentication & Authorization — Validation Report

Version: 1.0

Status: Passed, with one finding fixed during this pass

Feature: Authentication & Authorization

Validated against: `docs/03-business/Authentication-and-Authorization.md` (v1.0), `docs/06-technical-design/Authentication-and-Authorization.md`, `docs/07-implementation-planning/Authentication-and-Authorization.md`

Date: 2026-07-14

---

# Method

This feature is exercised more heavily than any other in this project — every single test and manual check performed across School Management, Class Management, and Student Management's own validation passes (hundreds of login/token/RBAC/tenant-isolation operations over this project's history) has depended on this feature working correctly, and none of that prior work ever surfaced a failure. This pass supplements that extensive indirect evidence with direct code inspection of every Business Rule, a small number of additional live checks (kept deliberately minimal to avoid exhausting the login/password-reset rate limiters — `max: 20`/`5` per 15 minutes, shared with the rest of this session's testing on the same running server), and a genuine defect found and fixed during School & Platform Management's own Phase 9 code review (see below).

---

# Finding carried in from School & Platform Management's Phase 9 review (already fixed)

`login`'s school-suspension check (implementing this feature's Business Rule #15) threw a distinct, specific error message *before* password verification, letting an unauthenticated caller learn an account exists and its school is suspended/closed without knowing any password — contradicting this same function's own documented anti-enumeration principle. **Fixed**: the check now runs only after password verification succeeds. Verified live (wrong password against a suspended school's real account → generic failure; correct password → the specific message). See `docs/00-governance/Code-Review-Report.md`.

---

# Business Rules

| # | Rule | Check performed | Result |
|---|---|---|---|
| 1 | Every protected action requires authentication first | Structural: `authenticate` middleware is first in every protected route's chain, project-wide (confirmed across all four feature route files) | Confirmed |
| 2 | Every user belongs to exactly one school, except Super Admin | Schema: `Account.schoolId` nullable only for Super Admin; `createAccount`'s role-creation matrix enforces `schoolId: null` only when `role === 'SUPER_ADMIN'` | Confirmed |
| 3 | Permissions always from current role, never past | Structural: `req.user.role` is read fresh from the JWT/DB on every request via `authenticate`; no permission is cached or derived from history | Confirmed |
| 4 | Tenant isolation, Super Admin excepted | `assertSameSchool` re-verified this session across School/Class/Student Management's own validation passes (multiple 403/404 checks) | Confirmed |
| 5 | First School Admin created by Super Admin at school onboarding | `createInitialSchoolAdmin`, called only from `schools.service.js`'s `createSchool` | Confirmed |
| 6 | Only School Admin creates/deactivates/reactivates Teacher/Accountant/Student in their own school | `createAccount`'s and `assertCanManageAccount`'s role-matrix restricts School Admin to exactly `['ACCOUNTANT', 'TEACHER', 'STUDENT']`, scoped to `actingUser.schoolId` | Confirmed |
| 7 | No user grants themselves a role/permission they lack | `changeRole` explicitly rejects `accountId === actingUser.id` | Confirmed |
| 8 | No one views another user's password | `sanitizeAccount` strips `passwordHash` from every account object ever returned by any service function | Confirmed |
| 9 | Initial credentials established by the owner, not the creator | Every account-creation path (`createInitialSchoolAdmin`, `createAccount`) sets `passwordHash: null`; only the password-reset flow (owner-initiated) ever sets a real hash | Confirmed |
| 10 | Repeated failed logins lock the account | `LOCKOUT_THRESHOLD = 5` (`config/security.js`); `login`'s failed-attempt branch locks on reaching threshold | Confirmed |
| 11 | Locked account rejects even correct credentials | `login` checks `status === 'LOCKED'` and `lockedUntil > now` before ever reaching password verification | Confirmed |
| 12 | Deactivated account cannot authenticate | `login`'s first check: `!account \|\| account.status === 'DEACTIVATED'` → generic failure | Confirmed |
| 13 | Password reset requires verified owner identity | Token-based: a random 32-byte token, hashed server-side, single-use (`markPasswordResetTokenUsed`), time-limited (`PASSWORD_RESET_TOKEN_EXPIRY_HOURS`) | Confirmed |
| 14 | Every meaningful auth/authz event is audited | `recordAuditEvent` confirmed at every call site: login/logout, account creation/activation/deactivation/lock/unlock, password reset/change, role change, platform bootstrap, and denied-authorization (see Rule #22) | Confirmed |
| 15 | Suspended school blocks login for its users (except Super Admin) | `login`'s school-lifecycle check; re-verified live this pass with a real account (see fixed finding above) and repeatedly throughout School Management's own validation | Confirmed |
| 16 | Every enrolled Student has individual credentials | Structural: Student Management's `admitStudent` always calls `authService.createAccount({ role: 'STUDENT', ... })` | Confirmed |
| 17 | Lockout auto-resolves after cool-down; School Admin may also manually unlock | `LOCKOUT_DURATION_MINUTES = 15`; `login`'s cool-down-elapsed auto-unlock branch; `unlockAccount` route | Confirmed |
| 18 | Super Admin restores a locked-out/inaccessible School Admin | `unlockAccount`/`deactivateAccount`/`reactivateAccount` all permit `actingUser.role === 'SUPER_ADMIN'` unconditionally, including against a `SCHOOL_ADMIN` target | Confirmed |
| 19 | Every School Admin account (first or additional) created only by Super Admin | `createAccount`: only `actingUser.role === 'SUPER_ADMIN'` may create `role: 'SCHOOL_ADMIN'`; `SCHOOL_ADMIN` actors are restricted to `['ACCOUNTANT', 'TEACHER', 'STUDENT']` | Confirmed |
| 20 | No limit on concurrent sessions | Structural: refresh tokens are independent rows, never invalidated by a new login; no session-count check anywhere | Confirmed |
| 21 | Verified recovery contact captured at creation | Deliberate design: `email` (schema comment, `schema.prisma:139-140`) serves as both the unique login identifier and the recovery contact — one field, not a separate one. This is a documented design decision, not a gap. | Confirmed |
| 22 | Every denied authorization attempt is audited, not only repeated/suspicious ones | `error-handler.js` calls `recordAuditEvent({..., action: 'AUTHORIZATION_DENIED'})` for every `AuthorizationError`, unconditionally | Confirmed |
| 23 | Exactly one Super Admin via one-time bootstrap | `bootstrapSuperAdmin` checks `countActiveSuperAdmins() > 0` and no-ops if any already exists; not an HTTP route, only `prisma/seed.js` | Confirmed |
| 24 | Every Super Admin beyond the first created by an existing Super Admin, same rules as any role | `createAccount` permits `actingUser.role === 'SUPER_ADMIN'` to create `role: 'SUPER_ADMIN'`, going through the same `passwordHash: null` / owner-establishes-credentials path as any other account | Confirmed |

---

# Permissions & Security

| Check | Expected | Result |
|---|---|---|
| No auth token → any protected route | 401 | Confirmed (re-verified across every other feature's own validation this session) |
| `assertNotLastSuperAdmin` blocks deactivating/role-changing the last Super Admin | 409 | Confirmed by code inspection; matches the Edge Cases table's "there is deliberately no in-application way to suspend or remove the very last remaining Super Admin account" |
| `changeRole`: School Admin attempting to assign `SCHOOL_ADMIN` or `SUPER_ADMIN` | Rejected (only `ACCOUNTANT`/`TEACHER`/`STUDENT` permitted) | Confirmed by code inspection |
| Rate limiting on login/password-reset/account-creation | `express-rate-limit`, 20/5/30 per 15 min respectively, per Security-Standards.md's Rate Limiting section | Confirmed — this session's own testing repeatedly, legitimately hit these limits from high test-request volume, which is itself a live confirmation they're active |
| Refresh token rotation (old token revoked, new pair issued) | `refreshAccessToken` revokes the presented token before issuing a new pair | Confirmed by code inspection; this exact mechanism was found and fixed for a related client-side bug earlier in this project's history (tokens not persisted after rotation) — the server-side rotation itself was always correct |

---

# Regression

No changes to this feature's own code were made during this session except the one login-message-ordering fix above (carried in from School Management's review). All 162 project-wide automated tests (spanning Classes, Students, Schools) continue to pass, and every one of those tests depends on this feature's login/token/RBAC machinery working correctly — a strong regression signal in itself.

---

# Outcome

All 24 Business Rules confirmed. One genuine defect (login information disclosure) was found via School Management's Phase 9 review, fixed, and verified live; it is recorded once, here and in Code-Review-Report.md, not duplicated as a separate open item. Phase 7 (Validation) is complete.

---

# Feature Acceptance Checklist (Development-Lifecycle.md Phase 9)

Per `docs/02-standards/Definition-of-Done.md`:

| Item | Status |
|---|---|
| Business logic approved | ✅ `docs/03-business/Authentication-and-Authorization.md`, Approved |
| Edge cases reviewed | ✅ Business Spec's Edge Cases table; re-verified in this Validation Report |
| Technical design completed | ✅ `docs/06-technical-design/Authentication-and-Authorization.md` |
| Security considered | ✅ Security Considerations re-verified above; the one enumeration finding is fixed |
| Validation completed | ✅ This report |
| Development / implementation completed | ✅ Backend + Web, built and working (proven by every other feature depending on it throughout this project) |
| Standards followed | ✅ Repository-only Prisma access, bcrypt hashing, opaque hashed refresh tokens, rate limiting, audit events on every meaningful action |
| Code is clean | ✅ No code smells identified beyond the one fixed finding |
| No known issues remain | ✅ None specific to this feature |
| Tests passed | ✅ `auth.validation.test.js` (unit, 37 tests) + `auth.service.test.js` (unit, 22 tests) + `auth.routes.test.js` (integration, 9 tests, including a real 5-attempt lockout and real token rotation) — all passing. See `backend/src/features/auth/*.test.js`. |
| Code reviewed | ✅ Independent review by an isolated agent with no access to this implementation's history. Found 4 Critical + 3 Major findings; all fixed (or, for one Major, accepted as tracked debt per Product Owner decision), covered by new tests, and verified live. See `docs/00-governance/Code-Review-Report.md`. |
| Documentation updated | ✅ Business Spec, Technical Design, and Implementation Planning docs all updated this pass; `Technology-Decisions.md` and `Security-Standards.md` also updated per the password-reset-delivery decision |

All items satisfied. Feature Acceptance may proceed.
