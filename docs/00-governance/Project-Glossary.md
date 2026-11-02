# Project Glossary

Version: 1.11

---

# Purpose

This document defines the official business terminology used throughout the School Management System.

The purpose is to ensure that business discussions, documentation, database design, APIs, UI, and source code all use the same vocabulary.

Only the terms defined in this glossary should be used.

Claude Code must never invent alternative names or synonyms.

---

# General Rules

Every business concept has exactly one official name.

Avoid synonyms.

If a new business term is introduced, it must first be added to this glossary.

---

# Organization

## School

Official Meaning

An educational institution managed within the system.

Never use

Institution

Campus

Organization

Company

unless they represent different business concepts.

---

## Super Admin

Official Meaning

The platform owner.

Manages multiple schools.

Not associated with any specific school.

---

## School Admin

Official Meaning

Administrator responsible for one school.

Has full administrative access within that school only.

Creates and manages Manager accounts within their own school. See `docs/01-architecture/Architecture-Decision-Records/ACR-010-Manager-Role-Introduction.md`.

Never use

Principal

Operator

unless they become separate roles.

Manager is no longer a synonym for School Admin — it is now a separate, distinct role. See Manager below.

---

## Manager

Official Meaning

A school-scoped staff role with attendance-specific administrative access, distinct from School Admin.

Created and managed only by School Admin. Never inherits School Admin's own administrative permissions.

Scoped to exactly one school.

Cannot manage or create another Manager's account unless explicitly granted that permission in a future decision.

See `docs/03-business/Attendance-Management.md` for what a Manager may actually record, and `docs/01-architecture/Architecture-Decision-Records/ACR-010-Manager-Role-Introduction.md` for how the role was introduced.

Never use

School Admin

Admin (bare, when School Admin specifically is meant)

Principal

Operator

unless they represent the same concept as School Admin, not Manager.

---

## Accountant

Official Meaning

User responsible for finance-related operations.

Scope is limited to financial modules.

Never use

Cashier

Finance Officer

unless those become separate business roles.

---

## Teacher

Official Meaning

A staff member responsible for teaching students.

---

## Student

Official Meaning

A learner enrolled in a school.

Never use

Learner

Pupil

Candidate

---

# Academic Structure

## Class

Official Meaning

A grade or level in the school.

Examples

Grade 1

Grade 2

Form 1

Never use

Course

Program

Level

unless they represent different concepts.

---

## Section

Official Meaning

A subdivision of a class.

Example

Grade 5

Section A

Section B

---

## Subject

Official Meaning

An academic subject taught within a class.

Owned platform-wide by Super Admin (Subject Management), not by any one School — a School only ever has Subjects assigned to it, per Subject Assignment below.

Examples

Mathematics

English

Physics

Never use

Course

Module

Lesson

---

## Education Level

Official Meaning

A curriculum stage a School offers and a Subject belongs to.

Values

Primary

Secondary

A School must offer at least one. A Subject belongs to exactly one. See `docs/01-architecture/Architecture-Decision-Records/ACR-003-School-Education-Levels.md`.

Never use

Level

Grade Band

Tier

unless they represent a different, more granular concept than the two values above.

---

## Subject Assignment

Official Meaning

Making a Subject available to a School, so the School may use it in academic operations.

A separate, explicit action from a School being given an Education Level — assigning an Education Level never assigns any Subject, and assigning a Subject never changes a School's Education Levels.

Never use

Allocation

Enrollment

unless they represent a different concept — Enrollment is reserved for a Student's assignment to an academic year and class (see Student Lifecycle below).

---

## Academic Year

Official Meaning

A school's own defined period of operation (a start date and an end date), owned and managed entirely by that School's Admin — not by Super Admin, and not shared across schools.

A school may have several Academic Years on record; exactly one may be designated Current at a time. See `docs/03-business/Academic-Year-Management.md`.

Never use

Session

School Year (as a distinct concept — use "Academic Year" consistently instead)

Term

unless Term comes to represent a genuinely separate, smaller sub-period within an Academic Year.

---

## Timetable

Official Meaning

The weekly teaching schedule — which Period, on which Day, taught by whom, to which Class — owned by Timetable Management. A recurring weekly pattern scoped to one Academic Year, not a set of calendar dates; the single stored record behind it is a Lesson (see below). Timetable Management consumes School Schedule Management's own Working Days/Shifts/Periods and Teacher Subject Assignment's own Teacher-Subject-Class bindings — it does not own either.

Never use

Routine

Schedule (as a synonym for Timetable specifically — "School Schedule Management" is a different, already-built feature; see the School Schedule section below. Context should always make clear which one a document means.)

Room (no Room/classroom entity exists anywhere in this project yet — a Lesson does not reference one)

---

## Lesson

Official Meaning

The single stored record behind Timetable Management: "this Teacher Subject Assignment happens on this Day, in this Period." Master Timetable, Class Timetable, and Teacher Timetable are all derived, read-only projections of the same Lesson rows — never a separately stored copy for any view. Owned by Timetable Management.

Never use

Class Session

Period (a Period is School Schedule Management's own concept, one level below Shift — a Lesson references a Period, it is not one)

---

## Teacher Weekly Capacity (Hard Constraint)

Official Meaning

A Timetable generation pre-flight Hard Constraint (Business Rule #30): a Teacher's total committed weekly periods — summed via Weekly Subject Allocation's own `weeklyPeriods` across every one of that Teacher's own Active Teacher Subject Assignments — must never exceed their own weekly capacity (Working Days × Teaching Periods, summed once per distinct Shift their own Classes use, never per-Class). Product Owner-raised directly during implementation discussion (the "Teacher A teaches Math for one Class and Physics for several others" scenario). Checked only at generation's own pre-flight step, via `getTeacherWeeklyCommitmentAndCapacity` (Teacher Subject Assignment's own new, additive, read-only function) — never as a write-time gate on Weekly Subject Allocation's or Teacher Subject Assignment's own create/correct paths, since a Weekly Subject Allocation edit alone can invalidate a Teacher's total with zero Teacher Subject Assignment writes occurring. Deliberately does not subtract a Teacher's own `unavailableSlots` — that finer-grained exclusion is a separate, already-handled per-slot Hard Constraint at actual placement time.

Never use

Workload (this project's own established term for a *soft*, illustrative balance measure — `SchoolOptimizationSettings.balanceTeacherWorkloads` and the Quality Score's own `workloadBalance` — a different concept from this Hard Constraint, which is a strict block, never advisory)

---

## Grade/Form

Official Meaning

A named grouping of Classes that share the same year level (e.g. "Grade 8" groups Classes G8A, G8B, G8C, G8D; "Form 1" groups F1A, F1B, F1C) — the scope Weekly Subject Allocation configures against, once per Grade/Form rather than once per individual Class. The business term is "Grade/Form"; its implementing entity is `GradeLevel` (see that entry below), owned by Class Management, added via **ACR-009**. Every Class within one Grade/Form must share the same Shift.

**Important — deliberately not the same word as "Grade" (Examination) below.** This project already uses "Grade" alone to mean an academic evaluation based on marks (A, B, C, Pass, Fail). Always write "Grade/Form" (or "Grade or Form," matching how the term was introduced) for the year-level grouping concept — never bare "Grade" — to avoid colliding with the existing, unrelated Examination term.

Never use

Grade (alone — always the compound "Grade/Form," to avoid colliding with the unrelated Examination term of the same bare word)

Class (a Class is one specific G8A/F1A-shaped group of Students; a Grade/Form is the higher-level grouping several Classes share)

Curriculum (this project does not have, and has explicitly rejected, a Curriculum Management feature — see ACR-008)

---

## GradeLevel

Official Meaning

The entity name implementing the business concept **Grade/Form** (see above) — a school-scoped, named, orderable, archivable entity owned by Class Management, added via **ACR-009** (`docs/01-architecture/Architecture-Decision-Records/ACR-009-Class-Grade-Level-Reference.md`), the same shape as `Shift`. `Class` references it via a required `gradeLevelId`. Implemented, including a required `educationLevel` field (Primary/Secondary) added after this entry was first written, so Weekly Subject Allocation can auto-populate the eligible Subjects/Teachers for a Grade/Form.

Never use

Grade/Form (when writing code or schema — `GradeLevel` is the technical/entity name; "Grade/Form" is the business term used in Business/Product documentation. The two name the same concept from two different documentation layers, not two different things.)

Curriculum (see Grade/Form entry above — this project has no Curriculum Management feature)

---

## Weekly Subject Allocation

Official Meaning

A Timetable-nested sub-feature (not a top-level platform feature) answering exactly one question: how a Grade/Form's own available weekly teaching periods — always calculated live from School Schedule Management's own Working Days and the assigned Shift's own Teaching Period count, never hardcoded or entered by the Administrator — are distributed across Subjects. See `docs/03-business/Weekly-Subject-Allocation.md` and ACR-008. **Accepted and Implemented.** Timetable's own generation engine and manual Lesson creation now read this feature's own `getWeeklyPeriodsForAssignment` exclusively — `TeacherSubjectAssignment.weeklyLessonTarget` and `SubjectSchedulePreference.doublePeriodPreferred` (ACR-006) have both been formally removed via migration, superseded as this entry originally anticipated.

Never use

Curriculum Management (explicitly considered and rejected — see ACR-008; never use this name for any feature in this project)

Weekly Lesson Target (`TeacherSubjectAssignment.weeklyLessonTarget`, ACR-006's own field — removed; this term now refers only to history, never to a currently-existing field. Use "weekly period allocation" or `weeklyPeriods` for the current, live concept.)

---

# School Schedule

## School Calendar

Official Meaning

A school's own current Working Day / Weekend Day configuration — exactly one per school, owned by School Schedule Management. Not a synonym for Timetable, and not itself a list of dates (see Working Day / Weekend Day below). See `docs/03-business/School-Schedule-Management.md`.

Never use

Calendar (alone, without "School" — always the full term, to avoid confusion with a future date-based calendar feature such as Public Holidays)

Timetable

---

## Working Day

Official Meaning

A weekday a school operates on, per that school's own School Calendar.

Never use

Business Day

School Day

---

## Weekend Day

Official Meaning

A weekday a school does not operate on, per that school's own School Calendar. Always the complement of Working Day — never stored separately, always derived.

Never use

Holiday (a Weekend Day is a recurring weekly non-operating day, not a single date-specific exception — see Public Holiday, reserved for a future feature)

Day Off

---

## Shift

Official Meaning

A school's own named, time-bounded daily teaching period (e.g. "Morning," "Afternoon"), owned by School Schedule Management. Every Class references exactly one active Shift.

Never use

Session

Period (a Period is a distinct, smaller entity one level below Shift — see the Period entry below, not a synonym for Shift itself)

Slot

---

## Period

Official Meaning

A named, ordered sub-division of a Shift (e.g. "Period 1," "Break"), owned by School Schedule Management — not by Timetable Management, which only consumes Period definitions to assign Lessons. Every Period belongs to exactly one Shift and may never be moved to another. `Type` is `TEACHING` or `BREAK`; Start/End Time are optional until configured. See `docs/03-business/School-Schedule-Management.md`'s Period Management Extension section.

Never use

Class Session (see Lesson, above, for Timetable Management's own equivalent concept — a Lesson references a Period, it is not one)

Slot

Room (no Room/classroom entity exists anywhere in this project yet — a Period does not reference one)

---

## Default Shift

Official Meaning

The one Shift, among a school's own Shifts, marked as the sensible default choice — always Active. Exactly one exists per school at any time.

Never use

Primary Shift

Main Shift

---

# Student Lifecycle

## Admission

Official Meaning

The process of registering a student into the school.

---

## Enrollment

Official Meaning

The assignment of a student to an academic year and class.

Admission and Enrollment are different concepts.

---

## Promotion

Official Meaning

Moving a student to the next class.

---

## Graduation

Official Meaning

Completion of the final academic level.

---

## Transfer

Official Meaning

Moving a student to another school.

---

## Withdrawal

Official Meaning

A student permanently leaving the school without transferring to another school on the platform.

Distinct from Transfer, which always has a receiving school.

---

## Archive

Official Meaning

Making a record inactive without deleting it.

Archived records remain in the system.

---

# Teacher Employment Lifecycle

Employment Status and Account Status are different concepts: Employment Status (the terms below) is owned by Teacher Management; Account Status (whether the Teacher can log in) is owned by Authentication & Authorization. See ACR-001 (`docs/01-architecture/Architecture-Decision-Records/ACR-001-Employment-vs-Authentication-Ownership.md`).

---

## Onboarding

Official Meaning

The process of registering a Teacher into the school, including creating their login account.

---

## Active

Official Meaning

A Teacher currently employed at the school. The default employment status upon Onboarding.

---

## On Leave

Official Meaning

A Teacher temporarily away from the school. Does not automatically change account access.

---

## Return from Leave

Official Meaning

Restoring a Teacher from On Leave back to Active.

---

## Resigned

Official Meaning

A Teacher who has voluntarily left the school's employment.

---

## Rehire

Official Meaning

Restoring a Resigned Teacher back to Active.

---

## Terminated

Official Meaning

A Teacher whose employment was ended by the school. Permanent within Teacher Management; not reversible by a simple restore.

---

## Retired

Official Meaning

A Teacher who has permanently left employment due to retirement. Permanent within Teacher Management; not reversible by a simple restore.

---

# Attendance

## Attendance

Official Meaning

The presence record of a person in the school — a Student, Teacher, Accountant, or Manager — for one day. Never an Admin (School Admin), who has no attendance record of any kind. See `docs/03-business/Attendance-Management.md`.

---

## Attendance Record

Official Meaning

One attendance entry for one person (Student, Teacher, Accountant, or Manager) for one day, carrying a status (`PRESENT`, `ABSENT`, `LATE`, or `EXCUSED`), who recorded it, and when.

---

## Record Arrival ("Come")

Official Meaning

The action a Manager or Admin takes to record a Teacher's, Accountant's, or Manager's presence — captures the current server timestamp as that person's arrival time and derives their status (`PRESENT` or `LATE`) automatically, per the school's own configured Staff Attendance Timing Settings. Never a manual status selection — see `docs/03-business/Attendance-Management.md` Business Rules #35–37. Never use "mark attendance" or "select status" to describe this action for staff attendance — it is always framed as recording an arrival, since the status itself is never chosen directly.

---

## Staff Attendance Timing Settings

Official Meaning

A school's own configured start time, late threshold, and absence cutoff for staff attendance — set by School Admin, never hardcoded, and independent of any Shift's own operating hours. See `docs/03-business/Attendance-Management.md` Business Lifecycle §11.

---

# Examination

## Exam

Official Meaning

An academic assessment.

Examples

Midterm

Final

Quiz

---

## Mark

Official Meaning

Score obtained in one subject.

---

## Grade

Official Meaning

Academic evaluation based on marks.

Example

A

B

C

Pass

Fail

Never use

Grade (bare, for a year-level grouping like "Grade 8") — see Grade/Form, in the Academic Structure section above, for that unrelated concept. The two meanings of "Grade" were not disambiguated until Weekly Subject Allocation's own introduction surfaced the collision; always write "Grade/Form" for the year-level meaning from that point on.

---

## Report Card

Official Meaning

Official document showing academic performance.

---

# Finance

## Fee

Official Meaning

An amount charged by the school.

---

## Payment

Official Meaning

Money paid toward a fee.

---

## Invoice

Official Meaning

A bill requesting payment.

---

## Receipt

Official Meaning

Proof of payment.

---

# Authentication

## User

Official Meaning

Anyone who can log into the system.

---

## Role

Official Meaning

Defines user permissions.

---

## Permission

Official Meaning

A specific action a role may perform.

---

## Authentication

Official Meaning

Verifying user identity.

---

## Authorization

Official Meaning

Determining user permissions.

---

## Account Activation

Official Meaning

Enabling a user account so it can authenticate and access the system.

---

## Account Deactivation

Official Meaning

Disabling a user account so it can no longer authenticate, without deleting the account or its history.

---

## Account Lockout

Official Meaning

A temporary state in which an account cannot authenticate, triggered automatically after repeated failed login attempts.

---

## Administrative Password Reset

Official Meaning

School Admin directly invalidating a Teacher, Manager, or Accountant account's current password and requiring the account owner to establish a new one themselves — added by ACR-011 (`docs/01-architecture/Architecture-Decision-Records/ACR-011-Administrative-Password-Reset.md`). Distinct from Forgotten Password Recovery: that flow is self-service and initiated by the account owner; this one is initiated by School Admin on the account owner's behalf, scoped to their own school. Never use to mean School Admin choosing, viewing, or retaining the account owner's password — no password value is ever exposed by this action.

---

# Reports

## Report

Official Meaning

A generated summary of business information.

---

# Audit

## Audit Log

Official Meaning

Permanent record of important user actions.

---

# Online Passcard

## Passcard

Official Meaning

Digital student identity card.

Used for student identification.

This is different from:

Report Card

Receipt

Certificate

---

# Business Rules

The glossary is the single source of truth for terminology.

No alternative business terms should appear in:

- Database
- API
- Documentation
- UI
- Source Code
- Comments

without architectural approval.

---

# Change Process

If a new business term is needed:

1. Discuss it.

2. Define it.

3. Add it to this document.

4. Use it consistently everywhere.

Never introduce unofficial terminology.