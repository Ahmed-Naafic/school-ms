# Architecture Change Request: Class Grade Level Reference

ACR Number: ACR-009

Date: 2026-07-31

Status: Approved

---

# Context

Weekly Subject Allocation (Business Discovery, `docs/03-business/Weekly-Subject-Allocation.md`) must be configured once per **Grade/Form** — e.g. once for "Grade 8," automatically applying to Classes G8A, G8B, G8C, and G8D — not once per individual Class. That Business Discovery's own Architecture Question #1 left open exactly how Classes are grouped into a Grade/Form at all: no such concept exists anywhere in Class Management (Accepted) today. A Class currently has a `name`, a `sequenceOrder`, an `isFinal` flag, a `status`, and (per ACR-005) a required `shiftId` — nothing resembling a Grade/Form grouping.

This ACR is that dependency: the same "an already-Accepted feature's model gains a new reference field, validated through the owning feature's own narrow interface" pattern ACR-002, ACR-004, and ACR-005 already established, applied here to a genuinely new concept (Grade/Form) rather than a reference to an already-existing one.

---

# Options Considered

**Option A — A free-text `gradeLevel` string field directly on `Class` (e.g. `"Grade 8"`, `"Form 1"`).**
Simplest possible addition — no new entity, no new migration beyond one column. Rejected: a free-text field has no structural protection against a typo silently creating a second, unintended group (`"Grade 8"` vs `"Grade  8"` vs `"grade 8"`), no way to rename a Grade/Form's own display label without rewriting every Class's own row, and no natural place to hang a display order or an Active/Archived lifecycle if a Grade/Form is retired. This project has consistently preferred a real, referenceable entity over a free-text grouping value whenever the concept has its own lifecycle and needs reliable, typo-proof grouping — the same reasoning that already made `Shift` and `Subject` their own entities rather than string fields on the things that reference them.

**Option B — A new `GradeLevel` entity, owned by Class Management, with `Class.gradeLevelId` as a required reference (Selected).**
A new, school-scoped, named, orderable, archivable entity — structurally the same shape as `Shift` (school-scoped, named, `sequenceOrder`, Active/Archived) but one level up from `Class` rather than one level down. `Class` gains a required `gradeLevelId` foreign key, validated only through Class Management's own new narrow interface, never a direct cross-feature table query.

**Option C — Infer the grouping automatically from each Class's own name (e.g. parsing `"G8A"` → `"Grade 8"`).**
Rejected outright, and already named as the weakest option in Weekly Subject Allocation's own Business Discovery: this would silently break the moment a school names a Class anything that doesn't fit an assumed pattern, and would make Class Management's own naming freedom (Business Rule: a Class's own name has no required shape today) implicitly constrained by a parser nothing in this project has ever validated or documented.

**Option D — Weekly Subject Allocation owns the Grade/Form grouping itself, independently of Class Management.**
Rejected: a Grade/Form is fundamentally a grouping *of Classes* — the same category of concept as a Shift being a grouping-adjacent concept *of Classes* that School Schedule Management owns and Class Management merely references. Having a downstream, narrowly-scoped feature (Weekly Subject Allocation) own a concept that groups an upstream feature's own core entity would invert this project's own established Feature Ownership principle — the same reasoning already used to keep `Section` owned by Class Management rather than by Student Management, even though Student Management is Section's own heaviest consumer.

---

# Decision

Option B is adopted.

- A new `GradeLevel` model, owned by Class Management: `id`, `schoolId`, `name` (school-configurable free text, e.g. `"Grade 8"`, `"Form 1"` — never a fixed platform enum, since different schools use different naming conventions for the same concept, exactly as Shift names already are), `sequenceOrder` (mirroring `Class.sequenceOrder`'s own display-ordering role), `status` (`ACTIVE`/`ARCHIVED`, Archive Before Delete, consistent with every other entity in this project).
- `Class` gains a required `gradeLevelId String` with a foreign key to `GradeLevel` — added nullable first, backfilled, then set `NOT NULL`, the same two-step migration shape ACR-005 already established for `Class.shiftId`.
- **Backfill is honest, not pretended-automatic**: unlike ACR-005's own backfill (every existing school already has exactly one well-defined Default Shift to point every Class at), no automatic, reliable value exists to backfill `gradeLevelId` to — Option C (name inference) was rejected specifically because no such reliable mapping exists. The migration instead creates one placeholder `GradeLevel` per school (named `"Ungrouped"`, Active) and backfills every pre-existing Class to it. This is recorded here explicitly as an imperfect backfill requiring a real, one-time manual follow-up (the School Admin reassigning existing Classes to real Grade/Form groups), not a clean, automatic resolution — the same category of honesty ACR-005 itself modeled when it explained precisely *why* its own backfill was reliable, rather than merely asserting a value would be found.
- **New Business Rule, additive to Class Management's own lifecycle**: every Class within the same `GradeLevel` must reference the same `Shift`. Enforced at `createClass`/`updateClass` time — assigning a Class to a `GradeLevel` that already has one or more Active member Classes on a *different* Shift is rejected. This is what makes Weekly Subject Allocation's own "available weekly teaching periods" calculation (Working Days × that Shift's own Teaching Period count) a single, well-defined number per Grade/Form, closing Weekly Subject Allocation's own Architecture Question #2 in the same stroke.
- **No `shiftId` is stored on `GradeLevel` itself** — deliberately, the same "structural reference, never a second stored source of truth" reasoning already applied throughout this project (most recently, `Lesson` never storing its own `shiftId`, always deriving it from `Period.shiftId`). A Grade/Form's own effective Shift is always derived by reading any one of its own Active member Classes' `shiftId` — guaranteed identical across all of them by the Business Rule above — never a separately-stored value that could drift out of sync.
- Class Management gains a new narrow interface function, `getGradeLevelShift(schoolId, gradeLevelId)` (or an equivalently-named read), for Weekly Subject Allocation's own future consumption — returning the one Shift every member Class of that Grade/Form already shares, `null` if the Grade/Form has no member Classes yet. The exact function name and shape is left to Technical Design.
- No other change to Class Management's own existing Business Rules, Sections, sequencing, or lifecycle (archive/reactivate/reorder/designate-final all unchanged).

## Requirements

- `gradeLevelId` is required at the schema level for every Class, with no `NULL` value left after this ACR's own migration completes.
- `GradeLevel` is validated and consumed only through Class Management's own Stable Public Service Interface — no future feature (Weekly Subject Allocation included) queries the `grade_levels` table directly.
- An Archived `GradeLevel` is never a valid `gradeLevelId` value for `createClass`/`updateClass`, mirroring the existing "an archived reference is never valid for a new write" rule already applied to `classId`/`sectionId`/`shiftId`/`academicYearId` elsewhere in this project.
- Every Class within one `GradeLevel` must share the same `shiftId` — enforced at write time, never merely assumed.
- The placeholder `"Ungrouped"` `GradeLevel` this ACR's own migration creates must be clearly identifiable as a temporary backfill artifact, not a genuine Grade/Form a School Admin is meant to keep using — Implementation Planning should record how this is surfaced (e.g. a distinct label, or a Documentation/Validation note prompting real reassignment), not leave it indistinguishable from a real Grade/Form a School Admin deliberately created.

---

# Reasoning

Weekly Subject Allocation cannot answer "how are periods distributed across Subjects for Grade 8" without a real, reliable way to know which Classes are Grade 8 — and no such concept exists in this project today. Modeling `GradeLevel` as its own entity, the same shape as `Shift`, keeps this consistent with how this project has always treated a school-configurable, named, orderable, lifecycle-having grouping concept, rather than reaching for a free-text shortcut that would only defer the same structural problem (typos, unrenameable labels, no lifecycle) to a later phase. Requiring every Class in a `GradeLevel` to share one `Shift`, enforced rather than merely hoped for, is what makes Weekly Subject Allocation's own central calculation well-defined at all — without it, "Grade 8's own available weekly teaching periods" would not be a single number if Grade 8's own Classes could span two different Shifts.

---

# Consequences

## Positive

- Weekly Subject Allocation's own Architecture Questions #1 and #2 are both closed by this one decision — a real grouping mechanism, and a guarantee that every Grade/Form maps to exactly one Shift.
- `GradeLevel` follows the same proven shape (`Shift`) this project already knows how to build, validate, and test — no genuinely new architectural pattern is introduced, only a new instance of an existing one.
- No second, driftable source of truth for "which Shift does this Grade/Form use" — it is always derived from already-validated Class data, the same discipline `Lesson`'s own non-stored `shiftId` already established.

## Negative

- Amends an already-Accepted document (Class Management), requiring a formal Change Request rather than a routine edit — the same category of change ACR-002, ACR-004, and ACR-005 already made.
- **The backfill is genuinely imperfect, not merely inconvenient**: every pre-existing Class lands in a placeholder `"Ungrouped"` GradeLevel, and Weekly Subject Allocation cannot be meaningfully configured for any Grade/Form until a School Admin does the real, manual work of reassigning existing Classes to genuine Grade/Form groups. This is a real, one-time operational burden this decision knowingly accepts rather than papering over with a false-confidence automatic mapping.
- The new "one Shift per GradeLevel" constraint could reject a School Admin's own attempt to organize Classes in a way this project had not previously restricted (e.g. if a school genuinely wanted Grade 8 split across two Shifts for capacity reasons) — a real, if narrow, new restriction on how Classes may be grouped, not merely an additive convenience.

## Future Impact

- Any future feature needing a "which Classes belong together at the Grade/Form level" grouping (e.g. a future Grade/Form-scoped report) can rely on `GradeLevel` being the one, already-established mechanism, rather than inventing its own.
- If a genuine future need arises for a Grade/Form to legitimately span two Shifts, that is its own future decision requiring its own reasoning and its own Business Review — explicitly not accommodated here.

---

# Related Documents

- `docs/03-business/Weekly-Subject-Allocation.md` — Architecture Questions #1 and #2 (the requirements this ACR resolves) and this feature's own Business Review, which formally adopted this decision.
- `docs/01-architecture/Architecture-Decision-Records/ACR-008-Weekly-Subject-Allocation-Not-Curriculum-Management.md` — the architecture decision this ACR is a direct, necessary consequence of.
- `docs/01-architecture/Architecture-Decision-Records/ACR-005-Class-Shift-Reference.md` — the precedent this ACR's own migration shape and "structural reference, never duplicated" reasoning both follow closely.
- `docs/03-business/Class-Management.md`, `docs/06-technical-design/Class-Management.md` — will each need a Change History entry noting this additive dependency once Weekly Subject Allocation reaches Technical Design and this ACR is actually implemented; not yet amended, since no implementation has begun.
