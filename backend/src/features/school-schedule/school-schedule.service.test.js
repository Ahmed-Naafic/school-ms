jest.mock('./school-schedule.repository');
jest.mock('../../shared/audit');
jest.mock('../classes/classes.service');
// createShift/updateShift/reorderShift/designateDefaultShift/archiveShift/
// reactivateShift each wrap their entire read-decide-write sequence in
// prisma.$transaction, acquiring the per-school advisory lock as the first
// statement. Without mocking this, $transaction would open a real
// transaction against the real dev database on every test run here —
// mirroring every other feature's own service-test fix, with a fake
// transaction runner that just invokes the callback synchronously with a
// recognizable fake client.
jest.mock('../../config/database', () => ({
  $transaction: jest.fn((callback) => callback('MOCK_TX')),
}));

const repository = require('./school-schedule.repository');
const { recordAuditEvent } = require('../../shared/audit');
const classesService = require('../classes/classes.service');
const service = require('./school-schedule.service');

const actingUser = { id: 'admin-1', schoolId: 'school-1' };

function activeShift(overrides = {}) {
  return {
    id: 'shift-1',
    schoolId: 'school-1',
    name: 'Morning',
    startTime: new Date('1970-01-01T07:30:00.000Z'),
    endTime: new Date('1970-01-01T12:30:00.000Z'),
    displayOrder: 1,
    isDefault: false,
    status: 'ACTIVE',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  repository.listActiveShiftsBySchool.mockResolvedValue([]);
  // Architecture Update (Periods): updateShift now also checks that its
  // Shift's own active Periods still fit the new range — default to none,
  // the same way listActiveShiftsBySchool defaults to none above.
  repository.listActivePeriodsByShift.mockResolvedValue([]);
});

describe('updateSchoolCalendar (Business Rules #4, #5, #6)', () => {
  it('rejects an empty workingDays array', async () => {
    repository.findCalendarBySchool.mockResolvedValue({ schoolId: 'school-1', workingDays: ['MONDAY'] });

    await expect(service.updateSchoolCalendar('school-1', { workingDays: [] }, actingUser)).rejects.toThrow(
      'Invalid School Calendar'
    );
    expect(repository.updateCalendar).not.toHaveBeenCalled();
  });

  it('rejects a full 7-day workingDays array (no Weekend Day would remain)', async () => {
    repository.findCalendarBySchool.mockResolvedValue({ schoolId: 'school-1', workingDays: ['MONDAY'] });
    const allDays = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

    await expect(service.updateSchoolCalendar('school-1', { workingDays: allDays }, actingUser)).rejects.toThrow(
      'Invalid School Calendar'
    );
  });

  it('updates successfully for a valid configuration', async () => {
    repository.findCalendarBySchool.mockResolvedValue({ schoolId: 'school-1', workingDays: ['SATURDAY'] });
    repository.updateCalendar.mockResolvedValue({ schoolId: 'school-1', workingDays: ['MONDAY', 'TUESDAY'] });

    await service.updateSchoolCalendar('school-1', { workingDays: ['MONDAY', 'TUESDAY'] }, actingUser);

    expect(repository.updateCalendar).toHaveBeenCalledWith('school-1', ['MONDAY', 'TUESDAY']);
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'SCHOOL_CALENDAR_UPDATED' }));
  });
});

describe('createShift (Business Rule #12)', () => {
  it('rejects a time range overlapping an existing active Shift', async () => {
    repository.listActiveShiftsBySchool.mockResolvedValue([activeShift({ startTime: new Date('1970-01-01T07:00:00.000Z'), endTime: new Date('1970-01-01T13:00:00.000Z') })]);

    await expect(
      service.createShift('school-1', { name: 'Afternoon', startTime: '12:00', endTime: '17:00' }, actingUser)
    ).rejects.toThrow('overlaps');
    expect(repository.createShift).not.toHaveBeenCalled();
  });

  it('creates successfully with the next end-of-sequence displayOrder', async () => {
    repository.listActiveShiftsBySchool.mockResolvedValue([activeShift({ displayOrder: 1 })]);
    repository.createShift.mockResolvedValue(
      activeShift({
        id: 'shift-2',
        displayOrder: 2,
        startTime: new Date('1970-01-01T13:30:00.000Z'),
        endTime: new Date('1970-01-01T18:00:00.000Z'),
      })
    );

    const result = await service.createShift(
      'school-1',
      { name: 'Afternoon', startTime: '13:30', endTime: '18:00' },
      actingUser
    );

    expect(repository.createShift).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'school-1', name: 'Afternoon', displayOrder: 2, isDefault: false, status: 'ACTIVE' }),
      'MOCK_TX'
    );
    expect(result.startTime).toBe('13:30');
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'SHIFT_CREATED' }));
  });
});

describe('updateShift (Business Rule #12, excludes itself from the overlap check)', () => {
  it('excludes its own prior time range from the overlap comparison', async () => {
    const existing = activeShift({ id: 'shift-1' });
    repository.findShiftById.mockResolvedValue(existing);
    repository.listActiveShiftsBySchool.mockResolvedValue([existing]);
    repository.updateShift.mockResolvedValue({ ...existing, name: 'Morning Block' });

    await service.updateShift('school-1', 'shift-1', { name: 'Morning Block', startTime: '07:30', endTime: '12:30' }, actingUser);

    expect(repository.updateShift).toHaveBeenCalledWith(
      'shift-1',
      expect.objectContaining({ name: 'Morning Block' }),
      'MOCK_TX'
    );
  });

  it('rejects an edit that would overlap a different active Shift', async () => {
    const target = activeShift({ id: 'shift-1' });
    const other = activeShift({ id: 'shift-2', startTime: new Date('1970-01-01T13:00:00.000Z'), endTime: new Date('1970-01-01T18:00:00.000Z') });
    repository.findShiftById.mockResolvedValue(target);
    repository.listActiveShiftsBySchool.mockResolvedValue([target, other]);

    await expect(
      service.updateShift('school-1', 'shift-1', { name: 'Morning', startTime: '07:30', endTime: '14:00' }, actingUser)
    ).rejects.toThrow('overlaps');
    expect(repository.updateShift).not.toHaveBeenCalled();
  });
});

describe('reorderShift (Business Rule #13)', () => {
  it('renumbers the active Shifts to a contiguous 1..N sequence with the target moved into position', async () => {
    const shiftA = activeShift({ id: 'a', displayOrder: 1 });
    const shiftB = activeShift({ id: 'b', displayOrder: 2 });
    const shiftC = activeShift({ id: 'c', displayOrder: 3 });
    repository.findShiftById.mockResolvedValue(shiftC);
    repository.listActiveShiftsBySchool.mockResolvedValue([shiftA, shiftB, shiftC]);
    repository.listShiftsBySchool.mockResolvedValue([shiftA, shiftC, shiftB]);

    await service.reorderShift('school-1', 'c', 1, actingUser);

    expect(repository.renumberActiveShifts).toHaveBeenCalledWith([shiftC, shiftA, shiftB], 'MOCK_TX');
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'SHIFT_SEQUENCE_CHANGED' }));
  });

  // Phase 9 finding: an Archived Shift holds no displayOrder and is excluded
  // from listActiveShiftsBySchool, so without this guard the target would
  // resolve to undefined and crash the renumbering step below with a raw
  // TypeError instead of a clean 409 — the same guard reorderPeriod already
  // has one level down (see 'reorderPeriod rejects an Archived target').
  it('rejects reordering an Archived Shift, rather than crashing', async () => {
    repository.findShiftById.mockResolvedValue(activeShift({ status: 'ARCHIVED', displayOrder: null }));

    await expect(service.reorderShift('school-1', 'shift-1', 1, actingUser)).rejects.toThrow(
      'An archived Shift cannot be reordered'
    );
    expect(repository.renumberActiveShifts).not.toHaveBeenCalled();
  });
});

describe('designateDefaultShift (Business Rules #8, #10, #11)', () => {
  it('rejects designating an Archived Shift as Default', async () => {
    repository.findShiftById.mockResolvedValue(activeShift({ status: 'ARCHIVED' }));

    await expect(service.designateDefaultShift('school-1', 'shift-1', actingUser)).rejects.toThrow(
      'Only an active Shift may be designated as the Default Shift'
    );
    expect(repository.setDefaultShift).not.toHaveBeenCalled();
  });

  it('is a no-op when the target is already Default', async () => {
    const current = activeShift({ isDefault: true });
    repository.findShiftById.mockResolvedValue(current);

    const result = await service.designateDefaultShift('school-1', 'shift-1', actingUser);

    expect(result).toBeDefined();
    expect(repository.setDefaultShift).not.toHaveBeenCalled();
  });

  it('unsets the previous Default and sets the new one atomically', async () => {
    repository.findShiftById.mockResolvedValue(activeShift({ id: 'shift-2', isDefault: false }));
    repository.setDefaultShift.mockResolvedValue(activeShift({ id: 'shift-2', isDefault: true }));

    await service.designateDefaultShift('school-1', 'shift-2', actingUser);

    expect(repository.setDefaultShift).toHaveBeenCalledWith('school-1', 'shift-2', 'MOCK_TX');
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SHIFT_DEFAULT_DESIGNATED', metadata: { newDefaultShiftId: 'shift-2' } })
    );
  });
});

describe('archiveShift (Business Rules #9, #10, #14, #16)', () => {
  it('rejects archiving a Shift referenced by one or more active Classes', async () => {
    repository.findShiftById.mockResolvedValue(activeShift());
    classesService.countActiveClassesByShift.mockResolvedValue(2);

    await expect(service.archiveShift('school-1', 'shift-1', actingUser)).rejects.toThrow(
      'Cannot archive a Shift while one or more active Classes reference it'
    );
    expect(repository.updateShift).not.toHaveBeenCalled();
  });

  it('rejects archiving the school\'s only remaining active Shift', async () => {
    const only = activeShift();
    repository.findShiftById.mockResolvedValue(only);
    classesService.countActiveClassesByShift.mockResolvedValue(0);
    repository.listActiveShiftsBySchool.mockResolvedValue([only]);

    await expect(service.archiveShift('school-1', 'shift-1', actingUser)).rejects.toThrow(
      'A school must always have at least one active Shift'
    );
  });

  it('rejects archiving the current Default Shift', async () => {
    const target = activeShift({ isDefault: true });
    repository.findShiftById.mockResolvedValue(target);
    classesService.countActiveClassesByShift.mockResolvedValue(0);
    repository.listActiveShiftsBySchool.mockResolvedValue([target, activeShift({ id: 'shift-2' })]);

    await expect(service.archiveShift('school-1', 'shift-1', actingUser)).rejects.toThrow(
      'Cannot archive the current Default Shift'
    );
  });

  it('archives successfully, removing it from the sequence and renumbering the remainder', async () => {
    const target = activeShift({ id: 'shift-1', displayOrder: 1 });
    const other = activeShift({ id: 'shift-2', displayOrder: 2 });
    repository.findShiftById.mockResolvedValue(target);
    classesService.countActiveClassesByShift.mockResolvedValue(0);
    repository.listActiveShiftsBySchool.mockResolvedValue([target, other]);
    repository.updateShift.mockResolvedValue({ ...target, status: 'ARCHIVED', displayOrder: null });

    await service.archiveShift('school-1', 'shift-1', actingUser);

    expect(repository.updateShift).toHaveBeenCalledWith('shift-1', { status: 'ARCHIVED', displayOrder: null }, 'MOCK_TX');
    expect(repository.renumberActiveShifts).toHaveBeenCalledWith([other], 'MOCK_TX');
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'SHIFT_ARCHIVED' }));
  });

  it('is a no-op on an already-Archived Shift', async () => {
    const archived = activeShift({ status: 'ARCHIVED' });
    repository.findShiftById.mockResolvedValue(archived);

    const result = await service.archiveShift('school-1', 'shift-1', actingUser);

    expect(result).toBeDefined();
    expect(classesService.countActiveClassesByShift).not.toHaveBeenCalled();
  });
});

describe('reactivateShift (Business Rule #14, Technical Design Review finding)', () => {
  it('rejects reactivating a Shift that is not Archived', async () => {
    repository.findShiftById.mockResolvedValue(activeShift({ status: 'ACTIVE' }));

    const result = await service.reactivateShift('school-1', 'shift-1', actingUser);
    expect(result).toBeDefined();
    expect(repository.updateShift).not.toHaveBeenCalled();
  });

  it('re-checks overlap against currently-active Shifts before restoring — the Technical Design Review finding', async () => {
    const archivedTarget = activeShift({
      id: 'shift-1',
      status: 'ARCHIVED',
      displayOrder: null,
      startTime: new Date('1970-01-01T07:30:00.000Z'),
      endTime: new Date('1970-01-01T12:30:00.000Z'),
    });
    // A different Shift was created while shift-1 sat archived, now
    // occupying an overlapping range.
    const conflicting = activeShift({
      id: 'shift-2',
      startTime: new Date('1970-01-01T08:00:00.000Z'),
      endTime: new Date('1970-01-01T13:00:00.000Z'),
    });
    repository.findShiftById.mockResolvedValue(archivedTarget);
    repository.listActiveShiftsBySchool.mockResolvedValue([conflicting]);

    await expect(service.reactivateShift('school-1', 'shift-1', actingUser)).rejects.toThrow('overlaps');
    expect(repository.updateShift).not.toHaveBeenCalled();
  });

  it('reactivates successfully and appends to the end of the active sequence, never as Default', async () => {
    const archivedTarget = activeShift({ id: 'shift-1', status: 'ARCHIVED', displayOrder: null });
    const nonConflicting = activeShift({
      id: 'shift-2',
      displayOrder: 1,
      startTime: new Date('1970-01-01T13:30:00.000Z'),
      endTime: new Date('1970-01-01T18:00:00.000Z'),
    });
    repository.findShiftById.mockResolvedValue(archivedTarget);
    repository.listActiveShiftsBySchool.mockResolvedValue([nonConflicting]);
    repository.updateShift.mockResolvedValue({ ...archivedTarget, status: 'ACTIVE', displayOrder: 2 });

    await service.reactivateShift('school-1', 'shift-1', actingUser);

    expect(repository.updateShift).toHaveBeenCalledWith('shift-1', { status: 'ACTIVE', displayOrder: 2 }, 'MOCK_TX');
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'SHIFT_REACTIVATED' }));
  });
});

describe('createDefaultScheduleForSchool (Business Rule #3)', () => {
  it('creates the Somalia Default Calendar and a default active "Morning" Shift, marked Default, plus its default Period structure', async () => {
    repository.createShift.mockResolvedValue(activeShift({ id: 'shift-1', name: 'Morning', isDefault: true }));

    await service.createDefaultScheduleForSchool('school-1', actingUser);

    expect(repository.createCalendar).toHaveBeenCalledWith('school-1', [
      'SATURDAY',
      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
    ]);
    // Shift + its Period structure are created inside one transaction —
    // createShift is now called with the transaction client, not the
    // default prisma client.
    expect(repository.createShift).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'school-1', name: 'Morning', isDefault: true, status: 'ACTIVE', displayOrder: 1 }),
      'MOCK_TX'
    );
    expect(repository.createManyPeriods).toHaveBeenCalledWith(
      [
        expect.objectContaining({ shiftId: 'shift-1', name: 'Period 1', type: 'TEACHING', displayOrder: 1, status: 'ACTIVE' }),
        expect.objectContaining({ shiftId: 'shift-1', name: 'Period 2', type: 'TEACHING', displayOrder: 2, status: 'ACTIVE' }),
        expect.objectContaining({ shiftId: 'shift-1', name: 'Period 3', type: 'TEACHING', displayOrder: 3, status: 'ACTIVE' }),
        expect.objectContaining({ shiftId: 'shift-1', name: 'Break', type: 'BREAK', displayOrder: 4, status: 'ACTIVE' }),
        expect.objectContaining({ shiftId: 'shift-1', name: 'Period 4', type: 'TEACHING', displayOrder: 5, status: 'ACTIVE' }),
        expect.objectContaining({ shiftId: 'shift-1', name: 'Period 5', type: 'TEACHING', displayOrder: 6, status: 'ACTIVE' }),
        expect.objectContaining({ shiftId: 'shift-1', name: 'Period 6', type: 'TEACHING', displayOrder: 7, status: 'ACTIVE' }),
      ],
      'MOCK_TX'
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'SCHOOL_CALENDAR_CREATED' }));
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'DEFAULT_SHIFT_CREATED' }));
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'PERIOD_STRUCTURE_CREATED' }));
  });
});

describe('Architecture Update (Periods) — generatePeriodStructure via createShift wizard', () => {
  it('createShift generates the default wizard structure (6 Teaching, Break after 3) when no wizard fields are given', async () => {
    repository.listActiveShiftsBySchool.mockResolvedValue([]);
    repository.createShift.mockResolvedValue(activeShift({ id: 'shift-2', displayOrder: 1 }));

    await service.createShift('school-1', { name: 'Afternoon', startTime: '13:30', endTime: '18:00' }, actingUser);

    expect(repository.createManyPeriods).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ shiftId: 'shift-2', name: 'Period 3', type: 'TEACHING', displayOrder: 3 }),
        expect.objectContaining({ shiftId: 'shift-2', name: 'Break', type: 'BREAK', displayOrder: 4 }),
        expect.objectContaining({ shiftId: 'shift-2', name: 'Period 4', type: 'TEACHING', displayOrder: 5 }),
      ]),
      'MOCK_TX'
    );
  });

  it('creates a custom structure from caller-supplied wizard fields, with the Break at the very end when breakAfterPeriod equals teachingPeriodCount', async () => {
    repository.listActiveShiftsBySchool.mockResolvedValue([]);
    repository.createShift.mockResolvedValue(activeShift({ id: 'shift-3', displayOrder: 1 }));

    await service.createShift(
      'school-1',
      { name: 'Evening', startTime: '18:00', endTime: '20:00', teachingPeriodCount: 4, includeBreak: true, breakAfterPeriod: 4 },
      actingUser
    );

    expect(repository.createManyPeriods).toHaveBeenCalledWith(
      [
        expect.objectContaining({ name: 'Period 1', type: 'TEACHING', displayOrder: 1 }),
        expect.objectContaining({ name: 'Period 2', type: 'TEACHING', displayOrder: 2 }),
        expect.objectContaining({ name: 'Period 3', type: 'TEACHING', displayOrder: 3 }),
        expect.objectContaining({ name: 'Period 4', type: 'TEACHING', displayOrder: 4 }),
        expect.objectContaining({ name: 'Break', type: 'BREAK', displayOrder: 5 }),
      ],
      'MOCK_TX'
    );
  });

  it('omits the Break entirely when includeBreak is false', async () => {
    repository.listActiveShiftsBySchool.mockResolvedValue([]);
    repository.createShift.mockResolvedValue(activeShift({ id: 'shift-4', displayOrder: 1 }));

    await service.createShift(
      'school-1',
      { name: 'Evening', startTime: '18:00', endTime: '20:00', teachingPeriodCount: 3, includeBreak: false, breakAfterPeriod: 1 },
      actingUser
    );

    expect(repository.createManyPeriods).toHaveBeenCalledWith(
      [
        expect.objectContaining({ name: 'Period 1', type: 'TEACHING', displayOrder: 1 }),
        expect.objectContaining({ name: 'Period 2', type: 'TEACHING', displayOrder: 2 }),
        expect.objectContaining({ name: 'Period 3', type: 'TEACHING', displayOrder: 3 }),
      ],
      'MOCK_TX'
    );
  });
});

describe('Architecture Update (Periods) — Period core CRUD', () => {
  function period(overrides = {}) {
    return {
      id: 'period-1',
      shiftId: 'shift-1',
      name: 'Period 1',
      type: 'TEACHING',
      startTime: null,
      endTime: null,
      displayOrder: 1,
      status: 'ACTIVE',
      ...overrides,
    };
  }

  beforeEach(() => {
    repository.findShiftById.mockResolvedValue(activeShift({ id: 'shift-1', schoolId: 'school-1' }));
    repository.listActivePeriodsByShift.mockResolvedValue([]);
  });

  it('createPeriod succeeds with null times and the next end-of-sequence displayOrder', async () => {
    repository.listActivePeriodsByShift.mockResolvedValue([period({ displayOrder: 1 })]);
    repository.createPeriod.mockResolvedValue(period({ id: 'period-2', displayOrder: 2, name: 'Period 2' }));

    const result = await service.createPeriod('school-1', 'shift-1', { name: 'Period 2', type: 'TEACHING' }, actingUser);

    expect(repository.createPeriod).toHaveBeenCalledWith(
      expect.objectContaining({ shiftId: 'shift-1', name: 'Period 2', type: 'TEACHING', startTime: null, endTime: null, displayOrder: 2, status: 'ACTIVE' }),
      'MOCK_TX'
    );
    expect(result.startTime).toBeNull();
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'PERIOD_CREATED' }));
  });

  it('rejects a configured Period whose times fall outside the parent Shift\'s own operating hours', async () => {
    await expect(
      service.createPeriod('school-1', 'shift-1', { name: 'Period X', type: 'TEACHING', startTime: '06:00', endTime: '07:00' }, actingUser)
    ).rejects.toThrow('Invalid Period');
    expect(repository.createPeriod).not.toHaveBeenCalled();
  });

  it('rejects a configured Period overlapping another active Period in the same Shift', async () => {
    repository.listActivePeriodsByShift.mockResolvedValue([
      period({ startTime: new Date('1970-01-01T08:00:00.000Z'), endTime: new Date('1970-01-01T09:00:00.000Z') }),
    ]);

    await expect(
      service.createPeriod('school-1', 'shift-1', { name: 'Period X', type: 'TEACHING', startTime: '08:30', endTime: '09:30' }, actingUser)
    ).rejects.toThrow('overlaps');
  });

  it('updatePeriod re-validates containment and overlap, excluding itself', async () => {
    repository.findPeriodById.mockResolvedValue(period());
    repository.updatePeriod.mockResolvedValue(period({ name: 'Period 1 Renamed' }));

    await service.updatePeriod('school-1', 'period-1', { name: 'Period 1 Renamed', type: 'TEACHING', startTime: '07:30', endTime: '08:30' }, actingUser);

    expect(repository.updatePeriod).toHaveBeenCalledWith(
      'period-1',
      expect.objectContaining({ name: 'Period 1 Renamed' }),
      'MOCK_TX'
    );
  });

  it('archivePeriod removes it from the active sequence and renumbers the remainder', async () => {
    const target = period({ id: 'period-1', displayOrder: 1 });
    const other = period({ id: 'period-2', displayOrder: 2 });
    repository.findPeriodById.mockResolvedValue(target);
    repository.listActivePeriodsByShift.mockResolvedValue([target, other]);
    repository.updatePeriod.mockResolvedValue({ ...target, status: 'ARCHIVED', displayOrder: null });

    await service.archivePeriod('school-1', 'period-1', actingUser);

    expect(repository.updatePeriod).toHaveBeenCalledWith('period-1', { status: 'ARCHIVED', displayOrder: null }, 'MOCK_TX');
    expect(repository.renumberActivePeriods).toHaveBeenCalledWith([other], 'MOCK_TX');
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'PERIOD_ARCHIVED' }));
  });

  it('reorderPeriod rejects an Archived target', async () => {
    repository.findPeriodById.mockResolvedValue(period({ status: 'ARCHIVED' }));

    await expect(service.reorderPeriod('school-1', 'period-1', 1, actingUser)).rejects.toThrow(
      'An archived Period cannot be reordered'
    );
  });

  it('reactivatePeriod re-checks containment and overlap before restoring, skipped when times are null', async () => {
    repository.findPeriodById.mockResolvedValue(period({ status: 'ARCHIVED', startTime: null, endTime: null }));
    repository.updatePeriod.mockResolvedValue(period({ status: 'ACTIVE' }));

    await service.reactivatePeriod('school-1', 'period-1', actingUser);

    expect(repository.updatePeriod).toHaveBeenCalledWith(
      'period-1',
      expect.objectContaining({ status: 'ACTIVE' }),
      'MOCK_TX'
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'PERIOD_REACTIVATED' }));
  });
});

describe('Architecture Update (Periods) — updateShift retrofit (Technical Design Review finding)', () => {
  it('rejects narrowing a Shift\'s operating hours when an existing configured Period would fall outside the new range', async () => {
    const existing = activeShift({ id: 'shift-1' });
    repository.findShiftById.mockResolvedValue(existing);
    repository.listActiveShiftsBySchool.mockResolvedValue([existing]);
    repository.listActivePeriodsByShift.mockResolvedValue([
      { id: 'period-1', name: 'Period 1', startTime: new Date('1970-01-01T07:30:00.000Z'), endTime: new Date('1970-01-01T08:30:00.000Z') },
    ]);

    // Narrow the Shift to 08:00-12:30 — Period 1 (07:30-08:30) no longer fits.
    await expect(
      service.updateShift('school-1', 'shift-1', { name: 'Morning', startTime: '08:00', endTime: '12:30' }, actingUser)
    ).rejects.toThrow('no longer fit');
    expect(repository.updateShift).not.toHaveBeenCalled();
  });

  it('accepts a narrowed range when no active Period is affected', async () => {
    const existing = activeShift({ id: 'shift-1' });
    repository.findShiftById.mockResolvedValue(existing);
    repository.listActiveShiftsBySchool.mockResolvedValue([existing]);
    repository.listActivePeriodsByShift.mockResolvedValue([
      { id: 'period-1', name: 'Period 1', startTime: new Date('1970-01-01T08:00:00.000Z'), endTime: new Date('1970-01-01T09:00:00.000Z') },
    ]);
    repository.updateShift.mockResolvedValue({ ...existing, startTime: new Date('1970-01-01T07:45:00.000Z') });

    await service.updateShift('school-1', 'shift-1', { name: 'Morning', startTime: '07:45', endTime: '12:30' }, actingUser);

    expect(repository.updateShift).toHaveBeenCalled();
    expect(repository.acquireShiftLock).toHaveBeenCalledWith('shift-1', 'MOCK_TX');
  });

  it('skips the containment check for unconfigured (null-timed) Periods', async () => {
    const existing = activeShift({ id: 'shift-1' });
    repository.findShiftById.mockResolvedValue(existing);
    repository.listActiveShiftsBySchool.mockResolvedValue([existing]);
    repository.listActivePeriodsByShift.mockResolvedValue([
      { id: 'period-1', name: 'Period 1', startTime: null, endTime: null },
    ]);
    repository.updateShift.mockResolvedValue({ ...existing });

    await service.updateShift('school-1', 'shift-1', { name: 'Morning', startTime: '09:00', endTime: '10:00' }, actingUser);

    expect(repository.updateShift).toHaveBeenCalled();
  });
});

describe('Architecture Update (Periods) — Stable Public Service Interface', () => {
  it('getShiftPeriods returns an empty array for a cross-school shiftId', async () => {
    repository.findShiftById.mockResolvedValue(activeShift({ schoolId: 'other-school' }));
    await expect(service.getShiftPeriods('school-1', 'shift-1')).resolves.toEqual([]);
  });

  it('getPeriodById returns null for a Period whose parent Shift belongs to a different school', async () => {
    repository.findPeriodById.mockResolvedValue({ id: 'period-1', shiftId: 'shift-1', startTime: null, endTime: null });
    repository.findShiftById.mockResolvedValue(activeShift({ schoolId: 'other-school' }));
    await expect(service.getPeriodById('school-1', 'period-1')).resolves.toBeNull();
  });

  it('validatePeriod is true only for an Active Period belonging to the school', async () => {
    repository.findPeriodById.mockResolvedValue({ id: 'period-1', shiftId: 'shift-1', status: 'ARCHIVED' });
    repository.findShiftById.mockResolvedValue(activeShift({ schoolId: 'school-1' }));
    await expect(service.validatePeriod('school-1', 'period-1')).resolves.toBe(false);

    repository.findPeriodById.mockResolvedValue({ id: 'period-1', shiftId: 'shift-1', status: 'ACTIVE' });
    await expect(service.validatePeriod('school-1', 'period-1')).resolves.toBe(true);
  });
});

describe('stable public service interface', () => {
  it('getWeekendDays derives the complement of the stored workingDays', async () => {
    repository.findCalendarBySchool.mockResolvedValue({ schoolId: 'school-1', workingDays: ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY'] });

    await expect(service.getWeekendDays('school-1')).resolves.toEqual(['THURSDAY', 'FRIDAY']);
  });

  it('getActiveShift returns the school\'s current Default Shift', async () => {
    repository.findDefaultShift.mockResolvedValue(activeShift({ isDefault: true }));

    const result = await service.getActiveShift('school-1');
    expect(result.id).toBe('shift-1');
  });

  it('getShiftById returns null for a cross-tenant id', async () => {
    repository.findShiftById.mockResolvedValue(activeShift({ schoolId: 'other-school' }));
    await expect(service.getShiftById('school-1', 'shift-1')).resolves.toBeNull();
  });

  it('validateWorkingDay reflects the stored workingDays', async () => {
    repository.findCalendarBySchool.mockResolvedValue({ schoolId: 'school-1', workingDays: ['MONDAY'] });

    await expect(service.validateWorkingDay('school-1', 'MONDAY')).resolves.toBe(true);
    await expect(service.validateWorkingDay('school-1', 'FRIDAY')).resolves.toBe(false);
  });

  it('validateShift is true only for an active Shift belonging to the school', async () => {
    repository.findShiftById.mockResolvedValue(activeShift({ status: 'ARCHIVED' }));
    await expect(service.validateShift('school-1', 'shift-1')).resolves.toBe(false);

    repository.findShiftById.mockResolvedValue(activeShift({ status: 'ACTIVE' }));
    await expect(service.validateShift('school-1', 'shift-1')).resolves.toBe(true);
  });
});
