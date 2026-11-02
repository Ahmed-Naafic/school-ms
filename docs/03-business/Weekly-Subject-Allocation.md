# Weekly Subject Allocation

Version: 1.0

Status:
- Business Discovery complete. Produced directly from the Product Owner's own detailed architecture direction (Background, School Context, New Feature, Grade/Form Level, Example, Validation, Dependency, Double Periods, Teacher Subject Assignment Change, Timetable Generation, Workflow sections of the originating request) — the same "fully pre-specified" starting point School Schedule Management's own v0.1 draft began from.
- **Phase 2 (Business Review) complete — Approved.** All six Architecture Clarifications raised in the v0.1 draft have been resolved by the Product Owner in this round; approved decisions are incorporated throughout this document. Most significantly, Architecture Question #1 (how Classes group into a Grade/Form at all) is resolved via **ACR-009** — a new `GradeLevel` entity owned by Class Management, with `Class.gradeLevelId` required, and a new Business Rule that every Class within one `GradeLevel` shares the same Shift.
- Approved for Phase 3 (Technical Design).
- Not approved for Implementation. Per the Product Owner's own explicit instruction, no implementation has begun — this document, ACR-008, ACR-009, and the Documentation Impact Analysis delivered alongside the v0.1 draft are the complete output of Business Discovery and this Business Review round.

---

# Purpose

Weekly Subject Allocation answers exactly one question: **"How should the available weekly teaching periods be distributed across the Subjects, for a given Grade or Form?"**

It exists because Timetable Management's own generation engine needs to know how many teaching periods per week each Subject should receive for a given group of Classes, and that number cannot be invented by the generator, hardcoded by the platform, or left implicit in a Teacher Subject Assignment. A school's own available weekly teaching capacity is itself derived — never fixed — from three things School Schedule Management already owns: the **School Calendar's** Working Days, the **Shift's** own teaching Periods, and how many of each exist. Two schools with different Calendars or Shifts have different weekly capacities; nothing in this feature may assume any school has any particular number of periods (e.g. 35) available.

This feature was **not** built as a standalone "Curriculum Management" feature, a direction seriously considered and then explicitly rejected — see ACR-008 for the full reasoning. It is intentionally narrow, intentionally nested under the Timetable module (not a top-level platform feature), and intentionally silent about everything except the one allocation question above.

Without this feature, Teacher Subject Assignment would have to keep asking "how many lessons per week" itself (as it did, temporarily, via ACR-006's own `weeklyLessonTarget` field) — a question that does not actually belong to "which Teacher teaches which Subject to which Classes," and that TSA's own recent refactor (Version 1.3, `docs/03-business/Teacher-Subject-Assignment.md`) already deliberately removed from that feature's own responsibility, anticipating this feature's arrival.

---

# Architecture Position

Weekly Subject Allocation is **not a new entry in the platform's own top-level Feature Delivery Sequence** — it is a sub-feature of Timetable Management, occupying a position in Timetable's own internal navigation:

```
Timetable
│
├── Weekly Subject Allocation
├── Generate Timetable
├── Master Timetable
├── Teacher Timetable
├── Class Timetable
└── Published Timetables
```

Its own dependency chain, per the Product Owner's own stated Workflow:

```
School Schedule
    ↓
Classes
    ↓
Subjects
    ↓
Teachers
    ↓
Weekly Subject Allocation
    ↓
Teacher Subject Assignment
    ↓
Generate Timetable
    ↓
Review
    ↓
Publish
```

This is a **retroactive insertion between two already-Accepted/Approved features**, the same category of event as Academic Year Management's and School Schedule Management's own earlier insertions into this project's sequence: Teacher Subject Assignment (Accepted) and Timetable Management (Accepted) both already exist and both already depend, in different ways, on the exact number this feature now formalizes. Neither is being rebuilt from scratch — each gains an additive dependency on this feature once it is itself Accepted. See Relationships, and the accompanying Documentation Impact Analysis, for exactly what changes where.

School Schedule Management **remains the single source of truth** for Working Days, Shifts, and Periods — this feature is a downstream consumer of its already-published interfaces (`getWorkingDays`, `getActiveShift`/`getSchoolShifts`, `getShiftPeriods`), never a second store of any of that data.

---

# Feature Overview

A school's **Weekly Subject Allocation** is a per-**Grade/Form**, per-**Academic Year** record answering "how many teaching periods per week does each Subject get, for every Class in this Grade/Form." It is created once per Grade/Form (e.g. once for "Grade 8," once for "Form 1") and applies automatically to every Class grouped under that Grade/Form (Grade 8 → G8A, G8B, G8C, G8D) — never configured per individual Class, avoiding the duplicate, repetitive configuration a per-Class approach would require.

**Resolved (Business Review):** a Grade/Form is a real, referenceable entity — `GradeLevel`, owned by Class Management, added via **ACR-009** — not a free-text label or a name-parsing guess. Every Class belongs to exactly one `GradeLevel`, and every Class within the same `GradeLevel` must share the same Shift (a new Class Management Business Rule ACR-009 also introduces), which is exactly what makes "this Grade/Form's own available weekly teaching periods" a single, well-defined number.

The **available weekly teaching periods** figure a Grade/Form's own allocation must fit inside is never entered by the Administrator — it is calculated automatically, every time it is needed, from:

- the Grade/Form's own single, shared Shift — derived, not stored, by reading any one of its member Classes' own `shiftId` through Class Management's own narrow interface (guaranteed identical across every member Class by ACR-009's own Business Rule),
- that Shift's own configured Teaching Periods (excluding Break Periods entirely — a Break is never an available teaching slot),
- the School Calendar's own configured Working Days.

`Available Weekly Teaching Periods = (number of Working Days) × (number of Teaching Periods per day in the assigned Shift)`, e.g. 5 Working Days × 7 Teaching Periods = 35; 5 × 6 = 30; 2 × 8 = 16 for a school with only a two-day weekend Shift. Nothing in this feature may hardcode any of these numbers, or assume any of them ahead of reading them from School Schedule Management at the moment they are needed.

The Administrator's own job is only to **distribute** that calculated number across the Subjects taught to that Grade/Form — the allocation must account for the full amount, exactly, before it can be saved; it can never exceed it, and it can never be saved incomplete.

A Subject may additionally be flagged as requiring **Double Periods** within this same allocation — information Timetable Management's own generation engine will later consume, exactly as it already does today via `SubjectSchedulePreference.doublePeriodPreferred`, relocated to this feature's own, more appropriate home (see Relationships).

If School Schedule Management later changes in a way that changes a Grade/Form's own available weekly teaching periods (a Working Day added/removed, a Period added/removed, a different Shift assigned), every Weekly Subject Allocation whose own calculated total no longer matches its own saved allocation is automatically marked **Needs Review** — and Timetable Management's own generation is blocked **school-wide**, not only for that Grade/Form, until the Administrator reviews and re-saves every Needs-Review allocation.

---

# Business Goals

1. Give Timetable Management's own generation engine a real, explicit, per-Grade/Form, per-Subject weekly period count to read — replacing the temporary, per-Teacher-Subject-Assignment `weeklyLessonTarget` (ACR-006) that this feature now supersedes.
2. Guarantee the available weekly teaching period figure this feature works against is always calculated from School Schedule Management's own current configuration — never hardcoded, never manually entered, never allowed to silently drift out of sync with it.
3. Eliminate duplicate configuration — one allocation per Grade/Form, automatically applying to every Class within it, not one per individual Class.
4. Guarantee an allocation can never be saved incomplete or over-allocated relative to its own calculated capacity.
5. Automatically detect, and clearly surface, the moment a School Schedule Management change invalidates an existing allocation — never leaving a stale, silently-wrong allocation in place for the generator to trust.
6. Keep this feature's own responsibility exactly as narrow as the question it answers — no teacher assignment, no lesson creation, no timetable generation, no curriculum document management, no student data, ever performed here.

---

# Actors

## School Admin

The only actor who configures a Weekly Subject Allocation. Selects a Grade/Form and an Academic Year, sees the calculated available weekly teaching periods, distributes them across Subjects (with an optional Double Period flag per Subject), and saves. Reviews and re-saves any allocation marked Needs Review.

## Teacher

No access in this version — this feature configures school-wide capacity planning, not anything a Teacher needs to view or act on directly. (A Teacher already sees the Timetable itself, once generated and published, through Timetable Management's own existing Teacher-facing views.)

## Student, Accountant

No role in this feature.

## Super Admin

Platform-level oversight only, read-only, mirroring every prior feature's own oversight pattern — may view any school's Weekly Subject Allocations; may not configure one on a school's behalf.

---

# User Stories

1. As a School Admin, I want to configure how many weekly teaching periods each Subject gets for Grade 8, once, so every Grade 8 Class (8A, 8B, 8C, 8D) automatically follows the same allocation without me repeating the configuration four times.
2. As a School Admin, I want the system to calculate the available weekly teaching periods for me, from my own school's actual Calendar and Shift configuration, so I never have to work out or manually enter that number myself, and so it's automatically correct for schools with different schedules.
3. As a School Admin, I want the system to refuse to save an allocation that doesn't add up to exactly the available total, so I can't accidentally leave periods unallocated or over-commit past what the week actually has room for.
4. As a School Admin, I want to flag a Subject as requiring Double Periods within this same allocation, so the Timetable generator later knows to schedule it that way, without a separate configuration step.
5. As a School Admin, I want to be clearly warned when a change I made to my School Schedule invalidates an existing Weekly Subject Allocation, so I never generate a Timetable against a stale, no-longer-accurate allocation without realizing it.
6. As a School Admin, I want Timetable generation blocked until I've reviewed and re-saved any allocation flagged Needs Review, so an inconsistency can never silently reach the generator.
7. As a Super Admin, I want to view any school's Weekly Subject Allocations for oversight.

---

# Functional Requirements

1. The system must allow School Admin to create a Weekly Subject Allocation for a given Grade/Form and Academic Year.
2. The system must automatically calculate that Grade/Form's own available weekly teaching periods from School Schedule Management's own current configuration (Working Days × the assigned Shift's own Teaching Period count) — the Administrator never enters this number directly.
3. The system must allow School Admin to distribute the calculated available weekly teaching periods across Subjects already assigned to the school (Subject Management), entering a positive whole number of weekly periods per Subject.
4. The system must reject an attempt to save an allocation whose own total does not exactly equal the calculated available weekly teaching periods.
5. The system must reject an attempt to add the same Subject twice within one allocation.
6. The system must reject a non-whole-number or non-positive weekly period value for any Subject in the allocation.
7. The system must reject a Subject that does not already exist (and is not already assigned to the school) in Subject Management.
8. The system must allow School Admin to flag any Subject within an allocation as requiring Double Periods.
9. The system must apply a Grade/Form's own saved allocation automatically to every Class grouped under that Grade/Form — never requiring, or even permitting, a separate allocation per individual Class.
10. The system must detect, automatically, whenever a School Schedule Management change (Working Days, Shift assignment, or a Shift's own Teaching Period count) changes a Grade/Form's own calculated available weekly teaching periods in a way that no longer matches an existing saved allocation's own total.
11. The system must mark an affected Weekly Subject Allocation as **Needs Review** the moment such a change is detected.
12. The system must prevent Timetable generation school-wide — not only for the affected Grade/Form — whenever at least one Weekly Subject Allocation anywhere in the school is currently marked Needs Review, until every such allocation has been reviewed and saved again.
13. The system must allow Super Admin to view any school's Weekly Subject Allocations, read-only.
14. The system must expose this feature's own data to other modules (Teacher Subject Assignment, Timetable Management) exclusively through its own published, narrow interfaces — never direct table access.
15. The system must enforce strict tenant isolation — a School Admin may never view or modify another school's Weekly Subject Allocations.

---

# Non-Functional Requirements

1. Tenant isolation is mandatory.
2. All business validation (totals matching capacity, no duplicate Subject, positive whole numbers) must be enforced on the backend, never trusted from the client.
3. Creating, updating, and Needs-Review transitions must all be auditable.
4. This feature must never store, cache, or duplicate School Schedule Management's own Working Day/Shift/Period data — the available weekly teaching period figure is recalculated from that feature's own published interface every time it is needed, never persisted as a separate, potentially-stale copy.
5. This feature must never calculate, store, or expose Teacher workload, Teacher availability, or any Timetable-generation-specific optimization data — those remain Timetable Management's own concern, informed by, but not computed within, this feature.
6. This feature must remain small and narrow by design — resisting scope growth into curriculum document management, syllabus tracking, or academic standards, all of which were explicitly considered and rejected for this feature's own scope (see ACR-008).

---

# Permissions

## School Admin

- May create, view, and update Weekly Subject Allocations for their own school.
- May review and re-save an allocation marked Needs Review, for their own school.
- May not view or modify another school's allocations.

## Super Admin

- May view any school's Weekly Subject Allocations, read-only.
- May not create, update, or resolve a Needs-Review allocation on a school's behalf.

## Teacher, Student, Accountant

- No permissions in this feature.

---

# Business Lifecycle

## 1. Prerequisite Configuration

Before a Weekly Subject Allocation can be created for a Grade/Form, that Grade/Form must already exist as a `GradeLevel` (Class Management, **ACR-009**) with at least one member Class, every member Class assigned to the same active Shift (School Schedule Management, enforced by Class Management), and the Subjects to be allocated must already be assigned to the school (Subject Management). This feature creates none of these itself.

## 2. Calculating Available Weekly Teaching Periods

The moment a School Admin selects a Grade/Form and an Academic Year, the system reads that Grade/Form's own single shared Shift through Class Management's own narrow interface (**ACR-009**) and calculates the available weekly teaching periods live: the Working Days currently configured on the School Calendar, multiplied by the count of active Teaching Periods (Break Periods excluded entirely) configured on that Shift. This is never a stored, cached figure — it is recalculated every time it is needed, including every time an existing allocation is re-opened.

## 3. Distributing the Allocation

The School Admin adds Subjects (each already assigned to the school) one at a time, entering a positive whole number of weekly teaching periods for each, optionally flagging a Subject as requiring Double Periods. A running total is shown against the calculated available figure throughout.

## 4. Saving

The system rejects the save unless the running total exactly equals the calculated available weekly teaching periods, no Subject appears more than once, and every entered value is a positive whole number. Once saved, the allocation applies automatically to every Class grouped under that Grade/Form, for that Academic Year.

## 5. Reviewing an Existing Allocation

Re-opening an already-saved allocation re-runs the same live calculation described in Step 2 and compares it against the allocation's own already-saved total. If they still match, nothing changes. If they no longer match — because School Schedule Management's own configuration changed since this allocation was last saved — the allocation is marked Needs Review (Step 6).

## 6. Needs Review

A Needs-Review allocation is clearly flagged to the School Admin. Timetable generation is blocked school-wide — not only for the affected Grade/Form — until the School Admin re-opens every Needs-Review allocation, adjusts each distribution to match its new calculated total, and saves it again — at which point generation is unblocked once no Needs-Review allocation remains anywhere in the school.

## 7. Consumption by Teacher Subject Assignment and Timetable Management

Once a Grade/Form's own allocation is saved and current (never while Needs Review), Teacher Subject Assignment reads it — when a Teacher is assigned a Subject for a Class within that Grade/Form, the weekly period count for that Subject/Grade combination is read from this feature, not entered again. Timetable Management's own generation engine reads the same data directly for its own required-Lesson-unit calculation, replacing its own prior reliance on `TeacherSubjectAssignment.weeklyLessonTarget` (ACR-006).

---

# Business Rules

1. Weekly Subject Allocation answers exactly one question — how the available weekly teaching periods are distributed across Subjects for a Grade/Form — and nothing else. It never assigns Teachers, never creates Lessons, never generates a Timetable, never manages curriculum documents, and never manages Student data.
2. An allocation is created once per Grade/Form (and Academic Year), never per individual Class — it applies automatically to every Class grouped under that Grade/Form. A Grade/Form is the `GradeLevel` entity owned by Class Management (**ACR-009**); every Class references exactly one `GradeLevel` via a required `gradeLevelId`.
3. The available weekly teaching periods figure is always calculated, never entered by the Administrator — derived from the School Calendar's own Working Days and the Grade/Form's own single, shared Shift's own active Teaching Period count, read live from School Schedule Management and Class Management every time it is needed.
4. Every Class within the same Grade/Form must reference the same Shift — enforced by Class Management itself (**ACR-009**), not by this feature. This is what guarantees a Grade/Form's own available weekly teaching periods is always a single, well-defined number.
5. Break Periods are never counted as available teaching capacity.
6. The total of an allocation's own per-Subject weekly period values must equal — never merely be less than or equal to — the calculated available weekly teaching periods before it may be saved.
7. An allocation may never be saved incomplete (a total less than the calculated available figure) or over-allocated (a total exceeding it).
8. A Subject may appear at most once within a single allocation.
9. Every Subject referenced by an allocation must already exist, and already be assigned to the school, in Subject Management.
10. A per-Subject weekly period value must be a positive whole number.
11. A Subject may optionally be flagged as requiring Double Periods within an allocation — a flag this feature stores and publishes, never itself acts upon (Timetable Management's own generation engine is the consumer).
12. Whenever a School Schedule Management change alters a Grade/Form's own calculated available weekly teaching periods such that it no longer equals an existing saved allocation's own total, that allocation is automatically marked Needs Review.
13. Timetable generation is blocked school-wide — for every Grade/Form, not only the affected one — whenever any single Grade/Form's allocation is currently Needs Review, until every Needs-Review allocation is reviewed and saved again. This mirrors Timetable Management's own "Generate Timetable" always targeting the entire school, never a partial scope.
14. This feature never stores a copy of School Schedule Management's own Working Day, Shift, or Period data — only the resulting calculated figure is ever compared against, and that comparison is always performed live.
15. Other modules (Teacher Subject Assignment, Timetable Management) must consume this feature's data exclusively through its own published, narrow interfaces — never by querying this feature's own tables directly, and never by querying Class Management's `GradeLevel` data directly (Class Management's own narrow interface, e.g. a `getGradeLevelShift`-shaped read, is the only path).
16. A school's Weekly Subject Allocations belong to exactly one school. A School Admin may never view or modify another school's allocations.

---

# Edge Cases

| Situation | Expected Behavior |
|---|---|
| School Admin attempts to save an allocation whose total is less than the calculated available weekly teaching periods | Rejected, per Business Rule #7 ("incomplete"). |
| School Admin attempts to save an allocation whose total exceeds the calculated available weekly teaching periods | Rejected, per Business Rule #7. |
| School Admin attempts to add the same Subject twice within one allocation | Rejected, per Business Rule #8. |
| School Admin enters a zero, negative, or fractional weekly period value for a Subject | Rejected, per Business Rule #10. |
| School Admin attempts to allocate a Subject not yet assigned to the school | Rejected, per Business Rule #9. |
| School Admin changes the School Calendar's Working Days after allocations already exist | Every allocation whose own calculated total no longer matches its saved total is marked Needs Review, per Business Rule #12. |
| School Admin changes a Shift's own Teaching Period count (adds/removes a Period) after allocations already exist | The same Needs-Review detection applies to every Grade/Form using that Shift. |
| School Admin attempts to assign a Class to a Grade/Form whose existing member Classes use a different Shift | Rejected by Class Management itself, per Business Rule #4 (**ACR-009**) — not this feature's own validation, but a prerequisite it depends on. |
| School Admin attempts to generate a Timetable anywhere in the school while any one Grade/Form's allocation is Needs Review | Rejected/blocked school-wide, per Business Rule #13, until every Needs-Review allocation is reviewed and re-saved. |
| A School Schedule Management change happens to leave a Grade/Form's own calculated total unchanged (e.g. a Period renamed, not added/removed) | No Needs-Review transition — only a change to the actual count of Working Days or Teaching Periods can invalidate an allocation's own total. |
| Super Admin attempts to create or modify an allocation | Rejected; Super Admin's role here is read-only oversight. |
| A School Admin attempts to view or modify another school's allocations | Rejected; tenant isolation preserved, per Business Rule #16. |

---

# Validation Rules

1. A Grade/Form and an Academic Year are both required to create or view an allocation.
2. The available weekly teaching periods figure is never accepted as client input — always server-calculated.
3. Every Subject referenced must exist, be Active, and already be assigned to the school.
4. No two entries within the same allocation may reference the same Subject.
5. Every per-Subject weekly period value must be a positive whole number.
6. The sum of every per-Subject weekly period value must exactly equal the calculated available weekly teaching periods at the moment of saving.
7. Cross-school references are rejected without exposing another school's configuration data.

---

# Relationships

## School Schedule Management

This feature's own most significant dependency, and its only source of truth for available weekly teaching capacity. Consumed exclusively through that feature's already-published interfaces (`getWorkingDays`, `getActiveShift`/`getSchoolShifts`, `getShiftPeriods`) — this feature never queries `school_calendars`/`shifts`/`periods` directly, and never stores a second copy of any value those interfaces return. School Schedule Management's own Feature Acceptance is not reopened by this dependency.

## Class Management

**Resolved (Business Review) via ACR-009.** A Grade/Form is the new `GradeLevel` entity, owned by Class Management: school-scoped, named, orderable, archivable — the same shape as `Shift`, one level up from `Class` rather than one level down. `Class` gains a required `gradeLevelId`. This feature consumes `GradeLevel` and its member Classes exclusively through Class Management's own narrow interface (e.g. a `getGradeLevelShift`-shaped read, exact name left to Technical Design) — never by querying `grade_levels` or `classes` directly. Class Management also enforces, as its own additive Business Rule, that every Class within one `GradeLevel` shares the same Shift — the guarantee that makes this feature's own "available weekly teaching periods per Grade/Form" a single, well-defined number. ACR-009's own migration backfills every pre-existing Class into a placeholder `"Ungrouped"` `GradeLevel` per school, requiring a real, one-time manual reassignment by each School Admin before Weekly Subject Allocation can be meaningfully configured for their real Grade/Form groups — an accepted, honestly-recorded consequence, not a silently-resolved one.

## Subject Management

Every Subject referenced by an allocation must already exist and already be assigned to the school, consumed through Subject Management's own existing published interface — this feature never queries `subjects`/`school_subjects` directly.

## Teacher Subject Assignment

The most significant **downstream** relationship: once this feature exists, Teacher Subject Assignment no longer needs, asks for, or stores a weekly lesson count of its own (superseding ACR-006's `weeklyLessonTarget`) — when a Teacher Subject Assignment is created for a Class within a Grade/Form, the weekly period count for that Subject is read from this feature's own saved allocation for that Grade/Form, not entered again. This feature does not create, edit, or own any Teacher Subject Assignment itself.

## Timetable Management

The other significant downstream relationship: Timetable Management's own generation engine reads this feature's own per-Grade/Form, per-Subject weekly period counts (and Double Period flags) as a required input, replacing its own prior reliance on `TeacherSubjectAssignment.weeklyLessonTarget`. The engine must never itself ask "how many lessons of this Subject" — that number always already exists here. This feature does not generate, review, adjust, or publish any Timetable itself.

## Academic Year Management

An allocation is scoped to one Academic Year, the same evergreen-vs-yearly distinction already established elsewhere in this project (Shifts/Periods persist across years; Teacher Subject Assignment and, per this document, Weekly Subject Allocation are both scoped per year) — allowing a school to plan a different weekly distribution in a future Academic Year without altering history.

## Audit Logs

Every allocation created, updated, or transitioned to/out of Needs Review is recorded there.

---

# Reports

No dedicated Reports requirement in this version. A future summary (e.g. "which Subjects are under-allocated across every Grade/Form") is tracked under Future Enhancements.

---

# Notifications

No notification requirement is approved in this version.

Possible future notification scenarios requiring Business Review:
- Notify School Admin the moment a School Schedule Management change puts one or more Weekly Subject Allocations into Needs Review, rather than only surfacing it the next time that allocation is opened.

---

# Audit Requirements

The following events must be recorded:
- Weekly Subject Allocation created
- Weekly Subject Allocation updated (distribution changed)
- Weekly Subject Allocation marked Needs Review (automatic, triggered by a School Schedule Management change)
- Weekly Subject Allocation reviewed and re-saved (Needs Review resolved)

Audit records include the acting user (or "system" for the automatic Needs-Review transition), school, timestamp, and relevant previous/new values where applicable.

---

# Out-of-Scope Items

The following are not part of this feature unless explicitly approved later:

- A standalone Curriculum Management feature — explicitly considered and rejected; see ACR-008.
- Teacher assignment of any kind — Teacher Subject Assignment's own, unchanged responsibility.
- Lesson creation or Timetable generation — Timetable Management's own, unchanged responsibility.
- Curriculum documents, syllabi, or academic standards of any kind.
- Student data or enrollment of any kind.
- Per-Class (as opposed to per-Grade/Form) allocation overrides — every Class within a Grade/Form receives the identical allocation in this version; no mechanism exists to vary it for one specific Class/Section within that Grade/Form.
- A formal Term/Semester scoping of an allocation — this version scopes to a full Academic Year only, consistent with Timetable Management's own current Term deferral.
- Automatic proactive notification the moment a School Schedule Management change occurs (see Notifications) — this version surfaces Needs Review the next time the affected allocation is opened, or when Timetable generation is attempted against it.
- Copying an allocation forward from one Academic Year to the next — **resolved (Business Review): deliberately deferred**, not silently omitted. See Architecture Questions — Resolved, #6, and Future Enhancements.

---

# Architecture Questions — Resolved

This draft was **not** produced with every open question already resolved by the Product Owner — the originating request, while detailed, left six genuinely unresolved. All six were resolved during Business Review, below, rather than silently assumed away. This document is now Approved for Technical Design on that basis.

1. **How are Classes grouped into a "Grade" or "Form"?** **Resolved:** a new `GradeLevel` entity, owned by Class Management — school-scoped, named, orderable, archivable, the same shape as `Shift` — with `Class.gradeLevelId` as a required reference. See **ACR-009**. Free-text grouping and name-inference were both considered and rejected (typo-prone, unrenameable, and pattern-fragile respectively); this feature owning the grouping itself was also rejected as an inversion of Feature Ownership (a Grade/Form groups Classes, an upstream concept Class Management already owns).
2. **Must every Class within one Grade/Form share the same Shift?** **Resolved: yes**, enforced by Class Management itself at `createClass`/`updateClass` time (**ACR-009**), not by this feature. This is what guarantees "Grade 8's own available weekly teaching periods" is always a single, well-defined number — see Business Rule #4.
3. **Does the Needs-Review block on Timetable generation apply per-Grade/Form or school-wide?** **Resolved: school-wide.** No generation at all — for any Grade/Form — while any single Grade/Form's allocation is Needs Review, mirroring Timetable Management's own "Generate Timetable" always targeting the entire school and never a partial scope. A per-Grade/Form partial block was considered and rejected as unnecessary complexity inconsistent with that existing precedent. See Business Rule #13 and Business Lifecycle Step 6.
4. **What happens to `TeacherSubjectAssignment.weeklyLessonTarget` (ACR-006) once this feature exists?** **Resolved: formal removal.** Once Weekly Subject Allocation reaches Technical Design and is implemented, `weeklyLessonTarget` is removed via a real migration — Timetable's generation engine will no longer read it, and Teacher Subject Assignment no longer stores or asks for it (see Relationships → Teacher Subject Assignment). No automatic migration of a School Admin's existing `weeklyLessonTarget` values into an initial Weekly Subject Allocation is performed — a school's first allocation for each Grade/Form is deliberately entered fresh, since a per-Assignment target and a per-Grade/Form-per-Subject allocation are not guaranteed to reconcile to the same total per Grade/Form. This is Technical Design's own responsibility to schedule; recorded here as a Business Review decision so it is not silently deferred forever.
5. **What happens to `SubjectSchedulePreference.doublePeriodPreferred`?** **Resolved: full relocation.** Double Period configuration moves entirely to Weekly Subject Allocation (Business Rule #11); the old per-Assignment field stops being read by Timetable Management's own generation engine once this feature is Accepted, and is removed in the same Technical Design pass as `weeklyLessonTarget` (#4 above) rather than left as a redundant, potentially-conflicting override.
6. **Can a Grade/Form's own Academic-Year-scoped allocation be copied forward to a new Academic Year?** **Resolved: deferred.** Not part of this feature's initial scope — recorded as a Future Enhancement, not a silent gap. A School Admin creates each Academic Year's allocation fresh for now.

---

# Acceptance Criteria For Business Discovery

- The feature's purpose and boundaries are clear, and its deliberately narrow scope (allocation only, nothing else) is explicit.
- Actors and expected permissions are identified.
- Functional and non-functional requirements are documented at business level only.
- Known edge cases are listed.
- Dependencies on existing Accepted modules (School Schedule Management, Class Management, Subject Management) are identified without designing their internals.
- The dependency this feature creates for already-Accepted Teacher Subject Assignment and Timetable Management is identified without redesigning either.
- Every genuine open question is recorded as an Architecture Question, not silently resolved.
- No database design, API design, implementation plan, code, or commit has been produced in this phase.

---

# Acceptance Criteria For Business Review

- Every Architecture Question recorded during Business Discovery has a recorded resolution with reasoning, not a silent default — see Architecture Questions — Resolved.
- The single most consequential open dependency (Grade/Form grouping) is resolved via a formal Architecture Change Request (**ACR-009**), not an informal assumption, since it amends an already-Accepted feature (Class Management).
- Business Rules, Business Lifecycle, Edge Cases, and Relationships are all updated to state resolved behavior definitively, with no remaining "or ... — see Architecture Questions" hedges.
- Out-of-Scope Items and Future Enhancements explicitly record every deliberately deferred capability (e.g. copy-between-years) rather than leaving it an unstated gap.
- No database design, API design, implementation plan, code, or commit has been produced in this phase — Business Review is a documentation lifecycle phase only.
- Approved by the Product Owner to proceed to Phase 3 (Technical Design).

---

# Future Enhancements

Potential later enhancements, not approved for this scope:

- Copying an allocation forward between Academic Years (see Architecture Question #6).
- A summary report of under/over-allocated Subjects across every Grade/Form in a school.
- Proactive notification the moment a School Schedule Management change invalidates an allocation, rather than surfacing it on next open/generation attempt.
- Per-Section overrides within a Grade/Form's own allocation, if a real need for one specific Class/Section to diverge ever emerges.

---

# Change History

- v0.1 — Initial Business Discovery draft, produced directly from the Product Owner's own detailed architecture direction. Establishes Weekly Subject Allocation as a narrow, Timetable-nested sub-feature answering exactly one question (how available weekly teaching periods are distributed across Subjects, per Grade/Form, per Academic Year), with available capacity always calculated live from School Schedule Management, never hardcoded or manually entered. Documents this feature's own supersession of ACR-006's `weeklyLessonTarget` and the relocation of Double Period preference from a per-Assignment to a per-Grade/Form concept. Six genuine Architecture Clarifications — most significantly, how Classes are grouped into a Grade/Form at all, since no such concept exists anywhere in this project today — are recorded as open, not resolved, pending Business Review. Not yet approved.
- v1.0 — Business Review complete. All six Architecture Questions resolved and moved to Architecture Questions — Resolved. Most significantly, Grade/Form grouping is resolved via a new `GradeLevel` entity owned by Class Management, added by a formal Architecture Change Request, **ACR-009**, which also establishes that every Class within one Grade/Form must share one Shift. Business Rules, Business Lifecycle (Steps 1, 2, 6), Edge Cases, and Relationships → Class Management are all rewritten to state resolved behavior definitively — no remaining hedges. `TeacherSubjectAssignment.weeklyLessonTarget` and `SubjectSchedulePreference.doublePeriodPreferred` are both confirmed for formal removal once this feature is implemented, with no automatic value migration. The Needs-Review generation block is confirmed school-wide. Copy-between-years is confirmed deferred, recorded explicitly under Out-of-Scope Items. No Business Rule introduces a new capability beyond what v0.1 already scoped — every change in this revision either resolves a previously-open question or restates existing content more definitively. Approved by the Product Owner — Business Review complete, proceeding to Phase 3 (Technical Design).
