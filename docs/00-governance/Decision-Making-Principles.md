# Decision Making Principles

Version: 1.0

---

# Purpose

This document defines the architectural and engineering principles used to make decisions throughout the project.

Whenever multiple valid solutions exist, these principles determine which solution should be chosen.

Claude Code must follow these principles before introducing any new implementation.

---

# Principle 1

## Business Before Technology

Business requirements always come first.

Technology exists to support the business.

Never change business logic simply because a different implementation is easier.

---

# Principle 2

## Simplicity Wins

When multiple solutions satisfy the same requirement,

choose the simplest solution.

Do not introduce unnecessary complexity.

Avoid over-engineering.

---

# Principle 3

## Consistency Over Preference

Always follow existing project patterns.

Never introduce a different style simply because it is preferred.

Consistency is more valuable than personal preference.

---

# Principle 4

## Extend Before Creating

Before creating something new, determine whether an existing solution can be safely extended.

Only create new components, services, utilities, or modules when extension would reduce clarity or violate existing design principles.

---

# Principle 5

## Shared Only When Truly Shared

Do not place code inside shared folders unless it is genuinely reusable.

Business-specific logic must remain inside its owning feature.

Shared code must not contain business knowledge.

---

# Principle 6

## Feature Ownership

Every file belongs to one feature.

Business logic must never be scattered across multiple features.

The owning feature is responsible for maintaining its implementation.

---

# Principle 7

## Composition Over Duplication

Reuse existing building blocks whenever possible.

Avoid copying code.

When duplication appears,

extract reusable functionality only after confirming it has multiple valid use cases.

Do not create abstractions too early.

---

# Principle 8

## Explicit Is Better Than Hidden

Code should clearly express intent.

Avoid magic values.

Avoid hidden side effects.

Avoid unexpected behavior.

---

# Principle 9

## Readability Over Cleverness

Write code that another developer can understand immediately.

Avoid unnecessary optimization.

Avoid clever tricks.

Prefer clarity.

---

# Principle 10

## Long-Term Maintainability

Choose solutions that remain maintainable as the project grows.

Avoid decisions that create future technical debt.

---

# Principle 11

## Backward Compatibility

When changing existing behavior,

consider existing modules first.

Avoid breaking previously approved functionality.

---

# Principle 12

## Protect Data

Never choose a solution that risks data integrity.

Protect business data even if implementation becomes slightly more complex.

---

# Principle 13

## Security Is Non-Negotiable

Never reduce security for convenience.

Security requirements always take priority.

---

# Principle 14

## Performance Matters

Optimize when necessary.

Do not optimize prematurely.

Measure before making major performance changes.

---

# Principle 15

## Avoid Premature Abstraction

Do not build for hypothetical future requirements.

Create abstractions only when multiple real use cases exist.

---

# Principle 16

## Archive Before Delete

If deleting business data would remove historical information,

prefer archiving unless the business explicitly requires permanent deletion.

---

# Principle 17

## Documentation Is Part Of The Feature

A feature is incomplete if its documentation is outdated.

Implementation and documentation must remain synchronized.

---

# Principle 18

## No Silent Decisions

Whenever a significant implementation decision is made,

Claude Code must explain:

- The problem
- Available options
- Selected solution
- Reasoning
- Impact

Never introduce architectural changes silently.

---

# Principle 19

## Stop When Requirements Are Unclear

If requirements are incomplete,

do not guess.

Pause implementation.

Request clarification.

---

# Principle 20

## Quality Before Speed

Project quality always takes priority over implementation speed.

A slower correct solution is preferred over a faster incorrect one.

---

# Principle 21

## One Source of Truth

Every business concept should have one authoritative location.

Avoid duplicated business rules.

Avoid duplicated configuration.

Avoid duplicated validation.

---

# Principle 22

## Least Privilege

Every role, service, and module should have only the permissions required to perform its responsibilities.

Avoid excessive access.

---

# Principle 23

## Fail Safely

When unexpected situations occur,

the system should fail safely.

Never leave the system in an inconsistent state.

---

# Principle 24

## Minimize Change Scope

Every implementation should affect the smallest possible part of the system.

Avoid unnecessary modifications.

Keep changes focused.

---

# Principle 25

## Every Decision Must Be Defensible

If an implementation choice cannot be explained and justified,

it should not be implemented.

Good engineering decisions should always have a clear reason.