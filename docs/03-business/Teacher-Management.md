# Teacher Management

Version: 1.4

Status:
- Accepted — Phase 9 (Feature Acceptance) complete; see `docs/00-governance/Development-Roadmap.md`. Amended in place (v1.4) by a post-Acceptance Product Owner decision removing the Department reference list — see Change History.

---

# Purpose

`TEACHER` already exists as a role in Authentication & Authorization — it can be created, deactivated, and reactivated by a School Admin, and can log in — but no feature owns a Teacher as a business entity. There is no profile, no employment record, nothing beyond a bare account.

This feature defines how a Teacher comes into existence within a school (Onboarding), how their professional identity is recorded and maintained (Profile), and how their employment relationship with the school changes over time (Active, On Leave, Resigned, Terminated, Retired) — independently of their login-account status, which remains owned by Authentication & Authorization.

Without this feature, Timetable has no Teacher entity to assign to a Class or Subject, and Attendance has no Teacher entity to record against — each would otherwise have to invent a placeholder Teacher model to work around the gap, the same anti-pattern that led to Class Management being re-sequenced ahead of Student Management. Teacher Management closes that gap, the same role Student Management plays for Student.

---

# Scope

## Included

- Onboarding a new Teacher into a school.
- Creating the Teacher's own login account as part of Onboarding (triggering Authentication & Authorization's account-creation mechanics).
- Maintaining a Teacher's professional staff profile: personal information, employment information, professional information, and system information.
- Managing a Teacher's employment status over time: Active, On Leave, Resigned, Terminated, Retired.
- Reinstating a Teacher from On Leave back to Active (Return from Leave), or from Resigned back to Active (Rehire).
- A Teacher viewing their own profile and employment information, and editing their own approved personal contact information.

## Not Included

- Assigning a Teacher to a Class or Subject, and scheduling — owned by Timetable, per Class-Management.md's own precedent ("Assigning a Teacher to a Class or Subject, and scheduling — owned by Timetable").
- Attendance recording against a Teacher — owned by Attendance Management; it only references the Teacher record this feature creates.
- Subject definition or curriculum structure — owned by Subject Management.
- The mechanics of authentication itself (login, credential recovery, lockout) — owned by Authentication & Authorization. This feature defines when a Teacher's account is enabled or disabled as a *consequence* of an employment-lifecycle event; Authentication & Authorization separately owns an independent administrative/security override capability over the same account, per ACR-001 (`docs/01-architecture/Architecture-Decision-Records/ACR-001-Employment-vs-Authentication-Ownership.md`).
- Reinstating a Terminated or Retired Teacher — permanent states within this feature; no restore action exists for either. See Business Rule #6 and the Administrative Corrections backlog feature.
- Payroll, salary, and compensation.
- Leave balances and leave-request workflows (distinct from the coarse "On Leave" employment status this feature tracks).
- Performance reviews.
- Employment contracts.
- Tax information.
- Teaching load (number of periods/subjects taught) — a Timetable concern.
- **A Department or Subject reference list of any kind (v1.4).** An earlier version of this document gave School Admin ownership of a per-school Department reference list, with an optional Teacher → Department assignment. Removed by Product Owner decision after domain clarification: the school organizes around curriculum Subjects (e.g., Mathematics, Physics, Xisaab, Cilmiga Bulshada), not administrative Departments, and Subjects are needed by multiple future modules (Subject Management, Class Management, Timetable, Exams, Marks, Report Cards) — modeling them inside Teacher Management would duplicate the future Subject Management feature and create conflicting ownership. Subject Management (backlog/future-sequenced) will be the single source of truth for curriculum Subjects; Teacher ↔ Subject assignment is a future integration owned there, not by this document. See Change History v1.4.

---

# Actors

- **School Admin** — the only actor who manages a Teacher's employment lifecycle (Onboarding, profile updates, employment-status changes, reinstatement) within their own school.
- **Teacher** — the subject of this feature; may view their own record and edit their own approved personal contact information.
- **Super Admin** — has no operational role here, consistent with School-Management.md: Super Admin must never become part of a school's day-to-day business operations.

Permissions for any other role (Student, Accountant) over Teacher data are owned by Authentication & Authorization's RBAC model, not by this document.

---

# Permissions

## School Admin

- May onboard a new Teacher into their own school.
- May update a Teacher's profile (personal, employment, and professional information) within their own school.
- May change a Teacher's employment status (Active, On Leave, Resigned, Terminated, Retired) within their own school.
- May reinstate a Teacher from On Leave to Active (Return from Leave) or from Resigned to Active (Rehire) within their own school.
- May not reinstate a Terminated or Retired Teacher — those are permanent within this feature.
- May not onboard or otherwise manage a Teacher belonging to another school.

## Teacher

- May view their own profile and employment information.
- May edit their own approved personal contact information only.
- May not edit their own employment information, professional information, or employment status.
- May not view another Teacher's record.

## All Other Roles

- This feature defines no permissions for any role other than School Admin and Teacher. Any other role's access to Teacher data is owned by Authentication & Authorization's RBAC model, not by this document.

---

# Business Workflow

## 1. Onboarding

1. School Admin registers a new Teacher into their own school, capturing personal, employment, and professional information.
2. The system generates an Employee/Staff ID, unique within the school and immutable once created.
3. As part of Onboarding, a Teacher login account is created, per Authentication & Authorization's account-creation mechanics — the same path Student Management already reuses for the `STUDENT` role.
4. The new Teacher account follows the same initial-credential-setup process as any other created account.
5. A newly onboarded Teacher's employment status is Active, and the account is enabled per Business Rule #5's default synchronization.

## 2. Profile Maintenance

1. School Admin may update a Teacher's personal, employment, and professional information at any time.
2. The Employee/Staff ID is immutable once generated and cannot be edited by anyone, including School Admin.
3. Profile updates do not, by themselves, change employment status.

## 3. (Removed v1.4 — Department Reference List Management)

This workflow was removed by Product Owner decision; see Scope's Not Included and Change History v1.4. Numbering from #4 onward is preserved as-is (not renumbered) since other documents cite these workflow numbers directly.

## 4. Employment Status Changes

1. School Admin changes a Teacher's employment status among Active, On Leave, Resigned, Terminated, and Retired.
2. Each change applies this feature's default account-synchronization rule (Business Rule #5): Active enables the account; On Leave leaves the account unchanged; Resigned, Terminated, and Retired disable the account. This uses Authentication & Authorization's existing activation/deactivation mechanics — it never invents a new one.
3. Overriding the default synchronization is only possible through Authentication & Authorization's administrative/security override workflow (ACR-001) — never as an ordinary part of this workflow. Such an override requires School Admin to record a reason, is independently audited by Authentication & Authorization, and never changes the Teacher's employment status recorded here.
4. Every employment-status change is recorded for audit purposes, including the previous status, new status, who made the change, when, and an optional reason.

## 5. Reinstatement

1. Return from Leave: School Admin moves a Teacher from On Leave back to Active; the account is enabled, per Business Rule #5's default for Active.
2. Rehire: School Admin moves a Teacher from Resigned back to Active; the account is enabled, per Business Rule #5's default for Active.
3. Terminated and Retired are permanent within this feature — no reinstatement action exists for either. Correcting a mistaken Termination or Retirement requires the separate Administrative Corrections process (backlog feature), not a simple restore.
4. Reinstatement is recorded for audit purposes.

## 6. Self-Service

1. A Teacher logs in and views their own profile and employment information.
2. A Teacher may update their own approved personal contact information. All other fields — employment information, professional information, and employment status — remain School Admin-managed and read-only to the Teacher.
3. A Teacher never sees another Teacher's record, per Multi-Tenancy's tenant- and self-scoped access.

---

# Business Rules

1. Only School Admin may onboard a new Teacher into their own school.
2. A Teacher belongs to exactly one school at a time, per Multi-Tenancy.
3. Every onboarded Teacher is issued individual login credentials as part of Onboarding, the same account-creation mechanics Authentication & Authorization already provides for `TEACHER`.
4. Teacher Management owns the employment lifecycle (Active, On Leave, Resigned, Terminated, Retired); Authentication & Authorization owns the separate account (login) lifecycle. Per ACR-001, normal employment-lifecycle transitions — Onboarding, employment-status changes, and Reinstatement — are the only path through which this feature changes a Teacher's account status; Authentication & Authorization's generic account activation/deactivation action is reserved exclusively for an administrative or security override, never for an ordinary employment-lifecycle transition.
5. Employment-status changes synchronize account status by default: Active enables the account; On Leave leaves the account unchanged (no automatic enable or disable); Resigned, Terminated, and Retired disable the account. This default may only be overridden through Authentication & Authorization's administrative/security override workflow (ACR-001), which must record the acting user and a reason, must be independently audited, and must never modify this feature's employment status — Teacher Management remains the sole source of truth for employment state regardless of any such override.
6. On Leave → Active (Return from Leave) and Resigned → Active (Rehire) are reversible business events. Terminated and Retired are permanent; no reinstatement action exists for either within this feature. Correcting a mistaken Termination or Retirement is a separate administrative correction process (Administrative Corrections, backlog), not a simple restore — mirroring Transfer's and Graduation's permanence in Student Management.
7. Terminated and Retired Teacher records are archived and retained permanently; a Teacher record is never hard-deleted, regardless of employment status, per the project's Archive Before Delete principle (Decision-Making-Principles.md, Principle 16).
8. Every Teacher is assigned a system-generated Employee/Staff ID at Onboarding. It is immutable once created and unique within its own school, not platform-wide.
9. **(Removed v1.4)** This rule previously defined a School Admin-owned Department reference list. Removed by Product Owner decision — the school's organizing concept is curriculum Subjects, owned by the future Subject Management feature, not an administrative Department owned here. See Scope's Not Included and Change History v1.4.
10. Only School Admin may update a Teacher's employment information, professional information, and employment status within their own school. A Teacher may update only their own approved personal contact information; they may never edit their own employment status, employment information, or professional information.
11. A Teacher's professional staff profile includes four categories: Personal Information (full name, contact information), Employment Information (employee/staff ID, joining date, employment status, employment type), Professional Information (qualifications, subject specializations, and relevant experience, where the exact field list for experience is a Technical Design decision), and System Information (linked User Account, School, and audit metadata). Exact required fields within each category are a Technical Design decision.
12. A Teacher may access only their own profile and employment information; they may never view or modify another Teacher's record.
13. Every Teacher lifecycle event (Onboarding, profile update, employment-status change, reinstatement) must be recorded for audit purposes.
14. This feature does not track payroll, salary, leave balances, performance reviews, employment contracts, tax information, timetable assignments, or teaching load — those remain out of scope per this document's Scope section.

---

# Edge Cases

| Situation | Expected Behavior |
|---|---|
| School Admin attempts to onboard a Teacher without an owning school | Not possible; every Teacher belongs to exactly one school, per Business Rule #2. |
| School Admin sets a Teacher's employment status to On Leave | Account status is left unchanged; there is no automatic enable or disable, per Business Rule #5. |
| School Admin changes a Teacher's employment status to Resigned, Terminated, or Retired | The account is disabled automatically, per Business Rule #5. |
| School Admin attempts to reinstate a Terminated or Retired Teacher back to Active | Not possible within this feature; only On Leave and Resigned are reversible, per Business Rule #6. A mistaken Termination or Retirement requires the Administrative Corrections process (backlog). |
| School Admin (or the system) attempts to hard-delete a Terminated or Retired Teacher's record | Not possible; the record is archived and retained permanently, never deleted, per Business Rule #7. |
| Authentication & Authorization performs an administrative/security override to disable a Teacher's account outside the ordinary employment-status workflow | Permitted only through ACR-001's override path: requires a recorded reason, is independently audited by Authentication & Authorization, and never changes the Teacher's employment status recorded here, per Business Rule #5. |
| School Admin attempts Return from Leave or Rehire while the Teacher's account is currently deactivated via an administrative/security override | Rejected; the override remains in effect until explicitly lifted through Authentication & Authorization's own override capability — a routine employment-lifecycle action must never silently undo a deliberate security lockdown, per Authentication-and-Authorization.md Business Rule #26 (added by this feature's Phase 9 code review). |
| School Admin attempts to edit a Teacher's Employee/Staff ID | Rejected; it is immutable once generated, per Business Rule #8. |
| A Teacher attempts to edit their own employment status, employment information, or professional information | Denied; only approved personal contact information is Teacher-editable, per Business Rule #10. |
| A Teacher attempts to view another Teacher's profile | Denied, per Multi-Tenancy and Business Rule #12. |
| Two Teachers at the same school share the same name | The system disambiguates by the unique Employee/Staff ID, per Business Rule #8. |
| School Admin attempts to onboard or manage a Teacher belonging to another school | Rejected; School Admin may only manage Teachers within their own school, per Business Rule #1. |

---

# Validation Rules

- A Teacher cannot be onboarded without an owning school.
- A Teacher must always have a defined employment status (Active, On Leave, Resigned, Terminated, Retired).
- Employee/Staff ID must be system-generated, immutable once created, and unique within its own school.
- A Teacher must have at least the personal and employment information School Admin needs to complete Onboarding; exact required fields are a Technical Design decision.
- A Teacher-initiated profile update may only modify approved personal contact information fields; any other field present in such a request must be rejected.
- A Teacher record must never be hard-deleted, regardless of employment status, per Business Rule #7.
- An Authentication & Authorization administrative/security override on a Teacher account must record a reason and must not write to this feature's employment-status field.
- Payroll, salary, leave-balance, performance-review, contract, and tax fields must not be modeled by this feature, per its Scope.

---

# Relationships

- **Authentication & Authorization** — Teacher account creation is triggered by this feature's Onboarding; ordinary account enabling/disabling for employment-lifecycle events (Onboarding, employment-status changes, Reinstatement) is also initiated by this feature, per ACR-001 (`docs/01-architecture/Architecture-Decision-Records/ACR-001-Employment-vs-Authentication-Ownership.md`). Authentication & Authorization separately retains an administrative/security override capability over the same account, which must record actor and reason, is independently audited, and must never modify this feature's employment status (Authentication-and-Authorization.md Business Rule #25). Teacher Management remains the sole source of truth for employment state.
- **School & Platform Management** — every Teacher belongs to a school created and kept active by that feature.
- **Class Management** — Class structure exists independently of any Teacher being assigned to it; this feature does not assign Teachers to Classes.
- **Subject Management** (backlog/future-sequenced) — Subject definitions and the curriculum Subject reference list (Primary and Secondary education levels) are owned there, not here (Scope's Not Included, v1.4). This feature only records a Teacher's subject specializations as descriptive profile information, not a functional assignment; Teacher ↔ Subject assignment is a future integration Subject Management will own.
- **Timetable** — owns Teacher-to-Class/Subject assignment and scheduling; it references the Teacher record this feature creates.
- **Attendance Management** — references the Teacher record this feature creates and maintains.
- **Administrative Corrections** (backlog) — the only path to correct a mistaken Termination or Retirement, since this feature provides no reinstatement action for either.
- **Audit Logs** — every Teacher lifecycle event is recorded there.

---

# Reports

A School Admin-facing Teacher roster (list of Teachers, filterable by employment status) is expected, consistent with other management features. Exact report contents are a later design decision.

---

# Notifications

- Onboarding may trigger a notification to the new Teacher with instructions to establish their initial login credentials, consistent with Authentication & Authorization's account-creation notification.
- Employment-status changes and Reinstatement may each trigger a notification to the affected Teacher. Exact scope is left flexible here, consistent with how Authentication & Authorization left role/status-change notification scope open.

The delivery channel for these notifications is a Technical Design decision, not a business rule.

---

# Audit Requirements

The following events must be recorded, each including Tenant (school), User, Action, and Timestamp per the standard audit record defined in Multi-Tenancy.md:

- Teacher onboarded
- Teacher profile updated
- Teacher employment status changed (recorded with previous status, new status, who made the change, when, and an optional reason)
- Teacher reinstated (Return from Leave or Rehire)

Authentication & Authorization's administrative/security override on a Teacher account (with actor and reason) is audited there, per Authentication-and-Authorization.md's own Audit Requirements — not duplicated here, consistent with each feature owning its own module's audit trail.

---

# Acceptance Criteria

- Every Teacher employment status (Active, On Leave, Resigned, Terminated, Retired), its account-synchronization default, and its reversibility (or permanence) is clearly defined.
- Only School Admin has authority over Teacher lifecycle actions within their own school; this is unambiguous.
- A Teacher's self-service edit scope (personal contact information only) is clearly bounded.
- The boundary between Teacher Management's employment-lifecycle-driven account changes and Authentication & Authorization's administrative/security override (ACR-001) is unambiguous.
- Archive Before Delete is explicitly applied to Terminated/Retired Teacher records.
- Tenant isolation is preserved in every scenario described.
- All edge cases have a defined expected behavior.
- This document is reviewed and approved by the Product Owner before Technical Design begins.

---

# Business Decisions Required

None remain. All items raised across both Business Specification drafting and Phase 3 Business Review were resolved by the Product Owner:

- **Account synchronization per status** — Active enables the account; On Leave leaves it unchanged; Resigned, Terminated, and Retired disable it, by default (Business Rule #5).
- **Reversibility per status** — On Leave → Active (Return from Leave) and Resigned → Active (Rehire) are reversible; Terminated and Retired are permanent, with correction routed through Administrative Corrections (backlog) rather than a restore action (Business Rule #6).
- **Employee/Staff ID** — system-generated, immutable after creation, unique within a school rather than platform-wide (Business Rule #8).
- **Department** — a controlled, school-specific, optional list, not free text; School Admin owns creating, updating, and archiving its entries (Business Rule #9). **Superseded (v1.4)**: removed entirely after domain clarification that the school organizes around curriculum Subjects, owned by the future Subject Management feature, not an administrative Department owned here.
- **Teacher self-service** — Teachers may edit only approved personal contact information; employment and professional information remain School Admin-managed (Business Rule #10).
- **System Information category** — restored as a fourth profile category (linked User Account, School, audit metadata) alongside Personal, Employment, and Professional Information (Business Rule #11).
- **Archive Before Delete** — Terminated and Retired Teacher records are archived and retained permanently; never hard-deleted (Business Rule #7).
- **ACR-001 (Employment vs Authentication Ownership)** — approved Architecture Change Request splitting ordinary employment-lifecycle-driven account changes (owned by this feature) from Authentication & Authorization's administrative/security override (owned there), closing the Business Review's Critical cross-feature finding (Business Rules #4, #5; `docs/01-architecture/Architecture-Decision-Records/ACR-001-Employment-vs-Authentication-Ownership.md`; also amends Authentication-and-Authorization.md's Business Rule #25).

---

# Future Considerations

These do not affect and must not influence the current business rules above.

- Document/attachment storage for Onboarding records (e.g., certificates, qualifications proof).
- Bulk Onboarding (e.g., spreadsheet import).
- Teacher ↔ Subject assignment, once Subject Management exists — a future integration owned by Subject Management, not this document (see Scope's Not Included, v1.4).

---

# Change History

- v1.0 — Initial draft, following Business Discovery. Reflected Product Owner decisions on employment-lifecycle model and profile scope; five open questions remained for Business Review.
- v1.1 — All five Business Decisions Required resolved by the Product Owner: account-synchronization defaults per employment status (Business Rule #5), reversibility limited to On Leave/Resigned with Terminated/Retired permanent and routed to Administrative Corrections (Business Rule #6), system-generated immutable school-scoped Employee/Staff ID (Business Rule #7), controlled-list optional Department (Business Rule #8), and Teacher self-service limited to personal contact information (Business Rule #9). Added the Reinstatement workflow and corresponding Edge Cases, Audit Requirements, and Relationships entries. Submitted for Business Review.
- v1.2 — Phase 3 Business Review returned "Requires Revision" (2 Critical, 3 Major, 2 Minor findings). All resolved: added Business Rule #7 (Archive Before Delete for Terminated/Retired records); restored the "System Information" profile category into Business Rule #11; gave School Admin explicit ownership of the Department reference list (Business Rule #9) with a new Department Reference List Management workflow; replaced the vague "authorized administrative action" wording with an explicit reference to ACR-001's Authentication & Authorization override workflow (Business Rules #4, #5); clarified the "relevant experience" wording in Business Rule #11; and added the Teacher Employment Lifecycle section to Project-Glossary.md. ACR-001 (`docs/01-architecture/Architecture-Decision-Records/ACR-001-Employment-vs-Authentication-Ownership.md`) was approved and also amends Authentication-and-Authorization.md (its own v1.3, Business Rule #25). Resubmitted for a second Phase 3 Business Review.
- v1.3 — Phase 9 independent code review found a routine Return from Leave/Rehire could silently undo a deliberate administrative/security override (ACR-001), since nothing checked whether the account's current deactivation came from that override rather than this feature's own last sync. Fixed in Authentication & Authorization (new `Account.deactivatedByOverride` field and Business Rule #26), not in this feature's own code — this feature's own employment-lifecycle logic and Business Rules are unchanged. Added the corresponding Edge Case here for completeness.
- v1.4 — Product Owner domain clarification: the Department reference list (School Admin-owned, optional Teacher assignment) is removed from this feature entirely, not renamed. The school's actual organizing concept is curriculum Subjects (Primary and Secondary education-level subject lists, e.g. Mathematics, Xisaab), which multiple future modules (Subject Management, Class Management, Timetable, Exams, Marks, Report Cards) will need — modeling a Department/Subject list inside Teacher Management would duplicate the future Subject Management feature and create conflicting ownership. Removed Business Rule #9 (marked removed, not renumbered — Business Rules #10–#14 keep their existing numbers since other documents cite them directly), the Department Reference List Management workflow (Business Workflow #3, same non-renumbering treatment), and every other Department reference throughout this document (Scope, Permissions, Edge Cases, Validation Rules, Relationships, Reports, Audit Requirements, Acceptance Criteria, Future Considerations). This document's own employment-lifecycle Business Rules and workflow are otherwise unchanged. This removal reaches into already-shipped code: Teacher Management completed Phase 6 Implementation, Phase 7 Validation, and Phase 9 Feature Acceptance earlier in the same delivery effort as this change — see `docs/00-governance/Development-Roadmap.md` for the corresponding code removal (migration, backend, frontend) tracked alongside this document update.
