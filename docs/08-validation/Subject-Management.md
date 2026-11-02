# Subject Management — Validation Report

Version: 1.0

Status: Passed. One coverage gap found and closed during this pass (real audit-log persistence had no dedicated test — see Findings).

Feature: Subject Management

Validated against: `docs/03-business/Subject-Management.md` (v1.1), `docs/06-technical-design/Subject-Management.md` (v1.0), `docs/07-implementation-planning/Subject-Management.md` (v1.0)

Date: 2026-07-20

---

# Method

Two complementary layers of verification, neither substituting for the other:

1. **The automated suite** (`backend/src/features/subjects/*.test.js`) — 38 unit tests (repository/`schoolsService`/audit mocked) plus 27 integration tests (real HTTP via `supertest`, real dev database, no mocks), exercised against fresh Schools and School Admins created on the fly, the same pattern every other feature's own test suite in this project already follows.
2. **Independent hands-on verification performed in this pass**, supplementing rather than repeating the automated suite: direct `curl` calls against the running backend for status-code spot checks, a direct `audit_logs` table query to confirm real persistence (not just a mocked call), and a source-level grep confirming the Loose Coupling boundary (Business Rule #6) actually holds in the shipped code, not only in a passing test.

---

# Business Rules

| # | Rule | Check performed | Result |
|---|---|---|---|
| 1 | Only Super Admin creates/updates/archives/reactivates/assigns/removes; School Admin is read-only, scoped to their own school | School Admin → every catalog write endpoint and both assignment endpoints → 403 (integration suite); Super Admin → all succeed | Confirmed |
| 2 | Education Level editable only while the Subject has zero School assignments | `curl`: created an unassigned Subject, `PATCH` its `educationLevel` → 200; assigned it to a School, repeated the same `PATCH` → 409 ("currently assigned to at least one School") | Confirmed |
| 3 | Subject name uniqueness scoped per Education Level, not platform-wide | Duplicate `(name, educationLevel)` → 409; identical name, different Education Level → 201 (two independent records) | Confirmed |
| 4 | Never hard-deleted; Archive/Reactivate idempotent | No `DELETE /subjects/:id` route exists; archiving an already-Archived Subject and reactivating an already-Active one both return 200 with the status unchanged, no error | Confirmed |
| 5 | Archiving doesn't remove existing School assignments; remains visible to School Admin, clearly marked Archived; ineligible for *new* assignment | Assigned a Subject to a School, archived it → assignment still present in `GET /schools/{id}/subjects` with `subject.status: "ARCHIVED"`; attempted assigning the same Archived Subject to a second School → 409 | Confirmed |
| 6 | Assignment validated against the target School's Education Levels via the narrow `hasEducationLevel` interface — never a direct `schools` table query | `curl`: assigning a SECONDARY-only Subject to a School holding only PRIMARY → 409; source grep for `prisma.school` anywhere under `backend/src/features/subjects/` → zero matches | Confirmed |
| 7 | Education Level assignment (ACR-003) and Subject assignment are two independent, non-cascading actions | Gave a School a new Education Level via `PATCH /schools/{id}/education-levels` → zero Subjects auto-assigned; assigning a Subject afterward is a separate, explicit call | Confirmed |
| 8 | Subject-to-School removal is gated by a dependency-validation extension point; no dependent exists yet, so removal always succeeds today | `registerRemovalDependencyCheck` mechanics verified via unit tests (single blocker, multi-checker ordering/short-circuit, all-clear); grep confirms zero real callers exist outside the test file — the registry ships empty, per Technical Design Requirement #6 | Confirmed |
| 9 | This feature builds no consumption by Class Management, Teacher Management, Timetable, Exams, Marks, or Report Cards | Structural — no route or service function in this feature reaches into any of those modules; the Stable Public Service Interface (`getSubjectById`, `isSubjectAssignedToSchool`, `listSchoolSubjects`, `registerRemovalDependencyCheck`) is the only surface exposed, none of it consumed anywhere yet | Confirmed |
| 10 | Super Admin views the full platform-wide catalog and every School's assignments; School Admin views only their own school's | School Admin → `GET /subjects` (platform catalog) → 403; School Admin → `GET /schools/{ownSchoolId}/subjects` → 200; same School Admin → another school's `subjects` → 404 | Confirmed |
| 11 | Every Subject lifecycle event and every assignment change is audited | See Findings below — closed a real coverage gap during this pass | Confirmed (after fix) |
| 12 | Subject is a platform-wide entity, owned by no single school; only its assignment is tenant-scoped | Schema inspection: `Subject` has no `schoolId` column; direct `audit_logs` query confirms `SUBJECT_CREATED` rows carry `schoolId: null` while `SUBJECT_ASSIGNED_TO_SCHOOL`/`SUBJECT_ASSIGNMENT_REMOVED` carry the real target `schoolId` | Confirmed |

---

# Finding: audit-log persistence had no dedicated test for this feature

Every write function in `subjects.service.js` calls `recordAuditEvent`, and each has a unit test asserting it was *called*, against a mocked repository — but nothing in this feature's own test suite had verified an event is actually *persisted* to the real `audit_logs` table, the same gap Teacher Management's own Phase 6 Completion Review first identified and closed project-wide (`docs/00-governance/Development-Roadmap.md`, Teacher Management's WP7).

**Resolved during this pass**: queried `audit_logs` directly and confirmed real rows land correctly — `SUBJECT_CREATED` with `schoolId: null` (platform-wide, per Business Rule #12), `SUBJECT_ASSIGNED_TO_SCHOOL`/`SUBJECT_ASSIGNMENT_REMOVED` with the real target `schoolId`. Two new integration tests added to `subjects.routes.test.js` (`describe('Audit Trail persistence (Business Rule #11, #12)')`) query the table directly rather than a mock, so a future regression here is now caught automatically. Full suite: 494/494.

This is a **test-coverage gap**, not a code defect — the audit-writing code itself was correct throughout; it simply had no dedicated real-persistence test for this specific feature until now.

---

# Permissions & Security

| Check | Expected | Result |
|---|---|---|
| No auth token → `GET /subjects` | 401 | 401 — confirmed |
| School Admin → any catalog write endpoint (create/update/archive/reactivate) | 403 | 403 — confirmed |
| School Admin → `POST`/`DELETE /schools/{id}/subjects/{subjectId}` (assign/remove) | 403 | 403 — confirmed |
| Cross-tenant: School Admin A → `GET /schools/{School B's id}/subjects` | 404, not 403 — following Class/Teacher/Student Management's convention (Technical Design's explicit choice, distinct from School Management's own 403 for its `/schools/{id}` resource) | 404 — confirmed |
| `schoolId` in the assignment routes is always the path parameter, validated against the token for School Admin (`assertSchoolAccessible`) — never trusted as an implicit tenant claim | Code inspection — `listSchoolSubjects`/assign/remove all take `schoolId` explicitly and check it, no route infers tenant from anywhere else | Confirmed |
| Subject Management never queries the `schools` table directly (Loose Coupling, ACR-003) | `grep -r "prisma.school" backend/src/features/subjects/` → no matches | Confirmed |

---

# Validation & Error Handling

| Check | Expected | Result |
|---|---|---|
| Create Subject with missing `name` | 422 | 422 — confirmed |
| Create Subject with invalid `educationLevel` (`"TERTIARY"`) | 422 | 422 — confirmed |
| Update/archive/reactivate a nonexistent Subject | 404 | 404 — confirmed |
| Duplicate `(name, educationLevel)` on creation | 409 | 409 — confirmed |
| `educationLevel` change while assigned | 409 | 409 — confirmed |
| Assign an Archived Subject | 409 | 409 — confirmed |
| Assign to a School lacking the required Education Level | 409 | 409 — confirmed |
| Remove a never-made or already-removed assignment | 404 | 404 — confirmed |
| Errors never leak internal implementation details | Every response above returned a clean `{ success, message, errors }` envelope, no stack trace or internal identifier | Confirmed |

---

# Edge Cases

All rows in the Business Specification's Edge Cases table are covered by the automated integration suite (27 tests, real HTTP + real DB) — re-verified here by reading each test against its corresponding table row, not re-run by hand one at a time. No gap found.

---

# Regression

Full backend suite (21 suites, 494 tests as of this report, including every other feature's own tests) passes unchanged after this feature's Implementation and this Validation pass's one added test file change. No shared file outside `backend/src/features/subjects/` and `backend/src/app.js` (route registration) was touched by this feature. (The suite grew further, to 503, during the subsequent independent code review — see this document's own Addendum.)

---

# Performance

No load/scale testing performed — out of scope per the Technical Design's Performance Considerations. The Subject catalog is expected to remain small and curated (Super Admin manually defines each entry; bulk import is explicitly descoped), and `SchoolSubject` is indexed on both `schoolId` and `subjectId` independently.

---

# Outcome

All 12 Business Rules confirmed (Business Rule #11 confirmed only after this pass's own fix — see Findings). All Permission/Security, Validation/Error-Handling, and Regression checks pass. **Phase 7 (Validation) is complete.**

Independent code review and Phase 9 (Feature Acceptance) are separate, not-yet-started steps, per the Product Owner's own phase-gating direction for this feature — this report does not claim readiness for either.

---

# Addendum — Independent Code Review Followed This Report

An independent code review (Development-Lifecycle.md Phase 9's prerequisite, conducted after this report was finalized) found and fixed 2 Major findings this Validation pass did not catch: a concurrency race in `assignSubjectToSchool` (concurrent identical requests could 500 instead of idempotently succeeding) and missing query-filter validation on `GET /subjects` (an invalid filter also 500'd instead of a clean 422). Both were live-reproduced, fixed, and reconfirmed; a related test-coverage gap was closed too. See `docs/00-governance/Code-Review-Report.md`'s Subject Management section for full detail — this report is left as-is, a point-in-time record of what Phase 7 itself found, not rewritten to retroactively include findings from the later, separate review pass.

---

# Feature Acceptance Checklist (Development-Lifecycle.md Phase 9)

Per `docs/02-standards/Definition-of-Done.md`:

| Item | Status |
|---|---|
| Business logic approved | ✅ `docs/03-business/Subject-Management.md` v1.1, Accepted (Phase 3 Business Review) |
| Edge cases reviewed | ✅ Business Spec's Edge Cases table; re-verified in this report's own Edge Cases section |
| Technical design completed | ✅ `docs/06-technical-design/Subject-Management.md` v1.1, Approved |
| Security considered | ✅ Technical Design's Security Considerations; re-verified above (auth, role, tenant isolation, `hasEducationLevel`-only boundary) and by the independent code review (mass-assignment/Guard-by-Construction, tenant-check coverage) |
| Validation completed | ✅ This report, plus its own Addendum covering the subsequent code review |
| Development / implementation completed | ✅ Backend + Web, built and verified live in the browser (Super Admin catalog, School assignment, School Admin's read-only view) |
| Standards followed | ✅ Feature-based architecture, repository-only Prisma access, RBAC via `requireRole`, Guard by Construction, audit events on every write |
| Code is clean | ✅ No code-quality/smell findings from the independent review; its 2 Major findings were functional/robustness defects (a concurrency race, a missing validation layer), not cleanliness concerns |
| No known issues remain | ✅ Both Major code-review findings fixed, tested, and live-reconfirmed. The dependency-validation registry shipping with zero registered checkers is a deliberate, documented interim state (Business Rule #8), not an open issue |
| Tests passed | ✅ Automated suite for this feature (unit + integration, including audit-persistence and concurrency-race regression tests added during Validation and code review). Full backend suite: 503/503. See `backend/src/features/subjects/*.test.js` |
| Code reviewed | ✅ Independent review by an isolated agent with no access to this implementation's history. Found 2 Major findings; both fixed, covered by new tests, and verified live against the running application. See `docs/00-governance/Code-Review-Report.md` |
| Documentation updated | ✅ Business Spec, Technical Design, Implementation Plan, this Validation Report, Code Review Report, `Documentation-Map.md`, and `Project-Glossary.md` (new "Education Level" and "Subject Assignment" terms) all current as of Phase 8 |

All items satisfied. **Subject Management is Accepted.**

---

# Change History

- v1.0 — Initial Validation Report, following Phase 6 Implementation. One coverage gap found (audit-log persistence untested for this feature) and closed within this same pass; no other defects found. Addendum added after this report was finalized, noting the subsequent independent code review's own findings (see `docs/00-governance/Code-Review-Report.md`). Feature Acceptance Checklist added following Phase 8 (Documentation) — all items satisfied, Product Owner directed Phase 9, feature Accepted.
