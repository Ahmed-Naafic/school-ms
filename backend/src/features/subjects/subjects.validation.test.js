const { validateCreateSubject, validateUpdateSubject, validateListSubjects } = require('./subjects.validation');

describe('validateCreateSubject', () => {
  it('accepts a valid request', () => {
    expect(() => validateCreateSubject({ name: 'Mathematics', educationLevel: 'SECONDARY' })).not.toThrow();
  });

  it('rejects a missing name', () => {
    expect(() => validateCreateSubject({ educationLevel: 'PRIMARY' })).toThrow(
      'Invalid Subject creation request'
    );
  });

  it('rejects an empty-string name', () => {
    expect(() => validateCreateSubject({ name: '   ', educationLevel: 'PRIMARY' })).toThrow(
      'Invalid Subject creation request'
    );
  });

  it('rejects a missing educationLevel', () => {
    expect(() => validateCreateSubject({ name: 'Mathematics' })).toThrow('Invalid Subject creation request');
  });

  it('rejects an invalid educationLevel value', () => {
    expect(() => validateCreateSubject({ name: 'Mathematics', educationLevel: 'TERTIARY' })).toThrow(
      'Invalid Subject creation request'
    );
  });
});

describe('validateUpdateSubject', () => {
  it('accepts an empty body (no-op update)', () => {
    expect(() => validateUpdateSubject({})).not.toThrow();
  });

  it('accepts a name-only update', () => {
    expect(() => validateUpdateSubject({ name: 'New Name' })).not.toThrow();
  });

  it('accepts an educationLevel-only update', () => {
    expect(() => validateUpdateSubject({ educationLevel: 'PRIMARY' })).not.toThrow();
  });

  it('rejects an empty-string name when provided', () => {
    expect(() => validateUpdateSubject({ name: '' })).toThrow('Invalid Subject update request');
  });

  it('rejects an invalid educationLevel value when provided', () => {
    expect(() => validateUpdateSubject({ educationLevel: 'BOGUS' })).toThrow('Invalid Subject update request');
  });
});

// Phase 9 code review finding: an invalid status/educationLevel query param
// previously reached Prisma unvalidated and surfaced as an unhandled 500.
describe('validateListSubjects', () => {
  it('accepts an empty query (no filters)', () => {
    expect(() => validateListSubjects({})).not.toThrow();
  });

  it('accepts valid educationLevel and status filters', () => {
    expect(() => validateListSubjects({ educationLevel: 'SECONDARY', status: 'ARCHIVED' })).not.toThrow();
  });

  it('rejects an invalid educationLevel filter', () => {
    expect(() => validateListSubjects({ educationLevel: 'TERTIARY' })).toThrow('Invalid Subject catalog query');
  });

  it('rejects an invalid status filter', () => {
    expect(() => validateListSubjects({ status: 'BOGUS' })).toThrow('Invalid Subject catalog query');
  });
});
