# System Architecture

Version: 1.0

---

# Purpose

This document defines the high-level architecture of the School Management System.

It describes how the system is organized, how the major applications interact, and the architectural principles that every implementation must follow.

This document is the architectural source of truth for the project.

---

# Architecture Style

The system follows a Modular Monolith architecture.

The application is developed as a single deployable backend while keeping every business feature isolated into independent modules.

Each module owns its own:

- Business Logic
- Validation
- Routes
- Services
- Data Access
- Tests

Modules communicate through defined interfaces rather than sharing internal implementation.

---

# Applications

The system consists of four applications.

## 1. Web Application

Technology

- React
- Vite

Purpose

Used by:

- Super Admin
- School Admin
- Accountant

Responsibilities

Administrative operations.

---

## 2. Mobile Application

Technology

Flutter

Used by

- Teachers
- Students

Purpose

Daily academic operations.

---

## 3. Backend API

Technology

Node.js

Express

Purpose

Contains all business logic.

Provides REST APIs.

Handles authentication.

Handles authorization.

Communicates with the database.

No business logic should exist in frontend applications.

---

## 4. Database

Technology

PostgreSQL

Prisma ORM

Purpose

Persistent storage.

---

# System Communication

React
        │
        │
Flutter
        │
        ▼
 REST API
        │
        ▼
 Business Modules
        │
        ▼
 PostgreSQL

All clients communicate only with the backend.

Clients never communicate directly with the database.

---

# Multi-Tenant Design

The system is designed for multiple schools.

Every school owns its own data.

School data must always remain isolated.

Super Admin is the only role that can access multiple schools.

No feature may violate tenant isolation.

See Multi-Tenancy.md for the full multi-tenancy rules.

---

# Module Architecture

Every business feature is an independent module.

Examples

- Students
- Teachers
- Attendance
- Exams
- Fees

Modules should have minimal dependencies.

Modules should not directly manipulate another module's internal implementation.

---

# Shared Components

Common functionality should be placed in shared modules.

Examples

Authentication

Authorization

Validation

Logging

Configuration

Utilities

Shared code should remain generic.

Business-specific logic should never be placed in shared modules.

---

# Business Logic Ownership

Business rules belong only in the backend.

Frontend applications are responsible only for:

- Displaying information
- Collecting user input
- Calling APIs

The frontend must never enforce business rules that the backend does not also enforce.

---

# Data Ownership

Every piece of information has one owner.

Duplicate business data should be avoided.

Every module owns its own data.

---

# Security Model

Security is enforced at multiple levels.

Authentication

Authorization

Input Validation

Tenant Isolation

Audit Logging

Every request must be authenticated unless explicitly public.

Every request must be authorized.

---

# Scalability

The architecture should support future expansion.

Examples

Parent Portal

SMS Integration

Email Integration

Online Payments

Push Notifications

AI Features

Additional modules should integrate without requiring architectural redesign.

---

# Maintainability

The project should remain understandable for new developers.

Every module should follow the same structure.

Every implementation should follow project standards.

Consistency is preferred over clever solutions.

---

# Performance

Performance should be considered throughout development.

Avoid unnecessary processing.

Support pagination.

Optimize database access.

Avoid unnecessary API calls.

---

# Error Handling

Errors should be handled consistently.

Business errors

Validation errors

Authentication errors

Authorization errors

Unexpected system errors

All applications should present predictable error behavior.

---

# Logging

The system should log meaningful operational events.

Sensitive information must never be logged.

Logging should support troubleshooting without exposing confidential data.

---

# Future Evolution

The architecture should evolve without breaking existing modules.

Changes should be incremental.

Large rewrites should be avoided.

Backward compatibility should be considered whenever possible.

---

# Architecture Principles

1. Business before code.

2. Modular design.

3. Single responsibility.

4. Loose coupling.

5. High cohesion.

6. Security by default.

7. Consistency over convenience.

8. Simplicity over complexity.

9. Documentation before implementation.

10. Long-term maintainability over short-term speed.