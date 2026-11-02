# Dependency Report: Teacher Management

Version: 1.1

Status: Dependencies formally satisfied — see Resolution below. Still awaiting explicit Product Owner go-ahead before Teacher Management's Business Discovery begins.

Purpose: per Product Owner decision, every feature must have its dependencies formally analyzed and approved before Business Discovery (Development-Lifecycle.md Phase 1) begins — a new governance gate, added ahead of Teacher Management's own start. This report performs that analysis only. It does not begin Business Discovery: no business rules, scope, or workflow questions are addressed below.

Position in Development-Roadmap.md's Feature Delivery Sequence: **#5**, immediately after Student Management (#4, Accepted).

---

# Direct Data / Workflow Dependencies

| Feature | Is it a real dependency? | Evidence | Status |
|---|---|---|---|
| School & Platform Management | **Yes.** A Teacher belongs to exactly one school. | `docs/01-architecture/Multi-Tenancy.md`: "Teachers belong to one school." | **Accepted** (Phase 9 complete) — see Resolution below. |
| Authentication & Authorization | **Yes.** Teacher account creation, login, and RBAC. | `docs/03-business/Authentication-and-Authorization.md`: `TEACHER` is an existing role; School Admin "may create, deactivate, and reactivate user accounts for Teachers... within their own school" (Permissions, School Admin section, and Business Rule #6). The `UserRole` enum in `backend/prisma/schema.prisma` already includes `TEACHER`, and `auth.service.js`'s generic `createAccount` already permits School Admin to create a `TEACHER` account — the same code path Student Management already exercises for `STUDENT`. | **Accepted** (Phase 9 complete) — see Resolution below. |
| Class Management | **No.** Explicitly excluded by Class Management's own Scope. | `docs/03-business/Class-Management.md`: "Assigning a Teacher to a Class or Subject... — owned by Timetable" (Not Included); "A Class exists independently of any Student, Teacher, or Subject being assigned to it." | Accepted — not a blocker either way. |
| Student Management | **No.** Only a passing RBAC cross-reference, no functional dependency. | `docs/03-business/Student-Management.md` line 52: "Permissions for any other role (Teacher, Accountant) over Student data are owned by Authentication & Authorization's RBAC model, not by this document." | Accepted — not a blocker. |
| Subject Management (#6) | **No** — sequenced *after* Teacher Management. Teacher Management must not depend on it. | Development-Roadmap.md ordering. | Not started. |
| Timetable (#7) | **No** — Timetable owns Teacher-to-Class/Subject assignment and scheduling, not Teacher Management itself, per the same precedent Class Management already established (structure vs. assignment are different features). | `docs/03-business/Class-Management.md`'s Relationships: "Timetable — schedules Teacher and Subject time around the Classes and Sections this feature defines." | Not started. |

---

# Existing Groundwork Already in Place

- `UserRole` enum already includes `TEACHER` (`backend/prisma/schema.prisma`).
- Authentication & Authorization's generic account-creation service already supports creating a `TEACHER` account, scoped to the creating School Admin's own school — no new authentication/authorization mechanism would be needed, mirroring exactly how Student Management reused this same service for the `STUDENT` role.
- No `backend/src/features/teachers/` module exists yet — confirmed via search. This will be a net-new feature module.
- `docs/03-business/Teacher-Management.md` is currently an intentionally empty placeholder. Business Discovery has not begun.

---

# Resolution — Process Gap Closed

The original version of this report flagged that School & Platform Management (#1) and Authentication & Authorization (#2) — Teacher Management's two real dependencies — were functionally complete but had not themselves passed Development-Lifecycle.md's Phase 7 (Validation) → Phase 8 (Documentation) → Phase 9 (Feature Acceptance), despite the Roadmap's "one feature at a time" rule requiring exactly that before the next feature begins.

Per Product Owner decision, both features have since gone through that full process:

- **School & Platform Management**: Phase 7 Validation (`docs/08-validation/School-Management.md` — one scope gap found and consciously descoped, tracked as the new `Platform Configuration` backlog feature) and Phase 9's independent code review (`docs/00-governance/Code-Review-Report.md` — 2 Critical + 2 Major findings, all fixed and tested, including a mass-assignment vulnerability and a non-transactional school-creation orphan risk). **Now Accepted.**
- **Authentication & Authorization**: Phase 7 Validation (`docs/08-validation/Authentication-and-Authorization.md`) and Phase 9's independent code review (4 Critical + 3 Major findings; all fixed and tested except one Major — per-account rate limiting — accepted as tracked debt). **Now Accepted.**

`docs/00-governance/Development-Roadmap.md`'s Status Tracking and Feature Delivery Sequence tables have been updated accordingly.

---

# Conclusion

Both of Teacher Management's real dependencies are now formally **Accepted**, closing the process gap this report originally raised. No unmet data, workflow, or process dependency remains.

---

# Awaiting Architectural Approval

Dependencies are confirmed satisfied. Per the Product Owner's original instruction, Business Discovery for Teacher Management still does not begin automatically — it requires an explicit go-ahead to actually start Development-Lifecycle.md Phase 1 for this feature.
