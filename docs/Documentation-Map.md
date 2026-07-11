# Documentation Map

Version: 1.0

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

The documentation is organized into six categories.

1. Governance
2. Architecture
3. Standards
4. Business
5. Development
6. Templates

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

Project-Glossary.md

Defines official business terminology.

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

Student-Management.md

Teacher-Management.md

Class-Management.md

Subject-Management.md

Attendance-Management.md

Exam-Management.md

Fees-Management.md

Timetable.md

Online-Passcard.md

Reports.md

Audit-Logs.md

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