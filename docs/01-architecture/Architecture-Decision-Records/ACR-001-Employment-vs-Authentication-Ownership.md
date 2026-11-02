# Architecture Change Request: Employment vs Authentication Ownership

ACR Number: ACR-001

Date: 2026-07-17

Status: Approved

---

# Context

Teacher Management's Phase 3 Business Review (Development-Lifecycle.md) found a Critical cross-feature integration defect: Authentication & Authorization's existing generic action — "Only School Admin may create, deactivate, or reactivate Teacher, Accountant, and Student accounts within their own school" (Authentication-and-Authorization.md, prior Business Rule #6) — was never reconciled with Teacher Management's new employment-status-driven account synchronization (Teacher-Management.md Business Rule #5: Active enables the account; On Leave leaves it unchanged; Resigned/Terminated/Retired disable it).

As written, nothing prevented School Admin from directly disabling or enabling a Teacher's account through Authentication's generic action without any corresponding employment-status change occurring in Teacher Management. This risked employment status and account status silently diverging, with no "Teacher employment status changed" audit event capturing what is, in effect, an access-affecting change to the Teacher's standing — a violation of Project-Constitution.md Principle 13 (Data Integrity — no inconsistent states) and Principle 14 (Auditability).

---

# Options Considered

**Option A — Remove Authentication's generic account control for Teacher accounts entirely.**
All Teacher account changes would be required to go through Teacher Management. Rejected: this removes a legitimate administrative/security capability — for example, immediately disabling a compromised Teacher account without waiting for or forcing an employment-status change that may not yet be true.

**Option B — Leave both mechanisms fully independent, with no reconciliation (status quo).**
Rejected: this is the defect the Business Review identified. It risks silent divergence between employment status and account status, and an audit gap on the employment side.

**Option C — Split ownership by concern (Selected).**
Teacher Management owns employment-lifecycle decisions and drives account changes for ordinary employment events (Onboarding, employment-status changes, Reinstatement). Authentication & Authorization retains a narrower, explicitly-governed administrative/security override capability over the same account, subject to new constraints.

---

# Decision

Option C is adopted.

- **Business ownership** — Teacher Management owns employment-lifecycle decisions (Active, On Leave, Resigned, Terminated, Retired) and is the sole source of truth for employment state.
- **Technical ownership** — Authentication & Authorization owns account (login) lifecycle mechanics.
- Normal employment workflows (Onboarding/Hire, Resign, Terminate, Retire, Return from Leave, Rehire) initiate account enable/disable exclusively through Teacher Management, per Teacher-Management.md Business Rule #5.
- Authentication & Authorization retains its generic account activate/deactivate capability over a Teacher account, but only as an administrative or security override — never as a substitute for an ordinary employment-lifecycle transition.

## Requirements

- Every Authentication & Authorization override on a Teacher account must be audited.
- Every such override must record the acting user and a reason.
- Every such override must never modify Teacher Management's employment status.
- Teacher Management remains the source of truth for employment state, regardless of any override performed through Authentication & Authorization.
- **(Added by Teacher Management's Phase 9 code review, Authentication-and-Authorization.md Business Rule #26)** While an override is in effect, Teacher Management's own routine reactivating transitions (Return from Leave, Rehire) must not silently undo it — the override must remain in effect until explicitly lifted through Authentication & Authorization's own override capability. The initial implementation had no such guard: a routine, unrelated HR action could re-enable an account an administrator had deliberately deactivated mid-investigation, defeating the override's practical purpose described in Reasoning below.

---

# Reasoning

This preserves Authentication & Authorization's legitimate operational capability (e.g., emergency account disablement ahead of any HR paperwork) while making Teacher Management the unambiguous source of truth for employment state, closing the audit gap the Business Review identified. It follows the same "business ownership vs. technical/operational ownership" split already established elsewhere in the project — e.g., Class Management owns Class structure while Timetable owns Teacher-to-Class assignment and scheduling.

---

# Consequences

## Positive

- Closes the Critical data-integrity and auditability gap found in Business Review.
- Preserves a legitimate emergency/security override path without removing operational flexibility.
- Establishes a reusable ownership pattern (business lifecycle vs. account mechanics) that later features referencing an account can follow.

## Negative

- Amends an already-**Accepted** document (Authentication & Authorization), requiring a formal Change Request rather than a routine edit.
- Requires Teacher Management's own Technical Design (Phase 4) and Implementation (Phase 6) to build the override's reason-recording and independent audit trail; Authentication & Authorization's code is not changed by this ACR alone.

## Future Impact

- The same latent overlap (a generic Authentication account action alongside a feature-owned lifecycle) also exists for Student Management, which was never reconciled either. This ACR does not extend to Student Management. If the same override discipline is wanted there, it requires its own Change Request against Student Management and Authentication & Authorization — it is not automatically inherited from ACR-001.

---

# Related Documents

- `docs/03-business/Teacher-Management.md` — Business Rules #4, #5.
- `docs/03-business/Authentication-and-Authorization.md` — Business Rule #25 (added by this ACR).
