# Implementation Planning

Feature: Class Management

Version: 1.3

Status: Implementation complete (backend + web) for the original scope. Phase 7 Validation and an independent code review both passed — see `docs/08-validation/Class-Management.md` and `docs/00-governance/Code-Review-Report.md`. **v1.3: Architecture Update (Grade/Form) planned** — following `docs/06-technical-design/Class-Management.md` v1.7's own Phase 4 (Technical Design Review) approval, per **ACR-009**. See Architecture Update (Grade/Form) — Work Packages below. **Not yet implemented** — this addition is a hard-blocking prerequisite for Weekly Subject Allocation's own Implementation (`docs/07-implementation-planning/Weekly-Subject-Allocation.md`), which cannot begin until WP-GF1–WP-GF6 below are complete.

---

# Scope

This pass implements the `classes` feature module as designed in `docs/06-technical-design/Class-Management.md`: Class creation/update, Section organization (nested under a Class), Class sequencing (unique position per school, used to suggest — never enforce — the next Class for Student Management's Promotion), final-Class designation (exactly one per school), Class/Section archival, and the narrow read-only public interface Student Management calls ("get Class by ID," "get suggested next Class," "get final Class").

Out of scope for this pass (per the Business Specification's Future Considerations): multi-campus/branch-specific Class structures and platform-level curriculum templates.

**Architecture Update (Grade/Form) — newly added to this plan's scope, not yet implemented:** `GradeLevel` (create, correct, list, detail, reorder, archive, reactivate), the required `Class.gradeLevelId` reference and its same-Shift enforcement (including the `reactivateClass` re-validation fix from Technical Design Review), the Grade/Form additions to the Stable Public Service Interface (`getGradeLevelShift`, `listGradeLevels`, `getGradeLevelById`, `validateGradeLevel`), and the Web surface for managing a school's Grade/Form list. See WP-GF1–WP-GF6.

---

# Files Affected

All new files — this is the module's first implementation.

- `backend/src/features/classes/` — controller, service, repository, validation, routes, dto, types, utils, tests, `index.js`.
- `web/src/features/classes/` — pages, components, hooks, services, utils, validation.
- Prisma schema — new Class model (schoolId, name, sequence position, final-Class flag, `ClassStatus` enum) and Section model (classId, name, status), plus a migration. The final-Class exclusivity constraint requires a partial unique index added as raw SQL within the generated migration, per the Technical Design's Database Impact section — this is the one file in the migration that isn't pure Prisma DSL output and should be reviewed carefully.
- No `backend/src/shared/` additions expected — this feature introduces no cross-feature utilities, per the Technical Design's Architecture section (it is called, not calling).
- No mobile files — neither Teacher nor Student has any permission in this feature, per the Technical Design's Mobile Design section.

## Architecture Update (Grade/Form) — additional files

- Prisma schema — new `GradeLevel` model and `GradeLevelStatus` enum, plus `Class.gradeLevelId` (required FK), plus one new migration. See WP-GF1 for the exact migration shape (the placeholder `"Ungrouped"` backfill is a data-migration step within this same migration, not a separate script).
- `backend/src/features/classes/classes.service.js`, `.repository.js`, `.controller.js`, `.routes.js`, `.validation.js` (all extended, not new files) — `GradeLevel` CRUD lives in this module's existing files, per Technical Design's own "one module owns Class, Section, and now GradeLevel" decision.
- `web/src/features/classes/pages/GradeLevelsPage.jsx` (new), `web/src/features/classes/components/CreateGradeLevelDialog.jsx`/`EditGradeLevelDialog.jsx` (new); `ClassesListPage.jsx`'s Create/Edit Class dialogs (extended, not new) gain a required Grade/Form picker.
- `web/src/app/App.jsx`, `web/src/app/Layout.jsx`, `web/src/app/nav-icons.jsx` — a new `/grade-levels` route and sidebar entry, School-Admin-only.

---

# Architecture Update (Grade/Form) — Work Packages

Maps to `docs/06-technical-design/Class-Management.md` v1.7's own Architecture Update (Grade/Form) sections. This is the module's first use of a Work Package breakdown — the original scope's own plan above predates this convention, adopted here because this addition (a fourth owned entity with its own full CRUD lifecycle) is substantial enough to benefit from it, the same judgment School Schedule Management's own Periods addition already made.

## WP-GF1 — Database Schema & Migration

**Maps to:** Technical Design's Database Impact (Architecture Update) section.

- `backend/prisma/schema.prisma`:
  - New `GradeLevelStatus` enum (`ACTIVE`/`ARCHIVED`).
  - New `GradeLevel` model: `schoolId` (FK), `name String`, `sequenceOrder Int`, `status GradeLevelStatus @default(ACTIVE)`, timestamps. `@@unique([schoolId, name])`, `@@unique([schoolId, sequenceOrder])` (a real, maintained contiguous sequence per Technical Design Review's own finding — archived rows keep their position, mirroring `Class.sequenceOrder` exactly, not `Shift.displayOrder`'s alternate "archived holds no position" convention). `@@index([schoolId])`.
  - `Class` gains `gradeLevelId String` with a foreign key to `GradeLevel`. `@@index([gradeLevelId])`.
- **Migration is entirely self-contained within this feature — no cross-feature ordering constraint the way ACR-005's `Class.shiftId` had** (that one had to wait for School Schedule Management's own separate migration to seed a real Default Shift first; here, `GradeLevel` and the column referencing it are both created by this same migration):
  1. Create `GradeLevel`, insert one placeholder row per existing school (`name: "Ungrouped"`, `sequenceOrder: 1`, `status: 'ACTIVE'`).
  2. Add `Class.gradeLevelId` nullable, backfill every existing Class to its own school's new placeholder row via a hand-written `UPDATE`, then `ALTER COLUMN "gradeLevelId" SET NOT NULL` and the FK constraint added — the same "generated migration, hand-edited with one additional raw-SQL step" pattern ACR-005's own migration already established, here for a fully self-contained backfill rather than one waiting on another feature's own migration.
- No partial unique index needed (`GradeLevel` has no "exactly one X" flag, per Technical Design).

## WP-GF2 — GradeLevel Core & Lifecycle Backend (Create / Correct / List / Detail / Reorder / Archive / Reactivate)

**Maps to:** Technical Design's Backend Design (Architecture Update) section.

- `classes.repository.js` (extended) — `findGradeLevelById`, `listGradeLevelsBySchool({ status })`, `listActiveGradeLevelsBySchool` (ordered by `sequenceOrder`), `createGradeLevel`, `updateGradeLevel`, `renumberActiveGradeLevels` (batch `sequenceOrder` rewrite), `countActiveClassesByGradeLevel`.
- `classes.service.js` (extended):
  - `getGradeLevelOrThrow(schoolId, gradeLevelId, tx?)` — mirrors this module's own existing `get*OrThrow` convention.
  - `nextEndOfSequencePosition` — reused if this module's own Class-sequencing helper of the same name is already suitably generic, else a second, GradeLevel-scoped copy of the identical algorithm (Class's own version considers archived Classes too, which GradeLevel's own convention — decided by Technical Design Review — also requires, so this may genuinely be the same function).
  - `createGradeLevel(schoolId, { name }, actingUser)` — validates name-uniqueness within school, inserts with the next end-of-sequence `sequenceOrder`, `status: 'ACTIVE'`.
  - `updateGradeLevel(schoolId, gradeLevelId, { name }, actingUser)` — `name` only; Guard by Construction rejects `sequenceOrder`/`status`.
  - `reorderGradeLevel(schoolId, gradeLevelId, targetPosition, actingUser)` — the identical renumbering algorithm as `reorderClass`, applied one entity up.
  - `archiveGradeLevel(schoolId, gradeLevelId, actingUser)` — rejects if `countActiveClassesByGradeLevel(schoolId, gradeLevelId) > 0` (a Class with no Grade/Form would be structurally invalid); does not renumber the remaining sequence, per Technical Design's own "archived rows keep their position" decision.
  - `reactivateGradeLevel(schoolId, gradeLevelId, actingUser)` — rejects if `status !== 'ARCHIVED'`; assigns a fresh end-of-sequence position, mirroring `reactivateClass`'s own convention.
- `classes.validation.js` (extended) — shape-only: `GradeLevel` `name` (non-empty string); `position` for reorder (positive integer). `PATCH /grade-levels/{id}` rejects any field other than `name`.
- `classes.controller.js`, `.routes.js` (extended) — `GET /grade-levels`, `GET /grade-levels/{id}`, `POST /grade-levels`, `PATCH /grade-levels/{id}`, `PATCH /grade-levels/{id}/sequence`, `PATCH /grade-levels/{id}/archive`, `PATCH /grade-levels/{id}/reactivate` — all School-Admin-only, per Technical Design's API Design.

## WP-GF3 — Class Management additive change (required `gradeLevelId` + same-Shift enforcement)

**Maps to:** Technical Design's Architecture (Architecture Update) and Backend Design sections — including the three Technical Design Review findings.

- `classes.service.js`'s `assertSameShiftWithinGradeLevel(schoolId, gradeLevelId, shiftId, excludeClassId, tx)` — loads every other Active Class currently in the target `gradeLevelId` (excluding the Class being updated) and rejects (409) if any has a different `shiftId`.
- **`createClass`, `updateClass`, and `reactivateClass` all call this helper**, evaluated against the Class's own final, resulting `(gradeLevelId, shiftId)` pair regardless of which field the request actually changed — this uniform coverage across all three write paths is itself a direct implementation of Technical Design Review's first two findings (the `reactivateClass` gap, and the "runs regardless of which field changed" clarification). Implementation must not special-case `reactivateClass` as "just restoring old state" — it goes through the identical check a fresh `createClass` would.
- `createClass`/`updateClass` gain a required `gradeLevelId` parameter, validated via `validateGradeLevel` (this module's own new function, called internally rather than through a cross-feature narrow interface, since `GradeLevel` is owned by this same module).
- No other change to this module's own existing Business Rules, Section CRUD, or lifecycle.

## WP-GF4 — Stable Public Service Interface Additions

**Maps to:** Technical Design's Backend Design section.

`classes.service.js` exports, alongside the existing `getClassById`/`getFinalClass`/`listActiveSectionsForClass`:

- `getGradeLevelShift(schoolId, gradeLevelId)` — the one `shiftId` every Active member Class already shares, derived via a single query, `null` if no member Classes exist yet or the `GradeLevel` doesn't exist/belongs to a different school. The literal function ACR-009 names, built now even though Weekly Subject Allocation (its only consumer) does not exist yet, per this project's established Future Integration Readiness precedent.
- `listGradeLevels(schoolId, { status })`, `getGradeLevelById(schoolId, gradeLevelId)` (returns `null` on a miss, never throws), `validateGradeLevel(schoolId, gradeLevelId)` (boolean).

No future feature may query `grade_levels` directly — the same Loose Coupling discipline WP-GF4's own siblings (`getClassById` etc.) already established.

## WP-GF5 — Audit Logging Integration

**Maps to:** Technical Design's Security Considerations (Architecture Update) section.

- Every WP-GF2/WP-GF3 write function calls the shared audit-recording utility: `GRADE_LEVEL_CREATED`, `GRADE_LEVEL_UPDATED`, `GRADE_LEVEL_SEQUENCE_CHANGED`, `GRADE_LEVEL_ARCHIVED`, `GRADE_LEVEL_REACTIVATED`. All carry the school's own `schoolId`.

## WP-GF6 — Web Frontend (Grade/Form Management)

**Maps to:** Technical Design's Frontend Design (Architecture Update) section.

- `web/src/features/classes/pages/GradeLevelsPage.jsx` — a list/table (Name, Sequence, Active/Archived) with Create/Edit dialogs, up/down reorder controls (mirroring School Schedule Management's own Shifts table UI pattern, per UI-UX-Standards.md's keyboard-operable-control preference), Archive/Reactivate row actions.
- `ClassesListPage.jsx`'s Create/Edit Class dialogs (extended) gain a required Grade/Form picker (Select, listing the school's Active `GradeLevel`s).
- **The migration-created placeholder `"Ungrouped"` `GradeLevel` is visually flagged** (a distinct badge/label, e.g. "Ungrouped — reassign your Classes") in both `GradeLevelsPage.jsx`'s own list and the Class picker — the Web-side mitigation Technical Design's own Risks section names for ACR-009's honestly-imperfect backfill.
- The frontend never re-implements the same-Shift invariant, name-uniqueness, or sequence renumbering; it only reflects what the backend returns, per System-Architecture.md's Business Logic Ownership rule.

---

# Dependencies

- **School & Platform Management** — Approved, with a completed Technical Design and its own Implementation already built. Every Class needs a `schoolId` to reference; no blocker.
- **Authentication & Authorization's middleware chain** — already implemented (Authentication + Authorization middleware). This feature reuses it as-is; it does not introduce or modify any authentication/authorization mechanism.
- **No dependency in the other direction**: Student Management, Subject Management, and Timetable depend on this feature, not the reverse. This feature's Implementation does not need to wait on any of them.
- **(Architecture Update — Grade/Form) This addition is driven by, but does not depend on, Weekly Subject Allocation** (`docs/07-implementation-planning/Weekly-Subject-Allocation.md`) — WP-GF1–WP-GF6 stand on their own the moment this module's own migration runs. **The dependency runs the other way**: Weekly Subject Allocation's own Implementation Planning is hard-blocked on WP-GF1–WP-GF6 completing first, the single ordering constraint that plan names as its own highest-severity risk.

---

# Risks

- **Partial unique index outside Prisma's schema DSL** — already flagged in the Technical Design. Get the raw-SQL migration step right the first time (exactly one Class per school with the final-Class flag set); an incorrect constraint here would allow a school to end up with zero or multiple final Classes, which Student Management's Graduation-eligibility logic assumes can never happen.
- **Sequence renumbering correctness** — reordering a Class's position must renumber affected Classes within the same school inside a single transaction, per Database-Standards.md's Transactions section, to avoid a moment where two Classes share a position.
- **Downstream unblocking** — this feature directly unblocks Student Management's Implementation Planning (Phase 5), which has been waiting on it since the sequencing decision. Delays here have a direct, known knock-on effect, unlike most other features built so far.
- **(Architecture Update — Grade/Form) The same sequence-renumbering correctness risk applies identically to `GradeLevel.sequenceOrder`** — WP-GF2's `reorderGradeLevel`/`createGradeLevel`/`reactivateGradeLevel` must all compute the next position from every `GradeLevel` regardless of status, inside a single transaction, exactly the discipline `Class.sequenceOrder`'s own Implementation had to learn hands-on (see the risk above and Change History's own v1.1 entry) — named here before Implementation this time, not after.
- **(Architecture Update — Grade/Form) `assertSameShiftWithinGradeLevel` must be wired into all three of `createClass`, `updateClass`, and `reactivateClass`, never just the first two** — this is Technical Design Review's own most significant finding for this addition (a fourth instance of "an archived record cannot assume its own old state is still valid"); Implementation must not treat `reactivateClass` as a simple status flip, since doing so would silently reopen the exact invariant gap Review already closed at the design level.
- **(Architecture Update — Grade/Form) The backfill is genuinely imperfect, not merely inconvenient** — every pre-existing Class lands in a placeholder `"Ungrouped"` `GradeLevel`; Weekly Subject Allocation cannot be meaningfully configured for any real Grade/Form until a School Admin does the one-time manual work of reassigning existing Classes. WP-GF6's own distinct "Ungrouped" badge is a mitigation, not a fix.
- **(Architecture Update — Grade/Form) This addition directly unblocks Weekly Subject Allocation's own Implementation** — the same category of "known, direct knock-on effect" already named above for Student Management's own historical dependency on this feature's original scope.

---

# Estimated Impact

A small, self-contained net-new module — no existing modules are modified, and this feature has no outbound calls into any other feature (only inbound calls from Student Management, later). Smaller in scope than Authentication & Authorization or Student Management: no login/token mechanics, no cross-feature account-creation calls, no Mobile surface. The main technical care points are the two database-level constraints (final-Class exclusivity, sequence uniqueness) rather than business-logic complexity.

**Architecture Update (Grade/Form) — additional impact:** a fourth entity within the same module, structurally simpler than a Section (no nesting — `GradeLevel` sits *above* Class, referenced by it, the reverse direction) but with a full CRUD lifecycle (create, correct, reorder, archive, reactivate — 5 write paths) comparable in shape to School Schedule Management's own `Shift`. No new cross-feature outbound dependency is introduced (the same-Shift check and Grade/Form CRUD are both entirely internal to this module); the one new narrow-interface surface (`getGradeLevelShift` et al.) has no real caller yet, mirroring how this module's original `getClassById` once waited for Student Management. Web impact is one new page plus a required field added to two existing dialogs — small.

---

# Change History

- v1.0 — Initial implementation plan.
- v1.1 — Implementation complete (backend + web); both flagged Risks materialized during Implementation (sequence renumbering collided with archived Classes' stale positions in two places) and were fixed. Phase 7 Validation passed with no defects.
- v1.2 — Automated test suite added (unit + integration). Independent code review found and fixed two defects (final-Class archival, archived-Class reorder crash). See `docs/00-governance/Code-Review-Report.md`.
- v1.3 — **Architecture Update (Grade/Form) planned**, following `docs/06-technical-design/Class-Management.md` v1.7's own Phase 4 (Technical Design Review) approval (ACR-009). Adds WP-GF1 (Database Schema & Migration — `GradeLevel`, self-contained, no cross-feature migration-ordering constraint unlike ACR-005's own `Class.shiftId`), WP-GF2 (GradeLevel Core & Lifecycle Backend, mirroring `Class`'s own CRUD one level up, including the real contiguous-sequence convention Technical Design Review's own third finding resolved), WP-GF3 (the same-Shift enforcement wired into `createClass`/`updateClass`/`reactivateClass` — the first two Review findings, made explicit here so Implementation cannot silently skip `reactivateClass`), WP-GF4 (Stable Public Service Interface additions), WP-GF5 (Audit Logging), and WP-GF6 (Web Frontend, including the "Ungrouped" placeholder's own distinct visual treatment). This is the module's first Work Package breakdown, adopted for this addition's own added complexity. **Not yet implemented** — hard-blocks Weekly Subject Allocation's own Implementation Planning, which cannot begin until WP-GF1–WP-GF6 are complete.
