// Controls how password-reset / initial-account-setup tokens are delivered.
// A dedicated config value, not derived from NODE_ENV, per Product Owner
// decision: "Introduce an explicit password reset delivery mode
// configuration rather than relying solely on NODE_ENV."
//
// Modes:
// - "development": the raw token is logged to the console. Never valid in
//   production — see Security-Standards.md's "reset tokens must never be
//   written to production logs."
// - "email" / "sms": deliver via an approved provider. No such provider is
//   integrated yet (Technology-Decisions.md lists this as a future
//   integration) — selecting either mode today throws, rather than silently
//   falling back to logging the token.
// - "disabled": password reset/initial-setup requests are rejected outright
//   with a clear, non-account-specific response.
//
// Defaults to "disabled" (fail safe) if unset or set to an unrecognized
// value — a misconfigured deployment must not silently start logging
// tokens; it must silently disable recovery instead.
const VALID_MODES = ['development', 'email', 'sms', 'disabled'];

const configuredMode = process.env.PASSWORD_RESET_DELIVERY_MODE;
const PASSWORD_RESET_DELIVERY_MODE = VALID_MODES.includes(configuredMode) ? configuredMode : 'disabled';

module.exports = { PASSWORD_RESET_DELIVERY_MODE, VALID_PASSWORD_RESET_DELIVERY_MODES: VALID_MODES };
