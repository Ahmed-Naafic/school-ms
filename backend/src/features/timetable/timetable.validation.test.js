const validation = require('./timetable.validation');

describe('validateLessonWrite', () => {
  const valid = { teacherSubjectAssignmentId: 'assignment-1', dayOfWeek: 'MONDAY', periodId: 'period-1' };

  it('accepts a valid request', () => {
    expect(() => validation.validateLessonWrite(valid)).not.toThrow();
  });

  it('rejects a missing teacherSubjectAssignmentId', () => {
    expect(() => validation.validateLessonWrite({ ...valid, teacherSubjectAssignmentId: undefined })).toThrow(
      'Invalid Lesson request'
    );
  });

  it('rejects an invalid dayOfWeek', () => {
    expect(() => validation.validateLessonWrite({ ...valid, dayOfWeek: 'FUNDAY' })).toThrow('Invalid Lesson request');
  });

  it('rejects a missing periodId', () => {
    expect(() => validation.validateLessonWrite({ ...valid, periodId: '' })).toThrow('Invalid Lesson request');
  });
});

describe('validateTeacherPreference', () => {
  it('accepts an empty request (all fields optional)', () => {
    expect(() => validation.validateTeacherPreference({})).not.toThrow();
  });

  it('accepts a fully-populated valid request', () => {
    expect(() =>
      validation.validateTeacherPreference({
        preferredPeriods: ['period-1', 'period-2'],
        avoidPeriods: [],
        preferBeforeBreak: true,
        preferAfterBreak: false,
        preferredWorkingDays: ['MONDAY', 'TUESDAY'],
        preferredShiftId: 'shift-1',
        maxLessonsPerDay: 4,
        maxConsecutiveLessons: 2,
        gapPreference: 'MINIMIZE',
        spreadFreePeriods: true,
      })
    ).not.toThrow();
  });

  it('rejects an invalid gapPreference', () => {
    expect(() => validation.validateTeacherPreference({ gapPreference: 'BOGUS' })).toThrow(
      'Invalid Teacher schedule preference request'
    );
  });

  it('rejects a non-positive maxLessonsPerDay', () => {
    expect(() => validation.validateTeacherPreference({ maxLessonsPerDay: 0 })).toThrow(
      'Invalid Teacher schedule preference request'
    );
  });

  it('rejects an invalid preferredWorkingDays entry', () => {
    expect(() => validation.validateTeacherPreference({ preferredWorkingDays: ['FUNDAY'] })).toThrow(
      'Invalid Teacher schedule preference request'
    );
  });

  it('rejects a non-boolean preferBeforeBreak', () => {
    expect(() => validation.validateTeacherPreference({ preferBeforeBreak: 'yes' })).toThrow(
      'Invalid Teacher schedule preference request'
    );
  });
});

describe('validateSubjectPreference', () => {
  it('accepts an empty request', () => {
    expect(() => validation.validateSubjectPreference({})).not.toThrow();
  });

  it('accepts a fully-populated valid request', () => {
    expect(() =>
      validation.validateSubjectPreference({
        preferredPeriods: ['period-1'],
        avoidPeriods: ['period-2'],
        preferredDays: ['MONDAY'],
        avoidDays: ['FRIDAY'],
        consecutivePeriodsRequired: true,
        spreadAcrossWeek: true,
        maxLessonsPerDay: 2,
      })
    ).not.toThrow();
  });

  it('rejects an invalid avoidDays entry', () => {
    expect(() => validation.validateSubjectPreference({ avoidDays: ['FUNDAY'] })).toThrow(
      'Invalid Subject schedule preference request'
    );
  });

  it('rejects a non-positive maxLessonsPerDay', () => {
    expect(() => validation.validateSubjectPreference({ maxLessonsPerDay: -1 })).toThrow(
      'Invalid Subject schedule preference request'
    );
  });
});

describe('validateOptimizationSettings', () => {
  it('accepts an empty request', () => {
    expect(() => validation.validateOptimizationSettings({})).not.toThrow();
  });

  it('accepts all four valid toggles', () => {
    expect(() =>
      validation.validateOptimizationSettings({
        balanceTeacherWorkloads: true,
        balanceFirstLastPeriods: false,
        minimizeTeacherGaps: true,
        distributeSubjectsFairly: false,
      })
    ).not.toThrow();
  });

  it('rejects an unknown field (Guard by Construction)', () => {
    expect(() => validation.validateOptimizationSettings({ somethingElse: true })).toThrow(
      'Invalid School Optimization Settings request'
    );
  });

  it('rejects a non-boolean toggle', () => {
    expect(() => validation.validateOptimizationSettings({ balanceTeacherWorkloads: 'yes' })).toThrow(
      'Invalid School Optimization Settings request'
    );
  });
});
