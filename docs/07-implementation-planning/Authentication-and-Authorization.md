# Implementation Planning

Feature: Authentication & Authorization

Version: 1.2

Status: Accepted. Phase 7 Validation and an independent code review both passed — see `docs/08-validation/Authentication-and-Authorization.md` and `docs/00-governance/Code-Review-Report.md`.

---

# Scope

This pass implements the `auth` feature module as designed in `docs/06-technical-design/Authentication-and-Authorization.md`: platform bootstrap (one-time Super Admin seed script), login, logout, JWT issuance (short-lived access token, server-tracked revocable refresh token), account creation (callable by School & Platform Management for the first School Admin, by an existing Super Admin for additional Super Admin accounts, and by School Admin for staff/Student accounts), password recovery, account lockout, role assignment, the Authentication/Authorization middleware chain, and audit event emission.

Out of scope for this pass (per the Business Specification's Future Enhancements): multi-factor authentication, SSO/social login, Parent Portal access, and configurable per-school session/password policies.

---

# Files Affected

All new files — this is the module's first implementation, and it introduces infrastructure every subsequent feature will depend on.

- `backend/src/features/auth/` — controller, service, repository, validation, routes, dto, types, utils, tests, `index.js`.
- `backend/src/middlewares/` — Authentication middleware (JWT verification) and Authorization middleware (role, permission, tenant checks).
- `backend/src/shared/` — password hashing utility (bcrypt) and JWT utility, kept generic per Folder-Structure.md's rule that shared code carries no business knowledge.
- `web/src/features/auth/` — pages, components, hooks, services, utils, validation.
- `mobile/lib/features/auth/` — Flutter login and password-recovery screens.
- Prisma schema — Account/User model and migration (role enum, nullable `schoolId`, account status including a "must change credentials" state, lockout counter and timestamp, verified recovery contact, and a refresh-token tracking table per Security-Standards.md).
- `backend/prisma/seed.js` (or equivalent) — the one-time platform bootstrap script that creates the initial Super Admin account from environment configuration, idempotently.

---

# Dependencies

- **School & Platform Management** — any account creation for School Admin, Accountant, Teacher, or Student needs a `schoolId` to reference, so those flows depend on a school existing. Super Admin's own account has no `schoolId` and does not depend on Schools existing.
- **Bootstrap — resolved.** The first Super Admin account is created by a one-time Prisma seed script, independent of any school existing. This unblocks a working end-to-end system: bootstrap Super Admin → create first school (and its School Admin) → normal operation.
- Security-Standards.md — already resolved; no gap.

---

# Risks

- Widest blast radius of any feature in the project, since nearly everything depends on it — its public interface (login, the account-creation service call other features use, and the middleware contracts) needs to stay stable once implemented, per the Constitution's Loose Coupling principle.
- Server-tracked, revocable refresh tokens are more implementation surface than a purely stateless JWT design — an accepted trade-off, made explicitly in Security-Standards.md, in exchange for being able to immediately revoke access on logout, deactivation, or lockout.

---

# Estimated Impact

The largest feature built so far: touches Web, Mobile, and Backend, and introduces the middleware layer every subsequent feature will sit behind. This is effectively shared platform infrastructure, not just one feature's own scope — extra care during Implementation is warranted for exactly that reason.

---

# Change History

- v1.0 — Initial implementation plan.
- v1.1 — Implementation complete (backend + web). Automated test suite added (`auth.validation.test.js`, `auth.service.test.js`, `auth.routes.test.js`). Phase 7 Validation passed; one defect (login information disclosure) found via a related feature's Phase 9 review and fixed. See `docs/08-validation/Authentication-and-Authorization.md`.
- v1.2 — Independent code review found 4 Critical + 3 Major findings (2 fixed, 1 accepted as tracked debt). New test file `password-reset-delivery.test.js` added alongside a new `backend/src/config/password-reset.js` module. Feature Acceptance granted. See `docs/00-governance/Code-Review-Report.md`.
