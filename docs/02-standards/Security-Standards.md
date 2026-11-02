# Security Standards

Version: 1.0

---

# Purpose

This document defines the security standards for the School Management System.

Every backend, web, and mobile implementation must follow these standards. They apply on top of the general security rules already established in Project-Constitution.md (Security by Default), AI-Development-Playbook.md, and Decision-Making-Principles.md (Security Is Non-Negotiable, Least Privilege, Fail Safely) — this document makes those principles concrete and specific.

This document does not redefine authentication or authorization business rules — those belong to Authentication-and-Authorization.md. It defines the technical security requirements that implementation of that (and every other) feature must satisfy.

---

# General Principles

Security is never optional and never traded for convenience or speed.

Every feature must consider, at minimum: authentication, authorization, input validation, tenant isolation, and auditability — per System-Architecture.md's Security Model.

Every role, service, and module receives only the access required to perform its responsibilities (Least Privilege).

When a security-relevant requirement is ambiguous or missing, implementation stops and clarification is requested — the same rule that governs business requirements applies to security requirements.

---

# Credential Storage

Passwords (and any equivalent credential) must never be stored, logged, or transmitted in plain text.

Passwords must be hashed using bcrypt, with a cost factor appropriate to production hardware (reviewed periodically as hardware improves, not fixed forever).

Reason: bcrypt is a mature, adaptive, salted hashing algorithm with strong Node.js ecosystem support and a long security track record, consistent with Technology-Decisions.md's decision principle of favoring proven, well-supported technology over novelty.

The system must never provide any way — to any role, including administrators — to view another user's password.

---

# Login Attempts and Account Lockout

An account is temporarily locked after 5 consecutive failed login attempts.

A lockout resolves automatically after 15 minutes, or sooner if unlocked by an authorized role, per Authentication-and-Authorization.md's Business Rule #17.

Failed attempts are counted per account, not per IP address, so that a lockout cannot be used to deny service to a legitimate user from a different network.

This threshold and duration are the official values referenced wherever Authentication-and-Authorization.md or any other document describes "a defined cool-down period" or "a defined threshold."

---

# Session and Token Management

Authentication uses JWT, per Technology-Decisions.md.

Access tokens are short-lived (15 minutes), limiting the exposure window of any single token.

Refresh tokens are longer-lived (7 days) and are tracked server-side by reference, so that a specific refresh token can be individually revoked without invalidating every session for every user.

Logout, account deactivation, account lockout, and role changes must revoke the user's refresh token immediately, so that no further access tokens can be issued to that session. An already-issued access token remains valid only for the remainder of its short lifetime, which is the accepted trade-off for keeping authentication stateless and mobile-friendly.

Tokens must never be logged, and must never appear in URLs (query strings), only in secure request headers or equivalent secure client storage.

This applies equally to password-reset and initial-account-setup tokens, which are full account-takeover credentials in their own right (whoever holds one can set a new password with no prior credential). Logging one in plaintext — even labeled as a temporary development stand-in — is a production security defect, not an acceptable interim risk, since application logs are routinely shipped to aggregators with a broader access list than the production database. `PASSWORD_RESET_DELIVERY_MODE` (`backend/src/config/password-reset.js`) governs this: only its `development` mode logs the raw token, and that mode must never be selected in a production deployment. An approved email or SMS provider (see Technology-Decisions.md's Authentication section) is a hard prerequisite for using password recovery or initial account setup in production — until one exists, the mode must be `disabled`, which fails safe (recovery unavailable) rather than failing dangerous (tokens logged).

---

# Authorization Security

Every protected request must verify, in order: authentication, role permission, and tenant (school) ownership — per Multi-Tenancy.md's Authorization rules.

Tenant context is always derived from the authenticated user's token, never from client-supplied input (headers, query parameters, or request bodies), per Multi-Tenancy.md.

Authorization checks happen on the server for every request. A client-side permission check is a user-experience convenience only and is never treated as an enforcement point.

---

# Transport Security

All traffic, in every environment, must use HTTPS/TLS. Plain HTTP is never acceptable, including for internal or development traffic that could reasonably carry credentials or tokens.

If cookies are used for any purpose, they must be marked Secure, HttpOnly, and SameSite-appropriate.

---

# Input Validation and Injection Prevention

Every input is validated on the server, regardless of any client-side validation — per Coding-Standards.md and API-Standards.md.

All database access goes through Prisma's parameterized queries, per Database-Standards.md. Raw SQL, when unavoidable, must never concatenate untrusted input into a query string.

All output rendered in a web or mobile UI must be treated as untrusted and escaped appropriately by the rendering layer, to prevent cross-site scripting (XSS).

---

# Secrets Management

Secrets (database credentials, JWT signing secret, third-party API keys) are never hardcoded and never committed to source control, per Naming-Conventions.md's Environment Variables convention (e.g. `JWT_SECRET`, `DATABASE_URL`).

Secrets are provided only through environment configuration, per Folder-Structure.md's `config/` responsibility.

A secret that may have been exposed (committed, logged, or leaked) must be rotated, not merely removed from wherever it was exposed.

---

# Sensitive Data Protection

Personally identifiable information (student and staff records, contact details, financial data) is handled only by the features that own it and is never duplicated into shared or unrelated modules, per Decision-Making-Principles' Feature Ownership and Shared Only When Truly Shared principles.

Sensitive fields are never logged, per AI-Development-Playbook.md's Logging rule (never log passwords, tokens, or sensitive personal information).

---

# Rate Limiting and Abuse Prevention

Beyond login lockout, authentication-adjacent endpoints (password reset requests, account creation) must be rate-limited per account and per source to prevent abuse, independent of the account-lockout mechanism.

Rate limiting must fail safely: when uncertain, prefer denying an excessive request over allowing unbounded retries.

---

# Dependency Security

Dependencies are evaluated for security before being added, per Coding-Standards.md's Dependencies section.

Dependencies must be kept up to date, and known-vulnerable versions must not be used once a fix is available.

---

# Auditability

Security-relevant events (login, logout, lockout, permission denial, role changes, and every event listed in each feature's own Audit Requirements section) are recorded using the standard audit record (Tenant, User, Action, Timestamp) defined in Multi-Tenancy.md.

Audit records are never used as a substitute for real-time authorization checks — they record what happened, they do not decide what is allowed.

---

# Security Review Requirement

Every feature's Technical Design must include a Security Considerations section addressing this document.

Every feature's Definition of Done includes "Security considered" and is not satisfied until this document's applicable requirements are met — per Definition-of-Done.md.

---

# Security Principles

1. Security is never optional and never sacrificed for speed.
2. Every request is authenticated and authorized on the server, never trusted from the client.
3. Passwords and secrets are never stored, logged, or transmitted in plain text.
4. Tenant isolation is enforced on every request, without exception.
5. Every role receives only the access its responsibilities require.
6. Credentials and tokens have the shortest lifetime practical for their purpose.
7. Every meaningful security event is auditable.
8. When a security requirement is unclear, implementation stops until it is clarified.
9. Prefer mature, well-supported security mechanisms over novel or clever ones.
10. A leaked secret is rotated, not just hidden.
