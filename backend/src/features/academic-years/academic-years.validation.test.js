const {
  validateCreateAcademicYear,
  validateUpdateAcademicYear,
  validateListAcademicYears,
} = require('./academic-years.validation');

describe('validateCreateAcademicYear', () => {
  it('accepts a valid date range', () => {
    expect(() =>
      validateCreateAcademicYear({ startDate: '2025-09-01', endDate: '2026-06-30' })
    ).not.toThrow();
  });

  it('rejects a missing startDate', () => {
    expect(() => validateCreateAcademicYear({ endDate: '2026-06-30' })).toThrow(
      'Invalid Academic Year creation request'
    );
  });

  it('rejects a missing endDate', () => {
    expect(() => validateCreateAcademicYear({ startDate: '2025-09-01' })).toThrow(
      'Invalid Academic Year creation request'
    );
  });

  it('rejects an invalid date string', () => {
    expect(() =>
      validateCreateAcademicYear({ startDate: 'not-a-date', endDate: '2026-06-30' })
    ).toThrow('Invalid Academic Year creation request');
  });

  it('rejects endDate on or before startDate', () => {
    expect(() =>
      validateCreateAcademicYear({ startDate: '2025-09-01', endDate: '2025-09-01' })
    ).toThrow('Invalid Academic Year creation request');
    expect(() =>
      validateCreateAcademicYear({ startDate: '2025-09-01', endDate: '2025-01-01' })
    ).toThrow('Invalid Academic Year creation request');
  });
});

describe('validateUpdateAcademicYear', () => {
  it('accepts a valid date range', () => {
    expect(() =>
      validateUpdateAcademicYear({ startDate: '2025-09-01', endDate: '2026-06-30' })
    ).not.toThrow();
  });

  it('rejects a missing startDate or endDate — both are always required', () => {
    expect(() => validateUpdateAcademicYear({ endDate: '2026-06-30' })).toThrow(
      'Invalid Academic Year update request'
    );
    expect(() => validateUpdateAcademicYear({ startDate: '2025-09-01' })).toThrow(
      'Invalid Academic Year update request'
    );
  });

  it('rejects endDate not after startDate', () => {
    expect(() =>
      validateUpdateAcademicYear({ startDate: '2025-09-01', endDate: '2025-08-01' })
    ).toThrow('Invalid Academic Year update request');
  });
});

describe('validateListAcademicYears', () => {
  it('accepts an empty query', () => {
    expect(() => validateListAcademicYears({})).not.toThrow();
  });

  it.each([[['ACTIVE']], [['ARCHIVED']]])('accepts a valid status filter %j', ([status]) => {
    expect(() => validateListAcademicYears({ status })).not.toThrow();
  });

  it('rejects an invalid status filter', () => {
    expect(() => validateListAcademicYears({ status: 'BOGUS' })).toThrow(
      'Invalid Academic Year catalog query'
    );
  });
});
