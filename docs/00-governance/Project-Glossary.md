# Project Glossary

Version: 1.0

---

# Purpose

This document defines the official business terminology used throughout the School Management System.

The purpose is to ensure that business discussions, documentation, database design, APIs, UI, and source code all use the same vocabulary.

Only the terms defined in this glossary should be used.

Claude Code must never invent alternative names or synonyms.

---

# General Rules

Every business concept has exactly one official name.

Avoid synonyms.

If a new business term is introduced, it must first be added to this glossary.

---

# Organization

## School

Official Meaning

An educational institution managed within the system.

Never use

Institution

Campus

Organization

Company

unless they represent different business concepts.

---

## Super Admin

Official Meaning

The platform owner.

Manages multiple schools.

Not associated with any specific school.

---

## School Admin

Official Meaning

Administrator responsible for one school.

Has full administrative access within that school only.

Never use

Manager

Principal

Operator

unless they become separate roles.

---

## Accountant

Official Meaning

User responsible for finance-related operations.

Scope is limited to financial modules.

Never use

Cashier

Finance Officer

unless those become separate business roles.

---

## Teacher

Official Meaning

A staff member responsible for teaching students.

---

## Student

Official Meaning

A learner enrolled in a school.

Never use

Learner

Pupil

Candidate

---

# Academic Structure

## Class

Official Meaning

A grade or level in the school.

Examples

Grade 1

Grade 2

Form 1

Never use

Course

Program

Level

unless they represent different concepts.

---

## Section

Official Meaning

A subdivision of a class.

Example

Grade 5

Section A

Section B

---

## Subject

Official Meaning

An academic subject taught within a class.

Examples

Mathematics

English

Physics

Never use

Course

Module

Lesson

---

## Timetable

Official Meaning

The weekly teaching schedule.

Never use

Routine

Schedule

Calendar

---

# Student Lifecycle

## Admission

Official Meaning

The process of registering a student into the school.

---

## Enrollment

Official Meaning

The assignment of a student to an academic year and class.

Admission and Enrollment are different concepts.

---

## Promotion

Official Meaning

Moving a student to the next class.

---

## Graduation

Official Meaning

Completion of the final academic level.

---

## Transfer

Official Meaning

Moving a student to another school.

---

## Archive

Official Meaning

Making a record inactive without deleting it.

Archived records remain in the system.

---

# Attendance

## Attendance

Official Meaning

The daily presence record of a student.

---

## Attendance Record

Official Meaning

One attendance entry for one student on one day.

---

# Examination

## Exam

Official Meaning

An academic assessment.

Examples

Midterm

Final

Quiz

---

## Mark

Official Meaning

Score obtained in one subject.

---

## Grade

Official Meaning

Academic evaluation based on marks.

Example

A

B

C

Pass

Fail

---

## Report Card

Official Meaning

Official document showing academic performance.

---

# Finance

## Fee

Official Meaning

An amount charged by the school.

---

## Payment

Official Meaning

Money paid toward a fee.

---

## Invoice

Official Meaning

A bill requesting payment.

---

## Receipt

Official Meaning

Proof of payment.

---

# Authentication

## User

Official Meaning

Anyone who can log into the system.

---

## Role

Official Meaning

Defines user permissions.

---

## Permission

Official Meaning

A specific action a role may perform.

---

## Authentication

Official Meaning

Verifying user identity.

---

## Authorization

Official Meaning

Determining user permissions.

---

# Reports

## Report

Official Meaning

A generated summary of business information.

---

# Audit

## Audit Log

Official Meaning

Permanent record of important user actions.

---

# Online Passcard

## Passcard

Official Meaning

Digital student identity card.

Used for student identification.

This is different from:

Report Card

Receipt

Certificate

---

# Business Rules

The glossary is the single source of truth for terminology.

No alternative business terms should appear in:

- Database
- API
- Documentation
- UI
- Source Code
- Comments

without architectural approval.

---

# Change Process

If a new business term is needed:

1. Discuss it.

2. Define it.

3. Add it to this document.

4. Use it consistently everywhere.

Never introduce unofficial terminology.