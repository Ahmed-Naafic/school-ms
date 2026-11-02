# Teacher Subject Assignment

Version: 1.5

Status:
- Business Discovery complete. All 25 Architecture Questions have been resolved by the Product Owner; approved decisions are incorporated throughout this document.
- **Phase 2 (Business Review) complete — Approved.** Two refining questions raised during review (Section requirement once a Class has active Sections; one-way assignment ending) resolved by the Product Owner and incorporated as Business Rules #23–#24.
- Approved for Phase 3 (Technical Design).
- Not approved for Implementation.
- **Amended by ACR-006, now superseded and removed.** This feature's own Assignment entity briefly gained an optional `weeklyLessonTarget` for Timetable Management; that field has since been formally removed (see v1.5 below) — Timetable Management now reads its own weekly period requirement from Weekly Subject Allocation instead. This feature's own `registerDownstreamRecordCheck` extension point's first real consumer (Timetable Management) remains in place unchanged. This feature's own Feature Acceptance is not reopened.
- **Weekly Subject Allocation Integration, implemented (v1.5).** As ACR-008 and `docs/03-business/Weekly-Subject-Allocation.md` (Approved) named: `weeklyLessonTarget` (ACR-006) is gone, and this feature no longer stores any weekly lesson count of its own. This feature also gained one small, additive, read-only capability of its own for the same integration — see v1.5 in Change History.

---

# Purpose

Teacher Subject Assignment defines which Teacher is responsible for teaching which Subject to which Class (and, optionally, which Section within it) during a specific Academic Year.

The system already has the required foundation records:

- School, owned by School & Platform Management
- Academic Year, owned by Academic Year Management
- Teacher, owned by Teacher Management
- Subject and Subject-to-School assignment, owned by Subject Management
- Class and Section, owned by Class Management

This feature connects those existing records into a school-owned academic assignment so later operational features can know who teaches what, to whom, and in which Academic Year.

Without this feature, future Timetable, Attendance, Exam, Grade Book, and Report Card workflows would each need to invent their own Teacher-Subject-Class relationship. This feature exists to make that relationship explicit once, under School Admin control, while preserving the existing ownership boundaries of the source records.

---

# Feature Overview

A School Admin assigns one Teacher to teach one Subject to one Class — optionally, one Section within it — for one Academic Year, within their own school.

At minimum, an assignment identifies:

- Teacher
- Subject
- Class
- Section (required when the Class has one or more active Sections; must be absent when the Class has none — mirroring Student Management's own Enrollment precedent, Business Rule #23)
- Academic Year
- effectiveStartDate (required)
- effectiveEndDate (nullable — an assignment with no end date is Active; once set, it may never be cleared back to unset, Business Rule #24)

Exactly one Active assignment may exist for a given School + Academic Year + Class + Section (or its absence, for a Class with no Sections) + Subject combination at a time. This is the sole per-scope uniqueness rule; co-teaching — more than one concurrent Teacher on the same combination — is explicitly deferred, not supported in this version.

A Teacher may be assigned to multiple Subjects, Classes, and Sections within the same Academic Year. This feature does not validate or limit teaching workload; that belongs to the future Timetable feature.

Assignments are intended to be historical. An assignment made for one Academic Year remains visible as part of that year's academic record even if the Teacher later resigns, the Subject is archived, the Class or Section is archived, or a future Academic Year uses a different teaching allocation. Teacher, Subject, Class, Section, and Academic Year are immutable on an assignment once created — changing any of them requires ending the current assignment and creating a new one (either through the ordinary lifecycle, or the dedicated Replace Teacher workflow when only the Teacher changes). Only an assignment's dates and end reason may ever be corrected in place.

---

# Business Goals

1. Give School Admin a clear way to record teaching responsibility for a Subject, Class, and Academic Year.
2. Reuse existing accepted features instead of duplicating Teacher, Subject, Class, or Academic Year data.
3. Preserve historical teaching assignments by Academic Year.
4. Prepare a stable business foundation for future Timetable, Attendance, Exam, Grade Book, and Report Card features.
5. Protect tenant isolation: a School Admin may assign only Teachers, Subjects, Classes, Sections, and Academic Years that belong or are assigned to their own school.
6. Avoid placing scheduling, attendance-taking, exam ownership, or grading workflows inside this feature.
7. Support a controlled Replace Teacher workflow and selective cross-Academic-Year copying, without inventing ad hoc versions of either elsewhere.

---

# Actors

## School Admin

The primary actor. Manages Teacher Subject Assignments for their own school only.

## Teacher

Read-only self-service consumer. May view their own assigned Subjects, Classes, Sections, and Academic Years. May not create, update, end, replace, or copy assignments.

## Super Admin

No operational role. Super Admin manages platform-level data such as Schools and platform-wide Subjects, but does not perform day-to-day school operations.

## Student

No direct management role. A Student may later consume assignment data indirectly through Timetable, Attendance, Exams, or Report Cards.

## Accountant

No role in this feature.

---

# User Stories

1. As a School Admin, I want to assign a Teacher to teach a Subject for a Class (or a specific Section) in an Academic Year, so the school knows who is responsible for that teaching allocation.
2. As a School Admin, I want to see all Teacher Subject Assignments for an Academic Year, so I can review the school's teaching allocation.
3. As a School Admin, I want to filter assignments by Teacher, Subject, Class, and Section, so I can quickly find the relevant records.
4. As a School Admin, I want to end an assignment when teaching responsibility changes, so the school can keep the current allocation accurate without losing history.
5. As a School Admin, I want to copy assignments from a previous Academic Year selectively, so annual setup can be faster without accidentally carrying forward outdated or now-invalid responsibilities.
6. As a Teacher, I want to view my own assigned Subjects, Classes, and Sections for an Academic Year, so I know my teaching responsibilities.
7. As a School Admin, I want to replace a Teacher on an existing assignment through a dedicated workflow, so the change is recorded clearly without losing the original assignment's history.
8. As future Timetable, Attendance, Exam, and Grade Book features, the system needs a reliable source of Teacher-Subject-Class-Academic-Year responsibility.

---

# Functional Requirements

1. The system must allow School Admin to create a Teacher Subject Assignment within their own school.
2. The system must allow School Admin to view Teacher Subject Assignments within their own school.
3. The system must allow assignment lists to be filtered by Academic Year.
4. The system must support filtering by Teacher, Subject, Class, and Section.
5. The system must validate that the selected Teacher belongs to the School Admin's school and is ACTIVE — no other employment status is eligible for a new assignment.
6. The system must validate that the selected Subject is ACTIVE and assigned to the School Admin's school through Subject Management.
7. The system must validate that the selected Class belongs to the School Admin's school and is ACTIVE (not Archived).
8. The system must validate that, when a Section is specified, it belongs to the selected Class, belongs to the School Admin's school, and is ACTIVE (not Archived). The system must require a Section whenever the selected Class has one or more active Sections, and must reject a Section being specified when the selected Class has none (Business Rule #23).
9. The system must validate that the selected Academic Year belongs to the School Admin's school and is not Archived. Current, future, and past non-Archived Academic Years are all eligible.
10. The system must default the Academic Year selector to the school's Current Academic Year, while allowing selection of any other non-Archived Academic Year belonging to the school.
11. The system must enforce exactly one Active assignment per School + Academic Year + Class + Section (or its absence) + Subject combination; a new assignment overlapping an existing Active one on that exact combination must be rejected.
12. The system must require an effectiveStartDate on every assignment, and accept an optional effectiveEndDate; both dates must fall within the selected Academic Year's own date range.
13. The system must derive assignment status from its dates: Active when effectiveEndDate is unset, Ended once effectiveEndDate is set — status is never stored as an independent field.
14. The system must preserve historical assignments after they are created; Teacher, Subject, Class, Section, and Academic Year are immutable on an assignment once created.
15. The system must support correcting only an assignment's dates and an optional end reason after creation; any other change requires ending the assignment and creating a new one. Once effectiveEndDate is set, it may never be cleared back to unset — ending an assignment is one-way (Business Rule #24).
16. The system must provide a dedicated Replace Teacher workflow that ends the current assignment (recording an end reason) and creates a new assignment with the replacement Teacher, preserving the ended assignment's own history.
17. The system must support selective copying of assignments from one Academic Year to another, on a best-effort basis: each candidate assignment is independently validated using the same rules as new assignment creation; valid assignments are copied, invalid ones are skipped, and a detailed per-assignment summary (copied vs. skipped, with a reason per skip) is returned to the caller.
18. The system must allow Teacher self-service, read-only access to a Teacher's own assignments (their own Subjects, Classes, Sections, and Academic Years) — no write access.
19. The system must register a dependency-validation check with Subject Management's existing extension point, blocking removal of a Subject-to-School assignment while an active Teacher Subject Assignment references it.
20. The system must expose assignment data to future modules (Timetable, Attendance, Exam, Grade Book, Report Card) through this feature's own narrow, read-only interface; each future module consumes it independently — this feature does not act as, and does not require, a single broker module for the others.
21. Archiving a Class, Section, or Academic Year must never be blocked by this feature, even while active Teacher Subject Assignments reference it — archiving only prevents that Class, Section, or Academic Year from being selected in a new assignment or replacement afterward, consistent with Class Management's and Academic Year Management's own existing archival behavior.
22. Creating an assignment for a past, non-Archived Academic Year that already has downstream academic records (Attendance, Exams, Grade Book, Report Cards, once those features exist) referencing the same Academic Year/Class/Subject combination must require an explicit reason and must be fully audited; if no such downstream records exist yet, creation is a normal operation requiring no special justification.

---

# Non-Functional Requirements

1. Tenant isolation is mandatory. A School Admin must never assign or view records belonging to another school.
2. All business validation must be enforced on the backend.
3. Assignment writes must be auditable.
4. The feature must preserve historical data and follow Archive Before Delete.
5. List views should support pagination and filtering, consistent with API standards.
6. The feature must avoid duplicating Teacher, Subject, Class, Section, Academic Year, or School data.
7. The feature must be designed for future consumption by Timetable, Attendance, Exam, Grade Book, and Report Card modules, each independently.
8. The feature must remain consistent with existing role boundaries: School Admin operates within a school; Super Admin does not manage day-to-day assignments.
9. A copy operation must validate and act on each candidate assignment independently — a failure or rejection on one candidate must never corrupt, block, or partially commit another candidate in the same operation.

---

# Permissions

## School Admin

- May create Teacher Subject Assignments within their own school.
- May view Teacher Subject Assignments within their own school.
- May correct an assignment's dates and end reason within their own school.
- May end an assignment within their own school.
- May replace a Teacher on an assignment, within their own school, via the dedicated Replace Teacher workflow.
- May selectively copy assignments from one Academic Year to another, within their own school.
- May not assign a Teacher, Subject, Class, Section, or Academic Year outside their own school.
- May not change a created assignment's Teacher (other than through the Replace Teacher workflow), Subject, Class, Section, or Academic Year.

## Teacher

- May view their own assignments (Subjects, Classes, Sections, Academic Years) — read-only.
- May not create, update, end, replace, or copy assignments.
- May not view another Teacher's assignments.

## Super Admin

- No expected operational permission for this feature.
- May not create, update, end, replace, copy, or delete Teacher Subject Assignments.

## Student and Accountant

- No permissions in this feature.

---

# Business Lifecycle

## 1. Assignment Creation

School Admin selects an Academic Year (defaulting to the school's Current Academic Year, though any non-Archived Academic Year belonging to the school may be chosen instead), a Class, a Subject, and an ACTIVE Teacher, then provides an effectiveStartDate (required) and an optional effectiveEndDate, both falling within the selected Academic Year's own date range. A Section within the Class must also be selected if the Class has one or more active Sections, and must be left unspecified if it has none (Business Rule #23). The request is rejected if any selected record fails its own eligibility check (Teacher not ACTIVE; Subject not ACTIVE or not assigned to the school; Class or Section not ACTIVE; Academic Year Archived or belonging to another school) or if an Active assignment already exists for the same School + Academic Year + Class + Section + Subject combination.

## 2. Active Assignment Use

An assignment with no effectiveEndDate is Active. It represents the current teaching responsibility for its Academic Year/Class/Section/Subject combination, and is the one and only Active assignment for that exact combination.

## 3. Assignment Correction

School Admin may correct only an assignment's effectiveStartDate, effectiveEndDate, or end reason after creation. Teacher, Subject, Class, Section, and Academic Year are immutable — any other change requires ending the assignment and creating a new one. Once effectiveEndDate is set, it may be corrected to a different date but never cleared back to unset (Business Rule #24) — an Ended assignment stays Ended.

## 4. Assignment Ending

School Admin may set an effectiveEndDate (with an optional end reason) on an Active assignment, which derives its status to Ended. Ending an assignment is not a deletion — the record and its history remain visible. This transition is one-way: an Ended assignment can never be made Active again (Business Rule #24). If teaching responsibility for that scope genuinely continues, School Admin creates a new assignment, or uses the Replace Teacher workflow when only the Teacher changes.

## 5. Teacher Replacement

School Admin uses the dedicated Replace Teacher workflow to end the current assignment (recording an end reason) and create a new assignment for the same Subject/Class/Section/Academic Year with a new Teacher, in one action. This preserves the original assignment's own history rather than mutating its Teacher in place.

## 6. Academic Year Transition

Assignments are scoped to exactly one Academic Year and are never automatically carried forward. School Admin may selectively copy assignments from one Academic Year into another: each candidate assignment is validated exactly as a new assignment would be (ACTIVE Teacher; ACTIVE Subject, Class, and Section; no duplicate on the target Academic Year), valid ones are copied, invalid ones are skipped, and a summary of what copied versus what was skipped — and why — is returned.

## 7. Archival Interaction

Removing a Subject-to-School assignment is blocked while an active Teacher Subject Assignment references it (via Subject Management's dependency-validation extension point). Archiving a Class, Section, or Academic Year is never blocked by this feature — archiving proceeds, and existing Teacher Subject Assignments referencing the now-Archived record remain visible as history; only a new assignment or replacement against that Archived Class, Section, or Academic Year is rejected afterward.

---

# Business Rules

1. Only School Admin may manage Teacher Subject Assignments for their own school; Teacher has read-only self-service access to their own assignments only.
2. A Teacher Subject Assignment belongs to exactly one school.
3. A Teacher Subject Assignment must reference one Academic Year, one Teacher, one Subject, and one Class, and — when that Class has one or more active Sections — exactly one Section within it (Business Rule #23, added by Business Review).
4. Exactly one Active assignment may exist per School + Academic Year + Class + Section (or its absence) + Subject combination. Co-teaching (more than one concurrent Active Teacher on the same combination) is not supported in this version.
5. A Teacher may be assigned to multiple Subjects, Classes, and Sections within the same Academic Year; this feature does not validate or limit teaching workload — that belongs to the future Timetable feature.
6. Teacher subject specializations recorded by Teacher Management are descriptive only; they are never enforced as an eligibility rule for assignment.
7. Only a Teacher whose employment status is ACTIVE may receive a new assignment.
8. A Teacher's employment status change (e.g., Resigned, On Leave, Terminated, Retired) never automatically modifies an existing assignment; historical and currently Active assignments remain exactly as they were. Ending or replacing an assignment in response to a status change is always a separate, explicit School Admin action.
9. Teacher replacement is performed only through the dedicated Replace Teacher workflow: it ends the existing assignment (recording an end reason) and creates a new assignment with the replacement Teacher for the same Subject/Class/Section/Academic Year, preserving the original assignment's history.
10. Every assignment requires an effectiveStartDate; effectiveEndDate is optional. Both dates must fall within the referenced Academic Year's own start/end dates. Assignment status (Active/Ended) is always derived from whether effectiveEndDate is set — it is never stored as an independent field. An optional endReason may be recorded when an assignment is ended.
11. Teacher, Subject, Class, Section, and Academic Year are immutable on an assignment once created. Only effectiveStartDate, effectiveEndDate, and endReason may be corrected after creation — except that effectiveEndDate, once set, may never be cleared back to unset (Business Rule #24, added by Business Review); any other change requires ending the assignment and creating a new one (or using the Replace Teacher workflow when only the Teacher changes).
12. School Admin may selectively copy assignments from one Academic Year to another, within their own school.
13. Copying is best-effort: each candidate assignment is validated independently using the same rules as new assignment creation; valid assignments are copied, invalid ones are skipped, and a detailed summary (copied vs. skipped, with a reason per skip) is returned. No partial or corrupted assignment is ever created.
14. Creating an assignment — directly, or via copy — requires the Subject to be ACTIVE and currently assigned to the school through Subject Management.
15. Creating an assignment — directly, or via copy — requires the Class to be ACTIVE, and the Section (if any) to be ACTIVE and belong to that Class; an Archived Class or Section is never a valid target for a new assignment.
16. The Academic Year selector defaults to the school's Current Academic Year but allows selection of any other non-Archived Academic Year belonging to the school; assignments may be created for the Current, a future, or a past non-Archived Academic Year.
17. Creating an assignment for a past non-Archived Academic Year that already has downstream academic records (Attendance, Exams, Grade Book, Report Cards, once those features exist) referencing the same Academic Year/Class/Subject combination requires an explicit reason and is fully audited; if no such downstream record exists, creation is a normal operation requiring no special justification.
18. Archiving a Class, Section, or Academic Year is never blocked by this feature, even while active Teacher Subject Assignments reference it. Archiving only prevents that Class, Section, or Academic Year from being selected for a new assignment or replacement afterward — existing assignments remain visible as history, consistent with Class Management's and Academic Year Management's own existing archival behavior.
19. Removing a Subject's assignment from a School is blocked by Subject Management's dependency-validation extension point while an active Teacher Subject Assignment references that Subject-to-School assignment.
20. This feature must not create, edit, archive, or reactivate Teachers, Subjects, Classes, Sections, Schools, or Academic Years — it only references records owned by those features.
21. Future Timetable, Attendance, Exam, Grade Book, and Report Card modules must each consume this feature through its own narrow, read-only interface, independently — no future module acts as a broker for the others.
22. Every meaningful assignment lifecycle event (creation, correction, ending, replacement, copy) must be audited; assignment history must be preserved — hard deletion is never supported.
23. **(Business Review)** A Teacher Subject Assignment for a Class with one or more active Sections must specify a Section; for a Class with no active Sections, no Section may be specified. This mirrors Student Management's own Business Rule #18 for Enrollment exactly, and applies identically to direct creation, the Replace Teacher workflow, and copying between Academic Years — a whole-Class assignment (no Section) and a Section-specific assignment for the same Subject/Academic Year can therefore never coexist ambiguously, since a Class with active Sections never permits the whole-Class form at all.
24. **(Business Review)** Once an assignment's effectiveEndDate is set, it may never be cleared back to unset — ending an assignment is a one-way transition. effectiveEndDate and endReason may still be corrected to different values while the assignment remains Ended, but an Ended assignment can never become Active again. If teaching responsibility for that scope genuinely continues, School Admin creates a new assignment, or uses the Replace Teacher workflow when only the Teacher changes.

---

# Edge Cases

| Situation | Expected Behavior |
|---|---|
| School Admin assigns a Teacher from another school | Rejected; tenant isolation is preserved. |
| School Admin assigns a Subject not assigned to their school, or not ACTIVE | Rejected, per Business Rule #14. |
| School Admin assigns a Class or Section from another school | Rejected; tenant isolation is preserved. |
| School Admin assigns an Academic Year from another school | Rejected; tenant isolation is preserved. |
| School Admin assigns a Teacher to an Archived Academic Year | Rejected for new assignment, per Business Rule #16. |
| School Admin assigns a Teacher who is Resigned, Terminated, Retired, or On Leave | Rejected; only ACTIVE Teachers are eligible for new assignment, per Business Rule #7. |
| School Admin assigns an Archived Subject, even if already assigned to the school | Rejected; the Subject must be ACTIVE, per Business Rule #14. |
| School Admin assigns an Archived Class or Section | Rejected, per Business Rule #15. |
| School Admin attempts a second Active assignment for the same School + Academic Year + Class + Section + Subject combination | Rejected, per Business Rule #4 — co-teaching is not supported in this version. |
| One Teacher is assigned to several Subjects or Classes in the same Academic Year | Allowed; workload is not validated by this feature, per Business Rule #5. |
| School Admin replaces one Teacher with another mid-year | The existing assignment is ended (with an end reason) and a new assignment is created for the replacement Teacher, via the Replace Teacher workflow, per Business Rule #9. |
| School Admin wants assignments from a previous Academic Year reused | Supported via selective copy; each candidate assignment is independently validated, invalid ones are skipped, and a summary is returned, per Business Rules #12–13. |
| A Teacher resigns after being assigned | The existing assignment(s) remain unchanged; School Admin must explicitly end or replace them if desired, per Business Rule #8. |
| A Subject assignment is removed from the school while active Teacher Subject Assignments reference it | Rejected by this feature's own dependency-validation check, per Business Rule #19. |
| A Class or Section is archived while Teacher Subject Assignments reference it | Archiving proceeds; historical and currently Active assignments remain visible, but no new assignment or replacement may target that Class/Section afterward, per Business Rule #18. |
| An Academic Year is archived while Teacher Subject Assignments reference it | Archiving proceeds; historical assignments remain visible, but no new assignment may target that Academic Year afterward, per Business Rule #18. |
| School Admin creates an assignment for a past non-Archived Academic Year with no downstream academic records yet | Treated as a normal operation, per Business Rule #17. |
| School Admin creates an assignment for a past non-Archived Academic Year that already has downstream academic records referencing the same Academic Year/Class/Subject combination | Requires an explicit reason and is fully audited, per Business Rule #17. |
| School Admin attempts to change an existing assignment's Teacher, Subject, Class, Section, or Academic Year directly | Rejected; only dates and end reason may be corrected in place — any other change requires ending the assignment and creating a new one, or the Replace Teacher workflow, per Business Rule #11. |
| A Teacher attempts to view another Teacher's assignments | Rejected; Teacher self-service is scoped to their own assignments only. |
| School Admin attempts a whole-Class assignment (no Section) for a Class that has one or more active Sections | Rejected; a Section is required once the Class has any active Sections, per Business Rule #23. |
| School Admin attempts a Section-specific assignment for a Class that has no Sections at all | Rejected; no Section may be specified when the Class has none, per Business Rule #23. |
| School Admin attempts to clear an Ended assignment's effectiveEndDate to make it Active again | Rejected; ending is one-way — a new assignment (or the Replace Teacher workflow) must be used instead, per Business Rule #24. |

---

# Validation Rules

1. Assignment creation requires Teacher, Subject, Class, Academic Year, and effectiveStartDate; Section and effectiveEndDate are optional.
2. The Teacher must belong to the acting School Admin's school and must be ACTIVE.
3. The Subject must be ACTIVE and assigned to the acting School Admin's school.
4. The Class must belong to the acting School Admin's school and must be ACTIVE.
5. A Section is required whenever the selected Class has one or more active Sections, and must be absent (unset) whenever the selected Class has none. When specified, it must belong to the selected Class, belong to the acting School Admin's school, and must be ACTIVE (Business Rule #23).
6. The Academic Year must belong to the acting School Admin's school and must not be Archived.
7. effectiveStartDate and effectiveEndDate (if provided) must both fall within the selected Academic Year's own start/end dates; effectiveEndDate, if provided, must not precede effectiveStartDate.
8. No more than one Active assignment may exist for the same School + Academic Year + Class + Section (or its absence) + Subject combination.
9. Cross-school references must be rejected without exposing another school's data.
10. Only effectiveStartDate, effectiveEndDate, and endReason may be modified on an existing assignment; any other field change is rejected and must instead go through ending the assignment and creating a new one, or the Replace Teacher workflow. effectiveEndDate, once set, may never be modified back to unset (Business Rule #24).
11. A copy operation validates each candidate assignment independently, using Validation Rules #2–#9 above; invalid candidates are skipped, not rejected as a whole batch.
12. Creating an assignment for a past non-Archived Academic Year with existing downstream academic records referencing the same Academic Year/Class/Subject combination requires a non-empty reason.

---

# Relationships

## School & Platform Management

Every assignment belongs to a school created and managed by School & Platform Management. School Admin may only act within their own school.

## Academic Year Management

Assignments are scoped to a specific, non-Archived Academic Year owned by the same school. The Academic Year selector defaults to the school's Current Academic Year, resolved through Academic Year Management's own narrow interface, but any other non-Archived Academic Year belonging to the school may be explicitly selected instead. Archiving an Academic Year is never blocked by this feature; it only prevents that Academic Year from being selected for a new assignment afterward.

## Teacher Management

Assignments reference Teachers owned by Teacher Management; only a Teacher whose employment status is ACTIVE is eligible for a new assignment, checked through Teacher Management's own narrow interface. Teacher Management remains the source of truth for Teacher profile and employment status. This feature must not modify Teacher employment status or account status, and never enforces Teacher subject specializations as an assignment eligibility rule.

## Subject Management

Assignments reference Subjects made available to a school through Subject Management's own Subject-to-School assignment; only an ACTIVE Subject assigned to the school is eligible. This feature registers a checker against Subject Management's dependency-validation extension point, blocking removal of a Subject-to-School assignment while an active Teacher Subject Assignment references it. This feature must not create, edit, archive, reactivate, assign, or remove Subjects itself.

## Class Management

Assignments reference Classes, and optionally Sections within them, owned by Class Management; only an ACTIVE Class (and an ACTIVE Section, if specified) is eligible for a new assignment. Archiving a Class or Section is never blocked by this feature; it only prevents that Class or Section from being selected for a new assignment or replacement afterward.

## Timetable

Future Timetable work is expected to consume Teacher Subject Assignments, independently through this feature's own narrow interface, to schedule teaching periods and to validate teaching workload — which this feature deliberately does not validate itself. This feature should not create timetable periods, time slots, rooms, or schedule conflict rules.

## Attendance Management

Future Attendance work may use assignments, independently through this feature's own narrow interface, to determine which Teacher may record or view attendance for a Class/Subject. This feature should not define Attendance permissions beyond exposing the assignment relationship.

## Exam Management and Grade Book

Future Exam and Grade Book features may use assignments, independently through this feature's own narrow interface, to determine responsible Teachers for exams, marks, and grading. This feature should not define exam creation, mark entry, grading, or report-card workflows.

## Audit Logs

Every assignment lifecycle event should be recorded for audit purposes. Audit review/search remains owned by the future Audit Logs feature.

---

# Reports

Deferred to a future phase, per Product Owner decision. This version exposes only the plain assignment list/filter views already defined in the Functional Requirements (by Academic Year, Teacher, Subject, Class, Section). Teacher workload analysis and unassigned-Subject/Class summaries are tracked under Future Enhancements, to be addressed by the future Reports feature or a later enhancement to this one.

---

# Notifications

No notification requirement is approved in this discovery draft.

Possible future notification scenarios requiring Business Review:

- Notify a Teacher when assigned to a Subject/Class.
- Notify a Teacher when replaced or removed from an assignment.
- Notify School Admin when a Teacher's employment status affects an active assignment.

---

# Audit Requirements

The following events must be recorded:

- Teacher Subject Assignment created
- Teacher Subject Assignment corrected (dates and/or end reason)
- Teacher Subject Assignment ended
- Teacher replaced (via the Replace Teacher workflow)
- Assignments copied from one Academic Year to another (recorded once per copy operation, including a summary of copied vs. skipped assignments and the reason for each skip)

Audit records include the acting user, school, Academic Year, Teacher, Subject, Class, Section (if any), timestamp, and relevant previous/new values where applicable.

---

# Out-of-Scope Items

The following are not part of this feature unless explicitly approved later:

- Creating or managing Teachers, Subjects, Classes, Sections, or Academic Years.
- Assigning Subjects to Schools.
- Co-teaching — more than one concurrent Active Teacher for the same School + Academic Year + Class + Section + Subject combination.
- Teaching workload validation or limits (belongs to future Timetable).
- Building Timetable schedules, periods, rooms, or conflict detection.
- Recording Attendance.
- Creating Exams.
- Entering marks or grades.
- Producing Report Cards.
- Payroll, teacher workload compensation, or teaching-load limits.
- Student enrollment into Subjects.
- Parent or Student-facing subject assignment views.
- Automatic assignment based on Teacher subject specializations (descriptive only, per Business Rule #6).
- Automatic copying of all assignments into a new Academic Year — copying is always selective and School-Admin-initiated, per Business Rule #12.
- Hard deletion of assignment history.
- Summary or workload reports (deferred — see Reports section).

---

# Architecture Questions — Resolved

All 25 Architecture Questions raised during Business Discovery have been answered by the Product Owner (Questions 1–19 in the first round, Questions 20–25 in this round). They are recorded here for traceability; the resolved decisions themselves are incorporated throughout this document (Business Rules, Functional Requirements, Business Lifecycle, Edge Cases, Validation Rules, and Relationships above).

1. Teacher Subject Assignment is a standalone module.
2. Assignments support optional Sections (whole-Class or a specific Section).
3. Exactly one Active assignment per School + Academic Year + Class + Section (or its absence) + Subject; co-teaching deferred.
4. A Teacher may teach multiple Subjects, Classes, and Sections; workload validation belongs to Timetable.
5. Teacher subject specializations are descriptive only, never enforced.
6. Only ACTIVE Teachers are eligible for a new assignment.
7. Employment status changes never automatically modify existing assignments.
8. Teacher replacement is a dedicated Replace Teacher workflow (ends the old assignment, creates a new one, preserves history).
9. effectiveStartDate (required) and effectiveEndDate (nullable); both must fall within the Academic Year; overlapping Active assignments on the same scope are not allowed.
10. Assignment status is derived from dates (Active = no end date, Ended = end date set); replacement is a business action, not a lifecycle state; an optional endReason may be stored.
11. Teacher, Subject, Class, Section, and Academic Year are immutable after creation; only dates and end reason may be corrected.
12. Selective copying of assignments between Academic Years is supported.
13. Copy is best-effort: valid assignments are copied, invalid ones are skipped, and a detailed summary is returned.
14. Copy follows the same validation as new assignment creation.
15. Creating an assignment requires the Subject to be ACTIVE and assigned to the school.
16. Creating an assignment requires an ACTIVE Class and ACTIVE Section (if applicable); Archived Classes/Sections cannot receive new assignments.
17. The Academic Year selector defaults to the Current Academic Year, but any non-Archived Academic Year may be selected.
18. Assignments may be created for any non-Archived Academic Year (Current, future, or past).
19. Past non-Archived Academic Years remain valid for assignment creation: a normal operation if no downstream academic records exist; a reason and full audit are required if downstream records (Attendance, Exams, Grade Book, Report Cards, etc.) already exist.
20. Teacher self-service (read-only, own assignments only) is included in this first version.
21. Summary/workload reports are deferred to a future phase, not included in this first version.
22. Subject Management's dependency-validation extension point is used to block Subject-to-School removal while an active Teacher Subject Assignment references it.
23. Archiving a Class or Section is never blocked by this feature; only new assignments/replacements are prevented afterward.
24. Archiving an Academic Year is never blocked by this feature; only new assignments are prevented afterward.
25. Each future module (Timetable, Attendance, Exam, Grade Book) consumes this feature's narrow interface independently; there is no single broker module.

---

# Acceptance Criteria For Business Discovery

- The feature purpose and boundaries are clear.
- Actors and expected permissions are identified.
- Functional and non-functional requirements are documented at business level only.
- Known edge cases are listed.
- Dependencies on existing accepted modules are identified without designing their internals.
- Dependencies on future Timetable, Attendance, Exam, Grade Book, and Report Card modules are identified without implementing them.
- All 25 Architecture Questions have been resolved by the Product Owner; none remain open.
- No database design, API design, implementation plan, code, or commit has been produced in this phase.

---

# Future Enhancements

Potential later enhancements, not approved for this scope:

- Teacher workload analysis.
- Unassigned Subject/Class summary reports.
- Automatic conflict checks against Timetable periods.
- Bulk assignment import.
- Assignment templates by Academic Year.
- Teacher availability rules.
- Room assignment.
- Subject-to-Class curriculum management.
- Teacher-to-Subject qualification enforcement (promoting specializations from descriptive to enforced).
- Co-teaching (multiple concurrent Teachers per Class/Section/Subject/Academic Year).
- Student-facing views of assigned Teachers by Subject.
- Notifications to Teachers when assignments change.

---

# Change History

- v0.1 — Initial Business Discovery draft for Product Owner review.
- v1.0 — All 25 Architecture Questions resolved by the Product Owner (Questions 1–19 in an earlier round; Questions 20–25 in this round: Teacher self-service approved read-only; summary/workload reports deferred; Subject Management's dependency-validation extension point adopted; Class/Section and Academic Year archiving never blocked by this feature; each future module consumes this feature's interface independently). The specification has been rewritten throughout to incorporate every decision as concrete Business Rules, Functional Requirements, Business Lifecycle steps, Edge Cases, and Validation Rules; the former "not yet final business rules" list and open Architecture Questions placeholders have been resolved and are recorded under "Architecture Questions — Resolved" for traceability. Ready for Phase 2 (Business Review).
- v1.1 — Phase 2 (Business Review) conducted; two genuine gaps found and resolved by the Product Owner, added as Business Rules #23–#24 without renumbering any existing rule: (1) a Section is required whenever the target Class has one or more active Sections, and must be absent when it has none — mirroring Student Management's own Enrollment precedent (Business Rule #18) exactly, closing an ambiguity where a whole-Class assignment and a Section-specific assignment could otherwise have coexisted for the same Subject/Academic Year without conflicting under the uniqueness rule (Business Rule #4); (2) ending an assignment (setting effectiveEndDate) is one-way — it may never be cleared back to unset, keeping the "at most one Active assignment per scope" invariant simple and consistent with how this project's other permanent lifecycle events are never undone in place. **Approved by the Product Owner — Business Review complete, proceeding to Phase 3 (Technical Design).**
- v1.2 — **(ACR-006)** Timetable Management added an optional `weeklyLessonTarget` to this feature's own Assignment entity — a purely additive field (`NULL` for every existing Assignment, meaning no weekly Lesson count is enforced) letting a School Admin declare how many Lessons per week a specific Teacher-Subject-Class-Year binding should have. This feature's own existing `registerDownstreamRecordCheck` extension point (Business Rule #17) also gained its first real registered consumer: Timetable Management now reports whether an active Lesson references a given Assignment, so correcting a past-Academic-Year Assignment already referenced by a Lesson requires an explicit reason. No change to this feature's own Business Rules, lifecycle, or existing endpoints beyond accepting this one new optional field on create/correct. This feature's own Feature Acceptance is not reopened.
- v1.3 — **UI Redesign (Product Owner-approved presentation change, not a business-rule change).** This feature's own responsibility was reaffirmed as narrowly "which Teacher teaches which Subject to which Classes" — nothing more. The primary presentation is now grouped **Teacher → Subject → Classes** (one card per Teacher, one heading per Subject, the Classes taught listed underneath) rather than one row per individual Assignment; every existing lifecycle action (Create, Correct, End, Replace Teacher, Copy Between Years) remains fully available, just reached from within the grouped presentation instead of a flat table row. No Business Rule, Functional Requirement, or Validation Rule changed. Weekly lesson targets, workload, or any Timetable-generation concern remain explicitly out of this feature's own display — a future, separate feature is intended to own that concern; this feature's own `weeklyLessonTarget` field (ACR-006) continues to exist purely so Timetable Management can read it, and was never itself surfaced in this feature's own UI before or after this change. This feature's own Feature Acceptance is not reopened.
- v1.4 — **Forward reference only, no content change.** Records that ACR-008 and the new Weekly Subject Allocation feature's own Business Discovery (`docs/03-business/Weekly-Subject-Allocation.md`, not yet approved) will, once Accepted, supersede ACR-006's `weeklyLessonTarget` — this feature will stop needing or storing a weekly lesson count of its own once that happens. No Business Rule, Functional Requirement, Validation Rule, or Feature Acceptance status has changed in this revision; the actual amendment is deferred until Weekly Subject Allocation is itself Accepted.
- v1.5 — **Weekly Subject Allocation Integration, implemented.** `weeklyLessonTarget` (ACR-006) is formally gone — dropped via migration, with no automatic value migration into an initial Weekly Subject Allocation (the same resolution that feature's own Business Review reached, since a per-Assignment target and a per-Grade/Form-per-Subject allocation are not guaranteed to reconcile to the same total). This feature no longer accepts or stores that field on create or correct. Separately, this feature gained one small, additive, read-only capability for Timetable Management's own new Product Owner-approved Teacher weekly capacity Hard Constraint (see `docs/03-business/Timetable.md` v2.2) — a reusable calculation of a Teacher's total committed weekly periods versus their own weekly capacity, exposed only as a plain read function, never as a gate on this feature's own write paths (the enforcement itself lives entirely in Timetable's own generation step, since a Weekly Subject Allocation edit alone — no write here at all — can make a Teacher's commitment invalid). No Business Rule, Functional Requirement, Validation Rule, or Feature Acceptance status has changed as a result; this remains a narrow, additive interface change, the same category v1.0's `getTeacherById` addition and v1.3's `getAssignmentsGroupedByTeacher` addition already were.
 