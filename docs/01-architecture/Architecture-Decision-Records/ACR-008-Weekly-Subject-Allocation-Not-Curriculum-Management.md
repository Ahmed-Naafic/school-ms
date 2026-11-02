# Architecture Change Request: Weekly Subject Allocation, Not a Standalone Curriculum Management Feature

ACR Number: ACR-008

Date: 2026-07-31

Status: Approved

---

# Context

Timetable Management's own generation engine needs to know how many teaching periods per week each Subject should receive for a given group of Classes — a real business concept that turned out to be missing entirely from this project's own architecture. Timetable Management's first pass (ACR-006) plugged this gap the fastest available way: an optional `weeklyLessonTarget` field directly on `TeacherSubjectAssignment`, set per Teacher-Subject-Class binding.

While designing the timetable architecture further and reviewing the real workflow used by schools in Somalia, the Product Owner identified that this number does not actually vary by *Teacher* or by individual *Class* — it varies by **Grade/Form** (every Class in "Grade 8" gets the same weekly Math allocation, regardless of which of its own sections a given Teacher happens to teach) and by **school** (a school's own available weekly teaching capacity is derived from its own Calendar and Shift configuration, never a fixed number). `TeacherSubjectAssignment.weeklyLessonTarget` cannot express either of these things — it is set per individual Assignment, with no awareness of a Grade/Form grouping or of the school's own actual weekly capacity, and nothing prevents every Assignment for the same Subject across a Grade/Form's own Classes from silently disagreeing with each other.

A standalone "Curriculum Management" feature was considered as the proper home for this concept, and explicitly rejected.

---

# Options Considered

**Option A — A standalone Curriculum Management feature.**
A new, independent, top-level feature (its own place in the Feature Delivery Sequence, its own navigation entry, its own full lifecycle) responsible for defining a school's curriculum: which Subjects belong to which Grade/Form, how many weekly periods each gets, and — implicitly, by name — likely growing over time to also cover syllabi, academic standards, or curriculum documents.

*Rejected.* Reviewed against the real workflow used by schools in Somalia, "how many periods per week does Math get in Grade 8" is not experienced by these schools as a separate curriculum-planning exercise — it is a direct input to building the timetable, configured once per year, immediately before assigning Teachers and generating the schedule. A standalone feature would give this single number its own top-level surface area disproportionate to what it actually does, and would invite exactly the scope growth (syllabi, standards, curriculum documents) this project has no present business requirement for and does not want to build ahead of an actual need (Decision-Making-Principles' Avoid Premature Abstraction / YAGNI).

**Option B — Weekly Subject Allocation, a narrow sub-feature nested under Timetable Management (Selected).**
A feature scoped to answering exactly one question — how the available weekly teaching periods are distributed across Subjects, per Grade/Form — living in Timetable's own navigation (`Timetable → Weekly Subject Allocation`), not the platform's own top-level Feature Delivery Sequence, since it exists solely to support timetable generation and has no purpose independent of it.

*Adopted.* Matches the real, narrow business need exactly: nothing more than an allocation of periods to Subjects, per Grade/Form, calculated against a capacity School Schedule Management already owns. Placing it inside Timetable's own module (rather than as a sibling top-level feature) reflects that it exists only to support timetable generation — the same reasoning that already places "Generate Timetable," "Master Timetable," and "Published Timetables" together under one module rather than as separate platform features.

**Option C — Keep `TeacherSubjectAssignment.weeklyLessonTarget` (ACR-006) as-is, do nothing further.**
*Rejected.* Cannot express a Grade/Form-level allocation, cannot guarantee two Assignments for the same Subject across a Grade/Form's own Classes agree with each other, and provides no mechanism at all for detecting that a school's own available weekly capacity changed underneath an existing set of per-Assignment targets. The exact gap the Product Owner identified.

---

# Decision

Option B is adopted.

- A new sub-feature, **Weekly Subject Allocation**, is introduced under the Timetable module — not a new top-level entry in the Feature Delivery Sequence, not a standalone Curriculum Management feature.
- It owns exactly one responsibility: distributing a Grade/Form's own available weekly teaching periods (always calculated live from School Schedule Management, never hardcoded or manually entered) across the Subjects taught to that Grade/Form, for a given Academic Year, including an optional Double Period flag per Subject.
- `TeacherSubjectAssignment.weeklyLessonTarget` (ACR-006) is superseded — Teacher Subject Assignment no longer asks for, stores, or needs a weekly lesson count of its own; that number is read from this new feature instead, the moment a Teacher is assigned a Subject for a Class within an already-allocated Grade/Form. The exact mechanism (formal field removal vs. deprecation) is deferred to Technical Design, per Weekly Subject Allocation's own Business Discovery, Architecture Question #4.
- Timetable Management's own generation engine reads this new feature's data directly, replacing its own prior reliance on `weeklyLessonTarget`. It must never itself ask "how many lessons of this Subject" — that number already exists here.
- Curriculum documents, syllabi, and academic standards remain entirely out of scope for this project, not merely deferred for this feature specifically.

## Requirements

- Weekly Subject Allocation must calculate available weekly teaching periods from School Schedule Management's own published interfaces only — never a stored, cached, or hardcoded figure.
- Weekly Subject Allocation must be configured once per Grade/Form, never per individual Class.
- Weekly Subject Allocation must detect, automatically, when a School Schedule Management change invalidates an existing allocation, and must block Timetable generation until it is reviewed and re-saved.
- No new top-level platform feature, and no curriculum-document-management capability of any kind, is introduced by this decision.

---

# Reasoning

The real, narrow business need — "how many periods per week does this Subject get, for this Grade/Form, given this school's own actual weekly teaching capacity" — does not require or justify a standalone feature. It requires a small, sharply-scoped sub-feature living exactly where it is used: immediately before Teacher Subject Assignment and Timetable generation, inside Timetable's own module. This is the same reasoning this project has already applied when it chose not to build separate top-level features for School Calendar and Shifts independently of School Schedule Management, or for Master/Class/Teacher Timetable views independently of Timetable Management itself — closely related, narrowly-scoped concerns are grouped under one module rather than each becoming its own platform feature.

---

# Consequences

## Positive

- Timetable Management's own generation engine gains a real, Grade/Form-aware, school-capacity-aware weekly period source, closing the exact gap ACR-006's own `weeklyLessonTarget` could not.
- Duplicate configuration is eliminated — one allocation per Grade/Form, not one per individual Class or per individual Teacher Subject Assignment.
- A school's own available weekly teaching capacity is guaranteed to be read live from School Schedule Management, never hardcoded — the same discipline this project has followed since School Schedule Management's own founding Business Rules.
- No premature curriculum-management surface area is built ahead of an actual, stated business need.

## Negative

- Introduces a new, real dependency for Class Management: some mechanism must exist to group Classes into a Grade/Form, which does not exist in this project today (see Weekly Subject Allocation's own Business Discovery, Architecture Question #1) — a genuine, not-yet-resolved gap this decision surfaces rather than closes on its own.
- Supersedes ACR-006's own `weeklyLessonTarget` field so soon after its own introduction — an accepted cost of discovering the real shape of this business concept only after building a first, narrower version of it, not a sign either decision was made carelessly.
- Relocates `SubjectSchedulePreference.doublePeriodPreferred` from a per-Teacher-Subject-Assignment concept to a per-Grade/Form one, requiring Timetable Management's own Technical Design to reconcile the two once Weekly Subject Allocation is itself Accepted.

## Future Impact

- If a genuine future need for curriculum documents, syllabi, or academic standards ever materializes, that remains its own future decision, requiring its own Business Discovery and its own reasoning — not something this decision preemptively designs for or rules out.
- Class Management's own eventual Grade/Form grouping mechanism, once designed, may be reusable by future features beyond Weekly Subject Allocation (e.g. Grade/Form-scoped reporting) — but is not designed here, and should not be assumed to exist until its own additive change is actually made.

---

# Related Documents

- `docs/03-business/Weekly-Subject-Allocation.md` — the full Business Discovery this ACR's decision grounds; now Business-Reviewed and Approved (v1.0), with every Architecture Question this decision itself did not resolve closed in that later round.
- `docs/01-architecture/Architecture-Decision-Records/ACR-006-Teacher-Subject-Assignment-Weekly-Lesson-Target.md` — the decision this ACR supersedes.
- `docs/01-architecture/Architecture-Decision-Records/ACR-009-Class-Grade-Level-Reference.md` — the direct, necessary consequence of this ACR: resolves Weekly Subject Allocation's own Architecture Question #1 (Grade/Form grouping) via a new `GradeLevel` entity owned by Class Management.
- `docs/03-business/Teacher-Subject-Assignment.md`, `docs/06-technical-design/Teacher-Subject-Assignment.md` — will need their own amendment once Weekly Subject Allocation is Accepted, formally retiring `weeklyLessonTarget`'s own role.
- `docs/03-business/Timetable.md`, `docs/06-technical-design/Timetable.md` — will need their own amendment once Weekly Subject Allocation is Accepted, replacing the generation engine's own reliance on `weeklyLessonTarget` and relocating Double Period preference.
- `docs/03-business/Class-Management.md` — carries a forward-reference note (added alongside ACR-009) about the pending `GradeLevel`/`gradeLevelId` additive change; will need its own full Change History amendment once Weekly Subject Allocation reaches Technical Design and ACR-009 is actually implemented.
