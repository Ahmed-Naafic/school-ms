const { ValidationError } = require('../../shared/errors');

// Server-side validation only — never trust client input, per Coding-Standards.md.

function validateCreateSchool(body) {
  const errors = {};

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    errors.name = 'School name is required.';
  }

  // Per School-Management.md Business Rule #16: onboarding requires only the
  // school's name and what's needed to create its first School Admin account.
  if (!body.firstSchoolAdminEmail || typeof body.firstSchoolAdminEmail !== 'string') {
    errors.firstSchoolAdminEmail = 'The first School Admin\'s email is required.';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid school creation request', errors);
  }
}

function validateUpdateCoreIdentity(body) {
  const errors = {};

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    errors.name = 'School name is required.';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid school identity update', errors);
  }
}

// Operational profile fields are all optional; only their types are checked
// when present, per School-Management.md's operational-profile scope. Any
// other key (e.g. name, lifecycleStatus, subscriptionStatus) is rejected
// outright — those are Super-Admin-only fields (Business Rule #14), and this
// endpoint must never accept them from a School Admin, per Security-Standards.md's
// "never trust client input" and the Technical Design's field-level write
// restriction being a server-side, not merely client-side, guarantee.
const OPERATIONAL_PROFILE_FIELDS = ['contactEmail', 'contactPhone', 'address'];

function validateUpdateOperationalProfile(body) {
  const errors = {};

  for (const field of OPERATIONAL_PROFILE_FIELDS) {
    if (body[field] !== undefined && typeof body[field] !== 'string') {
      errors[field] = `${field} must be a string.`;
    }
  }

  const unknownFields = Object.keys(body).filter((key) => !OPERATIONAL_PROFILE_FIELDS.includes(key));
  if (unknownFields.length > 0) {
    errors._unknown = `Unrecognized field(s): ${unknownFields.join(', ')}. Only ${OPERATIONAL_PROFILE_FIELDS.join(', ')} may be updated here.`;
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid operational profile update', errors);
  }
}

function validateSubscriptionUpdate(body) {
  const allowed = ['ACTIVE', 'TRIAL', 'EXPIRED'];
  if (!body.subscriptionStatus || !allowed.includes(body.subscriptionStatus)) {
    throw new ValidationError('Invalid subscription status', {
      subscriptionStatus: `Must be one of: ${allowed.join(', ')}`,
    });
  }
}

module.exports = {
  validateCreateSchool,
  validateUpdateCoreIdentity,
  validateUpdateOperationalProfile,
  validateSubscriptionUpdate,
  OPERATIONAL_PROFILE_FIELDS,
};
