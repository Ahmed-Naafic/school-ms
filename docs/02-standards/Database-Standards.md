# Database Standards

Version: 1.0

---

# Purpose

This document defines the database standards for the School Management System.

It establishes the rules that every database object, relationship, migration, and query must follow.

It does not define business entities.

It defines how the database should be designed.

---

# Database Technology

Database

PostgreSQL

ORM

Prisma ORM

Only Prisma is allowed to access the database.

Raw SQL should be used only when Prisma cannot reasonably solve the problem.

---

# General Principles

The database is the source of truth.

Business rules belong in the backend.

The database protects data integrity.

Database design should prioritize:

- Correctness
- Integrity
- Performance
- Maintainability
- Scalability

---

# Multi-Tenant Rule

Every business record belongs to exactly one school unless explicitly defined otherwise.

School isolation is mandatory.

Cross-school data access is prohibited unless performed by Super Admin.

See Multi-Tenancy.md for the full multi-tenancy rules.

---

# Naming Rules

Tables

Plural nouns.

Examples

students

teachers

subjects

attendance_records

fee_payments

Indexes

Meaningful names.

Foreign Keys

Meaningful names.

Avoid generated names whenever possible.

---

# Primary Keys

Every table must have one primary key.

Primary keys must never change.

Primary keys must never contain business meaning.

---

# Foreign Keys

Relationships must always use foreign keys.

Never store related data as plain text.

Maintain referential integrity.

---

# Unique Constraints

Use unique constraints whenever required by business rules.

Do not rely only on application validation.

Protect the database itself.

---

# Required vs Optional

Columns should be required unless there is a valid business reason for allowing NULL.

Avoid excessive nullable fields.

---

# Soft Delete Policy

Business records should generally use soft deletion.

Hard deletion should be reserved for:

- Temporary data
- Failed imports
- System-generated disposable data
- Explicit business approval

Historical records should remain recoverable.

---

# Timestamps

Every business table should include:

Created At

Updated At

Deleted At (when soft delete is used)

Timestamps must be managed consistently.

---

# Audit Support

Where applicable, records should support audit tracking.

Examples include:

Created By

Updated By

These fields are used only when required by the business.

---

# Relationships

Use proper relational modeling.

Avoid duplicated data.

Avoid storing calculated information unless justified.

Normalize data unless performance requires otherwise.

---

# Transactions

Use database transactions whenever multiple operations must succeed or fail together.

Never allow partial completion of business operations.

---

# Indexing

Indexes should be added based on:

Search requirements

Filtering

Sorting

Relationships

Avoid unnecessary indexes.

Indexes should solve real performance needs.

---

# Cascade Rules

Cascade operations must be explicitly considered.

Never enable cascading deletes without business approval.

Protect historical data.

---

# Business Data

Business values should not be hardcoded into lookup tables without approval.

Reference data should be clearly identified.

---

# Data Integrity

Protect against:

Duplicate records

Orphan records

Invalid relationships

Impossible states

The database should help enforce business rules.

---

# Migrations

Every schema change must use Prisma migrations.

Never modify production databases manually.

Migration history must remain complete.

---

# Seed Data

Seed only:

System roles

System permissions

Reference data

Never seed business data unless explicitly required.

---

# Performance

Avoid:

Unnecessary joins

N+1 queries

Redundant data

Large unfiltered queries

Optimize based on real usage.

---

# Backup Strategy

Database design should support reliable backup and restoration.

Business data must remain recoverable.

---

# Security

Never store:

Plain-text passwords

Secrets

Tokens

Sensitive credentials

Sensitive values must be protected.

---

# Future Compatibility

The schema should allow future expansion without major redesign.

Avoid rigid structures.

Design for growth.

---

# Documentation

Every table must have:

Purpose

Relationships

Business owner

Important constraints

Documentation is considered part of the database design.

---

# Database Principles

1. Integrity before convenience.

2. Business rules before optimization.

3. Normalize by default.

4. Optimize only when necessary.

5. Never sacrifice correctness for performance.

6. Protect historical data.

7. Every relationship must be intentional.

8. Every constraint should have a business reason.

9. Every migration should be reversible when practical.

10. The database is a long-term asset and must be treated accordingly.