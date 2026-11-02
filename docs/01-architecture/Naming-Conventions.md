# Naming Conventions

Version: 1.0

---

# Purpose

This document defines the official naming conventions for the School Management System.

Every developer and AI assistant must follow these conventions.

Consistency is mandatory.

---

# General Principles

Names should be:

- Clear
- Predictable
- Descriptive
- Consistent

Avoid:

- Abbreviations
- Generic names
- Ambiguous names

Good names should explain their purpose.

---

# Language

All names must be written in English.

Business terminology must remain consistent throughout the project.

---

# Folder Naming

Use

lowercase

Examples

students

teachers

attendance

audit-logs

school-settings

Never use:

Student

studentModule

StudentModule

student_management

---

# File Naming

Use

kebab-case

Examples

student.controller.js

student.service.js

student.repository.js

student.routes.js

student.validation.js

student.mapper.js

create-student.dto.js

update-student.dto.js

---

# React Components

Use PascalCase.

Examples

StudentTable.jsx

StudentForm.jsx

StudentDetails.jsx

StudentCard.jsx

AttendanceCalendar.jsx

---

# Flutter Widgets

Use PascalCase.

Examples

StudentCard

ExamResultTile

AttendanceScreen

---

# Variables

Use camelCase.

Examples

studentId

schoolId

examScore

totalAmount

Never

Student_ID

student_id

StudentId

---

# Constants

Use UPPER_SNAKE_CASE.

Examples

MAX_FILE_SIZE

DEFAULT_PAGE_SIZE

JWT_EXPIRES_IN

---

# Functions

Use verbs.

Examples

createStudent()

updateStudent()

calculateGrade()

publishExam()

archiveStudent()

Avoid

student()

grade()

data()

---

# Boolean Variables

Begin with:

is

has

can

should

Examples

isActive

hasPermission

canEdit

shouldArchive

---

# API Endpoints

Use plural nouns.

Examples

/students

/teachers

/classes

/subjects

/exams

Avoid verbs in URLs.

Good

POST /students

Bad

POST /createStudent

---

# Database Tables

Use plural names.

Examples

students

teachers

subjects

attendance_records

fee_payments

---

# Database Columns

Use camelCase in Prisma models.

Examples

firstName

lastName

dateOfBirth

createdAt

updatedAt

---

# Enums

Use PascalCase.

Enum names

UserRole

AttendanceStatus

PaymentStatus

Values

SUPER_ADMIN

SCHOOL_ADMIN

ACCOUNTANT

TEACHER

STUDENT

---

# DTOs

Use clear names.

CreateStudentDto

UpdateStudentDto

StudentResponseDto

---

# Services

Name by responsibility.

StudentService

ExamService

AttendanceService

Avoid

StudentManager

StudentHelper

StudentLogic

---

# Repositories

StudentRepository

FeeRepository

AuditLogRepository

---

# Controllers

StudentController

AttendanceController

ExamController

---

# Hooks (React)

useStudent

useAttendance

useAuth

---

# Custom Utilities

Name by purpose.

calculateAge

formatCurrency

generateStudentCode

Never

helper

utils2

commonFunction

---

# Event Names

Use past tense.

student.created

student.updated

exam.published

attendance.recorded

fee.paid

---

# Audit Actions

Use uppercase.

CREATE

UPDATE

DELETE

LOGIN

LOGOUT

PUBLISH

APPROVE

REJECT

---

# Environment Variables

Use uppercase.

DATABASE_URL

JWT_SECRET

PORT

REDIS_URL

---

# Branch Names

feature/student-management

feature/attendance

bugfix/login

hotfix/security

docs/api-standards

---

# Commit Messages

Use Conventional Commits.

Examples

feat(student): add student registration

fix(auth): refresh token validation

refactor(attendance): simplify service

docs(api): update authentication flow

---

# Forbidden Names

Do not use

temp

test123

newFile

helper

misc

random

finalFinal

data

obj

value

item

manager

service2

utils2

---

# Naming Rule

If a name requires explanation,

it is probably a bad name.

Choose names that explain themselves.