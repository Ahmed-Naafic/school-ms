# Architecture Change Request: Timetable Generation-First Architecture

ACR Number: ACR-007

Date: 2026-07-31

Status: Approved

---

# Context

Timetable Management (`docs/03-business/Timetable.md` v1.0, Approved and implemented) was built around manual, cell-by-cell Lesson creation as the primary — and only — workflow: a School Admin placed each Lesson by hand, one Teacher Subject Assignment + Day + Period at a time, with automatic generation explicitly listed as Out of Scope ("Automatic timetable generation or optimization of any kind").

The Product Owner has since explicitly reversed this: "That approach is no longer acceptable. Schools should not be expected to manually create hundreds or thousands of timetable entries. The timetable must be GENERATED automatically. The administrator configures the academic data. The system generates the timetable. The administrator then reviews and adjusts the generated timetable."

This is not an additive change to another already-Accepted feature (the shape every prior ACR in this project has recorded) — it is a reversal of this feature's own previously-Approved architecture, directed by the Product Owner after Feature Acceptance. It is recorded as a formal ACR regardless, for the same reason every other significant, hard-to-reverse architectural decision in this project is: so the reasoning and the alternatives considered are traceable, not just the resulting code.

---

# Options Considered

## Decision 1 — Scope of Terms

**Option A — Defer Terms entirely; generate and Publish per full Academic Year (Selected).**
No Term entity exists anywhere in this project. Building one (its own CRUD, business rules, relationship to Academic Year) is a substantial feature in its own right, not a natural sub-task of a generation engine. Lesson already scopes to Academic Year only; deferring Terms means no schema change to Lesson's own scoping is needed at all.

**Option B — Design and build a full Term entity/feature now, as a prerequisite.**
Rejected: this would make an already-large Architecture Change strictly larger, and Term-scoped generation is additive to a per-Academic-Year engine, not a redesign of it — nothing is lost by deferring.

## Decision 2 — Generation execution model

**Option A — Synchronous request/response.**
Simpler, but a real school's generation run (many Classes × Periods × constraints) is not guaranteed to finish inside a single HTTP round trip; a slow or interrupted request would leave the Administrator with no result and no way to know whether anything happened.

**Option B — Background job with polling (Selected).**
The Product Owner's own explicit choice. `POST /timetable/generate` returns a job id immediately; the Administrator polls `GET /timetable/generation-jobs/{id}` for status and progress until it completes. No job queue/worker infrastructure exists anywhere in this project (no Redis, no BullMQ) — introducing one would be a disproportionately large new-technology decision for this single feature. The simplest mechanism that fits this project's current single-process architecture is used instead: a DB-persisted status/progress row (`TimetableGenerationJob`), updated by an async function fired via `setImmediate` and never awaited by the request handler.

## Decision 3 — Double periods

**Option A — A new Lesson shape spanning two Periods (a single record with a start/end Period range).**
Rejected: this would change the one-Lesson-per-Period data model every other feature (most concretely, a future Attendance Management) is expected to assume — Attendance records per Period, not per arbitrary span.

**Option B — Two ordinary Lesson rows, linked as a "Lesson Group" (Selected).**
The Product Owner's own explicit choice, given verbatim: "do not implement it as a single Lesson spanning multiple periods. Instead, implement a first-class 'Lesson Group' concept... Each Lesson still references exactly one Period." Preserves the existing model entirely; a `LessonGroup` is purely a linking record with no scheduling data of its own. Move/swap/lock/unlock apply to both members at once; Delete prompts about the whole group; a dedicated, confirmed, audited Split action breaks the link.

## Decision 4 — Publish granularity

**Option A — Per-Lesson draft/published state.**
Rejected: meaningfully more complex (partial publishing, per-Lesson version tracking) for no concretely stated need in this pass; the Product Owner's own described workflow ("Replace the current Published timetable with the Draft. Archive the previous Published timetable.") describes a single, whole-timetable transition, not a per-row one.

**Option B — A single school-wide Draft/Published toggle per Academic Year (Selected).**
The Product Owner's own explicit choice. Modeled as a new top-level `TimetableVersion` entity (Draft/Published/Archived) that every Lesson now belongs to — not a status field on `School` or `AcademicYear`, since a school accumulates a history of superseded (Archived) versions over time, which a single status field cannot represent.

---

# Decision

All four options above (1A, 2B, 3B, 4B) are adopted together, as one coherent architecture:

- **`TimetableVersion`** (Draft / Published / Archived) becomes the entity every `Lesson` belongs to. Exactly one Draft and exactly one Published version may exist per school per Academic Year at a time (two new partial unique indexes), enforced the same way every other "exactly one X" invariant in this project already is.
- **Every Lesson write — generated or manual — targets the current Draft**, auto-created on first write if none exists. Teacher/Student consumption (once it exists) and Super Admin oversight always read the Published version.
- **A generation engine** (most-constrained-first greedy placement, preference-weighted scoring among Hard-Constraint-surviving candidates — not a formal CSP/SAT solver, and no new solver dependency) creates the required Lesson records automatically, reporting anything it could not place ("Missing Lessons") rather than silently omitting it or failing the whole run.
- **A background job mechanism** (`TimetableGenerationJob`, no new infrastructure) tracks a generation run's status and progress for polling.
- **`LessonGroup`** links two ordinary Lessons into a double period; **`locked`** is a Guard-by-Construction flag protecting a Lesson from any move, swap, delete, or regeneration.
- **`publishTimetableVersion`** performs the Draft → Published, Published → Archived transition as one locked, explicit, audited action.
- **Manual, individual Lesson creation is retained**, but demoted from "the workflow" to "an advanced override" — the same Hard Constraints apply to it as to generation, since both write through the identical validation pipeline.

## Requirements

- No Term entity is introduced; generation and Publishing remain scoped to a full Academic Year.
- No job queue/worker infrastructure is introduced; a process crash mid-generation-run is Accepted Technical Debt (the job remains stuck at `RUNNING`, with no automatic recovery in this pass).
- No new Lesson shape (a spanning-Period record) is introduced; a double period is always two ordinary Lesson rows.
- Publishing is school-wide per Academic Year, never per-Class or per-Lesson, in this version.
- The generation engine must never violate a Hard Constraint (Teacher/Class conflict, Break protection, Shift compatibility, Teacher-Subject assignment validity, weekly targets, Teacher availability, double-period consecutiveness, Locked Lessons) — it may only fail to *satisfy* one by reporting the affected Lesson as Missing, never by placing a Lesson that violates one.

---

# Reasoning

Every decision above was made by the Product Owner directly, in response to explicit scoping questions raised before implementation began (see `docs/03-business/Timetable.md` v2.0's own Change History) — this ACR records the resulting architecture and the alternatives considered, not a unilateral engineering judgment call. Where a genuine ambiguity remained even after those questions (specifically: whether Publishing should seed the next Draft from the just-published state, or start the next Draft empty), it is recorded as an open risk in Technical Design rather than silently resolved one way without flagging it.

---

# Consequences

## Positive

- Schools no longer need an Administrator to place every Lesson by hand — the stated business problem this reversal exists to solve.
- The existing Lesson data model, and every future per-Period feature built against it (most concretely Attendance), is preserved unchanged — double periods and Draft/Published both layer on top via new linking entities, not a redesign of Lesson itself.
- The generation engine and manual Lesson creation share one validation pipeline — there is no risk of the engine and a human enforcing different rules, because there is only one set of rules, enforced once.

## Negative

- Meaningfully larger surface area than v1.0: a new algorithmic engine, a new background-job mechanism, and a new versioning concept every pre-existing Lesson had to be migrated into.
- The re-scoping of Lesson's own Teacher/Class conflict partial unique indexes (from `academicYearId` to `timetableVersionId`) is a real behavior change to already-shipped constraints, requiring a careful, verified backfill of every pre-existing Lesson.
- No job-crash recovery mechanism exists — an operational gap accepted deliberately, not overlooked, but a real gap nonetheless until a future enhancement addresses it.

## Future Impact

- Term-scoped generation, if ever approved, is an additive change to this architecture (a new optional scope dimension), not a further redesign.
- A real job queue, if this project ever adopts one for other reasons, would let a future enhancement add crash recovery to this feature's own generation jobs without redesigning them.
- Per-Class or per-Lesson granular Publishing, if a real need emerges, would require revisiting `TimetableVersion`'s own granularity — noted as a possible future decision, not attempted here.

---

# Related Documents

- `docs/03-business/Timetable.md` v2.0 — the Business Specification's own Architecture Change, Change History.
- `docs/06-technical-design/Timetable.md` v1.1 — the Architecture Update (Generation-First) section this ACR's decisions are implemented against.
- `docs/07-implementation-planning/Timetable.md` v1.1 — WP11–WP18.
- `docs/00-governance/Development-Roadmap.md` — Order #10's own status entry, updated to reflect this reversal.
