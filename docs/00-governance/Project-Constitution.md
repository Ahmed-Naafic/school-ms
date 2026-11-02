# Project Constitution

Version: 1.0

---

# 1. Project Goal

Build a high-quality, scalable, maintainable, and secure School Management System that can be used by multiple schools without major architectural changes.

The project is developed like a production system, not just a university project.

---

# 2. Core Philosophy

Our priority order is:

Business
    ↓
Architecture
    ↓
Quality
    ↓
Code

Code is the last step, not the first.

---

# 3. Development Workflow

Every feature must go through the same lifecycle.

No feature skips a step.

See Development-Lifecycle.md for the full lifecycle definition.

---

# 4. Feature Rule

We only work on one feature at a time.

Example

Student Management

✔ Finish completely

↓

Teacher Management

✔ Finish completely

↓

Class Management

No parallel feature development.

---

# 5. Business First

Before writing code, we must fully understand:

Purpose
Workflow
Business rules
Permissions
Exceptions
Edge cases

If the business is unclear,
we stop.

---

# 6. No Assumptions

The architect (ChatGPT) will never invent business rules.

Instead,

Ask for clarification when needed.
Identify missing scenarios.
Refine your decisions.
Suggest improvements.
Wait for approval.

The final business decisions always belong to the Product Owner (you).

---

# 7. Architecture First

No implementation before agreeing on:

Structure
Responsibilities
Boundaries
Dependencies

---

# 8. Single Responsibility

Every module has one purpose.

Example

Student Module

Only student-related responsibilities.

Never mix finance inside student logic.

---

# 9. Loose Coupling

Features should depend on clear interfaces, not on each other's internal implementation.

Changing one feature should have minimal impact on others.

---

# 10. High Cohesion

Everything inside a feature belongs together.

Example

Attendance

Attendance rules
Attendance services
Attendance validation

Nothing unrelated.

---

# 11. Consistency

Every feature should behave the same.

Examples

Searching

Filtering

Pagination

Validation

Error messages

Success responses

Tables

Forms

Naming

---

# 12. Security by Default

Security is never optional.

Every feature must consider:

Authentication

Authorization

Validation

School isolation

Input sanitization

Auditability

---

# 13. Data Integrity

The system must protect data.

No duplicate records.

No inconsistent states.

No orphan records.

Business rules always protect the database.

---

# 14. Auditability

Important actions must be traceable.

We should always know:

Who

Did what

When

Where

To which record

---

# 15. Scalability

Every decision should allow future expansion.

Possible future additions:

Parent Portal

SMS

Email

Online Payment

AI Reports

Multi-campus

No major rewrites.

---

# 16. Maintainability

The project should still be understandable after two years.

Readable code.

Clear structure.

Consistent naming.

Good documentation.

---

# 17. Performance

Performance is considered from the beginning.

Avoid unnecessary queries.

Support pagination.

Support filtering.

Optimize database access.

---

# 18. Documentation

Every completed feature must include:

Business Rules

Technical Design

API Documentation

Testing Notes

Change History

---

# 19. Definition of Done (DoD)

A feature is NOT complete until it satisfies the project's Definition of Done.

See Definition-of-Done.md for the full checklist.

---

# 20. No Technical Debt

We do not accept:

Temporary hacks

Quick fixes

Duplicate logic

Dead code

Unused files

Magic values

Poor naming

If something needs improvement,
we improve it before moving forward.

---

# 21. Decision Making

Every important decision follows this process:

Problem

↓

Possible Solutions

↓

Pros & Cons

↓

Decision

↓

Reason

↓

Documentation

No random decisions.

---

# 22. Product Owner & Architect Responsibilities

Product Owner (You)

Defines business goals.
Makes business decisions.
Approves business rules.
Prioritizes features.
Accepts completed features.

Software Architect (ChatGPT)

Refines requirements.
Identifies missing cases.
Protects system quality.
Designs architecture.
Challenges weak decisions.
Ensures consistency.
Prevents technical debt.
Guides implementation.

---

# 23. Communication Rule

Our discussions stay focused.

One topic at a time.

No jumping between features.

Every discussion ends with a clear conclusion before moving on.

---

# 24. Project Success Criteria

The project is successful when it is:

Correct according to the business rules.
Secure.
Scalable.
Maintainable.
Consistent.
Well documented.
Easy for new developers to understand.
Ready to support future growth.

---

# 25. Change Management

Once a feature's business logic is approved and implementation begins, any new requirement or change must be evaluated before being accepted. We will determine:

Whether it changes the business rules.
Which existing modules are affected.
Whether database or API changes are required.
Whether it can wait for a later version.

This prevents "scope creep"—the gradual addition of new requirements that can delay or destabilize the project.
