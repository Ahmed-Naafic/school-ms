# Folder Structure

Version: 1.0

---

# Purpose

This document defines the official folder structure for the School Management System.

Every application in the project must follow this structure.

No alternative structures should be introduced without architectural approval.

---

# Repository Structure

school-management-system/

docs/

backend/

web/

mobile/

---

# Documentation

docs/

Contains every project document.

Business

Architecture

Standards

Guidelines

No implementation belongs here.

---

# Backend

backend/

Purpose

Contains all server-side code.

The backend follows a feature-based architecture.

Features are independent.

Shared code is separated from business code.

---

backend/

src/

config/

shared/

features/

middlewares/

app.js

server.js

---

# Features

Every business module owns its implementation.

Example

features/

auth/

schools/

users/

students/

teachers/

classes/

subjects/

attendance/

exams/

fees/

reports/

audit-logs/

timetable/

passcard/

---

Every feature follows the same internal structure.

Example

students/

controller/

service/

repository/

validation/

routes/

dto/

types/

utils/

tests/

index.js

Only code related to students belongs here.

---

# Shared

shared/

Contains reusable code.

Examples

Authentication helpers

Authorization

Utilities

Constants

Response helpers

Logger

Errors

Validators

No business logic belongs here.

---

# Configuration

config/

Contains application configuration.

Examples

Environment

Database

JWT

Application settings

Logging

Configuration should never contain business logic.

---

# Middleware

middlewares/

Contains reusable Express middleware.

Examples

Authentication

Authorization

Validation

Error handler

Request logger

Rate limiter

---

# Web Application

web/

Purpose

React administrative application.

Uses feature-based architecture.

---

web/

src/

app/

shared/

features/

assets/

---

# React Features

features/

auth/

schools/

users/

students/

teachers/

classes/

subjects/

attendance/

exams/

fees/

reports/

audit-logs/

timetable/

passcard/

---

Every feature contains only UI related to that feature.

Example

students/

pages/

components/

hooks/

services/

types/

utils/

validation/

---

# Mobile

mobile/

Purpose

Flutter application.

Contains Teacher and Student experiences.

---

lib/

core/

shared/

features/

---

Features

auth/

student/

teacher/

attendance/

exam/

timetable/

passcard/

---

Core

Contains application-wide functionality.

Navigation

Theme

Localization

Configuration

---

Shared

Contains reusable widgets.

Utilities

Services

Components

Extensions

No feature-specific code.

---

# Assets

Each application owns its own assets.

Shared assets should be minimal.

---

# Tests

Tests live close to the code they test.

Avoid one massive global tests folder.

---

# Feature Independence

Each feature should be understandable on its own.

A developer should be able to open one feature and understand it without navigating the entire project.

---

# Cross-Feature Access

Features should not directly access another feature's internals.

Communication should happen through public interfaces.

---

# Import Rules

Features should never create circular dependencies.

Shared code may be imported by features.

Features should avoid importing implementation details from other features.

---

# Naming Rules

Folders

lowercase

kebab-case where appropriate

Files

consistent naming

Avoid abbreviations.

Use descriptive names.

---

# Growth

New features should be added by creating a new feature module.

Existing features should not become dumping grounds for unrelated functionality.

The folder structure must remain stable throughout the life of the project.
