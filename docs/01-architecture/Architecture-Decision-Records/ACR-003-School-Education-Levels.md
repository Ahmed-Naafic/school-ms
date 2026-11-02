# Architecture Change Request: School Education Levels

ACR Number: ACR-003

Date: 2026-07-19

Status: Approved

---

# Context

Subject Management's Business Discovery (kicked off per Product Owner direction, governance model: Super Admin centrally manages the curriculum catalog and assigns Subjects to Schools; School Admin has read-only, usage-only access) needed to settle whether Subject assignment should be constrained by what a School actually teaches. Subjects are split across two Education Levels — Primary and Secondary — with entirely disjoint curricula (only "English" appears at both, as two distinct records per ACR-003's sibling decision on Subject uniqueness).

School & Platform Management (Accepted, Phase 9 complete) has no concept of Education Level today — the School entity captures identity and lifecycle only; Business-Management.md's own Validation Rules explicitly defer all other fields to Technical/Database Design, and no such field exists in the implemented schema.

Without an Education Level concept on School, Subject Management's assignment workflow would have no way to prevent assigning a Secondary-only Subject (e.g. Physics) to a school that only teaches Primary grades — a real, foreseeable data-integrity gap the Product Owner chose to close before Subject Management's own Business Specification is drafted, rather than after.

---

# Options Considered

**Option A — No School-level constraint; Super Admin's own judgment is the only check (rejected).**
Simplest, no change to School & Platform Management. Rejected by Product Owner: assigning Subjects a School structurally cannot teach is exactly the kind of foreseeable data-integrity gap this project's other ACRs (ACR-001, ACR-002) have consistently chosen to close via an explicit, validated relationship rather than leaving it to operator discipline alone.

**Option B — School declares one or more Education Levels; Subject assignment is validated against it (Selected).**
A School must have at least one Education Level (Primary, Secondary, or both). Assigning an Education Level to a School is a separate, explicit Super-Admin action from assigning Subjects — it never auto-assigns any Subject. Once a School has a given Education Level, only Subjects belonging to that Level become eligible for assignment to it; Subject assignment itself remains its own explicit, separate action.

---

# Decision

Option B is adopted.

- **`School.educationLevels`** — one or more values from a new `EducationLevel` enum (`PRIMARY`, `SECONDARY`). A School must have at least one at all times; the field is Super-Admin-only, mirroring School & Platform Management's existing "core identifying information — Super Admin only" pattern (Business Rule #14 there), not part of School Admin's own operational profile.
- **Two-step, explicitly separate workflow**, per Product Owner decision: (1) Super Admin assigns a School's Education Level(s) — this alone assigns zero Subjects; (2) Super Admin separately, explicitly assigns specific Subjects to the School, chosen only from Subjects belonging to an Education Level the School already has. Neither step is inferred from or triggers the other.
- **Validation**: Subject Management's own Subject-to-School assignment action must reject assigning a Subject whose Education Level the target School does not currently have. This is enforced where the assignment is written (Subject Management's own service layer, consuming School & Platform Management's Education Levels through a narrow read call — e.g. "does School X have Education Level Y" — never by Subject Management querying School's table directly), per this project's established Loose Coupling / narrow-interface pattern (Class Management → Student Management; Class Management → Student Management's Section consumption in ACR-002).
- Removing a School's Education Level (if ever supported) is out of scope for this ACR — not requested by the Product Owner and not required for Subject Management's own Business Discovery. If a future need arises to remove a level from a School that already has Subjects assigned under it, that is its own decision, likely requiring the same "dependency validation" extension point ACR's sibling decision already establishes for Subject removal.

## Requirements

- `EducationLevel` is a fixed, platform-wide enum (`PRIMARY`, `SECONDARY`) — not a School-Admin-managed or Super-Admin-managed reference list; adding a third level in the future is a schema change, not a data change, consistent with how small, stable enumerations are already modeled elsewhere in this project (`ClassStatus`, `TeacherEmploymentStatus`).
- A School must have at least one Education Level at all times — enforced at creation (a sensible default or a required input, a Technical Design decision) and never reducible to zero.
- Assigning an Education Level to a School never assigns any Subject, and assigning a Subject to a School never implies or changes the School's Education Levels.
- Subject Management's Subject-to-School assignment must validate the target School currently has the Subject's Education Level, rejecting the assignment otherwise.
- School Admin has no authority over Education Levels — read-only at most, consistent with School & Platform Management's existing Permissions section split between Super-Admin-only core identity and School-Admin-editable operational profile.

---

# Reasoning

This closes a real, foreseeable data-integrity gap (a Primary-only school assignable a Secondary-only Subject) before Subject Management's own Business Specification is drafted, using the same "business ownership vs. narrow interface" pattern already established by ACR-001 and ACR-002. Keeping Education Level assignment and Subject assignment as two explicit, separate steps — neither one inferring the other — avoids the surprise of an implicit cascade (e.g., adding "Secondary" silently pulling in a default Subject set) and matches the Product Owner's explicit instruction that assigning a level "does NOT automatically assign any Subjects."

---

# Consequences

## Positive

- Subject assignment is validated against what a School actually teaches, closing a real gap before Subject Management's own Implementation begins rather than after a defect is found.
- Two-step, non-cascading design is simple to reason about and audit: every Education Level change and every Subject assignment change is its own distinct, attributable action.
- Reuses the established narrow-interface pattern rather than introducing a new form of cross-feature coupling.

## Negative

- Amends an already-Accepted, already-implemented document (School & Platform Management), requiring a formal Change Request and a real schema/API change to a feature that already completed Phase 9 — the same category of change ACR-002 already made to Student Management, so procedurally well-precedented, but still a non-trivial addition (new enum, new field, new Super-Admin-only endpoint, new tests) to code previously considered closed.
- A School with no Education Level cannot exist going forward; existing Schools (created before this ACR) will need a default applied by the migration, a data-backfill decision made explicit in the Technical Design rather than left implicit.

## Future Impact

- Subject Management's own Business Specification is written assuming this ACR is in effect — its own Subject-to-School assignment workflow and validation rules reference the School's Education Levels directly, not as a placeholder.
- If a future feature needs finer-grained academic-level modeling (e.g., specific grade bands within Secondary), that is a separate future decision — this ACR deliberately keeps `EducationLevel` a small, fixed, two-value enum, per "Avoid Premature Abstraction."

---

# Related Documents

- `docs/03-business/School-Management.md` — School entity gains Education Levels (amended by this ACR).
- `docs/06-technical-design/School-Management.md` — schema, API, and validation design for the new field (amended by this ACR).
- `docs/03-business/Subject-Management.md` — Subject Management's own Business Specification, drafted assuming this ACR (Business Discovery, in progress).
