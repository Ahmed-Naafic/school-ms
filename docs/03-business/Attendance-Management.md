# Attendance Management

Version: 2.1

Status:
- **Business Review complete — Approved.** Following Business Discovery (v0.1), the Manager role resolution (v0.2, **ACR-010**), the Super Admin exclusion correction (v1.1), the Staff Attendance arrival-based model (v1.2), the staff-attendance-correction corrections (v1.3–v1.4), the self-check-in redesign and its follow-on fixes (v1.5–v1.7), and the Manager-recorded arrival amendment (v2.0), the Product Owner has directed one further correction (v2.1, below). Four items remain genuinely open — see Open Questions — because they are exact configuration values (time windows), not business decisions this feature can settle itself.
- **(v2.1) The application's operating timezone is fixed: Africa/Mogadishu (UTC+3, no DST).** This is a platform-wide constant, not a School setting — there is no configurable-timezone concept anywhere in this feature, and none is planned. Staff Attendance Timing Settings (start time, late threshold, absence cutoff) are entered and interpreted as Mogadishu wall-clock time; every business-time computation that compares "now" against them — opening the window, deriving `PRESENT`/`LATE`, deriving the read-time `ABSENT`, self check-in, and Manager-recorded arrival — must use Mogadishu time, never a raw UTC reading. See Business Rule #43 and Change History. This corrects a real bug: the pre-v2.1 implementation read "now" as UTC, producing a systematic offset from the intended Mogadishu wall-clock meaning of the configured settings.
- **Attendance is strictly a school-based operational feature.** Super Admin has no Attendance access of any kind — see Actors > Super Admin and Business Rule #34.
- **Staff attendance status is system-determined, never manually chosen.** A Teacher's or Accountant's arrival ("Come") may be recorded either by the staff member themselves, or by their Manager on their behalf (**v2.0 — restores, in narrower and now-explicit form, a Manager-initiated recording path v1.5 had removed entirely; see Change History**). A Manager's own arrival, and an Admin's authority over it, are unchanged from v1.5 — a Manager still only ever self-records their own "Come"; an Admin still never records it for them. In every case, the server captures the current timestamp and derives `PRESENT`, `LATE`, or (once the configured absence cutoff has passed with no arrival) `ABSENT` automatically, per configured school settings. `EXCUSED` remains the one status a human may apply directly to *someone else's* record, only through the correction/manual-mark authority already defined for that relationship (Manager over Teacher/Accountant; Admin over Manager). See Business Rules #35–39, #42.
- **(v2.0)** This version deliberately restores a *narrower* form of a capability removed in v1.5, not a full reversal: a Manager may now record arrival for a Teacher or an Accountant, but a Manager still may never record another Manager's arrival, and an Admin still never records a Manager's arrival — that half of v1.5's redesign is untouched. See Business Rule #42 and Change History.
- **Correction preserved from v0.1:** an earlier, uncommitted version of this authority model incorrectly stated that every Manager must mark the Admin's attendance. That rule was removed at the Product Owner's explicit instruction in v0.1 and does not appear anywhere in this document. It cannot recur even by omission in this version — Business Rule #33 now states directly that an Admin has no attendance record of any kind, closing the door on the incorrect rule from a different direction as well.
- **Approved for Technical Design.** See `docs/06-technical-design/Attendance-Management.md`.
- **Not yet approved for Implementation.** No database, API, service, controller, or UI work has been performed for this feature.

---

# Purpose

Attendance Management answers, for any person in the school on any given day, two linked questions: **"was this person present, and who is the authoritative source of that answer?"**

It exists because four different kinds of people (Student, Teacher, Accountant, Manager) can have attendance recorded about them, and more than one role can be authorized to record it for some of them (a Student's attendance may come from a Teacher or a Manager; a Teacher's or Accountant's from a Manager). Without an explicit authority hierarchy and an explicit "source" concept, the same person's attendance could silently be recorded twice, contradicted, or overwritten with no way to tell which record is authoritative or who is accountable for it. This feature exists to make that hierarchy, and the resulting ownership of every attendance record, unambiguous and fully auditable — nothing else.

For Students specifically, this feature is also the first to require School Schedule Management and Timetable Management to answer a live question no other feature has needed before: *"given the current date and time, which Teacher is currently teaching which Class, which Subject, in which Period?"* Teacher Student attendance is derived entirely from that answer, never re-entered by the Teacher.

Attendance is informational and reporting data only in this version — it never affects Student promotion, marks, grades, or graduation eligibility (Business Rule #28), and an Admin (School Admin) is never a subject of attendance at all (Business Rule #33).

---

# Scope

**In scope (this document):**
- The recording authority hierarchy: who may record attendance for whom (Teacher, Manager, Admin).
- Who attendance records exist for (Student, Teacher, Accountant, Manager) — explicitly not Admin.
- Teacher Student attendance, automatically contextualized from the current Timetable lesson.
- The four allowed attendance statuses, and the explicit non-status `NOT_RECORDED` session state.
- Manager Student attendance, recorded per checkpoint (Before Break / After Break), including the override effect this has on Teacher attendance for the covered Periods.
- Manager correction authority over Teacher-recorded Student attendance.
- Daily staff attendance for Teachers and Accountants — recorded either by the staff member themselves or by their Manager on their behalf (**v2.0** — restores a narrower, explicit Manager-recording path; see Change History) — viewed live and `EXCUSED`-corrected by the Manager.
- Self-recorded daily attendance for Managers, viewed live and `EXCUSED`-corrected by the Admin (**v1.5** — the Admin no longer records it on their behalf).
- The attendance-source and audit-trail model that preserves who recorded, and who corrected, every record.
- Reporting granularity (detailed lesson/checkpoint records vs. daily aggregates), Student-lifecycle history preservation, holiday/non-working-day handling, and multiple-shift handling, at business level.
- Business-level view/edit/correct permissions for every actor above.

**Out of scope (this document):** see Out-of-Scope Items. In particular, no database design, API design, service/controller design, or UI design is included — this is a business-level specification only.

---

# Actors

## Student

Never records attendance. Is the subject of Student attendance recorded by a Teacher or a Manager. No longer appears in a newly generated attendance session once no longer actively enrolled (transferred, withdrawn, or graduated), but their historical attendance records are preserved unchanged (Business Rules #29–#30).

## Teacher

Records Student attendance for the Class/Subject/Period the Timetable currently places them in. Is also the subject of their own daily staff attendance — recorded either **by themselves**, via their own "Come" self check-in, **or by their Manager** on their behalf (**v2.0** — restores a narrower Manager-recording path removed in v1.5; see Change History). Either path produces the identical kind of record; only who triggered the write differs. May edit their own Student-attendance entries only within the configured allowed attendance time (exact window: Open Question).

## Accountant

Is the subject of a daily staff-attendance arrival record, recorded either **by themselves**, via their own "Come" self check-in — the only attendance-recording action this role has (**v1.5, new** — an Accountant previously never recorded anything) — **or by their Manager** on their behalf (**v2.0**). Never records anyone else's attendance, of any kind.

## Manager

A distinct, first-class system role, approved via **ACR-010** (`docs/01-architecture/Architecture-Decision-Records/ACR-010-Manager-Role-Introduction.md`; see Authentication-and-Authorization.md's own Actors/Permissions/Business Rules #6, #27–28 for the role's account-lifecycle definition). A Manager is distinct from School Admin, never inherits School Admin's own permissions, is tenant-scoped to exactly one school, and is created, deactivated, and reactivated only by School Admin — a Manager cannot manage or create another Manager's account unless a future decision explicitly grants that.

A Manager records Student attendance (all Classes, all Students, per checkpoint) and corrects Teacher-recorded Student attendance. For Teacher/Accountant **staff** attendance, a Manager views the live roster and may **either** record a Teacher's or an Accountant's arrival ("Come") on their behalf **or** apply/reverse `EXCUSED` (**v2.0** — restores a narrower, explicit form of the Manager-recorded "Come" action removed in v1.5; see Change History); the Teacher or Accountant may also still self-record their own "Come" — both paths coexist, and whichever happens first for a given staff member on a given day satisfies the one-record-per-day rule. A Manager is also the subject of their own daily attendance — **recorded by themselves only**, via their own "Come" self check-in, unchanged from v1.5; an Admin views that roster and may apply or reverse `EXCUSED`, but does **not** record the Manager's arrival for them — the v2.0 change does not extend to the Admin↔Manager relationship. A Manager may never record or correct another Manager's attendance, may never record, view-for-correction, or otherwise act on an Admin's attendance (Admin has no attendance record at all — Business Rule #33), and may never manage or create any account, including another Manager's, and may never perform a School Admin function or change their own role.

## Admin

**Means School Admin** for this attendance scope (the existing, school-scoped administrator role) — not Super Admin. Has the highest attendance authority for Managers: views the live, self-recorded daily attendance roster for every Manager at the school and retains `EXCUSED` correction authority over it — a Manager's own arrival is always self-recorded by that Manager (**v1.5** — the Admin no longer performs this on the Manager's behalf; see Change History). Does not record Student, Teacher, or Accountant attendance in this model (that authority belongs to Teacher and Manager, and — for their own arrival — to the Teacher/Accountant themselves). **An Admin never has an attendance record of their own — this feature provides no way for anyone, including the Admin, to record, view, or correct an Admin's own attendance** (Business Rule #33). This directly and permanently forecloses the earlier, incorrect "Managers mark Admin attendance" rule from recurring in any form.

## Super Admin

**Has no Attendance access of any kind.** Attendance Management is a strictly school-based operational feature, scoped entirely to the school-scoped roles (School Admin, Manager, Teacher) and the people they mark (Student, Teacher, Accountant, Manager). Super Admin may not view, record, or correct any attendance record, may not access any Attendance page, and may not access any Attendance API or route — regardless of school context. This is a deliberate, explicit exception to Authentication & Authorization's own platform-wide default that Super Admin may access any school's data (Authentication-and-Authorization.md Business Rule #4) — Attendance Management does not extend that default to itself, and no school-context selection, impersonation, or "act as school" mechanism, now or in the future, grants Super Admin any Attendance capability (Business Rule #34). This resolves, definitively, what was recorded in v1.0 as an open Assumption Requiring Approval.

---

# Permissions

**(v1.5 — restructured.** Staff-attendance recording is now always self-service, so "record Teacher/Accountant staff attendance" and "record Manager attendance" no longer mean anything for the Manager/Admin rows — replaced with a "record own staff arrival" column, plus explicit `EXCUSED`-correction columns for the two staff relationships this feature governs.**)**

**(v2.0 — added a "Record Teacher/Accountant arrival on their behalf" column, Manager-only.** This is additive to, not a replacement of, the Teacher's/Accountant's own "record own staff arrival" cell — both remain Yes. No other cell in this table changes: a Manager still cannot record another Manager's arrival, and an Admin still cannot record a Manager's arrival — see Business Rule #42.)

| Actor | Record Student attendance | Record own staff arrival ("Come") | Record Teacher/Accountant arrival on their behalf (v2.0) | Apply/reverse `EXCUSED` for Teacher/Accountant | Apply/reverse `EXCUSED` for Manager | Edit own recorded attendance | Correct another's recorded attendance |
|---|---|---|---|---|---|---|---|
| Teacher | Yes — only their own current Timetable lesson | Yes — own arrival only | No | No | No | Yes — only within the allowed attendance time (Student attendance) | No |
| Accountant | No | Yes — own arrival only | No | No | No | No | No |
| Manager | Yes — all Classes, all Students, per checkpoint | Yes — own arrival only | Yes — Teacher/Accountant only, never another Manager | Yes | No | N/A (see Manager Override) | Yes — Teacher-recorded Student attendance, and their own checkpoint attendance |
| Admin | No | N/A — no attendance record of their own (Business Rule #33) | No | No | Yes | N/A | N/A |
| Student | No | N/A | No | No | No | No | No |
| Super Admin | **No — no Attendance access of any kind** | **No** | **No** | **No** | **No** | **No** | **No** |

---

# Business Lifecycle

## 1. Teacher Student Attendance — Timetable-Driven Context

When a Teacher opens attendance, the system determines the current teaching context automatically, using School Schedule Management and Timetable Management, in this order:

```
Current date/time
    ↓
Current school Period (School Schedule Management — this Class's own Shift)
    ↓
Teacher's assigned Lesson for that Period (Timetable Management)
    ↓
Class, Subject, Students
    ↓
Attendance screen
```

Example: if Ahmed is teaching Physics to F1A during Period 3, opening attendance during Period 3 automatically loads F1A, Physics, Period 3, and F1A's students. The Teacher never manually selects Class, Subject, or Period when the Timetable already determines them. Each Shift resolves its own current Period independently (Business Rule #32) — a school with more than one Shift never assumes one Shift's current Period applies to another.

## 2. Manager Student Attendance — Checkpoints

A Manager may take Student attendance for any Class, for any Student, at either of two checkpoints per day: **Before Break** or **After Break**. Before Break covers every Period that occurs before the applicable Shift's own configured break; After Break covers every Period that occurs after it. Every Manager-recorded Student attendance record explicitly identifies which checkpoint it belongs to.

## 3. Manager Override of Teacher Student Attendance

The moment a Manager records attendance for a checkpoint, the Manager becomes the attendance source for every Period that checkpoint covers:
- A Teacher can no longer create a new attendance record for those Periods.
- A Teacher can no longer edit attendance for those Periods.
- A Teacher can still view the attendance for those Periods, including who recorded it and when.
- A Manager may still correct that attendance afterward.

Example: a Teacher did not take attendance for the earlier Periods of the day. A Manager takes Before Break attendance. When the Teacher later opens the attendance page, they see attendance already recorded, attributed to the Manager with a timestamp, with editing disabled.

## 4. Manager Correction of Teacher-Recorded Student Attendance

A Manager may correct a Student attendance record that a Teacher originally recorded. When this happens, the system preserves both the original recording (who recorded it, and when) and the correction (who corrected it, and when) — a correction never overwrites or discards the original record's own attribution.

## 5. Teacher/Accountant Staff Attendance — Self Check-In or Manager-Recorded Arrival (v2.0 — restores a narrower Manager-recording path)

**Prior versions (v1.2–v1.4) of this section had the Manager click "Come" on each Teacher's/Accountant's behalf; v1.5 replaced that entirely with self-check-in only, on the reasoning that a Manager clicking through every staff member individually does not scale and that third-party-recorded attendance is a weaker signal. The Product Owner has since directed a narrower reversal (v2.0): the Manager's roster view itself needed a way to record an arrival for a staff member who has not yet self-recorded, without reintroducing a Manager click-through-everyone workflow as the *only* path. Both a genuine self-recording and a Manager-recorded arrival are now valid; see Change History.**

Staff attendance is not a manual Present/Absent choice — it is an arrival record the system turns into a status. There are now two ways a Teacher's or Accountant's arrival for a given day gets recorded:

- **Self check-in** — the Teacher or Accountant clicks their own "Come" action for their own account.
- **Manager-recorded arrival (v2.0, new)** — from the live roster, the Manager clicks the arrival control next to a specific Teacher's or Accountant's row (shown while that row is `NOT_RECORDED`), recording that staff member's arrival on their behalf.

Whichever path is used, the resulting record is identical in shape and behaves identically afterward (viewable, `EXCUSED`-correctable, etc.) — the two paths differ only in **who is recorded as having recorded it** and, structurally, in whether the acting account and the subject account are the same:

1. Captures the current server-side timestamp — never a value anyone supplies, whether the staff member or the Manager.
2. Records the staff member being marked (the subject) and, separately, the account that performed the action (the recorder) — for self check-in these are the same account; for a Manager-recorded arrival they are different, and both facts are preserved independently (Business Rule #22).
3. Records the subject's role at that moment.
4. Records **the current school date** — always today, always server-determined; there is no "which date" input to either path (Business Rule #40, extended by Business Rule #42 to the Manager-recorded path).
5. Records the arrival time (the captured timestamp).
6. Derives the status automatically, per Business Lifecycle §11 below.

Each Teacher and each Accountant has exactly one staff-attendance record per day, regardless of which path created it — a second "Come" for the same staff member on the same date, through either path, is rejected, not a second record: if the staff member already self-recorded, the Manager's arrival action for them is rejected; if the Manager already recorded their arrival, that staff member's own subsequent self-"Come" is likewise rejected. **Both paths are today-only by construction** (Business Rules #40, #42) — neither can create or backdate an arrival for yesterday, tomorrow, or any other date. Reaching a past date remains exclusively the Manager's `EXCUSED` correction authority below, never either recording path. **A Manager may never record arrival for another Manager, and may never record any attendance for an Admin** (Business Rule #42, #33) — the new Manager-recorded path is scoped to Teacher/Accountant only, identically to the Manager's existing `EXCUSED` authority. The Manager's role continues to include viewing the live roster (Staff Member, Role, Arrival Time, Status) and applying or reversing `EXCUSED` (Business Lifecycle §11, Business Rule #37) — normally for today, or, for a genuinely past date, through the separate historical-correction action (Business Rule #41); never for a future date, through either.

## 6. Manager Staff Attendance — Self Check-In (v1.5 — replaces Admin-recorded "Come")

**Prior versions (v1.2–v1.4) of this section had the Admin click "Come" on each Manager's behalf, mirroring the same anti-pattern corrected in Business Lifecycle §5 above. Rewritten identically for the same reason; see Change History.**

Manager staff attendance uses the identical self-recorded arrival-and-derive concept as Business Lifecycle §5 — the same "Come" action performed by the Manager on their own account, the same server-timestamp capture, the same automatic status derivation, and the same today-only restriction (Business Rule #40): a Manager's own "Come" can never be backdated or postdated, only the Admin's separate `EXCUSED` correction authority reaches a historical date. Each Manager has exactly one attendance record per day. The Admin never performs this action for a Manager; the Admin views the live roster for every Manager at the school and holds `EXCUSED` correction authority over it — a Manager cannot correct their own record (apply or reverse `EXCUSED`) even though they are the one who self-records the underlying arrival.

## 7. Attendance Source

Every attendance record — regardless of who is being marked or who recorded it — preserves an explicit source, distinguishing at minimum:
- `TEACHER` — Student attendance recorded by the assigned Teacher for their own current lesson.
- `MANAGER_BEFORE_BREAK` — Student attendance recorded by a Manager for the Before Break checkpoint.
- `MANAGER_AFTER_BREAK` — Student attendance recorded by a Manager for the After Break checkpoint.
- `MANAGER_STAFF_ATTENDANCE` — a Teacher's or Accountant's own daily attendance, within the Manager's correction jurisdiction.
- `ADMIN_MANAGER_ATTENDANCE` — a Manager's own daily attendance, within the Admin's correction jurisdiction.

**(v1.5 note — source names identify jurisdiction, not recorder.** These two source names predate the self-check-in model (Business Lifecycle §5–6) and originally described who clicked "Come." They are kept unchanged rather than renamed, since renaming would be a database/API change with no behavioral effect — but read them as "which relationship's correction authority this record falls under" (Manager↔Teacher/Accountant, or Admin↔Manager), not "who recorded this row." The recording user for either source is now always the staff member themselves, per Business Lifecycle §5–6.)

Every record also preserves the recording user, the recording user's role, and the recording timestamp — independently of whose attendance the record describes. The system must always be able to answer both "who is this record about" and "who recorded (and, if applicable, who corrected) this record" as two distinct facts, never conflated into one.

## 8. No Attendance Recorded

The absence of a recorded attendance entry is never the same thing as an `ABSENT` status. It is a session-level state — `NOT_RECORDED` — computed by observing that no attendance record exists yet for a given Student's lesson-occurrence or checkpoint, never a value stored on a Student's own attendance record. An `ABSENT` status only ever exists as the result of a deliberate recording action by an authorized Teacher or Manager.

## 9. Reporting Granularity

Two granularities coexist without contradiction. Teacher-recorded Student attendance is inherently lesson/Period-based — one record per Student per specific lesson occurrence. Manager-recorded Student attendance is checkpoint-based, but always preserves exactly which Periods that checkpoint covers, never collapsing them into an undifferentiated "the whole morning." Daily reporting may aggregate either shape into a per-Student, per-day summary, but the detailed, per-lesson or per-checkpoint records remain the source of truth — an aggregate is a derived view, never a second, independently maintained figure.

## 10. Student Lifecycle and Holidays

Attendance history is preserved unchanged when a Student is transferred, withdrawn, or graduated — no record is deleted, altered, or reassigned as a side effect. Such a Student simply stops appearing in any newly generated attendance session going forward, while remaining fully visible in their own historical records. Separately, no attendance session of any kind — Teacher or Manager — exists for a non-working day, a school holiday, or another officially closed day; neither role can record attendance against such a date.

## 11. Staff Attendance Timing and Automatic Status Determination

School Admin configures three times for their school, specifically for staff attendance (distinct from — and not derived from — any Shift's own start time). **(v2.1)** All three are entered and interpreted as **Africa/Mogadishu wall-clock time** — the application's fixed operating timezone (Business Rule #43) — never UTC and never any other zone:

- **Staff attendance start time** — before this Mogadishu time, "Come" cannot be recorded at all (mirrors the existing configured-opening-time concept, Business Rule #23, now made concrete).
- **Late threshold** — the Mogadishu-time boundary between `PRESENT` and `LATE`.
- **Absence cutoff** — the Mogadishu-time point after which an un-recorded staff member is reported as `ABSENT`.

*Example only — not an approved default, and never hardcoded (Business Rule #38):* Start 7:00 AM, Late after 7:30 AM, Absence cutoff 8:00 AM — all three meaning Mogadishu local time. Every school sets its own values; there is no system-wide default. There is exactly one timezone in this system (Business Rule #43); a value entered here always means Mogadishu wall-clock, with no ambiguity and no per-school override.

Given a "Come" action's captured arrival timestamp:
- Arrival **at or before** the late threshold → `PRESENT`.
- Arrival **after** the late threshold → `LATE`, however late — a genuine arrival is always recorded as `LATE`, even if it happens after the absence cutoff has already passed. The absence cutoff governs what is reported in the *absence* of an arrival, never a ceiling on how late a real "Come" can still be accepted (see Edge Cases).

Given no "Come" recorded at all for a staff member on a given date:
- Before the absence cutoff → the session is `NOT_RECORDED` (identical in spirit to Business Rule #25's Student concept — pending, not yet a known outcome).
- At or after the absence cutoff → the system reports `ABSENT` for that staff member, with no recorded arrival time (`Time: null`), per Business Rule #36. This is a read-time determination, never a value written to a stored record by any automatic process — no background job "marks" anyone absent; the absence of a "Come" record combined with the current (or, for a past date, that date's already-elapsed) time is sufficient to compute and report `ABSENT` whenever the record is read.

`EXCUSED` is reachable only through the correction/manual-mark authority already established for that relationship (Manager for Teacher/Accountant; Admin for Manager) — never a "Come" outcome, and never a status a Manager or Admin selects directly for a normal arrival (Business Rule #37).

---

# Business Rules

1. Attendance may be recorded only by a Teacher, a Manager, or an Admin. No other role may create an attendance record.
2. Attendance records exist for four kinds of people: Student, Teacher, Accountant, and Manager. An Admin is never the subject of an attendance record — see Business Rule #33.
3. A Teacher may record Student attendance only for the Class, Subject, and Period their current Timetable lesson places them in — never for a Class, Subject, or Period outside their own current assignment.
4. Teacher Student attendance context (current Period, Class, Subject, Student roster) is derived automatically from School Schedule Management and Timetable Management. A Teacher never manually selects the Class, Subject, or Period when the Timetable already determines them.
5. Allowed attendance statuses are exactly: `PRESENT`, `ABSENT`, `LATE`, `EXCUSED`. No other status value is valid for any attendance record, regardless of who is being marked or who recorded it. `NOT_RECORDED` is never one of them — see Business Rule #25.
6. A Teacher may edit their own recorded Student attendance only within the configured allowed attendance time window. Outside that window, a Teacher's recorded attendance becomes read-only to that Teacher (exact window: Open Question).
7. A Manager may record Student attendance for any Class and any Student in the school — Manager Student-attendance authority is never limited to specific Classes.
8. Manager Student attendance is always recorded against exactly one of two checkpoints: Before Break or After Break. Every Manager-recorded Student attendance record must explicitly identify its checkpoint.
9. Before Break covers every Period occurring before the applicable Shift's own configured break; After Break covers every Period occurring after it. A single checkpoint record may therefore represent more than one Period.
10. Once a Manager records attendance for a checkpoint, the Manager becomes the attendance source of record for every Period that checkpoint covers, for the affected Class/Students.
11. A Teacher may never create or edit a Student attendance record for a Period already covered by a Manager-recorded checkpoint. A Teacher may still view it.
12. A Manager may correct a Student attendance record for a checkpoint they have authority over, including one originally recorded by a Teacher.
13. Every correction of a Student attendance record must preserve the original recording (who recorded it, and its original timestamp) alongside the correction (who corrected it, and its correction timestamp) — a correction is an additive event, never a silent overwrite of the original attribution.
14. **(v1.5 — replaced the Manager-recorded "Come" of v1.2–v1.4 with self-recording only; v2.0 — restores a narrower Manager-recording path alongside it; see Change History.)** A Teacher or an Accountant records their own daily staff attendance by recording their own arrival ("Come") — not by choosing a status. **(v2.0)** Their Manager may also record that same arrival on their behalf, per Business Rule #42 — the two paths are equally valid, and whichever happens first for a given staff member on a given day satisfies this rule's one-record-per-day requirement (Business Rule #42 governs the Manager-initiated path's own scope and mechanics in full). Each Teacher and each Accountant has exactly one staff-attendance record per day, regardless of which path created it. The Manager's authority over Teacher/Accountant staff attendance is: recording their arrival (v2.0, Business Rule #42), viewing the live roster, and applying/reversing `EXCUSED` (Business Rule #37).
15. For a "Come" recording — whether self-recorded or Manager-recorded (v2.0) — the system automatically records the date, the exact arrival timestamp, the staff member being marked (the subject), the account that performed the action (the recorder — the same account as the subject for self check-in; the Manager for a Manager-recorded arrival, per Business Rule #22), the subject's role, and the resulting status (derived per Business Rules #35–36, never chosen by the staff member, the Manager, or anyone else). No one — the staff member or the Manager included — manually enters the timestamp, and no one manually enters the status for a normal arrival.
16. **(v2.0 — amended; see Business Rule #42 and Change History.)** A Manager may record a Teacher's or an Accountant's arrival on their behalf (Business Rule #42), but may never record another Manager's arrival on their behalf — that restriction is unchanged from v1.5. A Manager may never record, or apply any status to, an Admin's attendance (no such record exists — Business Rule #33).
17. **(v1.5 — replaces the Admin-recorded "Come" of v1.2–v1.4; see Change History.)** A Manager records their own daily attendance by recording their own arrival ("Come") — the identical self-recorded arrival-and-derive mechanism as Business Rule #14, applied to their own account rather than a Teacher's or Accountant's. Each Manager has exactly one attendance record per day. An Admin never performs this action for a Manager; the Admin's authority over Manager staff attendance is limited to viewing the live roster and applying/reversing `EXCUSED` (Business Rule #37).
18. For a Manager's self-recorded "Come," the system automatically records the date, the exact arrival timestamp, the resulting status (derived per Business Rules #35–36, never chosen by the Manager or by anyone else), and the Manager as both the subject and the recorder.
19. A Manager may never correct their own attendance status — apply or reverse `EXCUSED` on their own record — only the Admin holds that correction authority (Business Rule #37). This is distinct from, and does not limit, the Manager's own separate ability to self-record their own arrival via "Come" (Business Rule #17); recording an arrival is not a correction.
20. There is no rule, anywhere in this feature, requiring a Manager to record an Admin's attendance. A Manager has no authority — recording, viewing-for-correction, or otherwise — over Admin attendance. (Business Rule #33 goes further: no such record exists for a Manager, or anyone else, to act on in the first place.)
21. Every attendance record must preserve an explicit source identifying how it was created (at minimum: `TEACHER`, `MANAGER_BEFORE_BREAK`, `MANAGER_AFTER_BREAK`, `MANAGER_STAFF_ATTENDANCE`, `ADMIN_MANAGER_ATTENDANCE`), together with the recording user, the recording user's role, and the recording timestamp.
22. The identity of who is being marked and the identity of who recorded the attendance are always two distinct, separately preserved facts on every attendance record — never inferred from one another.
23. Staff attendance (self-recorded, per Business Rules #14 and #17) has a configured start time before which "Come" cannot be recorded, per Business Rule #38's three configured settings — a School-Admin-configured value, specific to staff attendance and not derived from any Shift's own start time, never hardcoded into the system.
24. This feature must enforce strict tenant isolation — every attendance record, and every recording/correction action, is scoped to exactly one school.
25. There is no `NOT_RECORDED` student attendance status. The four allowed statuses (Business Rule #5) are exhaustive; the absence of any recorded attendance for a Student's given lesson occurrence or checkpoint is a derived session state, never a stored status value, and must never be silently converted to `ABSENT`.
26. For **Student** attendance specifically, a missing attendance record is never automatically treated as `ABSENT`. Only an explicit recording action — by a Teacher, for their own current lesson, or by a Manager, for a checkpoint — ever produces a Student `ABSENT` record. **Staff** attendance follows a deliberately different rule — see Business Rule #36 — since staff attendance has a configured absence cutoff Student attendance has no equivalent of.
27. Attendance reporting supports two granularities without contradiction: the detailed record level (one entry per Student per Teacher-recorded lesson occurrence, or per Student per Manager-recorded checkpoint, always preserving which specific Periods a checkpoint covers) and a daily aggregate level, derived from the detailed records. The detailed records are always the source of truth; a daily aggregate is a read-time summary, never a separately maintained figure that could drift from them.
28. Attendance does not affect Student promotion, marks, grades, or graduation eligibility in this version — it is informational/reporting data only.
29. Attendance history is preserved unchanged when a Student is transferred, withdrawn, or graduated — existing records are never deleted, modified, or reassigned as a side effect of a Student lifecycle change.
30. A Student who is no longer actively enrolled (transferred, withdrawn, or graduated) never appears in a newly generated attendance session going forward, but remains fully visible in their own historical attendance records.
31. No attendance session exists for a non-working day, a school holiday, or another officially closed day — neither a Teacher nor a Manager can record attendance against a date that is not a genuine school day.
32. Each Shift has its own independent attendance timeline — its own current-Period resolution, its own Before Break/After Break checkpoint boundaries, and its own staff-attendance opening time — derived from that Shift's own configuration, never assumed to match another Shift at the same school.
33. An Admin (School Admin) never has an attendance record of their own in this feature. Recording, viewing, or correcting an Admin's attendance is not a capability this feature provides to any role, including the Admin themselves. This is a permanent, structural closure of the earlier, incorrect "Managers mark Admin attendance" rule — there is no attendance record for anyone to mark in the first place.
34. **Attendance Management is a strictly school-based operational feature.** Super Admin has no Attendance access of any kind — no viewing, recording, or correcting any attendance record; no Attendance page; no Attendance API or route access — regardless of school context. This is an explicit, deliberate exception to Authentication & Authorization's own platform-wide default that Super Admin may access any school's data (Authentication-and-Authorization.md Business Rule #4); Attendance Management does not extend that default to itself. No school-context selection, impersonation, or "act as school" mechanism grants Super Admin indirect access to Attendance under any circumstance, now or in the future.
35. A staff member's "Come" arrival timestamp determines their status automatically: at or before the configured late threshold produces `PRESENT`; after the late threshold produces `LATE`. This applies identically to self-recorded Teacher/Accountant attendance and self-recorded Manager attendance — the same derivation, the same two configured boundaries, per Business Lifecycle §11.
36. If no "Come" has been recorded for a staff member by the configured absence cutoff, the system reports `ABSENT` for that staff member on that date, with no arrival time (`Time` is null, since no arrival occurred). This is a derived, read-time determination — never a value written to a stored record by any automatic process, and never converted into a real record unless a Manager or Admin subsequently applies `EXCUSED` through the correction/manual-mark authority already established for that relationship (Business Rule #37). This is a deliberate, staff-specific exception to Business Rule #26's Student-scoped rule.
37. `EXCUSED` is never a "Come" outcome and is never a status a Manager or Admin selects directly for a normal arrival. It is reachable only through the correction/manual-mark authority already established for each relationship — a Manager for a Teacher's or Accountant's record; an Admin for a Manager's record — the same authority boundary Business Rules #14 and #17 already establish for who may act on whose staff attendance at all. **This authority is deliberately narrower than Business Rule #12's Student-attendance correction authority, not equivalent to it.** A Manager/Admin may apply `EXCUSED` (whether a record already exists or not, per Business Rule #36), and may reverse a mistaken `EXCUSED` mark — but reversal only ever restores the record to what it would have been had `EXCUSED` never been applied: if a genuine "Come" arrival existed before the mistaken `EXCUSED`, reversal recomputes `PRESENT`/`LATE` from that arrival's own real timestamp (never a value the Manager/Admin supplies); if no arrival ever existed, reversal removes the record entirely, restoring the derived `ABSENT`/`NOT_RECORDED` read-time state (Business Rule #36). **At no point can a Manager or Admin manually select `PRESENT`, `LATE`, or `ABSENT` for a staff member, for any reason, including "fixing a mistake."** Allowing that would reintroduce exactly the subjective, manually-chosen status this feature's entire arrival-based model exists to eliminate — a Manager freely picking who counts as Present, Late, or Absent is not a data-entry correction, it is the unfair outcome Business Lifecycle §11 was designed to prevent. *(v1.4 — this replaces v1.3's broadened wording, which incorrectly opened staff-attendance correction to any of the four statuses; that was a mistake, not an approved change in policy. See Change History.)* **(v1.7 — this authority's reach into WHICH DATE is itself split into two distinct actions; see Business Rule #41.** Applying `EXCUSED` for *today* is the normal, everyday exercise of this rule. Applying it for a genuinely past date is a separate, explicitly-authorized historical-correction action — not a variant of the everyday one — and applying it for a future date is never permitted under either action, correction or not.)
38. A school's staff attendance start time, late threshold, and absence cutoff are each configured by School Admin, specific to staff attendance, and never hardcoded into the system (exact values: school-configurable, no system-wide default — see Business Lifecycle §11's example, which is illustrative only). "Come" is rejected before the configured start time; if these settings have not yet been configured for a school at all, "Come" cannot be recorded until School Admin configures them — the system does not guess a default. **(v2.1)** These three values are always Mogadishu wall-clock time (Business Rule #43) — the *values themselves* remain school-configurable (each school picks its own start/late/cutoff), but the *timezone they're interpreted in* is not configurable at all, by any school, ever.
39. No one may ever manually enter a staff member's arrival time, for any status — not the staff member, not a Manager, not an Admin. The arrival timestamp is always server-captured at the exact moment "Come" is recorded, exactly as every other timestamp in this feature already is (Business Rule #22's own "who recorded it" distinction extends to "when they actually arrived," not merely "when the record was created").
40. **(v1.6, new — makes explicit a guarantee that was already true in the implementation but not stated as its own rule.)** A self-recorded "Come" (Business Rules #14, #17) always records against **the current school date**, determined entirely server-side — never a date the staff member (or anyone else) supplies, requests, or influences in any way. There is no capability, anywhere in this feature, for a Teacher, Accountant, or Manager to self-record an arrival for yesterday, tomorrow, or any date other than today; the action itself has no concept of "which date" as an input at all. This is deliberately distinct from the Manager's/Admin's own `EXCUSED` authority (Business Rule #37), which *does* operate against a specified date — but that authority is itself split by date scope, per Business Rule #41 below, not uniformly unrestricted.
41. **(v1.7, new — corrects a real gap live-testing found: the normal `EXCUSED` action accepted any client-supplied date, past or future, with no legality check at all.)** Business Rule #37's `EXCUSED` authority is split into two distinct actions by date:
    - **Normal Excuse** — applies only to **today**. A client-supplied date other than today is rejected outright; omitting the date defaults to today.
    - **Historical correction** — a separate, explicitly-authorized action for a genuinely **past** date only. It requires the date to be supplied explicitly (never defaulted) and rejects today (the normal action's own scope) and any future date.
    
    **Neither action ever accepts a future date, under any circumstance.** EXCUSED — normal or historical — can never be applied ahead of time; there is nothing to excuse about a day that has not happened yet. This closes the gap directly: before this rule, a Manager or Admin could apply `EXCUSED` against an arbitrary past or future date through the single, unrestricted normal action — that is no longer possible through the normal action, and the historical action itself still forecloses the future. Both actions remain bounded by the same relationship authority Business Rule #37 already establishes (Manager for Teacher/Accountant; Admin for Manager) and the same audit requirements (Business Rules #21–#22) — historical correction additionally records a distinct audit action, so it is never indistinguishable from an ordinary same-day Excuse in the audit trail.
42. **(v2.0, new — restores a narrower form of the Manager-recorded "Come" capability v1.5 removed; see Change History.)** A Manager may record daily arrival attendance ("Come") on behalf of a Teacher or an Accountant, in addition to that staff member's own ability to self-record (Business Rule #14). This authority is deliberately scoped identically to the Manager's existing `EXCUSED` authority (Business Rule #37) and no further:
    - **Teacher and Accountant only.** A Manager may never record arrival for another Manager (unchanged from v1.5, Business Rule #16) and may never record any attendance for an Admin — no such record exists (Business Rule #33).
    - **Server-generated timestamp, always.** The arrival time is captured at the exact moment the Manager performs the action — never a value the Manager supplies, identically to Business Rule #39's guarantee for self-recorded "Come."
    - **Today-only, by construction.** Like self-recorded "Come" (Business Rule #40), a Manager-recorded arrival has no "which date" input at all — it always records against the current school date. Reaching a past date remains exclusively the Manager's separate `EXCUSED`/historical-correction authority (Business Rule #41), never this action.
    - **Automatic status derivation, unchanged.** `PRESENT`/`LATE` is derived from the captured timestamp exactly as for self-recorded "Come" (Business Rule #35) — a Manager recording someone's arrival does not get to also choose their status.
    - **One record per staff member per day, regardless of path.** If the staff member has already self-recorded for today, the Manager's arrival action for them is rejected; if the Manager has already recorded their arrival, that staff member's own subsequent self-"Come" is likewise rejected (Business Rule #14).
    - **Both the subject and the recording Manager are preserved, as two distinct facts** (Business Rule #22) — a Manager-recorded row's "who this is about" and "who recorded it" are never the same account, unlike self-recorded "Come."
    - **This does not narrow, and is not narrowed by, Business Rule #37's `EXCUSED` authority** — recording an arrival and applying `EXCUSED` remain two entirely separate actions, exactly as Business Rule #19 already establishes for the Manager's own attendance.
    - **The Admin↔Manager relationship is explicitly unchanged.** An Admin still never records a Manager's arrival on their behalf — that half of v1.5's redesign was not revisited, and this rule grants no new capability to the Admin role.
43. **(v2.1, new — corrects a real, live-reported bug: the system computed "now" as raw UTC while Staff Attendance Timing Settings are entered as local wall-clock time, producing a 3-hour discrepancy between when the settings screen implies staff can check in and when they actually could.)** This application's operating timezone is fixed and permanent: **Africa/Mogadishu (UTC+3, no daylight-saving time)**. This is a platform-wide constant, not a School Management System setting:
    - **Not configurable, by anyone, at any level.** There is no timezone field on School, on Staff Attendance Timing Settings, or anywhere else in this feature — no School Admin, Manager, or Super Admin action can change it, now or in any planned future version.
    - **Every Staff Attendance Timing Settings value (start time, late threshold, absence cutoff, Business Rule #38) is entered and interpreted as Africa/Mogadishu wall-clock time** — a School Admin typing "6:00" means 6:00 AM as a clock on the wall in Mogadishu would show it, not 6:00 AM UTC or 6:00 AM in any other zone.
    - **Every business-time computation for Staff Attendance uses Mogadishu time for "now"**: whether the staff-attendance window has opened (Business Rules #23, #38), whether an arrival is `PRESENT` or `LATE` (Business Rule #35), whether the absence cutoff has passed (Business Rule #36), self-recorded "Come" (Business Rules #14, #17), and Manager-recorded arrival (Business Rule #42) all compare against Mogadishu wall-clock time — never a server process's own operating-system timezone (which may or may not itself be Mogadishu) and never a raw UTC reading.
    - **This does not change what is stored.** Every stored timestamp (`recordedAt`, `correctedAt`, audit timestamps, etc.) remains a real, absolute, unambiguous instant in the database, exactly as before — Business Rule #39's "server-captured, never manually entered" guarantee is completely unaffected. Only the *business-time interpretation* — comparing that instant, or the current instant, against a Mogadishu-entered setting — uses Mogadishu time.
    - **The normal/historical Excuse date split (Business Rule #41) also uses Mogadishu's calendar date for "today"** — not a UTC calendar date — so a record's "today" is consistent across every Staff Attendance action (Come, Excuse, Unexcuse), never split by which action happens to run near the UTC/Mogadishu day boundary.
    - **This rule exists because this system is currently scoped to schools in Mogadishu, Somalia only.** It is not a general multi-timezone solution and is not intended to be one; if the system is ever extended beyond a single timezone, that is a new, separately-approved business decision, not an extension of this rule.

---

# Edge Cases

| Situation | Expected Behavior |
|---|---|
| A Teacher opens attendance outside any currently-assigned Timetable lesson | Not decided in this version — depends on the unresolved opening/closing window (Open Questions). No behavior is assumed here. |
| A Teacher attempts to edit Student attendance after the allowed attendance time has closed | Rejected, per Business Rule #6. |
| A Manager records Before Break attendance for a Class the Teacher had not yet marked | Manager becomes the source for the Before Break Periods; Teacher sees it as already recorded and read-only for those Periods, per Business Rules #10–#11. |
| A Teacher attempts to create or edit attendance for a Period already covered by a Manager checkpoint | Rejected; Teacher retains view-only access, per Business Rule #11. |
| A Manager corrects a Teacher-recorded Student attendance record | Allowed, per Business Rule #12; both the original and the correction attribution are preserved, per Business Rule #13. |
| A Manager attempts to record arrival ("Come") for another Manager | Rejected, per Business Rules #16 and #42. |
| A Manager, or anyone else, attempts to record, view-for-correction, or otherwise act on an Admin's attendance | Rejected — no such record exists at all, per Business Rules #16, #20, #33, and #42. |
| An Admin attempts to record "Come" on behalf of a Manager | Rejected — no such action exists; that half of v1.5's redesign is unchanged by v2.0. "Come" for a Manager's own attendance only ever records the Manager's own arrival, per Business Rule #17. |
| A Manager records "Come" for a Teacher or Accountant who has not yet self-recorded for today | Allowed (**v2.0**, Business Rule #42) — records that staff member's arrival, timestamped now, with `PRESENT`/`LATE` derived automatically; the Manager is recorded as the recorder, the staff member as the subject. |
| A staff member self-records "Come" a second time for the same day, **or** a Manager attempts to record "Come" for a staff member who already has an arrival recorded for today (self- or Manager-recorded) | Rejected — one arrival record per staff member per day, regardless of which path created it, per Business Rules #14/#17/#42; correcting an existing record (`EXCUSED`) is a separate action from recording a new one. |
| A Manager attempts to record "Come" for a Teacher or Accountant at a different school | Rejected — cross-tenant, per Business Rule #24; the target must belong to the Manager's own school. |
| A staff member (or anyone else) attempts to supply a date, arrival time, or status alongside a self "Come" request — e.g. to backdate to yesterday, postdate to tomorrow, or otherwise pick a date | Silently ignored, not merely rejected — the action never reads such a value in the first place (**v1.6**). The record is always dated the current school date and timestamped the real moment of the request, per Business Rule #40. |
| A Manager needs to apply `EXCUSED` against a date earlier than today (e.g. correcting last week's records) | Allowed, but only through the separate historical-correction action, not the normal Excuse action (**v1.7**, Business Rule #41). |
| A Manager attempts to apply the normal Excuse action against a date other than today — e.g. yesterday or tomorrow | Rejected (**v1.7**, Business Rule #41) — this is the exact gap that was previously present and has been closed; the normal action is today-only, full stop. |
| A Manager attempts to apply `EXCUSED` against a future date — through either the normal action or the historical-correction action | Rejected in both cases, always (**v1.7**, Business Rule #41) — `EXCUSED` is never permitted for a date that has not happened yet, correction or not. |
| A Manager attempts to call the historical-correction action without specifying which date to correct | Rejected (**v1.7**) — unlike the normal Excuse action, the historical action never defaults to today; the date is always required. |
| No one records a Student's or checkpoint's attendance at all | The session is `NOT_RECORDED`, never silently defaulted to `ABSENT`, per Business Rules #25–#26 (Student-specific). |
| No "Come" is recorded for a Teacher, Accountant, or Manager by the configured absence cutoff | Reported as `ABSENT`, `Time: null` — a derived, read-time value, never a stored automatic write, per Business Rule #36. This is deliberately different from the Student `NOT_RECORDED` behavior above. |
| A Teacher, Accountant, or Manager attempts to self-record staff attendance ("Come") before the configured start time | Rejected, per Business Rules #23/#38. |
| A staff member's "Come" is recorded after the configured absence cutoff has already passed | Still recorded as `LATE` (or `PRESENT`, if somehow still at/before the late threshold) — a genuine arrival is never capped into `ABSENT` by the cutoff; the cutoff only governs what is reported in the absence of any arrival, per Business Lifecycle §11. |
| A staff member's "Come" is recorded at exactly the configured late threshold | `PRESENT` — the threshold boundary is inclusive ("at or before"), per Business Rule #35. |
| A Manager or Admin attempts to manually select `PRESENT`, `LATE`, or `ABSENT` for a staff member directly, bypassing "Come" | Rejected — only `EXCUSED` may ever be applied directly by a human for staff attendance, per Business Rule #37; `PRESENT`/`LATE` only ever result from "Come," and `ABSENT` is only ever derived, never manually set. |
| School Admin has not yet configured staff attendance start time / late threshold / absence cutoff for their school | "Come" cannot be recorded at all until these are configured — the system never assumes a default value, per Business Rule #38. |
| A Student or Super Admin attempts to record any attendance | Rejected — neither actor has recording authority under this model, per Business Rule #1 and the Actors section. An Accountant's own arrival self-check-in is the one exception (**v1.5**) — see Business Rule #14. |
| A Teacher or Manager attempts to record attendance for a non-working day, holiday, or officially closed day | Rejected — no attendance session exists for such a date, per Business Rule #31. |
| A Student is transferred, withdrawn, or graduated mid-year | Existing attendance history is untouched; the Student stops appearing in new sessions going forward, per Business Rules #29–#30. |
| A school operates more than one Shift, each with its own break | Each Shift's current Period, checkpoint boundaries, and staff-attendance opening time are resolved independently — no cross-Shift assumption is made, per Business Rule #32. |
| School Admin enters a Staff Attendance Timing Settings value | Always interpreted as Africa/Mogadishu wall-clock time (**v2.1**, Business Rule #43) — never UTC, never the server's own operating-system timezone, and never configurable to any other zone. |
| The server process happens to run in a different operating-system timezone than Mogadishu (or in UTC) | No effect on Staff Attendance's own business-time comparisons — those are computed against Africa/Mogadishu explicitly (Business Rule #43), independent of whatever timezone the server host itself is configured with. |

---

# Validation Rules

1. An attendance record's status must be one of exactly `PRESENT`, `ABSENT`, `LATE`, or `EXCUSED` — no other value is accepted, and `NOT_RECORDED` is never a storable status. For a staff "Come" action specifically, the request never accepts a status value from the client at all — the server is the only source of `PRESENT`/`LATE`; only a manual `EXCUSED` correction/mark accepts a client-supplied status, per Business Rule #37.
2. A Teacher-recorded Student attendance record must reference a Class, Subject, and Period that the recording Teacher's current Timetable lesson actually places them in at the time of recording — never client-supplied without that server-side check.
3. A Manager-recorded Student attendance record must explicitly specify its checkpoint (Before Break or After Break) — a checkpoint-less Manager Student-attendance record is invalid.
4. A staff-attendance "Come" action's arrival timestamp **and its attendance date** are always system-generated at the moment of recording — never accepted as client input, per Business Rules #39 and #40 (**v1.6** — the date half of this guarantee is now stated explicitly, not left implicit in "the timestamp is system-generated"). The self-recorded action always records the acting user's own account; there is no client-suppliable target account for it (**v1.5** — this replaces the earlier Manager/Admin-supplied-target-account shape). **(v2.0)** The Manager-recorded arrival action (Business Rule #42) *does* accept a client-supplied target account — but only a path parameter identifying which Teacher/Accountant, never a status, timestamp, or date; the target must resolve to a genuine Teacher or Accountant at the Manager's own school (never a Manager, an Admin, or a cross-school account) or the action is rejected. This is distinct from the Manager/Admin `EXCUSED` action, whose body legitimately does accept a client-supplied `date` — that date selects *which existing (or about-to-exist) day's record* to correct, never a value that becomes a fabricated arrival time. **(v1.7)** That `date`, however, is not accepted unconditionally: the normal Excuse action validates it equals today (rejecting any other value), and the separate historical-correction action validates it is both present (never defaulted) and strictly before today (rejecting today and any future date) — per Business Rule #41.
5. Every attendance-recording and attendance-correction action must be authorized against the acting user's actual role and the specific authority rules in this document (Business Rules #1, #3, #6, #7, #11, #12, #14, #16, #17, #19, #42) — never trusted from the client.
6. Every attendance record and every recording/correction action is rejected if it crosses a school boundary — tenant isolation is enforced per Business Rule #24.
7. No attendance may be recorded against a date that is not a genuine school day for the applicable Shift — non-working days and holidays are rejected, per Business Rule #31.
8. No attendance record may ever be created for an Admin (School Admin) — every recording path in this feature validates that the subject role is one of Student, Teacher, Accountant, or Manager, per Business Rule #33.

---

# Relationships

## School Schedule Management

The source of the current Period and the applicable Shift's own configured break, both required to determine Teacher Student-attendance context (Business Lifecycle §1) and to define Before Break / After Break (Business Rule #9), and the source of Working Days used to determine non-working days (Business Rule #31). This feature must consume School Schedule Management's own published interfaces, never a second, duplicated copy of Calendar/Shift/Period data. Staff attendance's own start time / late threshold / absence cutoff (Business Rules #23, #38) are **not** derived from any Shift here — they are Attendance Management's own configuration, specific to staff attendance and independent of any Shift's operating hours.

## Timetable Management

The source of a Teacher's current assigned lesson (Class, Subject, Period), required for Teacher Student attendance (Business Lifecycle §1, Business Rule #3–#4). This feature must consume Timetable Management's own published interfaces, never re-derive or duplicate lesson-assignment data.

## Class Management

The source of Class rosters a Manager's "all Classes, all Students" Student-attendance authority (Business Rule #7) operates over.

## Student Management

The source of Student records that are the subject of Student attendance, and of the lifecycle transitions (Transfer, Withdrawal, Graduation) that stop a Student from appearing in new sessions while preserving their history (Business Rules #29–#30).

## Teacher Management

The source of Teacher records that are both attendance recorders (Student attendance) and attendance subjects (staff attendance).

## Authentication and Authorization

Manager's existence as a role is fully resolved via **ACR-010** (`docs/01-architecture/Architecture-Decision-Records/ACR-010-Manager-Role-Introduction.md`) — tenant-scoped to one school, created and managed only by School Admin, never inheriting School Admin's own permissions. This document continues to own only what a Manager may actually *do* with attendance; Authentication & Authorization owns the role's existence and account lifecycle.

## Audit Logs

Every attendance recording action, every Manager correction, and every Admin correction must be recorded there, per the source/audit model in Business Lifecycle §7 and Business Rules #21–#22.

---

# Reports

No dedicated Reports requirement is approved in this version. Attendance data is informational/reporting-capable at a raw and daily-aggregate level (Business Rule #27), but no specific report is specified here.

---

# Notifications

No notification requirement is approved in this version.

---

# Audit Requirements

The following must be recorded for every attendance record:
- Who the record is about (Student, Teacher, Accountant, or Manager — never Admin), and their identity.
- The attendance status.
- The source of the record (`TEACHER`, `MANAGER_BEFORE_BREAK`, `MANAGER_AFTER_BREAK`, `MANAGER_STAFF_ATTENDANCE`, `ADMIN_MANAGER_ATTENDANCE`).
- The recording user, the recording user's role, and the recording timestamp.
- If corrected: the correcting user and the correction timestamp, in addition to — never in place of — the original recording user and timestamp.
- **(v1.7)** A historical correction (Business Rule #41) must be distinguishable in the audit trail from an ordinary same-day `EXCUSED` mark — not merely inferable by comparing the record's `date` against `createdAt`. The audit event itself carries an explicit marker.

---

# Out-of-Scope Items

The following are explicitly not part of this document, and not approved for this feature in this version:

- Database schema, API design, service/controller design, and UI/UX design of any kind — this is a business-level specification only.
- Any implementation work of any kind (backend, frontend, Prisma schema, services, controllers, attendance UI) — see `docs/06-technical-design/Attendance-Management.md` and `docs/07-implementation-planning/Attendance-Management.md` for the design and planning work that follows this Business Specification, neither of which authorizes writing code.
- Implementing the Manager role in code (`UserRole` enum value, Prisma migration, RBAC middleware, account-management APIs) — approved at the business/documentation level via **ACR-010**, not yet implemented.
- Reporting, analytics, or dashboards built on attendance data, beyond the raw records and daily-aggregate summaries described here.
- Any effect of attendance on academic reports, promotion, marks, grades, or graduation eligibility — explicitly excluded, per Business Rule #28.
- Parent/guardian notification of a Student's attendance status.
- Any biometric, RFID, QR-code, or other automated attendance-*capture* method — every recording path in this document is a manual action: a Teacher's own timetable-driven Student-attendance marking; a Teacher's, Accountant's, or Manager's own self-recorded "Come" click for their own staff attendance (**v1.5**); or a Manager's/Admin's `EXCUSED` correction of someone else's staff record. Automatic *status determination* from a manually-captured arrival timestamp (Business Rules #35–36) is not the same thing as automated capture, and remains in scope.
- Leave management, absence requests, or any staff-leave workflow for Teachers, Accountants, or Managers.
- Attendance for Students, Teachers, Accountants, or Managers across more than one school (multi-school assignment) — out of scope unless/until such a concept exists elsewhere in the system.
- Any attendance record or capability for an Admin (School Admin) — explicitly excluded, per Business Rule #33.

---

# Assumptions Requiring Approval

These are working assumptions made only so this document could be written coherently. None of them is an invented answer to an Open Question below — each is a structural reading of the approved decisions that still needs explicit Product Owner confirmation.

1. **"Before Break" / "After Break" assumes exactly one break per Shift per day.** The approved decisions describe a single break dividing each Shift's own day into two checkpoints; how a Shift with more than one break, or no break at all, is handled is not addressed. Flagged here because the two-checkpoint model is stated as if it always applies to every Shift.

*(Resolved, no longer listed here: whether "Manager" is a real, distinct system role — approved via **ACR-010**; whether "Admin" means School Admin — confirmed directly by the approved decisions; whether Teacher attendance is lesson/Period-based — confirmed directly by Business Rule #27; **Super Admin's role in this feature — definitively resolved as NO access of any kind, per Business Rule #34; Attendance Management is a deliberate, explicit exception to Authentication & Authorization's platform-wide Super Admin cross-school default.**)*

---

# Open Questions

Recorded as unresolved per explicit Product Owner instruction — no answer is assumed for any of these. All four are exact configuration values, not open business decisions:

1. Exact Teacher attendance editing window (open/close times).
2. Exact Teacher grace period.
3. Exact Manager correction window.
4. Exact Admin correction window for Manager attendance.

---

# Acceptance Criteria For Business Discovery

- The attendance recording-authority hierarchy (Teacher, Manager, Admin) and who each may record for is stated unambiguously, with no contradictory or duplicate rule.
- The corrected hierarchy is reflected throughout — no rule, sentence, or example anywhere in this document states or implies that a Manager must, or may, mark an Admin's attendance; Business Rule #33 forecloses it structurally as well.
- Who attendance applies to (Student, Teacher, Accountant, Manager) is explicit, and that an Admin is never a subject is explicit.
- The Teacher Student-attendance Timetable-driven context mechanism is described at business level, without inventing technical implementation.
- The Manager checkpoint model (Before Break / After Break), its override effect on Teacher attendance, and Manager correction authority are all explicit and consistent with each other.
- The attendance-source and audit-trail model is explicit enough to guarantee "who is being marked" and "who recorded/corrected it" are always distinguishable.
- Every genuine open question is recorded under Open Questions, not silently resolved; every question that the approved decisions actually answer has been moved out of that section into a Business Rule.
- Every assumption made to produce a coherent document is recorded under Assumptions Requiring Approval, not silently baked into a Business Rule as settled fact.
- No database design, API design, implementation plan, code, or commit has been produced in this phase.

---

# Acceptance Criteria For Business Review

- Every open question raised during Business Discovery that the Product Owner's approved decisions actually settle has been resolved and incorporated as a Business Rule, not left in Open Questions as a hedge.
- The only remaining Open Questions are exact configuration values (time windows), never business-logic ambiguity.
- The Manager role is fully resolved as a real, approved system role (ACR-010) — no longer a structural assumption.
- The incorrect "Managers mark Admin attendance" rule is not only absent, but structurally impossible under this document's own rules (Business Rule #33).
- Super Admin's Attendance access is unambiguous and total-exclusion, not merely "undefined" — no view, record, correct, page, or API access under any school context (Business Rule #34).
- Approved by the Product Owner — Business Review complete, proceeding to Phase 4 (Technical Design).

---

# Future Enhancements

Potential later scope, not approved for this document:

- Parent/guardian notification of a Student's attendance status.
- Biometric, RFID, QR-code, or other automated attendance-capture methods.
- Dedicated attendance reports/dashboards beyond raw records and daily aggregates.
- A formal leave-management workflow for staff (Teachers, Accountants, Managers).
- Multiple breaks per Shift, or a Shift with no break, if a real need emerges beyond the single-break, two-checkpoint model this version assumes.

---

# Change History

- v0.1 — Initial Business Discovery draft, produced directly from the Product Owner's own approved business decisions. Establishes the attendance recording-authority hierarchy (Teacher → own current lesson's Students; Manager → all Students by checkpoint, plus Teacher/Accountant daily staff attendance; Admin → Manager daily attendance), the five attendance subjects (later revised to four in v1.0), the Timetable-driven Teacher Student-attendance context, the four allowed statuses, the Manager override/correction model, and the attendance-source/audit model. **Explicitly corrects an earlier, uncommitted draft that incorrectly required every Manager to mark the Admin's attendance** — that rule is removed and does not appear anywhere in this version. Twelve genuine open questions and five structural assumptions are recorded as such, not resolved. Not yet submitted for Business Review.
- v0.2 — Manager formally approved as a distinct system role via **ACR-010**. Authentication-and-Authorization.md (v1.5) and the Project Glossary (v1.9) amended accordingly. Removed the now-resolved "Manager is a new system role" item from Assumptions Requiring Approval. No attendance-specific Business Rule changed. Still not submitted for Business Review.
- v1.0 — **Business Review complete — Approved.** Incorporated the Product Owner's resolution of eight of the twelve v0.1 Open Questions, each promoted to a new Business Rule (#25–#33): `NOT_RECORDED` is a derived session state, never a stored status or an automatic `ABSENT` (#25–#26); dual reporting granularity, detailed records as source of truth (#27); attendance has no effect on promotion/marks/grades/graduation in this version (#28); Student-lifecycle history preservation and new-session exclusion (#29–#30); no attendance session on non-working days/holidays (#31); each Shift has its own independent attendance timeline (#32); and, most significantly, **an Admin (School Admin) has no attendance record of any kind** (#33) — resolving "how is the Admin's own attendance recorded" not by inventing a mechanism, but by confirming none exists, and permanently, structurally closing the door on the earlier incorrect "Managers mark Admin attendance" rule from recurring in any form. Reduced the attendance-subject count from five kinds of people to four (Admin removed) throughout Purpose, Scope, Business Rules, Permissions, Audit Requirements, and Out-of-Scope Items. Resolved and removed two further Assumptions ("Admin" means School Admin; one-record-per-lesson-Period), leaving two genuine assumptions and four genuine Open Questions (all exact configuration values, none business-logic ambiguity). No new open question was invented, and no value was assumed for any of the four remaining Open Questions. Approved by the Product Owner — proceeding to Phase 4 (Technical Design).
- v1.1 — **Correction: Super Admin authorization.** The Product Owner clarified that Attendance Management is a strictly school-based operational feature and that Super Admin must have no Attendance access whatsoever — not even the read-only, cross-school oversight view every other feature grants Super Admin by default. Added Business Rule #34, stating this explicitly as a deliberate exception to Authentication & Authorization's own platform-wide Super Admin default, and closing it against any future indirect route (school-context selection, impersonation, "act as school"). Rewrote the Actors > Super Admin section from "not part of the approved hierarchy, open item" to an unambiguous total exclusion. Updated the Permissions table's Super Admin row from "Not defined in this version" to "No" across every capability. Resolved and removed Assumption Requiring Approval #1 ("Super Admin's role in this feature is undefined") — no longer an open item, one genuine assumption remains (single break per Shift). No other Business Rule changed. Corresponding updates made to the Technical Design and Implementation Plan.
- v1.2 — **Staff Attendance arrival-based model.** The Product Owner clarified that staff attendance (Manager-recorded Teacher/Accountant, Admin-recorded Manager) is not a manual Present/Absent choice — it is an arrival record ("Come") the system turns into a status automatically. Added Business Lifecycle §11 (Staff Attendance Timing and Automatic Status Determination) and Business Rules #35–39: three School-Admin-configured, staff-attendance-specific times (start, late threshold, absence cutoff — never hardcoded, never derived from a Shift); automatic `PRESENT`/`LATE` derivation from the "Come" arrival timestamp against the late threshold; automatic, read-time-only (never stored-by-a-job) `ABSENT` reporting once the absence cutoff passes with no arrival, `Time: null`; `EXCUSED` confirmed as reachable only through the existing correction/manual-mark authority, never a "Come" outcome or a directly-selected status; and an explicit ban on manually entering an arrival time. Rewrote Business Lifecycle §5–6 around the "Come" action. Amended Business Rules #14, #15, #17, #18, #23 to describe arrival recording rather than status selection, and #26 to scope its "no automatic ABSENT" guarantee explicitly to Student attendance (staff attendance's own, deliberately different rule is #36). Updated Edge Cases, Validation Rules #1/#4, the Relationships > School Schedule Management entry (staff-attendance timing is Attendance Management's own configuration, not Shift-derived), and the Out-of-Scope biometric-capture bullet (automatic status *determination* from a manually-captured arrival is not automated *capture*). No Student-attendance rule changed. Not yet approved for Implementation — see the corresponding Technical Design and Implementation Plan updates.
- v1.3 — **Correction: staff attendance correction is not EXCUSED-only.** Live usage of the shipped v1.2 implementation surfaced a real gap: the "Excuse" action was built as one-way (always sets `EXCUSED`, with no way to correct a mistaken click back). Amended Business Rule #37 to state explicitly that once a staff attendance record already exists, the recording Manager/Admin may correct it to any of the four allowed statuses — not only `EXCUSED` — mirroring Business Rule #12's own Student-attendance correction authority, which staff attendance's arrival-based model never actually narrowed. The EXCUSED-only restriction remains exactly where it always applied: creating a record where none exists yet (the derived-`ABSENT`/`NOT_RECORDED` case), since `PRESENT`/`LATE` require a genuine "Come" arrival and `ABSENT` is never manually created. No other Business Rule changed. See the corresponding Technical Design v1.5 and implementation update.
- v1.4 — **Correction: v1.3 was wrong — staff attendance correction authority must NOT extend to freely choosing PRESENT/LATE/ABSENT.** The Product Owner identified that v1.3's fix, while it did solve the "stuck EXCUSED" problem, solved it the wrong way: letting a Manager/Admin pick any of the four statuses reintroduces manual, subjective status selection — exactly what the arrival-based model (Business Lifecycle §11, Business Rules #35, #39) exists to prevent, and unfair to staff whose status would then depend on a Manager's opinion rather than their actual arrival time. Re-amended Business Rule #37: the correction authority is deliberately narrower than Business Rule #12's Student-attendance authority, not equivalent to it. A Manager/Admin may still apply `EXCUSED` and may still reverse a mistaken `EXCUSED` mark, but reversal only ever restores the record to what it would have been without the mistaken `EXCUSED` — recomputing `PRESENT`/`LATE` from the real, untouched "Come" arrival timestamp if one exists, or removing the record entirely (restoring the derived `ABSENT`/`NOT_RECORDED` state) if no arrival ever happened. No path exists, at any point, for a Manager or Admin to manually select `PRESENT`, `LATE`, or `ABSENT`. No other Business Rule changed. See the corresponding Technical Design v1.6 and implementation update, which replace v1.5's generic "Correct" action with a narrow "Unexcuse" action.
- v1.5 — **Correction: "Come" must be self-recorded, not clicked by a Manager/Admin on someone else's behalf.** The Product Owner identified that v1.2–v1.4's design — a Manager clicking "Come" for each Teacher/Accountant individually, an Admin doing the same for each Manager — was itself an anti-pattern: operationally it means clicking through every staff member one at a time, and architecturally it means the attendance record's own recorder is never the person it's actually about, which is a weaker signal than genuine self-recording. Rewrote Business Lifecycle §5 (Teacher/Accountant self check-in) and §6 (Manager self check-in) to have each staff member record their own arrival. Amended Business Rules #14, #15, #17, #18 to describe self-recording; amended #16, #19, #23, #35, #39 to update their Manager/Admin-recorder phrasing accordingly. The Manager's and Admin's own authority did **not** shrink to nothing — Business Rule #37 (unchanged) still gives the Manager `EXCUSED` correction authority over Teacher/Accountant records and the Admin the same over Manager records; only the *arrival-recording* action moved to the staff member. Added a new capability for **Accountant**, who previously never recorded any attendance at all — an Accountant now self-records their own arrival, the same as a Teacher. Updated Actors (Teacher, Accountant, Manager, Admin), Scope, Permissions (restructured — "record Teacher/Accountant staff attendance"/"record Manager attendance" columns no longer mean anything now that recording is always self-service; replaced with a "record own staff arrival" column plus explicit per-relationship `EXCUSED` columns), Business Lifecycle §7 (clarifying that the existing `MANAGER_STAFF_ATTENDANCE`/`ADMIN_MANAGER_ATTENDANCE` source names now identify correction jurisdiction, not recorder — kept unchanged rather than renamed, since renaming would be a schema/API change with no behavioral effect), Edge Cases, Validation Rule #4, and the Out-of-Scope biometric-capture bullet. No Student-attendance rule changed; no schema/enum rename. See the corresponding Technical Design v1.7 and Implementation Plan updates.
- v1.6 — **Clarification: self "Come" is explicitly today-only and fully server-derived — no code change was required, but the guarantee is now a named rule, not an inference.** A report claimed self "Come" (v1.5) incorrectly allowed backdating to yesterday or postdating to tomorrow via a client-supplied date. Investigation (live-tested against the running implementation with a spoofed `{date, recordedAt, status}` payload, not just a code read) found the claim did not hold: the route takes no path parameter and the controller never reads the request body for this action at all — date and timestamp were already 100% server-derived from the moment v1.5 shipped. Rather than leave that as an unstated implementation detail, added **Business Rule #40**, making it a named, explicit guarantee: self "Come" always records against the current school date, with no "which date" input to the action at all — distinct from Business Rule #37's `EXCUSED` correction authority, which legitimately does reach a historical date and was never restricted to today. Updated Business Lifecycle §5–6 to state the today-only restriction explicitly rather than leaving it implied by "records the date." Added two Edge Cases rows (spoofed date/timestamp/status on self "Come" is silently ignored, not merely rejected; a Manager applying `EXCUSED` against a past date remains allowed) and extended Validation Rule #4 to cover the date half of the guarantee, not just the timestamp half. No Business Rule was weakened or narrowed — #40 documents behavior that already existed. See the corresponding Technical Design v1.8, which adds the matching explicit regression-test requirement; no Implementation Plan phase was needed since no functional code changed, only tests.
- v1.7 — **Correction: the normal `EXCUSED` action must be today-only — v1.6's claim that Business Rule #37's correction authority was date-unrestricted was itself wrong.** A follow-up report identified that although self "Come" was already correctly today-only (v1.6), the *Excuse* action was not: live-testing confirmed a Manager or Admin could apply `EXCUSED` against any client-supplied date, including 2020-01-01 and 2099-12-31, with no legality check at all — the exact anti-pattern v1.6 mistakenly assumed didn't apply here. Amended Business Rule #37 to note its date-scope is now split, and added **Business Rule #41**: the normal Excuse action is restricted to today (a non-today date is rejected, not silently honored); a genuinely past date requires a separate, explicitly-authorized historical-correction action, which itself requires the date (never defaulted) and rejects today or any future date; neither action ever permits a future date, under any circumstance. Updated the Actors > Manager description, Business Lifecycle §5, Edge Cases (four rows: historical correction now requires the separate action; normal-action non-today is rejected; future is rejected in both actions; historical-correction requires an explicit date), Validation Rule #4, and Audit Requirements (a historical correction must be distinguishably audited, not merely inferred by comparing dates). No self-check-in rule changed — Business Rule #40 and the self "Come" action are untouched by this version. See the corresponding Technical Design v1.9 and Implementation Plan updates, which add the `excuse-historical` action.
- v2.0 — **Architecture change, directed by the Product Owner: the Manager Staff Attendance roster needed a way to record an arrival for a Teacher/Accountant directly from the roster, without reintroducing v1.2–v1.4's Manager-clicks-Come-for-everyone anti-pattern as the only path.** Self-recorded "Come" (v1.5) remains fully intact and is not the thing being changed; what changes is that it is no longer the *only* way a Teacher's/Accountant's arrival gets recorded. Added **Business Rule #42**: a Manager may record daily arrival ("Come") on behalf of a Teacher or an Accountant — server-generated timestamp, today-only, automatic `PRESENT`/`LATE` derivation, one record per staff member per day regardless of which path (self or Manager) created it, subject and recorder preserved as two distinct facts. Explicitly scoped no further than the Manager's existing `EXCUSED` authority: a Manager still may never record another Manager's arrival (Business Rule #16, unchanged), and may never record any attendance for an Admin (Business Rule #33, unchanged). **The Admin↔Manager relationship is untouched** — an Admin still never records a Manager's arrival; only the Manager↔Teacher/Accountant relationship gained this capability. Amended Business Rules #14 (both self- and Manager-recording now valid, one-record-per-day spans both), #15 (system-recorded fields now distinguish subject from recorder for the Manager-recorded path), and #16 (still forbids Manager-on-Manager and Manager-on-Admin, no longer forbids Manager-on-Teacher/Accountant). Updated Actors (Teacher, Accountant, Manager), Scope, Permissions (new "Record Teacher/Accountant arrival on their behalf" column, Manager-only), Business Lifecycle §5 (rewritten to describe both paths), Edge Cases (new/updated rows for Manager-recorded arrival, duplicate-recording rejection across both paths, and cross-school rejection), and Validation Rules #4–#5. No Student-attendance rule changed; Business Rules #17–#18, #35–#41 (Manager's own attendance, status derivation, absence-cutoff derivation, `EXCUSED` authority and its date-scope split) are unchanged. See the corresponding Technical Design v2.0 and Implementation Plan Phase 15.
- v2.1 — **Correction: a real, live-reported bug — the implementation computed "now" as raw UTC while Staff Attendance Timing Settings are entered as local (Mogadishu) wall-clock time.** The Manager (a School Admin operating from Mogadishu, Somalia) configured a 6:00 AM start time expecting Mogadishu wall-clock meaning, then received "Staff attendance has not opened yet for today" while it was already well past 6:00 AM locally. Root-caused (read-only diagnostic first, per the ticket's own instruction) to every Staff Attendance business-time computation reading `Date#toISOString()`, which is always UTC — a systematic offset from the school's real timezone whenever the server's own clock isn't already UTC. The Product Owner confirmed this system is currently scoped to Mogadishu, Somalia only, and directed a fixed, non-configurable timezone rather than a per-school setting. Added **Business Rule #43**: the application's operating timezone is permanently Africa/Mogadishu (UTC+3, no DST) — not a School setting, not configurable by any role, now or in any planned future version. Staff Attendance Timing Settings (Business Rule #38) are entered/interpreted as Mogadishu wall-clock time; every Staff Attendance business-time comparison (window-opening, `PRESENT`/`LATE` derivation, read-time `ABSENT` derivation, self check-in, Manager-recorded arrival, and the normal/historical Excuse date-scope split's own "today") uses Mogadishu time for "now," never UTC and never the server process's own operating-system timezone. Stored timestamps remain ordinary absolute UTC instants in the database, completely unchanged — only the business-time *interpretation* changed. Updated Business Lifecycle §11 and Business Rule #38 to state the Mogadishu interpretation explicitly, and added two Edge Cases rows. No Student-attendance rule changed; Business Rules #35–#37, #39–#42 are unchanged in *what* they require, only in *which clock* "now" is read from. See the corresponding Technical Design v2.1 and Implementation Plan Phase 16.
