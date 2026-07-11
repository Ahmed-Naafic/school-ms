# API Standards

Version: 1.0

---

# Purpose

This document defines the API standards for the School Management System.

Every backend endpoint must follow these standards.

The API is the contract between the backend and all clients.

Clients include:

- React Web
- Flutter Mobile
- Future integrations

Consistency is mandatory.

---

# API Style

The system uses REST APIs.

Use standard HTTP methods.

GET

POST

PUT

PATCH

DELETE

Do not create custom RPC-style endpoints unless approved.

---

# Versioning

Every endpoint must be versioned.

Example

/api/v1

Future breaking changes require a new API version.

---

# Resource Naming

Use plural resource names.

Good

/students

/classes

/teachers

/exams

Bad

/student

/createStudent

/studentList

---

# HTTP Methods

GET

Read data.

POST

Create resources.

PUT

Replace entire resources.

PATCH

Partial updates.

DELETE

Delete or archive resources depending on business rules.

---

# URL Design

URLs represent resources.

Avoid verbs.

Good

POST /students

GET /students

PATCH /students/{id}

Bad

POST /createStudent

GET /getStudents

POST /updateStudent

---

# Nested Resources

Use nesting only when it clearly represents ownership.

Example

/students/{studentId}/attendance

Avoid deeply nested URLs.

---

# Query Parameters

Use query parameters for:

Filtering

Sorting

Searching

Pagination

Examples

?page=1

?pageSize=20

?search=Ahmed

?sort=name

---

# Pagination

List endpoints should support pagination.

Avoid returning unlimited records.

---

# Filtering

Filtering should be optional.

Use meaningful query parameters.

---

# Sorting

Sorting should support:

Ascending

Descending

Consistent field names

---

# Searching

Searching should be consistent across all modules.

Behavior should not vary between endpoints.

---

# Request Validation

Every request must be validated.

Never trust client input.

Invalid requests return validation errors.

---

# Response Format

Every response must use a consistent structure.

Example

Success

{
  success,
  message,
  data,
  metadata
}

Error

{
  success,
  message,
  errors
}

---

# HTTP Status Codes

Use standard status codes.

200 OK

201 Created

204 No Content

400 Bad Request

401 Unauthorized

403 Forbidden

404 Not Found

409 Conflict

422 Validation Error

500 Internal Server Error

Avoid returning 200 for failed requests.

---

# Authentication

Protected endpoints require JWT authentication.

Public endpoints must be explicitly documented.

---

# Authorization

Authentication does not imply authorization.

Every protected endpoint must verify permissions.

---

# Multi-Tenancy

Every request must respect school boundaries.

No endpoint may expose another school's data.

See Multi-Tenancy.md for the full multi-tenancy rules.

---

# Business Logic

Business rules belong in the backend.

Clients should not enforce business rules.

---

# Validation Errors

Validation responses should clearly identify:

Field

Problem

Reason

Avoid vague messages.

---

# Error Messages

Messages should be:

Consistent

Readable

Actionable

Do not expose internal implementation details.

---

# File Uploads

Upload endpoints must validate:

File type

File size

Permissions

Reject invalid uploads.

---

# Idempotency

GET requests must never change data.

PUT and DELETE should be idempotent where practical.

---

# Date and Time

Use UTC internally.

Return dates in ISO 8601 format.

---

# Numeric Values

Use appropriate numeric types.

Avoid sending formatted currency values.

Formatting belongs to the client.

---

# Booleans

Use true and false.

Avoid strings like

"yes"

"no"

"1"

"0"

---

# API Documentation

Every endpoint must document:

Purpose

Authentication

Authorization

Request

Response

Validation

Possible errors

Business notes

---

# Deprecation

Deprecated endpoints must remain documented until removed.

Breaking changes require communication and versioning.

---

# Logging

Log requests when appropriate.

Never log passwords, tokens, or sensitive information.

---

# Performance

Avoid unnecessary payloads.

Return only required data.

Support pagination.

Optimize database access before exposing APIs.

---

# API Principles

1. The API is a contract.

2. Consistency over convenience.

3. Validate every request.

4. Never expose internal implementation.

5. Business logic belongs in the backend.

6. Every endpoint has one clear responsibility.

7. Protect tenant isolation.

8. Favor backward compatibility.

9. Design APIs for humans first.

10. Document every endpoint.