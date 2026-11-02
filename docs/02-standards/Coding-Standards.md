# Coding Standards

Version: 1.0

---

# Purpose

This document defines the coding standards for the School Management System.

Every implementation must follow these standards to ensure consistency, maintainability, readability, and scalability.

These standards apply to:

- Backend
- Web
- Mobile

---

# General Principles

Code should be:

- Simple
- Readable
- Predictable
- Consistent
- Testable
- Maintainable

Write code for humans first.

---

# Clean Code Principles

Every function should have one responsibility.

Every class should have one responsibility.

Avoid deeply nested logic.

Avoid long methods.

Avoid large files.

Prefer clarity over cleverness.

---

# Don't Repeat Yourself (DRY)

Avoid duplicated logic.

Before creating new functionality:

- Search existing code.
- Reuse existing utilities.
- Extend existing implementations only when appropriate.

Do not create unnecessary abstractions.

---

# KISS

Keep It Simple.

Choose the simplest solution that satisfies the requirements.

Avoid over-engineering.

---

# YAGNI

You Aren't Gonna Need It.

Do not build functionality for hypothetical future requirements.

Implement only approved requirements.

---

# SOLID Principles

Follow SOLID where appropriate.

Single Responsibility

Open/Closed

Liskov Substitution

Interface Segregation

Dependency Inversion

Do not force SOLID where it reduces readability.

---

# Feature Ownership

Every file belongs to one feature.

Business logic must remain inside its owning feature.

Do not scatter logic across the project.

---

# Shared Code

Shared code must:

- Be generic.
- Be reusable.
- Have no business knowledge.

Never place feature-specific logic in shared.

---

# Function Guidelines

Functions should:

- Have one responsibility.
- Use descriptive names.
- Avoid side effects.
- Return predictable results.

Avoid long parameter lists.

---

# File Size

Avoid excessively large files.

Split responsibilities when a file becomes difficult to understand.

There is no fixed line limit, but readability takes priority.

---

# Comments

Code should explain itself.

Use comments only when necessary.

Never explain obvious code.

Comment business reasoning rather than implementation.

---

# Error Handling

Never ignore errors.

Handle expected errors gracefully.

Log unexpected errors.

Return meaningful messages.

Do not expose internal implementation details.

---

# Logging

Log:

- Important business events.
- Unexpected failures.
- Security-related events.

Never log:

- Passwords
- JWTs
- Secrets
- Sensitive personal information

---

# Constants

Avoid magic values.

Extract reusable constants.

Use configuration for environment-specific values.

---

# Validation

Validate all external input.

Never trust the client.

Validation belongs in the backend.

---

# Dependencies

Before adding a dependency:

- Check if the functionality already exists.
- Evaluate maintenance cost.
- Evaluate security.
- Evaluate community support.

Prefer fewer dependencies.

---

# Configuration

Never hardcode:

- URLs
- Secrets
- Credentials
- Ports
- Environment-specific values

Use environment configuration.

---

# Asynchronous Code

Use async/await.

Avoid deeply nested promise chains.

Handle asynchronous errors correctly.

---

# Database Access

Database access belongs in the repository layer.

Business logic should not directly access Prisma.

---

# Business Logic

Business logic belongs in services.

Controllers coordinate requests.

Repositories access data.

Keep responsibilities separate.

---

# API Responses

Use the standard API response format.

Do not create feature-specific response structures.

---

# Security

Always:

- Validate input.
- Verify authentication.
- Verify authorization.
- Protect sensitive data.

Never bypass security checks.

---

# Testing

Write code that is easy to test.

Avoid hidden dependencies.

Keep business logic independent from frameworks where practical.

---

# Refactoring

Improve code when necessary.

Do not perform unrelated refactoring during feature implementation.

Keep pull requests focused.

---

# Documentation

If implementation changes behavior,

update the documentation.

Documentation and implementation must remain synchronized.

---

# Code Reviews

Before considering work complete:

- Verify standards.
- Verify business logic.
- Verify security.
- Verify readability.
- Verify consistency.

---

# Technical Debt

Avoid:

- Duplicate code
- Dead code
- Unused files
- Unused dependencies
- Temporary hacks
- TODOs without tracking

Every implementation should leave the codebase equal to or better than before.

---

# Coding Principles

1. Readability over cleverness.
2. Simplicity over complexity.
3. Consistency over preference.
4. Maintainability over speed.
5. Business rules over implementation convenience.
6. Security by default.
7. Documentation is part of development.
8. Every line of code should have a purpose.
9. Small focused changes.
10. Leave the project cleaner than you found it.