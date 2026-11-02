# Academic Year Management — Validation Report

Version: 1.0

Status: Passed. No defects found.

Feature: Academic Year Management

Validated against: `docs/03-business/Academic-Year-Management.md` (v1.1), `docs/06-technical-design/Academic-Year-Management.md` (v1.0), `docs/07-implementation-planning/Academic-Year-Management.md` (v1.0)

Date: 2026-07-21

---

# Method

Two complementary layers of verification, neither substituting for the other:

1. **The automated suite** (`backend/src/features/academic-years/*.test.js`) — 35 unit tests (repository mocked, `prisma.$transaction` mocked per Teacher Management's own established pattern) plus 24 integration tests (real HTTP via `supertest`, real dev database, no mocks).
2. **Independent hands-on verification performed in this pass**, going beyond what the automated suite already proves:
   - A direct SQL attempt to insert two `isCurrent = true` rows for the same school, bypassing the application entirely, to prove the partial unique index is a genuine backstop, not just a documented claim.
   - Live `curl` exercises of create → update → archive → reactivate against the running server, with the resulting `audit_logs` rows queried directly to confirm all five event types persist (the automated suite's own audit test only covered `ACADEMIC_YEAR_CREATED` and `ACADEMIC_YEAR_CURRENT_CHANGED`).
   - A source-level grep confirming `isCurrent` is written in exactly one place (`academic-years.repository.js`'s `unsetCurrent`/`setCurrent`), both only ever called from `setCurrentAcademicYear` — the choke-point discipline the Technical Design's Risks section specifically asked Phase 7 to verify.
   - Structural confirmation the live schema matches the design (`\d academic_years` against the running Postgres instance).

---

# Business Rules

| # | Rule | Check performed | Result |
|---|---|---|---|
| 1 | Only School Admin has authority over Academic Year data | Super Admin → every endpoint → 403 (live `curl` + integration suite) | Confirmed |
| 2 | School-scoped, not platform-wide | Structural — `schoolId` always from the token, never a route parameter or body field | Confirmed |
| 3 | Start/end dates required; no overlap, including against Archived years | Integration suite: overlapping Active → 409; overlapping Archived → 409 | Confirmed |
| 4 | No stored name; label derived as `YYYY/YYYY`; no duplicate derived label within a school | Integration suite: two non-overlapping ranges deriving the same label → 409. Structural: `\d academic_years` confirms no name/label column exists | Confirmed |
| 5 | Never hard-deleted; Archive/Reactivate idempotent | No `DELETE` route exists; re-archiving/re-reactivating both return 200 unchanged | Confirmed |
| 6 | Dates remain editable regardless of Active/Archived status | Integration suite: editing an Archived Academic Year succeeds | Confirmed |
| 7 | Archiving doesn't invalidate existing references; ineligible for new use until reactivated | Structural — no consumer exists yet to reference an Academic Year (Business Rule #11), so this is not yet reachable; the Archived-not-eligible-for-Current half is directly confirmed (see Rule #8) | Confirmed (as far as currently reachable) |
| 8 | Exactly one Current per school; re-designating already-Current is a no-op; Archived can't be Current | Integration suite covers all three; live `curl` re-confirms the no-op case | Confirmed |
| 9 | Zero Academic Years allowed initially; first one auto-becomes Current; Current never empty; archiving Current requires a replacement | Integration + live Playwright verification (Phase 6): first year auto-Current, second not, archive-without-replacement → 409, archive-with-replacement → atomic swap confirmed via follow-up `GET` | Confirmed |
| 10 | Non-Archived years (not just Current) eligible for future Enrollment/Promotion use | Not yet reachable — no consumer exists yet (Business Rule #11); this rule's own claim is about a future feature's behavior, not this feature's | N/A until Student Management's own ACR |
| 11 | This feature doesn't change Student Management's current behavior | Structural — no file outside `backend/src/features/academic-years/` and `backend/src/app.js` (route registration) was touched | Confirmed |
| 12 | Existing free-text `Enrollment.academicYear` untouched | Structural — `Student.academicYear` schema and code unmodified | Confirmed |
| 13 | Every lifecycle event and Current-designation change audited | Live `curl` round trip (create → update → archive → reactivate) plus a Current-designation change, all five actions confirmed as real, persisted `audit_logs` rows with correct `schoolId`/`userId` | Confirmed |

---

# Permissions & Security

| Check | Expected | Result |
|---|---|---|
| No auth token → `GET /academic-years` | 401 | 401 — confirmed |
| Super Admin → any endpoint | 403 (no operational role, per Actors section) | 403 — confirmed |
| Cross-tenant: School Admin B → `PATCH` a School A Academic Year | 404, not 403 (Class/Teacher/Student Management's convention) | 404 — confirmed (integration suite) |
| `schoolId` always derived from the authenticated token | Code inspection — no route accepts a client-supplied `schoolId` | Confirmed |
| `isCurrent` is written in exactly one place, only reachable through `setCurrentAcademicYear` | `grep -rn "isCurrent" backend/src/features/academic-years/*.js` (excluding tests) — only `repository.js`'s `unsetCurrent`/`setCurrent`, both called only from the service's `setCurrentAcademicYear` | Confirmed |
| The partial unique index is a real backstop, not just documented | Direct SQL insert of a second `isCurrent = true` row for the same school, bypassing the application — rejected by Postgres | Confirmed |

---

# Validation & Error Handling

| Check | Expected | Result |
|---|---|---|
| Create with missing/invalid dates | 422 | 422 — confirmed |
| Create with `endDate` not after `startDate` | 422 | 422 — confirmed |
| Update/archive/reactivate/designate-current a nonexistent Academic Year | 404 | 404 — confirmed |
| `GET /academic-years?status=BOGUS` | 422, not 500 (built in from the start this time — Implementation Plan's own stated lesson from Subject Management) | 422 — confirmed |
| Overlapping range (Active or Archived) | 409 | 409 — confirmed |
| Duplicate derived label | 409 | 409 — confirmed |
| Archive the Current year without `newCurrentAcademicYearId` | 409 | 409 — confirmed |
| Designate an Archived year as Current | 409 | 409 — confirmed |
| Errors never leak internal implementation details | Every response above returned a clean `{ success, message, errors }` envelope | Confirmed |

---

# Edge Cases

All rows in the Business Specification's Edge Cases table are covered by the automated integration suite (24 tests) — re-verified here by reading each test against its corresponding row. No gap found. The one edge case not yet reachable (archiving affecting an existing external reference) is correctly out of scope, since no consumer of Academic Year data exists yet.

---

# Regression

Full backend suite (24 suites, 562 tests, including every other feature's own tests) passes unchanged after this feature's Implementation and this Validation pass. No shared file outside `backend/src/features/academic-years/` and `backend/src/app.js` was touched by this feature, consistent with Business Rules #11/#12's own claim that Student Management is untouched.

---

# Performance

No load/scale testing performed — out of scope per the Technical Design's Performance Considerations. An Academic Year list per school is expected to remain small (a handful of years, manually created by School Admin).

---

# Accepted Technical Debt — Reconfirmed, Not Re-Litigated

The Technical Design's own Risks section, and the Product Owner's explicit follow-up decision, already establish that the overlap and duplicate-label checks have no database-level backstop (unlike the Current invariant, which this report independently reconfirmed above). This Validation pass does not treat that as a finding — it was already a deliberate, accepted, documented trade-off before Implementation began. Nothing in this pass changes that assessment.

---

# Outcome

All 13 Business Rules confirmed (two — #7, #10 — confirmed only as far as currently reachable, since no consumer of Academic Year data exists yet; this is expected, not a gap, per the Business Specification's own Scope). All Permission/Security, Validation/Error-Handling, and Regression checks pass. No defects found during this validation pass — the same clean outcome Class Management's own Phase 7 report reached, not the more common pattern (School, Student, Teacher, and Subject Management's own reports each found and closed at least one real gap during Validation). **Phase 7 (Validation) is complete.**

Independent code review and Phase 9 (Feature Acceptance) are separate, not-yet-started steps.

---

# Addendum — Independent Code Review Found What This Report Missed

The independent code review that followed this report found and fixed **2 Critical concurrency findings** this Validation pass's own hands-on checks did not catch: a concurrent archive + designate-Current race could corrupt a record into simultaneously `ARCHIVED` and `isCurrent: true`, and concurrent first-Academic-Year creations for the same school could 500. Both were live-reproduced, fixed with a per-school Postgres advisory lock, and reconfirmed live.

Worth being direct about why this Validation pass's own methodology missed them: this report's structural grep check (Permissions & Security table, above) confirmed `isCurrent` is written in only one place — a true statement — but concluded from it that the write path was safe, without testing what happens when two requests reach that one place *at the same time*. Every hands-on check performed here was sequential, one request at a time; the code review's own method (firing genuinely concurrent requests via `Promise.all` against the running server) is what actually surfaced the defects. This is a real methodology gap in how this report approached concurrency, not just an unlucky miss — future Validation passes for features with a similar "exactly one X per school" invariant should include a concurrent-request check as a standard part of Phase 7, not defer it entirely to Phase 9.

See `docs/00-governance/Code-Review-Report.md`'s Academic Year Management section for full detail — this report is left as-is above, a point-in-time record of what Phase 7 itself found (and didn't find), not rewritten to retroactively claim credit for the later review's findings.

---

# Feature Acceptance Checklist (Development-Lifecycle.md Phase 9)

Per `docs/02-standards/Definition-of-Done.md`:

| Item | Status |
|---|---|
| Business logic approved | ✅ `docs/03-business/Academic-Year-Management.md` v1.1, Accepted (Phase 3 Business Review) |
| Edge cases reviewed | ✅ Business Spec's Edge Cases table; re-verified in this report's own Edge Cases section |
| Technical design completed | ✅ `docs/06-technical-design/Academic-Year-Management.md` v1.1, Approved |
| Security considered | ✅ Technical Design's Security Considerations; re-verified above (role gates, tenant isolation) and by the independent code review (mass assignment, concurrency correctness of the `isCurrent` invariant) |
| Validation completed | ✅ This report, plus its own Addendum covering the subsequent code review |
| Development / implementation completed | ✅ Backend + Web, built and verified live in the browser (first-year auto-Current, second-year not auto-Current, archive-with-replacement transaction) |
| Standards followed | ✅ Feature-based architecture, repository-only Prisma access, RBAC via `requireRole`, Guard by Construction, audit events on every write |
| Code is clean | ✅ No code-quality/smell findings from the independent review; its 2 Critical findings were concurrency-correctness defects (unlocked check-then-act sequences), not cleanliness concerns |
| No known issues remain | ✅ Both Critical code-review findings fixed, tested, and live-reconfirmed with the identical reproduction steps. The overlap/duplicate-label checks' lack of a database backstop remains, but is explicit, deliberate, Product-Owner-accepted Accepted Technical Debt (see this report's own section above), not an open issue |
| Tests passed | ✅ Automated suite for this feature (unit + integration, including 2 new tests that fire genuinely concurrent requests to prove the Postgres advisory lock fix). Full backend suite: 564/564. See `backend/src/features/academic-years/*.test.js` |
| Code reviewed | ✅ Independent review by an isolated agent with no access to this implementation's history. Found 2 Critical findings; both fixed, covered by new tests, and verified live against the running application with the exact concurrent-request reproduction that first surfaced them. See `docs/00-governance/Code-Review-Report.md` |
| Documentation updated | ✅ Business Spec, Technical Design, Implementation Plan, this Validation Report (+ Addendum), and Code Review Report all current |

All items satisfied. **Academic Year Management is Accepted.**

---

# Change History

- v1.0 — Initial Validation Report, following Phase 6 Implementation. No defects found; the DB-level backstop for the Current invariant was independently reconfirmed via a direct SQL bypass attempt, and audit persistence was independently reconfirmed for all five event types. Addendum added after this report was finalized, acknowledging the subsequent independent code review found 2 Critical concurrency findings this report's own sequential-only testing missed (see `docs/00-governance/Code-Review-Report.md`). Feature Acceptance Checklist added following Phase 9 — all items satisfied, Product Owner directed Phase 9, feature Accepted.
