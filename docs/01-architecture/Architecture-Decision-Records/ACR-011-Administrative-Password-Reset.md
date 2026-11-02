# Architecture Change Request: Administrative Password Reset for School-Scoped Staff

ACR Number: ACR-011

Date: 2026-08-24

Status: Approved and Implemented — see Authentication-and-Authorization.md Change History v1.7

---

# Context

Authentication & Authorization's only existing password-recovery path is fully self-service: the account owner requests recovery, proves ownership through their verified recovery contact, and only then establishes a new password (Business Workflow §5, Business Rule #13). No role — including School Admin — has ever had a way to directly initiate a credential reset on another user's behalf.

In practice, this leaves School Admin with no way to unblock a Teacher, Manager, or Accountant who cannot complete the self-service flow (e.g. their recovery contact is inaccessible, or — as observed directly in this environment, where `PASSWORD_RESET_DELIVERY_MODE=development` only console-logs the reset token rather than emailing it, per `config/password-reset.js` — no real delivery channel is wired up yet at all). School Admin already holds direct account-lifecycle authority over these three roles (Business Rule #6: create, deactivate, reactivate), so the absence of a reset capability is a genuine gap in that authority, not a deliberate omission.

The Product Owner approved closing this gap: School Admin may directly reset the password of a Teacher, Manager, or Accountant account within their own school. This ACR amends Authentication & Authorization — an already-**Accepted** document (Feature Acceptance granted per its own v1.2 Change History) — the same category of change ACR-001 and ACR-010 already made to it.

---

# Options Considered

**Option A — School Admin sets the new password directly.**
Rejected outright, without further analysis: this would mean the creator/administrator chooses and therefore knows a password they are handing to someone else — the exact thing Business Rule #9 already refuses to allow at account creation ("initial credentials established by the account owner, not assigned and retained by the creator") and Business Rule #8 already refuses to allow at any time ("No user, including an administrator, may view another user's password"). No further consideration was warranted.

**Option B — Generate a random temporary password and display it once to the resetting School Admin.**
A real, cryptographically random password is generated, hashed immediately (only the hash is ever persisted), and shown on-screen to the School Admin exactly once — so it can be relayed to the affected user through the school's own channel — never stored or re-displayable afterward.

Rejected. This is a real, workable pattern (comparable to how some external systems hand back a console-generated temporary credential), but it requires carving an explicit, narrow exception into Business Rule #8's own absolute language — "No user, including an administrator, may view another user's password" — for the one moment of display. Weighed against Option C below, which achieves the identical practical outcome (School Admin can unblock the account right now, without depending on email delivery) without touching Business Rule #8 at all, the Product Owner preferred not to open that exception.

**Option C — Invalidate the current password and require self-service re-establishment (Selected).**
The reset immediately: invalidates the account's current password (the same `passwordHash: null` shape a brand-new account is created with), sets the account to `MUST_CHANGE_CREDENTIALS`, and revokes every active session (refresh token) for that account. No new password value is generated, shown, or transmitted by this action at all. The affected user then re-establishes their own new password through the existing Forgotten Password Recovery mechanism (Business Workflow §5) — the identical mechanism a brand-new account already uses to establish its first-ever credentials (Business Workflow §2 point 3, Business Rule #9).

This is not a new mechanism — it is Business Rule #9's own "the account owner establishes it themselves" principle, applied to an *existing* account instead of only a newly created one. Business Rule #8 requires no amendment whatsoever: no one, at any point in this flow, ever views a plaintext password.

---

# Decision

Option C is adopted.

- School Admin may directly reset the password of a Teacher, Manager, or Accountant account, but **only** when that account belongs to the same school as the acting School Admin (the same tenant-scoping `assertCanManageAccount` already enforces for Business Rule #6's create/deactivate/reactivate authority).
- The reset action: invalidates the account's current password, sets its status to `MUST_CHANGE_CREDENTIALS`, and revokes every active refresh token/session for that account, immediately and unconditionally.
- No password value — temporary, generated, or otherwise — is created, stored in plaintext, displayed, or transmitted by this action. The account's next usable password is established solely by the account owner, through the existing Forgotten Password Recovery mechanism, using the existing password-hashing mechanism at the point they set it — identical to how every account's first-ever password is already established today.
- This authority is **not** extended to Student accounts — the Product Owner's approved scope names only Teacher, Manager, and Accountant. A Student's own password recovery remains self-service only, unchanged.
- This authority is **not** granted to Super Admin. Super Admin's existing authority (Business Rule #18: restoring a locked-out/inaccessible School Admin) is unrelated and unchanged by this ACR; Super Admin gains no new ability to reset a Teacher/Manager/Accountant/Student password directly. This mirrors Attendance-Management.md's own precedent (Business Rule #34) of an explicit, deliberate non-grant to Super Admin over a school-scoped operational capability, not an oversight.
- This authority is **not** granted laterally: a Manager, Teacher, or Accountant may not reset another Manager's, Teacher's, or Accountant's password through this (or any) mechanism — this capability belongs to School Admin alone, the same "only School Admin manages these three roles' accounts" shape Business Rule #6 already establishes.
- Every Administrative Password Reset is recorded for audit, per Business Rule #14's general requirement, with an explicit, dedicated audit action distinct from a self-service "password reset completed" event — recording the acting School Admin, the target account, and the timestamp; never any password value, per Business Rule #8's own unmodified logging discipline (`Security-Standards.md`: reset tokens/credentials must never be written to logs).

## Requirements

- Authentication & Authorization's Permissions (School Admin), Business Rules, Edge Cases, and Audit Requirements sections are updated (see Related Documents for exact rule numbers).
- The Project Glossary gains an `Administrative Password Reset` entry, distinguishing it from the existing self-service `Forgotten Password Recovery` concept.
- No `UserRole` enum change, no Prisma migration, no API, and no service/controller change is made by this ACR. It is a documentation-only architecture decision. Implementation (a new endpoint, service function, and the corresponding School-Admin-facing UI action) is deferred to a future Technical Design/Implementation phase, per the Product Owner's own explicit "do not implement yet" instruction accompanying this decision.

---

# Reasoning

This follows the same pattern ACR-001 and ACR-010 already established for this document: a new capability affecting an already-Accepted feature is introduced through a formal Change Request, not an informal edit, and the actual mechanism is chosen to reuse an existing, already-approved principle rather than invent a new one. Option C's "invalidate and let the owner re-establish" shape is not a new idea in this document — it is Business Rule #9 read one degree more broadly (it already governs "initial" credentials; this ACR extends the identical guarantee to a credential being *reset*, not just first established), which is why it required no amendment to Business Rule #8 at all.

Scoping the grant to exactly Teacher/Manager/Accountant, within the acting School Admin's own school, mirrors Business Rule #6's own existing account-lifecycle scope precisely — this ACR is best understood as extending that same, already-approved authority boundary to one more action (reset), not defining a new boundary from scratch.

---

# Consequences

## Positive

- Closes a genuine, product-owner-confirmed operational gap: School Admin can now unblock a Teacher/Manager/Accountant's access without depending on a working self-service recovery-contact delivery channel for the *first* step (invalidating stale/compromised access) — though the account owner's own subsequent re-establishment still depends on that channel, same as today (see Risks).
- Requires no exception to any existing absolute rule (Business Rule #8 is untouched) and reuses an existing, already-battle-tested mechanism (`passwordHash: null` + `MUST_CHANGE_CREDENTIALS` + session revocation via `revokeAllRefreshTokensForAccount`) rather than introducing a new one.
- Keeps the RBAC model consistent with Business Rule #6's existing account-lifecycle authority shape — same actor, same target roles, same tenant scope, one more action.

## Negative

- Amends an already-**Accepted** document, requiring this formal Change Request rather than a routine edit — the same cost ACR-001 and ACR-010 already paid.
- Does not, by itself, solve the practical problem that motivated it as completely as Option B would have: the affected Teacher/Manager/Accountant still depends on the existing Forgotten Password Recovery delivery channel to complete their own re-establishment step. In this environment specifically, that channel is currently `development` mode (console-logged only, per `config/password-reset.js`) — an Administrative Password Reset unblocks (invalidates a stale/compromised credential and forces re-establishment) but does not, on its own, guarantee the affected user can immediately complete that re-establishment without operator assistance reading the console-logged token on their behalf. This is a pre-existing infrastructure gap (no real email/SMS provider integrated anywhere in this project yet, per `Technology-Decisions.md`), not something this ACR introduces or is positioned to fix.

## Future Impact

- If Student accounts are ever added to this authority's scope, that requires its own Change Request against this one — not automatically inherited, the same caveat ACR-001 recorded for Student Management and ACR-010 recorded for Manager account-management delegation.
- If a future decision wants School Admin to be able to hand a staff member a directly usable temporary credential (Option B's shape) rather than requiring self-service re-establishment — e.g. once a real email/SMS provider is integrated and the practical urgency behind Option C's trade-off eases — that is its own future Change Request against Business Rule #8, not a silent reinterpretation of this one.

---

# Related Documents

- `docs/03-business/Authentication-and-Authorization.md` — Permissions (School Admin), Business Rules #29–30 (added by this ACR), Edge Cases, Audit Requirements.
- `docs/00-governance/Project-Glossary.md` — new `Administrative Password Reset` entry.
- `docs/01-architecture/Architecture-Decision-Records/ACR-001-Employment-vs-Authentication-Ownership.md` — the precedent this ACR follows for amending an already-Accepted Authentication & Authorization document.
- `docs/01-architecture/Architecture-Decision-Records/ACR-010-Manager-Role-Introduction.md` — the precedent this ACR follows for a School-Admin-direct, non-employment-lifecycle account action scoped to Teacher/Manager/Accountant.
- `docs/03-business/Attendance-Management.md` — checked for any password/account-management reference; none exists. Attendance Management consumes only Authentication & Authorization's role/tenant identity, never its credential mechanics, so this ACR requires no change there.
