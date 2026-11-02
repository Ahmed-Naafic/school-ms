const { validateCreateAllocation, validateCorrectAllocation } = require('./weekly-subject-allocations.validation');

describe('validateCreateAllocation', () => {
  it('accepts a valid request', () => {
    expect(() =>
      validateCreateAllocation({
        gradeLevelId: 'gl-1',
        subjects: [{ subjectId: 's-1', weeklyPeriods: 5, doublePeriodRequired: true }],
      })
    ).not.toThrow();
  });

  it('accepts an omitted academicYearId (defaulted in the service layer)', () => {
    expect(() =>
      validateCreateAllocation({ gradeLevelId: 'gl-1', subjects: [{ subjectId: 's-1', weeklyPeriods: 5 }] })
    ).not.toThrow();
  });

  it('rejects a missing gradeLevelId', () => {
    expect(() => validateCreateAllocation({ subjects: [{ subjectId: 's-1', weeklyPeriods: 5 }] })).toThrow(
      'Invalid Weekly Subject Allocation creation request'
    );
  });

  it('rejects a non-string gradeLevelId', () => {
    expect(() =>
      validateCreateAllocation({ gradeLevelId: 123, subjects: [{ subjectId: 's-1', weeklyPeriods: 5 }] })
    ).toThrow();
  });

  it('rejects a missing subjects array', () => {
    expect(() => validateCreateAllocation({ gradeLevelId: 'gl-1' })).toThrow();
  });

  it('rejects an empty subjects array', () => {
    expect(() => validateCreateAllocation({ gradeLevelId: 'gl-1', subjects: [] })).toThrow();
  });

  it('rejects a subject entry missing subjectId', () => {
    expect(() =>
      validateCreateAllocation({ gradeLevelId: 'gl-1', subjects: [{ weeklyPeriods: 5 }] })
    ).toThrow();
  });

  it('rejects a non-positive weeklyPeriods', () => {
    expect(() =>
      validateCreateAllocation({ gradeLevelId: 'gl-1', subjects: [{ subjectId: 's-1', weeklyPeriods: 0 }] })
    ).toThrow();
  });

  it('rejects a non-integer weeklyPeriods', () => {
    expect(() =>
      validateCreateAllocation({ gradeLevelId: 'gl-1', subjects: [{ subjectId: 's-1', weeklyPeriods: 2.5 }] })
    ).toThrow();
  });

  it('rejects a non-boolean doublePeriodRequired', () => {
    expect(() =>
      validateCreateAllocation({
        gradeLevelId: 'gl-1',
        subjects: [{ subjectId: 's-1', weeklyPeriods: 5, doublePeriodRequired: 'yes' }],
      })
    ).toThrow();
  });
});

describe('validateCorrectAllocation (Guard by Construction)', () => {
  it('accepts a valid subjects-only body', () => {
    expect(() =>
      validateCorrectAllocation({ subjects: [{ subjectId: 's-1', weeklyPeriods: 5 }] })
    ).not.toThrow();
  });

  it('rejects gradeLevelId in the body', () => {
    expect(() =>
      validateCorrectAllocation({ gradeLevelId: 'gl-1', subjects: [{ subjectId: 's-1', weeklyPeriods: 5 }] })
    ).toThrow('Invalid Weekly Subject Allocation correction request');
  });

  it('rejects academicYearId in the body', () => {
    expect(() =>
      validateCorrectAllocation({ academicYearId: 'ay-1', subjects: [{ subjectId: 's-1', weeklyPeriods: 5 }] })
    ).toThrow();
  });

  it('rejects a missing subjects array', () => {
    expect(() => validateCorrectAllocation({})).toThrow();
  });
});
