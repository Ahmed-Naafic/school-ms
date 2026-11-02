# Implementation Planning

Feature: School & Platform Management

Version: 1.2

Status: Accepted. Phase 7 Validation and an independent code review both passed (2 Critical findings fixed) — see `docs/08-validation/School-Management.md` and `docs/00-governance/Code-Review-Report.md`.

---

# Scope

This pass implements the `schools` feature module as designed in `docs/06-technical-design/School-Management.md`: school onboarding (creation, plus triggering the first School Admin account), the core-identity vs. operational-profile field split, suspend / reactivate / close / reopen lifecycle actions, subscription status as an informational, independent field, and platform-wide aggregate statistics.

Out of scope for this pass (per the Business Specification's Future Enhancements): billing/payment integration, self-service onboarding, configurable subscription tiers, dynamic per-school roles, and platform-level shared configuration (descoped during Phase 7 Validation — see Change History).

---

# Files Affected

All new files — this is the module's first implementation.

- `backend/src/features/schools/` — controller, service, repository, validation, routes, dto, types, utils, tests, `index.js`.
- `web/src/features/schools/` — pages, components, hooks, services, utils, validation.
- Prisma schema — new School model and migration (lifecycle status, subscription status as separate fields, core-identity fields, operational-profile fields).
- No `backend/src/shared/` additions expected beyond what Authentication & Authorization's plan already introduces; this feature calls that feature's account-creation service rather than adding its own shared code.
- No mobile files — Teacher and Student have no permissions in this feature, per the Technical Design.

---

# Dependencies

- **Authentication & Authorization's account-creation service** must exist and be callable before school onboarding can complete end-to-end (school creation triggers creation of the first School Admin account).
- **Bootstrap — resolved.** The first Super Admin account is created by Authentication & Authorization's one-time seed script, independent of any school existing (Authentication-and-Authorization.md Business Rule #23). This feature's dependency is now purely on that account-creation service existing, not on how Super Admin itself came to exist.

---

# Risks

- Tight coupling with Authentication & Authorization, already flagged in the Technical Design — keep the interface into that feature to the single, narrow "create initial admin account" call.
- Platform statistics performance at scale is a non-issue today (no schools exist yet) but should be revisited once real data volume exists.

---

# Estimated Impact

Net-new module; no existing modules are modified, since no other feature has been implemented yet. Moderate size relative to Authentication & Authorization — fewer moving parts (no login/token/lockout mechanics), but the cross-feature call into Authentication is real integration surface, not just an internal concern.

---

# Change History

- v1.0 — Initial implementation plan.
- v1.1 — Implementation complete (backend + web). Phase 7 Validation found platform-level shared configuration was planned but never built; Product Owner decision descoped it (see `docs/03-business/School-Management.md` v1.1). Automated test suite added.
- v1.2 — Independent code review found 2 Critical findings (mass-assignment on the operational-profile endpoint; non-transactional school creation risking an orphan record) and 2 Major findings (a shared login information-disclosure issue with Authentication & Authorization; a test-coverage gap). All fixed and covered by new tests. Feature Acceptance granted. See `docs/00-governance/Code-Review-Report.md`.
