# Architecture Change Request: Manager Role Introduction

ACR Number: ACR-010

Date: 2026-08-24

Status: Approved (documentation-only — see Consequences)

---

# Context

Attendance Management's Business Discovery (`docs/03-business/Attendance-Management.md`) requires a `Manager` actor with attendance-recording authority distinct from every existing role: a Manager may record Student attendance (all Classes, all Students, by checkpoint) and daily staff attendance for Teachers and Accountants, and is themselves the subject of daily attendance recorded by School Admin — none of which School Admin, Accountant, Teacher, or Student's existing permissions already cover, and none of which is appropriate to grant to an existing role wholesale.

No such role exists today. Authentication & Authorization's `UserRole` set (`SUPER_ADMIN`, `SCHOOL_ADMIN`, `ACCOUNTANT`, `TEACHER`, `STUDENT`) has no entry for it, and the Project Glossary's own `School Admin` entry explicitly listed `Manager` as a forbidden synonym for School Admin, "unless they become separate roles" — anticipating exactly this situation without resolving it. Attendance Management's own Business Discovery draft (v0.1) recorded this gap as an "Assumption Requiring Approval" rather than inventing a resolution.

This ACR resolves that gap by formally introducing Manager as a new, distinct role, since it amends Authentication & Authorization — an already-**Accepted** document — the same category of change ACR-001 made for that document.

---

# Options Considered

**Option A — Reuse School Admin with a reduced permission subset for Manager-type users.**
Rejected: this project's RBAC model, as documented in `docs/06-technical-design/Authentication-and-Authorization.md`, is deliberately a fixed, closed role set with permissions mapped in code — not a dynamic per-user permission system. There is no existing mechanism for "School Admin, but with fewer permissions," and building one is a far larger change than a single new role, for no benefit this decision set asks for.

**Option B — Model Manager as a flag/attribute on School Admin (e.g. `School Admin, restricted`).**
Rejected: the approved decision is explicit that "Manager does not become a School Admin and must not inherit full School Admin permissions" — a flag on the same role would blur exactly the distinction the decision requires, and would not naturally support "School Admin creates/manages Manager accounts" as a distinct authority relationship the way two separate roles do.

**Option C — Introduce Manager as a new, first-class, distinct role (Selected).**
Manager becomes a new value in the closed role set, alongside Super Admin, School Admin, Accountant, Teacher, and Student — tenant-scoped to exactly one school, created and managed by School Admin, with its own narrow permission set (attendance-specific, defined in Attendance-Management.md) that never includes School Admin's own administrative capabilities.

---

# Decision

Option C is adopted.

- Manager is added to Authentication & Authorization's role set as a distinct, first-class role — not a permission variant of School Admin, not a flag, not a per-school custom role.
- School Admin may create, deactivate, and reactivate Manager accounts within their own school, following the same account-creation rules as any other role (Authentication-and-Authorization.md Business Rule #9).
- A Manager account is tenant-scoped to exactly one school, the same as every role except Super Admin (Business Rule #2 already covers this generically once Manager is a recognized role).
- A Manager's permissions are limited to what is explicitly granted to the Manager role. A Manager never inherits School Admin's own administrative permissions, by omission — nothing in this ACR or in Authentication & Authorization grants a Manager any capability beyond what Attendance Management (or a future feature) explicitly defines for it.
- A Manager may not create, manage, deactivate, or reactivate another Manager's account. Only School Admin holds Manager account-management authority in this version; extending that authority to Managers themselves is explicitly deferred, not silently assumed.
- Manager's substantive capability in this version is entirely attendance-specific, governed by Attendance-Management.md — recording Student attendance (all Classes, by checkpoint), recording daily Teacher/Accountant staff attendance, and being the subject of School-Admin-recorded attendance. A Manager may never record another Manager's attendance or an Admin's (School Admin's) attendance — Attendance-Management.md's own Business Rules #16 and #20 govern this; this ACR does not restate them, only cross-references them.

## Requirements

- Authentication & Authorization's Actors, Permissions, and Business Rules sections are updated to include Manager (see Related Documents for exact rule numbers).
- The Project Glossary gains a `Manager` entry, and the existing `School Admin` entry's "never use: Manager" guidance is corrected — Manager is no longer a forbidden synonym, it is now a distinct, real term.
- No `UserRole` enum change, no Prisma migration, no API, and no service/controller change is made by this ACR. It is a documentation-only architecture decision, matching the explicit instruction it was raised under. Implementation is deferred to a future Technical Design phase, once Attendance Management (or another feature actually requiring Manager) is scheduled for implementation.

---

# Reasoning

This follows the same pattern already established for every prior role and every prior cross-feature dependency in this project: a role is a first-class, explicit concept (never a flag or an implicit permission subset), and a new one is introduced formally, through the Glossary and Authentication & Authorization, rather than informally through a single consuming feature's own document. It also follows ACR-001's own precedent directly: both ACRs amend an already-**Accepted** Authentication & Authorization document, both are documentation-only at the time of approval, and both defer the actual code change to a later phase owned by the feature that needs it.

Keeping Manager's substantive permissions entirely out of Authentication & Authorization (beyond the bare account-lifecycle mechanics) and inside Attendance-Management.md mirrors the existing, explicit "Not Included" scope boundary already stated in Authentication-and-Authorization.md: "The specific screens, dashboards, or actions available to each role once authenticated — those are defined in each role's relevant business feature document."

---

# Consequences

## Positive

- Resolves Attendance Management's single most significant open dependency, unblocking that document from carrying an unresolved "Manager might not be a real role" assumption into Business Review.
- Keeps the RBAC model consistent — a closed, explicit role set, no ad hoc permission variants.
- Establishes a clean, reusable pattern: School Admin creates/manages a new staff-type role directly (the same shape as Accountant/Student today), with no employment-lifecycle complexity — unlike Teacher, which required ACR-001's split-ownership model. No such split is introduced for Manager in this version, since no Manager-equivalent of Teacher Management's employment lifecycle has been proposed.

## Negative

- Amends an already-**Accepted** document (Authentication & Authorization), requiring this formal Change Request rather than a routine edit — the same cost ACR-001 already paid.
- Introduces a role with no implemented permission set yet; until Attendance Management (or another feature) reaches Implementation, Manager exists only as an approved business/documentation concept, not a usable account type.
- `docs/06-technical-design/Authentication-and-Authorization.md` and `docs/01-architecture/Naming-Conventions.md` (the `UserRole` enum's own documented source of truth) now reference an incomplete role list and will need a corresponding Technical Design update before implementation — not performed by this ACR, and explicitly out of scope for it.

## Future Impact

- If Manager account-management is later delegated beyond School Admin (e.g. a Manager managing other Managers), that requires its own Change Request against this one and Authentication & Authorization — not automatically inherited from ACR-010, the same caveat ACR-001 recorded for Student Management.
- If a Manager-equivalent employment lifecycle (hiring, resignation, etc.) is ever proposed, it would likely require its own ACR mirroring ACR-001's split-ownership model, rather than assuming Manager's simple, School-Admin-direct account lifecycle continues to suffice.

---

# Related Documents

- `docs/03-business/Attendance-Management.md` — the originating Business Discovery; Business Rules #1, #7, #14, #16–#20 define Manager's attendance-specific authority this ACR does not restate.
- `docs/03-business/Authentication-and-Authorization.md` — Actors, Permissions, and Business Rules #6, #27, #28 (added/amended by this ACR).
- `docs/00-governance/Project-Glossary.md` — new `Manager` entry; `School Admin` entry's "never use" guidance corrected.
- `docs/01-architecture/Architecture-Decision-Records/ACR-001-Employment-vs-Authentication-Ownership.md` — the precedent this ACR follows for amending an already-Accepted Authentication & Authorization document.
