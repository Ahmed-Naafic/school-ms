# Class Management

Version: 1.5

Status:
- Implemented and Validated — see `docs/08-validation/Class-Management.md`. Pending Feature Acceptance (Development-Lifecycle.md Phase 9).
- **Pending additive change, not yet implemented:** Weekly Subject Allocation's own Business Review (`docs/03-business/Weekly-Subject-Allocation.md`) approved **ACR-009**, which adds a new `GradeLevel` entity to this feature (school-scoped, named, orderable, archivable, the same shape as `Shift`) and a required `Class.gradeLevelId` reference, plus a new Business Rule that every Class within one `GradeLevel` must share the same Shift. No schema or code change has been made yet — this note is a forward reference only, to be formalized with a full Change History entry once Weekly Subject Allocation reaches Technical Design and this ACR is actually implemented.

---

# Purpose

Multiple features need a defined grade level to organize their own work around: Student Management enrolls a Student into a Class and needs to know what "the next Class" is for Promotion and which Class is "final" for Graduation eligibility; Subject Management assigns subjects to a Class's curriculum; Timetable schedules teaching time around a Class and its Sections.

This feature defines the Class and Section structure a school teaches — independent of any single Student, Teacher, or Subject record.

Without this feature, Student Management's Enrollment, Promotion, and Graduation eligibility have no Class to reference. This is why Class Management was re-sequenced ahead of Student Management's own Implementation Planning and Implementation, per `Development-Roadmap.md`.

---

# Scope

## Included

- Creating a Class within a school (e.g., Grade 1, Grade 5, Form 1) as a single, persistent record reused across academic years.
- Organizing a Class into one or more Sections (e.g., Grade 5 — Section A, Section B).
- Defining an ordered sequence of Classes within a school, used to suggest "the next Class" for Student Management's Promotion.
- Designating which Class is the school's final academic level, used by Student Management's Graduation eligibility.
- Archiving a Class or Section no longer offered, and reactivating one archived by mistake or needed again.

## Not Included

- Enrolling a specific Student into a Class — owned by Student Management; this feature only provides the Class that gets referenced.
- Tracking academic years — a Class is a single evergreen record, not recreated per year; the academic year a Student is enrolled for is captured on Student Management's Enrollment record, not on the Class itself.
- Assigning Subjects to a Class's curriculum — owned by Subject Management.
- Assigning a Teacher to a Class or Subject, and scheduling — owned by Timetable.
- Attendance and Exam recording — owned by their own features; they reference the Class/Section a Student is enrolled in via Student Management, not this feature directly.

---

# Actors

- **School Admin** — the only actor who manages Class structure within their own school.
- **Super Admin** — has no operational role here, consistent with School-Management.md: Super Admin must never become part of a school's day-to-day business operations.

Permissions for any other role (Teacher, Student) over Class data are owned by Authentication & Authorization's RBAC model, not by this document.

---

# Permissions

## School Admin

- May create, update, archive, and reactivate a Class within their own school.
- May organize a Class into Sections, and archive or reactivate a Section.
- May designate which Class is the school's final academic level.
- May not manage a Class belonging to another school.

## All Other Roles

- This feature defines no permissions for any role other than School Admin. Any other role's access to Class data is owned by Authentication & Authorization's RBAC model, not by this document.

---

# Business Workflow

## 1. Class Creation

1. School Admin creates a new Class within their own school (e.g., Grade 5), as a single record reused every academic year.
2. A Class exists independently of any Student, Teacher, or Subject being assigned to it.

## 2. Section Organization

1. School Admin may organize a Class into one or more Sections (e.g., Grade 5 — Section A, Section B).
2. A Section always belongs to exactly one Class.

## 3. Class Sequencing

1. School Admin defines an ordered sequence of the school's Classes (e.g., Grade 1, Grade 2, ..., Grade 12).
2. Student Management's Promotion uses this sequence to suggest the next Class automatically; School Admin may still override the destination Class at the point of Promotion.

## 4. Final Class Designation

1. School Admin designates which Class is the school's final academic level — ordinarily the last Class in the sequence, though this document does not require it to be.
2. Student Management uses this designation to determine when a Student transitions into the "Eligible for Graduation" lifecycle state, per Student-Management.md's Business Rules. That transition, once it happens, is a one-way business event — it is not retroactively reversed by a later change to this designation (see Edge Cases).

## 5. Class Archival

1. School Admin archives a Class or Section no longer offered.
2. Archiving a Class prevents new Enrollment into it going forward. Students already enrolled in it remain validly enrolled and unaffected until they are promoted, transferred, withdrawn, or graduated through Student Management's own workflow.
3. Archiving follows Archive Before Delete — the Class or Section, and any historical Enrollment referencing it, are preserved, never deleted.

## 6. Reactivation

1. School Admin reactivates an archived Class or Section — for example, one archived by mistake, or one the school offers again in a later academic year.
2. A reactivated Class rejoins the school's active Class sequence; it does not resume its old sequence position, since that position may no longer make sense against Classes added, reordered, or archived since (Business Rule #11).
3. Reactivating a Class or Section has no effect on the "Eligible for Graduation" state of any Student — that transition, once reached, is never revisited by an unrelated Class Management action, per Business Rule #8.

---

# Business Rules

1. Only School Admin may create, update, archive, or reactivate a Class within their own school.
2. A Class belongs to exactly one school, per Multi-Tenancy.
3. A Class's name must be unique within its own school, not platform-wide.
4. A Section, when used, belongs to exactly one Class.
5. A Class is a single, persistent record reused across academic years; it is never recreated per year. The academic year a Student is enrolled for is tracked by Student Management's Enrollment record, not by this feature.
6. Classes within a school have a defined order. Promotion (Student Management) uses this order to suggest the next Class, but School Admin may override the destination at the point of Promotion.
7. Exactly one Class per school must be designated as the final academic level at any given time. The currently-designated final Class may not be archived — School Admin must designate a different Class as final first — since Student Management's Graduation eligibility depends on there always being an active final Class to promote into.
8. Changing the final-Class designation applies only to future Graduation-eligibility determinations. It does not revoke a Student's "Eligible for Graduation" lifecycle state once that state has already been reached, per Student-Management.md's Business Rules — that transition is a one-way business event, not a live-recomputed flag.
9. Archiving a Class blocks new Enrollment into it but does not affect Students already enrolled in it, and does not delete the Class or any historical Enrollment referencing it, per Archive Before Delete.
10. Every Class lifecycle event (created, updated, archived, reactivated, sequence changed, final-Class designation changed) must be recorded for audit purposes.
11. Reactivating an archived Class appends it to the end of the school's current active Class sequence; it is never restored to its pre-archival position, since that position may have been reused or made meaningless by sequence changes made while it was archived.
12. Archiving and reactivating a Class or Section is reversible at any time and does not itself constitute deletion — no hard or soft delete of a Class or Section is provided by this feature, consistent with Archive Before Delete (Business Rule #9).

---

# Edge Cases

| Situation | Expected Behavior |
|---|---|
| School Admin archives a Class that Students are currently enrolled in | Allowed. New Enrollment into the Class is blocked; Students already enrolled remain unaffected until an ordinary Promotion, Transfer, Withdrawal, or Graduation moves them, per Business Rule #9. |
| School Admin attempts to designate more than one Class as the final academic level | Not possible; only one Class per school may hold this designation at a time, per Business Rule #7. |
| School Admin changes which Class is designated as final after Students already reached "Eligible for Graduation" under the previous designation | Those Students keep their "Eligible for Graduation" state; it is not retroactively revoked. Only future eligibility determinations use the new designation, per Business Rule #8. |
| Two different schools each have a Class named "Grade 5" | No conflict; Class names are unique only within their own school, per Business Rule #3. |
| School Admin overrides the suggested "next Class" during a Student's Promotion | Allowed; the sequence defined here is a default suggestion, not an enforced constraint, per Business Rule #6. |
| School Admin reactivates a Class that was archived while other Classes were reordered or archived in the meantime | The reactivated Class rejoins the sequence at the end, not its old position, per Business Rule #11. |
| School Admin wants to permanently remove a Class or Section (e.g., created by mistake) | Not supported; the Class or Section is archived instead and simply stays unused, per Business Rule #12. |
| School Admin attempts to archive the currently-designated final Class | Rejected; a different Class must be designated final first, per Business Rule #7. |
| School Admin attempts to reorder an archived Class | Rejected; only active Classes participate in the sequence, per Business Rule #6. |

---

# Validation Rules

- A Class cannot be created without an owning school.
- A Class's name must be unique within its own school.
- Exactly one Class per school must be marked as the final academic level.
- A Class must have a defined position in its school's Class sequence.

---

# Relationships

- **Student Management** — Enrollment assigns a Student to a Class this feature defines; Promotion uses this feature's Class sequence to suggest (not enforce) the next Class; the "Eligible for Graduation" lifecycle transition, and its one-way, non-revocable nature once reached, are owned and defined entirely by Student-Management.md, not by this document — this feature only supplies the final-Class designation that triggers it. **(ACR-002)** Enrollment and Promotion may also reference one of this feature's Sections; Student Management consumes Section data only through this feature's own narrow interface (never querying the `sections` table directly), consistent with how it already consumes Class data. This feature's own Business Rules, Section data model, and Archive Before Delete semantics for Section are unchanged by ACR-002 — only a new read-only interface surface was added for Student Management to consume.
- **Subject Management** — assigns Subjects to a Class's curriculum; depends on this feature's Class structure existing first.
- **Timetable** — schedules Teacher and Subject time around the Classes and Sections this feature defines.
- **School & Platform Management** — every Class belongs to a school created and kept active by that feature.
- **School Schedule Management (ACR-005)** — every Class now references exactly one active Shift, via a required `shiftId` validated through that feature's own narrow interface (`validateShift`/`getActiveShift`), never a direct query against its tables. Every pre-existing Class was backfilled to its own school's Default Shift. This feature's own Business Rules, Section data model, and lifecycle (archive/reactivate/reorder/designate-final) are otherwise unchanged — see `docs/01-architecture/Architecture-Decision-Records/ACR-005-Class-Shift-Reference.md`.
- **Audit Logs** — every Class lifecycle event is recorded there.

---

# Reports

A Class/Section roster overview (list of Classes and their Sections within a school) is expected, consistent with other management features. Exact report contents are a later design decision.

---

# Notifications

This feature defines no notifications. Class structure changes are administrative and do not directly notify Students or Teachers; any notification arising from a Student's own Promotion or Enrollment change is defined by Student Management, not here.

---

# Audit Requirements

The following events must be recorded, each including Tenant (school), User, Action, and Timestamp per the standard audit record defined in Multi-Tenancy.md:

- Class created
- Class updated
- Class archived
- Class reactivated
- Class sequence changed
- Section created
- Section updated
- Section archived
- Section reactivated
- Final-Class designation changed

---

# Acceptance Criteria

- Every Class lifecycle state (created, updated, archived) and the final-Class designation are clearly defined.
- Only School Admin has authority over Class structure within their own school; this is unambiguous.
- Tenant isolation is preserved in every scenario described.
- All edge cases have a defined expected behavior.
- This document is reviewed and approved by the Product Owner before Technical Design begins.

---

# Business Decisions Required

None remain. All four questions from initial drafting were resolved by the Product Owner:

- A Class is a single, evergreen record reused across academic years; the academic year is tracked on Student Management's Enrollment record, not on the Class (Business Rule #5).
- Class Management defines an ordered Class sequence that suggests the next Class for Promotion, but School Admin may override the destination at the point of Promotion (Business Rule #6).
- Archiving a Class blocks new Enrollment into it but does not affect Students already enrolled (Business Rule #9).
- Changing the final-Class designation only affects future eligibility determinations; it never retroactively revokes a Student's "Eligible for Graduation" lifecycle state once reached — that transition is a one-way business event, owned by Student-Management.md (Business Rule #8).

Two further questions, raised after Implementation began, were also resolved by the Product Owner:

- Reactivating an archived Class or Section is supported (Business Rules #1, #10, #11).
- No hard or soft delete of a Class or Section is provided — Archive Before Delete is the only removal mechanism, confirmed as intentional, not an oversight (Business Rule #12).

---

# Future Considerations

These do not affect and must not influence the current business rules above.

- Multi-campus or branch-specific Class structures.
- Platform-level curriculum templates reusable across schools.

---

# Change History

- v1.0 — Initial approved specification.
- v1.1 — Added Reactivation (Business Rules #1, #10, #11) and confirmed no hard/soft delete (Business Rule #12), both resolved by the Product Owner after Implementation began.
- v1.2 — Phase 7 (Validation) passed with no defects; see `docs/08-validation/Class-Management.md`. Status updated to Implemented and Validated, pending Phase 9 (Feature Acceptance).
- v1.3 — Independent code review (Phase 9) found that archiving the final Class silently orphaned Graduation eligibility for the whole school, with no error anywhere. Refined Business Rule #7 to block archiving the currently-final Class, and added an Edge Case for attempting to reorder an archived Class (already rejected, now with a clean error instead of a server crash). See `docs/00-governance/Code-Review-Report.md`.
- v1.4 — Product Owner requested a combined "F1A" (Class name + Section name) presentation convention wherever a Class and Section are shown together — a Technical Design/frontend concern (see Technical Design's Change History), not a Business Rule change; this feature's Section data model, uniqueness rules, and Archive Before Delete semantics are unchanged. Extending the request to Student Management's Promotion surfaced ACR-002 (`docs/01-architecture/Architecture-Decision-Records/ACR-002-Enrollment-Section-Reference.md`): Student Management's Enrollment may now reference a Section, consumed through this feature's own narrow interface. Updated Relationships accordingly.
- v1.5 — ACR-005 (`docs/01-architecture/Architecture-Decision-Records/ACR-005-Class-Shift-Reference.md`), approved during School Schedule Management's Implementation Planning: every Class now references exactly one active Shift via a required `shiftId`, backfilled for every pre-existing Class to its own school's Default Shift, validated only through School Schedule Management's own narrow interface. Also gained `countActiveClassesByShift`, a read-only narrow interface function that feature consumes to enforce its own "cannot archive a Shift referenced by an active Class" rule. This feature's own Business Rules, Sections, sequencing, and lifecycle are otherwise unchanged; Feature Acceptance is not reopened by this addition.
