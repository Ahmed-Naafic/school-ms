# Architecture Change Request: Enrollment Section Reference

ACR Number: ACR-002

Date: 2026-07-19

Status: Approved

---

# Context

Product Owner requested a presentation change to Class Management: wherever a Class and Section are shown together, display them combined (Class "F1" + Section "A" → "F1A"), and add a School-Admin-facing "Add Section" entry point alongside "Create Class".

Extending that request to Student Management's Promotion surfaced a genuine gap: `Enrollment` (`backend/prisma/schema.prisma`) has only ever carried a `classId` — there is no way to know which Section, if any, a Student is currently placed in. Every layer of Student Management (`students.service.js`, `students.repository.js`, `students.validation.js`, `PromoteStudentDialog.jsx`, `EnrollStudentDialog.jsx`) is Class-only; Section is invisible to this feature entirely today.

The Product Owner wants Promotion to be Section-aware: when a Student currently placed in a Section is promoted, the system should suggest the same-named Section in the destination Class, if one exists — without ever parsing the presentation-only "F1A" string to derive it.

---

# Options Considered

**Option A — Add a nullable `sectionId` to `Enrollment` (Selected).**
Enrollment gains an optional, additive foreign key to `Section`. Backward-compatible: every existing Enrollment row simply has `sectionId: null`. No existing column changes meaning or type.

**Option B — Leave `Enrollment` untouched; drop Section-aware Promotion.**
Rejected: the Product Owner explicitly wants Promotion to suggest a matching destination Section when the Student's current Enrollment has one — this is not achievable without Enrollment being able to express "which Section."

**Option C — Derive a Student's current Section by parsing the combined "F1A" display string.**
Rejected outright by the Product Owner ("Do not infer Sections from display names") — the combined name is a presentation-layer convention only, never a data source. It's also unreliable (Section names aren't necessarily single letters, and Class names can themselves contain letters/digits ambiguously).

---

# Decision

Option A is adopted.

- `Enrollment.classId` remains required, exactly as today — an Enrollment always references a Class.
- `Enrollment.sectionId` is added: nullable, foreign key to `Section`.
- If `sectionId` is present, it must belong to the same Class referenced by `classId` — a Section from a different Class is never a valid combination.
- If a Class has no active Sections at all, `sectionId` remains `NULL` for any Enrollment into it.
- **If a Class has one or more active Sections, Enrollment into that Class requires a `sectionId`** — a Class that has been organized into Sections is no longer directly enrollable without picking one, since "which Section" is no longer an unanswered-by-design question once Sections exist for that Class.
- Enrollment into an archived Section is never permitted, mirroring the existing "no new Enrollment into an archived Class" rule (Class-Management.md Business Rule #9).
- Promotion continues to use Class Management's existing Class-sequence suggestion (`getSuggestedNextClass`) to determine the destination Class — this ACR does not change how the destination *Class* is chosen. If the Student's current Enrollment carries a `sectionId`, the destination Class's Sections are searched for one with the same `name`; if found, it is suggested (not enforced — School Admin may still choose differently, consistent with Promotion's existing override-friendly design). If no same-named Section exists in the destination Class, no Section is pre-selected and School Admin must choose one explicitly (subject to the same "required if the destination Class has active Sections" rule above).

## Requirements

- `sectionId` is optional at the schema level, but conditionally required by business logic: mandatory whenever the target Class has at least one active Section, `NULL`-only whenever it has none.
- A `sectionId`/`classId` combination is always validated together — a Section belonging to a different Class is rejected, not silently accepted.
- Enrollment into an archived Section is rejected with the same clarity as enrollment into an archived Class.
- Promotion's Section-matching is a suggestion only, derived from actual Section records (matched by `name`) in the destination Class — never from parsing any combined display string.
- Class Management's existing narrow public interface to Student Management (`getClassById`, `getSuggestedNextClass`, `getFinalClass` — see Class-Management.md's Technical Design) gains the minimum addition necessary for Student Management to validate and suggest Sections without querying the `sections` table directly, preserving the Loose Coupling principle that interface was built around.

---

# Reasoning

This is an additive, backward-compatible schema and behavior extension, not a redesign — it does not change what `Enrollment.classId` means, does not touch Class Management's own Business Rules or database model, and does not retroactively require existing Enrollment rows to gain a Section. It closes a real, Product-Owner-identified gap (Promotion has no way to preserve a Student's Section placement across a grade transition) using the same "feature-owned narrow interface" pattern already established between these two features, rather than having Student Management reach into Class Management's `sections` table directly.

---

# Consequences

## Positive

- Promotion can now preserve a Student's Section placement across a grade transition when a matching Section exists, closing a real gap the combined-display-name request surfaced.
- No existing data or behavior changes — every current Enrollment row and every current API call that omits `sectionId` continues to work exactly as before.
- Reuses, rather than bypasses, Class Management's existing narrow-interface pattern.

## Negative

- Amends an already-Accepted document (Student Management), requiring a formal Change Request rather than a routine edit.
- Adds one new conditional validation rule ("Section required once the Class has any active Sections") that both `enrollStudent` and `promoteStudent`/`correctStudentClass` must enforce consistently — a second implementation of the same rule that diverges would be a real defect.
- A School Admin who previously enrolled Students into a Class with no Sections, then later adds a Section to that Class, changes that Class's enrollability going forward (new Enrollments now require a Section) — existing Enrollments are unaffected, but this is a behavior change worth the School Admin being aware of. No migration of existing Enrollments is performed or required.

## Future Impact

- If Subject Management or Timetable later need Section-level granularity (e.g., a Subject taught only to Section A), they should consume Class Management's Section data through its own narrow interface, following this same pattern — not by reaching into `students`' or `classes`' internals directly.

---

# Related Documents

- `docs/03-business/Student-Management.md` — Enrollment/Promotion Business Rules (amended by this ACR).
- `docs/03-business/Class-Management.md` — Relationships section (amended by this ACR to note the new interface consumer).
- `docs/06-technical-design/Student-Management.md` and `docs/06-technical-design/Class-Management.md` — both amended.
