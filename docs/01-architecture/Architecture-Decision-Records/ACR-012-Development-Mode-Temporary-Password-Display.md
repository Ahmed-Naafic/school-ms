# Architecture Change Request: Development-Mode Temporary Password Display for Administrative Password Reset

ACR Number: ACR-012

Date: 2026-08-24

Status: Approved and Implemented

---

# Context

ACR-011 deliberately chose Option C (invalidate the current password, require the account owner to re-establish their own via the existing Forgotten Password Recovery mechanism) specifically to avoid any exception to Business Rule #8 ("No user, including an administrator, may view another user's password"). Business Rule #30 recorded that choice as absolute — "without exception."

In practice, completing Option C's re-establishment step depends on Authentication & Authorization's password-reset delivery channel actually reaching the account owner. This project has no real email/SMS provider integrated anywhere yet (`Technology-Decisions.md`); in every environment running with `PASSWORD_RESET_DELIVERY_MODE=development`, delivery is a console-logged token only (`config/password-reset.js`), which ACR-011's own Consequences section already flagged as a known limitation, not something that ACR was positioned to fix.

The Product Owner has now approved closing that specific gap, but narrowly: **only** when `PASSWORD_RESET_DELIVERY_MODE=development`, an Administrative Password Reset generates a real temporary password and returns it once to the acting School Admin, who relays it to the Teacher/Manager/Accountant directly — removing the need to read a console log at all. The account owner must still change that password on first use. Production-shaped delivery modes (`email`, `sms`) are explicitly untouched — ACR-011's Option C, and Business Rule #8's unqualified guarantee, remain exactly as approved for any environment capable of actually delivering a real recovery message.

---

# Decision

- **When `PASSWORD_RESET_DELIVERY_MODE=development` only**: an Administrative Password Reset generates a cryptographically random temporary password meeting this project's existing password-strength rule, hashes it through the existing password-hashing mechanism, sets the account to `MUST_CHANGE_CREDENTIALS` (so the very next login forces the owner to set their own permanent password — Business Rule #9's guarantee is unchanged, just deferred one login later than Option C's "immediately, before any login is possible"), and returns the plaintext value **once**, in the live API response to the acting School Admin only. It is never persisted anywhere in plaintext, never included in the audit record (Business Rule #14/#22's audit trail records only that a reset occurred and who performed it, exactly as Business Rule #30 already required), and never retrievable again after that single response.
- **In every other delivery mode** (`email`, `sms`, `disabled`, or any future mode): behavior is unchanged from ACR-011 — the current password is invalidated with no replacement value, and the account owner must use Forgotten Password Recovery to re-establish one themselves. Business Rule #8 applies without exception in these modes, exactly as ACR-011 decided.
- This is a narrow, environment-gated amendment to Business Rule #30, not a reversal of ACR-011's own reasoning for production use — Option B was rejected there specifically because it required exposing a password to an administrator in an environment where a secure, verifiable alternative already exists. In `development` mode, that alternative (real delivery) does not exist at all, which is the entire premise this ACR is scoped to.

## Requirements

- Business Rule #30 is amended to state the `development`-mode exception explicitly, rather than remaining unconditionally "without exception."
- A new Edge Case is recorded for `PASSWORD_RESET_DELIVERY_MODE=disabled`: an Administrative Password Reset in that mode still invalidates the account's password with no replacement value and no temporary password shown (matching every non-`development` mode), even though the account owner's own subsequent Forgotten Password Recovery request would itself be rejected (per `requestPasswordReset`'s own existing `disabled`-mode check) — leaving that account genuinely locked out with no in-application recovery path until an operator intervenes some other way. This is a real, known limitation of `disabled` mode generally (not introduced by this ACR), recorded here rather than silently accepted.
- No `UserRole` enum change, no Prisma migration, no new endpoint (the existing `PATCH /accounts/:accountId/reset-password` route gains conditional response behavior, not a new route).

---

# Reasoning

Scoping the exception to `PASSWORD_RESET_DELIVERY_MODE=development` reuses this project's own existing precedent for exactly this kind of environment-conditional relaxation — `deliverPasswordResetToken` already behaves differently in `development` mode (console-logs a secret that must never be logged in production, per its own code comment citing `Security-Standards.md`) than it does everywhere else. This ACR applies the identical reasoning one level up: a convenience that is only safe, and only necessary, in an environment with no real delivery channel, explicitly walled off from ever applying once a real one exists.

---

# Consequences

## Positive

- Removes the practical friction ACR-011's own Consequences section already flagged: an operator no longer needs read access to the backend console to complete a reset in this environment.
- Keeps Business Rule #8's guarantee fully intact for every environment that matters for real users — `development` mode is, by this project's own established convention, never valid in a real deployment.

## Negative

- Business Rule #30 is no longer an unconditional guarantee — a reader must now check which delivery mode applies. This is judged an acceptable, explicit trade-off given the mode is already a hard-coded, deployment-time configuration value, not something a School Admin can toggle at will.
- Does not address the `disabled`-mode lockout gap identified above — recorded as a known limitation, not fixed by this ACR.

## Future Impact

- Once a real `email`/`sms` provider is integrated, `development` mode's own behavior does not need to change — it remains a legitimate local/test-only convenience. No cleanup is required of this ACR at that point.
- If a future decision wants temporary-password display in a *production* delivery mode too, that is its own Change Request against Business Rule #8/#30 — not inherited from this one, the same caveat every prior ACR in this document has recorded for its own scope boundary.

---

# Related Documents

- `docs/01-architecture/Architecture-Decision-Records/ACR-011-Administrative-Password-Reset.md` — the decision this ACR narrowly amends.
- `docs/03-business/Authentication-and-Authorization.md` — Business Rule #30 (amended), new Edge Case row.
