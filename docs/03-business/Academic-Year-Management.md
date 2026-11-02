# Academic Year Management

Version: 1.1

Status: Phase 3 Business Review conducted; all Business Decisions Required resolved. Awaiting Product Owner's explicit approval to proceed to Phase 4 Technical Design.

---

# Purpose

Academic Year has never been a real, governed concept in this system — it exists today only as a free-text `String` field on Student Management's `Enrollment` record (e.g., `"2025/2026"`), with no structure, no reuse across records, and no validation beyond "must not be empty." Nothing stops two Enrollment records for the same Student claiming the same year with two differently-typed strings, and nothing lets a School Admin see, at a glance, which years their school has ever operated.

This feature makes Academic Year a first-class entity, owned entirely by each School's own Admin, so that Student Management (via a future amendment) and every future feature that needs to scope its own records to a school year — Attendance, Timetable, Exams, Marks, Fees Management, Report Cards — can depend on one consistent, structured source of truth instead of each reinventing (or mistyping) its own version of "what year is this." This is the same foundational role Subject Management plays for curriculum Subjects: a concept several unbuilt features already implicitly need, defined once, properly, before any of them duplicate it.

---

# Scope

## Included

- School Admin creating a new Academic Year for their own school: a start date and an end date. Its human-readable label is derived automatically from those dates — there is no separately-entered name field.
- School Admin updating an existing Academic Year's editable fields.
- School Admin archiving an Academic Year, and reactivating an Archived one back to Active.
- School Admin designating exactly one of their school's Academic Years as the Current one.
- Enforcing that no two Academic Years within the same school have overlapping date ranges.
- Providing a stable, narrow read interface for other features (Student Management first; Attendance, Timetable, Exam Management, Marks, Fees Management, and Report Cards in the future) to consume Academic Year data, following this project's established Loose Coupling pattern (ACR-001, ACR-002, ACR-003).

## Not Included

- **Changing Student Management's Enrollment or Promotion to actually consume Academic Year records instead of their existing free-text field.** That is a future Architecture Change Request against Student Management, not part of this feature's own scope — this feature only builds the entity and its management, the same way Subject Management built the Subject catalog without itself building Class Management's curriculum attachment.
- **Migrating existing free-text `Enrollment.academicYear` values onto real Academic Year records.** Explicitly decided against during Business Discovery — existing data is left exactly as it is.
- Any platform-wide or Super-Admin-visible academic calendar — explicitly rejected during Business Discovery in favor of school-scoped ownership.
- Term or Semester sub-structure within an Academic Year — not raised during Business Discovery; not assumed here.
- Attendance, Timetable, Exam Management, Marks, Fees Management, and Report Cards themselves — future, not-yet-built features that will each depend on this one.

---

# Actors

- **School Admin** — the only actor who creates, edits, archives, reactivates, and designates the Current Academic Year, within their own school only.
- **Super Admin** — has no operational role here, consistent with School-Management.md's principle that Super Admin never becomes part of a school's own day-to-day operations, and with the explicit Business Discovery decision that Academic Year is school-scoped, School-Admin-owned, with no Super Admin override.

---

# Permissions

## School Admin

- May create a new Academic Year within their own school.
- May update an existing Academic Year's editable fields within their own school.
- May archive an Active Academic Year, and reactivate an Archived one, within their own school.
- May designate any Active (non-Archived) Academic Year within their own school as the Current one.
- May view all Academic Years — Active and Archived — belonging to their own school.
- May not create, edit, archive, reactivate, or designate the Current Academic Year for another school.

## All Other Roles

- This feature defines no permissions for any role other than School Admin. Super Admin, Teacher, Student, and Accountant have no access to Academic Year data through this feature.

---

# Business Workflow

## 1. Academic Year Definition

1. School Admin creates a new Academic Year for their own school, providing a start date and an end date.
2. Its human-readable label is derived automatically from the start and end dates' years, in the format `YYYY/YYYY` (e.g., "2025/2026"), and used throughout the UI, reports, and selection lists — there is no separately-entered name field.
3. A newly created Academic Year's lifecycle status defaults to Active.
4. The Academic Year's date range must not overlap any other Academic Year's date range already recorded for the same school — **including Archived ones; archiving never releases a date range for reuse.**
5. The derived label must not match any other Academic Year's derived label within the same school — checked independently of the date-overlap rule, since two non-overlapping date ranges can still share the same start/end year pair.
6. If this is the school's first-ever Academic Year, it automatically becomes the school's Current Academic Year — the Current designation may never be empty once at least one Academic Year exists (Business Rule #9).

## 2. Academic Year Maintenance

1. School Admin may update an existing Academic Year's start or end date at any time, **regardless of its Active/Archived lifecycle status** — editing is the intended way to correct a mistakenly-entered Academic Year; archiving one and creating a replacement with the same dates is not needed and would conflict with Business Rule #3's including-Archived overlap check.
2. Any change to the start or end date is re-checked against the same no-overlap and no-duplicate-derived-label rules as creation.
3. Updating an Academic Year's dates changes its derived label accordingly.

## 3. Academic Year Lifecycle (Active / Archived)

1. School Admin may archive an Active Academic Year, and reactivate an Archived one back to Active, per this project's Archive Before Delete principle (Decision-Making-Principles.md, Principle 16) — an Academic Year is never hard-deleted.
2. Archiving an Academic Year does not remove or invalidate anything that already references it; it remains visible for historical reference, but is no longer eligible for new use or for being designated Current.
3. Archiving an already-Archived Academic Year, or reactivating an already-Active one, is a no-op, consistent with this project's established idempotency convention for repeatable state-setting actions (e.g., School lifecycle transitions, Subject Management's own Archive/Reactivate).
4. **Archiving the school's Current Academic Year is only permitted if another Active Academic Year is designated Current as part of the same action, or already holds that status.** If no other Active Academic Year exists to receive the Current designation, the archive is rejected — mirroring Class Management's own protection against archiving the currently-final Class (Class-Management.md Business Rule #7).

## 4. Current Academic Year Designation

1. School Admin may designate any Active Academic Year within their own school as the Current one.
2. Designating a new Current Academic Year automatically un-designates whichever Academic Year previously held that status, in the same atomic action — mirroring Class Management's own "exactly one final Class at a time" mechanism (Class-Management.md Business Rule #7).
3. Re-designating an Academic Year that is already Current is a no-op.
4. An Archived Academic Year may not be designated Current.
5. Once a school has created its first Academic Year, exactly one Academic Year must be designated Current at all times — the Current designation may never become empty.

---

# Business Rules

1. Only School Admin may create, update, archive, reactivate, or designate the Current Academic Year for their own school; no other role has any authority over Academic Year data.
2. An Academic Year belongs to exactly one school — school-scoped, not platform-wide, per the Business Discovery's explicit Ownership Scope decision.
3. An Academic Year requires a start date and an end date; its date range must not overlap any other Academic Year's date range within the same school, **including Archived ones — archiving an Academic Year never releases its date range for reuse** (Business Review decision). Correcting a mistakenly-entered, unused Academic Year is done by editing it directly (Business Rule #6), not by archiving it and creating a replacement with the same dates.
4. An Academic Year has no separately-entered name. Its human-readable label is derived automatically from the start and end dates' years, in the format `YYYY/YYYY` (e.g., "2025/2026"), and used throughout the UI, reports, and selection lists. No two Academic Years within the same school may produce the same derived label, checked independently of the date-overlap rule in Business Rule #3, since two non-overlapping date ranges can still share the same start/end year pair.
5. An Academic Year is never hard-deleted, regardless of lifecycle status, per this project's Archive Before Delete principle (Decision-Making-Principles.md, Principle 16). Archiving and reactivation are the only lifecycle transitions, and each is a no-op when redundantly repeated.
6. An Academic Year's start and end dates remain editable regardless of its Active/Archived lifecycle status — editing is the intended path to correct a mistake, per the Business Review's own guidance.
7. Archiving an Academic Year does not remove or invalidate any existing record that references it (once such references exist, per a future Student Management ACR); it remains visible for historical reference, but is not eligible for new use or for being designated Current until reactivated.
8. Exactly one Academic Year per school may be designated Current at any time one exists; designating a new Current Academic Year automatically un-designates the previous one, in the same atomic action. Re-designating an already-Current Academic Year as Current is a no-op. Only an Active Academic Year may be designated Current.
9. A newly created school may have zero Academic Years. Once a school creates its first Academic Year, that Academic Year automatically becomes Current, and exactly one Academic Year must be designated Current at all times thereafter — the Current designation may never become empty. Archiving the Current Academic Year is only permitted if another Active Academic Year is designated Current as part of the same action, or already holds that status; if no other Active Academic Year exists to receive Current, the archive is rejected — mirroring Class Management's own protection against archiving the currently-final Class (Class-Management.md Business Rule #7).
10. A non-Archived Academic Year — whether Current or not — is eligible to be selected for new Enrollment/Promotion records once Student Management is amended to consume this feature (a future ACR); Current is only ever the suggested default, never the sole eligible choice.
11. This feature does not itself change how Student Management, Attendance, Timetable, Exam Management, Marks, Fees Management, or Report Cards record or consume Academic Year data — each is a future integration point, consuming this feature's own narrow interface, per this project's established Loose Coupling pattern. Student Management's Enrollment and Promotion continue using their existing free-text `academicYear` field until their own future ACR is approved and implemented.
12. Existing free-text `academicYear` values already recorded on Student Management's Enrollment records are not migrated or reconciled against this feature's own records, per the Business Discovery's explicit Migration decision; the two coexist independently unless and until Student Management's own future ACR changes what it stores going forward.
13. Every Academic Year lifecycle event (creation, update, archiving, reactivation) and every Current-designation change must be recorded for audit purposes.

---

# Edge Cases

| Situation | Expected Behavior |
|---|---|
| School Admin attempts to create an Academic Year whose date range overlaps an existing *Active* one in the same school | Rejected, per Business Rule #3. |
| School Admin attempts to create an Academic Year whose date range overlaps an *Archived* one's date range | Rejected — the no-overlap check includes Archived Academic Years; archiving never frees a date range for reuse, per Business Rule #3. |
| School Admin creates two non-overlapping Academic Years whose start/end years happen to derive the same `YYYY/YYYY` label | Rejected, per Business Rule #4's duplicate-derived-label check, even though the dates themselves don't overlap. |
| School Admin edits an Archived Academic Year's dates to correct a mistake | Permitted — editing remains available regardless of lifecycle status, per Business Rule #6; re-checked against the same overlap and duplicate-label rules. |
| School Admin creates a school's first-ever Academic Year | It automatically becomes the school's Current Academic Year, per Business Rule #9 — the Current designation is never left empty once at least one Academic Year exists. |
| School Admin designates a new Academic Year as Current while another is already Current | The previous one is automatically un-designated, per Business Rule #8. |
| School Admin re-designates an Academic Year that is already Current | No-op, per Business Rule #8. |
| School Admin attempts to designate an Archived Academic Year as Current | Rejected, per Business Rule #8. |
| School Admin attempts to archive the school's only, currently-Current Academic Year | Rejected — there is no other Active Academic Year to become Current, and the Current designation may never become empty, per Business Rule #9. |
| School Admin designates a different Active Academic Year as Current, then archives the one that was previously Current | Permitted — the Current designation was handed off first, per Business Rule #9. |
| School Admin archives an already-Archived Academic Year, or reactivates an already-Active one | No-op, per Business Rule #5. |
| School Admin attempts to view or manage another school's Academic Years | Denied, per Business Rule #1 and Multi-Tenancy. |
| Super Admin attempts any Academic Year action | Denied, per Business Rule #1. |
| Student Management enrolls or promotes a Student today, before its own future ACR is implemented | Continues to use the existing free-text `academicYear` field, entirely unaffected by this feature, per Business Rule #11. |

---

# Validation Rules

- An Academic Year cannot be created without an owning school, a start date, and an end date.
- An Academic Year's date range must not overlap any other Academic Year's date range within the same school, including Archived ones, per Business Rule #3.
- An Academic Year's derived label (`YYYY/YYYY`, from its start/end years) must not match any other Academic Year's derived label within the same school, per Business Rule #4.
- Only an Active Academic Year may be designated Current, per Business Rule #8.
- The Current designation may never become empty once a school has created its first Academic Year; archiving the Current Academic Year requires another Active Academic Year to take over Current status first or as part of the same action, per Business Rule #9.
- An Academic Year must always have a defined lifecycle status (Active or Archived).
- An Academic Year is never hard-deleted, per Business Rule #5.
- Any action targeting an Academic Year outside the acting School Admin's own school must be rejected, per Multi-Tenancy.

---

# Relationships

- **School & Platform Management** — every Academic Year belongs to a school created and kept active by that feature.
- **Student Management** (future ACR) — Enrollment and Promotion currently use a free-text `academicYear` field; consuming this feature's own Academic Year records instead is a future Architecture Change Request, not part of this feature's own scope. Once approved, Student Management would consume Academic Year data only through this feature's own narrow interface, never a direct table query, per this project's established Loose Coupling pattern (ACR-001, ACR-002, ACR-003). Class Management's own Business Rule #5 ("the academic year a Student is enrolled for is tracked by Student Management's Enrollment record, not by this feature") remains true in ownership terms even after that future ACR — only the underlying mechanism Student Management uses to track it would change.
- **Attendance Management, Timetable, Exam Management, Marks, Fees Management, Report Cards** (all future/backlog) — each is expected to scope its own records to an Academic Year once built, consuming this feature's data the same way.
- **Audit Logs** — every Academic Year lifecycle event and every Current-designation change is recorded there.

---

# Reports

A School Admin-facing list of their own school's Academic Years, filterable by lifecycle status, clearly showing which one (if any) is Current. Exact report contents are a later design decision.

---

# Notifications

This feature defines no end-user notifications. Academic Year lifecycle and Current-designation changes are captured via Audit Requirements only.

---

# Audit Requirements

The following events must be recorded, each including Tenant (school), User, Action, and Timestamp per the standard audit record defined in Multi-Tenancy.md:

- Academic Year created
- Academic Year updated
- Academic Year archived
- Academic Year reactivated
- Current Academic Year designation changed (recorded with the previous Current Academic Year, if any, and the new one)

---

# Acceptance Criteria

- School Admin's exclusive authority over their own school's Academic Years is unambiguous; Super Admin has no operational role here.
- Exactly one Current Academic Year per school is enforced atomically once the school has any — designating a new one always cleanly replaces the previous one, never leaving two, and it can never be left empty.
- Archiving the Current Academic Year is impossible without another Active Academic Year taking over Current status, mirroring Class Management's final-Class protection.
- Archive Before Delete is explicitly applied: no hard delete, existing references remain intact, editing and reactivation are both supported regardless of lifecycle status.
- Non-overlapping date ranges are enforced within a school, including against Archived Academic Years.
- No two Academic Years within a school share the same derived `YYYY/YYYY` label.
- Tenant isolation is preserved in every scenario described.
- All edge cases have a defined expected behavior.
- This document is reviewed and approved by the Product Owner before Technical Design begins.

---

# Business Decisions Required

None remain. All items raised during Business Discovery were resolved at Phase 3 Business Review:

- **Does the no-overlap check consider Archived Academic Years, or only Active ones?** Resolved — all Academic Years, including Archived ones, are considered; archiving never releases a date range for reuse. Correcting a mistakenly-entered Academic Year is done by editing it, not archiving-and-recreating (Business Rules #3, #6).
- **Must a school always have at least one Academic Year, or a Current one designated?** Resolved — a school may have zero Academic Years initially; once it creates its first one, that one automatically becomes Current, and the Current designation may never become empty thereafter. Archiving the Current Academic Year requires another Active one to take over Current first or as part of the same action (Business Rule #9).
- **Is the name/label a separate field, and must it be unique?** Resolved — there is no separate name field. The label is derived automatically from the start/end dates' years in `YYYY/YYYY` format, and no two Academic Years within a school may derive the same label (Business Rule #4).
- **Business Review also identified two gaps not raised during Business Discovery**, both resolved by applying already-established project conventions rather than new judgment calls: Current-designation had no stated idempotency for a redundant re-designation (Business Rule #8), and whether editable fields stay editable regardless of Active/Archived status was unstated (Business Rule #6) — resolved via the Business Review's own explicit guidance that editing, not archive-and-recreate, is the intended correction path.

---

# Future Considerations

These do not affect and must not influence the current business rules above.

- Student Management's own future Architecture Change Request to consume Academic Year instead of its current free-text field, for both Enrollment and Promotion.
- Attendance Management, Timetable, Exam Management, Marks, Fees Management, and Report Cards, once each exists as its own feature — all expected future consumers of the Academic Year records this feature creates.
- Term or Semester sub-structure within an Academic Year, if a future need for finer-grained academic-period modeling arises — not raised during this Business Discovery, not assumed.
- Migrating existing free-text `Enrollment.academicYear` data onto real Academic Year records, if ever revisited — explicitly deferred per this document's own Migration decision (Scope's Not Included).

---

# Change History

- v1.0 — Initial draft, following Business Discovery per Product Owner direction: Academic Year becomes a first-class, school-scoped entity owned entirely by School Admin (no Super Admin role), with required start/end dates, exactly one Current Academic Year per school at a time, non-overlapping date ranges within a school, Archive Before Delete semantics with historical records staying selectable (not just Current), School-Admin-only permissions, and no migration of existing free-text Enrollment data. Three items remain open for Phase 3 Business Review — see Business Decisions Required.
- v1.1 — Phase 3 Business Review conducted. Two gaps found and refined without needing a new Product Owner decision (Current-designation idempotency, Business Rule #8; editable fields stay editable regardless of lifecycle status, Business Rule #6). Three genuine open decisions from v1.0 resolved by the Product Owner: the no-overlap check includes Archived Academic Years and archiving never frees a date range (Business Rule #3); a school's first Academic Year automatically becomes Current, and the Current designation may never become empty thereafter — archiving the Current Academic Year requires a replacement Active one to take over Current first or as part of the same action, mirroring Class Management's final-Class protection (Business Rule #9); there is no separate name field — the label is derived from the start/end dates' years in `YYYY/YYYY` format, and must be unique within the school (Business Rule #4). New Edge Cases and Validation Rules added accordingly. All Business Decisions Required now resolved; awaiting the Product Owner's explicit approval to proceed to Phase 4 Technical Design.
