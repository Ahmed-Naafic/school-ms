# Administrative Corrections

Version: 1.0

Status: Draft — placeholder only. Scope, workflow, and permissions below are a starting point for this feature's own Business Discovery/Business Specification phases, not an approved specification. No API or UI is implemented for this feature. Per Development-Lifecycle.md, this feature does not begin Business Specification in earnest until its turn in the Development Roadmap's Feature Delivery Sequence.

---

# Purpose

Several features in this system deliberately model certain lifecycle transitions as permanent, one-way business events — for example, Student Management's Transfer and Graduation (`docs/03-business/Student-Management.md`, Business Rule #15). This permanence is correct and intentional: it reflects a real-world fact (a student has left for another school, or has completed their academic program), not an arbitrary restriction.

Permanent does not mean "unfixable." A School Admin can still mis-click, select the wrong student, or otherwise trigger one of these events by mistake. Student Management's own Business Rules #6 and #15 already anticipate this, stating that correcting such a mistake is "a separate, controlled administrative correction process," deliberately distinct from a simple restore/undo action.

This feature exists to be that process — a single, cross-cutting mechanism for correcting administrative mistakes wherever a feature has a permanent, audited lifecycle event, rather than each feature inventing its own bespoke correction/undo logic.

---

# Scope

**Included (intended, pending full Business Specification):**
- A controlled workflow for correcting a mistaken permanent lifecycle event (e.g., a wrong Transfer or Graduation in Student Management).
- A mandatory, recorded reason for every correction.
- Permission-gated access, scoped narrowly (expected to be more restrictive than the permission that performed the original action — exact role(s) are an open question, see below).
- An audit trail that preserves the original event and adds the correction as a new, distinct event — never editing or removing history.

**Not included:**
- A generic "Restore to Active" or "Undo" action on any feature. This feature is explicitly not that — it is a controlled, reasoned, audited correction, not a one-click reversal.
- Any change to which lifecycle events are considered permanent. Student Management's Transfer and Graduation remain permanent lifecycle events; this feature corrects mistakes about them, it does not make them reversible in the ordinary course of business.
- Manual database edits as a supported or sanctioned workflow. This feature exists specifically so that a database edit is never necessary for this purpose.
- Implementation of any kind (API, UI, or otherwise) until this feature reaches its own Implementation phase per Development-Lifecycle.md.

---

# Actors

- **School Admin** — the actor who may trigger the *original* permanent event this feature later corrects. Whether School Admin may also perform the correction, or whether correction requires a more privileged actor, is an open question below.
- **Super Admin** — platform-level actor; a candidate for who may be required to authorize or perform a correction, given the sensitivity of altering a recorded permanent event.

---

# Permissions

Not yet decided. Candidate approaches to resolve during this feature's own Business Specification phase:
- Only Super Admin may perform a correction (strongest control, but slower for the School Admin who made the mistake).
- School Admin may perform a correction within their own school, with mandatory reason and audit (faster, but the same actor who erred self-corrects).
- A hybrid: School Admin may request a correction; Super Admin (or a second School Admin) approves it.

Whichever is chosen, per the Product Owner's decision establishing this feature, a correction must always require a mandatory reason and must always be more tightly gated than an ordinary action, never less.

---

# Business Workflow

Not yet designed. To be defined in this feature's own Business Specification phase. At minimum, per the Product Owner's decision establishing this feature, the workflow must:

1. Require the acting user to hold whatever permission this feature's Business Specification ultimately defines for corrections.
2. Require a mandatory correction reason before any correction is recorded.
3. Record the correction as a new event, distinct from the original lifecycle event it corrects.
4. Never delete, overwrite, or otherwise mutate the original historical event.

---

# Business Rules

1. A correction never deletes, overwrites, or mutates a historical lifecycle event. The original event remains exactly as it was recorded.
2. Every correction is itself a new, permanent, audited record — a correction is not a "soft undo" that makes it as though the original event never happened.
3. A correction always requires a mandatory reason, recorded alongside the correction event.
4. A correction requires permission specific to this feature — never merely the permission that performed the original action.
5. This is a cross-cutting feature. It corrects mistakes recorded by other features (starting with Student Management's Transfer and Graduation) without those features needing to implement their own bespoke undo/correction logic.

---

# Edge Cases

Not yet analyzed — deferred to this feature's own Business Specification phase.

---

# Relationships

- **Student Management** (`docs/03-business/Student-Management.md`) — the motivating case for this feature. Its Transfer and Graduation lifecycle events remain permanent and unchanged; this feature is the "separate, controlled administrative correction process" that Business Rules #6 and #15 there refer to, without Student Management implementing it directly.
- Future features that introduce their own permanent, one-way lifecycle events are expected to rely on this feature for corrections rather than each defining their own.

---

# Audit Requirements

- Every correction must be audited with, at minimum: who performed it, when, the mandatory reason, and a reference to the original event being corrected.
- The original event's own audit record is never altered.

---

# Acceptance Criteria

Not applicable yet — this document is a placeholder, not an approved specification. Acceptance criteria will be defined during this feature's own Business Specification phase.

---

# Open Questions

1. Who may perform a correction — School Admin, Super Admin, or an approval-based hybrid of both? (See Permissions above.)
2. Is there a time limit after the original event within which a correction may be requested, or is it unbounded?
3. When a correction reverses a Transfer or Graduation, does the student's status return to `ACTIVE`, to their prior status before the original event, or something else? Does an Enrollment need to be re-created, and if so, by this feature or by Student Management's own Enrollment action?
4. Does every feature's permanent lifecycle events go through this one shared feature, or does each feature register which of its events are correctable?

---

# Future Extensibility

This feature is intended to generalize beyond Student Management as other features introduce their own permanent, audited lifecycle events. It should be designed so that adding a new "correctable event type" from another feature does not require redesigning this feature's core workflow, permissions, or audit model.

---

# Known Implementation Gap (recorded, not yet resolved)

Until this feature is designed and implemented, **there is no in-application recovery path for a mistaken Transfer or Graduation in Student Management.** This is intentional and recorded here rather than worked around:
- Student Management's lifecycle implementation is correct and unchanged — Transfer and Graduation remain permanent, per approved Business Rules.
- A generic "Restore to Active" action was explicitly rejected as a substitute for this feature.
- A manual database edit is not a supported workaround.
- See `docs/00-governance/Development-Roadmap.md` for this feature's backlog status.
