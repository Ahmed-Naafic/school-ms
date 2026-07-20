const {
  validateCreateSchool,
  validateUpdateCoreIdentity,
  validateUpdateOperationalProfile,
  validateSubscriptionUpdate,
  validateUpdateEducationLevels,
} = require('./schools.validation');

describe('validateCreateSchool', () => {
  it('accepts a valid request', () => {
    expect(() =>
      validateCreateSchool({ name: 'Test School', firstSchoolAdminEmail: 'admin@example.com' })
    ).not.toThrow();
  });

  it('rejects a missing name', () => {
    expect(() => validateCreateSchool({ firstSchoolAdminEmail: 'admin@example.com' })).toThrow(
      'Invalid school creation request'
    );
  });

  it('rejects a missing firstSchoolAdminEmail', () => {
    expect(() => validateCreateSchool({ name: 'Test School' })).toThrow();
  });

  it('requires no other field (Business Rule #16)', () => {
    expect(() =>
      validateCreateSchool({ name: 'Test School', firstSchoolAdminEmail: 'admin@example.com' })
    ).not.toThrow();
  });
});

describe('validateUpdateCoreIdentity', () => {
  it('rejects a missing name', () => {
    expect(() => validateUpdateCoreIdentity({})).toThrow('Invalid school identity update');
  });
});

describe('validateUpdateOperationalProfile', () => {
  it('accepts an empty body (all fields optional)', () => {
    expect(() => validateUpdateOperationalProfile({})).not.toThrow();
  });

  it('rejects a non-string field', () => {
    expect(() => validateUpdateOperationalProfile({ contactEmail: 12345 })).toThrow(
      'Invalid operational profile update'
    );
  });

  it.each(['name', 'lifecycleStatus', 'subscriptionStatus'])(
    'rejects mass-assignment of Super-Admin-only field "%s" (regression)',
    (field) => {
      expect(() => validateUpdateOperationalProfile({ contactEmail: 'a@b.com', [field]: 'x' })).toThrow(
        'Invalid operational profile update'
      );
    }
  );
});

describe('validateSubscriptionUpdate', () => {
  it.each(['ACTIVE', 'TRIAL', 'EXPIRED'])('accepts %s', (status) => {
    expect(() => validateSubscriptionUpdate({ subscriptionStatus: status })).not.toThrow();
  });

  it('rejects an invalid status', () => {
    expect(() => validateSubscriptionUpdate({ subscriptionStatus: 'BOGUS' })).toThrow('Invalid subscription status');
  });

  it('rejects a missing status', () => {
    expect(() => validateSubscriptionUpdate({})).toThrow();
  });
});

describe('validateUpdateEducationLevels (ACR-003)', () => {
  it.each([[['PRIMARY']], [['SECONDARY']], [['PRIMARY', 'SECONDARY']]])('accepts %j', (levels) => {
    expect(() => validateUpdateEducationLevels({ educationLevels: levels })).not.toThrow();
  });

  it('rejects an empty array', () => {
    expect(() => validateUpdateEducationLevels({ educationLevels: [] })).toThrow(
      'Invalid Education Level update'
    );
  });

  it('rejects a missing educationLevels field', () => {
    expect(() => validateUpdateEducationLevels({})).toThrow('Invalid Education Level update');
  });

  it('rejects an invalid Education Level value', () => {
    expect(() => validateUpdateEducationLevels({ educationLevels: ['TERTIARY'] })).toThrow(
      'Invalid Education Level update'
    );
  });

  it('rejects duplicate values', () => {
    expect(() => validateUpdateEducationLevels({ educationLevels: ['PRIMARY', 'PRIMARY'] })).toThrow(
      'Invalid Education Level update'
    );
  });
});
