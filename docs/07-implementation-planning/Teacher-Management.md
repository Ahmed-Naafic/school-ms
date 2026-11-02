# Implementation Planning

Feature: Teacher Management

Version: 1.2

Status: Second Phase 5 review returned "Approved" (see Change History). Implementation (Phase 6) is complete — this plan is a historical record of what was executed, not a living document. **v1.2: WP4 (Department Reference List) has since been reversed** by a post-Acceptance Product Owner decision — see `docs/03-business/Teacher-Management.md` v1.4 and `docs/06-technical-design/Teacher-Management.md` v1.7. The WP4 section below is left as-is, describing what was actually built at the time, rather than rewritten — see `docs/00-governance/Development-Roadmap.md` for the removal record.

---

# Scope

This plan implements the `teachers` feature module as designed in `docs/06-technical-design/Teacher-Management.md`, **scoped to Backend and Web only**, following the same per-application scoping precedent Student Management already established: Backend defines the business rules and API contract; Web (School Admin) covers the full administrative workflow; Mobile (Teacher's own self-service view) is a separate, later implementation phase.

Covered in this pass: Onboarding (including triggering Authentication & Authorization's account-creation service), the six named employment-status transitions (Leave, Return from Leave, Resign, Rehire, Terminate, Retire) per the Employment Status Transition Matrix, profile management (personal/employment/professional information), the Department reference list (create/update/archive), the Teacher roster, and — per explicit Product Owner instruction — ACR-001's Authentication & Authorization override mechanism, delivered within this same Implementation pass rather than deferred.

Out of scope for this pass:
- **Mobile** (`mobile/lib/features/teacher/`) — no Flutter project exists yet (`mobile/` contains only `.gitkeep`), the same state Student Management's own Implementation Plan found. Bootstrapping the Flutter app and building Authentication & Authorization's and Student Management's own deferred mobile screens are prerequisites that remain unresolved regardless of this feature; Teacher's mobile self-service screen joins that same future Mobile phase, not silently dropped.
- Per the Business Specification's Future Considerations: document/attachment storage for Onboarding records, bulk Onboarding, and Department as a fully independent cross-school entity.

---

# Work Packages

Each package below maps to the specific Business Specification rules and Technical Design sections it implements, so every task traces back to an approved decision — nothing here introduces new business logic.

## WP1 — Database Schema & Migration

**Maps to:** Technical Design's Database Impact section; Business Rules #2, #3, #7, #8, #9, #11.

- `backend/prisma/schema.prisma`: new `Teacher` model (`schoolId`, `accountId` unique, `employeeId` unique-within-school, `fullName`, `contactPhone`, `contactAddress`, `joiningDate`, `employmentType`, `departmentId`, `qualifications`, `subjectSpecializations` (string list), `relevantExperience`, `employmentStatus`, timestamps), new `Department` model (`schoolId`, `name` unique-within-school, `status`, timestamps), new `TeacherEmploymentStatus` enum (`ACTIVE`/`ON_LEAVE`/`RESIGNED`/`TERMINATED`/`RETIRED`), new `DepartmentStatus` enum (`ACTIVE`/`ARCHIVED`).
- `backend/prisma/migrations/` — new migration generated from the schema change. No raw-SQL step is anticipated here (unlike Class Management's final-Class partial index), since neither `Teacher` nor `Department`'s uniqueness constraints are conditional.
- Indexes: `schoolId` on both models; `schoolId` + `employmentStatus` composite on `Teacher`, per the Technical Design's Performance Considerations.

## WP2 — Teacher Core Backend (Onboarding, Read, Roster, Profile Update)

**Maps to:** Business Rules #1, #2, #3, #6 (Onboarding half), #10, #11, #12; Technical Design's API Design and the Guard-by-Construction principle.

- `backend/src/features/teachers/teachers.repository.js` — the only file touching Prisma for this feature, per Coding-Standards.md.
- `backend/src/features/teachers/teachers.service.js` — `onboardTeacher` (generates `employeeId`, calls `authService.createAccount` for the `TEACHER` role, creates the Teacher record with `employmentStatus: ACTIVE`), `getTeacherById`, `listTeachers` (paginated, filterable by `employmentStatus`/`departmentId`), `updateTeacherProfile` (accepts only `fullName`, `contactPhone`, `contactAddress`, `joiningDate`, `employmentType`, `departmentId`, `qualifications`, `subjectSpecializations`, `relevantExperience` — never `employmentStatus`, `employeeId`, `schoolId`, or `accountId`, per the Technical Design's Critical-finding fix).
- `backend/src/features/teachers/teachers.validation.js` — request schemas enforcing the same field whitelist at the boundary, before the service layer is ever reached, per API-Standards.md and Coding-Standards.md.
- `backend/src/features/teachers/teachers.controller.js`, `teachers.routes.js` — `POST /teachers`, `GET /teachers/{id}`, `GET /teachers`, `PATCH /teachers/{id}`, all School-Admin-only and tenant-scoped from the authenticated token; `GET /teachers/{id}` returns 404 (never 403) for a Teacher outside the caller's school.
- `backend/src/features/teachers/index.js` — module's public router export, following every existing feature's pattern.

## WP3 — Employment Status Transition Backend

**Maps to:** Business Rules #4, #5, #6; Technical Design's Employment Status Transition Matrix (the authoritative source for every precondition below — this package implements it exactly, not a paraphrase of it).

- `teachers.service.js` — six named functions, each with its own allowed-from-status guard and its own call into `authService`'s activate/deactivate functions, in this order: (1) check precondition, reject with 409 if it fails; (2) persist the new `employmentStatus`; (3) call Authentication & Authorization; steps 2–3 in the same transaction, per Database-Standards.md's Transactions section:
  - `placeOnLeave` (`ACTIVE` → `ON_LEAVE`, no account call)
  - `returnFromLeave` (`ON_LEAVE` → `ACTIVE`, enable account)
  - `resign` (`ACTIVE`/`ON_LEAVE` → `RESIGNED`, disable account)
  - `rehire` (`RESIGNED` → `ACTIVE`, enable account)
  - `terminate` (`ACTIVE`/`ON_LEAVE` → `TERMINATED`, disable account)
  - `retire` (`ACTIVE`/`ON_LEAVE` → `RETIRED`, disable account)
- `teachers.routes.js` — `PATCH /teachers/{id}/leave`, `/return-from-leave`, `/resign`, `/rehire`, `/terminate`, `/retire`, all School-Admin-only.
- No generic `setEmploymentStatus` function or route exists anywhere in this package, per the Technical Design's Architecture section.

## WP4 — Department Reference List Backend

**Maps to:** Business Rule #9; Technical Design's Database Impact and API Design (Department section).

- `teachers.service.js` / `teachers.repository.js` — `createDepartment`, `updateDepartment` (excludes `status` and `schoolId` from its own DTO — archiving is only reachable via the dedicated function below, per the Technical Design's second-review fix), `archiveDepartment`, `listDepartments` (excludes `ARCHIVED` entries by default; `includeArchived` flag returns all).
- `teachers.routes.js` — `POST /departments`, `PATCH /departments/{id}`, `PATCH /departments/{id}/archive`, `GET /departments`, all School-Admin-only, tenant-scoped, handled within this same module (not a separate feature), per the Technical Design's Backend Design section.
- A Teacher's `departmentId` update (via WP2's `updateTeacherProfile`) validates that the referenced Department exists, is not archived, and belongs to the same school.

## WP5 — Teacher Self-Service Backend

**Maps to:** Business Rules #10, #12; Business Workflow #6; Technical Design's `/teachers/me` design.

- `teachers.service.js` — `getOwnProfile`, `updateOwnContactInfo` (accepts only `contactPhone` and `contactAddress`; any other field present in the request body is rejected with 422).
- `teachers.routes.js` — `GET /teachers/me`, `PATCH /teachers/me`, both Teacher-only, resolving identity strictly from the authenticated token, never a client-supplied `teacherId`.

## WP6 — ACR-001: Authentication & Authorization Override Implementation

**Maps to:** ACR-001 (`docs/01-architecture/Architecture-Decision-Records/ACR-001-Employment-vs-Authentication-Ownership.md`); Authentication-and-Authorization.md Business Rule #25; its own Technical Design v1.4 API Design and Risks sections. Per the Product Owner's explicit instruction, this package is in scope for this Implementation pass, not deferred further.

**Design, revised following this plan's own Phase 5 review** (the original version described the internal-call-vs-override distinction as "structural, not a runtime flag" — this was found unworkable, since both callers reach the identical service function with no structural way to tell them apart; an explicit operation context replaces it):

- **Concrete route decision** (unchanged from the prior version, still correct): the override reuses the two **already-implemented** endpoints `PATCH /accounts/{accountId}/deactivate` and `PATCH /accounts/{accountId}/reactivate` (`backend/src/features/auth/auth.routes.js`) — no new route is introduced.
- `backend/src/features/auth/auth.service.js` — `deactivateAccount`/`reactivateAccount` gain a third parameter, an operation context object: `{ source: 'teacher_management' | 'authentication_override', reason: string | null }`. A new service-layer guard, run immediately after the target account is loaded (the same point `assertCanManageAccount` already runs), enforces: a `reason` is required only when `context.source === 'authentication_override'` **and** `target.role === 'TEACHER'`; every other combination proceeds without one. `context` defaults to `{ source: 'authentication_override', reason: null }` when omitted — a safe default, since an unidentified caller is treated as the override path, never silently as the trusted internal one.
- `backend/src/features/auth/auth.controller.js` — **does change** (correcting the prior version's claim that it wouldn't): `deactivateAccount` and `reactivateAccount` now call `validation.validateAccountOverride(req.body)` first (the same "validate, then call the service" pattern every other controller function in this file already follows), then build `{ source: 'authentication_override', reason: req.body.reason ?? null }` and pass it as the third argument to the service call.
- `backend/src/features/auth/auth.validation.js` — **performs request-shape validation only**, per the Product Owner's explicit correction: a new `validateAccountOverride(body)` checks that `reason`, if present, is a non-empty string. It has no repository access and never checks the target account's role or whether a reason is actually *required* — that role-dependent decision is the service-layer guard above, not this file.
- `backend/src/features/teachers/teachers.service.js` (WP3) — every call into `authService.deactivateAccount`/`reactivateAccount` explicitly passes `{ source: 'teacher_management', reason: null }` as the third argument. This is the only change WP6 makes outside `backend/src/features/auth/` — one explicit argument at each of WP3's existing call sites, not new logic.
- **Existing test to revise, not just re-run:** `auth.service.test.js`'s `'lets a School Admin deactivate a Teacher in their own school'` case (around line 261) currently calls `deactivateAccount` with no context, exercising a Teacher target with no reason. Under the new default, this now correctly fails per Business Rule #25 — it is not a regression to avoid, but the intended effect of an approved business rule. This test must be split into two: an `authentication_override` call with a `reason` (still succeeds), and a new sibling asserting the no-`reason` case now correctly rejects.

## WP7 — Audit Logging Integration

**Maps to:** Business Rule #13; Technical Design's Audit Requirements and Security Considerations.

- Every WP2–WP5 service function calls the shared audit-recording utility (the same one Student/Class/School/Auth already use) after its write succeeds: Teacher onboarded, Teacher profile updated, Teacher employment status changed (metadata: previous status, new status, actor, optional reason), Teacher reinstated, Department entry created/updated/archived.
- WP6's `reason`-bearing override reuses Authentication & Authorization's own existing "Account activated"/"Account deactivated" audit events, now carrying `reason` in `metadata` when the override path was used — no new audit action code is introduced, per Naming-Conventions.md's Audit Actions section.

## WP8 — Web Frontend (School Admin)

**Maps to:** Technical Design's Frontend Design section; Business Specification's Permissions.

- `web/src/features/teachers/pages/TeachersListPage.jsx` — roster, filterable by employment status and Department, following `StudentsListPage.jsx`'s established pattern.
- `web/src/features/teachers/pages/DepartmentsPage.jsx` — Department reference-list management (create, update, archive).
- `web/src/features/teachers/components/OnboardTeacherDialog.jsx`, `EditTeacherDialog.jsx` — following `AdmitStudentDialog.jsx`/`EditStudentDialog.jsx`'s pattern.
- `web/src/features/teachers/components/EmploymentStatusActionDialog.jsx` — **one shared, parameterized dialog for all six transitions**, not six near-identical dialogs. Unlike Student Management's per-action dialogs (Enroll, Promote, Transfer each collect materially different fields), Teacher's six transitions share an identical shape — a target action and an optional reason — so one parameterized component is the right level of abstraction here, per Decision-Making-Principles' "Avoid Premature Abstraction" cutting toward consolidation, not duplication, in this specific case.
- `web/src/features/teachers/components/TeacherStatusBadge.jsx` — following `StudentStatusBadge.jsx`'s pattern.
- `web/src/features/teachers/services/teachers.service.js` — API client calls.
- `web/src/app/App.jsx`, `web/src/app/Layout.jsx` — new `/teachers` and `/departments` routes and sidebar nav entries (School Admin only), following the exact pattern already established for `/classes` and `/students`.
- The frontend never re-implements any transition's allowed-from-status guard or the account-synchronization default; it only reflects what the backend returns, per System-Architecture.md's Business Logic Ownership rule.

---

# Files Affected

All new files, except where noted.

| Area | Files | New / Modified |
|---|---|---|
| Database | `backend/prisma/schema.prisma`, `backend/prisma/migrations/` | Modified / New |
| Teacher backend | `backend/src/features/teachers/{teachers.controller,teachers.service,teachers.repository,teachers.validation,teachers.routes,index}.js` + test files | New |
| Auth backend (ACR-001) | `backend/src/features/auth/auth.service.js`, `auth.controller.js`, `auth.validation.js`, `auth.service.test.js` (revised, not just re-run), `auth.validation.test.js` (new cases for `validateAccountOverride`), `auth.routes.test.js` (new — see WP6 Route-Level Regression Tests) | **Modified** — the only existing, already-implemented feature this plan touches |
| Web | `web/src/features/teachers/{pages,components,services}/*` | New |
| Web app shell | `web/src/app/App.jsx`, `web/src/app/Layout.jsx` | Modified |
| Mobile | none this pass | Out of scope — see Scope |

No `backend/src/shared/` additions are expected — this feature calls into Authentication & Authorization's existing account-creation/activate/deactivate functions rather than adding shared code, per the Technical Design's Backend Design section.

---

# Dependencies

- **Authentication & Authorization** — Accepted and implemented; account-creation, `deactivateAccount`, and `reactivateAccount` already exist and are called directly (in-process) by WP2/WP3, always with `{ source: 'teacher_management', reason: null }`. WP6 modifies three of its files (`auth.service.js`, `auth.controller.js`, `auth.validation.js`) plus revises one existing test — a small, additive change, not a redesign, per its own Technical Design v1.4. No blocker; this plan is what resolves the previously-tracked gap.
- **School & Platform Management** — Accepted and implemented. Every Teacher belongs to a school this feature creates and keeps active. No blocker.
- **Class Management, Subject Management, Timetable, Attendance Management, Exam Management** — no dependency in either direction. This feature's Implementation does not wait on any of them, and none of them are touched by this plan.
- **Mobile bootstrap** — not a blocker for this pass (Mobile is out of scope here); remains a prerequisite for the future Mobile phase shared with Student Management's own deferred mobile screen.

---

# Risk Assessment

- **Cross-feature file modification (WP6)** — this is the first Implementation Plan in the project that modifies an already-**Accepted**, already-implemented feature's source files (`auth.service.js`, `auth.controller.js`, `auth.validation.js`) rather than only adding new ones. The change must be additive and narrowly scoped exactly as designed (a `{ source, reason }` context parameter, a service-layer guard keyed on `source` and target role) — it must not alter existing behavior for `SUPER_ADMIN`, `ACCOUNTANT`, or `STUDENT` accounts, or for any `teacher_management`-sourced call. One existing test (`auth.service.test.js`'s Teacher-deactivation case) is expected to need revision, not preservation as-is — see WP6 — since it exercises behavior Business Rule #25 intentionally changed; every other existing Authentication & Authorization test must continue to pass unchanged. `auth.routes.test.js` currently has **no** coverage of the `deactivate`/`reactivate` endpoints at all — this is a pre-existing gap, not one WP6 introduces, but it means "re-run existing tests" alone provides no regression signal for this surface; new route-level tests are mandatory (see Testing Strategy).
- **Transition-guard correctness (WP3)** — six named transitions, each with its own precondition, is the widest lifecycle-transition surface built so far after Student Management's five. Getting even one precondition wrong (e.g., allowing `terminate` from `RESIGNED`) would violate Business Rule #6's terminal-state guarantee. Every cell of the Employment Status Transition Matrix needs its own test, not just the happy path per transition.
- **Guard-by-construction discipline (WP2, WP4)** — `updateTeacherProfile` and `updateDepartment`'s DTOs must structurally exclude the fields identified in the Technical Design Review (`employmentStatus`, `employeeId`, `schoolId`, `accountId` for Teacher; `status`, `schoolId` for Department). A validation-layer check alone is a weaker guarantee than the DTO's own shape excluding the field entirely — both should be true, per Coding-Standards.md's "never trust client input" and the Technical Design's own "guard by construction, not only a runtime check" framing.
- **Department/Teacher referential integrity** — archiving a Department must never orphan or invalidate a Teacher record that already references it (Business Rule #9). This is the same class of risk Class Management's final-Class archival bug represented (caught only in that feature's Phase 9 code review) — build the guard from the outset here rather than relying on a later review to catch it.
- **`employeeId` generation collision** — the generation strategy (Implementation detail, not fixed by the Technical Design) must guarantee uniqueness within a school under concurrent Onboarding requests; rely on the database's own unique constraint as the final guarantee, not just an application-level check-then-insert, per Database-Standards.md's "protect the database itself."

---

# Testing Strategy

Per `docs/05-templates/Test-Plan-Template.md`'s categories, applied to this feature:

## Functional Tests
- Onboarding creates a Teacher with `employmentStatus: ACTIVE`, a generated `employeeId`, and a linked, enabled Account.
- Each of the six transition endpoints correctly persists the new status and triggers (or does not trigger, for `leave`) the corresponding Authentication & Authorization call, exactly per the Transition Matrix.
- Department create/update/archive/list behave per Business Rule #9, including the `includeArchived` flag's effect on `GET /departments`.
- `GET /teachers/me` / `PATCH /teachers/me` resolve strictly from the authenticated token.

## Permission Tests
- Every School-Admin-only endpoint rejects Teacher, Student, Accountant, and Super Admin callers with 403.
- `/teachers/me` and its PATCH counterpart reject non-Teacher callers with 403.
- A School Admin from School A receives 404 (never 403) when targeting a Teacher or Department belonging to School B, per Multi-Tenancy.md and the Technical Design's Error Handling section.

## Validation Tests
- `PATCH /teachers/{id}` rejects a request body containing `employmentStatus`, `employeeId`, `schoolId`, or `accountId` with 422.
- `PATCH /teachers/me` rejects any field other than `contactPhone`/`contactAddress` with 422.
- `PATCH /departments/{id}` rejects a request body containing `status` or `schoolId` with 422.
- Onboarding without an owning school context (should be structurally impossible, since `schoolId` is derived from the token, not client input) is covered as a negative test regardless.
- Authentication & Authorization's `deactivateAccount`/`reactivateAccount` reject a missing `reason` with 422 when the target account's role is `TEACHER`, and continue to accept no `reason` for `ACCOUNTANT`/`STUDENT` targets — this second half is a regression check, not a new-feature check.

## Edge Case Tests
- Every "Situation → Expected Behavior" row in the Business Specification's Edge Cases table, and every row of the Technical Design's Employment Status Transition Matrix attempted from a status not listed for it (expect 409).
- Attempting `rehire` against a `TERMINATED` or `RETIRED` Teacher (expect 409 — terminal states, per Business Rule #6).
- Archiving a Department currently referenced by an active Teacher (expect success; the Teacher's `departmentId` remains valid and readable, per Business Rule #9).
- Duplicate `employeeId` or Department `name` within the same school (expect 409); the same values reused across two different schools (expect success, per the school-scoped uniqueness design).

## Integration Tests
- Onboarding's actual call into `authService.createAccount` produces a real, queryable Account row with role `TEACHER`.
- Each transition's actual call into `authService.deactivateAccount`/`reactivateAccount` is verified against the real Account row, not mocked — consistent with this project's stated preference (per prior project feedback) for integration tests that hit real dependencies rather than mocks that could mask a broken wiring.
- WP6's override path, invoked via the actual `PATCH /accounts/{accountId}/deactivate` HTTP route against a Teacher account, correctly requires and records `reason`, and does not modify `Teacher.employmentStatus` at all — queried directly after the call to confirm.

## WP6 Route-Level Regression Tests (new — `auth.routes.test.js` currently has none for these endpoints)

Required, not optional, per this plan's Phase 5 review — "re-running existing tests" provides no coverage of this surface today:

- **Teacher override with reason** — `PATCH /accounts/{accountId}/deactivate` (and `/reactivate`) against a `TEACHER`-role account, with `reason` in the body: succeeds, and the resulting audit record's `metadata` carries the supplied `reason`.
- **Teacher override without reason** — the same request against a `TEACHER`-role account, `reason` omitted: rejected (422), no state change, consistent with Business Rule #25.
- **Non-Teacher targets** — the same requests against `ACCOUNTANT` and `STUDENT`-role accounts, with and without `reason`: both succeed either way — ACR-001 does not extend the requirement to these roles, and this must not regress.
- **Permission matrix** — `assertCanManageAccount`'s existing rules (School Admin scoped to `ACCOUNTANT`/`TEACHER`/`STUDENT` in their own school; Super Admin scoped to `SCHOOL_ADMIN`/`SUPER_ADMIN`; Super Admin barred from directly managing Teacher/Student/Accountant accounts) are verified unchanged by the new `context` parameter's presence.
- **Tenant isolation** — a School Admin from School A targeting a Teacher in School B is still rejected, regardless of `context`, per Multi-Tenancy.md.
- **Existing behavior preservation** — `auth.service.test.js`'s revised Teacher-deactivation test (see WP6) is the explicit record that this is an intentional, approved behavior change, not an accidental one; every other existing case in that file (Super Admin/School Admin permission checks, last-Super-Admin guard, lockout, role change) is re-run and must pass completely unchanged, since none of them touch a `TEACHER`-role target through the override path.

## Regression Tests
- Authentication & Authorization's full existing test suite (`auth.service.test.js`, `auth.routes.test.js`, `auth.validation.test.js`) re-run and passing after WP6's changes — with the one explicitly-revised exception noted above, and no behavior change for any non-Teacher account target or any `teacher_management`-sourced call.
- Existing Student, Class, and School test suites unaffected (this plan touches no files belonging to those features).

---

# Definition of Done Coverage

Mapped against `docs/02-standards/Definition-of-Done.md`'s checklist:

| Item | Coverage in this plan |
|---|---|
| Business logic approved | `docs/03-business/Teacher-Management.md` v1.2, Accepted (two Business Review rounds). |
| Edge cases reviewed | Business Specification's Edge Cases table plus this plan's own Testing Strategy Edge Case Tests, covering every Transition Matrix cell. |
| Technical design completed | `docs/06-technical-design/Teacher-Management.md` v1.2, Approved (two Technical Design Review rounds, plus a Phase 5-driven consistency revision). |
| Security considered | Technical Design's Security Considerations; this plan's Risk Assessment (guard-by-construction, WP6's scoped blast radius). |
| Validation completed | This plan's Validation Tests category; every endpoint's whitelist enforced per WP2/WP4/WP5. |
| Development / implementation completed | Tracked per work package (WP1–WP8) during Phase 6; not yet started as of this plan. |
| Standards followed | Naming-Conventions.md, Database-Standards.md, API-Standards.md, Security-Standards.md all cited per relevant Work Package above. |
| Code is clean | Enforced at Phase 6/Phase 9 (code review), not this planning phase. |
| No known issues remain | This plan's Risk Assessment items must each be closed (not merely acknowledged) before Phase 7 Validation. |
| Tests passed | This plan's Testing Strategy (all six categories) must pass before Phase 7. |
| Code reviewed | Per Development-Lifecycle.md Phase 9, an independent code review is required before Feature Acceptance, consistent with every prior feature. |
| Documentation updated | Business Specification, Technical Design, and this plan are already current; `docs/08-validation/Teacher-Management.md` to be produced at Phase 7. |

Every item is either already satisfied at the planning level or has an explicit, named place in this plan where it will be satisfied — none are silently deferred without a tracked location.

---

# Estimated Impact

Comparable in shape to Student Management's Implementation Plan (the widest lifecycle surface built so far, six transitions rather than five) but with one addition no prior feature's plan has had: a scoped, additive modification to an already-Accepted feature's own files (WP6). This is a deliberate, Product-Owner-approved exception to "new features only touch new files," tracked explicitly rather than treated as routine. Excluding WP6, the remainder is a self-contained new module, no larger in kind than Student Management's own first pass, with Mobile deferred the same way.

---

# Change History

- v1.0 — Initial implementation plan, following Technical Design approval (`docs/06-technical-design/Teacher-Management.md` v1.1, Approved). Scoped to Backend + Web; Mobile deferred alongside Student Management's own deferred mobile phase; ACR-001 included in scope per explicit Product Owner instruction.
- v1.1 — First Phase 5 review returned "Requires Revision": (Critical) WP6's "structural, not a runtime flag" distinction between Teacher Management's internal call and School Admin's direct override was unworkable — both reach the identical `auth.service.js` functions, and the design as written would have broken an existing test (`auth.service.test.js`'s Teacher-deactivation case) or failed to enforce Business Rule #25 at all. The review also found WP6 misattributed the reason-required check to `auth.validation.js` (no repository access, cannot know target role) and incorrectly claimed `auth.controller.js` needed no change. Resolved: replaced with an explicit `{ source: 'teacher_management' | 'authentication_override', reason }` operation-context parameter, set by the caller — `auth.controller.js` (now correctly listed as modified) sets `authentication_override`; `teachers.service.js` always sets `teacher_management`; the role-dependent "is a reason required" decision moved entirely to a new service-layer guard, with `auth.validation.js` reduced to request-shape validation only. (Major) Added a dedicated WP6 Route-Level Regression Tests subsection to Testing Strategy, since `auth.routes.test.js` had zero existing coverage of the modified endpoints — covering Teacher override with/without reason, non-Teacher targets, the permission matrix, tenant isolation, and explicit existing-behavior preservation. Corresponding updates made to Authentication & Authorization's Technical Design (v1.4) and Teacher Management's own Technical Design (v1.2) for consistency. A second Phase 5 review found two further Minor gaps, fixed in this same version: the Definition of Done Coverage table still cited Technical Design v1.1 (now v1.2), and the Files Affected table omitted `auth.routes.test.js`/`auth.validation.test.js` even though Testing Strategy requires new cases in both; the controller bullet now also explicitly states it calls `validateAccountOverride` first, matching this file's existing pattern. Approved.
