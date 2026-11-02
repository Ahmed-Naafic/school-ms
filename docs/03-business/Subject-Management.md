# Subject Management

Version: 1.1

Status: Approved — Phase 3 (Business Review) complete. Proceeding to Phase 4 (Technical Design).

---

# Purpose

The curriculum — the set of Subjects a school teaches — has no owning feature today. Teacher Management records a Teacher's subject specializations only as descriptive profile text (Teacher-Management.md, Scope's Not Included, v1.4); Class Management anticipates a future "Subject Management — assigns Subjects to a Class's curriculum" relationship but defines nothing itself. Nothing anywhere defines what a Subject *is*, who may define one, or which Subjects a given school actually offers.

This feature closes that gap. Per Product Owner direction, the curriculum is centrally managed: Super Admin owns the platform-wide Subject catalog — creating, updating, archiving, and reactivating Subjects — and controls which Subjects are assigned to which School. School Admin consumes that catalog: they see only the Subjects assigned to their own school, and use them in academic operations owned by other features; they have no authority to create, edit, assign, enable, disable, or delete a Subject.

Without this feature, Class Management has no Subject entity to attach to a Class's curriculum, Teacher Management's subject-specialization text has nothing authoritative to reference, and Timetable, Exams, Marks, and Report Cards each have no shared Subject identity to schedule, grade, or report against — each would otherwise invent its own placeholder, the same anti-pattern Class Management and Teacher Management were already re-sequenced to avoid. Subject Management closes that gap, the same role Class Management plays for Class and Teacher Management plays for Teacher.

This feature depends on **ACR-003** (`docs/01-architecture/Architecture-Decision-Records/ACR-003-School-Education-Levels.md`, Approved): every School now declares one or more Education Levels (Primary, Secondary), and Subject-to-School assignment is validated against them.

---

# Scope

## Included

- Super Admin defining a new Subject: its name and Education Level (Primary or Secondary).
- Super Admin updating an existing Subject's editable fields.
- Super Admin archiving a Subject, and reactivating an Archived Subject back to Active.
- Super Admin assigning a Subject to a School, and removing a Subject assignment from a School (subject to dependency validation — see Business Rules).
- Super Admin viewing the full, platform-wide Subject catalog, regardless of any school's assignments.
- School Admin viewing only the Subjects assigned to their own school.
- Providing a stable, narrow read interface for other features (Class Management, Teacher Management, and future Timetable/Exams/Marks/Report Cards) to consume Subject and Subject-assignment data, following this project's established Loose Coupling pattern (ACR-001, ACR-002, ACR-003).

## Not Included

- Building a Class's curriculum (attaching Subjects to a Class) — owned by Class Management, which already anticipates this relationship (Class-Management.md's Relationships section); this feature only supplies the Subject entity it will reference.
- Assigning a Teacher to teach a specific Subject — owned by Timetable, per Teacher-Management.md's and Class-Management.md's own precedent. This feature does not touch Teacher Management's existing `subjectSpecializations` free-text field.
- Scheduling, Timetable construction of any kind.
- Exams, Marks, Grading, and Report Cards — each is its own future feature; they will reference the Subject records this feature creates.
- Defining or managing a School's Education Level(s) — owned by School & Platform Management (ACR-003); this feature only reads that data through a narrow interface to validate Subject assignment.
- Seeding or provisioning any specific set of Subjects as platform default data — a Technical/Implementation Planning decision, not a business rule. The Primary and Secondary Subject lists below are illustrative examples of what Super Admin is expected to create, not a prescribed seed list.
- Subject-level academic content (syllabus, learning objectives, curriculum materials) — this feature defines a Subject as a named, categorized catalog entry only.

### Illustrative Education Level subject lists

Given by the Product Owner as representative examples of the curriculum Super Admin is expected to define — not seed data, and not exhaustive:

- **Primary**: Xisaab, English, Cilmiga Bulshada, Tarbiyo, Teknooloji, Saynis, Carabi, Soomaali.
- **Secondary**: Mathematics, Physics, Biology, Chemistry, Islamic Studies, Arabic, History, Geography, ICT, Business, Somali, English.

Note "English" and "Somali/Soomaali" appear in both lists — per the Subject-uniqueness decision below, each is two distinct records, one per Education Level.

---

# Actors

- **Super Admin** — the only actor who defines, edits, archives, reactivates, and assigns/removes Subjects. Never a day-to-day curriculum consumer, consistent with School-Management.md's principle that Super Admin never becomes part of a school's own operations.
- **School Admin** — a read-only consumer of the Subjects assigned to their own school; uses them in academic operations owned by other features.
- **Teacher** and **Student** — no direct role in this feature; any future consumption of Subject data on their behalf (e.g., a Teacher's assigned Subjects, a Student's enrolled Subjects) is owned by the features that define those relationships (Timetable, Class Management), not this document.

---

# Permissions

## Super Admin

- May create a new Subject (name, Education Level).
- May update an existing Subject's editable fields.
- May archive an Active Subject, and reactivate an Archived Subject.
- May assign a Subject to a School, provided the School currently has the Subject's Education Level (ACR-003).
- May remove a Subject assignment from a School, subject to dependency validation (see Business Rules).
- May view the entire platform-wide Subject catalog and every School's current assignments.

## School Admin

- May view only the Subjects currently assigned to their own school.
- May not create, update, archive, reactivate, assign, or remove a Subject or a Subject assignment, under any circumstance.
- May not view another school's assigned Subjects, or the platform-wide catalog beyond what is assigned to their own school.

## All Other Roles

- This feature defines no permissions for any role other than Super Admin and School Admin. Any future Teacher- or Student-facing access to Subject data is owned by the feature that defines that relationship (e.g., Timetable), not by this document.

---

# Business Workflow

## 1. Subject Definition

1. Super Admin creates a new Subject by providing its name and Education Level (Primary or Secondary).
2. A newly created Subject's lifecycle status defaults to Active.
3. Subject name uniqueness is scoped per Education Level, not platform-wide: two Subjects may share the same name only if they belong to different Education Levels (e.g., "English" (Primary) and "English" (Secondary) are two distinct, independently manageable records); no two Subjects with the same name may coexist within the same Education Level.

## 2. Subject Maintenance

1. Super Admin may update an existing Subject's editable fields at any time.
2. Exact editable field list beyond name and Education Level is a Technical Design decision.
3. A Subject's Education Level may be edited only while the Subject has zero School assignments. Once the Subject has been assigned to at least one School, its Education Level becomes immutable; correcting a miscategorized, already-assigned Subject requires archiving it and creating a correctly-categorized replacement (Workflow #3), not editing it in place.

## 3. Subject Lifecycle (Active / Archived)

1. Super Admin may archive an Active Subject, and reactivate an Archived Subject back to Active, per this project's Archive Before Delete principle (Decision-Making-Principles.md, Principle 16) — a Subject is never hard-deleted.
2. Archiving a Subject does not remove it from any School it is already assigned to; existing assignments remain in place unchanged, and remain visible (read-only, clearly marked Archived) to any School Admin whose school already has that assignment.
3. An Archived Subject is not eligible for new assignment to any School while Archived, consistent with how this project already treats archived entities elsewhere (e.g., an archived Class is not eligible for new Enrollment).
4. Archiving an already-Archived Subject, or reactivating an already-Active Subject, is a no-op, consistent with this project's established idempotency convention for repeatable state-setting actions (e.g., School lifecycle transitions, ACR-003's Education Level assignment).

## 4. Subject-to-School Assignment

1. Super Admin assigns a Subject to a School as an explicit, separate action from School & Platform Management's Education Level assignment (ACR-003's two-step, non-cascading workflow) — assigning an Education Level to a School never automatically assigns any Subject, and assigning a Subject never changes a School's Education Levels.
2. The assignment is only permitted if the target School currently has the Subject's Education Level; otherwise it is rejected. This is enforced by Subject Management's own service layer, consuming School & Platform Management's Education Level data only through the narrow `hasEducationLevel` interface (never querying the School table directly), per ACR-003 and this project's established Loose Coupling pattern.
3. Assigning a Subject already assigned to a School is a no-op, consistent with this project's existing idempotency convention for repeatable state-setting actions (e.g., School lifecycle transitions, ACR-003's own Education Level assignment).
4. Only an Active Subject may be newly assigned; an Archived Subject is rejected for new assignment (see Workflow #3.3).

## 5. Subject-to-School Removal

1. Super Admin may remove a Subject's assignment from a School.
2. Before removal, the system performs dependency validation: it checks whether anything currently depends on that specific Subject-School assignment, and rejects the removal if so.
3. As of this version, no feature creates any dependent record against a Subject-School assignment (Class Subjects, Teacher Assignment, Timetable, Exams, Marks, and Report Cards are all future, not-yet-built integrations), so removal always succeeds today. The dependency-validation step exists as a stable, permanent extension point — per Product Owner decision, this feature must be designed so that a future dependent feature can register its own check without Subject Management needing to change its own removal logic, rather than dependency validation being added reactively once the first real dependent exists.

## 6. School Admin Read Access

1. School Admin views the list of Subjects currently assigned to their own school.
2. School Admin never sees another school's assigned Subjects, and never sees the platform-wide catalog beyond what their own school currently has assigned.
3. This view is read-only in every respect; no action in this feature is available to School Admin.

---

# Business Rules

1. Only Super Admin may create, update, archive, reactivate, assign, or remove a Subject or a Subject-to-School assignment; School Admin has read-only access scoped to their own school's assignments and no other authority over Subject data.
2. A Subject belongs to exactly one Education Level (Primary or Secondary), fixed at the platform level per ACR-003 — `EducationLevel` is a small, fixed enum, not a managed reference list. A Subject's Education Level is editable only while it has zero School assignments; once assigned to at least one School, it becomes immutable (Business Review, v1.1). Correcting a miscategorized, already-assigned Subject requires archiving it and creating a correctly-categorized replacement — no cascading reassignment logic exists or is required.
3. Subject name uniqueness is scoped per Education Level: no two Subjects with the same name may exist within the same Education Level, but the same name may exist once per Education Level (e.g., "English" (Primary) and "English" (Secondary) are two distinct records).
4. A Subject is never hard-deleted, regardless of lifecycle status, per this project's Archive Before Delete principle (Decision-Making-Principles.md, Principle 16). Archiving and reactivation are the only lifecycle transitions. Archiving an already-Archived Subject, or reactivating an already-Active Subject, is a no-op (Business Review, v1.1).
5. Archiving a Subject does not remove it from any School it is already assigned to, and does not hide it from a School Admin whose school already holds that assignment — it remains visible there, clearly marked Archived (Business Review, v1.1), consistent with how this project treats archived entities elsewhere. An Archived Subject is not eligible for new assignment to a School until reactivated.
6. A Subject may only be assigned to a School if the School currently has the Subject's Education Level, per ACR-003. This is enforced by Subject Management's own service layer, consuming School & Platform Management's Education Level data exclusively through a narrow interface (e.g. `hasEducationLevel`), never by querying the School table directly.
7. Assigning a Subject to a School and assigning an Education Level to a School are two independent, explicitly separate actions; neither is inferred from, nor automatically triggers, the other, per ACR-003.
8. Removing a Subject's assignment from a School must pass dependency validation: the removal is rejected if any feature-owned record currently depends on that specific Subject-School assignment. As of this version, no such dependent exists, so removal always succeeds — but the check itself, and a stable extension point for future dependent features to register against, must exist regardless.
9. This feature does not define, build, or own any consumption of Subject data by Class Management, Teacher Management, Timetable, Exams, Marks, or Report Cards — those are each a future integration point, referencing the Subject records this feature creates through their own narrow interface, per this project's established Loose Coupling pattern.
10. Super Admin may view the entire platform-wide Subject catalog and every School's current Subject assignments; School Admin may view only the Subjects currently assigned to their own school.
11. Every Subject lifecycle event (creation, update, archiving, reactivation) and every Subject-to-School assignment change (assignment, removal) must be recorded for audit purposes.
12. A Subject is a platform-wide catalog entity, owned by no single school — unlike Teacher, Class, and Student, each of which is owned by exactly one school per Multi-Tenancy.md's default tenant-isolation model. Only a Subject's *assignment* to a School is tenant-scoped; the Subject definition itself (name, Education Level, lifecycle status) is platform-wide, visible in full to Super Admin, and visible to a School Admin only insofar as it is assigned to their own school (Business Review, v1.1).

---

# Edge Cases

| Situation | Expected Behavior |
|---|---|
| Super Admin attempts to create a Subject with the same name and same Education Level as an existing Subject | Rejected, per Business Rule #3. |
| Super Admin creates "English" for Primary, then separately creates "English" for Secondary | Both succeed; they are two independent records, per Business Rule #3. |
| Super Admin attempts to assign a Secondary-only Subject (e.g., Physics) to a School that only has the Primary Education Level | Rejected, per Business Rule #6 and ACR-003. |
| Super Admin assigns the Primary Education Level to a School that previously had none | Zero Subjects are assigned as a side effect; Subject assignment remains a separate, explicit action, per Business Rule #7 and ACR-003. |
| Super Admin re-assigns a Subject already assigned to a School | No-op; treated as already satisfied, per Workflow #4.3. |
| Super Admin archives a Subject that is currently assigned to one or more Schools | The existing assignments are left unchanged; the Subject becomes ineligible for any *new* assignment while Archived, per Business Rule #5. |
| Super Admin attempts to assign an Archived Subject to a School | Rejected, per Business Rule #5. |
| Super Admin reactivates a previously Archived Subject | The Subject becomes eligible for new assignment again; its existing (never-removed) assignments were never affected in the first place. |
| Super Admin archives an already-Archived Subject, or reactivates an already-Active Subject | No-op, per Business Rule #4. |
| School Admin views their school's assigned Subjects, one of which was later archived by Super Admin | The Subject remains visible in their list, clearly marked Archived, per Business Rule #5. |
| Super Admin attempts to change an unassigned Subject's Education Level | Succeeds, per Business Rule #2. |
| Super Admin attempts to change an already-assigned Subject's Education Level | Rejected with a validation error; the Subject must be archived and a correctly-categorized replacement created instead, per Business Rule #2. |
| Super Admin attempts to remove a Subject's assignment from a School once a future dependent feature (e.g., Class Subjects) references that specific assignment | Rejected by that future feature's own dependency-validation check, per Business Rule #8. Not reachable today, since no dependent exists yet. |
| Super Admin attempts to remove a Subject's assignment from a School today (no dependent features exist yet) | Succeeds, per Business Rule #8. |
| School Admin attempts to create, update, archive, reactivate, assign, or remove a Subject | Denied for every action, per Business Rule #1. |
| School Admin attempts to view another school's assigned Subjects, or the full platform-wide catalog | Denied, per Business Rule #10 and Multi-Tenancy. |

---

# Validation Rules

- A Subject cannot be created without a name and an Education Level.
- Subject name uniqueness is enforced per Education Level, not platform-wide, per Business Rule #3.
- A Subject-to-School assignment cannot be created unless the target School currently has the Subject's Education Level, per Business Rule #6 and ACR-003.
- A Subject-to-School assignment cannot be created for an Archived Subject, per Business Rule #5.
- A Subject-to-School assignment removal must pass dependency validation before it is permitted, per Business Rule #8.
- A Subject's Education Level cannot be updated once the Subject has at least one School assignment, per Business Rule #2.
- A Subject must always have a defined lifecycle status (Active or Archived).
- A Subject is never hard-deleted, regardless of lifecycle status, per Business Rule #4.
- Any Super-Admin-only field or action must never be exposed to, or writable by, School Admin, consistent with this project's existing mass-assignment guard convention (e.g., School & Platform Management's operational-profile endpoint).

---

# Relationships

- **School & Platform Management** — every Subject-to-School assignment targets a School created and kept active by that feature; Subject assignment is validated against that School's Education Levels through a narrow interface (`hasEducationLevel`), per ACR-003. This feature never queries the School table directly.
- **Class Management** — expected future consumer: Class-Management.md already anticipates "Subject Management — assigns Subjects to a Class's curriculum; depends on this feature's Class structure existing first." Building that relationship is Class Management's own future work, not this document's.
- **Teacher Management** — Teacher-Management.md currently records a Teacher's subject specializations as descriptive free text only, explicitly deferring the functional "Teacher ↔ Subject assignment" integration to this feature (Teacher-Management.md's Relationships and Scope's Not Included, v1.4). Building that integration is a future decision for both features jointly, not this document's current scope.
- **Timetable, Exams, Marks, Report Cards** (all future/backlog) — each is expected to reference the Subject records this feature creates, and Subject-to-School assignments specifically, once built. Each such integration is its own future Business Discovery, and each is expected to register its own dependency-validation check against Subject-to-School assignment removal, per Business Rule #8.
- **Audit Logs** — every Subject lifecycle event and every Subject-to-School assignment change is recorded there.

---

# Reports

A Super Admin-facing, platform-wide Subject catalog (filterable by Education Level and lifecycle status), and a School Admin-facing list of Subjects assigned to their own school, are both expected, consistent with other management features' roster/listing conventions. Exact report contents are a later design decision.

---

# Notifications

This feature defines no end-user notifications. Subject and Subject-assignment lifecycle changes are captured via Audit Requirements only; no actor is directly notified of a Subject being created, updated, archived, reactivated, assigned, or removed.

---

# Audit Requirements

The following events must be recorded, each including Tenant (where applicable — Subject definition itself is platform-wide, not tenant-scoped), User, Action, and Timestamp per the standard audit record defined in Multi-Tenancy.md:

- Subject created
- Subject updated
- Subject archived
- Subject reactivated
- Subject assigned to a School
- Subject assignment removed from a School

---

# Acceptance Criteria

- Super Admin's exclusive authority over Subject definition, lifecycle, and School assignment is unambiguous; School Admin's access is unambiguously read-only and scoped to their own school.
- Subject name uniqueness is clearly scoped per Education Level, not platform-wide.
- Archive Before Delete is explicitly applied to Subjects: no hard delete, no automatic removal from existing School assignments, reactivation supported.
- The two-step, non-cascading relationship between School Education Level assignment (ACR-003) and Subject-to-School assignment is unambiguous: neither infers or triggers the other.
- Subject-to-School assignment is validated against the target School's Education Levels through a narrow interface, never a direct cross-feature table query.
- Subject-to-School assignment removal is gated by a dependency-validation extension point, designed to support future dependent features without requiring this feature's own removal logic to change later.
- Tenant isolation is preserved in every scenario described (School Admin never sees another school's assignments).
- All edge cases have a defined expected behavior.
- This document is reviewed and approved by the Product Owner before Technical Design begins.

---

# Business Decisions Required

None remain. All items raised during Business Discovery were resolved at Phase 3 Business Review:

- **Is a Subject's Education Level mutable after creation?** Resolved — editable only while the Subject has zero School assignments; immutable once assigned to at least one School. Correcting a miscategorized, already-assigned Subject requires archiving it and creating a correctly-categorized replacement; no cascading reassignment logic exists or is required (Business Rule #2).
- **Does an Archived Subject remain visible to School Admin** wherever it is already assigned? Resolved — yes, remains visible, clearly marked Archived, consistent with Archive Before Delete treatment elsewhere in this project (Business Rule #5).
- **Exact Subject field list beyond name and Education Level** (e.g., a short code, description) — closed without a Product Owner decision needed: this is a Technical Design matter, consistent with how this project has left exact field lists to Technical Design elsewhere (Teacher-Management.md Business Rule #11). The uniqueness rule (Business Rule #3) already establishes name + Education Level as the business-required minimum and uniqueness key.
- **Exact shape of the dependency-validation extension point** (Business Rule #8) — closed without a Product Owner decision needed: this document commits to the business-level requirement (a stable, registerable check that can reject removal); its concrete technical mechanism is Technical Design's job, consistent with how narrow-interface extension points have been specified at the business level and designed at the technical level elsewhere in this project (ACR-001, ACR-002, ACR-003).
- **Business Review also identified two gaps not raised during Business Discovery**, both resolved by applying already-established project conventions rather than new judgment calls: Subject's platform-wide (not per-school) tenant-scoping model was never stated explicitly (Business Rule #12), and Archive/Reactivate had no defined idempotency behavior for a redundant repeat (Business Rule #4).

---

# Future Considerations

These do not affect and must not influence the current business rules above.

- Class Management's own future integration: attaching Subjects to a Class's curriculum.
- Teacher Management's own future integration: a functional Teacher ↔ Subject assignment, replacing or supplementing today's descriptive-only `subjectSpecializations` text field.
- Timetable, Exams, Marks, and Report Cards, once each exists as its own feature — all expected future consumers of the Subject records and Subject-to-School assignments this feature creates.
- Bulk Subject creation or import (e.g., spreadsheet), if the illustrative Primary/Secondary lists in this document's Scope turn out to need faster provisioning than one-at-a-time creation.
- Removing a School's Education Level once it has Subjects assigned under it — explicitly out of scope for ACR-003 and, by extension, for this document; any future support for that would need its own dependency-validation treatment, likely similar in shape to Business Rule #8.

---

# Change History

- v1.0 — Initial draft, following Business Discovery per Product Owner direction (curriculum centrally managed by Super Admin; School Admin read-only). Incorporates ACR-003 (School Education Levels) and four Product Owner clarifications resolved during Business Discovery: Subject uniqueness scoped per Education Level; Archive Before Delete applied to Subjects with no auto-removal from School assignments and reactivation supported; no dependency validation exists today but a stable extension point is required; and ACR-003's two-step, non-cascading Education-Level-then-Subject assignment workflow. Four items remain open for Phase 3 Business Review — see Business Decisions Required.
- v1.1 — Phase 3 Business Review conducted. Two gaps found and refined without needing a new Product Owner decision (Subject's platform-wide tenant-scoping model made explicit as Business Rule #12; Archive/Reactivate idempotency added to Business Rule #4). Two genuine open decisions from v1.0 resolved by the Product Owner: a Subject's Education Level is editable only while it has zero School assignments, immutable thereafter (Business Rule #2); an Archived Subject remains visible to School Admin wherever already assigned, clearly marked Archived (Business Rule #5). The remaining two v1.0 open items (exact field list; dependency-validation mechanism) closed as Technical Design matters, not Product Owner decisions. New Edge Cases and Validation Rules added accordingly. **Approved by the Product Owner** — Business Review complete, proceeding to Phase 4 Technical Design.
