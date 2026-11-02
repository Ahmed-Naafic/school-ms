# Architecture Change Request: Teacher Subject Assignment Weekly Lesson Target

ACR Number: ACR-006

Date: 2026-07-30

Status: Approved

---

# Context

Timetable Management (in progress) requires a Hard Validation, per its own Business Rule #8: a Teacher Subject Assignment may optionally declare how many Lessons per week it should have, and once Lessons scheduled against it reach that count, no more may be created. Teacher Subject Assignment (Accepted) has no such field — it was designed and built before Lessons existed as a concept anywhere in this project.

This ACR is that dependency: adding an optional `weeklyLessonTarget` to `TeacherSubjectAssignment`, the same "an already-Accepted feature's model gains a new reference field, validated through the owning feature's own narrow interface" pattern ACR-002, ACR-004, and ACR-005 already established, applied here to `TeacherSubjectAssignment` instead of `Enrollment`/`Class`.

---

# Options Considered

**Option A — Add an optional `weeklyLessonTarget Int?` to `TeacherSubjectAssignment` (Selected).**
A nullable integer, defaulting to `NULL` (no target enforced) for every existing row and every new Assignment unless explicitly set. No backfill needed — `NULL` is itself the correct, meaningful "no target" value for every pre-existing Assignment, the same reasoning ACR-002/ACR-004 already used for their own optional additions (unlike ACR-005's required field, which needed a real backfill value because "no target" isn't a valid state there).

**Option B — Model the weekly target as its own separate table, keyed by Teacher Subject Assignment.**
Rejected: a single nullable integer has no per-value metadata (no history, no additional attributes) to justify a second table, per "Avoid Premature Abstraction" — the same reasoning this project already applied when rejecting a similar separate-table option for `School.educationLevels` (ACR-003) and Shift's own Default-designation.

**Option C — Store the weekly target on Timetable Management's own side (e.g., a `SubjectWeeklyTarget` table Timetable owns, referencing `teacherSubjectAssignmentId`).**
Rejected: the target is a property *of the Assignment itself* ("this specific Teacher-Subject-Class-Year binding should have N Lessons per week"), not a property of any one Lesson or a Timetable-specific configuration — it belongs on the entity it describes, the same reasoning that placed `Shift.isDefault` on `Shift` rather than on a consumer feature's own table. Also would require a second cross-feature call (Timetable asking its own table, then separately asking Teacher Subject Assignment whether the Assignment is even Active) instead of one.

---

# Decision

Option A is adopted.

- `TeacherSubjectAssignment.weeklyLessonTarget` is added as an optional `Int?` field, via a migration that adds it nullable — no backfill needed, since `NULL` is the correct value for every existing row (no target was ever expressible before this ACR).
- Teacher Subject Assignment's own `createAssignment`/`correctAssignment` gain the ability to set/update this field, validated as "a positive whole number, or absent" — a shape-only check, no new business rule beyond accepting the value.
- Teacher Subject Assignment's own Stable Public Service Interface gains no new function for this — Timetable Management reads the field directly off the Assignment record returned by Teacher Subject Assignment's own existing `getAssignmentDetail`-shaped read functions (already returning the full Assignment record), consistent with how every other feature already reads plain fields off another feature's own narrow-interface return values (e.g., Class Management's `getClassById` return value already exposes `shiftId` without a dedicated `getClassShiftId` function).
- Timetable Management additionally registers a downstream-record checker with Teacher Subject Assignment's own existing `registerDownstreamRecordCheck` extension point (Teacher Subject Assignment's own Business Rule #17), reporting whether any Lesson references a given Assignment — closing that extension point's first real consumer.

## Requirements

- `weeklyLessonTarget` is optional at the schema level; `NULL` means "no target enforced," a valid, permanent state for any Assignment, not just a transitional one pending backfill.
- When provided, `weeklyLessonTarget` must be a positive whole number — enforced at Teacher Subject Assignment's own shape-validation layer.
- Timetable Management is the only feature that ever *enforces* this value against a count of anything; Teacher Subject Assignment itself never counts Lessons or knows what a Lesson is.
- Teacher Subject Assignment's downstream-record-check registry gains its first real registered checker (Timetable Management's own), closing a previously-anticipated-but-unused extension point.

---

# Reasoning

This closes the exact dependency Timetable Management's own Business Rule #8 requires, using the same additive, narrow-field pattern ACR-002/ACR-004 already proved out for optional fields — a required field (ACR-005's own pattern) is not appropriate here, since "no weekly target" is a fully valid, permanent state for a great many Assignments (not every Subject needs an explicit weekly count enforced), unlike ACR-005's `Class.shiftId`, where every Class genuinely needs a real Shift.

---

# Consequences

## Positive

- Timetable Management's own Hard Validation #8 has a real, owned field to read from, without inventing a parallel table or reaching into Timetable's own schema from Teacher Subject Assignment.
- Teacher Subject Assignment's own `registerDownstreamRecordCheck` extension point, previously anticipated but never actually used (per that feature's own Technical Design Risk note), is now genuinely exercised.
- No backfill risk: `NULL` was already the implicit state of every existing Assignment before this field existed; adding it changes nothing about any existing row's own behavior.

## Negative

- Amends an already-Accepted document (Teacher Subject Assignment), requiring a formal Change Request rather than a routine edit — the same category of change ACR-002/ACR-004/ACR-005 already made to Accepted features.
- A new, previously nonexistent coupling: any Timetable Lesson-creation call now implicitly depends on being able to read this field off a Teacher Subject Assignment record — in practice never a real blocker, since the field defaults to `NULL` (no limit) rather than requiring any value.

## Future Impact

- If a future need arises for a *School Subject's* own platform-wide default weekly target (as opposed to a per-Assignment, per-school, per-Class value), that is its own future decision requiring its own reasoning — not attempted here; this ACR's own scope is exactly the per-Assignment value Business Rule #8 requires.

---

# Related Documents

- `docs/03-business/Timetable.md` — Business Rule #8 (the requirement this ACR satisfies) and Relationships section.
- `docs/06-technical-design/Timetable.md` — Database Impact's note on this additive dependency and the Stable Public Service Interface this ACR's downstream-check registration consumes.
- `docs/03-business/Teacher-Subject-Assignment.md` and `docs/06-technical-design/Teacher-Subject-Assignment.md` — gain a Change History entry noting this additive, non-business-rule-changing dependency and the first real use of the downstream-record-check registry.
