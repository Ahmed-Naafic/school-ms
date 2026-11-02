# Student Management

Version: 1.7

Status:
- Implemented and Validated — see `docs/08-validation/Student-Management.md`. Pending Feature Acceptance (Development-Lifecycle.md Phase 9).

---

# Purpose

A school cannot record Attendance, administer an Exam, charge a Fee, or issue an Online Passcard for someone who does not yet exist in the system as a Student.

This feature defines how a Student comes into existence within a school (Admission), how they are placed into the school's academic structure (Enrollment), how their record changes over time (Promotion, Transfer, Withdrawal, Graduation), and how their own login access is established.

Without this feature, there is no Student record for any other business feature — Attendance, Exam, Fees, Online Passcard — to reference. It is the first school-level feature built, once School & Platform Management and Authentication & Authorization exist, because a school and its Authentication mechanics must exist before a Student can be admitted into either.

---

# Scope

## Included

- Admission of a new Student into a school.
- Creating the Student's own login account as part of Admission (triggering Authentication & Authorization's account-creation mechanics).
- Enrollment of a Student into an Academic Year (a record owned by Academic Year Management) and Class, and — when the Class is organized into Sections — a specific Section within it (ACR-004).
- Maintaining a Student's profile and identifying information.
- Promotion of a Student to the next Class.
- Transfer of a Student out of a school to another school on the platform.
- Withdrawal of a Student who leaves the school without transferring to another school on the platform, and restoring a Withdrawn Student back to Active.
- Graduation of a Student who completes the final academic level.
- Correcting a Student's current Class assignment (an administrative data fix, distinct from Promotion).
- A Student viewing their own record.

## Not Included

- Attendance, Exam, Fees, and Online Passcard themselves — each is owned by its own feature and only references the Student record this feature creates.
- Creation, structure, or naming of a Class, Section, or Subject — owned by Class Management and Subject Management. This feature only assigns a Student to a Class that already exists.
- The mechanics of authentication itself (login, credential recovery, lockout) — owned by Authentication & Authorization. This document only defines when a Student account is created or deactivated, not how login works.
- Parent portal access — not an approved role today, per Authentication-and-Authorization.md's Future Enhancements. Parent information is captured here only as profile data, not as a system actor.
- Timetable assignment — owned by Timetable, which references the Class a Student is enrolled in.
- Any link between a Transfer and a specific destination school — Transfer is a one-way event recorded only by the originating school; no destination-school reference is stored, and no data or notification is shared with another school. Inter-school transfer linkage, if ever wanted, is a separate future feature, not part of this one.

---

# Actors

- **School Admin** — the only actor who manages a Student's lifecycle (Admission, Enrollment, Promotion, Transfer, Withdrawal, Graduation, profile updates) within their own school.
- **Student** — the subject of this feature; may view their own record.
- **Super Admin** — has no operational role here, consistent with School-Management.md: Super Admin must never become part of a school's day-to-day business operations.

Permissions for any other role (Teacher, Accountant) over Student data are owned by Authentication & Authorization's RBAC model, not by this document — see Permissions below.

---

# Permissions

## School Admin

- May admit a new Student into their own school.
- May enroll a Student into an academic year and Class within their own school.
- May update a Student's profile and identifying information within their own school.
- May promote a Student to the next Class within their own school.
- May transfer a Student out of their own school to another school on the platform.
- May withdraw a Student who leaves their own school without transferring to another school on the platform.
- May restore a Withdrawn Student back to Active within their own school. May not restore a Transferred or Graduated Student — those are permanent.
- May graduate a Student who completes the final academic level within their own school.
- May correct a Student's current Class assignment within their own school, as an administrative fix distinct from Promotion.
- May not admit, enroll, or otherwise manage a Student belonging to another school.

## Student

- May view their own profile and enrollment information.
- May not view another Student's record.
- May not change their own enrollment, Class, or lifecycle status.

## All Other Roles

- This feature defines no permissions for any role other than School Admin and Student. Any other role's access to Student data is owned by Authentication & Authorization's RBAC model, not by this document.

---

# Business Workflow

## 1. Admission

1. School Admin registers a new Student into their own school, capturing identifying information and parent contact information.
2. As part of Admission, a Student login account is created, per Authentication & Authorization's account-creation mechanics (Business Rule #16 there: every enrolled Student is issued individual login credentials).
3. The new Student account follows the same initial-credential-setup process as any other created account — the Student establishes their own credentials rather than School Admin choosing one on their behalf.

## 2. Enrollment

1. School Admin assigns the admitted Student to an Academic Year (a record owned by Academic Year Management) and a Class.
2. If the school has not yet created any Academic Year, Enrollment is rejected — School Admin must create at least one Academic Year first, per Academic Year Management, before any Student can be enrolled (ACR-004).
3. The selected Academic Year must belong to the same school and must not be Archived; an Archived Academic Year is never a valid Enrollment target (ACR-004).
4. If the Class is organized into one or more active Sections (Class Management), School Admin must also assign the Student to one of them — a Class with active Sections is no longer directly enrollable without choosing one. If the Class has no Sections at all, no Section is assigned (ACR-002).
5. A Student must be enrolled before they can be referenced by Attendance, Exams, or Timetable.
6. Enrollment history is preserved over time, not overwritten, so a Student's Academic Year, Class, and Section history remain visible after Promotion.

## 3. Promotion

1. At the point the school decides (typically end of academic year), School Admin promotes a Student to the next Class.
2. The new Enrollment's Academic Year defaults to the school's Current Academic Year (per Academic Year Management) as a suggestion only — School Admin may instead choose any other non-Archived Academic Year belonging to the school. If the school has no Academic Years at all, Promotion is rejected, the same as Enrollment (ACR-004).
3. If the Student's current Enrollment has a Section, and the destination Class has a Section with the same name, that Section is suggested as the default for the new Enrollment — School Admin may still choose differently. If no same-named Section exists in the destination Class, no Section is pre-selected, and School Admin must choose one explicitly if the destination Class has active Sections (ACR-002). This suggestion is always derived from actual Section records, never inferred from any combined display naming convention.
4. Promotion creates a new Enrollment record for the new Academic Year, Class, and (if applicable) Section; the prior Enrollment record is preserved, not deleted, per the Archive Before Delete principle.

## 3a. Class Correction

1. School Admin may correct a Student's current Class assignment — an administrative fix for a data-entry mistake, not an academic-progression event.
2. Unlike Promotion, a Class Correction does not create a new Enrollment record, does not require or record a new academic year, and never triggers a Graduation-eligibility evaluation, even if the corrected Class happens to be the school's final Class. It updates the Student's current Enrollment record in place.
3. A Class Correction is recorded for audit purposes with the previous Class, the new Class, who made the change, when, and an optional reason, per this feature's Audit Requirements.
4. A Class Correction is only available while a Student's academic placement is still active — status `ACTIVE` or `ELIGIBLE_FOR_GRADUATION`. It is not available for a Transferred, Withdrawn, or Graduated Student: Transfer and Graduation finalize the Student's academic history, and Withdrawal pauses it; correcting the Class afterward would leave a finalized record (a Transfer's summary, a Graduation) internally inconsistent with the Enrollment it describes. If a Withdrawn Student is restored to Active, Class Correction becomes available again.

## 4. Transfer

1. School Admin marks a Student as transferring to another school on the platform.
2. The Student's record and account are archived and deactivated at the current school, per Archive Before Delete — never deleted.
3. A summary record — the Student's prior Class and an academic summary — is generated and attached to the Student's own archived Enrollment at the originating school only. Detailed Attendance, Exam, and Fees records remain archived at the original school and are not shared with the receiving school.
4. Transfer is a one-way business event recorded only by the originating school. **It creates no relationship between two schools on the platform.** No destination school is selected or stored; the system never notifies another school; no record is shared automatically. Whatever the summary contains must be communicated to the receiving school by School Admin through some means outside this system (e.g., a printed or verbally-relayed note) — this feature has no mechanism for that hand-off.
5. The receiving school, whenever the Student actually enrolls there, performs its own independent Admission and Enrollment — a brand-new Student record, entirely disconnected from the originating school's record. If direct inter-school transfer linkage is ever wanted, it is a separate feature requiring its own Business Specification and architectural review — not an extension of this workflow.
6. Unlike Withdrawal, Transfer is permanent — there is no restoration action. Correcting a mistaken Transfer is a separate administrative correction process, not a simple restore.

## 5. Withdrawal

1. School Admin marks a Student as Withdrawn when they leave the school without transferring to another school on the platform.
2. The Student's record and account are archived and deactivated at the school, per Archive Before Delete — never deleted.
3. Unlike Transfer, Withdrawal generates no summary record, since there is no receiving school.

## 5a. Withdrawal Restoration

1. Unlike Transfer and Graduation, Withdrawal is reversible: School Admin may restore a Withdrawn Student back to Active status within their own school.
2. Restoration reactivates the Student's account, using the same account-reactivation mechanics defined in Authentication & Authorization.
3. Restoration does not automatically re-create an Enrollment. Depending on how much time has passed and whether the Student's prior Class assignment still applies, School Admin may need to enroll or promote the restored Student again through the ordinary Enrollment or Promotion workflow.
4. Restoration is recorded for audit purposes, per this feature's Audit Requirements.

## 6. Graduation

1. Once a Student is promoted into the school's final Class (as designated by Class Management), the system transitions them into the "Eligible for Graduation" lifecycle state. This is a one-way business event, not a live-recomputed flag: once reached, it is never automatically reversed by a later administrative change (e.g., Class Management redesignating which Class is final) — see Business Rule #10.
2. Reaching "Eligible for Graduation" does not by itself graduate a Student — School Admin must manually confirm Graduation.
3. The Student's record is archived and their account is deactivated, per Archive Before Delete — never deleted.
4. Graduation is permanent — there is no restoration action, unlike Withdrawal. Graduation is a final academic event; correcting a mistaken Graduation is an administrative correction process, not a simple restore.

## 7. Self-Service Viewing

1. A Student logs in and views their own profile and enrollment information.
2. A Student never sees another Student's record, per Multi-Tenancy's "Students can access only their own information."

---

# Business Rules

1. Only School Admin may admit a new Student into their own school.
2. A Student belongs to exactly one school at a time, per Multi-Tenancy.
3. Every admitted Student is issued individual login credentials as part of Admission, per Authentication-and-Authorization.md Business Rule #16.
4. A Student must be enrolled in exactly one Class at a time within their school, and — when that Class has active Sections — exactly one Section within it (Business Rule #18, added by ACR-002).
5. Enrollment history is preserved when a Student is promoted; a new Enrollment record is created rather than the prior one being overwritten.
6. Only School Admin may enroll, promote, transfer, withdraw, restore, correct the Class of, or graduate a Student within their own school.
7. Transfer, Withdrawal, and Graduation each end a Student's active status at their current school. Per Archive Before Delete, the record is archived (preserved, inactive) rather than deleted.
8. Withdrawal is distinct from Transfer: Withdrawal generates no summary record; Transfer generates one. Neither this feature nor any other stores or selects which specific school is "receiving" a Transferred Student — that fact exists only in the real world, never as platform data or a relationship between two School records.
9. A Transfer generates a summary record (the Student's prior Class and an academic summary), attached only to the Student's own archived Enrollment at the originating school. This is never automatically shared with, or linked to, another school's data — Multi-Tenancy's tenant isolation applies here without exception; whoever handles the Student's new Admission elsewhere must be given this information by some means outside the system.
10. A Student transitions into the "Eligible for Graduation" lifecycle state once promoted into the school's final Class. This transition is a one-way business event: once reached, it persists even if Class Management later changes which Class is designated final — it is never retroactively revoked by that kind of administrative change. Graduation itself always requires School Admin's manual confirmation of an already-eligible Student — it is never automatic.
11. A Student may access only their own profile and enrollment information; they may never view or modify another Student's record.
12. Deactivating a Student's account upon Transfer, Withdrawal, or Graduation follows the same account-deactivation mechanics defined in Authentication & Authorization; it does not delete the underlying Student record.
13. Every Student lifecycle event (Admission, Enrollment, Promotion, Transfer, Withdrawal, Withdrawal Restoration, Class Correction, Graduation, profile update) must be recorded for audit purposes.
14. Withdrawal is reversible: School Admin may restore a Withdrawn Student to Active, reactivating their account via the same mechanics Authentication & Authorization defines for account reactivation. Restoration does not automatically re-create an Enrollment.
15. Transfer and Graduation are permanent. Neither has a restoration action. A Transfer crosses tenant boundaries (the receiving school's Admission is an independent record); Graduation is a final academic event. Correcting either requires a separate, controlled administrative correction process, not a simple restore.
16. A Class Correction updates a Student's current Enrollment's Class in place. It creates no new Enrollment record, requires no new academic year, and never evaluates or changes Graduation eligibility — even if the corrected Class is the school's final Class. It is not a Promotion and must never be used as a substitute for one. It is only available for a Student whose status is `ACTIVE` or `ELIGIBLE_FOR_GRADUATION` — never for a Transferred, Withdrawn, or Graduated Student, since correcting the Class afterward would make a finalized historical record (a Transfer's summary, a Graduation) inconsistent with the Enrollment it describes. Restoring a Withdrawn Student to Active makes Class Correction available again.
17. Every Class Correction is audited with the previous Class, the new Class, who made the change, when, and an optional reason.
18. **(ACR-002)** Enrollment may reference a Section, in addition to a Class. A Section is optional at the platform level but conditionally required in practice: an Enrollment into a Class that has one or more active Sections must specify one of them; an Enrollment into a Class with no Sections at all leaves the Section unset. A Section reference must always belong to the same Class as the Enrollment itself — a Section from a different Class is never a valid combination, regardless of how the two Classes relate in the school's sequence. Enrollment into an archived Section is never permitted, mirroring Class-Management.md Business Rule #9's "no new Enrollment into an archived Class."
19. **(ACR-002)** Promotion's destination-Section suggestion is derived only from actual Section records in the destination Class, matched by name against the Student's current Section, and offered only as a default — never enforced, and never derived by parsing any combined Class+Section display name (Class-Management.md's presentation-only naming convention).
20. **(ACR-002)** A Class Correction may also correct a Student's current Section, subject to the same "must belong to the corrected Class" and "not archived" constraints as Enrollment (Business Rule #18). Correcting only the Section, leaving the Class unchanged, is permitted.
21. **(ACR-004)** Every new Enrollment must reference a real Academic Year owned by Academic Year Management, rather than free text. The reference must belong to the same school and must not be Archived, validated only through Academic Year Management's own narrow interface (`getAcademicYearById`, `listActiveAcademicYears`) — this feature never queries Academic Year Management's underlying data directly.
22. **(ACR-004)** Enrollment and Promotion are both rejected if the school has not yet created any Academic Year of its own.
23. **(ACR-004)** Promotion's Academic Year is pre-filled with the school's Current Academic Year (via `getCurrentAcademicYear`) as a default suggestion only, never enforced; School Admin may choose any other non-Archived Academic Year belonging to the school — the same "suggest, never enforce" pattern Business Rule #19 already established for Section defaults.
24. **(ACR-004)** Enrollment records created before this change retain their original free-text academic year value permanently. This feature never migrates or backfills those historical rows onto the new Academic Year reference.

---

# Edge Cases

| Situation | Expected Behavior |
|---|---|
| School Admin attempts to enroll a Student who has not yet been admitted | Not possible; Admission must occur first, per Business Rule #4. |
| A Student is promoted before the prior academic year's Enrollment record is closed out | Both records must remain distinct and preserved; Promotion never overwrites the prior Enrollment. |
| A Student leaves the school without transferring to another school on this platform | Recorded as a Withdrawal (Business Workflow #5), not a Transfer, per Business Rule #8. |
| A Student reaches the school's final Class but School Admin never confirms Graduation | The Student remains enrolled indefinitely in the "Eligible for Graduation" state; the system does not auto-graduate, per Business Rule #10. |
| Class Management changes which Class is designated final after Students already reached "Eligible for Graduation" under the previous designation | Those Students keep their "Eligible for Graduation" state; only future eligibility determinations use the new designation, per Business Rule #10. |
| A transferred, withdrawn, or graduated Student's account is used to attempt login | Access denied, since the account is deactivated, per Authentication & Authorization's deactivation rules. |
| Two Students at the same school share the same name | The system must uniquely identify each Student regardless of name similarity. |
| A Student attempts to view another Student's profile | Denied, per Multi-Tenancy and Business Rule #11. |
| School Admin attempts to restore a Transferred or Graduated Student | Not possible; only a Withdrawn Student can be restored, per Business Rule #15. |
| School Admin restores a Withdrawn Student whose prior Class no longer exists or is archived | Restoration itself always succeeds (it only reactivates the account); School Admin must then Enroll or Promote the Student into a currently valid Class separately, per Business Rule #14. |
| School Admin uses Class Correction instead of Promotion to move a Student to a new academic year | Not the intended use; Class Correction never creates a new Enrollment or academic year — School Admin must use Promotion for genuine academic progression, per Business Rule #16. |
| School Admin corrects a Student's Class to the school's final Class | Graduation eligibility is not evaluated or changed by a Class Correction, even in this case, per Business Rule #16. |
| School Admin attempts a Class Correction on a Transferred, Withdrawn, or Graduated Student | Rejected; Class Correction is only available for `ACTIVE` or `ELIGIBLE_FOR_GRADUATION` Students, per Business Rule #16. Restoring a Withdrawn Student to Active makes it available again. |
| School Admin attempts to enroll a Student into a Class that has one or more active Sections, without specifying a Section | Rejected; a Section is required once the Class has any active Sections, per Business Rule #18 (ACR-002). |
| School Admin attempts to enroll a Student into a Section belonging to a different Class than the one selected | Rejected; a Section must belong to the same Class as the Enrollment, per Business Rule #18 (ACR-002). |
| School Admin attempts to enroll a Student into an archived Section | Rejected, mirroring "no new Enrollment into an archived Class," per Business Rule #18 (ACR-002). |
| A Student is promoted, and the destination Class has no Section matching their current Section's name | No Section is pre-selected; School Admin must choose one explicitly if the destination Class has active Sections, per Business Rule #19 (ACR-002). |
| A Student is promoted from a Class with Sections into a destination Class that has no Sections at all | No Section is carried over or required; the new Enrollment has no Section, per Business Rules #18/#19 (ACR-002). |
| School Admin corrects a Student's Class to one with active Sections, without specifying a Section | Rejected; the same "Section required" rule Enrollment follows applies to Class Correction, per Business Rule #20 (ACR-002). |
| School Admin attempts to enroll or promote a Student in a school with zero Academic Years | Rejected; School Admin must create at least one Academic Year first, per Business Rule #22 (ACR-004). |
| School Admin attempts to enroll or promote a Student into an Archived Academic Year | Rejected, mirroring "no new Enrollment into an archived Class/Section," per Business Rule #21 (ACR-004). |
| A Student is promoted and the school has more than one non-Archived Academic Year | The school's Current Academic Year is pre-selected as a suggestion only; School Admin may choose any other non-Archived Academic Year instead, per Business Rule #23 (ACR-004). |
| An Enrollment record created before ACR-004 is viewed or reported on | Its original free-text academic year value is shown unchanged; it has no Academic Year reference and none is retroactively added, per Business Rule #24 (ACR-004). |

---

# Validation Rules

- A Student cannot be enrolled without first being admitted.
- A Student cannot be admitted without an owning school.
- A Student must always have a defined lifecycle status (e.g., active, eligible for graduation, transferred, withdrawn, graduated). Exact status values are a Technical/Database Design decision, not defined here.
- A Student must have at least the identifying and parent contact information School Admin needs to complete Admission; exact required fields are a Technical Design decision.
- A Transfer must generate a summary record (prior Class and academic summary) for the receiving school; a Withdrawal does not.
- The "Eligible for Graduation" transition is recorded as a one-way lifecycle state change once a Student reaches the school's final Class, not recomputed live from the current final-Class designation; confirming Graduation is always a separate, manual School Admin action, never automatic.
- **(ACR-002)** An Enrollment's Section, when present, must belong to the same Class as the Enrollment and must not be archived. A Section is required whenever the target Class has one or more active Sections, and must be absent (unset) whenever the target Class has none.
- **(ACR-004)** Every new Enrollment's Academic Year reference, when required, must belong to the same school and must not be Archived; it is validated only through Academic Year Management's own narrow interface. Enrollment records created before ACR-004 keep their original free-text academic year value and require no Academic Year reference.

---

# Relationships

- **Authentication & Authorization** — Student account creation and deactivation are triggered by this feature but executed per Authentication & Authorization's own rules and mechanics.
- **School & Platform Management** — every Student belongs to a school created and kept active by that feature.
- **Class Management** — Enrollment and Promotion assign a Student to a Class that Class Management owns; Class Management also designates which Class is the school's final academic level, which triggers this feature's own "Eligible for Graduation" transition (defined and owned entirely by this document, per Business Rule #10 — Class Management only supplies the designation, not the transition's one-way behavior). **(ACR-002)** Enrollment and Promotion may also reference a Section within that Class, consumed through Class Management's own narrow interface — this feature never queries Class Management's Section data directly. Section naming/display (e.g., the combined "F1A" convention) is entirely Class Management's own presentation concern and has no bearing on this feature's own data or logic.
- **Academic Year Management** — **(ACR-004)** Enrollment and Promotion reference an Academic Year owned by that feature, consumed only through its own narrow interface (`getAcademicYearById`, `getCurrentAcademicYear`, `listActiveAcademicYears`) — this feature never queries Academic Year Management's underlying data directly. Existing Enrollment records predating this change keep their original free-text academic year value; only new Enrollment/Promotion require a real Academic Year reference, and a school with zero Academic Years cannot enroll or promote until it creates one.
- **Attendance, Exam, Fees, Online Passcard** — each references the Student record this feature creates and maintains.
- **Audit Logs** — every Student lifecycle event is recorded there.

---

# Reports

A School Admin-facing Student roster (list of currently enrolled Students, filterable by Class) is expected, consistent with other management features. Exact report contents are a later design decision.

---

# Notifications

- Admission may trigger a notification to the new Student with instructions to establish their initial login credentials, consistent with Authentication & Authorization's account-creation notification.
- Promotion, Transfer, Withdrawal, Withdrawal Restoration, and Graduation may each trigger a notification to the affected Student. Exact scope is left flexible here, consistent with how Authentication & Authorization left role/status-change notification scope open.

The delivery channel for these notifications is a Technical Design decision, not a business rule.

---

# Audit Requirements

The following events must be recorded, each including Tenant (school), User, Action, and Timestamp per the standard audit record defined in Multi-Tenancy.md:

- Student admitted
- Student enrolled
- Student profile updated
- Student promoted
- Student Class corrected (recorded with previous Class, new Class, who made the change, when, and an optional reason)
- Student transferred
- Student withdrawn
- Student withdrawal restored
- Student became eligible for Graduation
- Student graduated

---

# Acceptance Criteria

- Every Student lifecycle state (Admission, Enrollment, Promotion, Class Correction, Transfer, Withdrawal, Withdrawal Restoration, Graduation) and its effect on account access is clearly defined.
- Only School Admin has authority over Student lifecycle actions within their own school; this is unambiguous.
- Tenant isolation is preserved in every scenario described.
- All edge cases have a defined expected behavior.
- This document is reviewed and approved by the Product Owner before Technical Design begins.

---

# Business Decisions Required

None remain. All three questions from initial drafting were resolved by the Product Owner:

- Withdrawal is a Student lifecycle event distinct from Transfer — added to Project-Glossary.md's Student Lifecycle section, per its Change Process (Business Rule #8).
- Transfer generates a summary record (prior Class and academic summary) for the receiving school; detailed Attendance, Exam, and Fees records remain archived at the original school (Business Rule #9).
- A Student transitions into the "Eligible for Graduation" lifecycle state once reaching the school's final Class. This is a one-way business event, not a live-recomputed flag: it persists even if Class Management later redesignates the final Class, and Graduation itself always requires School Admin's manual confirmation (Business Rule #10).

Three further questions, raised after Implementation began, were also resolved by the Product Owner:

- Reversibility of terminal states is decided per lifecycle event, not by one blanket rule: Withdrawal is reversible (School Admin may restore to Active); Transfer and Graduation are permanent, with no restoration action (Business Rules #14, #15).
- Class Correction is a distinct administrative action from Promotion, for fixing a data-entry mistake: it updates the current Enrollment's Class in place, creates no new Enrollment or academic year, and never evaluates Graduation eligibility (Business Rules #16, #17).
- Transfer creates no relationship between two schools on the platform: no destination-school reference is stored, no other school is notified, and no record is shared automatically. The receiving school always performs its own, entirely independent Admission (Business Rules #8, #9).

---

# Future Considerations

These do not affect and must not influence the current business rules above.

- Bulk Admission/Enrollment (e.g., spreadsheet import).
- Document/attachment storage for Admission records (e.g., birth certificate, prior school records).
- An alumni-facing view for graduated Students.
- Direct inter-school transfer linkage (a real platform relationship between an outgoing Transfer and a specific receiving school, with automatic data hand-off). If ever wanted, this is its own future feature with its own Business Specification and architectural review — not an extension of Transfer as designed here.

---

# Change History

- v1.0–v1.2 — Initial specification through the Admission/Enrollment, Withdrawal Restoration, and Class Correction decision rounds.
- v1.3 — Clarified Transfer's explicit no-cross-school-link design (Business Rule #9) after Product Owner review.
- v1.4 — Phase 7 (Validation) passed with no new defects; see `docs/08-validation/Student-Management.md`. Status updated to Implemented and Validated, pending Phase 9 (Feature Acceptance). The `guardianName`/`guardianContact` fields were renamed to `parentName`/`parentContact` (terminology only, no business-rule change) and a known implementation gap — no correction path for a mistaken Transfer or Graduation — was recorded and tracked as the separate `Administrative Corrections` backlog feature (`docs/03-business/Administrative-Corrections.md`), not a change to this feature's own permanence rules.
- v1.5 — Refined Business Rule #16 following an independent code review finding: Class Correction is now restricted to `ACTIVE`/`ELIGIBLE_FOR_GRADUATION` Students only (previously available for any status), since correcting the Class of a Transferred, Withdrawn, or Graduated Student could leave a finalized historical record (a Transfer's summary, a Graduation) inconsistent with the Enrollment it describes. This refines, rather than reverses, the earlier decision that Class Correction is a distinct administrative action from Promotion.
- v1.6 — ACR-002 (`docs/01-architecture/Architecture-Decision-Records/ACR-002-Enrollment-Section-Reference.md`) approved: Enrollment (and, by extension, Promotion and Class Correction) may now reference a Section within the assigned Class, added as Business Rules #18–#20. Originated from a Product Owner request to Class Management for a combined "F1A" Class+Section display convention (presentation-only, no change to Class Management's own data model); extending that to Promotion required Enrollment to be able to express which Section a Student currently occupies, which it could not do at all before this change. Additive and backward-compatible: existing Enrollments are unaffected, and a Class with no Sections behaves exactly as before.
- v1.7 — ACR-004 (`docs/01-architecture/Architecture-Decision-Records/ACR-004-Enrollment-Academic-Year-Reference.md`) approved: Enrollment gains a real Academic Year reference, owned by Academic Year Management, replacing free text for all new Enrollment/Promotion going forward — added as Business Rules #21–#24. Originated from a Product Owner review identifying `Enrollment.academicYear` as unstructured free text; Academic Year Management was deliberately built as its own feature without this wiring, deferring it to this ACR. Additive and backward-compatible: existing Enrollment rows keep their original free-text value permanently and are never migrated or backfilled; a school with zero Academic Years cannot enroll or promote a Student until it creates one; Promotion's Academic Year defaults to the school's Current Academic Year as a suggestion only, never enforced.
