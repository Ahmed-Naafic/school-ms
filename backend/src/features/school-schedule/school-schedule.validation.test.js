const validation = require('./school-schedule.validation');

describe('validateUpdateSchoolCalendar', () => {
  it('accepts a valid, non-empty, non-full workingDays array', () => {
    expect(() => validation.validateUpdateSchoolCalendar({ workingDays: ['MONDAY', 'TUESDAY'] })).not.toThrow();
  });

  it('rejects a missing or empty workingDays array', () => {
    expect(() => validation.validateUpdateSchoolCalendar({})).toThrow('Invalid School Calendar update request');
    expect(() => validation.validateUpdateSchoolCalendar({ workingDays: [] })).toThrow(
      'Invalid School Calendar update request'
    );
  });

  it('rejects an invalid DayOfWeek value', () => {
    expect(() => validation.validateUpdateSchoolCalendar({ workingDays: ['FUNDAY'] })).toThrow(
      'Invalid School Calendar update request'
    );
  });

  it('rejects duplicate days', () => {
    expect(() => validation.validateUpdateSchoolCalendar({ workingDays: ['MONDAY', 'MONDAY'] })).toThrow(
      'Invalid School Calendar update request'
    );
  });
});

describe('validateCreateShift', () => {
  it('accepts a valid request', () => {
    expect(() =>
      validation.validateCreateShift({ name: 'Morning', startTime: '07:30', endTime: '12:30' })
    ).not.toThrow();
  });

  it('rejects a missing name', () => {
    expect(() => validation.validateCreateShift({ startTime: '07:30', endTime: '12:30' })).toThrow(
      'Invalid Shift creation request'
    );
  });

  it('rejects an invalid time format', () => {
    expect(() => validation.validateCreateShift({ name: 'Morning', startTime: '7:30am', endTime: '12:30' })).toThrow(
      'Invalid Shift creation request'
    );
  });

  it('rejects endTime not after startTime', () => {
    expect(() => validation.validateCreateShift({ name: 'Morning', startTime: '12:30', endTime: '07:30' })).toThrow(
      'Invalid Shift creation request'
    );
    expect(() => validation.validateCreateShift({ name: 'Morning', startTime: '07:30', endTime: '07:30' })).toThrow(
      'Invalid Shift creation request'
    );
  });
});

describe('validateUpdateShift (Guard by Construction)', () => {
  it('accepts name/startTime/endTime only', () => {
    expect(() =>
      validation.validateUpdateShift({ name: 'Morning Block', startTime: '07:00', endTime: '12:00' })
    ).not.toThrow();
  });

  it('rejects displayOrder, isDefault, or status in the body', () => {
    expect(() =>
      validation.validateUpdateShift({ name: 'Morning', startTime: '07:30', endTime: '12:30', displayOrder: 2 })
    ).toThrow('Invalid Shift update request');
    expect(() =>
      validation.validateUpdateShift({ name: 'Morning', startTime: '07:30', endTime: '12:30', isDefault: true })
    ).toThrow('Invalid Shift update request');
    expect(() =>
      validation.validateUpdateShift({ name: 'Morning', startTime: '07:30', endTime: '12:30', status: 'ARCHIVED' })
    ).toThrow('Invalid Shift update request');
  });
});

describe('validateReorderShift', () => {
  it('accepts a positive integer position', () => {
    expect(() => validation.validateReorderShift({ position: 1 })).not.toThrow();
  });

  it('rejects a non-positive or non-integer position', () => {
    expect(() => validation.validateReorderShift({ position: 0 })).toThrow('Invalid sequence update request');
    expect(() => validation.validateReorderShift({ position: -1 })).toThrow('Invalid sequence update request');
    expect(() => validation.validateReorderShift({ position: 1.5 })).toThrow('Invalid sequence update request');
    expect(() => validation.validateReorderShift({})).toThrow('Invalid sequence update request');
  });
});

describe('validateListShifts', () => {
  it('accepts an empty query or a valid status filter', () => {
    expect(() => validation.validateListShifts({})).not.toThrow();
    expect(() => validation.validateListShifts({ status: 'ACTIVE' })).not.toThrow();
    expect(() => validation.validateListShifts({ status: 'ARCHIVED' })).not.toThrow();
  });

  it('rejects an invalid status filter', () => {
    expect(() => validation.validateListShifts({ status: 'BOGUS' })).toThrow('Invalid Shift query');
  });
});

describe('validateCreateShift — Architecture Update (Periods) wizard fields', () => {
  const base = { name: 'Morning', startTime: '07:30', endTime: '12:30' };

  it('accepts a request with no wizard fields (defaults apply in the service layer)', () => {
    expect(() => validation.validateCreateShift(base)).not.toThrow();
  });

  it('accepts explicit, consistent wizard fields', () => {
    expect(() =>
      validation.validateCreateShift({ ...base, teachingPeriodCount: 4, includeBreak: true, breakAfterPeriod: 4 })
    ).not.toThrow();
    expect(() =>
      validation.validateCreateShift({ ...base, teachingPeriodCount: 3, includeBreak: false, breakAfterPeriod: 99 })
    ).not.toThrow();
  });

  it('rejects a non-positive or non-integer teachingPeriodCount', () => {
    expect(() => validation.validateCreateShift({ ...base, teachingPeriodCount: 0 })).toThrow(
      'Invalid Shift creation request'
    );
    expect(() => validation.validateCreateShift({ ...base, teachingPeriodCount: 2.5 })).toThrow(
      'Invalid Shift creation request'
    );
  });

  it('rejects a non-boolean includeBreak', () => {
    expect(() => validation.validateCreateShift({ ...base, includeBreak: 'yes' })).toThrow(
      'Invalid Shift creation request'
    );
  });

  it('rejects breakAfterPeriod exceeding teachingPeriodCount (explicit or defaulted)', () => {
    expect(() =>
      validation.validateCreateShift({ ...base, teachingPeriodCount: 3, breakAfterPeriod: 4 })
    ).toThrow('Invalid Shift creation request');
    // teachingPeriodCount omitted — defaults to 6 in the service layer.
    expect(() => validation.validateCreateShift({ ...base, breakAfterPeriod: 7 })).toThrow(
      'Invalid Shift creation request'
    );
  });

  it('accepts breakAfterPeriod equal to teachingPeriodCount (Break at the end)', () => {
    expect(() =>
      validation.validateCreateShift({ ...base, teachingPeriodCount: 5, breakAfterPeriod: 5 })
    ).not.toThrow();
  });
});

describe('Architecture Update (Periods) — Period validators', () => {
  describe('validateCreatePeriod', () => {
    it('accepts a valid request with no times (unconfigured)', () => {
      expect(() => validation.validateCreatePeriod({ name: 'Period 1', type: 'TEACHING' })).not.toThrow();
    });

    it('accepts a valid request with both times', () => {
      expect(() =>
        validation.validateCreatePeriod({ name: 'Break', type: 'BREAK', startTime: '10:00', endTime: '10:15' })
      ).not.toThrow();
    });

    it('rejects a missing name', () => {
      expect(() => validation.validateCreatePeriod({ type: 'TEACHING' })).toThrow('Invalid Period creation request');
    });

    it('rejects an invalid type', () => {
      expect(() => validation.validateCreatePeriod({ name: 'Period 1', type: 'LUNCH' })).toThrow(
        'Invalid Period creation request'
      );
    });

    it('rejects only one of startTime/endTime being provided', () => {
      expect(() => validation.validateCreatePeriod({ name: 'Period 1', type: 'TEACHING', startTime: '08:00' })).toThrow(
        'Invalid Period creation request'
      );
    });

    it('rejects endTime not after startTime', () => {
      expect(() =>
        validation.validateCreatePeriod({ name: 'Period 1', type: 'TEACHING', startTime: '09:00', endTime: '08:00' })
      ).toThrow('Invalid Period creation request');
    });
  });

  describe('validateUpdatePeriod (Guard by Construction)', () => {
    it('accepts name/type/startTime/endTime only', () => {
      expect(() =>
        validation.validateUpdatePeriod({ name: 'Period 1', type: 'TEACHING', startTime: '08:00', endTime: '09:00' })
      ).not.toThrow();
    });

    it('rejects displayOrder or status in the body', () => {
      expect(() =>
        validation.validateUpdatePeriod({ name: 'Period 1', type: 'TEACHING', displayOrder: 2 })
      ).toThrow('Invalid Period update request');
      expect(() =>
        validation.validateUpdatePeriod({ name: 'Period 1', type: 'TEACHING', status: 'ARCHIVED' })
      ).toThrow('Invalid Period update request');
    });
  });

  describe('validateReorderPeriod', () => {
    it('accepts a positive integer position', () => {
      expect(() => validation.validateReorderPeriod({ position: 1 })).not.toThrow();
    });

    it('rejects a non-positive or non-integer position', () => {
      expect(() => validation.validateReorderPeriod({ position: 0 })).toThrow('Invalid sequence update request');
      expect(() => validation.validateReorderPeriod({})).toThrow('Invalid sequence update request');
    });
  });

  describe('validateListPeriods', () => {
    it('accepts an empty query or a valid status filter', () => {
      expect(() => validation.validateListPeriods({})).not.toThrow();
      expect(() => validation.validateListPeriods({ status: 'ACTIVE' })).not.toThrow();
    });

    it('rejects an invalid status filter', () => {
      expect(() => validation.validateListPeriods({ status: 'BOGUS' })).toThrow('Invalid Period query');
    });
  });
});
