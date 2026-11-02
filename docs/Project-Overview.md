# School Management System

## Project Overview

Version: 1.0

---

# Welcome

Welcome to the School Management System project.

This project follows a documentation-first development approach.

Before implementing any feature, you MUST understand the project's architecture, standards, business rules, and development workflow.

This repository is the source of truth.

Never assume requirements.

Never invent business logic.

Never skip project standards.

---

# Your Role

Your role, responsibilities, and the rules governing implementation work are defined in AI-Development-Playbook.md.

Read it before doing any implementation work.

---

# Project Philosophy

Business

↓

Architecture

↓

Quality

↓

Implementation

Implementation is always the last step.

The full philosophy is defined in Project-Constitution.md.

---

# Technology Stack

- Web: React, Vite, JavaScript, Tailwind CSS
- Mobile: Flutter
- Backend: Node.js, Express, JavaScript
- Database: PostgreSQL, Prisma ORM
- Authentication: JWT
- Authorization: RBAC

Full reasoning behind each choice is documented in Technology-Decisions.md.

---

# Repository Structure

docs/
backend/
web/
mobile/

Every application follows a feature-based architecture. See Folder-Structure.md for the full layout.

---

# Documentation Structure

The full documentation set, its organization, and mandatory reading order are defined in Documentation-Map.md.

Start there to navigate the rest of the documentation.

---

# Development Rules and Workflow

Every feature follows the same mandatory lifecycle, defined in Development-Lifecycle.md.

Business rule ownership, architecture rules, and quality rules are defined in Project-Constitution.md, System-Architecture.md, and Coding-Standards.md respectively.

If a requirement is unclear:

Stop.

Ask.

Wait.

---

# Current Project Status

Foundation

✅ Completed

Architecture

✅ Completed

Standards

✅ Completed

Business Features

🚧 In Progress — see `docs/00-governance/Development-Roadmap.md`'s Status Tracking for per-feature detail.

Implementation

🚧 In Progress — School & Platform Management, Authentication & Authorization, Class Management, Student Management, Teacher Management, Subject Management, and **Academic Year Management** are all **Accepted** (Phase 9 complete, each including an independent code review). Remaining features not started.

---

# Current Phase

Feature Delivery (Development-Roadmap.md's Phase 1 and onward) — the first seven features in the sequence all hold Feature Acceptance. No feature is currently in progress; the next feature in the approved sequence has not been started.

---

# Current Feature

None in progress. All seven sequenced features (School & Platform Management, Authentication & Authorization, Class Management, Student Management, Teacher Management, Subject Management, Academic Year Management) hold Feature Acceptance. Academic Year Management (#7) reached Acceptance most recently, 2026-07-21:

- This started as a Product Owner architectural requirement, not a bug fix: Student Management's `Enrollment.academicYear` was a free-text field with no structure, and the Product Owner explicitly directed that Academic Year become its own first-class, school-scoped feature — the same pattern that produced Subject Management — rather than a Student Management refactor. Business Discovery covered current-state review, impact analysis (Class Management's own Business Rule #5 already delegates academic-year tracking to Student Management's Enrollment), and 8 clarifying questions across two rounds.
- Business Specification (`docs/03-business/Academic-Year-Management.md` v1.1), Technical Design (`docs/06-technical-design/Academic-Year-Management.md` v1.1), Implementation Plan (`docs/07-implementation-planning/Academic-Year-Management.md` v1.0), and Phase 7 Validation (`docs/08-validation/Academic-Year-Management.md`, Passed, plus its own Addendum and Feature Acceptance Checklist) all complete. School Admin owns everything (create/update/archive/reactivate, designate exactly one Current Academic Year); Super Admin has no operational role. No stored name/label — the `YYYY/YYYY` display label is derived from the start/end dates wherever needed, never persisted.
- `setCurrentAcademicYear` is the single dedicated transition function for every `isCurrent` write, backed by the same partial-unique-index pattern Class Management already uses for its own `isFinal`. Archiving the Current Academic Year requires an atomic hand-off to a replacement in the same transaction — mirroring Class Management's own protection against archiving the currently-final Class.
- **Accepted Technical Debt** (explicit Product Owner decision): the overlap and duplicate-label checks have no database-level backstop, unlike the Current invariant; upgrading to a Postgres `EXCLUDE` constraint later would require no API or business-rule change.
- Phase 7 Validation passed with no defects found *at the time* — its own Addendum is candid that every hands-on check performed there was sequential, one request at a time, and its invariant-safety grep concluded "written in one place" meant "safe" without ever testing two requests reaching that one place simultaneously. **Independent code review** then found and fixed 2 Critical concurrency findings the Validation pass's methodology couldn't have caught: a concurrent archive + designate-Current race that corrupted a record into simultaneously `ARCHIVED` and `isCurrent: true` (live-reproduced), and concurrent first-Academic-Year creations that could 500 (live-reproduced: 4 of 8 concurrent requests failed) — the same class of gap Subject Management's own review had already found once in this codebase, not carried forward here. Both fixed with a Postgres advisory lock scoped per school, wrapping the affected functions' entire read-decide-write sequences; both reconfirmed live with the identical reproduction steps.
- Full backend suite: 564/564.

Preceding this, Subject Management (#6) reached Acceptance on 2026-07-20:

- Business Specification (`docs/03-business/Subject-Management.md` v1.1), Technical Design (`docs/06-technical-design/Subject-Management.md` v1.1), Implementation Plan (`docs/07-implementation-planning/Subject-Management.md` v1.0), and Phase 7 Validation (`docs/08-validation/Subject-Management.md`, Passed, including its Feature Acceptance Checklist) all complete. The curriculum is centrally managed by Super Admin (create/update/archive/reactivate Subjects, assign/remove Subject-to-School assignments through a dependency-validation extension point); School Admin has read-only access scoped to their own school's assigned Subjects.
- Built on **ACR-003** (School Education Levels) — Subject assignment validated through the existing `hasEducationLevel` narrow interface, never a direct `schools` table query. `Subject` is this project's first platform-wide (non-tenant-scoped) entity (Business Rule #12); `SchoolSubject` is the tenant-scoped, soft-removable assignment join.
- An independent code review (`docs/00-governance/Code-Review-Report.md`) found and fixed 2 Major findings, both live-reproduced against the running backend before being fixed and reconfirmed: a concurrency race in `assignSubjectToSchool` (20 truly-concurrent identical assignment requests could 500 instead of idempotently succeeding — a raw, uncaught Prisma `P2002`) and missing query-filter validation on `GET /subjects` (an invalid `status`/`educationLevel` filter also 500'd instead of a clean 422). A test-coverage gap flagged by the Implementation Plan's own Risk Assessment was also closed. `docs/00-governance/Documentation-Map.md` and `docs/00-governance/Project-Glossary.md` (new "Education Level"/"Subject Assignment" terms) updated during Phase 8.
- Full backend suite: 503/503.

Preceding this, three other changes landed on 2026-07-19:

- **ACR-002** (`docs/01-architecture/Architecture-Decision-Records/ACR-002-Enrollment-Section-Reference.md`) — a Product Owner request for a combined "F1A" Class+Section display convention in Class Management (presentation-only, no Business Rule change there) extended into Student Management's Enrollment/Promotion/Class Correction gaining an optional Section reference (new Business Rules #18–#20), since Promotion needed to know which Section a Student currently occupies to suggest a matching one in the destination Class. Additive and backward-compatible. Followed by a roster-filter enhancement (`GET /students`'s new optional `sectionId` filter, so the Web filter dropdown can narrow to a specific Section, not just its Class). Verified live and covered by 22 new automated tests.
- **Department removed from Teacher Management** — Product Owner domain clarification: the school organizes around curriculum Subjects (needed by multiple future modules — Subject Management, Class Management, Timetable, Exams, Marks, Report Cards), not an administrative Department owned by Teacher Management, which would have duplicated the future Subject Management feature. Department was removed entirely (not renamed) — the `Department`/`DepartmentStatus` entities, `Teacher.departmentId`, all `/departments` endpoints, and the `DepartmentsPage` Web UI are all gone; the schema migration dropped the underlying table/column (disposable dev/test data only). 31 Department-specific tests removed. `docs/03-business/Teacher-Management.md` bumped to v1.4, `docs/06-technical-design/Teacher-Management.md` to v1.7.
- **ACR-003** (`docs/01-architecture/Architecture-Decision-Records/ACR-003-School-Education-Levels.md`) — approved ahead of Subject Management's own Business Specification, to close a foreseeable data-integrity gap (a Primary-only school being assignable a Secondary-only Subject). School & Platform Management gained `educationLevels` (`PRIMARY`/`SECONDARY`, Super-Admin-only, defaulting to `[PRIMARY]`), a new `PATCH /schools/{id}/education-levels` endpoint, and a narrow `hasEducationLevel` interface for Subject Management to consume. New Business Rule #17 there (appended, not renumbered). 12 new backend tests. Verified live in the Web app; a real UI bug was found and fixed during that verification — the Education Levels checkbox form did not revert to the school's true state after a rejected removal attempt, misleadingly showing the invalid attempted change as if it had succeeded.

None of these changes reopened any other feature's own Phase 9 Feature Acceptance — see Development-Roadmap.md's Status Tracking for all four.

---

# Next Task

None in progress. The next feature in Development-Roadmap.md's approved sequence — Teacher Subject Assignment (#8), added mid-sequence ahead of Timetable (now #9) — has completed Business Discovery, Business Review, Technical Design Review, and Implementation Planning (`docs/03-business/Teacher-Subject-Assignment.md` v1.1, `docs/06-technical-design/Teacher-Subject-Assignment.md` v1.1, `docs/07-implementation-planning/Teacher-Subject-Assignment.md` v1.0, all Approved), awaiting Phase 6 (Implementation).

---

# When You Receive A Task

Follow the Implementation Contract defined in AI-Development-Playbook.md.

---

# Success Criteria

Success criteria for implementation work are defined in AI-Development-Playbook.md.

At the project level, you succeed when you follow documentation, protect architecture, maintain consistency, avoid assumptions, and implement exactly what was approved.

Quality is more important than speed.
