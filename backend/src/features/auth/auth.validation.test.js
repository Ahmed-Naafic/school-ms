const {
  isStrongPassword,
  validateLogin,
  validateCreateAccount,
  validatePasswordResetRequest,
  validatePasswordResetConfirm,
  validateChangePassword,
  validateRoleChange,
  validateAccountOverride,
} = require('./auth.validation');

describe('isStrongPassword', () => {
  it('accepts a password with 8+ chars, a letter, and a number', () => {
    expect(isStrongPassword('Bootstrap123')).toBe(true);
  });

  it('rejects a password shorter than 8 characters', () => {
    expect(isStrongPassword('Ab1')).toBe(false);
  });

  it('rejects a password with no digits', () => {
    expect(isStrongPassword('NoDigitsHere')).toBe(false);
  });

  it('rejects a password with no letters', () => {
    expect(isStrongPassword('12345678')).toBe(false);
  });
});

describe('validateLogin', () => {
  it('accepts a valid email + password', () => {
    expect(() => validateLogin({ email: 'a@example.com', password: 'anything' })).not.toThrow();
  });

  it('rejects an invalid email', () => {
    expect(() => validateLogin({ email: 'not-an-email', password: 'x' })).toThrow('Invalid login request');
  });

  it('rejects a missing password', () => {
    expect(() => validateLogin({ email: 'a@example.com' })).toThrow();
  });
});

describe('validateCreateAccount', () => {
  it('accepts a valid request', () => {
    expect(() => validateCreateAccount({ email: 'a@example.com', role: 'TEACHER' })).not.toThrow();
  });

  it('rejects an invalid email', () => {
    expect(() => validateCreateAccount({ email: 'nope', role: 'TEACHER' })).toThrow(
      'Invalid account creation request'
    );
  });

  it('rejects a missing role', () => {
    expect(() => validateCreateAccount({ email: 'a@example.com' })).toThrow();
  });
});

describe('validatePasswordResetRequest', () => {
  it('rejects an invalid email', () => {
    expect(() => validatePasswordResetRequest({ email: 'nope' })).toThrow('Invalid password reset request');
  });

  it('accepts a valid email', () => {
    expect(() => validatePasswordResetRequest({ email: 'a@example.com' })).not.toThrow();
  });
});

describe('validatePasswordResetConfirm', () => {
  it('accepts a valid token + strong password', () => {
    expect(() => validatePasswordResetConfirm({ token: 'abc', newPassword: 'Strong123' })).not.toThrow();
  });

  it('rejects a missing token', () => {
    expect(() => validatePasswordResetConfirm({ newPassword: 'Strong123' })).toThrow(
      'Invalid password reset confirmation'
    );
  });

  it('rejects a weak new password', () => {
    expect(() => validatePasswordResetConfirm({ token: 'abc', newPassword: 'weak' })).toThrow();
  });
});

describe('validateChangePassword', () => {
  it('rejects a missing currentPassword', () => {
    expect(() => validateChangePassword({ newPassword: 'Strong123' })).toThrow('Invalid password change request');
  });

  it('rejects a weak newPassword', () => {
    expect(() => validateChangePassword({ currentPassword: 'x', newPassword: 'weak' })).toThrow();
  });

  it('accepts a valid request', () => {
    expect(() => validateChangePassword({ currentPassword: 'x', newPassword: 'Strong123' })).not.toThrow();
  });
});

// ACR-001: shape validation only — never role-dependent, since this
// function has no repository access. Whether a reason is actually
// *required* is auth.service.js's assertOverrideReasonProvided.
describe('validateAccountOverride', () => {
  it('accepts a request with no reason', () => {
    expect(() => validateAccountOverride({})).not.toThrow();
  });

  it('accepts a request with a non-empty reason', () => {
    expect(() => validateAccountOverride({ reason: 'Security incident' })).not.toThrow();
  });

  it('rejects an empty-string reason', () => {
    expect(() => validateAccountOverride({ reason: '   ' })).toThrow('Invalid account override request');
  });

  it('rejects a non-string reason', () => {
    expect(() => validateAccountOverride({ reason: 42 })).toThrow('Invalid account override request');
  });
});

describe('validateRoleChange', () => {
  it.each(['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ACCOUNTANT', 'TEACHER', 'STUDENT'])('accepts %s', (role) => {
    expect(() => validateRoleChange({ role })).not.toThrow();
  });

  it('rejects an invalid role', () => {
    expect(() => validateRoleChange({ role: 'BOGUS' })).toThrow('Invalid role change request');
  });

  it('rejects a missing role', () => {
    expect(() => validateRoleChange({})).toThrow();
  });
});
