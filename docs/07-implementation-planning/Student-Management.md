# Implementation Planning

Feature: Student Management

Version: 1.3

Status: Implementation complete (Backend + Web, as scoped). Phase 7 Validation and an independent code review both passed — see `docs/08-validation/Student-Management.md` and `docs/00-governance/Code-Review-Report.md`. Mobile remains a separate future phase, unchanged from this plan's original scoping. **ACR-004** (v1.3 below) implementation is now also complete — see the ACR-004 Pass section below; its own Phase 7 Validation and independent code review have not yet been requested.

---

# Scope

This pass implements the `students` feature module as designed in `docs/06-technical-design/Student-Management.md`, **scoped to Backend and Web only**, per Product Owner decision: Implementation Plans are scoped per application. Backend defines the business rules and API contract; Web (School Admin) validates the administrative workflows; Mobile (Student's own self-service view) consumes the already-established API and is a separate, later implementation phase with its own planning, implementation, testing, and acceptance — not omitted work, just not this pass.

Covered in this pass: Admission (including triggering Authentication & Authorization's account-creation service), Enrollment (referencing a Class via Class Management's read-only interface), Promotion (creating a new Enrollment record, suggesting but not enforcing the next Class), Transfer (with its summary-record fields, and triggering account deactivation), Withdrawal (distinct from Transfer, no summary record), Graduation (strictly gated: only `ELIGIBLE_FOR_GRADUATION` → `GRADUATED`, per the Product Owner's Graduation-guard decision — see Technical Design's Error Handling section), profile management, and the School Admin-facing Student roster.

Out of scope for this pass:
- **Mobile** (`mobile/lib/features/student/`) — no Flutter project exists yet at all, not even Authentication & Authorization's own planned login/password-recovery screens. Bootstrapping the Flutter app, building Auth's mobile screens, and then Student's self-service screen is tracked as its own future implementation phase, to be planned when Mobile work begins — see Dependencies below.
- Per the Business Specification's Future Considerations: bulk Admission/Enrollment, document/attachment storage for Admission records, and an alumni-facing view for graduated Students.

## ACR-004 Pass — Implemented

A further, separate implementation pass, authorized by ACR-004 and its Business Specification (v1.7) / Technical Design (v1.8) amendments, is now complete:

- Added `academicYearId` (nullable FK to Academic Year Management's `AcademicYear`) to the Enrollment model, via an additive migration (`20260721093953_add_enrollment_academic_year_reference`) that also dropped the legacy `academicYear` free-text column's `NOT NULL` constraint, so new rows can leave it unset without touching any pre-existing row's own value.
- Added `assertAcademicYearEnrollable(schoolId, academicYearId)` to the service layer, calling Academic Year Management's `getAcademicYearById`; wired into `enrollStudent` (required) and `promoteStudent` (defaults to `getCurrentAcademicYear` when omitted, per Business Rule #23).
- Shape-validated `academicYearId` in the `validation/` layer (required on Enrollment, optional on Promotion), per the Technical Design's Validation Strategy.
- New rows stop writing to the legacy free-text `academicYear` field entirely; existing rows and their free-text values are left untouched.
- Web: replaced the free-text academic year input in the Enrollment and Promotion dialogs with a selector populated from Academic Year Management's own list endpoint (`StudentsListPage.jsx` now also fetches Academic Years alongside Classes). Promotion's selector defaults to "Current Academic Year (default)", omitting the field entirely so the backend resolves it; Enrollment's selector defaults to the first ACTIVE Academic Year, or a disabled placeholder ("No Academic Years yet — create one first") when the school has none.
- This pass is Backend + Web only, matching the original scope split — no Mobile impact, since Mobile has no Enrollment/Promotion screen at all.
- 10 new backend tests added (unit: `students.service.test.js`'s two new describe blocks covering missing/nonexistent/cross-school/Archived academicYearId and the Current-Academic-Year default, including the "defaulted value still gets validated" and "school has no Current Academic Year" cases; validation: `students.validation.test.js` updated). Full backend suite: 574/574.
- Live-verified in the browser via a scripted Playwright pass (Chromium, headless): a fresh School with zero Academic Years shows the disabled placeholder and is cleanly rejected (422) on Enrollment attempt; after creating an Academic Year, Enrollment succeeds with it pre-selected; Promotion succeeds with "Current Academic Year (default)" pre-selected. No relevant console errors (a handful of transient 401s on initial page load are a pre-existing, unrelated frontend behavior also reproducible on `/classes` and `/students` before this change — not introduced by this pass).

---

# Files Affected

All new files — this is the module's first implementation.

- `backend/src/features/students/` — controller, service, repository, validation, routes, dto, types, utils, tests, `index.js`.
- `web/src/features/students/` — pages, components, hooks, services, utils, validation. School-Admin-only, per the Technical Design's Frontend Design section.
- Prisma schema — new Student model (`StudentStatus` enum: `ACTIVE` / `ELIGIBLE_FOR_GRADUATION` / `TRANSFERRED` / `WITHDRAWN` / `GRADUATED`; required `schoolId`; one-to-one `accountId` reference to Authentication & Authorization's Account) and Enrollment model (`studentId`, academic year, `classId` reference to Class Management's Class, transfer-summary fields), plus a migration.
- No `backend/src/shared/` additions expected — this feature calls into Authentication & Authorization's existing account-creation/deactivation services and Class Management's existing read-only interface, rather than adding shared code, per the Technical Design's Backend Design section.
- No `mobile/` files in this pass — see Scope above.
- `web/src/app/App.jsx` and `web/src/app/Layout.jsx` — new `/students` route and sidebar nav entry (School Admin only), following the exact pattern already established for `/classes` and `/accounts`.

---

# Dependencies

- **Authentication & Authorization** — Approved and implemented. Admission calls its account-creation service; Transfer/Withdrawal/Graduation call its deactivation service. Both are existing, callable, in-process functions (`backend/src/features/auth/auth.service.js`). No blocker.
- **School & Platform Management** — Approved and implemented. Every Student belongs to a school this feature creates and keeps active. No blocker.
- **Class Management** — Approved and implemented (`backend/src/features/classes/classes.service.js`), exposing exactly the narrow read-only interface this feature needs: `getClassById`, `getSuggestedNextClass`, `getFinalClass`. This was the feature's original blocking dependency; it is now resolved. No blocker.
- **Mobile bootstrap** — not a blocker for *this pass*, since Mobile is explicitly out of scope here (see Scope above). Tracked as a prerequisite for the future Mobile phase: the Flutter project itself does not exist yet, and neither do Authentication & Authorization's planned mobile login/password-recovery screens, which a future Student mobile screen would need to sit behind.
- **(ACR-004) Academic Year Management** — Accepted and implemented (`backend/src/features/academic-years/academic-years.service.js`), exposing exactly the narrow interface the ACR-004 pass needs: `getAcademicYearById`, `getCurrentAcademicYear`, `listActiveAcademicYears`. No blocker.

---

# Risks

- **Graduation guard correctness** — the `ELIGIBLE_FOR_GRADUATION` → `GRADUATED` transition must be enforced strictly at the service layer (409 Conflict, no state change, audit the attempt) per the Product Owner's Graduation-guard decision now reflected in the Technical Design. This is the most business-rule-sensitive part of this feature; get the state-machine check right, not just the happy path.
- **Widest lifecycle surface built so far** — five terminal/near-terminal Student states (`ACTIVE`, `ELIGIBLE_FOR_GRADUATION`, `TRANSFERRED`, `WITHDRAWN`, `GRADUATED`) plus Enrollment history, versus School Management's four school states or Class Management's two. More transition combinations to get right in validation and error handling (409s for invalid transitions).
- **Two cross-feature calls, not one** — unlike Class Management (called, never calling) or School Management (one call into Auth), this feature calls into *both* Authentication & Authorization (account creation/deactivation) and Class Management (Class/sequence/final-Class lookups). Keep both interfaces narrow, per the Constitution's Loose Coupling principle — this feature should never query either dependency's tables directly.
- **Mobile scope deferral must stay visible** — explicitly tracked here and in `Development-Roadmap.md` so "Student Management is done" doesn't later get assumed to include the Mobile self-service screen, which it deliberately does not in this pass.
- **(ACR-004) The zero-Academic-Years hard block needs clear UI messaging, not just a correct 422.** Since Admission itself never prompts a School Admin to create an Academic Year first, a School Admin who admits Students immediately after onboarding will hit this block at the very first Enrollment attempt with no prior warning. The Web Enrollment/Promotion dialogs should surface a clear, actionable message pointing to Academic Year Management when this occurs — a UX concern flagged in the Technical Design's Risks, not a new business rule.
- **(ACR-004) Two additive migrations against the same `Enrollment` table in this feature's history** (`sectionId` from ACR-002, now `academicYearId`) — both nullable, both backward-compatible, but worth verifying together that neither migration's constraints interact unexpectedly (e.g., an index or unique constraint scoped incorrectly across both new columns).

---

# Estimated Impact

The largest business-logic surface built so far in terms of lifecycle states and cross-feature integration points, but scoped down for this pass by deliberately excluding Mobile — comparable in size to Authentication & Authorization's own Implementation Plan (widest blast radius so far) without that feature's token/session mechanics. No existing backend modules are modified beyond the new cross-feature calls into already-stable Auth and Class Management interfaces; Web additions are two small, well-precedented changes to `App.jsx`/`Layout.jsx` following the `/classes` pattern exactly.

**(ACR-004 pass)** Small: one new nullable column, one new narrow-interface cross-feature call, wiring into two already-existing service functions (`enrollStudent`, `promoteStudent`), and a frontend dialog change (free-text input → selector). Directly comparable in size and shape to ACR-002's own `sectionId` pass.

---

# Change History

- v1.0 — Initial implementation plan, scoped to Backend + Web.
- v1.1 — Implementation complete. Both flagged Risks materialized in some form during Implementation (a roster Class-filter bug matching historical rather than current Enrollment; the Graduation guard was implemented strictly as planned and validated with no defects). Phase 7 Validation passed. Mobile remains explicitly deferred, unchanged.
- v1.2 — Automated test suite added (unit + integration). Independent code review found and fixed two defects (missing terminal-status guard on Enrollment; Class Correction refined to exclude Transferred/Withdrawn/Graduated Students, per Business Rule #16 v1.5). See `docs/00-governance/Code-Review-Report.md`.
- v1.3 — ACR-004 (`docs/01-architecture/Architecture-Decision-Records/ACR-004-Enrollment-Academic-Year-Reference.md`) Implementation Plan added, following its Business Specification (v1.7) and Technical Design (v1.8) amendments, then implemented: Enrollment/Promotion now reference Academic Year Management via `academicYearId`, scoped to Backend + Web, comparable in size to ACR-002's own `sectionId` pass. 10 new tests; full backend suite 574/574; live-verified via a scripted Playwright browser pass. Phase 7 Validation and independent code review for this pass have not yet been requested.
