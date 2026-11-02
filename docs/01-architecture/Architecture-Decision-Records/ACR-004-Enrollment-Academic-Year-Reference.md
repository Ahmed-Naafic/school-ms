# Architecture Change Request: Enrollment Academic Year Reference

ACR Number: ACR-004

Date: 2026-07-21

Status: Approved

---

# Context

Academic Year Management (Accepted) was built precisely to close a gap the Product Owner identified while reviewing Student Management: `Enrollment.academicYear` (`backend/prisma/schema.prisma`) is a free-text `String` with no structure, no reuse across records, and no validation beyond "must not be empty." Nothing stops two Enrollment records for the same Student claiming the same year with two differently-typed strings (`"2025/2026"` vs `"2025-2026"`), and nothing lets a School Admin see, at a glance, which years their school has ever operated.

Academic Year Management's own Business Specification deliberately scoped this out of its own delivery: *"Changing Student Management's Enrollment or Promotion to actually consume Academic Year records instead of their existing free-text field... is a future Architecture Change Request against Student Management, not part of this feature's own scope"* — the same way Subject Management built the Subject catalog without itself building Class Management's curriculum attachment.

This ACR is that deferred work: wiring `enrollStudent` and `promoteStudent` to Academic Year Management's existing Stable Public Service Interface (`getAcademicYearById`, `getCurrentAcademicYear`, `listActiveAcademicYears`), the same "feature-owned narrow interface" pattern ACR-002 already established between Student Management and Class Management's Section data.

---

# Options Considered

**Option A — Add a nullable `academicYearId` to `Enrollment`; require it for new Enrollment/Promotion going forward (Selected).**
Enrollment gains an optional, additive foreign key to `AcademicYear`, mirroring ACR-002's own `sectionId` precedent exactly. Every existing Enrollment row simply has `academicYearId: NULL` — the existing free-text `academicYear` column is untouched and keeps displaying exactly what it always has for historical rows. Going forward, `enrollStudent` and `promoteStudent` require a valid `academicYearId` (validated via Academic Year Management's own narrow interface, never a direct table query) instead of accepting a free-text string.

**Option B — Fully replace `academicYear` with `academicYearId`, migrating every existing row.**
Rejected: Academic Year Management's own Business Specification already decided against this — there is no reliable way to map arbitrary, inconsistently-formatted free text (`"2025/2026"`, `"25-26"`, `"AY 2025"`) onto real dated `AcademicYear` records without guessing. Forcing a migration here would mean inventing that mapping anyway, the exact thing already rejected once.

**Option C — Accept either `academicYearId` or the legacy free-text value, indefinitely.**
Rejected by explicit Product Owner decision: this would let two different shapes of "what year is this" coexist with no forcing function to ever converge, reintroducing the same ambiguity Academic Year Management exists to close, just spread across new data instead of only old data.

---

# Decision

Option A is adopted.

- `Enrollment.classId` and the existing free-text `Enrollment.academicYear` column both remain exactly as they are today — this ACR does not remove or repurpose either.
- `Enrollment.academicYearId` is added: nullable at the schema level (additive migration; every pre-existing row gets `NULL`, unaffected), but **required by business logic for every new Enrollment and Promotion action** — the free-text `academicYear` field is no longer written to for new rows once this ACR is implemented; it becomes read-only history for rows that predate it.
- `enrollStudent` and `promoteStudent` validate `academicYearId` the same way `sectionId` is already validated (ACR-002): it must reference an Academic Year belonging to the acting School Admin's own school, and must not be Archived (mirroring Business Rule #10 in Academic-Year-Management.md — a non-Archived Academic Year, Current or not, is eligible; Current is only ever the suggested default).
- **If a school has zero Academic Years when School Admin attempts to enroll or promote a Student, the action is rejected** with a clear error directing them to Academic Year Management first — not silently allowed to proceed without a year reference, and not silently falling back to the legacy free-text field.
- Promotion's own destination-Class and destination-Section suggestion logic (ACR-002) is unchanged by this ACR. Its `academicYearId` field defaults to the school's Current Academic Year (via `getCurrentAcademicYear`) as a pre-filled suggestion only — School Admin may override it to any other non-Archived Academic Year in their school, the same "suggest, never enforce" pattern this project already uses for Class-sequence suggestions and Section-name matching.
- Class Correction remains entirely untouched — it already does not create a new Enrollment or touch `academicYear` (Business Rule #16), and this ACR does not change that.

## Requirements

- `academicYearId` is optional at the schema level, but mandatory in practice for every new Enrollment/Promotion — the service layer rejects a missing or invalid value with the same rigor `sectionId` already receives.
- `academicYearId` is validated only through Academic Year Management's existing Stable Public Service Interface (`getAcademicYearById`, `listActiveAcademicYears`, `getCurrentAcademicYear`) — Student Management never queries the `academic_years` table directly, preserving the Loose Coupling principle ACR-001/ACR-002/ACR-003 already established.
- An Archived Academic Year is never a valid target for new Enrollment/Promotion, mirroring the existing "no new Enrollment into an archived Class/Section" rule.
- A school with zero Academic Years cannot have a new Enrollment or Promotion recorded at all — this must fail clearly, not silently degrade to the legacy free-text behavior.
- Existing Enrollment rows and their free-text `academicYear` values are never modified, migrated, or backfilled by this ACR.
- Promotion's suggested default (`getCurrentAcademicYear`) is a pre-fill only, never an enforced value — School Admin retains full override capability, consistent with every other suggestion this project already makes (Class sequence, Section name-matching).

---

# Reasoning

This closes the exact gap Academic Year Management was built to close, using the same additive, non-migrating, narrow-interface pattern ACR-002 already proved out for Section data — not a new architectural approach, an extension of an already-validated one. Requiring `academicYearId` for new records (rather than accepting the legacy free text indefinitely) was an explicit Product Owner decision favoring a clean cutover over a permanently-ambiguous transition period: two coexisting "what year is this" representations would have undermined the entire reason this feature exists, just moved the ambiguity forward in time instead of closing it.

---

# Consequences

## Positive

- Enrollment and Promotion finally reference a real, structured, school-owned Academic Year instead of an arbitrary string — the actual problem the Product Owner raised is now solved, not just made solvable.
- No existing data changes — every historical Enrollment row and its free-text value remain exactly as they are, permanently.
- Reuses Academic Year Management's already-built Stable Public Service Interface exactly as designed, rather than Student Management inventing its own access path to Academic Year data.

## Negative

- Amends an already-Accepted document (Student Management), requiring a formal Change Request rather than a routine edit — the same category of change ACR-002 and ACR-003 already made to Accepted features.
- **A school that has never created an Academic Year cannot enroll or promote any Student until it does.** For a school onboarded before this ACR, or a newly onboarded one that hasn't yet visited Academic Year Management, this is a new hard dependency between two features that were previously independent. This is the deliberate, Product-Owner-chosen trade-off (reject clearly, rather than degrade silently) — but it does mean School Admin onboarding guidance should mention creating at least one Academic Year before attempting to enroll Students, since nothing in Admission itself prompts for it.
- Two different fields now coexist on `Enrollment` (`academicYear` free text for old rows, `academicYearId` for new ones) permanently, not just during a transition — any future feature or report reading Enrollment's academic-year information must handle both shapes, not assume only one exists.

## Future Impact

- Attendance, Timetable, Exam Management, Marks, Fees Management, and Report Cards — once built — should consume `Enrollment.academicYearId` (and, through it, Academic Year Management's own narrow interface) directly, not the legacy free-text field, since only new Enrollments (which all future features will exclusively operate against) carry it.
- If a future need arises to backfill `academicYearId` onto historical Enrollment rows (e.g., a reporting feature that wants every row structured), that is its own future decision requiring its own reasoning about how to map ambiguous historical strings — explicitly not attempted here, the same as Academic Year Management's own original "no migration" decision.

---

# Related Documents

- `docs/03-business/Student-Management.md` — Enrollment/Promotion Business Rules (amended by this ACR).
- `docs/03-business/Academic-Year-Management.md` — Business Rule #11 (Student Management's own future ACR was explicitly anticipated there; this is that ACR) and the Stable Public Service Interface this ACR consumes.
- `docs/06-technical-design/Student-Management.md` and `docs/06-technical-design/Academic-Year-Management.md` — both to be amended.
