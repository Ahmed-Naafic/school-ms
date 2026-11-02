# Timetable Management

Version: 2.2

Status:
- v1.0 (manual-first architecture): Business Discovery, Business Specification, and Business Review complete — Approved, produced autonomously per the Product Owner's explicit one-time waiver of phase-gate stops for this feature.
- **v2.0 — Architecture Change (Generation-First), Approved.** The Product Owner has explicitly reversed the v1.0 architecture: manual, cell-by-cell Lesson creation is no longer the primary workflow. The system must generate the Timetable automatically from configured academic data; the Administrator reviews, adjusts, and publishes it. Manual Lesson creation remains, but only as an advanced/override action. This document replaces v1.0's manual-first framing throughout — no obsolete "no automatic generation" language is retained. Produced under the same continuing autonomous authority as v1.0, with the following decisions confirmed by the Product Owner before this rewrite began (see Change History): Terms are deferred (generation scopes to a full Academic Year for now); generation runs as a background job, not a blocking request; a double period is two ordinary linked Lesson rows (a "Lesson Group"), not a new spanning-Lesson concept; Publish is a single school-wide Draft/Published toggle per Academic Year, not per-Lesson.
- **v2.1 — Forward reference only, no content change.** Records that ACR-008 and the new Weekly Subject Allocation feature's own Business Discovery (`docs/03-business/Weekly-Subject-Allocation.md`, not yet approved) will, once Accepted, become this feature's own new dependency: the generation engine will read weekly per-Subject, per-Grade/Form period counts from that feature instead of `TeacherSubjectAssignment.weeklyLessonTarget` (ACR-006), and Double Period preference will relocate from a per-Assignment concept to a per-Grade/Form one. No Business Rule, Functional Requirement, or Feature Acceptance status has changed in this revision; the actual Technical Design amendment is deferred until Weekly Subject Allocation is itself Accepted.
- **v2.2 — Weekly Subject Allocation Integration, implemented and Approved.** The generation engine and the manual-write weekly-target check (Business Rule #8) both now read from Weekly Subject Allocation instead of `TeacherSubjectAssignment.weeklyLessonTarget`/`SubjectSchedulePreference.doublePeriodPreferred` (ACR-006) — both fields are formally removed. New, Product Owner-approved Business Rule #30: a Teacher's total committed weekly periods across all their own Classes must never exceed their own weekly capacity, checked as a generation pre-flight gate. See Change History for the full decision record.

---

# Purpose

Timetable Management is the single source of truth for **when** a Teacher teaches a Subject to a Class: which Period, on which Day, in which Academic Year. It turns School Schedule Management's own Working Days/Shifts/Periods and Teacher Subject Assignment's own Teacher-Subject-Class bindings into an actual weekly schedule — but it no longer expects a School Admin to build that schedule by hand, one cell at a time.

**A school should not be expected to manually create hundreds or thousands of Timetable entries.** The system generates the Timetable automatically from data the Administrator has already configured (Classes, Subjects and their weekly lesson requirements, Teacher Subject Assignments, Teacher/Subject preferences, School optimization rules). The Administrator's job shifts from *building* the Timetable to *configuring the inputs, generating, reviewing, and adjusting* — the same shift in responsibility Academic Year Management, School Schedule Management, and Teacher Subject Assignment already each made explicit for their own piece of "how does this school actually run."

Without this feature, every time-aware downstream module (Attendance, Exam Management, Teacher Daily Schedule, Student Daily Schedule) would have no reliable way to know "what is supposed to be happening right now" — this feature exists to make that explicit once.

This feature does not teach, grade, or take attendance — it only says who is scheduled where and when.

---

# Architecture Position

Per `docs/00-governance/Development-Roadmap.md`, Order #10 — depends on Class Management, Subject Management, Teacher Management, Academic Year Management, School Schedule Management (including its Period Management addition), and Teacher Subject Assignment, all already Accepted. Attendance Management (Order #11) and future Exam Management/Teacher Daily Schedule/Student Daily Schedule depend on this feature in turn.

**Deferred by this Architecture Change**: a Term/Semester concept does not exist anywhere in this project. The generation-first workflow's own "Configure School" step lists Terms as a future input; this version generates and publishes per full Academic Year, exactly as v1.0 already scoped Lessons. Adding Term-scoped generation later is an additive change to this feature (a new optional scope dimension), not a redesign — the same category of deferral this project already applied to Room/classroom assignment.

---

# Single Source of Truth

A single entity, the **Lesson**, remains the only stored scheduling record — this does not change under the Architecture Change. What changes is *who or what typically creates it*:

- **Master Timetable** — rows are Classes, columns are the week (Day × Period), one cell per Lesson. The primary editable view — after a Generate run populates it, the Administrator reviews and adjusts here (move, swap, lock/unlock, delete, split a double period, or create an individual Lesson as an advanced override). Every write, whichever path produces it, is still a Lesson write.
- **Teacher Timetable** — rows are Days, columns are Periods, cell shows Class + Subject. Read-only; a Teacher-scoped filter over the same Lesson rows.
- **Class Timetable** — rows are Days, columns are Periods, cell shows Subject + Teacher. Read-only; a Class-scoped filter over the same Lesson rows.

No view stores its own copy of a Lesson. A Lesson is never duplicated as three separate records for three views.

**New in this Architecture Change**: a Lesson now belongs to exactly one **Timetable Version** — a school's own Draft, Published, or (once superseded) Archived working copy of its Timetable for one Academic Year. The generation engine and every manual edit write into the current Draft; Publishing snapshots that Draft into the new Published version, and the previous Published version is retained, Archived, as history. See Draft, Published, and Regeneration below.

---

# Feature Overview

## The Generation-First Workflow

The primary workflow is, and must remain, **Generate → Review → Adjust → Publish**:

1. **Configure School** — the Administrator ensures the underlying academic data this feature reads is in place: Academic Year, Shifts, Periods, Classes, Subjects (and each Teacher Subject Assignment's own weekly lesson requirement), Teachers, Teacher Subject Assignments, Teacher scheduling preferences, and Subject scheduling preferences. None of this is owned or created by this feature — it is entirely configured through the already-Accepted features that own each of those entities.
2. **Generate Timetable** — the Administrator clicks Generate. The engine reads all of the above and automatically creates the Lesson records that satisfy every Hard Constraint, optimizing for the configured Soft Preferences wherever a choice remains. This runs as a background job (Execution Model, below), not a request the Administrator's browser sits and waits on.
3. **Review** — the Administrator reviews the generated Timetable (Master Timetable, plus the generation run's own Quality Score and statistics: lessons placed, conflicts, anything left unscheduled).
4. **Adjust** — the Administrator moves, swaps, locks, unlocks, or deletes individual Lessons (or Lesson Groups, for double periods); creates an individual Lesson manually where the generator left a gap or where a specific placement is wanted; or regenerates the whole Timetable, one Class, one Teacher, or one Day, without disturbing Locked Lessons.
5. **Publish** — the Administrator publishes the reviewed, adjusted Draft. Teachers and Students see only the Published Timetable; the Administrator continues to review and adjust in the Draft, which may or may not match the currently Published version at any given moment.

**Manual, individual Lesson creation still exists — as an advanced/override action, not the primary workflow.** An Administrator may always create, move, or swap a single Lesson by hand (e.g., to fix a generation gap, or because a specific placement is operationally necessary), the same way v1.0's Hard Validation and conflict-prevention rules already worked. What changes is emphasis: the system is not designed around, nor does it expect, an Administrator building an entire Timetable one click at a time.

## Lesson (unchanged shape, versioned)

A **Lesson** is still "this Class has this Subject, taught by this Teacher, on this Day, in this Period, in this Academic Year," created by placing an existing, Active Teacher Subject Assignment into a Day + Period slot — whether that placement comes from the generation engine or a manual action. A Lesson's Day/Period slot remains a recurring weekly pattern, not a specific calendar date, exactly as v1.0 established.

Two Hard Validation guarantees remain non-negotiable, enforced at the database level: a Teacher can never be double-booked, and a Class can never be double-booked. The Architecture Change adds several more Hard Constraints the generation engine (and manual edits) must never violate — see Business Rules.

## Double Periods (Lesson Groups)

A "double period" — two consecutive periods of the same Subject taught by the same Teacher to the same Class, back-to-back — is modeled as **two ordinary Lesson rows linked into one Lesson Group**, not a new Lesson shape spanning two Periods. Attendance and every other future per-Period feature continue to work against individual Lesson rows unmodified. The generator creates a Lesson Group whenever a Subject's own scheduling preference asks for double periods; the Administrator may Split a Lesson Group into two independent Lessons as a deliberate, audited override. See Lesson Groups and Double Periods below.

## Locking

A Lesson (or Lesson Group) may be **Locked** by the Administrator. A Locked Lesson can never be moved, and can never be touched by any regeneration — whole, by-Class, by-Teacher, or by-Day. Locking is how an Administrator protects a manually-placed or manually-adjusted Lesson from being silently undone by a later regeneration.

## Draft, Published, and Regeneration

Every write — generation or manual — happens against a school's own current **Draft** Timetable Version for an Academic Year, auto-created the first time anything is written if none yet exists. Teachers and Students (once their own consuming views exist) only ever see the **Published** Version. Publishing replaces the current Published Version with the Draft and Archives the version it replaces; only one Draft and only one Published Version may exist per school per Academic Year at a time.

Regeneration re-runs the engine against the current Draft, scoped to the whole Timetable, one Class, one Teacher, or one Day — Locked Lessons are always excluded, whatever the scope.

## Timetable Quality Score (now a generation output, not just a diagnostic)

Every generation run produces a structured Quality Score: an overall percentage, Teacher Conflicts, Class Conflicts, Missing Lessons (Hard Constraints the engine could not satisfy), Teacher Preference Satisfaction, Subject Distribution, Teacher Gap Score, and Workload Balance. This score is still read-only and advisory — it never blocks a Publish, and an Administrator may publish a Draft with a lower score or with Missing Lessons if they choose to (see Business Rules).

---

# Business Goals

1. Establish the Lesson as the single, authoritative record of the weekly teaching schedule — every view derived from it, never a separate stored copy — regardless of whether the generator or a manual action created it.
2. **Eliminate manual, cell-by-cell Timetable construction as the expected workflow.** A School Admin configures data once; the system produces the Timetable.
3. Guarantee a Teacher and a Class can never be double-booked, with a real database-level backstop, not application logic alone — whether the conflicting write comes from the generator or a manual edit.
4. Protect Break Periods, respect Teacher availability, keep double periods consecutive, and never move a Locked Lesson — all as genuine Hard Constraints the generation engine must never violate.
5. Optimize the generated Timetable against configured Teacher/Subject/School preferences wherever a choice remains, without ever violating a Hard Constraint to do so.
6. Give the Administrator full manual override control (move, swap, lock/unlock, delete, split, create) over the generated Timetable, and the ability to regenerate the whole thing, or just one Class, Teacher, or Day, without losing manually-protected work.
7. Separate what the Administrator is actively working on (Draft) from what Teachers/Students actually see (Published), so review and adjustment never disrupts already-published schedules mid-edit.
8. Support printing and PDF export of all three views, and a reusable generation path a future bulk-export capability can build on.

---

# Actors

## School Admin

Configures the underlying academic data; generates the Timetable; reviews it, including its Quality Score; adjusts it (move, swap, lock/unlock, delete, split, create an individual Lesson); regenerates all or part of it; publishes it. Views the read-only Teacher/Class Timetables. Prints and exports any view. Configures Teacher/Subject scheduling preferences and school optimization settings.

## Teacher

Read-only. Views their own **Published** Teacher Timetable once a self-service consuming view exists (none does yet, per Architecture Position); may set their own scheduling preferences (the same self-service pattern Teacher Management already established for `teachers/me`); may not create, move, swap, lock, generate, or publish a Lesson.

## Student

No access in this version. A future Student Daily Schedule feature is expected to consume this feature's published interface and read only the Published Version.

## Super Admin

Platform-level oversight only — may view any school's Timetable views (Published, by default, matching every other feature's own oversight-is-read-only-and-does-not-see-work-in-progress convention), the same read-only oversight pattern every prior feature in this project already establishes. May not generate, adjust, or publish a Timetable on a school's behalf.

## Accountant

No role in this feature.

---

# User Stories

1. As a School Admin, I want to click Generate and have the system build the Timetable for me, so I don't have to place hundreds of Lessons by hand.
2. As a School Admin, I want the generator to never violate a Hard Constraint (Teacher/Class conflict, Break protection, Shift compatibility, weekly targets, Teacher availability, double-period consecutiveness, Locked Lessons), so I can trust whatever it produces.
3. As a School Admin, I want the generator to optimize for the Teacher/Subject/School preferences I've configured wherever it can, so the result isn't just conflict-free but actually sensible.
4. As a School Admin, I want to see a Quality Score and a list of anything the generator couldn't schedule, so I know exactly what needs my attention.
5. As a School Admin, I want to move, swap, lock, unlock, delete, or manually add individual Lessons after generation, so I can fix or fine-tune what the generator produced.
6. As a School Admin, I want to Lock a Lesson I've manually placed, so a later regeneration never silently undoes it.
7. As a School Admin, I want to regenerate just one Class, one Teacher, or one Day, so a small change doesn't force me to redo the whole Timetable.
8. As a School Admin, I want a double period to move, swap, lock, and delete as a single unit, so I don't have to manage its two Lessons separately unless I deliberately choose to.
9. As a School Admin, I want to explicitly split a double period into two independent Lessons when operationally necessary, with a clear warning about what that means.
10. As a School Admin, I want my in-progress edits to never affect what Teachers/Students currently see, so I can review and adjust freely before Publishing.
11. As a School Admin, I want to Publish when I'm satisfied, so Teachers/Students see the new Timetable only when I say so.
12. As a Teacher, I want to view my own Published Teacher Timetable, so I know where I'm supposed to be and when.
13. As a School Admin, I want to print or export any of the three views as a PDF.
14. As a Super Admin, I want to view any school's Published Timetable views for oversight.

---

# Functional Requirements

1. The system must allow School Admin to trigger automatic Timetable generation, scoped to the whole school, one Class, one Teacher, or one Day.
2. Generation must run as a background job — the request that starts it returns immediately with a job identifier, not the finished result.
3. The system must allow School Admin to poll a generation job's status (Queued, Running, Completed, Failed) and progress (lessons placed vs. total, current phase).
4. The generation engine must read: Classes, the current Academic Year, Shifts, Periods, Subjects and each Teacher Subject Assignment's own weekly lesson requirement, Teacher Subject Assignments, Teacher scheduling preferences, Subject scheduling preferences, and School optimization settings.
5. The generation engine must never violate a Hard Constraint (see Business Rules #20–#28); where a Hard Constraint cannot be satisfied for a required Lesson, that Lesson is reported as unscheduled ("Missing"), never silently dropped without being reported.
6. The generation engine must optimize for configured Soft Preferences wherever a choice remains among Hard-Constraint-satisfying placements; a Soft Preference is violated only when necessary to satisfy a Hard Constraint or when no better option exists.
7. A completed generation job must report a structured Quality Score (Overall Quality, Teacher Conflicts, Class Conflicts, Missing Lessons, Teacher Preference Satisfaction, Subject Distribution, Teacher Gap Score, Workload Balance).
8. The system must allow School Admin to Lock and Unlock a Lesson (or Lesson Group). A Locked Lesson can never be moved, swapped, deleted via regeneration, or included in any regeneration's replacement scope.
9. The system must allow School Admin to move an existing Lesson to a different Day + Period, or swap its Teacher Subject Assignment, re-validating every Hard Constraint exactly as a fresh placement would — rejected outright if the target Lesson is Locked.
10. The system must allow School Admin to delete (archive) an individual Lesson, and restore (reactivate) a cancelled Lesson, re-validating every Hard Constraint before restoring.
11. The system must allow School Admin to create an individual Lesson manually, as an advanced/override action, subject to the same Hard Constraints generation itself must satisfy.
12. The system must support two Lessons linked as a Lesson Group (a double period): each Lesson still references exactly one Period; the pair shares a group identifier and each carries its own sequence (1 or 2) within it. Moving, swapping, locking, or unlocking a grouped Lesson applies to the whole group; deleting one prompts whether to delete the whole group.
13. The system must allow School Admin to explicitly Split a Lesson Group into two independent Lessons, via a dedicated action requiring confirmation, recorded in the audit log. After splitting, the two Lessons may be moved, swapped, locked, or deleted independently, and a future regeneration may recreate the double period unless the affected Lessons are Locked or excluded from that regeneration's scope.
14. The system must maintain, per school per Academic Year, at most one Draft and at most one Published Timetable Version at a time, plus any number of Archived (superseded) versions.
15. Every Lesson write (generation or manual) must apply to the current Draft Version, auto-creating one if none exists for that school + Academic Year.
16. The system must allow School Admin to Publish the current Draft: validate it, replace the current Published Version with it, and Archive the version it replaces. Publishing must be an explicit, confirmed action, recorded in the audit log.
17. Teacher and Student consuming views must read only the current Published Version, never the Draft.
18. The system must derive the Master Timetable, Teacher Timetable, and Class Timetable views from the same Lesson rows — never a separately stored copy for any view — reading the Draft (School Admin's own review/adjust context) or the Published Version (Teacher/Student/oversight context) as appropriate.
19. The system must allow School Admin to view the Master Timetable (all Classes) and any single Class's or Teacher's own Timetable.
20. The system must allow a Teacher to view their own Published Teacher Timetable only, once a self-service consuming view exists.
21. The system must allow Super Admin to view any school's Published Timetable views, read-only.
22. The system must support printing and PDF export of the Master Timetable, any Class Timetable, and any Teacher Timetable.
23. The system must allow School Admin to record scheduling preferences for a Teacher (including a hard Teacher-availability list, distinct from soft avoid-periods) and for a Teacher Subject Assignment, and school-wide optimization settings.
24. The system must allow a Teacher to view and edit their own scheduling preferences.
25. The system must expose this feature's data to other modules exclusively through its own published, narrow, read-only interfaces — never direct table access.
26. The system must enforce strict tenant isolation — a School Admin may never view or modify another school's Lessons, Timetable Versions, generation jobs, preferences, or settings.
27. The system must preserve every cancelled Lesson's own historical record, and every superseded Timetable Version's own historical record — Archive Before Delete, never a hard delete.

---

# Non-Functional Requirements

1. Tenant isolation is mandatory. A School Admin must never view or modify another school's Timetable data.
2. All business validation must be enforced on the backend, for both generated and manually-created Lessons — the engine and the manual write path share the identical Hard Constraint checks, never two separate implementations of the same rule.
3. Lesson creation, move, swap, delete, restore, lock, unlock, split, generation (including regeneration), and publish must all be auditable.
4. The feature must preserve historical accuracy: a cancelled Lesson's record and a superseded Timetable Version are never destroyed.
5. Generation must not block the HTTP request that starts it — it runs as a background job, reported via a status/progress poll.
6. Generation must be deterministic enough to be trustworthy and debuggable: given the same inputs and the same scope, it must never violate a Hard Constraint, though its exact Soft-Preference optimization is not required to be bit-for-bit reproducible between runs.
7. The feature must avoid duplicating Teacher, Subject, or Class business data inside Lesson — only structural foreign-key references needed for this feature's own conflict-prevention constraints are stored directly.
8. PDF generation and printing must be designed so a future bulk-export capability can reuse the same generation path.
9. A process crash mid-generation-run is Accepted Technical Debt for this version (see Technical Design's Risks) — this project has no background job queue/worker infrastructure; recovering a stuck job is a manual/future concern, not built in this pass.

---

# Permissions

## School Admin

- May configure Teacher/Subject scheduling preferences and school optimization settings, for their own school.
- May trigger and poll generation jobs (whole school, one Class, one Teacher, one Day), for their own school.
- May view the Draft and Published Master/Class/Teacher Timetables, for their own school.
- May move, swap, delete, restore, lock, unlock, split, and manually create Lessons in the Draft, for their own school.
- May Publish the Draft, for their own school.
- May print and export any Timetable view, for their own school.
- May view the Quality Score and generation job history, for their own school.
- May not view or modify another school's data.

## Teacher

- May view their own Published Teacher Timetable only — read-only — once a self-service consuming view exists.
- May view and edit their own scheduling preferences only.
- May not generate, publish, lock, create, move, swap, or delete a Lesson, or view another Teacher's or Class's Timetable, the Draft, or another Teacher's preferences.

## Super Admin

- May view any school's Published Timetable views, read-only.
- May not generate, adjust, lock, or publish a Timetable on a school's behalf, and may not configure a school's preferences or settings.

## Student and Accountant

- No permissions in this feature.

---

# Business Workflow

## 1. Configure School

The Administrator ensures the Academic Year, Shifts, Periods, Classes, Subjects (with each Teacher Subject Assignment's own weekly lesson requirement), Teachers, Teacher Subject Assignments, Teacher scheduling preferences, and Subject scheduling preferences are all in place — entirely through the already-Accepted features that own each of them. This feature reads that data; it does not create or edit it.

## 2. Generate Timetable

The Administrator triggers generation, optionally scoped to the whole school, one Class, one Teacher, or one Day. A background job starts immediately; the Administrator's request returns a job id right away. The engine reads the configured data, places every required Lesson it can while never violating a Hard Constraint, optimizes for Soft Preferences wherever a choice remains, and reports what (if anything) it could not schedule.

## 3. Review

The Administrator polls the job until it completes, then reviews the generated Draft: the Master Timetable itself, the Quality Score, and any reported Missing Lessons or conflicts (which should be zero for Teacher/Class conflicts by construction — Missing Lessons means "could not be placed," never "placed with a conflict").

## 4. Adjust

The Administrator moves, swaps, deletes, restores, locks, or unlocks individual Lessons or Lesson Groups; splits a Lesson Group if a double period needs to be broken apart; manually creates an individual Lesson to fill a gap or force a specific placement; or triggers a regeneration (whole, Class, Teacher, or Day), which never touches a Locked Lesson.

## 5. Publish

When satisfied, the Administrator publishes: the system validates the Draft, replaces the current Published Version with it, and Archives the version it replaces. Teachers and Students (once a consuming view exists) immediately begin seeing the new Published Version. **The Draft Version that was just promoted no longer exists as a Draft** — the next Lesson write (a manual edit or a new Generate run) starts a brand-new, empty Draft, not a copy of what was just published. An Administrator who wants to keep adjusting immediately after Publishing must Generate again or rebuild manually; this is recorded as a deliberate, literal reading of the Publish algorithm, not an oversight (see Technical Design's own Risks section).

## 6. Viewing

Master Timetable (School Admin, all Classes, Draft by default), Class Timetable and Teacher Timetable (School Admin/Super Admin for any Class/Teacher in their school; a Teacher for their own once self-service exists) are all read-only projections of the same Lesson rows, computed on read — Draft for the Administrator's own review/adjust context, Published for Teacher/Student/oversight consumption.

## 7. Printing and Export

Any of the three views can be printed or exported as a PDF, exactly as v1.0 established, reusing the same generation path regardless of Draft or Published source.

## 8. Preferences and Optimization Settings

School Admin records Teacher scheduling preferences (including a hard Teacher-availability list) and Subject/Teacher-Subject-Assignment scheduling preferences (including double-period preference), and school-wide optimization settings. The generation engine reads all of this; nothing here is a Hard Constraint's own source of truth except Teacher availability specifically (see Business Rules).

---

# Business Rules

1. A Lesson is the single stored record of "this Teacher Subject Assignment happens on this Day, in this Period." No other stored record represents the same fact, regardless of whether the generator or a manual action created it.
2. A Lesson's Day+Period slot is a recurring weekly pattern, scoped to one Academic Year — not a specific calendar date.
3. A Teacher Subject Assignment must be Active to have a new Lesson created against it, whether by generation or manually.
4. A Period used by a Lesson must be of type Teaching. A Lesson may never be placed into a Break Period. **(Hard Constraint — generation and manual creation alike.)**
5. A Lesson's Period must belong to the same Shift as the Lesson's own Class. **(Hard Constraint.)**
6. A Teacher may never have two Active Lessons at the same Day+Period, within the same Timetable Version — enforced as a genuine database constraint. **(Hard Constraint.)**
7. A Class may never have two Active Lessons at the same Day+Period, within the same Timetable Version — enforced as a genuine database constraint. **(Hard Constraint.)**
8. **(Weekly Subject Allocation Integration — supersedes ACR-006)** A Teacher Subject Assignment's own required weekly Lesson count is read from Weekly Subject Allocation's own per-Grade/Form, per-Subject line item (`weeklyPeriods`), not stored on the Assignment itself. The generation engine must satisfy it exactly wherever possible, and must never exceed it; when a manual write would exceed it, the write is rejected. An Assignment whose Class/Subject has no matching Weekly Subject Allocation line contributes zero required Lessons — never a silent default of one. **(Hard Constraint: "Subject weekly lesson requirements must be satisfied.")**
9. A Teacher must actually be assigned to the Subject/Class/Section a Lesson represents — i.e. the Lesson's own Teacher Subject Assignment must exist and be Active. **(Hard Constraint: "Teacher must be assigned to the subject" — already implied by Rule #3, restated here because the Architecture Change names it explicitly as its own Hard Constraint.)**
10. A Teacher's own recorded unavailable slots (Business Rule #23) must never be used for a Lesson involving that Teacher. **(Hard Constraint: "Teacher availability must be respected." Distinct from a Teacher's soft avoid-periods preference, which may be violated if necessary; unavailable slots may never be.)**
11. Two Lessons forming a Lesson Group (a double period) must occupy consecutive Periods within the same Shift, on the same Day, for the same Teacher Subject Assignment. **(Hard Constraint: "Double periods must remain consecutive.")** The generator must place both halves of a group together or not at all — never one half alone.
12. A Locked Lesson (or every Lesson in a Locked Group) can never be moved, swapped, deleted, or replaced by any regeneration, whatever its scope. **(Hard Constraint: "Locked lessons cannot be moved.")** Locking/unlocking itself is a dedicated action, never a side effect of any other write.
13. Moving, swapping, or restoring an existing Lesson re-validates every Hard Constraint above in full — never a partial re-check — and is rejected outright if the target Lesson is Locked.
14. Cancelling a Lesson (archiving) preserves its record; it is never hard-deleted.
15. Lesson never stores Teacher, Subject, or Class business data directly — reached exclusively through the referenced Teacher Subject Assignment, except `classId`/`teacherId`, stored directly and copied from the chosen Assignment, solely to support Business Rules #6–#7's own database-level constraints.
16. The Master Timetable is the primary interface for both reviewing a generated Timetable and performing manual adjustments; Teacher Timetable and Class Timetable remain read-only, derived projections of the same Lesson rows.
17. A Teacher may view only their own Published Teacher Timetable and their own scheduling preferences, never another Teacher's or the Draft.
18. The generation engine must optimize for Teacher scheduling preferences, Subject scheduling preferences, and school-wide optimization settings wherever a Hard-Constraint-satisfying choice remains; a Soft Preference may be violated only when required to satisfy a Hard Constraint, or when no option better satisfies it.
19. The Timetable Quality Score is read-only and advisory — a lower score, or one or more reported Missing Lessons, never blocks Publishing. Publishing a Draft with Missing Lessons or a low score is the Administrator's own informed choice, not something this feature refuses.
20. Every generation run (initial or regeneration, whatever its scope) reports which required Lessons it could not schedule, rather than silently omitting them.
21. Exactly one Draft and exactly one Published Timetable Version may exist per school per Academic Year at any time; any number of Archived (superseded) versions accumulate as history.
22. Every Lesson write applies to the school's own current Draft Version for the relevant Academic Year; one is auto-created if none exists.
23. A Teacher's own hard unavailable-slots list (distinct from their soft avoid-periods preference) is configured as part of Teacher scheduling preferences and is the source of truth for Business Rule #10's Hard Constraint.
24. A regeneration, whatever its scope (whole, Class, Teacher, or Day), replaces only the non-Locked Lessons within that scope in the current Draft — Locked Lessons and Lessons outside the scope are left untouched.
25. Splitting a Lesson Group is a deliberate, confirmed, audited Administrator action; it converts both Lessons into ordinary independent Lessons, preserving all of their existing Teacher/Subject/Class/Day/Period information; a future regeneration may recreate a double period for that Teacher Subject Assignment unless the affected Lessons are Locked or the regeneration's own scope excludes them.
26. Publishing is a deliberate, confirmed, audited Administrator action: it validates the Draft, replaces the current Published Version with it, and Archives the version it replaces. Teachers and Students immediately begin using the new Published Version.
27. Printing and PDF export never re-implement Timetable business logic — both render exactly what the same read-only view queries already return, whether that view is reading the Draft or the Published Version.
28. Other modules (future Attendance Management, Exam Management, Teacher Daily Schedule, Student Daily Schedule) must consume this feature's data exclusively through its own published interfaces — never by querying the `lessons`/`timetable_versions`/`lesson_groups` tables directly, and must be built to read the Published Version, never the Draft, unless a future Business Review explicitly approves otherwise.
29. A school's Timetable data (Lessons, Versions, generation jobs, preferences, settings) belongs to exactly one school. A School Admin may never view or modify another school's data.
30. **(Weekly Subject Allocation Integration, Product Owner-approved)** A Teacher's total committed weekly periods — the sum of Weekly Subject Allocation's own `weeklyPeriods` across every one of that Teacher's own Active Teacher Subject Assignments, for the given Academic Year — must never exceed their own weekly capacity (Working Days × Teaching Periods, summed once per distinct Shift used by that Teacher's own Classes; a Teacher teaching across multiple Classes on the very same Shift is not double-counted, since Shifts never overlap in time within a school). Checked as a **generation pre-flight gate only** — before any Lesson is placed, not as a write-time check on Weekly Subject Allocation or Teacher Subject Assignment's own create/correct paths — because a Weekly Subject Allocation edit alone, with no Teacher Subject Assignment write at all, can make a Teacher's own total invalid; a generation run is blocked outright, naming every over-committed Teacher and their own committed-vs-capacity figures, until every one is corrected. **(Hard Constraint: "A Teacher's total weekly commitment must not exceed their own weekly capacity.")** Deliberately does not additionally subtract that Teacher's own recorded unavailable slots (Business Rule #10/#23) — that finer-grained, per-slot exclusion is already handled correctly by generation's own existing per-slot Hard Constraint at actual placement time; this rule only catches the unambiguous case of the full week being over-committed.

---

# Edge Cases

| Situation | Expected Behavior |
|---|---|
| Generation places a Lesson that would double-book a Teacher or Class | Never happens — a Hard Constraint; the engine excludes such a placement entirely rather than committing it, per Business Rules #6–#7. |
| Generation cannot find any valid slot for a required Lesson | Reported as a Missing Lesson in the job's result, never silently dropped, per Business Rule #20. |
| Generation is asked to place a double period but no two consecutive valid Periods exist | The Subject's own double-period preference is treated as unsatisfiable for that unit; the engine falls back to a single Lesson if the weekly target allows it, or reports it Missing — never places only half a group as if it were a full double period. |
| Administrator locks a Lesson, then regenerates the whole Timetable | The Locked Lesson is untouched; every other non-Locked Lesson in scope may be replaced, per Business Rule #24. |
| Administrator regenerates one Class while another Class has Locked Lessons | Only the targeted Class's own non-Locked Lessons are affected; Locked Lessons anywhere are never touched, and other Classes outside the scope are never touched either. |
| Administrator attempts to move or delete a Locked Lesson directly | Rejected — the Administrator must Unlock it first. |
| Administrator splits a Lesson Group | Both Lessons become independent; a confirmation is required first, and the action is recorded in the audit log, per Business Rule #25. |
| Administrator regenerates after a Split | The engine may recreate the double period for that Teacher Subject Assignment unless the resulting Lessons are Locked or the regeneration's scope excludes them, per Business Rule #25. |
| Administrator manually creates an individual Lesson that would exceed a Teacher Subject Assignment's own weekly target (from Weekly Subject Allocation) | Rejected, per Business Rule #8, exactly as generation itself would refuse to exceed it. |
| Administrator starts a generation run while one or more Teachers' own total committed weekly periods (across all their Classes) exceed their own weekly capacity | The run is blocked before any Lesson is placed — every over-committed Teacher is named, with their own committed-vs-capacity figures, per Business Rule #30. |
| Administrator starts a generation run while one or more Weekly Subject Allocations are Needs-Review (their saved figure no longer matches the Grade/Form's current calculated available periods) | The run is blocked before any Lesson is placed, naming the condition; every Needs-Review allocation must be reviewed and re-saved first. |
| Administrator publishes a Draft with reported Missing Lessons or a low Quality Score | Allowed — Publishing is never blocked by the score or by Missing Lessons, per Business Rule #19; the Administrator is choosing to publish an incomplete or imperfect Timetable knowingly. |
| Teacher requests their own Timetable while the Administrator has unpublished changes in the Draft | The Teacher sees only the current Published Version — the Draft's in-progress state is never visible to them, per Business Rule #17. |
| Administrator polls a generation job that is still Running | Returns current progress (lessons placed vs. total, current phase); not yet a final result. |
| A generation job's underlying process crashes mid-run | The job remains stuck at Running — Accepted Technical Debt for this version (no automatic recovery); a future enhancement may add one. |
| A School Admin attempts to view or modify another school's Timetable data | Rejected; tenant isolation is preserved, per Business Rule #29. |
| Teacher/Student attempts any write on this feature | Rejected; both roles are read-only or have no access, per Permissions. |

---

# Validation Rules

1. `teacherSubjectAssignmentId`, `dayOfWeek`, and `periodId` are all required to create a Lesson, whether by generation or manually.
2. `dayOfWeek` must be one of the seven `DayOfWeek` enum values already established by School Schedule Management.
3. The referenced Teacher Subject Assignment must exist, belong to the acting School Admin's own school, and be Active.
4. The referenced Period must exist, belong to the acting School Admin's own school (via its Shift), be Active, and be of type Teaching.
5. The referenced Period's own Shift must match the Class's own assigned Shift.
6. No two Active Lessons in the same Timetable Version may share the same (`teacherId`, `dayOfWeek`, `periodId`) combination.
7. No two Active Lessons in the same Timetable Version may share the same (`classId`, `dayOfWeek`, `periodId`) combination.
8. A Teacher Subject Assignment's own Active Lesson count, within one Timetable Version, may never exceed the `weeklyPeriods` figure Weekly Subject Allocation reports for its own Class/Subject/Academic-Year combination, when a matching allocation line exists.
9. A Lesson may not be created, moved, or deleted if its own Lesson is Locked, unless the request is itself an Unlock followed by the write.
10. Two Lessons in a Lesson Group must be on the same Day, for the same Teacher Subject Assignment, on the same Shift, in consecutive Periods (by that Shift's own active Period Display Order).
11. A Teacher's own unavailable slots (hard) must never match a slot a Lesson is being written into for that Teacher.
12. Cross-school references are rejected without exposing another school's configuration data.
13. A weekly period count, when provided on a Weekly Subject Allocation line item, must be a positive whole number (validated entirely within Weekly Subject Allocation's own feature — see its Business Specification — not re-validated here).
14. A generation request's own scope (`ALL`/`CLASS`/`TEACHER`/`DAY`) must name a valid Class/Teacher/Day belonging to the acting School Admin's own school, where applicable.
15. Publishing requires an existing Draft Version for the school + Academic Year; publishing an already-Published, unchanged Draft is a harmless no-op, not an error.
16. Before any Lesson is placed, a generation run must find zero Weekly Subject Allocations Needs-Review and zero Teachers over their own weekly capacity (Business Rule #30) for the target school + Academic Year — either condition blocks the entire run with a clear reason, before Step 1 of the generation engine even begins.

---

# Relationships

## School Schedule Management

Unchanged from v1.0 — every Lesson references a Period (and, transitively, a Shift and Working Day) that School Schedule Management alone owns and validates, consumed exclusively through its own published interface.

## Teacher Subject Assignment

Unchanged from v1.0 in shape — every Lesson references exactly one Teacher Subject Assignment. **New in this Architecture Change**: the generation engine reads each Assignment's own `weeklyLessonTarget` (ACR-006) as the authoritative "how many Lessons of this Subject does this Class need per week" input, and reads its own `SubjectSchedulePreference` (including `doublePeriodPreferred`) to decide whether to generate a Lesson Group for it.

## Class Management

Unchanged from v1.0 — reached only through Teacher Subject Assignment's own `classId`, additionally stored directly on Lesson for the Class-conflict database constraint.

## Academic Year Management

Unchanged from v1.0 — every Lesson (and now, every Timetable Version) is scoped to one Academic Year.

## Teacher Management, Subject Management

Unchanged from v1.0 — reached only through Teacher Subject Assignment, except `teacherId` stored directly on Lesson for the Teacher-conflict constraint.

## Attendance Management, Exam Management, Teacher Daily Schedule, Student Daily Schedule

All future consumers of this feature's own published interface — none exist yet. Any future consumer must read the Published Version, per Business Rule #28, never the Draft.

## Audit Logs

Every Lesson lifecycle action (create, move/swap, delete, restore, lock, unlock, split), every generation job (started, completed, failed), every Publish action, and every preference/settings change is recorded there.

---

# Reports

No dedicated Reports requirement in this version beyond Printing/PDF export of the three Timetable views (unchanged from v1.0).

---

# Printing and PDF Export

Unchanged from v1.0: Master Timetable, Class Timetable, and Teacher Timetable must each be printable and exportable as a PDF, reusing the exact same underlying view-generation logic the on-screen view uses (Draft or Published, per the requesting context), designed for a future bulk-export capability to reuse.

---

# Notifications

No notification requirement is approved in this version.

Possible future notification scenarios requiring Business Review:
- Notify a Teacher when the Published Timetable changes.
- Notify School Admin when a generation job completes, or fails, or reports Missing Lessons.
- Notify School Admin when a Teacher Subject Assignment nears or reaches its own weekly Lesson target.

---

# Audit Requirements

The following events must be recorded:

- Lesson created (generation or manual)
- Lesson updated (move/swap)
- Lesson deleted (archived)
- Lesson restored (reactivated)
- Lesson locked / unlocked
- Lesson Group split
- Generation job started / completed / failed, per scope (all/Class/Teacher/Day)
- Timetable Version published
- Teacher scheduling preference created/updated
- Subject (Teacher Subject Assignment) scheduling preference created/updated
- School optimization settings updated

Audit records include the acting user, school, timestamp, and relevant previous/new values where applicable.

---

# Out-of-Scope Items

The following are not part of this feature unless explicitly approved later:

- Term/Semester as a distinct scheduling scope — deferred, per Architecture Position; generation and Publishing remain scoped to a full Academic Year in this version.
- Date-specific overrides to a Lesson's recurring weekly slot — the whole Timetable remains a recurring weekly pattern.
- Room/classroom assignment — no Room entity exists anywhere in this project.
- Per-Lesson (partial) Publishing — Publishing is a single school-wide Draft/Published toggle per Academic Year in this version, not a per-Class or per-Lesson granular state.
- A background job queue/worker infrastructure — generation jobs run as an in-process async task backed by a database status row; recovering a job stuck after a process crash is not built in this pass.
- A real constraint-solver library or algorithm-as-a-service — the generation engine is a pragmatic, deterministic-enough heuristic (most-constrained-first placement with preference scoring), not a formal CSP/SAT solver.
- Attendance, Exam scheduling, Grade Book, or Report Card generation — all future, separate features.
- A dedicated Student-facing Timetable view.
- Bulk PDF export (exporting every view at once).
- A richer, weighted Timetable Quality Score once real optimizer weights are approved by the Product Owner — this version's own score remains explicitly illustrative.

---

# Acceptance Criteria

- The Architecture Change's purpose and boundaries are clear, and the reversal from v1.0's manual-first design is explicit, not silently blended with the old framing.
- Actors and expected permissions are identified for the new Generate/Review/Adjust/Publish workflow.
- Functional and non-functional requirements are documented at business level only.
- Known edge cases are listed, including generation-specific and Lock/Split/Publish-specific ones.
- Dependencies on existing Accepted modules are identified without designing their internals.
- No database design, API design, implementation plan, code, or commit has been produced in this phase (this document alone).

---

# Future Enhancements

Potential later enhancements, not approved for this scope:

- Term-scoped generation and Publishing.
- A recoverable/resumable generation job mechanism (surviving a process crash), possibly backed by real queue infrastructure if this project ever adopts one.
- Per-Class or per-Lesson granular Publishing, if a real need for partial rollout emerges.
- Room/classroom assignment, integrated into the generator's own constraint set.
- Date-specific Lesson overrides, layered on top of this version's recurring weekly architecture.
- Bulk PDF export across every Class/Teacher at once.
- A dedicated Teacher-workload / subject-distribution analytics report.
- A richer, weighted Timetable Quality Score once real optimizer weights are approved.
- Automatic recovery/notification for a Teacher availability conflict introduced after generation (e.g. a Teacher's own preferences change after Publish).

---

# Change History

- v1.0 — Initial Business Discovery, Specification, and Review, produced in one autonomous pass per the Product Owner's explicit one-time phase-gate waiver for this feature. Established Lesson as the single source of truth; manual, cell-by-cell Lesson creation as the primary (and only) workflow; Teacher/Class conflict prevention and Break Period protection as Hard Validation; Teacher/Subject scheduling preferences and school optimization settings modeled as pure, unused data for a future auto-generation feature; explicitly **out of scope**: "Automatic timetable generation or optimization of any kind."
- v2.0 — **Architecture Change (Generation-First), Approved by the Product Owner**, explicitly reversing v1.0's manual-first design: "That approach is no longer acceptable. Schools should not be expected to manually create hundreds or thousands of timetable entries." The Timetable must be generated automatically; the Administrator configures data, generates, reviews, adjusts, and publishes. Manual, individual Lesson creation is retained only as an advanced/override action. New concepts introduced: a real generation engine (Business Rules #1–#20 restated as the engine's own Hard Constraints, Soft Preferences read from existing Teacher/Subject/School preference data, a structured Quality Score as a generation output); background-job execution (Product Owner's explicit choice, over a synchronous request, given a real school's generation could take meaningfully longer than a single HTTP round trip); Lesson Groups for double periods (two ordinary linked Lesson rows, Product Owner's explicit choice, over a new spanning-Lesson concept, to preserve the existing one-Lesson-per-Period data model) with a dedicated, audited Split override; Locking (a Hard Constraint protecting manually-placed or manually-adjusted Lessons from regeneration); Draft/Published Timetable Versioning (Product Owner's explicit choice of a single school-wide toggle per Academic Year, over per-Lesson granularity, for this version). Three scope decisions were confirmed by the Product Owner before this rewrite began, each recorded as its own Out-of-Scope Item rather than silently assumed: Terms remain deferred (generate per Academic Year); no background job queue/worker infrastructure is introduced (simplest mechanism that fits this project's current single-process architecture); Publishing is school-wide, not per-Lesson. This version's status line and every section below have been rewritten to reflect the new architecture as the feature's own current, approved design — no obsolete manual-first framing is retained as though it were still primary.
- v2.1 — Forward reference only (see ACR-008 and `docs/03-business/Weekly-Subject-Allocation.md`, Business Discovery, not yet approved) — recorded so this document is not silently out of date once that feature is Accepted. No Business Rule or Functional Requirement changed in this revision.
- v2.2 — **Weekly Subject Allocation Integration, implemented.** Business Rule #8 rewritten: the generation engine's and manual Lesson creation's own weekly-target check now reads Weekly Subject Allocation's own per-Grade/Form, per-Subject `weeklyPeriods` line item instead of the now-removed `TeacherSubjectAssignment.weeklyLessonTarget` (ACR-006); an Assignment with no matching allocation line requires zero Lessons, never a silent default of one — the same "missing line means zero units" reading Weekly Subject Allocation's own Business Review already established. Double Period preference is likewise now read from Weekly Subject Allocation's own `doublePeriodRequired` per-line flag, replacing the now-removed `SubjectSchedulePreference.doublePeriodPreferred`. **New Business Rule #30 (Product Owner-approved), raised directly by the Product Owner during implementation discussion**: a Teacher's total committed weekly periods (summed across every one of their own Active Teacher Subject Assignments, via Weekly Subject Allocation) must never exceed their own weekly capacity (Working Days × Teaching Periods, summed once per distinct Shift their own Classes use) — concretely, the scenario the Product Owner posed was a Teacher teaching Math for one Class and Physics for several others, whose combined per-Subject weekly period commitments could silently add up to more periods than the Teacher's own week actually has. Resolved as a **generation pre-flight gate, blocking with a named reason** (the Product Owner's own explicit choice — "block and tell the reason" — over silently warning or allowing an over-committed run), enforced only at generation time, never as a write-time check on Weekly Subject Allocation's or Teacher Subject Assignment's own create/correct paths, since a Weekly Subject Allocation edit alone can invalidate a Teacher's total with no Teacher Subject Assignment write occurring at all — no write-time gate on either side could ever be fully reliable by itself. A second, related pre-flight gate (not a new Business Rule of its own, an application of the already-existing "Needs-Review" concept from Weekly Subject Allocation's own Business Specification) likewise blocks generation whenever any allocation for the target school/Academic Year is Needs-Review — see Validation Rule #16. Validation Rule #8 and #13 updated to match; a new Validation Rule #16 added for both pre-flight gates; two new Edge Cases rows added.
