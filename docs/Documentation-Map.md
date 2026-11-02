# Documentation Map

Version: 1.10

---

# Purpose

This document helps developers and AI assistants navigate the project documentation.

It explains:

- Where each document lives
- Why it exists
- When it should be read
- Whether it is mandatory

This document should be used together with Project-Overview.md.

---

# Documentation Categories

The documentation is organized into nine categories.

1. Governance
2. Architecture
3. Standards
4. Business
5. Technical Design
6. Implementation Planning
7. Validation
8. Development
9. Templates

---

# Governance

Purpose

Defines how the project is managed.

Mandatory

Yes

Documents

Project-Constitution.md

Defines the philosophy of the project.

---

AI-Development-Playbook.md

Defines how Claude Code must behave.

---

Development-Lifecycle.md

Defines the lifecycle of every feature.

---

Decision-Making-Principles.md

Defines how engineering decisions are made.

---

Development-Roadmap.md

Defines implementation order.

---

Code-Review-Report.md

Records independent code review findings (Critical/Major/Minor/Suggestion) for a feature reaching Development-Lifecycle.md Phase 9 (Feature Acceptance), and how each was resolved. One shared, running document — new features' reviews are appended, not replaced.

---

Project-Glossary.md

Defines official business terminology.

---

Dependency-Reports/{Feature}.md

A new governance gate: before a feature's Business Discovery (Phase 1) begins, its dependencies on previously accepted features are analyzed and must be architecturally approved. One document per feature, produced only for features that reach this gate going forward.

---

# Architecture

Purpose

Defines how the system is organized.

Mandatory

Yes

Documents

System-Architecture.md

Folder-Structure.md

Naming-Conventions.md

Technology-Decisions.md

Multi-Tenancy.md

Architecture-Decision-Records/{ACR-Number}-{Title}.md

Records an approved Architecture Change Request — a decision that amends an already-Accepted feature's business or technical specification, found necessary during a later feature's Business Review or Technical Design. One document per change. Produced only when such a change is needed.

---

# Standards

Purpose

Defines implementation standards.

Mandatory

Yes

Documents

Database-Standards.md

API-Standards.md

Coding-Standards.md

Security-Standards.md

UI-UX-Standards.md

Definition-of-Done.md

Git-Workflow.md

---

# Business

Purpose

Defines business requirements.

Mandatory

Yes

Read only the feature being implemented.

Documents

School-Management.md

Authentication-and-Authorization.md

Student-Management.md

Teacher-Management.md

Class-Management.md

Subject-Management.md

Academic-Year-Management.md

Teacher-Subject-Assignment.md

School-Schedule-Management.md

Attendance-Management.md

Exam-Management.md

Fees-Management.md

Timetable.md

Weekly-Subject-Allocation.md (v1.0, Accepted and Implemented; a Timetable-nested sub-feature, see ACR-008 and ACR-009)

Online-Passcard.md

Reports.md

Audit-Logs.md

---

# Technical Design

Purpose

Defines the technical approach for an approved business feature (architecture, database impact, API shape, validation strategy, security considerations) — one document per feature, produced during Development-Lifecycle.md's Phase 4.

Mandatory

Yes, for any feature that has passed Business Review.

Read only the feature being implemented.

Documents

School-Management.md

Authentication-and-Authorization.md

Class-Management.md

Student-Management.md

Teacher-Management.md

Subject-Management.md

Academic-Year-Management.md

Teacher-Subject-Assignment.md

School-Schedule-Management.md

Timetable.md

Weekly-Subject-Allocation.md (v1.2, Implemented — Class Management's own Architecture Update, ACR-009, Implemented first as required)

---

# Implementation Planning

Purpose

Breaks an approved Technical Design into manageable implementation tasks (scope, files affected, dependencies, risks, estimated impact) — one document per feature, produced during Development-Lifecycle.md's Phase 5.

Mandatory

Yes, for any feature that has completed Technical Design.

Read only the feature being implemented.

Documents

School-Management.md

Authentication-and-Authorization.md

Class-Management.md

Student-Management.md

Teacher-Management.md

Subject-Management.md

Academic-Year-Management.md

Teacher-Subject-Assignment.md

School-Schedule-Management.md

Weekly-Subject-Allocation.md (Implemented)

---

# Validation

Purpose

Records the outcome of Development-Lifecycle.md's Phase 7 (Validation) and Phase 9 (Feature Acceptance) for an implemented feature — business rules, permissions, security, error handling, edge cases, regression, and the Feature Acceptance checklist against Definition-of-Done.md. One document per feature, produced once Implementation is complete.

Mandatory

Yes, for any feature that has completed Implementation and is moving toward Feature Acceptance.

Read only the feature being validated or accepted.

Documents

School-Management.md

Authentication-and-Authorization.md

Class-Management.md

Student-Management.md

Teacher-Management.md

Subject-Management.md

Academic-Year-Management.md

School-Schedule-Management.md

Timetable.md

---

# Templates

Purpose

Reusable templates.

Mandatory

When creating new documents.

Documents

Business-Feature-Template.md

Technical-Design-Template.md

API-Specification-Template.md

Database-Design-Template.md

Validation-Checklist-Template.md

Test-Plan-Template.md

Architecture-Decision-Record-Template.md

---

# Development

Purpose

Technical implementation guides.

Mandatory

Only when relevant.

Examples

Backend-Guide.md

Frontend-Guide.md

Mobile-Guide.md

Deployment.md

---

# Reading Order

When joining the project:

1. Project-Overview.md

2. Governance

3. Architecture

4. Standards

5. Business Feature

6. Templates

---

# Task-Based Reading Guide

## Creating a New Feature

Read

Project Overview

Governance

Architecture

Standards

Business Feature Template

---

## Implementing a Feature

Read

Business Feature

Technical Design

API Specification

Database Design

Relevant Standards

---

## Bug Fix

Read

Business Feature

Relevant Standards

Affected Technical Design

---

## Refactoring

Read

Architecture

Coding Standards

Decision Making Principles

---

## Security Work

Read

Security Standards

API Standards

Coding Standards

Architecture

---

## Database Work

Read

Database Standards

Technical Design

Business Feature

---

## UI Work

Read

UI/UX Standards

Business Feature

Frontend Guide

---

# Document Priority

If two documents conflict

Priority is

1. Project Constitution

2. Decision Making Principles

3. System Architecture

4. Standards

5. Business Documents

6. Templates

If uncertainty remains,

Stop and request clarification.

---

# Maintenance

Whenever a new document is created

Update this map.

Documentation must remain synchronized with the project.