# School Schedule Management

Version: 1.2

Status:
- Business Discovery complete. All 7 Architecture Clarifications raised in the v0.1 draft have been resolved by the Product Owner, plus one additional architectural decision (Shifts belong to the School, not the Academic Year).
- **Phase 2 (Business Review) complete — Approved.** Two genuine gaps and one scope confirmation raised during review, resolved by the Product Owner and incorporated as Business Rules #7, #13, and #14, and a Purpose-section architecture confirmation.
- Approved for Phase 3 (Technical Design).
- Not approved for Implementation.
- **Architecture Update (Periods) complete - Approved.** Period Management is added to School Schedule Management as an extension of the existing feature, not as a standalone feature. Technical Design and Implementation Planning were updated to match (`docs/06-technical-design/School-Schedule-Management.md` v1.3, `docs/07-implementation-planning/School-Schedule-Management.md` v1.3), and Period has since completed Implementation, Validation, and Phase 9 (Feature Acceptance) — see `docs/08-validation/School-Schedule-Management.md` v1.1 and `docs/00-governance/Code-Review-Report.md`. The feature is fully Accepted.

---

# Purpose

School Schedule Management defines **when** a school operates: which days of the week it runs on, what daily Shifts exist within an operating day, and which ordered Periods make up each Shift.

It is the authoritative source for:

- Working Days
- Weekend Days
- Daily Teaching Shifts
- Shift Periods, including Teaching Periods and Breaks

Without this feature, every later time-aware module (Timetable, Attendance, Exam Management, Grade Book, Report Card) would each need to invent its own notion of "which days does this school run on" and "which part of the day is this." This feature exists to make that operating-schedule foundation explicit once, under School Admin control, the same way Academic Year Management made "which year is this" explicit once instead of leaving it as free text for Student Management to guess at.

Future versions of this same feature will also own Public Holidays, School Holidays, Ramadan Schedules, Special Working Days, Emergency Closures, and Half Days — all calendar-shaped concepts that belong to the same ownership boundary as Working Days, Weekend Days, and Shifts. None of those are in scope for this version; see Out-of-Scope Items and Future Enhancements.

**Confirmed (Business Review):** this version's School Calendar intentionally models only the recurring weekly Working Day / Weekend Day pattern — it has no date-specific override concept at all. Public Holidays, School Holidays, Ramadan Schedules, Special Working Days, and Emergency Closures are all inherently date-specific exceptions to that recurring pattern, not weekday-recurring rules themselves. They are deliberately deferred, to be implemented later as date-based override entities layered on top of this recurring weekly Calendar, preserving this version's architecture rather than requiring it to be redesigned when that later work begins.

This feature does not own Timetable, Attendance, Exams, or Teacher Assignments. Those modules consume this feature; they are not built by it. **Confirmed (Architecture Update - Periods):** Periods are owned by School Schedule Management, not Timetable. Timetable is responsible only for assigning lessons to predefined Teaching Periods and must never schedule lessons during Break Periods.

---

# Architecture Position

Per the Product Owner's approved sequencing:

```
Platform Management
    ↓
School Management
    ↓
Academic Year Management
    ↓
School Schedule Management
    ↓
────────────────────────
Subject Management
Teacher Management
Student Management
Class Management
Teacher Subject Assignment
    ↓
────────────────────────
Timetable
Attendance
Exam Management
Grade Book
Report Card
Reports
Notifications
```

**This is a retroactive insertion, the same category of event as Academic Year Management's own addition mid-sequence** (`docs/00-governance/Development-Roadmap.md`, Order #7): Class Management, Subject Management, Teacher Management, Student Management, and Teacher Subject Assignment are all already **Accepted** (Class Management, Subject Management, Student Management, Teacher Management) or **Approved through Implementation Planning** (Teacher Subject Assignment) — none of them currently have any notion of a Shift. Business Rule "every Class references exactly one active Shift" therefore describes a **future, additive change to the already-Accepted Class Management feature** (a new mandatory reference), not a green-field relationship built alongside Class Management from the start. This is the same category of change already used twice in this project — Teacher Management's additive `getTeacherById` for Teacher Subject Assignment, and Academic Year Management's own consumers — and does not reopen Class Management's Feature Acceptance by itself, but it is a real dependency this feature's own Technical Design and Implementation Planning must account for. Resolved by the Product Owner (Business Rule #15, Relationships): the new `shiftId` is required, and existing Classes are backfilled to the school's Default Shift as a one-time step. See Relationships and Architecture Questions — Resolved below.

`docs/00-governance/Development-Roadmap.md` has been updated per Product Owner direction: School Schedule Management is now Order #8 in the Feature Delivery Sequence, inserted directly after Academic Year Management and before Teacher Subject Assignment (which moves to #9). Subject Management, Teacher Management, Student Management, and Class Management retain their existing historical delivery-order numbers (#3–#6) — already-Accepted features are not retroactively resequenced.

---

# Feature Overview

Each school owns exactly one active **School Calendar** configuration at a time: a classification of each of the seven weekdays as either a Working Day or a Weekend Day, never both, never neither.

A sensible regional default — the **Somalia Default** (Working: Saturday, Sunday, Monday, Tuesday, Wednesday; Weekend: Thursday, Friday) — is automatically created the moment a new school is created. This default is data, not a hardcoded application rule: a school may freely customize it afterward (e.g. Monday–Friday, Sunday–Thursday, Saturday–Wednesday, or any other combination consistent with the Working Day Rules below). This is a fixed, built-in default the application initializes every new school with — it is not itself a Super-Admin-configurable "platform default" in this version (see Business Rules #3 and #17, and Out-of-Scope Items).

Alongside that default Calendar, a single default Shift named "Morning" is also automatically created for every new school — Active and marked as the Default Shift. This guarantees the "at least one active Shift" and "every Class references an active Shift" invariants below are satisfied from the moment a school exists, with no manual setup step required first.

Each school may also define additional **Shifts** — named, time-bounded daily teaching periods (e.g. "Morning" 07:30–12:30, "Afternoon" 13:30–18:00). Shift names are entirely configurable; "Morning" and "Afternoon" are illustrative examples, never hardcoded values, except for the one automatically-created default Shift's own name. Every Shift carries a Name, Start Time, End Time, Display Order, a Default Shift flag, and an Active/Archived status. Exactly one Shift per school may be the Default Shift at any time, the Default Shift must always be Active, and a school must always have at least one active Shift.

Every Class (owned by Class Management) will reference exactly one active Shift. Timetable, Attendance, Teacher Schedule, and Student Schedule all consume this Class-to-Shift relationship once it exists.

Changing a school's Calendar or Shift configuration affects only future scheduling — it never rewrites historical operational data already produced under the prior configuration.

## Period Management Extension

Period Management is part of School Schedule Management, not a separate feature and not Timetable ownership. School Schedule Management now owns four components:

- School Calendar
- School Shifts
- School Periods
- Working/Weekend Day Configuration

Each Period belongs to exactly one Shift. Each Shift belongs to exactly one School. Periods cannot exist without a Shift and may not be moved across Shifts.

Each Period contains Name, Type (`TEACHING` or `BREAK`), Start Time, End Time, Display Order, Shift, and Active/Archived status.

In v1, only `TEACHING` and `BREAK` Period Types are supported. Assembly, Lunch, Prayer, Activity, and other local schedule categories are future enhancements.

Within each Shift, active Period Display Order must be unique and contiguous (1..N). Reordering automatically renumbers affected Periods. Archiving removes a Period from the active sequence and renumbers the remaining Periods. Restoring appends the Period to the end of that Shift's active sequence by default.

Period Start Time and End Time remain empty when a default structure is generated. Once configured, Start Time must be before End Time, active Periods must not overlap within the Shift, and every configured Period must fit completely inside the parent Shift's operating hours.

`BREAK` is simply another Period Type. Zero Breaks, one Break, or multiple Breaks are all valid. Breaks follow the same ordering and time validation rules as Teaching Periods. Timetable Management must never schedule lessons during Break Periods.

When a new School is created, the default "Morning" Shift automatically receives this default Period structure: Period 1, Period 2, Period 3, Break, Period 4, Period 5, Period 6. When a School Admin creates an additional Shift, the system provides a simple setup flow: number of Teaching Periods (default 6), Include Break (default Yes), and Break after Period (default 3). The system generates the Period structure automatically; the administrator configures actual times afterward.

---

# Business Goals

1. Establish School Schedule Management as the single, authoritative source of truth for when a school operates (Working Days, Weekend Days, Shifts, and Periods).
2. Provide a sensible, built-in default (the Somalia Default Calendar plus a default "Morning" Shift) that every school can freely customize to its own operating pattern, with no manual setup step required before the school is usable.
3. Prepare a stable foundation for Timetable, Attendance, Exam Management, Grade Book, Report Card, and this feature's own future calendar capabilities (Public Holidays, School Holidays, Ramadan Schedules, Special Working Days, Emergency Closures, Half Days).
4. Protect tenant isolation: a School Admin may configure only their own school's Calendar, Shifts, and Periods.
5. Preserve historical accuracy: configuration changes never retroactively alter operational records already produced under a prior configuration.
6. Avoid placing Timetable, Attendance, Exam, or Teacher Assignment logic inside this feature while still publishing the Calendar, Shift, and Period definitions those modules need.

---

# Actors

## School Admin

The primary actor. Configures their own school's Calendar, Shifts, and Periods only.

## Teacher

Read-only. May view the school's Calendar, Shift, and Period configuration; may not configure anything.

## Super Admin

Platform-level oversight only, not day-to-day per-school configuration, and no configurable-defaults capability in this version:

- May view any school's schedule configuration.
- May not configure a specific school's own Calendar, Shifts, or Periods on that school's behalf.
- May not configure platform-level default templates in this version — every new school is initialized with the same fixed, built-in defaults (Somalia Calendar plus default "Morning" Shift); multi-country/configurable platform defaults are explicitly out of scope, deferred to a future platform feature (see Out-of-Scope Items).

## Student

No access.

## Accountant

No role in this feature.

---

# User Stories

1. As a School Admin, I want a sensible default Calendar already in place when my school is created, so I don't have to configure it from scratch.
2. As a School Admin, I want to configure my school's Working Days and Weekend Days, so scheduling reflects how my school actually operates.
3. As a School Admin, I want to define one or more teaching Shifts with my own names and time ranges, so my school's daily structure is accurately represented.
4. As a School Admin, I want exactly one Shift to be the default, so a sensible choice is available wherever a Shift needs to be selected.
5. As a School Admin, I want to archive a Shift my school no longer uses, and restore it later if needed, without losing any historical record that referenced it.
6. As a Teacher, I want to view my school's Calendar and Shift configuration, so I understand the school's operating schedule.
7. As a Super Admin, I want to view any school's schedule configuration, so I can provide platform-level oversight.
8. As future Timetable, Attendance, Exam Management, Grade Book, and Report Card features, the system needs a reliable, published source of a school's operating days, Shift definitions, and Period definitions.

---

# Functional Requirements

1. The system must allow School Admin to view their own school's Calendar and Shift configuration.
2. The system must automatically create a default School Calendar (the Somalia Default) and a default active "Morning" Shift, marked as the Default Shift, together, when a new school is created.
3. The system must allow School Admin to configure which weekdays are Working Days and which are Weekend Days for their own school, at any time.
4. The system must enforce that every weekday is classified as exactly one of Working Day or Weekend Day — never both, never neither.
5. The system must enforce at least one Working Day and at least one Weekend Day at all times.
6. The system must allow School Admin to create one or more Shifts for their school, each with a Name, Start Time, and End Time; a new Shift is appended to the end of the school's active Display Order sequence.
7. The system must allow School Admin to edit an existing Shift's Name, Start Time, and End Time — never its Display Order or Default flag directly (see #8 and #10 below).
8. The system must allow School Admin to reorder a Shift among their school's active Shifts, via a dedicated action, automatically renumbering every other affected active Shift to preserve a contiguous 1..N Display Order sequence.
9. The system must enforce that a school's active Shifts' Display Order values are unique and contiguous (1..N) at all times — no duplicates, no gaps.
10. The system must allow School Admin to designate a different active Shift as the Default Shift, via a dedicated action.
11. The system must allow School Admin to archive an active Shift, and restore (reactivate) an archived Shift.
12. The system must enforce that exactly one Shift per school is marked as the Default Shift, and that the Default Shift is always Active.
13. The system must enforce that a school always retains at least one active Shift.
14. The system must enforce that active Shift time ranges never overlap within the same school.
15. The system must reject archiving a Shift while one or more active Classes still reference it, or while it is the school's current Default Shift.
16. The system must, when archiving a Shift, remove it from the active Display Order sequence and renumber the remaining active Shifts to close the gap; when restoring a Shift, append it to the end of the active Display Order sequence by default.
17. The system must allow Super Admin to view any school's schedule configuration.
18. The system must expose this feature's data to other modules exclusively through its own published, narrow, read-only interfaces (`getSchoolCalendar`, `getWorkingDays`, `getWeekendDays`, `getSchoolShifts`, `getActiveShift`, `getShiftById`, `validateWorkingDay`, `validateShift`) — never direct table access, per this project's Feature Ownership / Loose Coupling principle.
19. The system must preserve every historical operational record's own reference to a Shift, even after that Shift is later archived.
20. The system must enforce strict tenant isolation — a School Admin may never view or modify another school's Calendar or Shift configuration.
21. The system must ensure every Class references exactly one active Shift via a required `shiftId`, backfilling existing Classes to the school's Default Shift as a one-time step.
22. The system must allow School Admin to manage Periods within each Shift. Periods are part of School Schedule Management, not Timetable.
23. The system must support exactly two Period Types in v1: `TEACHING` and `BREAK`.
24. The system must allow zero, one, or multiple Break Periods within a Shift. Breaks follow the same ordering, status, and time validation rules as Teaching Periods.
25. The system must enforce that each active Period's Display Order is unique and contiguous (1..N) within its own Shift; duplicate values and gaps are prohibited.
26. The system must allow School Admin to reorder Periods within a Shift, automatically renumbering affected active Periods.
27. The system must allow School Admin to archive and restore Periods. Archiving removes a Period from the active sequence and renumbers remaining active Periods; restoring appends it to the end of the active sequence by default.
28. The system must enforce Period time rules within a Shift: Start Time must be before End Time when both are configured; active Periods must not overlap; and configured Period times must fit completely inside the parent Shift's operating hours.
29. The system must automatically create the default Period structure for the default "Morning" Shift when a new School is created: Period 1, Period 2, Period 3, Break, Period 4, Period 5, Period 6. Start Time and End Time remain empty until configured by the School Administrator.
30. The system must provide a simple setup flow when creating an additional Shift: number of Teaching Periods (default 6), Include Break (default Yes), and Break after Period (default 3). The system generates the Period structure automatically; the administrator configures actual times afterward.
31. Timetable, Attendance, Exam Management, Teacher Daily Schedule, Student Daily Schedule, and any other future consumer may read Period definitions through this feature's published interfaces but may not create, modify, archive, restore, reorder, or delete Periods.

---

# Non-Functional Requirements

1. Tenant isolation is mandatory. A School Admin must never configure or view another school's schedule.
2. All business validation must be enforced on the backend.
3. Configuration writes (Calendar changes, Shift create/edit/archive/restore) must be auditable.
4. The feature must preserve historical data and follow Archive Before Delete for Shifts.
5. Shift list views are expected to stay small and bounded per school (a handful of Shifts, not hundreds) — the same reasoning Academic Year Management and Class Management already apply to their own small, bounded lists; pagination is not expected to be required, but filtering by Active/Archived status should be supported, consistent with API standards.
6. The feature must avoid duplicating School or Class data, per this project's One Source of Truth principle.
7. The feature must remain consistent with existing role boundaries: School Admin operates within their own school; Super Admin's role here is oversight (view) only, not routine per-school configuration and not a platform-default-configuration capability in this version.
8. The feature must be designed for future consumption by Timetable, Attendance, Exam Management, Grade Book, Report Card, and any other future module, each independently through this feature's own published interfaces — no consuming module acts as a broker for another, and no consuming module owns Period definitions.

---

# Permissions

## School Admin

- May view their own school's Calendar and Shift configuration.
- May configure their own school's Working Days and Weekend Days.
- May create Shifts within their own school.
- May edit Shifts within their own school (name, times) — never the Default flag or Display Order directly; see Designate Default Shift and Reorder Shifts below.
- May reorder Shifts within their own school, via a dedicated action, renumbering the active Display Order sequence (Business Rule #13).
- May designate an active Shift as the Default Shift, via a dedicated action, within their own school (Business Rule #11).
- May archive an active Shift within their own school, subject to Business Rules #9, #10, and #16.
- May restore an archived Shift within their own school.
- May not configure or view another school's Calendar or Shifts.

## Teacher

- May view their own school's Calendar and Shift configuration — read-only.
- May not create, edit, archive, restore, reorder, or designate a Default Shift.

## Super Admin

- May view any school's schedule configuration.
- May not configure a specific school's own Calendar or Shifts.
- May not configure platform-level default templates in this version (see Out-of-Scope Items).

## Student and Accountant

- No permissions in this feature.

---

# Business Lifecycle

## 1. School Creation & Default Calendar

Two things are automatically created the moment a new school is created, together, as one atomic step — the school never starts unconfigured:

- The Somalia Default Calendar (Working: Saturday–Wednesday; Weekend: Thursday–Friday).
- A default Shift named "Morning," Active and marked as the Default Shift.
- The default Period structure for that default Shift: Period 1, Period 2, Period 3, Break, Period 4, Period 5, Period 6. Period Start Time and End Time remain empty until configured by the School Administrator.

This guarantees the "at least one active Shift," "every Class references an active Shift," and "the default Shift has a usable Period structure" invariants hold from the school's very first moment, with no manual structure setup step required. These are fixed, built-in defaults in this version — not a Super-Admin-configurable platform template (Business Rules #3 and #19). The new Shift's initial name, "Morning," is not reserved or protected — School Admin may rename it afterward exactly like any other Shift (Business Rule #7).

## 2. Calendar Configuration

School Admin may change which weekdays are Working Days and which are Weekend Days for their own school, at any time. Every change is re-validated against the Working Day Rules (each day exactly one classification; at least one Working Day; at least one Weekend Day). The Calendar is a current configuration only, never a historical or versioned entity — a change takes effect only for future scheduling. Historical Timetable, Attendance, and Exam records already produced remain authoritative and are never rewritten or re-derived from the Calendar's current state (Business Rule #6).

## 3. Shift Creation

School Admin defines a new Shift with a Name, Start Time, and End Time. A new Shift is always created as Active, never as the Default (Default status is granted only through the dedicated action in step 6 below), and is appended to the end of the school's active Display Order sequence (Business Rule #13) — its position may be changed afterward only through the dedicated Reorder Shifts action (step 5). A new Shift's time range must not overlap any existing active Shift's time range.

## 4. Shift Correction

School Admin edits an existing Shift's Name, Start Time, or End Time. The overlap check is re-validated on every edit, the same as at creation. Neither the Display Order nor the Default flag is ever edited here — see Reorder Shifts and Designate Default Shift below.

## 5. Reorder Shifts

School Admin moves a Shift to a new position among the school's active Shifts, through its own dedicated action — mirroring Class Management's own `reorderClass`. Every other active Shift needed to preserve a contiguous 1..N Display Order sequence is automatically renumbered in the same action; duplicate or gapped Display Order values are never a reachable state (Business Rule #13).

## 6. Designate Default Shift

School Admin marks a different active Shift as the school's Default Shift, through its own dedicated action — never a side effect of a general Shift edit — the same established pattern this project already uses for an "exactly one true" invariant (Class Management's `designateFinalClass`, Academic Year Management's `designateCurrentAcademicYear`). The previously Default Shift stops being the Default in the same action; exactly one Shift holds the flag at all times. Only an active Shift may ever be designated as Default (Business Rule #10).

## 7. Shift Archival

School Admin archives an active Shift. This is rejected if:

- Any active Class still references that Shift (the Class must be moved to a different active Shift first); or
- It would leave the school with zero active Shifts; or
- It is the school's current Default Shift — a different active Shift must first be designated as the new Default (step 6), the same atomic hand-off Academic Year Management already requires before archiving its own Current Academic Year.

Archiving a Shift removes it from the active Display Order sequence and renumbers the remaining active Shifts to close the resulting gap (Business Rule #14). Archiving never affects historical records that reference the Shift — those continue to exist and continue to display correctly.

## 8. Shift Restoration

School Admin restores an archived Shift, making it available again for new Class assignment. It is appended to the end of the active Display Order sequence by default; School Admin may reorder it afterward through step 5 like any other active Shift. A restored Shift is never automatically made the Default — Default status is only ever granted through step 6.

## 8a. Period Structure Management

School Admin manages the ordered Period structure inside each Shift. A Period may be a Teaching Period or a Break. Break is not a separate entity and has no special lifecycle; it is a Period Type that follows the same ordering, time, archive, and restore rules as Teaching Periods.

Each Shift has its own independent Period sequence. Reordering happens only within one Shift. Archiving a Period removes it from that Shift's active sequence and renumbers the remaining active Periods; restoring a Period appends it to the end of that Shift's active sequence by default.

Period Start Time and End Time may remain empty immediately after automatic structure generation. Once configured, they must be valid, non-overlapping, and fully contained inside the parent Shift's Start Time and End Time.

When School Admin creates an additional Shift, a simple setup flow collects the number of Teaching Periods (default 6), whether to include a Break (default Yes), and the Break's position (default after Period 3). The system generates the Period records automatically; School Admin configures the actual times afterward.

## 9. Class-to-Shift Reference

Every Class (owned by Class Management) references exactly one active Shift, via a required `shiftId`. This feature does not create, edit, or assign Classes itself — Class Management continues to own that action, consuming this feature's own published interface (`validateShift` / `getActiveShift`) to confirm the chosen Shift is valid, the same way Student Management consumes Class Management's and Academic Year Management's interfaces today rather than querying their tables directly. Shifts belong to the school, not to any specific Academic Year — they persist and are reused across Academic Years, the same evergreen treatment Class Management already gives the Class entity itself.

Existing Classes, created before this feature existed, are assigned to the school's Default Shift automatically as part of this feature's own delivery — a one-time backfill, not an ongoing behavior.

## 10. Downstream Consumption

Timetable, Attendance, Exam Management, Grade Book, Report Card, Teacher Schedule, and Student Schedule each independently consume this feature's published interfaces. Historical records any of them have already produced continue referencing whatever Calendar/Shift/Period state applied at the time they were created, even after this feature's own later configuration changes or Shift/Period archival.

---

# Business Rules

1. School Schedule Management is the single source of truth for a school's operating schedule (Working Days, Weekend Days, Shifts, and Periods). Ownership of Public Holidays, School Holidays, Ramadan Schedules, Special Working Days, Emergency Closures, and Half Days is reserved for future versions of this same feature, not any other module.
2. Every school owns exactly one active School Calendar configuration at a time.
3. A school's default School Calendar (the Somalia Default: Saturday–Wednesday Working, Thursday–Friday Weekend) is automatically created when the school itself is created, together with a default active Shift named "Morning," marked as the Default Shift. Both are fixed, built-in defaults the application initializes every new school with — never a Super-Admin-configurable platform template in this version (see Business Rule #19). School Admin may customize the Calendar afterward to any combination consistent with Business Rules #4–#5 (e.g. Monday–Friday, Sunday–Thursday, Saturday–Wednesday), and may create additional Shifts or change which Shift is Default per Business Rules #9–#11.
4. Each of the seven weekdays is classified as exactly one of Working Day or Weekend Day — never both, never neither.
5. A School Calendar must always have at least one Working Day and at least one Weekend Day.
6. The School Calendar is a current configuration only, never a historical or versioned entity. Changing it affects only future scheduling; historical Timetable, Attendance, and Exam records already produced remain authoritative and are never rewritten or re-derived from the Calendar's current state.
7. A school may define one or more Shifts. Each Shift has a Name, Start Time, End Time, Display Order, a Default Shift flag, and an Active/Archived status. Shift Names are configurable — never hardcoded values such as "Morning" or "Afternoon." **(Business Review)** "Morning" is only the automatically-created default Shift's *initial* name, assigned once at school creation; it is not a reserved or protected value, and School Admin may rename that Shift afterward exactly like any other Shift.
8. Exactly one Shift per school may be marked as the Default Shift at any time.
9. A school must always have at least one active Shift.
10. The Default Shift must always be an active Shift; an Archived Shift can never be the Default. Archiving the current Default Shift is rejected unless a different active Shift is first designated as the new Default — the same atomic hand-off Academic Year Management already requires before archiving its own Current Academic Year.
11. Designating a Shift as the Default Shift is a dedicated lifecycle action, distinct from a general Shift edit, ensuring exactly one Default Shift exists at all times — the same established pattern this project already uses for Class Management's `designateFinalClass` and Academic Year Management's `designateCurrentAcademicYear`.
12. Active Shift time ranges may never overlap with one another, within the same school.
13. **(Business Review)** A Shift's Display Order must be unique and contiguous (1..N) among a school's active Shifts — duplicate values and gaps are both prohibited, the same invariant Class Management already enforces for its own `sequenceOrder`. Reordering a Shift automatically renumbers every other active Shift needed to preserve this contiguous sequence.
14. **(Business Review)** Archiving a Shift removes it from the active Display Order sequence and renumbers the remaining active Shifts to close the resulting gap. Restoring an archived Shift appends it to the end of the active Display Order sequence by default; School Admin may reorder it afterward like any other active Shift.
15. Every Class references exactly one active Shift via a required `shiftId` — this is a required, not optional, reference. Class Management continues to own the Class entity itself; this feature does not create, edit, or assign Classes. Existing Classes, created before this feature existed, are assigned to the school's Default Shift automatically as part of this feature's own delivery (a one-time backfill).
16. A Shift cannot be archived while one or more active Classes reference it — School Admin must first move those Classes to a different active Shift.
17. Archiving a Shift never rewrites historical data — historical records (e.g. Timetable entries) that reference an archived Shift continue to reference it correctly.
18. A school's Calendar and Shift configuration belongs to exactly one school. A School Admin may never view or modify another school's configuration.
19. Every new school is initialized with the same fixed, built-in defaults (Business Rule #3) — there is no Super-Admin-configurable platform-default template in this version. Configurable, multi-country platform-level defaults are explicitly out of scope, deferred to a future platform feature (see Out-of-Scope Items).
20. Shifts belong to the school, not to any specific Academic Year. They persist across Academic Years and are reused by future Timetable and Class assignments — the same evergreen treatment Class Management already gives the Class entity itself (Class-Management.md Business Rule #5).
21. Other modules (Timetable, Attendance, Exam Management, Grade Book, Report Card, Teacher Subject Assignment, and any future module) must consume this feature's data exclusively through its own published interfaces (`getSchoolCalendar`, `getWorkingDays`, `getWeekendDays`, `getSchoolShifts`, `getActiveShift`, `getShiftById`, `getShiftPeriods`, `getPeriodById`, `validateWorkingDay`, `validateShift`, `validatePeriod`) — never by querying this feature's own tables directly.
22. This feature does not implement Timetable, Attendance, Exams, or Teacher Assignments — those are separate, consuming features.
23. Periods belong to Shifts, and Shifts belong to Schools. A Period cannot exist without a Shift, and a Period may never be moved across Shifts.
24. A Period contains Name, Type (`TEACHING` or `BREAK`), Start Time, End Time, Display Order, Shift, and Active/Archived status. In v1, no other Period Types are supported.
25. Period Start Time and End Time are optional until configured. When configured, Start Time must be before End Time, must not overlap any other active Period in the same Shift, and must fit completely inside the parent Shift's operating hours.
26. A Period's Display Order must be unique and contiguous (1..N) among active Periods within the same Shift. Reordering automatically renumbers affected Periods.
27. Archiving a Period removes it from the Shift's active sequence and renumbers remaining active Periods. Restoring appends it to the end of that Shift's active sequence by default.
28. Breaks are Periods with Type `BREAK`. Zero Breaks, one Break, or multiple Breaks are all valid.
29. Timetable may assign lessons only to active Teaching Periods and must never schedule lessons during Break Periods.
30. Timetable, Attendance, Exam Management, Teacher Daily Schedule, and Student Daily Schedule consume Period definitions but may not create or modify them.

---

# Edge Cases

| Situation | Expected Behavior |
|---|---|
| A new school is created | The Somalia Default Calendar, a default active "Morning" Shift (marked Default), and the default Period structure are created automatically, together, per Business Rules #3 and #29. |
| School Admin attempts to mark a weekday as both Working Day and Weekend Day | Rejected; every weekday resolves to exactly one classification, per Business Rule #4. |
| School Admin attempts to make all seven weekdays Working Days (no Weekend Day) | Rejected, per Business Rule #5. |
| School Admin attempts to make all seven weekdays Weekend Days (no Working Day) | Rejected, per Business Rule #5. |
| School Admin creates or edits a Shift whose time range overlaps an existing active Shift | Rejected, per Business Rule #12. |
| School Admin designates a different active Shift as Default | Allowed, via the dedicated Designate Default Shift action; the newly designated Shift becomes Default and the previously Default Shift is no longer Default — exactly one Default Shift is preserved, per Business Rules #8 and #11. |
| School Admin attempts to designate an Archived Shift as Default | Rejected; only an active Shift may ever be the Default, per Business Rule #10. |
| School Admin attempts to archive the school's current Default Shift | Rejected unless a different active Shift is first designated as the new Default, per Business Rule #10. |
| School Admin attempts to archive the school's only remaining active Shift | Rejected, per Business Rule #9. |
| School Admin attempts to archive a Shift referenced by one or more active Classes | Rejected; the Admin must reassign those Classes to a different active Shift first, per Business Rule #16. |
| A Shift is archived while historical records (e.g. past Timetable entries) reference it | Archiving proceeds; historical records remain visible and correctly reference the archived Shift, per Business Rule #17. |
| A School Admin reorders a Shift among the school's active Shifts | Allowed; every other affected active Shift is automatically renumbered to preserve a contiguous 1..N Display Order, per Business Rule #13. |
| A Shift is archived | It is removed from the active Display Order sequence, and the remaining active Shifts are renumbered to close the resulting gap, per Business Rule #14. |
| An archived Shift is restored | It is appended to the end of the active Display Order sequence by default; School Admin may reorder it afterward, per Business Rule #14. |
| A newly generated Period structure has no times yet | Allowed; Period Start Time and End Time remain empty until configured by the School Administrator, per Business Rule #25. |
| School Admin configures a Period outside its parent Shift's Start/End Time | Rejected, per Business Rule #25. |
| School Admin configures overlapping active Periods within the same Shift | Rejected, per Business Rule #25. |
| School Admin creates multiple Breaks in one Shift | Allowed; Breaks are ordinary Periods with Type `BREAK`, per Business Rule #28. |
| School Admin reorders a Period | Allowed within the same Shift; affected Periods are renumbered to preserve a contiguous 1..N active sequence, per Business Rule #26. |
| A Period is archived | It is removed from the active Period sequence and remaining active Periods in that Shift are renumbered, per Business Rule #27. |
| An archived Period is restored | It is appended to the end of the Shift's active Period sequence by default, per Business Rule #27. |
| Timetable attempts to schedule a lesson during a Break Period | Rejected by Timetable using this feature's Period definitions; School Schedule Management publishes the Break Period but does not create Timetable lessons, per Business Rule #29. |
| A School Admin changes the Calendar or Shift configuration after Timetable/Attendance/Exam records already exist | The change applies only going forward; already-produced records remain authoritative and are never rewritten, per Business Rule #6. |
| Teacher attempts to create, edit, archive, restore, reorder, or designate a Default Shift, or change the Calendar | Rejected; Teacher access is read-only. |
| Student attempts to view or modify schedule configuration | Rejected; Students have no access to this feature. |
| A School Admin attempts to view or modify another school's Calendar or Shifts | Rejected; tenant isolation is preserved, per Business Rule #18. |
| Super Admin attempts to configure a specific school's Calendar or Shifts directly | Rejected; Super Admin's role here is oversight (view) only in this version — there is no platform-level default-configuration capability to fall back to, per Business Rule #19. |

---

# Validation Rules

1. Each of the seven weekdays must be classified as exactly one of Working Day or Weekend Day.
2. At least one weekday must be Working Day; at least one must be Weekend Day.
3. Shift Name, Start Time, and End Time are required for every Shift; Start Time must be earlier than End Time (the same structural date/time-range validity check Academic Year Management already applies to its own start/end dates).
4. No two active Shifts belonging to the same school may have overlapping time ranges.
5. Exactly one Shift per school may have its Default flag set to true at any given time.
6. A Shift may be marked Default only while Active; an Archived Shift can never be Default.
7. Archiving the current Default Shift is rejected unless a different active Shift is designated as the new Default first.
8. A school must retain at least one active Shift at all times — an archive action that would leave zero active Shifts is rejected.
9. A Shift referenced by one or more active Classes cannot be archived.
10. A school's active Shifts' Display Order values must be unique and contiguous (1..N) at all times — no duplicates, no gaps.
11. Cross-school references must be rejected without exposing another school's configuration data.
12. Period Type must be one of `TEACHING` or `BREAK`.
13. Period Start Time and End Time may be empty until configured. If either is provided for an active Period, both must be provided.
14. Configured Period Start Time must be earlier than configured Period End Time.
15. Configured Period times must fit completely inside the parent Shift's Start Time and End Time.
16. No two active Periods in the same Shift may overlap.
17. Active Period Display Order values must be unique and contiguous (1..N) within the same Shift.
18. Period writes must be scoped through the parent Shift and School; cross-school or cross-shift references are rejected.

---

# Relationships

## School & Platform Management

Every Calendar, Shift, and Period configuration belongs to exactly one school created and managed by School & Platform Management. This feature does not create, edit, or manage Schools itself.

## Academic Year Management

Sequenced immediately after Academic Year Management in the approved architecture position. **Resolved (Business Review):** Shifts belong to the school, not to any specific Academic Year (Business Rule #20) — both the Calendar and Shifts are ongoing, evergreen per-school configuration (exactly one active Calendar; Shifts persist and are reused, archived rather than recreated), the same evergreen treatment Class Management already gives the Class entity itself (reused across Academic Years, never recreated per year, per Class-Management.md Business Rule #5). This feature does not read or write Academic Year Management's own data.

## Class Management

**This is the feature's own most significant dependency, and it runs in the opposite direction from every prior feature added to this project's sequence:** rather than this feature consuming an already-built Class Management interface, Class Management (already Accepted) will need to consume *this* feature's `getActiveShift` / `validateShift` interface, and will need a new **required** `shiftId` reference on the Class entity itself (Business Rule #15). This is the same category of post-Acceptance additive change already used for Teacher Management (`getTeacherById`, added for Teacher Subject Assignment) — it does not reopen Class Management's own Feature Acceptance by itself.

**Resolved (Business Review):** existing Classes, created before this feature existed, are assigned to the school's Default Shift automatically as part of this feature's own delivery — a one-time backfill performed once, not an ongoing behavior. The precise migration mechanism (e.g. a data migration step run alongside the schema change) is a Technical Design / Implementation Planning decision; the business intent (auto-assign to the school's own Default Shift, no manual per-Class action required) is settled here.

## Timetable

Future Timetable work is expected to consume this feature's published interfaces to determine which days a school operates on, which Shift a given Class belongs to, and which active Teaching Periods are available inside that Shift. Timetable owns lesson assignment to those predefined Teaching Periods, room/time conflict checks for lessons, and timetable publication. Timetable does not own Period definitions and may not create, modify, archive, restore, reorder, or delete Periods. Timetable must never schedule lessons during Break Periods.

## Attendance Management

Future Attendance work may use this feature's Working Day/Shift/Period data, independently through its own narrow interface, to determine which days and Periods attendance is expected to be recorded on. This feature does not record or validate Attendance itself.

## Exam Management, Grade Book, and Report Card

Future Exam Management, Grade Book, and Report Card features may use this feature's Calendar, Shift, and Period data, independently through its own narrow interface. This feature does not define exam scheduling, grading, or report-card workflows.

## Teacher Schedule and Student Schedule

Referenced as future consumers of the Class-to-Shift relationship and the Shift-to-Period definitions. Whether these are their own distinct future modules or views within Timetable/Attendance remains a future-feature decision; either way, they consume Period definitions from School Schedule Management and do not own or modify them.

## Audit Logs

Every Calendar, Shift, and Period configuration change should be recorded for audit purposes. Audit review/search remains owned by the future Audit Logs feature.

---

# Reports

No Reports requirement is included in this version. Any future summary of a school's schedule configuration (e.g. a printable weekly schedule) is tracked under Future Enhancements, to be addressed by the future Reports feature or a later enhancement to this one.

---

# Notifications

No notification requirement is approved in this discovery draft.

Possible future notification scenarios requiring Business Review:

- Notify School Admin when a Shift they attempted to archive is still referenced by active Classes (today this simply fails the request; a proactive notice is a possible future refinement).
- Notify Teachers when the school's Working Days/Weekend Days configuration changes.

---

# Audit Requirements

The following events must be recorded:

- School Calendar created (automatic, at school creation)
- School Calendar updated (Working Day / Weekend Day configuration changed)
- Default Shift created (automatic, at school creation)
- Shift created
- Shift updated
- Shift designated as Default (previous and new Default Shift id)
- Shift archived
- Shift restored (reactivated)
- Default Period structure created (automatic, at school creation)
- Period structure generated for a new Shift
- Period updated
- Period reordered
- Period archived
- Period restored (reactivated)

Audit records include the acting user, school, timestamp, and relevant previous/new values where applicable.

---

# Out-of-Scope Items

The following are not part of this feature unless explicitly approved later:

- Public Holidays.
- School Holidays.
- Ramadan Schedules.
- Special Working Days.
- Emergency Closures.
- Half Days.
- Timetable lesson assignment, rooms, or lesson conflict rules. Period definitions themselves are in scope for School Schedule Management.
- Attendance recording or validation.
- Exam creation, scheduling, or grading.
- Teacher-to-Class/Subject assignment (owned by Teacher Subject Assignment).
- Creating, editing, archiving, or reactivating Schools, Classes, Teachers, Students, or Subjects.
- Configurable, multi-country platform-level default templates for new-school initialization — this version uses a single fixed, built-in default (Somalia Calendar plus default "Morning" Shift); deferred entirely to a future platform feature, per Business Rule #19.
- Period Types beyond `TEACHING` and `BREAK` (Assembly, Lunch, Prayer, Activity, etc.).

---

# Architecture Questions — Resolved

All 7 Architecture Clarifications raised in the v0.1 draft have been resolved by the Product Owner, plus one additional architectural decision volunteered in the same round. They are recorded here for traceability; the resolved decisions themselves are incorporated throughout this document (Business Rules #3, #6, #10, #11, #15, #19, #20 — renumbered by v1.1's Business Review insertions, see Change History; Business Lifecycle steps #1, #6, #7, #9; Actors/Permissions; Relationships; Edge Cases; Validation Rules; Out-of-Scope Items; and `docs/00-governance/Development-Roadmap.md`).

1. **Default Shift bootstrap** — resolved: a default active Shift named "Morning," marked as the Default Shift, is automatically created at school-creation time, alongside the default Somalia Calendar (Business Rule #3, Business Lifecycle #1). The exact Start/End Time values for this auto-created Shift are a Technical Design / configuration detail, not fixed by this decision.
2. **Must the Default Shift always be Active?** — resolved: yes. An Archived Shift can never be the Default; archiving the current Default Shift requires first designating a different active Shift as the new Default (Business Rule #10, Business Lifecycle #7).
3. **Scope of Super Admin's "platform-level defaults"** — resolved: removed from this feature's scope entirely. The application initializes every new school with the same fixed, built-in defaults; there is no Super-Admin-configurable template in this version. Multi-country defaults are deferred to a future platform feature (Business Rule #19, Out-of-Scope Items).
4. **Historical Calendar accuracy mechanism** — resolved: the School Calendar is a current configuration only, never a historical or versioned entity. Changes affect only future scheduling; historical Timetable, Attendance, and Exam records already produced remain authoritative regardless of later Calendar changes (Business Rule #6).
5. **Dedicated "Designate Default Shift" action, or bundled into general Edit Shift?** — resolved: a dedicated action, mirroring Class Management's `designateFinalClass` and Academic Year Management's `designateCurrentAcademicYear` (Business Rule #11, Business Lifecycle #6).
6. **Class Management's additive dependency** — resolved: Class Management gains a **required** `shiftId` (Business Rule #15). Existing Classes are backfilled to the school's Default Shift automatically, as a one-time step during this feature's own delivery — not an ongoing behavior, and not something School Admin performs manually per Class.
7. **Development-Roadmap.md sequencing** — resolved: `docs/00-governance/Development-Roadmap.md` has been updated. School Schedule Management is now Order #8, inserted between Academic Year Management (#7) and Teacher Subject Assignment (now #9); Subject Management, Teacher Management, Student Management, and Class Management retain their existing historical delivery-order numbers.
8. **Additional decision (volunteered, not one of the original 7): Shifts belong to the School, not the Academic Year.** They persist across Academic Years and are reused by future Timetable and Class assignments — the same evergreen treatment Class Management already gives the Class entity itself (Business Rule #20).

---

# Acceptance Criteria For Business Discovery

- The feature purpose and boundaries are clear.
- Actors and expected permissions are identified.
- Functional and non-functional requirements are documented at business level only.
- Known edge cases are listed.
- Dependencies on existing accepted modules (School & Platform Management, Class Management) are identified without designing their internals.
- Dependencies on future Timetable, Attendance, Exam Management, Grade Book, and Report Card modules are identified without implementing them.
- All 7 Architecture Clarifications raised during this draft have been resolved by the Product Owner; none remain open.
- No database design, API design, implementation plan, code, or commit has been produced in this phase.

---

# Future Enhancements

Potential later enhancements, not approved for this scope:

- Public Holidays, School Holidays, Ramadan Schedules, Special Working Days, and Emergency Closures — to be implemented as date-based override entities layered on top of this version's recurring weekly Calendar, per the Business Review confirmation in Purpose above. Not a redesign of this version's architecture.
- Half Days.
- Printable/summary schedule reports.
- Notifications for schedule changes (see Notifications section above).
- Configurable, multi-country platform-level default templates for new-school initialization — this version uses a single fixed built-in default; addressed by a future platform feature, not this one (resolved, Architecture Question #3).
- Additional Period Types beyond `TEACHING` and `BREAK`, such as Assembly, Lunch, Prayer, Activity, or other local schedule categories.

---

# Change History

- v0.1 — Initial Business Discovery draft, produced directly from the Product Owner's fully pre-specified architectural decisions (mission, architecture position, actors, School Calendar and Shift rules, archive rules, multi-tenancy model, and published interfaces). No sequential Architecture Question round was conducted, per explicit Product Owner instruction; seven genuine remaining gaps are grouped under Remaining Architecture Clarifications for resolution during Phase 2 (Business Review). Not yet approved.
- v1.0 — All 7 Architecture Clarifications resolved by the Product Owner in a single round, plus one additional architectural decision volunteered in the same round (Shifts belong to the School, not the Academic Year): a default active "Morning" Shift is now auto-created alongside the default Somalia Calendar at school creation; the School Calendar is confirmed as a current, non-versioned configuration (historical Timetable/Attendance/Exam records remain authoritative regardless of later changes); the Default Shift must always be Active, with archiving the current Default Shift requiring a hand-off to a different active Shift first; Super-Admin-configurable platform defaults are removed from this feature's scope entirely (fixed built-in defaults only; multi-country templates deferred to a future platform feature); Default Shift designation is now a dedicated lifecycle action, mirroring `designateFinalClass`/`designateCurrentAcademicYear`; Class Management gains a required (not optional) `shiftId`, with existing Classes backfilled to the school's Default Shift as a one-time step; and `docs/00-governance/Development-Roadmap.md` has been updated, inserting this feature at Order #8 between Academic Year Management and Teacher Subject Assignment. All resolutions incorporated as new/amended Business Rules, not left as open questions (exact numbering superseded by v1.1's insertions below — see that entry). Ready for Phase 2 (Business Review).
- v1.1 — Phase 2 (Business Review) conducted; two genuine gaps and one scope-confirmation item found, all resolved by the Product Owner: (1) Shift Display Order had no defined sequencing behavior — resolved: Display Order must be unique and contiguous (1..N) among a school's active Shifts, reordering renumbers affected Shifts, archiving removes a Shift from the sequence and renumbers the remainder to close the gap, and restoring appends to the end by default (new Business Rules #13–#14; new dedicated "Reorder Shifts" lifecycle action, mirroring Class Management's own `reorderClass`). This insertion renumbers every Business Rule from the old #13 onward by +2 (old #13–20 are now #15–22) — cross-references throughout this document have been updated accordingly. (2) Business Rule #7's wording ambiguously implied the auto-created Shift's name could never be changed, contradicting the Functional Requirement that allows editing any Shift's Name — resolved: "Morning" is only that Shift's initial name, assigned once at creation, never reserved or protected, freely renamable afterward like any other Shift. (3) Confirmed, not a rule change: this version's Calendar intentionally models only the recurring weekly pattern; Public Holidays, School Holidays, Ramadan Schedules, Special Working Days, and Emergency Closures are explicitly deferred, to be layered on as future date-based override entities without requiring this version's architecture to be redesigned — recorded in Purpose and Future Enhancements. **Approved by the Product Owner — Business Review complete, proceeding to Phase 3 (Technical Design).**
- v1.2 — Architecture Update (Periods): Period Management is added to School Schedule Management as an extension of the existing feature, not as a standalone feature and not as Timetable ownership. School Schedule Management now owns School Calendar, School Shifts, School Periods, and Working/Weekend Day Configuration. Periods belong to Shifts, support `TEACHING` and `BREAK` types in v1, use unique contiguous Display Order within each Shift, may be archived/restored with automatic renumbering, and may have empty times until configured. New schools create the default Period structure under the default "Morning" Shift; new additional Shifts generate a Period structure from a simple setup flow. Timetable, Attendance, Exam Management, Teacher Daily Schedule, and Student Daily Schedule consume Period definitions but may not modify them; Timetable assigns lessons only to predefined Teaching Periods and never during Break Periods.
