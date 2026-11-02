# Implementation Planning

Feature: School Schedule Management

Version: 1.3

Status: **v1.0 Drafted and Approved for the original (Calendar/Shift) scope**, following Phase 4 (Technical Design Review) approval (`docs/06-technical-design/School-Schedule-Management.md` v1.1, Approved) — that scope completed Implementation (Phase 6), Validation (Phase 7), Documentation Review (Phase 8), and Phase 9 (Feature Acceptance). **v1.1: Architecture Update (Periods)** — this plan was extended to cover Period Management, per `docs/06-technical-design/School-Schedule-Management.md` v1.2. **v1.2: updated following that addition's own Phase 4 (Technical Design Review) approval** (`docs/06-technical-design/School-Schedule-Management.md` v1.3, Approved) — that Review found and fixed a cross-entity gap between `updateShift` and Period's containment invariant; this plan now reflects the corrected design (see WP11 and Risk Assessment). **v1.3: WP10–WP15 (Periods) have since completed Implementation (Phase 6), Validation (Phase 7), and Phase 9 (Feature Acceptance)** — see `docs/08-validation/School-Schedule-Management.md` v1.1 and `docs/00-governance/Code-Review-Report.md`'s own Period Management review. **Phase 9 is now complete for the entire feature.**

---

# Scope

This plan implements the `school-schedule` feature module as designed in `docs/06-technical-design/School-Schedule-Management.md` (v1.2, including the Architecture Update that added Period Management), **scoped to Backend and Web only**, following the same per-application scoping precedent every prior feature's plan has established: Backend defines the business rules and API contract; Web covers School Admin's full management workflow; Mobile is out of scope (no Flutter project exists yet — Teacher's read-only view is deferred to the same future Mobile bootstrap phase every other Teacher/Student self-service view already waits on).

Covered in this pass: `SchoolCalendar` (auto-created at school creation, view, update), `Shift` (auto-created default at school creation, create, correct, list, detail, reorder, designate-default, archive, reactivate), the Stable Public Service Interface for future consumers, **and the two additive changes this feature requires of already-Accepted features** — School & Platform Management's `createSchool` gaining the default-Calendar-and-Shift insert, and Class Management gaining a required `shiftId` with a one-time backfill. **All of the above is already implemented, validated, and documented** (Phases 6–8 complete for this scope).

**Architecture Update (Periods) — newly added to this plan's scope, not yet implemented:** `Period` (auto-created default structure at school creation and at each new Shift's creation via the setup wizard, create, correct, list, detail, reorder, archive, reactivate), the Period additions to the Stable Public Service Interface (`getShiftPeriods`, `getPeriodById`, `validatePeriod`), and the Web surface for managing a Shift's own Period list. See WP10–WP15.

Out of scope for this pass, per the Business Specification's own Out-of-Scope Items:
- Public Holidays, School Holidays, Ramadan Schedules, Special Working Days, Emergency Closures, Half Days.
- Any actual wiring of a future consumer (Timetable, Attendance, Exam Management, Grade Book, Report Card, Teacher Daily Schedule, Student Daily Schedule) to the Stable Public Service Interface — none of those features exist yet.
- Mobile.
- Configurable, multi-country platform-level default templates — this version's defaults are fixed and built-in.
- Period Types beyond `TEACHING` and `BREAK` (Assembly, Lunch, Prayer, Activity, etc.).

---

# Work Packages

Each package below maps to specific Business Specification rules and Technical Design sections, so every task traces back to an approved decision — nothing here introduces new business logic. **WP1's two migrations must be applied in the order given; this is the one hard sequencing constraint in the entire plan** (see Risk Assessment).

## WP1 — Database Schema & Migrations (two, strictly ordered)

**Maps to:** Technical Design's Database Impact section; Business Rules #2, #3, #7–#14, #15.

**Migration A — `school-schedule`'s own tables, applied and its backfill completed first:**
- `backend/prisma/schema.prisma`:
  - New `DayOfWeek` enum (`SUNDAY`…`SATURDAY`) and `ShiftStatus` enum (`ACTIVE`/`ARCHIVED`), matching existing enum-naming conventions.
  - New `SchoolCalendar` model: `schoolId` (`@unique` FK to `School`), `workingDays DayOfWeek[]`, timestamps. No status/archive concept (Business Rule #6 — current configuration only).
  - New `Shift` model: `schoolId` (FK), `name String`, `startTime`/`endTime` (`@db.Time()`), `displayOrder Int?` (nullable), `isDefault Boolean @default(false)`, `status ShiftStatus @default(ACTIVE)`, timestamps. `@@unique([schoolId, displayOrder])` (Postgres's ordinary NULL-distinct default already gives the correct "archived Shifts never conflict with each other" behavior — no special syntax needed, unlike Teacher Subject Assignment's own `NULLS NOT DISTINCT` case). `@@index([schoolId])`.
- **Hand-written raw SQL appended to the generated migration** (the same justified exception to "only Prisma accesses the database" `Class.isFinal`'s and `AcademicYear.isCurrent`'s own migrations already established):
  ```sql
  CREATE UNIQUE INDEX "shifts_school_default_shift_unique" ON "shifts"("schoolId") WHERE "isDefault" = true;
  ```
- **Data backfill, in the same migration, for every school that already exists:** insert one `SchoolCalendar` row per existing school (`workingDays = [SATURDAY, SUNDAY, MONDAY, TUESDAY, WEDNESDAY]`, the Somalia Default) and one `Shift` row per existing school (`name = 'Morning'`, `displayOrder = 1`, `isDefault = true`, `status = 'ACTIVE'`, and a placeholder time range — the exact default start/end values are a configuration detail, not a business rule, per Technical Design's own note; e.g. `07:30`–`12:30`, matching the Business Specification's own illustrative example). **This step must fully commit before Migration B runs** — Migration B's own backfill reads the `Shift` rows this step creates.

**Migration B — Class Management's additive `shiftId` (applied after Migration A's backfill is confirmed complete):**
- `backend/prisma/schema.prisma`: `Class` gains `shiftId String` with a foreign key to `Shift`.
- Generated as nullable first, then a hand-written `UPDATE "classes" SET "shiftId" = (SELECT id FROM shifts WHERE shifts."schoolId" = classes."schoolId" AND shifts."isDefault" = true) WHERE "shiftId" IS NULL;` backfill step, then `ALTER COLUMN "shiftId" SET NOT NULL` and the FK constraint added — the same "generated migration, hand-edited with one additional raw-SQL step" pattern already established for partial-unique-index additions, here used for a data backfill instead.
- No other change to Class Management's own schema.

Purely additive at the schema level (Migration A) plus one required-but-backfilled column (Migration B) — no existing table's existing columns are altered or removed.

## WP2 — School Calendar Backend (View / Update)

**Maps to:** Business Rules #2, #4, #5, #6; Technical Design's API Design, Backend Design, and Validation Strategy.

- `backend/src/features/school-schedule/school-schedule.repository.js` — the only file touching Prisma for this feature, per Coding-Standards.md. Includes `findCalendarBySchool`, `updateCalendar`.
- `backend/src/features/school-schedule/school-schedule.service.js`:
  - `getSchoolCalendarOrThrow(schoolId)` — loads the school's single `SchoolCalendar` row (should always exist post-WP1/WP5; throws `NotFoundError` only in the theoretical case it doesn't).
  - `assertOneWorkingAndOneWeekendDay(workingDays)` — Business Rule #5; Business Rule #4 needs no separate runtime check (structurally guaranteed, per Technical Design).
  - `updateSchoolCalendar(schoolId, { workingDays }, actingUser)` — re-validates via the assertion above, updates in place. No transaction/lock needed (single-row update, no cross-row invariant).
- `backend/src/features/school-schedule/school-schedule.validation.js` — shape-only: `workingDays` is an array of valid, non-duplicate `DayOfWeek` values.
- `backend/src/features/school-schedule/school-schedule.controller.js`, `.routes.js` — `GET /school-calendar` (School-Admin and Teacher), `PATCH /school-calendar` (School-Admin-only), `schoolId` always from the token.

## WP3 — Shift Core Backend (Create / Correct / List / Detail)

**Maps to:** Business Rules #7, #12; Technical Design's Backend Design and Validation Strategy.

- `school-schedule.repository.js` — Shift-related functions: `findShiftById`, `listShiftsBySchool({ status })`, `listActiveShiftsBySchool` (ordered by `displayOrder`), `createShift`, `updateShift`, `acquireSchoolLock` (`pg_advisory_xact_lock(hashtext(schoolId))`).
- `school-schedule.service.js`:
  - `getShiftOrThrow(schoolId, shiftId, tx?)` — the shared helper every write path below uses, mirroring every other feature's own `get*OrThrow` convention.
  - `assertNoOverlap(schoolId, { startTime, endTime }, excludeShiftId, tx)` — the inclusive-boundary check mirroring `academicYearsService`'s own `rangesOverlap` reasoning.
  - `nextEndOfSequencePosition(schoolId, tx)` — scoped to active Shifts only (Class Management's own function of the same name additionally considers archived Classes; this feature's archived Shifts hold no `displayOrder` at all, so they're never part of this calculation).
  - `createShift(schoolId, { name, startTime, endTime }, actingUser)` — locked transaction: `acquireSchoolLock` first, `assertNoOverlap(..., null, tx)`, insert with `displayOrder = nextEndOfSequencePosition(...)`, `isDefault: false`, `status: 'ACTIVE'`.
  - `updateShift(schoolId, shiftId, { name, startTime, endTime }, actingUser)` — locked transaction: `acquireSchoolLock` first, `getShiftOrThrow`, `assertNoOverlap(..., shiftId, tx)`, update `name`/`startTime`/`endTime` only.
  - `listShifts(schoolId, { status })`, `getShiftDetail(schoolId, shiftId)`.
- `school-schedule.validation.js` — shape-only: Shift `name` (non-empty string), `startTime`/`endTime` (valid time-of-day, `startTime` earlier than `endTime`). `PATCH /shifts/{id}` rejects any field other than `name`/`startTime`/`endTime` (Guard by Construction) — `displayOrder`, `isDefault`, `status` never reach the service layer from this endpoint.
- `school-schedule.controller.js`, `.routes.js` — `POST /shifts`, `PATCH /shifts/{id}`, `GET /shifts`, `GET /shifts/{id}`, School-Admin-only for writes, School-Admin-and-Teacher for the two `GET`s.

## WP4 — Shift Lifecycle Backend (Reorder / Designate-Default / Archive / Reactivate)

**Maps to:** Business Rules #8–#11, #13–#17; Technical Design's Backend Design.

- `school-schedule.repository.js` — `listActiveShiftsBySchool` (reused from WP3), `renumberActiveShifts` (batch `displayOrder` rewrite), `setDefaultShift`/`unsetDefaultShift`.
- `school-schedule.service.js`:
  - `reorderShift(schoolId, shiftId, targetPosition, actingUser)` — locked transaction: `getShiftOrThrow`, clamp `targetPosition` to `[1, activeShifts.length]`, re-insert at that position among the school's active Shifts (ordered by current `displayOrder`), renumber the whole active set to a contiguous 1..N — the same algorithm as Class Management's own `reorderClass`, scoped to active Shifts only (Business Rule #13).
  - `designateDefaultShift(schoolId, shiftId, actingUser)` — locked transaction: `getShiftOrThrow`, rejects if `status !== 'ACTIVE'` (Business Rule #10), unsets the school's current Default (if any), sets the new one — mirroring `academicYearsService.setCurrentAcademicYear`'s own unset-then-set pattern.
  - `archiveShift(schoolId, shiftId, actingUser)` — locked transaction: `getShiftOrThrow`; rejects if `classesService.countActiveClassesByShift(schoolId, shiftId) > 0` (Business Rule #16 — see WP6 for this new Class Management interface function); rejects if it would leave zero active Shifts (Business Rule #9); rejects if it is the current Default Shift (Business Rule #10 — caller must `designateDefaultShift` first). On success: `status: 'ARCHIVED'`, `displayOrder: null`, renumber the remaining active Shifts to close the gap (Business Rule #14), sharing the same renumbering helper `reorderShift` uses.
  - `reactivateShift(schoolId, shiftId, actingUser)` — locked transaction: `getShiftOrThrow`, rejects if `status !== 'ARCHIVED'`, **re-runs `assertNoOverlap` against the Shift's own stored time range before restoring** (the Technical Design Review finding — a Shift archived at one point cannot assume its old range is still conflict-free against whatever is active now). On success: `status: 'ACTIVE'`, `displayOrder: nextEndOfSequencePosition(...)` (append to the end, Business Rule #14) — never automatically `isDefault`.
- `school-schedule.routes.js` — `PATCH /shifts/{id}/sequence` (body `{ position }`), `/designate-default`, `/archive`, `/reactivate`, all School-Admin-only, mirroring Class Management's and Academic Year Management's own verb conventions exactly.

## WP5 — School & Platform Management additive change (Default Calendar + Shift at school creation)

**Maps to:** Business Rule #3; Technical Design's Dependencies section.

- **One small, additive change to the already-Accepted School & Platform Management feature**: `schools.service.js`'s `createSchool` transaction gains two additional inserts — a `SchoolCalendar` row (Somalia Default) and a `Shift` row (default "Morning," Active, Default) — inside the *same* transaction as the school's own creation, the same category of in-transaction addition Teacher Management's own Onboarding already uses when wrapping Account creation and Teacher-record creation together. Does not reopen School & Platform Management's own Feature Acceptance.
- This is the *live* (going-forward) equivalent of WP1's one-time backfill for schools that already exist — every school from this point on gets its default Calendar and Shift at the moment of its own creation, never as a separate follow-up step.

## WP6 — Class Management additive change (required `shiftId`)

**Maps to:** Business Rules #13, #16; Technical Design's Database Impact and Backend Design (the archive-dependency mechanism Technical Design explicitly deferred to this phase).

- **Decision (deferred by Technical Design, settled here): a single, narrow, one-directional interface function on Class Management, not a Subject-Management-style extensibility registry.** Subject Management's `registerRemovalDependencyCheck` registry exists because *any number* of future features might need to block Subject removal; here, only School Schedule Management will ever need to check "does an active Class reference this Shift" — a registry would be premature abstraction for a single, known consumer (Decision-Making-Principles' Avoid Premature Abstraction). Class Management's `classes.service.js` gains:
  - `countActiveClassesByShift(schoolId, shiftId)` — a plain read-only narrow interface function, the same shape as its existing `getClassById`/`listActiveSectionsForClass`, added alongside them without changing anything else in that already-Accepted module.
- `classes.service.js`'s `createClass`/`updateClass` gain a required `shiftId` parameter, validated via `schoolScheduleService.validateShift(schoolId, shiftId)` — the same way Student Management's `enrollStudent` validates `classId`/`sectionId`/`academicYearId` through other features' own narrow interfaces. If omitted on `createClass`, defaults to `schoolScheduleService.getActiveShift(schoolId)`'s own id (the school's current Default Shift), mirroring Student Management's own Promotion-default pattern — the defaulted value still passes through the same `validateShift` check an explicit choice would.
- No other change to Class Management's own Business Rules, lifecycle, or existing endpoints — this is additive only.

## WP7 — Stable Public Service Interface

**Maps to:** Technical Design's Backend Design section.

`school-schedule.service.js` exports, built now even though no consumer exists yet (Timetable, Attendance, etc. are all future), per this project's established Future Integration Readiness precedent:

- `getSchoolCalendar(schoolId)`
- `getWorkingDays(schoolId)`
- `getWeekendDays(schoolId)` (derived complement)
- `getSchoolShifts(schoolId, { status })`
- `getActiveShift(schoolId)` (the school's current Default Shift)
- `getShiftById(schoolId, shiftId)` (returns `null` on a miss, never throws)
- `validateWorkingDay(schoolId, dayOfWeek)` (boolean)
- `validateShift(schoolId, shiftId)` (boolean)

No future feature may reach into `school-schedule.repository.js` or query `SchoolCalendar`/`Shift` directly — every future cross-feature interaction goes through one of these eight functions, the same Loose Coupling discipline this project has followed since ACR-001.

## WP8 — Audit Logging Integration

**Maps to:** Business Specification's Audit Requirements; Technical Design's Security Considerations.

- Every WP2–WP6 write function calls the shared audit-recording utility after its write succeeds: `SCHOOL_CALENDAR_CREATED` (automatic, WP1/WP5), `SCHOOL_CALENDAR_UPDATED`, `DEFAULT_SHIFT_CREATED` (automatic, WP1/WP5), `SHIFT_CREATED`, `SHIFT_UPDATED`, `SHIFT_DEFAULT_DESIGNATED` (previous and new Default Shift id in `metadata`), `SHIFT_ARCHIVED`, `SHIFT_REACTIVATED`. All carry the school's own `schoolId`.
- Following the lesson from Subject Management's own Phase 7 Validation (audit-log *persistence* had no dedicated test there, only mocked-call assertions), this plan's own Testing Strategy includes a real-database audit-persistence check from the start.

## WP9 — Web Frontend (School Admin)

**Maps to:** Technical Design's Frontend Design section; Business Specification's Permissions.

- `web/src/features/school-schedule/pages/ScheduleSettingsPage.jsx` — one combined page: a seven-day Working/Weekend toggle grid, and a Shifts table (Name, Start–End, Display Order, Default badge, Active/Archived status) with row actions, following `ClassesListPage.jsx`'s established list-page pattern.
- `web/src/features/school-schedule/components/`:
  - `CreateShiftDialog.jsx`, `EditShiftDialog.jsx` — Name/Start/End Time inputs only.
  - A "Make Default" confirm action (calls `designate-default`).
  - A reorder control (up/down buttons per row, calling `sequence` with the resulting target position — simpler and more accessible than drag-and-drop, consistent with this project's UI-UX-Standards.md preference for keyboard-operable controls; a full drag interaction is not required to satisfy Business Rule #13).
  - Archive/Reactivate confirm actions, mirroring `AcademicYearsListPage.jsx`'s own archive/reactivate row actions.
- `web/src/features/school-schedule/services/school-schedule.service.js` — API client calls for all of the above.
- `web/src/app/App.jsx`, `web/src/app/Layout.jsx`, `web/src/app/nav-icons.jsx` — a new `/school-schedule` route and sidebar nav entry, School-Admin-only, following the exact pattern already established for `/academic-years`, `/teacher-subject-assignments`.
- The frontend never re-implements any backend guard (overlap, Default-Shift invariant, Display Order renumbering, Working/Weekend Day rules) — it only reflects what the backend returns, per System-Architecture.md's Business Logic Ownership rule.
- No Teacher-facing Web screen — Teacher is a Mobile-application role, per System-Architecture.md; the backend's `GET /school-calendar`/`GET /shifts` already permit `TEACHER` (WP2/WP3), so nothing is blocked, only the Mobile screen itself is deferred.

---

# Architecture Update (Periods) — Work Packages

Maps to `docs/06-technical-design/School-Schedule-Management.md` v1.2's own Architecture Update sections. **WP10's migration has no ordering dependency on WP1's two migrations** — `Period` only references `Shift`, which already exists in every environment this plan will ever run against; it is a new, independent addition, not a re-opening of WP1.

## WP10 — Database Schema & Migration (Period)

**Maps to:** Technical Design's Database Impact (Architecture Update); Business Rules #23–#28.

- `backend/prisma/schema.prisma`:
  - New `PeriodType` enum (`TEACHING`/`BREAK`) and `PeriodStatus` enum (`ACTIVE`/`ARCHIVED`).
  - New `Period` model: `shiftId` (FK to `Shift`), `name String`, `type PeriodType`, `startTime`/`endTime` (`@db.Time()`, nullable), `displayOrder Int?` (nullable), `status PeriodStatus @default(ACTIVE)`, timestamps. `@@unique([shiftId, displayOrder])` (Postgres's ordinary NULL-distinct default, same reasoning as `Shift`'s own constraint — no `NULLS NOT DISTINCT` needed). `@@index([shiftId])`. No `schoolId` column (tenant isolation resolved via the parent Shift, matching `Section`'s own precedent relative to `Class`).
- No hand-written raw SQL needed for this migration — no partial unique index (Period has no "exactly one X" invariant) and no data backfill (no pre-existing Period rows to migrate; every school that already exists gets its Shifts' own Period structures generated by WP12's bootstrap/wizard code the first time it runs for that school — see WP12's own backfill note).
- Purely additive: a new table, two new enums, no change to any existing table's existing columns.

## WP11 — Period Core & Lifecycle Backend (Create / Correct / List / Detail / Reorder / Archive / Reactivate)

**Maps to:** Business Rules #23–#28; Technical Design's Backend Design (Architecture Update).

- `school-schedule.repository.js` (extended, same file) — `findPeriodById`, `listPeriodsByShift({ status })`, `listActivePeriodsByShift` (ordered by `displayOrder`), `createPeriod`, `updatePeriod`, `renumberActivePeriods` (batch rewrite, same two-phase negative-placeholder shape `renumberActiveShifts` already uses), `acquireShiftLock(shiftId, tx)` (`pg_advisory_xact_lock(hashtext(shiftId))` — a new key, distinct from `acquireSchoolLock`'s `hashtext(schoolId)`).
- `school-schedule.service.js` (extended, same file):
  - `getPeriodOrThrow(shiftId, periodId, tx?)`, `assertPeriodNoOverlap(shiftId, { startTime, endTime }, excludePeriodId, tx)` (skipped when either time is `null`), `assertPeriodFitsWithinShift(shift, { startTime, endTime })`, `nextEndOfSequencePosition` reused with a `shiftId` argument instead of `schoolId`.
  - `createPeriod(schoolId, shiftId, { name, type, startTime, endTime }, actingUser)` — locked transaction (`acquireShiftLock` first), `getShiftOrThrow` for tenant isolation, containment + overlap checks only when both times are present, insert at end-of-sequence.
  - `updatePeriod(schoolId, shiftId, periodId, { name, type, startTime, endTime }, actingUser)` — same shape as `updateShift`, one level down.
  - `reorderPeriod(schoolId, shiftId, periodId, targetPosition, actingUser)` — identical algorithm to `reorderShift`, scoped to `shiftId`.
  - `archivePeriod(schoolId, shiftId, periodId, actingUser)` — locked, no downstream-reference check (no consumer feature exists yet — see Technical Design's Backend Design note); rejects only if not Active; renumbers remaining active Periods in that Shift on success.
  - `reactivatePeriod(schoolId, shiftId, periodId, actingUser)` — locked, rejects if not Archived, re-checks containment + overlap only if both stored times are non-null, appends to end-of-sequence on success.
- `school-schedule.validation.js` (extended) — shape-only: Period `name` (non-empty string), `type` (`TEACHING`/`BREAK`), `startTime`/`endTime` (both-or-neither, `startTime` earlier than `endTime` when both present); `position` (positive integer). `PATCH /periods/{id}` Guard by Construction rejects any field other than `name`/`type`/`startTime`/`endTime`.
- `school-schedule.controller.js`, `.routes.js` (extended) — `GET /shifts/{shiftId}/periods`, `GET /periods/{id}`, `POST /shifts/{shiftId}/periods`, `PATCH /periods/{id}`, `PATCH /periods/{id}/sequence`, `PATCH /periods/{id}/archive`, `PATCH /periods/{id}/reactivate` — School-Admin-only for writes, School-Admin-and-Teacher for the two `GET`s, mirroring WP3/WP4's own role split exactly.
- **Retrofit to WP3's already-implemented `updateShift` (Technical Design Review finding, Phase 4 of this Architecture Update):** `updateShift` gains an `acquireShiftLock(shiftId, tx)` call immediately after its existing `acquireSchoolLock(schoolId, tx)` — **this fixed order must never be reversed anywhere in this codebase**, or a deadlock becomes possible — followed by a containment re-check against that Shift's own active Periods before committing a new `startTime`/`endTime`, rejecting with 409 if any configured Period would fall outside the new range. This is a required modification to already-shipped, already-Accepted-scope code, not new Period-only surface — it must ship in the same Implementation pass as WP10–WP15, since the gap it closes (a Shift edit silently invalidating Period containment) cannot exist before Period does. No other already-implemented Shift write path (`createShift`, `reorderShift`, `designateDefaultShift`, `archiveShift`, `reactivateShift`) requires any change — none of them touch a Shift's own `startTime`/`endTime`.

## WP12 — Bootstrap & Wizard Period Generation

**Maps to:** Business Rules #29–#30 (Business Specification numbering); Technical Design's `generatePeriodStructure` design.

- `school-schedule.service.js` gains a private `generatePeriodStructure(shiftId, { teachingPeriodCount, includeBreak, breakAfterPeriod }, tx)` helper (not part of the public interface) implementing the assembly and naming algorithm Technical Design now fully specifies, following Phase 4 (Technical Design Review) of this Architecture Update: build `teachingPeriodCount` Teaching slots in order; if `includeBreak`, insert one Break slot immediately after the `breakAfterPeriod`-th Teaching slot (1-based; equal to `teachingPeriodCount` is valid — Break at the end); `displayOrder` is each slot's 1-based position in the assembled sequence; a Break slot is always named literally "Break"; a Teaching slot is named "Period {k}" where `k` counts continuously through any Break. Both the assembly rule and the naming rule are now confirmed, not open questions for Implementation to guess at.
- **`createShift` (WP3, extended)** — `POST /shifts`'s body gains three optional fields (`teachingPeriodCount = 6`, `includeBreak = true`, `breakAfterPeriod = 3`); after inserting the new Shift row inside its own existing `schoolId`-locked transaction, calls `generatePeriodStructure` for that new Shift, before the transaction commits.
- **`createDefaultScheduleForSchool` (WP5, extended)** — after creating the default "Morning" Shift, calls the same helper with the fixed default arguments (`6`/`true`/`3`), reproducing the Business Specification's own literal default structure (Period 1, Period 2, Period 3, Break, Period 4, Period 5, Period 6), before returning.
- **Backfill for schools/Shifts that already exist** (created before this Architecture Update shipped): a one-time data migration script (or a hand-written SQL step in WP10's migration, whichever Implementation finds cleaner) runs `generatePeriodStructure` with the same fixed default arguments for every existing Shift that currently has zero Periods — mirroring WP1 Migration A's own "backfill every existing school" step, but for Shifts instead of Schools, and application-level generation logic rather than a raw-SQL `INSERT`, since the naming/ordering algorithm is code, not a static value.

## WP13 — Stable Public Service Interface Additions

**Maps to:** Business Rule #21 (as amended); Technical Design's Stable Public Service Interface (Architecture Update).

`school-schedule.service.js` exports three additional functions, matching the exact names the Business Specification's own Business Rule #21 names:
- `getShiftPeriods(schoolId, shiftId, { status })` — empty array on a miss or cross-school `shiftId`, never throws.
- `getPeriodById(schoolId, periodId)` — `null` on a miss or a Period whose parent Shift belongs to a different school, never throws.
- `validatePeriod(schoolId, periodId)` — boolean, the same role `validateShift` plays for `Class.shiftId` today.

No future feature may query `Period` directly — the same Loose Coupling discipline WP7 already established for `SchoolCalendar`/`Shift`.

## WP14 — Audit Logging Integration (Periods)

**Maps to:** Business Specification's Audit Requirements (extended); Technical Design's Security Considerations.

- Every WP11/WP12 write function calls the shared audit-recording utility: `PERIOD_STRUCTURE_CREATED` (automatic, WP12 bootstrap/wizard/backfill), `PERIOD_CREATED`, `PERIOD_UPDATED`, `PERIOD_SEQUENCE_CHANGED`, `PERIOD_ARCHIVED`, `PERIOD_REACTIVATED`. All carry the Period's parent Shift's own `schoolId` (resolved via the Shift, since Period itself has no `schoolId` column).

## WP15 — Web Frontend (Period Management)

**Maps to:** Technical Design's Frontend Design (Architecture Update).

- `web/src/features/school-schedule/pages/ScheduleSettingsPage.jsx` (extended) — each Shift row expands to show its own ordered Period list (Name, Type badge, Start–End or "Not configured yet", Display Order, Active/Archived), with row-level Create/Edit/Archive/Reactivate/Reorder actions scoped to that Shift, following the same list-and-row-actions pattern already used for Shifts themselves.
- `web/src/features/school-schedule/components/` — `CreatePeriodDialog.jsx`, `EditPeriodDialog.jsx` (Name/Type/Start/End inputs, times optional); the existing `CreateShiftDialog.jsx` gains the three wizard fields (collapsible "Advanced" section, pre-filled with the Business Specification's own defaults).
- `web/src/features/school-schedule/services/school-schedule.service.js` (extended) — API client calls for all Period endpoints.
- The frontend never re-implements containment, overlap, Display Order renumbering, or the naming algorithm — it only reflects what the backend returns, per System-Architecture.md's Business Logic Ownership rule.

---

# Files Affected

All new files, except where noted.

| Area | Files | New / Modified |
|---|---|---|
| Database | `backend/prisma/schema.prisma`, `backend/prisma/migrations/` (two migrations) | Modified / New |
| School Schedule backend | `backend/src/features/school-schedule/{school-schedule.controller,school-schedule.service,school-schedule.repository,school-schedule.validation,school-schedule.routes,index}.js` + test files | New |
| School & Platform Management | `backend/src/features/schools/schools.service.js` | Modified (one additive insert inside `createSchool`'s existing transaction) |
| Class Management | `backend/src/features/classes/{classes.service,classes.repository,classes.validation}.js` | Modified (new `shiftId` param + `countActiveClassesByShift`) |
| Web | `web/src/features/school-schedule/{pages,components,services}/*` | New |
| Web app shell | `web/src/app/App.jsx`, `web/src/app/Layout.jsx`, `web/src/app/nav-icons.jsx` | Modified |
| Mobile | none this pass | Out of scope — see Scope |

No `backend/src/shared/` additions are expected — this feature reuses the existing shared audit utility and existing middleware chain.

## Architecture Update (Periods) — additional files

| Area | Files | New / Modified |
|---|---|---|
| Database | `backend/prisma/schema.prisma`, one new migration (WP10) | Modified / New |
| School Schedule backend | Same files as above (`school-schedule.{controller,service,repository,validation,routes}.js` + test files) | Modified — Period functions added to the same module, not a new module |
| Web | `web/src/features/school-schedule/{pages,components,services}/*` | Modified (existing files) / New (`CreatePeriodDialog.jsx`, `EditPeriodDialog.jsx`) |
| Class Management, School & Platform Management | none | Not touched by this addition — Period has no dependency on either |

No new feature module is created — Period is folded entirely into the existing `school-schedule` module and its existing Web feature folder, consistent with the Business Specification's own "extension, not a standalone feature" framing.

---

# Dependencies

- **School & Platform Management** — Accepted. Requires one small, additive change (WP5): `createSchool` gains two additional inserts in its existing transaction. Does not reopen its Feature Acceptance.
- **Class Management** — Accepted. Requires a required `shiftId` (an additive schema change plus one-time backfill, WP1 Migration B and WP6) and consumes this feature's `getActiveShift`/`validateShift` narrow interface. **This is the one genuinely blocking ordering dependency in this plan**: WP1 Migration A's backfill must complete before WP1 Migration B runs, and WP6's code changes depend on WP7's public interface already existing. Does not reopen Class Management's own Feature Acceptance.
- **Authentication & Authorization** — every endpoint depends on its existing role-enforcement middleware; no new authentication mechanism, no blocker.
- **Timetable, Attendance, Exam Management, Grade Book, Report Card, Teacher Subject Assignment** (Teacher Subject Assignment Approved-through-Implementation-Planning; the rest future) — each is an *inbound* future dependency (they will consume the Stable Public Service Interface once built, or in Teacher Subject Assignment's case, once its own Implementation reaches Phase 6); none block this feature's own Implementation.
- No other blocking dependency remains for this feature.
- **(Architecture Update — Periods)** No dependency on Class Management or School & Platform Management — Period's only relationship is to its own parent `Shift`, already fully implemented. **Timetable, Attendance, Exam Management, Teacher Daily Schedule, Student Daily Schedule** — each an *inbound* future dependency on `getShiftPeriods`/`getPeriodById`/`validatePeriod`; none exist yet, none block this addition's own Implementation.

---

# Risk Assessment

- **Migration sequencing is the single highest-severity risk in this plan.** WP1 Migration A (this feature's own tables + backfill of every existing school) must fully commit before WP1 Migration B (Class Management's `shiftId` + backfill) runs — Migration B's own backfill query directly reads the `Shift` rows Migration A creates. Running these out of order, or combining them into one migration, would leave Migration B's backfill with nothing to point at. Implementation must treat these as two explicit, sequential deploy steps, never a single combined change.
- **Concurrency — addressed proactively from the first Implementation pass, per Technical Design.** `Shift.isDefault` and `Shift.displayOrder` are both protected by the same per-school advisory lock, across `createShift`, `updateShift`, `reorderShift`, `designateDefaultShift`, `archiveShift`, and `reactivateShift` — every one of the six write paths, not a subset. Code review at Phase 9 should specifically check that no new write path to any of these fields is ever added outside this lock.
- **`reactivateShift`'s overlap re-check (the Technical Design Review finding) must actually ship, not regress back to the simpler v1.0 draft behavior during Implementation.** This plan's own Testing Strategy includes a dedicated test for exactly this scenario (see Edge Case Tests) to guard against it being silently dropped.
- **The `startTime`/`endTime` native Postgres `TIME` type is new to this codebase.** Implementation should confirm Prisma's generated client correctly round-trips `@db.Time()` values (a `DateTime` using a fixed reference date) through both the API layer's JSON serialization and the overlap-check comparison logic before this WP is considered done — this is worth an explicit unit test rather than assuming it "just works" because other `DateTime` fields elsewhere do.
- **`Class.shiftId`'s backfill target (each school's own Default Shift) must exist for every school before Migration B runs.** If any existing school somehow lacks a `SchoolCalendar`/`Shift` pair after Migration A (should not happen if Migration A's own backfill query correctly covers every row in `schools`), Migration B's backfill would leave that school's Classes with a `NULL` `shiftId` that the subsequent `NOT NULL` constraint would then reject at the database level, failing the migration loudly (a safe failure mode, per Decision-Making-Principles' Fail Safely) rather than silently succeeding with bad data.
- **`countActiveClassesByShift` (WP6) is a new query Class Management's own repository must support efficiently.** Since `Class.shiftId` is indexed only implicitly (as a foreign key), Implementation should confirm whether an explicit `@@index([schoolId, shiftId])` on `Class` is warranted — a small addition to Migration B if so, still within Class Management's own additive change, not a separate migration.
- **(Phase 9 finding, original scope) `createClass`/`updateClass`'s own `shiftId` validate-then-write path had no lock at all**, letting it race against `archiveShift` and leave an active Class referencing an Archived Shift with no error to either caller. Found live, reproduced, and fixed during Phase 9 code review by having Class Management's own `createClass`/`updateClass` acquire the identical `hashtext(schoolId)` lock `archiveShift` holds. Recorded here as a completed risk closure, not an open item — see Code-Review-Report.md and Technical Design's own Risks section for the full writeup. Flagged for **WP11's own attention**: Period's `createPeriod`/`updatePeriod` have no equivalent external consumer yet to race against (no feature outside this module writes a `periodId` anywhere), so this exact shape of race does not yet exist for Period — but if any future feature (e.g. Timetable) ever gains a required `periodId` reference the way Class gained `shiftId`, that feature's own writes must acquire this feature's `shiftId` lock the same way, from its own first Implementation pass, not discovered a fifth time.
- **(Architecture Update — Periods, updated following that addition's own Phase 4 Technical Design Review) A new lock granularity (`shiftId`, not `schoolId`) is introduced for the first time in this codebase — Technical Design Review found this was not as isolated as the v1.2 draft assumed.** Two code paths, not one, touch both lock keys: `createShift`'s own wizard-generation step (acquires only `schoolId` — the new Shift's own `shiftId` is never separately locked, since nothing can contend for a `shiftId` that doesn't exist outside that same transaction yet) and **`updateShift` (Shift Correction, WP3, retrofitted — see WP11), which now acquires both, always `schoolId` first then `shiftId`.** No code path may ever acquire `shiftId` before `schoolId` — doing so would create a deadlock cycle against `updateShift`'s own fixed order. This ordering rule must be preserved as an in-code comment at every lock-acquisition call site during Implementation, not only in this document.
- **(Architecture Update — Periods) The backfill for Shifts that already exist (WP12) touches every existing school's every existing Shift** — by the time this addition ships, this includes every school created since the original Calendar/Shift scope went live, each with at least one Shift (its own default "Morning" Shift, plus any manually created since). Implementation should confirm this backfill is idempotent (safe to re-run without creating duplicate Period structures for a Shift that already has one) and treated as a data migration with the same rigor as WP1's own backfills, not an afterthought script.
- **(Architecture Update — Periods, resolved by Phase 4 Technical Design Review) The wizard's assembly and naming algorithm are now both fully specified** (see WP12) — no longer an inference Implementation must guess at. This plan's own Testing Strategy includes a dedicated test asserting the exact structure the Business Specification's default example implies, plus the general `breakAfterPeriod`/`teachingPeriodCount` assembly rule.
- **(Architecture Update — Periods, closed by Phase 4 Technical Design Review) `updateShift` narrowing a Shift's own operating hours could previously leave existing Periods silently out of bounds, discovered via a genuine cross-lock-key race.** This is now closed at the design level (see above); Implementation must ship the fix as part of the same pass as WP10–WP15, not as a follow-up, since the retrofit to WP3's `updateShift` and Period's own existence are inseparable — the gap cannot be exercised before Period exists, but must not ship without the fix once it does.

---

# Testing Strategy

Per `docs/05-templates/Test-Plan-Template.md`'s categories, applied to this feature.

## Functional Tests
- `updateSchoolCalendar` succeeds for a valid `workingDays` array and correctly derives `getWeekendDays` as the complement.
- `createShift` succeeds, is Active, never Default, and receives the next end-of-sequence `displayOrder`.
- `updateShift` succeeds and re-validates overlap against the *other* active Shifts (excluding itself).
- `reorderShift` correctly renumbers every affected active Shift to a contiguous 1..N sequence.
- `designateDefaultShift` correctly unsets the previous Default and sets the new one, atomically.
- `archiveShift` removes the Shift from the active `displayOrder` sequence and renumbers the remainder; `reactivateShift` appends it back to the end.
- The eight Stable Public Service Interface functions return the expected filtered/scoped/derived results.
- **(Architecture Update — Periods)** `createPeriod` succeeds, is Active, and receives the next end-of-sequence `displayOrder` scoped to its own Shift. `updatePeriod` re-validates containment + overlap against the *other* active Periods in the same Shift (excluding itself), only when both times are present. `reorderPeriod`/`archivePeriod`/`reactivatePeriod` mirror the equivalent Shift-level behavior, one level down. `generatePeriodStructure` produces exactly the Business Specification's own default sequence (`Period 1, Period 2, Period 3, Break, Period 4, Period 5, Period 6`) with correct types, order, and null times. The three new Stable Public Service Interface functions return the expected filtered/scoped/derived results.

## Permission Tests
- Every write endpoint rejects non-School-Admin callers (Super Admin, Teacher, Student, Accountant) with 403; the two `GET` endpoints additionally accept `TEACHER`.
- A School Admin from School A receives 404 (never a leaked 403) when targeting School B's Calendar or a Shift belonging to School B.
- The Super Admin oversight routes (`/schools/{id}/school-calendar`, `/schools/{id}/shifts`) are read-only — confirm no write verb is registered at either path.
- **(Architecture Update — Periods)** Every Period write endpoint rejects non-School-Admin callers with 403; the two Period `GET`s additionally accept `TEACHER`. A School Admin from School A receives 404 targeting a Period belonging to a Shift in School B. The new nested oversight route (`/schools/{id}/shifts/{shiftId}/periods`) is read-only.

## Validation Tests
- `PATCH /school-calendar` rejects an empty or full 7-day `workingDays` array, and any value outside the `DayOfWeek` enum, with 422.
- `POST`/`PATCH /shifts` reject missing/invalid `name`/`startTime`/`endTime`, and `endTime` not after `startTime`, with 422.
- `PATCH /shifts/{id}` rejects any field other than `name`/`startTime`/`endTime` with 422 (Guard by Construction) — confirm `displayOrder`, `isDefault`, `status` in the body are all individually rejected.
- `PATCH /shifts/{id}/sequence` rejects a non-positive-integer `position` with 422.
- **(Architecture Update — Periods)** `POST`/`PATCH /periods` reject an invalid `type`, missing `name`, only one of `startTime`/`endTime` present, and `endTime` not after `startTime`, with 422. A configured Period outside its parent Shift's own operating hours is rejected with 422. `PATCH /periods/{id}` rejects any field other than `name`/`type`/`startTime`/`endTime` (Guard by Construction). `POST /shifts`'s wizard fields reject a non-positive `teachingPeriodCount` and a `breakAfterPeriod` exceeding it, with 422.

## Edge Case Tests

Every "Situation → Expected Behavior" row in the Business Specification's Edge Cases table, including:
- A new school is created with both its default Calendar and default "Morning" Shift already present, atomically.
- Creating/editing a Shift whose time range overlaps an existing active Shift — 409.
- **Reactivating an Archived Shift whose old time range now overlaps a Shift created or edited while it was archived — 409, the Technical Design Review finding's own dedicated test.**
- Designating an Archived Shift as Default — 409.
- Archiving the school's only remaining active Shift, its current Default Shift, or a Shift referenced by an active Class — 409 in each case.
- Restoring an Archived Shift appends it to the end of the active `displayOrder` sequence, not its old position.
- **(Architecture Update — Periods)** A new school's default "Morning" Shift already has its full default Period structure present, atomically, with all times null. Creating a Shift via the wizard with custom `teachingPeriodCount`/`includeBreak`/`breakAfterPeriod` values produces the exact expected structure. A newly generated Period structure has no times yet, and is fully usable in that state (list/detail/reorder/archive all work on an unconfigured Period). Configuring a Period outside its parent Shift's operating hours — 422. Configuring overlapping active Periods within the same Shift — 409. Reactivating an Archived Period whose old time range now overlaps a Period created/edited while it was archived — 409, the same shape as Shift's own Technical Design Review finding, applied one level down from the start (not discovered later).

## Integration Tests
- The full `POST /shifts` → `PATCH .../sequence` → `PATCH .../designate-default` → `PATCH .../archive` → `PATCH .../reactivate` round trip, exercised via real HTTP routes, confirming `displayOrder` and `isDefault` end up correct at each step.
- A concurrency test firing genuinely simultaneous `designateDefaultShift`/`createShift`/`archiveShift` calls for the same school against the real database, confirming the advisory lock actually serializes them and no `isDefault`/`displayOrder` invariant is ever violated — mirroring Teacher Subject Assignment's own real-database concurrency test exactly.
- Real `audit_logs` table queries (not mocked) confirming at least one `SHIFT_CREATED` and one `SHIFT_DEFAULT_DESIGNATED` row persist correctly with the school's own `schoolId`.
- An end-to-end test creating a Class with no explicit `shiftId`, confirming it defaults to the school's own Default Shift.
- **A real-database regression test proving the Phase 9 concurrency fix holds**: firing a genuinely concurrent `archiveShift` and `createClass`(pointed at that same Shift) against the real database and asserting the two outcomes are never simultaneously "both succeeded" — i.e., either the Class create is rejected (422, Shift no longer Active) or the archive is rejected (409, an active Class now references it), never both `200`/`201` leaving an active Class referencing an Archived Shift.
- **(Architecture Update — Periods)** A concurrency test firing genuinely simultaneous Period writes (`createPeriod`/`reorderPeriod`/`archivePeriod`) for the *same Shift*, confirming the `shiftId`-scoped lock serializes them. A second concurrency test firing simultaneous writes to *two different Shifts in the same school* (one Period write, one Shift write — e.g. `createPeriod` on Shift A concurrently with `designateDefaultShift` promoting Shift B), confirming they do **not** block each other (proving the two lock keys are genuinely independent, not accidentally serialized). Real `audit_logs` queries confirming at least one `PERIOD_CREATED` row persists correctly.
- **(Architecture Update — Periods, Technical Design Review finding) A dedicated real-database concurrency test for the `updateShift`-vs-Period race this Review found**: create a Shift with a configured Period near one edge of its operating hours, then fire a genuinely concurrent `updateShift` (narrowing the range to exclude that Period's own times) and `createPeriod`/`updatePeriod` (writing a Period whose times are valid under the *old* range but not the *new* one) against the real database — asserting the two outcomes are never simultaneously "both succeeded," mirroring the Phase 9 `archiveShift`-vs-`createClass` regression test's own shape exactly, one level down.
- **(Architecture Update — Periods, Technical Design Review finding)** A test asserting `updateShift` rejects (409) narrowing a Shift's operating hours when an existing configured Period would fall outside the new range, and accepts it when no active Period is affected.
- **(Architecture Update — Periods, Technical Design Review finding)** A test asserting `generatePeriodStructure`'s assembly algorithm for a non-default input (e.g. `teachingPeriodCount: 4, includeBreak: true, breakAfterPeriod: 4` — Break at the very end) produces the correct slot order and names, not just the one default (6/Yes/3) example.

## Regression Tests
- Existing School, Class, Student, Teacher, Auth, Subject, Academic Year, and Teacher Subject Assignment test suites re-run and passing unchanged, except the small, intentional additions this plan makes to School & Platform Management's and Class Management's own test suites (WP5, WP6) — those additions should be new tests, not modifications to existing passing ones.
- **(Architecture Update — Periods)** Existing School Schedule Management (Calendar/Shift) test suites re-run and passing unchanged, except the intentional additions WP12 makes to `createShift`'s own tests (wizard fields) and `createDefaultScheduleForSchool`'s own tests (default Period structure) — new tests, not modifications to already-passing ones.

---

# Definition of Done Coverage

Mapped against `docs/02-standards/Definition-of-Done.md`'s checklist:

| Item | Coverage in this plan |
|---|---|
| Business logic approved | `docs/03-business/School-Schedule-Management.md` v1.2, Approved (Business Review, plus the Architecture Update that added Period Management). |
| Edge cases reviewed | Business Specification's Edge Cases table plus this plan's own Testing Strategy Edge Case Tests. |
| Technical design completed | `docs/06-technical-design/School-Schedule-Management.md` v1.1 Approved (Calendar/Shift) + v1.2 drafted, awaiting its own Phase 4 review (Periods). |
| Security considered | Technical Design's Security Considerations; this plan's Risk Assessment (advisory lock coverage, migration sequencing, the two independent lock keys). |
| Validation completed | This plan's Validation Tests category; shape vs. service-layer split per the Technical Design's Validation Strategy. |
| Development / implementation completed | Tracked per work package: WP1–WP9 (Calendar/Shift) and WP10–WP15 (Periods) both complete through Phase 8. |
| Standards followed | Naming-Conventions.md, Database-Standards.md, API-Standards.md, Security-Standards.md all cited per relevant Work Package above. |
| Code is clean | Enforced at Phase 6/Phase 9 (code review). Phase 9 complete for both scopes — see below. |
| No known issues remain | This plan's Risk Assessment items are each closed. Both Phase 9 findings (the original scope's `archiveShift`/`createClass` concurrency race, and Period's own `reorderShift` crash-on-Archived-id) are resolved; see Risk Assessment and `docs/00-governance/Code-Review-Report.md`. |
| Tests passed | This plan's Testing Strategy (all six categories) passes for both scopes — 34 suites, 847 tests, zero exclusions. |
| Code reviewed | Per Development-Lifecycle.md Phase 9, an independent code review is required before Feature Acceptance, consistent with every prior feature. **Phase 9 is complete for the entire feature** — the original scope's Critical concurrency issue and Period's own Major `reorderShift` defect were each found and fixed; see `docs/00-governance/Code-Review-Report.md`. |
| Documentation updated | Business Specification, Technical Design, this plan, and `docs/08-validation/School-Schedule-Management.md` (v1.1, now covering both scopes) are all current. |

Every item is either already satisfied at the planning level or has an explicit, named place in this plan where it will be satisfied — none are silently deferred without a tracked location.

---

# Estimated Impact

Larger than any single prior feature's own first pass, because it is the first feature in this project requiring **coordinated additive changes to two different already-Accepted features at once** (School & Platform Management's `createSchool`, Class Management's `shiftId`) plus its own two-migration sequencing constraint — a combination of Academic Year Management's own advisory-lock-and-partial-index discipline (for `isDefault`) with Class Management's own sequence-renumbering discipline (for `displayOrder`), applied together to one entity for the first time. Backend carries the bulk of this pass's complexity (six locked Shift write paths, two ordered migrations, two cross-feature additive changes); Web is a single combined settings page, structurally simpler than Teacher Subject Assignment's own multi-dialog Web surface; Mobile is explicitly out of scope.

**Architecture Update (Periods) — additional impact:** a third entity within the same module, one level below Shift, with its own full CRUD lifecycle (7 write paths: create, correct, reorder, archive, reactivate, plus the bootstrap/wizard generation helper) and a genuinely new lock granularity (`shiftId`-scoped, the first non-school-scoped lock in this codebase). No new cross-feature dependency is introduced (Period depends only on its own already-implemented parent Shift) and no already-Accepted feature outside this module is touched — smaller in cross-feature coordination terms than the original scope's own two-feature reach, but comparable in raw backend surface area (WP10–WP15 mirror WP1/WP3/WP4/WP7/WP8/WP9's own shapes one level down). Web impact is additive to the existing settings page (per-Shift expansion), not a new page.

---

# Change History

- v1.0 — Initial implementation plan, following Technical Design Review approval (`docs/06-technical-design/School-Schedule-Management.md` v1.1, Approved). Settles the one mechanism choice Technical Design explicitly deferred (Class Management's archive-dependency check: a single narrow interface function, `countActiveClassesByShift`, not a Subject-Management-style registry, since only one consumer will ever exist). Scoped to Backend + Web; Mobile deferred, consistent with every prior feature's plan. Carries forward the Technical Design's own migration-sequencing constraint as this plan's single highest-severity Risk Assessment item, and its `reactivateShift` overlap-recheck finding as its own dedicated Testing Strategy line item, so neither is silently lost between phases.
- v1.1 — Architecture Update (Periods), following the Business Specification's v1.2 extension and Technical Design's own v1.2 addition. Adds WP10 (Database Schema & Migration — `Period`, `PeriodType`, `PeriodStatus`, no dependency on WP1's migrations), WP11 (Period Core & Lifecycle Backend, mirroring WP3/WP4 one level down under a new `shiftId`-scoped advisory lock), WP12 (Bootstrap & Wizard Period Generation, extending `createShift` and `createDefaultScheduleForSchool`, plus a backfill for every Shift that already exists), WP13 (Stable Public Service Interface additions — `getShiftPeriods`/`getPeriodById`/`validatePeriod`), WP14 (Audit Logging for Periods), and WP15 (Web Frontend for Period management). Also records, as a completed risk closure rather than an open item, the Critical concurrency finding this feature's own Phase 9 review found and fixed in the *original* scope (`createClass`/`updateClass`'s unlocked `shiftId` validate-then-write path racing `archiveShift`) — carried into this plan's Risk Assessment and Testing Strategy so the regression test is not lost. No dependency between the Period addition and either already-Accepted feature (Class Management, School & Platform Management) this feature previously required additive changes of. Phase 9 (Feature Acceptance) for the complete feature is paused pending WP10–WP15's own Phase 6/7.
- v1.2 — Updated following the Architecture Update's own Phase 4 (Technical Design Review) approval (`docs/06-technical-design/School-Schedule-Management.md` v1.3, Approved). That Review found a significant cross-entity gap: `updateShift` (WP3, already implemented for the original scope) could silently invalidate a Period's containment invariant when narrowing a Shift's operating hours, via a genuine cross-lock-key race against Period's own independent `shiftId`-scoped lock. This plan now carries the fix as an explicit **retrofit to WP3's `updateShift`** (documented under WP11, since it cannot be exercised or shipped before Period exists): acquire `acquireShiftLock` immediately after the existing `acquireSchoolLock`, in that fixed order always, then re-validate Period containment before committing. Also carries forward the Review's two resolved smaller items: the wizard's slot-assembly algorithm is now fully specified (WP12, no longer an inference), and the manual single-Period-create endpoint is confirmed, not just assumed. Risk Assessment and Testing Strategy updated accordingly — the previously-pending "lock ordering must be confirmed" and "naming algorithm must be confirmed" items are now resolved, not open, and a new dedicated regression test for the `updateShift`-vs-Period race is added, mirroring the original scope's own Phase 9 `archiveShift`-vs-`createClass` regression test one level down. **Approved by the Product Owner — Technical Design Review complete for the Architecture Update; ready for Phase 6 (Implementation) of Periods.**
- v1.3 — WP10–WP15 (Periods) completed Phase 6 (Implementation), Phase 7 (Validation, `docs/08-validation/School-Schedule-Management.md` v1.1), and Phase 9 (Feature Acceptance). Phase 9 found and fixed one Major defect: `reorderShift` (WP4, original scope) crashed with an unhandled `TypeError` rather than rejecting cleanly when given an Archived Shift's id — the same category of guard `reorderPeriod` (WP11) already had and `reorderShift` did not; found by comparing the two siblings during this review, not by a failing test. Also root-caused and fixed a long-standing test-infrastructure issue in `school-schedule.routes.test.js` previously carried as "pre-existing, unrelated, rate-limit-exhausted" without being traced: three `createTestSchoolAdmin` calls in one file spent 6 requests against `passwordResetLimiter`'s shared 5-per-15-minute budget; a new `createTestSchoolAdminDirect` test helper avoids the flow entirely for fixtures that don't need to exercise it. Full backend suite: 34 suites, 847 tests, zero exclusions. **Phase 9 is now complete for the entire feature — Definition of Done Coverage updated accordingly.**
