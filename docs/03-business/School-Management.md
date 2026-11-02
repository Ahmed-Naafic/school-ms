# School & Platform Management

Version: 1.4

Status:
- Accepted — see `docs/08-validation/School-Management.md` and `docs/00-governance/Code-Review-Report.md`. Amended by ACR-003 (`docs/01-architecture/Architecture-Decision-Records/ACR-003-School-Education-Levels.md`) — School gains Education Levels, a prerequisite for Subject Management's own Business Discovery. This feature's own Feature Acceptance is not reopened.

---

# Purpose

The platform hosts multiple independent schools. Before any student can be enrolled, any teacher hired, or any class scheduled, a school must exist on the platform and be in a state that allows its users to operate.

This feature defines how a school comes into existence, how its lifecycle is managed (active, suspended, reactivated, closed), and how the Super Admin oversees the platform as a whole — without ever stepping into a school's own day-to-day operations.

Without this feature, there is no tenant for any other business feature (Student Management, Teacher Management, Fees, etc.) to belong to. It is the business counterpart to the Multi-Tenancy architecture principle.

---

# Scope

## Included

- Onboarding a new school onto the platform.
- Creating a school's first School Admin account as part of onboarding.
- Suspending a school (temporarily removing access for its users).
- Reactivating a suspended school.
- Managing a school's subscription/plan status on the platform.
- Closing a school that permanently leaves the platform.
- Updating a school's core profile information.
- Viewing aggregate, platform-wide statistics across all schools.
- The set of standard roles and their permissions is fixed platform-wide, not editable data — see Business Rules.
- **(ACR-003)** Assigning which Education Level(s) — Primary, Secondary, or both — a school offers. This scopes which curriculum Subjects Subject Management may later assign to that school; it does not itself assign any Subject.

## Not Included

- Any day-to-day operation within a school (Student Management, Attendance, Fees, etc.) — Super Admin must never become part of a school's business operations, per Multi-Tenancy.md.
- Creating individual Teacher, Accountant, or Student accounts — owned by School Admin, via Authentication & Authorization and the respective management features.
- Platform-level shared configuration (system settings, reference data such as countries, currencies, and languages) — consciously descoped, not forgotten. No approved feature currently requires it; building it now would be speculative, per YAGNI. Tracked as a future backlog feature, **Platform Configuration** (`docs/00-governance/Development-Roadmap.md`'s Backlog section).
- The mechanics of authentication itself (login, credentials, lockout) — owned by Authentication & Authorization. This document only defines when a school's status change affects its users' ability to log in, not how authentication works.
- Payment processing or billing integration — only the business state of a subscription (e.g., active, expired) is in scope; the financial/technical integration is a later design concern.

---

# Actors

- **Super Admin** — the only actor who manages school lifecycle and platform-level configuration.
- **School Admin** — receives the outcome of school creation (their account), is affected by suspension/reactivation/closure, and manages their own school's operational profile information, but never initiates lifecycle actions (creation, suspension, reactivation, closure).

**School** is the business entity being managed by this feature, not an actor — it does not initiate actions.

---

# Permissions

## Super Admin

- May create a new school.
- May create the school's first School Admin account as part of school creation.
- May update a school's core identifying information (the field used for platform-wide uniqueness). Operational profile details are managed by School Admin, not Super Admin.
- May suspend a school.
- May reactivate a suspended school.
- May close a school permanently.
- May manage a school's subscription/plan status.
- May view aggregate, platform-wide statistics across all schools.
- Standard roles and their permissions are fixed platform-wide and are not edited by any role — see Business Rules.
- **(ACR-003)** May assign a school's Education Level(s) (Primary, Secondary, or both) — treated as core identifying/structural information, the same Super-Admin-only category as the school's core identity (Business Rule #14). Assigning an Education Level never itself assigns any Subject; Subject assignment is Subject Management's own, separate action.
- May not perform day-to-day business operations inside any school.

## School Admin

- May be affected by their school's suspension, reactivation, or closure, but does not control these states themselves.
- May update their own school's operational profile information (e.g., contact details, academic year settings). May not change the school's core identifying information — that remains Super Admin-only.

## All Other Roles

- Have no permissions related to school lifecycle or platform-level configuration.

---

# Business Workflow

## 1. School Onboarding (Creation)

1. Super Admin initiates the creation of a new school, providing its core identifying information.
2. The system establishes the school as a new, fully isolated tenant.
3. Super Admin creates the school's first School Admin account as part of the same onboarding action, per Authentication & Authorization's account-creation rules.
4. The school and its first School Admin become active and able to operate independently of every other school.

## 2. Suspension

1. Super Admin suspends a school (for example, due to a lapsed subscription or a platform policy violation).
2. All users of that school, except Super Admin, immediately lose the ability to log in.
3. The school's data is preserved and remains isolated; suspension never deletes or alters any school data.

## 3. Reactivation

1. Super Admin reactivates a suspended school.
2. Users of that school regain the ability to log in immediately.

## 4. Subscription Management

1. Super Admin manages the business relationship status of a school on the platform (e.g., active, trial, expired).
2. A subscription status change does not automatically trigger suspension. Suspension is always a separate, manual Super Admin decision; subscription status is informational until billing/payment integration is designed.

## 5. School Closure

1. Super Admin may permanently close a school that leaves the platform.
2. Consistent with the project's Archive Before Delete principle, a closed school's data should be preserved and made inactive rather than deleted, unless explicitly approved otherwise.
3. Suspension is temporary and reversible at any time by Super Admin. Closure is permanent: a closed school's data is archived (preserved, inactive) rather than deleted, and reopening a closed school is a distinct, deliberate action — not an ordinary reactivation.

## 6. Platform Oversight

1. Super Admin may view aggregate, platform-wide statistics across all schools.
2. Platform-wide views are aggregate/summary only and never expose one school's data to another.

## 7. Fixed Platform Roles

1. Standard roles and their permissions are fixed platform-wide and are not part of any workflow here — see Business Rules. (Platform-level shared configuration, such as system settings or reference data, is out of scope for this feature — see Scope's Not Included.)

## 8. Education Level Assignment (ACR-003)

1. Super Admin assigns a school one or more Education Levels — Primary, Secondary, or both.
2. Every school must have at least one Education Level at all times; a school is never left with zero.
3. Assigning an Education Level never itself assigns any curriculum Subject — Subject assignment is Subject Management's own, separate, explicit action, which may only assign a Subject belonging to an Education Level the school already has.
4. Removing an Education Level from a school is not supported by this version of this feature — only assignment (addition) exists. See Future Enhancements.

---

# Business Rules

1. Only Super Admin may create a new school.
2. Every new school must be created together with exactly one initial School Admin account.
3. A school is a fully isolated tenant from the moment it is created; no cross-school data access is possible except by Super Admin.
4. Only Super Admin may suspend, reactivate, or close a school.
5. Suspending a school immediately prevents all of that school's users, except Super Admin, from logging in; it never deletes or alters the school's data.
6. Reactivating a school immediately restores login access for its users.
7. Super Admin must never perform day-to-day business operations within a school.
8. Closing a school follows the Archive Before Delete principle: data is preserved and made inactive rather than permanently deleted, unless explicitly approved otherwise.
9. The set of standard roles and their permissions is fixed platform-wide — per Naming-Conventions.md's `UserRole` enum and Authentication-and-Authorization.md — and is not user-editable data; no role, including Super Admin, dynamically creates or edits roles or permissions today. (Platform-level shared configuration — system settings, reference data such as countries/currencies/languages — is out of scope for this feature; see Scope's Not Included.)
10. Platform-wide statistics are visible only to Super Admin and must never expose one school's underlying data to another.
11. Every school lifecycle action (creation, suspension, reactivation, closure, subscription change) must be recorded for audit purposes.
12. Suspension is temporary and reversible at any time; closure is a permanent, deliberate action distinct from suspension. Reopening a closed school is not equivalent to reactivating a suspended one.
13. A change in subscription status does not automatically suspend a school. Suspension always requires a separate, manual Super Admin action.
14. School Admin may update their own school's operational profile information. Only Super Admin may change a school's core identifying information.
15. The platform supports more than one Super Admin account, so that platform administration never depends on a single account remaining accessible.
16. At school onboarding, only the school's name and the information required to create its first School Admin account are required. Additional operational details (e.g., address, academic calendar) are not required at onboarding and are entered later through ordinary profile management.
17. **(ACR-003)** Every school has one or more Education Levels (Primary, Secondary, or both) at all times; only Super Admin may assign them, treated as core structural information (the same Super-Admin-only category as Business Rule #14). Assigning an Education Level never automatically assigns any curriculum Subject — that is Subject Management's own, separate action, and may only target a Subject belonging to an Education Level the school already has. Removing an Education Level from a school already assigned one is not supported by this version of this feature.

---

# Edge Cases

| Situation | Expected Behavior |
|---|---|
| Super Admin suspends a school that is already suspended | No harmful effect; the school remains suspended. |
| Super Admin attempts to reactivate a school that was closed rather than suspended | Not the ordinary reactivation action; reopening a closed school requires a separate, deliberate decision by Super Admin, since closure is intended to be permanent. |
| A school's subscription expires with no suspension action taken | The school remains active; expiration alone does not suspend it. Super Admin must separately decide to suspend, per Business Rule #13. |
| Two schools attempt to onboard with identical or very similar names | The system must distinguish schools uniquely regardless of name similarity. |
| A school is suspended while its users are actively using the system | Consistent with Authentication & Authorization: the suspension takes effect on the user's next action, not retroactively. |
| The Super Admin account itself becomes inaccessible | Mitigated by Business Rule #15: the platform supports more than one Super Admin account, so administration does not depend on any single account. |
| Super Admin assigns a school an Education Level it already has | No harmful effect; the school simply keeps that Education Level (idempotent). |
| Super Admin attempts to remove a school's only remaining Education Level | Rejected; a school must always have at least one, per Business Rule #17. |
| Super Admin assigns a school "Secondary" and expects Secondary Subjects to become available immediately for teaching | Assigning an Education Level never itself assigns any Subject; Subject Management still requires its own separate, explicit assignment action, per Business Rule #17. |

---

# Validation Rules

- A school must have identifying information sufficient to distinguish it from every other school on the platform. Exact fields are a Technical/Database Design decision, not defined here.
- A school must always have a defined lifecycle status (e.g., active, suspended, closed).
- A school cannot be created without its required first School Admin account being created in the same action.
- At onboarding, only the school's name and the information needed to create its first School Admin account (which itself requires a verified recovery contact, per Authentication-and-Authorization.md Business Rule #21) are required. No other operational fields are mandatory at creation time.
- **(ACR-003)** A school must have at least one Education Level (Primary, Secondary, or both) at all times — never zero.

---

# Relationships

- **Authentication & Authorization** — school suspension/reactivation directly changes whether that school's users can log in; school creation triggers creation of the first School Admin account.
- **Multi-Tenancy (architecture)** — this feature is the business process that brings tenants into existence and changes their lifecycle state; Multi-Tenancy.md defines the isolation rules that then apply to them.
- **Every other business feature** — all operate only within a school that this feature has created and kept active.
- **Subject Management** (future, ACR-003) — depends on this feature's Education Levels to validate which curriculum Subjects may be assigned to a given school; consumed through this feature's own narrow interface, never by querying the School table directly.
- **School Schedule Management** — this feature's own `createSchool` now also creates that feature's default School Calendar and default "Morning" Shift, in the same creation flow as the first School Admin account, so no school ever exists without its own operating schedule. A narrow-interface call (`createDefaultScheduleForSchool`), not a shared database transaction, consistent with how the first School Admin account is already created. This feature's own Business Rules for school creation are otherwise unchanged.
- **Audit Logs** — every school lifecycle action is recorded there.

---

# Reports

Aggregate, platform-wide statistics (e.g., number of active schools, number of suspended schools) are available only to Super Admin. Exact report contents are a later design decision — the business requirement is that this oversight capability exists and remains aggregate-only, never exposing one school's data to another.

---

# Notifications

- School creation may trigger a notification to the new School Admin with onboarding instructions.
- School suspension may trigger a notification to the school's admin(s) with the reason.
- School reactivation may trigger a notification confirming access has been restored.
- Subscription-related events (e.g., approaching expiration) may trigger a notification to Super Admin and/or School Admin. Since expiration no longer auto-suspends (Business Rule #13), these notifications are informational, prompting Super Admin to decide manually rather than triggering any automatic action.

The delivery channel for these notifications is a Technical Design decision, not a business rule.

---

# Audit Requirements

The following events must be recorded, each including Tenant (where applicable), User (Super Admin), Action, and Timestamp per the standard audit record defined in Multi-Tenancy.md:

- School created
- School profile updated
- School suspended
- School reactivated
- School closed
- Subscription status changed
- School Education Level(s) changed (ACR-003)

---

# Acceptance Criteria

- Every school lifecycle state (creation, suspension, reactivation, closure) and its effect on login access is clearly defined.
- The distinction between "suspended" and "closed" is resolved.
- Only Super Admin has authority over school lifecycle; this is unambiguous.
- Tenant isolation is preserved in every scenario described.
- All edge cases have a defined expected behavior.
- This document is reviewed and approved by the Product Owner before Technical Design begins.

---

# Open Questions

None remain. All questions raised during drafting were resolved and approved by the Product Owner:

- Suspended vs. closed, subscription-driven suspension, School Admin's profile-editing rights, Super Admin continuity, and minimum onboarding information are now captured in Business Rules #12–16 above.
- Whether Super Admin can create additional School Admin accounts beyond the first was resolved earlier: yes, exclusively, per Authentication-and-Authorization.md Business Rule #19. A School Admin may never create another School Admin account.

---

# Future Enhancements

- Self-service school onboarding (a school registers without Super Admin directly creating the account).
- Configurable subscription plans/tiers with different feature access per plan.
- Regional administrators overseeing a subset of schools.
- Multi-campus / school branches under a single school entity.
- Dynamic, admin-configurable roles and permissions, if per-school customization is ever required (the current model is a deliberate fixed-role trade-off — see Authentication & Authorization's Technical Design, Risks).
- **Platform Configuration** — system settings, reference data (countries, currencies, languages), and other platform-wide shared configuration. Consciously descoped from this feature during Phase 7 Validation (v1.1): no approved feature currently requires it, and building it speculatively would violate YAGNI. Tracked as its own future backlog feature in `docs/00-governance/Development-Roadmap.md`.
- **(ACR-003)** Removing an Education Level from a school that already has one — deliberately out of scope for now; only assignment (addition) is supported. If a future need arises (e.g., a school discontinuing Secondary grades), this requires its own decision, likely needing the same kind of "dependency validation" extension point Subject Management's own Subject-removal design anticipates for Subjects already assigned under that level.

---

# Change History

- v1.0 — Initial approved specification.
- v1.1 — Phase 7 (Validation) found that "platform-level shared configuration" (Business Rule #9, Scope, Workflow §7) was approved scope that was never implemented, and nothing in the codebase needs it. Product Owner decision: descope it consciously (not silently), remove it from this feature's Scope/Business Rules/Workflow/Audit Requirements/Acceptance Criteria, and track it as a new backlog feature, **Platform Configuration**. See `docs/08-validation/School-Management.md`.
- v1.2 — Independent code review (Phase 9) found and fixed a Critical mass-assignment vulnerability (a School Admin could rewrite core identity, lifecycle status, and subscription status via the operational-profile endpoint, bypassing Business Rules #12/#14) and a Critical data-integrity gap (a failed school creation could leave a permanent, admin-less orphan school). Both fixed, tested, and verified live. Feature Acceptance granted. See `docs/00-governance/Code-Review-Report.md`.
- v1.3 — ACR-003 (`docs/01-architecture/Architecture-Decision-Records/ACR-003-School-Education-Levels.md`) approved during Subject Management's Business Discovery: every school now has one or more Education Levels (Primary, Secondary, or both), Super-Admin-only, added as Business Rule #17 and Business Workflow #8. Assigning an Education Level never itself assigns any Subject — Subject assignment remains Subject Management's own, separate action, validated against the school's Education Levels. Removal of an already-assigned Education Level is deliberately not supported yet. This feature's own Phase 9 Feature Acceptance is not reopened.
- v1.4 — School Schedule Management (Accepted) added a Relationships entry: this feature's own school creation flow (`createSchool`) now also creates that feature's default School Calendar and default "Morning" Shift, through that feature's own narrow interface, before the first School Admin account is created. A procedural sequencing addition to this feature's existing creation flow, not a schema or Business Rule change to this feature itself — no formal ACR raised, and this feature's own Phase 9 Feature Acceptance is not reopened.
