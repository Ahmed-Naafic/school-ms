# Multi-Tenancy

Version: 1.0

---

# Purpose

This document defines how multiple schools coexist within the School Management System.

Multi-tenancy is a core architectural principle of this project.

Every feature, API, database query, permission check, and business rule must respect tenant isolation.

---

# Definition

A tenant is a single school.

Each school operates independently.

The platform supports multiple schools using the same application.

---

# Goal

The goal of multi-tenancy is to allow multiple schools to use one platform while ensuring that each school's data remains completely isolated.

No school can access another school's data.

---

# Tenant Types

## Platform

The platform contains all schools.

Managed only by the Super Admin.

---

## School

Each school is an independent tenant.

Schools own:

- Students
- Teachers
- Classes
- Subjects
- Attendance
- Exams
- Fees
- Timetables
- Reports
- Audit Logs

---

# User Ownership

Every user belongs to exactly one tenant.

Exception

Super Admin.

Super Admin belongs to the platform instead of a school.

---

# Tenant Isolation

Tenant isolation is mandatory.

Every business request must operate only within the current tenant.

No cross-school data access is allowed.

---

# School Ownership

Every business record belongs to one school.

Examples

Student

Teacher

Class

Subject

Exam

Attendance

Fee

Timetable

Report

Audit Log

---

# Shared Data

Only platform-level data may be shared.

Examples

Roles

Permissions

System Settings

Countries

Currencies

Languages

Everything else belongs to a school.

---

# Authentication

Authentication identifies the user.

Authentication does NOT determine tenant access.

Tenant access is determined after authentication.

---

# Authorization

Authorization must verify:

- User Role
- User Permissions
- School Ownership

All three checks are required.

---

# Super Admin

Super Admin is the only role allowed to access multiple schools.

Responsibilities

- Create schools
- Suspend schools
- Activate schools
- Manage subscriptions
- View platform statistics
- Manage system configuration

Super Admin must never become part of a school's business operations.

---

# School Admin

School Admin manages only one school.

School Admin cannot:

- View another school
- Modify another school
- Access another school's reports

---

# Accountant

Accountants are limited to one school.

Finance operations never cross tenant boundaries.

---

# Teacher

Teachers belong to one school.

Teachers only interact with students within their own school.

---

# Student

Students belong to one school.

Students can access only their own information.

---

# API Rules

Every protected request must execute within the authenticated user's tenant.

The backend must never trust tenant information provided by the client.

Tenant context comes from the authenticated user.

---

# Database Rules

Every business table must support tenant isolation.

Tenant ownership must never be optional.

---

# Search Rules

Searching must return only records belonging to the current tenant.

Global searches are prohibited except for Super Admin.

---

# Reports

Reports must include data from the current tenant only.

Platform reports are available only to Super Admin.

---

# Audit Logs

Audit logs must record:

- Tenant
- User
- Action
- Timestamp

This allows auditing within each school.

---

# Future Expansion

The architecture should support future capabilities without redesign.

Examples

- Multiple campuses
- School branches
- Regional administrators
- Subscription plans

---

# Multi-Tenancy Principles

1. Every school is isolated.

2. Every business record belongs to one school.

3. Tenant information comes from authentication, not client requests.

4. Cross-tenant access is prohibited.

5. Super Admin operates at the platform level.

6. Tenant isolation is enforced by the backend.

7. Multi-tenancy is mandatory for every feature.