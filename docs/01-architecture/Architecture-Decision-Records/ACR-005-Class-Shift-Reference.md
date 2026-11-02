# Architecture Change Request: Class Shift Reference

ACR Number: ACR-005

Date: 2026-07-22

Status: Approved

---

# Context

School Schedule Management (Accepted) was built to establish a school's operating schedule — Working Days, Weekend Days, and Shifts — as its own, single source of truth, per `docs/03-business/School-Schedule-Management.md` Business Rule #1. Its own Business Rule #13 requires that "every Class references exactly one active Shift," but `Class` (owned by the already-Accepted Class Management feature) has no such reference at all — it was designed and built before Shifts existed as a concept anywhere in this project.

This ACR is that dependency: adding a required `shiftId` to `Class`, the same "an already-Accepted feature's model gains a new reference field, validated through the owning feature's own narrow interface" pattern ACR-002 (`Enrollment.sectionId`) and ACR-004 (`Enrollment.academicYearId`) already established, applied here to `Class` instead of `Enrollment`.

Unlike ACR-002/ACR-004, which added their new fields as *optional* (nullable, backfilled with `NULL` for historical rows, mandatory only for new writes going forward), this ACR's own Business Specification (School Schedule Management, Business Rule #13 and its own Business Review resolution) explicitly requires the field to be **required at the schema level**, with every pre-existing Class backfilled to a real value rather than left `NULL` — because unlike an Enrollment's academic year (where no reliable historical value can be inferred), every school already has exactly one well-defined Default Shift by the time this ACR runs (School Schedule Management's own migration creates one for every existing school before this ACR's migration executes), making a correct backfill possible and, per the Business Specification's own explicit decision, required rather than merely nice-to-have.

---

# Options Considered

**Option A — Add a required `shiftId` to `Class`, backfilling every existing row to its own school's Default Shift (Selected).**
`Class` gains a required, non-nullable foreign key to `Shift`. A migration adds the column nullable first, backfills every existing Class to its own school's current Default Shift (guaranteed to exist, since School Schedule Management's own migration runs first and gives every existing school one), then makes the column `NOT NULL`. Going forward, `createClass`/`updateClass` validate `shiftId` through School Schedule Management's own Stable Public Service Interface (`validateShift`, `getActiveShift`), never a direct table query — defaulting to the school's own Default Shift when omitted on create.

**Option B — Add an optional `shiftId`, mirroring ACR-002/ACR-004's own nullable-and-backfilled-with-NULL precedent exactly.**
Rejected: unlike Enrollment's academic year (where historical free-text values cannot be reliably mapped to a real `AcademicYear`), every existing Class's own school already has exactly one unambiguous, correct value to backfill to — its Default Shift. Leaving `shiftId` nullable for historical rows would mean tolerating a permanently-optional field with no principled reason to, once the Business Specification itself decided a real backfill is possible. This project already prefers a required, correctly-backfilled field over an indefinitely-nullable one whenever a real backfill value exists — the reasoning ACR-004 itself gave for rejecting its own Option C (indefinitely accepting two coexisting representations).

**Option C — Have Class Management query School Schedule Management's `Shift` table directly, without an interface function.**
Rejected outright, without serious consideration: this project's Loose Coupling principle (already enforced by every prior ACR) requires cross-feature access through a narrow, owning-feature-controlled interface. `validateShift`/`getActiveShift` already exist on School Schedule Management's own Stable Public Service Interface specifically for this purpose.

---

# Decision

Option A is adopted.

- `Class.shiftId` is added as a required `String` field with a foreign key to `Shift`, via a migration that adds it nullable, backfills every existing row (each Class set to its own school's current Default Shift), then sets it `NOT NULL` — a data backfill, not an index addition, but the same "generated migration, hand-edited with one additional raw-SQL step" pattern this project has used for partial unique indexes.
- **This migration has a hard ordering dependency on School Schedule Management's own migration**, which must apply and complete its own backfill (every existing school gets a default Calendar and "Morning" Shift) before this one runs, since this migration's backfill query reads the `Shift` rows that one creates. See `docs/06-technical-design/School-Schedule-Management.md`'s own Database Impact section for the full sequencing detail.
- `createClass`/`updateClass` accept an optional `shiftId` parameter, validated via `schoolScheduleService.validateShift(schoolId, shiftId)` — never a direct query against `Shift`. When omitted on `createClass`, it defaults to `schoolScheduleService.getActiveShift(schoolId)`'s own id (the school's current Default Shift), mirroring Student Management's own Promotion-default pattern: the defaulted value still passes through the exact same validation an explicit choice would.
- Class Management additionally gains `countActiveClassesByShift(schoolId, shiftId)`, a new narrow interface function consumed by School Schedule Management's own `archiveShift` (to enforce that feature's own Business Rule #16 — a Shift cannot be archived while an active Class references it). A single, one-directional function, not a Subject-Management-style extensibility registry, since only this one call site will ever need it.
- No other change to Class Management's own Business Rules, Sections, sequencing, or lifecycle (archive/reactivate/reorder/designate-final all unchanged).

## Requirements

- `shiftId` is required at the schema level for every Class, with no `NULL` value ever left after this ACR's own migration completes.
- `shiftId` is validated only through School Schedule Management's existing Stable Public Service Interface (`validateShift`, `getActiveShift`) — Class Management never queries the `shifts` table directly, preserving the Loose Coupling principle every prior ACR has established.
- An Archived Shift is never a valid `shiftId` value for `createClass`/`updateClass`, mirroring the existing "Archived reference is never valid for a new write" rule already applied to `classId`/`sectionId`/`academicYearId` elsewhere in this project.
- Every pre-existing Class must be correctly backfilled to its own school's Default Shift — verified independently during Phase 7 Validation against genuinely pre-existing data, not just this ACR's own newly-created test fixtures.
- `countActiveClassesByShift` is read-only, with no side effects, matching `getClassById`/`listActiveSectionsForClass`'s own existing style.

---

# Reasoning

This closes the exact dependency School Schedule Management's own Business Rule #13 requires, using the same additive, narrow-interface pattern ACR-002 and ACR-004 already proved out — extended here to a *required*, fully-backfilled field rather than an optional one, because (unlike Enrollment's free-text academic year) a correct, unambiguous backfill value genuinely exists for every historical row. Choosing a required field over an indefinitely-nullable one, whenever a real backfill is possible, is the same reasoning this project already applied when rejecting a permanently-dual-representation option in ACR-004.

---

# Consequences

## Positive

- Every Class now has a real, structured Shift reference instead of no schedule concept at all — Timetable and other future time-aware features can rely on this being always present, never optional.
- No ambiguous or permanently-dual data shape is introduced — unlike Enrollment's own free-text/structured coexistence, every Class (old and new) has exactly one, correctly-backfilled `shiftId`.
- Reuses School Schedule Management's already-built Stable Public Service Interface exactly as designed.

## Negative

- Amends an already-Accepted document (Class Management), requiring a formal Change Request rather than a routine edit — the same category of change ACR-002 and ACR-004 already made to Accepted features.
- **This migration cannot run independently of School Schedule Management's own migration — a genuine, hard cross-feature deployment ordering constraint**, not merely a preference. Running them out of order, or attempting to combine them into one migration, would leave this ACR's own backfill with nothing correct to point Classes at.
- Every `createClass`/`updateClass` call site (including this project's own test fixtures across multiple other features, e.g. Teacher Subject Assignment's own integration tests that create Classes) now implicitly depends on School Schedule Management existing and having a resolvable Default Shift — a new, previously nonexistent coupling between "can a Class be created at all" and "does this school's schedule exist yet." In practice this is never a real blocker, since every school always has a Default Shift from the moment it is created (School Schedule Management's own Business Rule #3), but it is a genuine new dependency worth naming.

## Future Impact

- Timetable, Attendance, and any future feature that needs to know which Shift a Class's periods fall within can rely on `Class.shiftId` being present and valid for every Class, without a fallback "what if this Class has no Shift" case to handle.
- If a future need arises to let a Class reference more than one Shift (e.g., a Class with morning and afternoon sections taught separately), that is its own future decision requiring its own reasoning — explicitly not attempted here; this ACR's own scope is exactly what School Schedule Management's Business Rule #13 already requires, "exactly one."

---

# Related Documents

- `docs/03-business/Class-Management.md` — gains a Change History entry noting this additive, non-business-rule-changing dependency.
- `docs/06-technical-design/Class-Management.md` — gains a Change History entry describing the schema/interface addition.
- `docs/03-business/School-Schedule-Management.md` — Business Rule #13 (the requirement this ACR satisfies) and Relationships section (this dependency was anticipated there from that feature's own Business Discovery).
- `docs/06-technical-design/School-Schedule-Management.md` — Database Impact's Migration Sequencing note, and the Stable Public Service Interface this ACR consumes.
- `docs/07-implementation-planning/School-Schedule-Management.md` — WP1 (the two-migration sequencing) and WP6 (this ACR's own Class Management changes), where this decision was first settled during Implementation Planning.
