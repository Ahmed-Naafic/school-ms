jest.mock('./weekly-subject-allocations.repository');
jest.mock('../../shared/audit');
jest.mock('../classes/classes.service');
jest.mock('../school-schedule/school-schedule.service');
jest.mock('../subjects/subjects.service');
jest.mock('../academic-years/academic-years.service');
// Without these, requiring the REAL modules would execute their own
// top-level side effects against this file's already-mocked subjectsService
// (Teacher Subject Assignment's own module-load-time
// registerRemovalDependencyCheck call), shifting the captured
// registeredRemovalCheckFn below to the wrong function entirely.
jest.mock('../teacher-subject-assignments/teacher-subject-assignments.service');
jest.mock('../teachers/teachers.service');

const repository = require('./weekly-subject-allocations.repository');
const { recordAuditEvent } = require('../../shared/audit');
const classesService = require('../classes/classes.service');
const schoolScheduleService = require('../school-schedule/school-schedule.service');
const subjectsService = require('../subjects/subjects.service');
const academicYearsService = require('../academic-years/academic-years.service');
const teacherSubjectAssignmentsService = require('../teacher-subject-assignments/teacher-subject-assignments.service');
const teachersService = require('../teachers/teachers.service');
const service = require('./weekly-subject-allocations.service');

// Captured immediately after this module is first required (module-load
// time), per Teacher Subject Assignment's own established pattern for
// testing a registerRemovalDependencyCheck registration —
// jest.clearAllMocks() in beforeEach would otherwise erase the one-time
// call's recorded arguments before any test could observe them.
const [, registeredRemovalCheckFn] = subjectsService.registerRemovalDependencyCheck.mock.calls[0];

const actingUser = { id: 'admin-1', schoolId: 'school-1' };

const ACTIVE_SUBJECT = { id: 'subject-1', status: 'ACTIVE' };
const ACTIVE_YEAR = { id: 'ay-1', schoolId: 'school-1', status: 'ACTIVE' };

beforeEach(() => {
  jest.clearAllMocks();

  // Default: 'grade-level-1' has one Shift ('shift-1'), a 5-day week with
  // 7 Teaching Periods — 35 available weekly teaching periods, matching
  // the Business Specification's own worked example.
  classesService.getGradeLevelShift.mockResolvedValue('shift-1');
  classesService.validateGradeLevel.mockResolvedValue(true);
  schoolScheduleService.getWorkingDays.mockResolvedValue(['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY']);
  schoolScheduleService.getShiftPeriods.mockResolvedValue([
    { type: 'TEACHING' },
    { type: 'TEACHING' },
    { type: 'TEACHING' },
    { type: 'TEACHING' },
    { type: 'TEACHING' },
    { type: 'TEACHING' },
    { type: 'TEACHING' },
    { type: 'BREAK' },
  ]);
  subjectsService.getSubjectById.mockResolvedValue(ACTIVE_SUBJECT);
  subjectsService.isSubjectAssignedToSchool.mockResolvedValue(true);
  academicYearsService.getCurrentAcademicYear.mockResolvedValue(ACTIVE_YEAR);
  academicYearsService.getAcademicYearById.mockResolvedValue(ACTIVE_YEAR);
});

describe('calculateAvailablePeriods (via createAllocation)', () => {
  it('computes 5 Working Days x 7 Teaching Periods = 35', async () => {
    repository.findByNaturalKey.mockResolvedValue(null);
    repository.createWithSubjects.mockResolvedValue({ id: 'wsa-1', schoolId: 'school-1', subjects: [] });

    await service.createAllocation(
      { gradeLevelId: 'grade-level-1', subjects: [{ subjectId: 'subject-1', weeklyPeriods: 35 }] },
      actingUser
    );

    expect(repository.createWithSubjects).toHaveBeenCalledWith(
      expect.objectContaining({ availablePeriodsAtSave: 35 })
    );
  });

  it('rejects an incomplete total', async () => {
    repository.findByNaturalKey.mockResolvedValue(null);

    await expect(
      service.createAllocation(
        { gradeLevelId: 'grade-level-1', subjects: [{ subjectId: 'subject-1', weeklyPeriods: 20 }] },
        actingUser
      )
    ).rejects.toThrow('Invalid Weekly Subject Allocation');
    expect(repository.createWithSubjects).not.toHaveBeenCalled();
  });

  it('rejects an over-allocated total', async () => {
    repository.findByNaturalKey.mockResolvedValue(null);

    await expect(
      service.createAllocation(
        { gradeLevelId: 'grade-level-1', subjects: [{ subjectId: 'subject-1', weeklyPeriods: 40 }] },
        actingUser
      )
    ).rejects.toThrow('Invalid Weekly Subject Allocation');
  });

  it('rejects a duplicate Subject within the array', async () => {
    repository.findByNaturalKey.mockResolvedValue(null);

    await expect(
      service.createAllocation(
        {
          gradeLevelId: 'grade-level-1',
          subjects: [
            { subjectId: 'subject-1', weeklyPeriods: 20 },
            { subjectId: 'subject-1', weeklyPeriods: 15 },
          ],
        },
        actingUser
      )
    ).rejects.toThrow('Invalid Weekly Subject Allocation');
  });

  it('rejects a non-positive weeklyPeriods value', async () => {
    repository.findByNaturalKey.mockResolvedValue(null);

    await expect(
      service.createAllocation(
        { gradeLevelId: 'grade-level-1', subjects: [{ subjectId: 'subject-1', weeklyPeriods: 0 }] },
        actingUser
      )
    ).rejects.toThrow('Invalid Weekly Subject Allocation');
  });

  it('throws a clear error when the Grade/Form has no member Classes yet', async () => {
    classesService.getGradeLevelShift.mockResolvedValue(null);

    await expect(
      service.createAllocation(
        { gradeLevelId: 'empty-grade-level', subjects: [{ subjectId: 'subject-1', weeklyPeriods: 35 }] },
        actingUser
      )
    ).rejects.toThrow('Cannot calculate available periods');
  });
});

describe('getAvailablePeriodsPreview (frontend Create-flow support)', () => {
  it('returns the calculated figure', async () => {
    await expect(service.getAvailablePeriodsPreview('school-1', 'grade-level-1')).resolves.toBe(35);
  });

  it('returns null (never throws) when the Grade/Form has no member Classes yet', async () => {
    classesService.getGradeLevelShift.mockResolvedValue(null);
    await expect(service.getAvailablePeriodsPreview('school-1', 'empty-grade-level')).resolves.toBeNull();
  });
});

describe('createAllocation', () => {
  it('rejects an invalid gradeLevelId', async () => {
    classesService.validateGradeLevel.mockResolvedValue(false);

    await expect(
      service.createAllocation(
        { gradeLevelId: 'bogus', subjects: [{ subjectId: 'subject-1', weeklyPeriods: 35 }] },
        actingUser
      )
    ).rejects.toThrow('Invalid Grade/Form');
    expect(repository.createWithSubjects).not.toHaveBeenCalled();
  });

  it('rejects a Subject that is not assigned to the school', async () => {
    repository.findByNaturalKey.mockResolvedValue(null);
    subjectsService.isSubjectAssignedToSchool.mockResolvedValue(false);

    await expect(
      service.createAllocation(
        { gradeLevelId: 'grade-level-1', subjects: [{ subjectId: 'subject-1', weeklyPeriods: 35 }] },
        actingUser
      )
    ).rejects.toThrow('Invalid Subject in allocation');
  });

  it('rejects a second allocation for the same natural key', async () => {
    repository.findByNaturalKey.mockResolvedValue({ id: 'existing' });

    await expect(
      service.createAllocation(
        { gradeLevelId: 'grade-level-1', subjects: [{ subjectId: 'subject-1', weeklyPeriods: 35 }] },
        actingUser
      )
    ).rejects.toThrow('A Weekly Subject Allocation already exists');
  });

  it('defaults academicYearId to the school\'s own Current Academic Year when omitted', async () => {
    repository.findByNaturalKey.mockResolvedValue(null);
    repository.createWithSubjects.mockResolvedValue({ id: 'wsa-1', schoolId: 'school-1', subjects: [] });

    await service.createAllocation(
      { gradeLevelId: 'grade-level-1', subjects: [{ subjectId: 'subject-1', weeklyPeriods: 35 }] },
      actingUser
    );

    expect(repository.createWithSubjects).toHaveBeenCalledWith(
      expect.objectContaining({ academicYearId: 'ay-1' })
    );
  });

  it('records an audit event on success', async () => {
    repository.findByNaturalKey.mockResolvedValue(null);
    repository.createWithSubjects.mockResolvedValue({ id: 'wsa-1', schoolId: 'school-1', subjects: [] });

    await service.createAllocation(
      { gradeLevelId: 'grade-level-1', subjects: [{ subjectId: 'subject-1', weeklyPeriods: 35 }] },
      actingUser
    );

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'WEEKLY_SUBJECT_ALLOCATION_CREATED', schoolId: 'school-1' })
    );
  });
});

describe('correctAllocation (Business Lifecycle Step 5/6 — resolves Needs Review by construction)', () => {
  const EXISTING_ALLOCATION = { id: 'wsa-1', schoolId: 'school-1', gradeLevelId: 'grade-level-1' };

  it('re-runs calculateAvailablePeriods fresh, never the stored snapshot', async () => {
    repository.findById.mockResolvedValue(EXISTING_ALLOCATION);
    repository.replaceSubjects.mockResolvedValue({ ...EXISTING_ALLOCATION, subjects: [] });

    await service.correctAllocation('wsa-1', { subjects: [{ subjectId: 'subject-1', weeklyPeriods: 35 }] }, actingUser);

    expect(repository.replaceSubjects).toHaveBeenCalledWith(
      'wsa-1',
      [{ subjectId: 'subject-1', weeklyPeriods: 35 }],
      35
    );
  });

  it('rejects an incomplete total against the freshly-computed figure', async () => {
    repository.findById.mockResolvedValue(EXISTING_ALLOCATION);

    await expect(
      service.correctAllocation('wsa-1', { subjects: [{ subjectId: 'subject-1', weeklyPeriods: 10 }] }, actingUser)
    ).rejects.toThrow('Invalid Weekly Subject Allocation');
    expect(repository.replaceSubjects).not.toHaveBeenCalled();
  });

  it('rejects correcting an allocation belonging to another school', async () => {
    repository.findById.mockResolvedValue({ ...EXISTING_ALLOCATION, schoolId: 'other-school' });

    await expect(
      service.correctAllocation('wsa-1', { subjects: [{ subjectId: 'subject-1', weeklyPeriods: 35 }] }, actingUser)
    ).rejects.toThrow('Weekly Subject Allocation not found');
  });
});

describe('isAllocationCurrent / Needs Review (derived, never persisted — Technical Design Review finding)', () => {
  it('reports current when the freshly-computed figure matches the stored snapshot', async () => {
    repository.listBySchool.mockResolvedValue([
      { id: 'wsa-1', schoolId: 'school-1', gradeLevelId: 'grade-level-1', availablePeriodsAtSave: 35, subjects: [] },
    ]);

    const [result] = await service.listAllocations('school-1', {});

    expect(result.needsReview).toBe(false);
    expect(result.availablePeriodsNow).toBe(35);
  });

  it('reports Needs Review when the freshly-computed figure no longer matches', async () => {
    repository.listBySchool.mockResolvedValue([
      { id: 'wsa-1', schoolId: 'school-1', gradeLevelId: 'grade-level-1', availablePeriodsAtSave: 30, subjects: [] },
    ]);

    const [result] = await service.listAllocations('school-1', {});

    expect(result.needsReview).toBe(true);
    expect(result.availablePeriodsNow).toBe(35);
  });

  it('never crashes when the Grade/Form has lost every member Class — reports Needs Review instead (Technical Design Review finding)', async () => {
    classesService.getGradeLevelShift.mockResolvedValue(null);
    repository.listBySchool.mockResolvedValue([
      { id: 'wsa-1', schoolId: 'school-1', gradeLevelId: 'now-empty-grade-level', availablePeriodsAtSave: 35, subjects: [] },
    ]);

    const [result] = await service.listAllocations('school-1', {});

    expect(result.needsReview).toBe(true);
    expect(result.availablePeriodsNow).toBeNull();
  });
});

describe('listEligibleSubjectsWithTeachers (auto-populate eligible Subjects + their Teachers)', () => {
  const GRADE_LEVEL = { id: 'grade-level-1', schoolId: 'school-1', educationLevel: 'PRIMARY' };

  beforeEach(() => {
    classesService.getGradeLevelById.mockResolvedValue(GRADE_LEVEL);
    classesService.listActiveClassesByGradeLevel.mockResolvedValue([{ id: 'class-1' }, { id: 'class-2' }]);
    teacherSubjectAssignmentsService.getActiveTeacherIdsForSubjectAcrossClasses.mockResolvedValue([]);
  });

  it('returns only school-assigned, Active Subjects matching the Grade/Form\'s own Education Level', async () => {
    subjectsService.listSchoolSubjects.mockResolvedValue([
      { subjectId: 'math', subject: { name: 'Math', status: 'ACTIVE', educationLevel: 'PRIMARY' } },
      { subjectId: 'physics', subject: { name: 'Physics', status: 'ACTIVE', educationLevel: 'SECONDARY' } },
      { subjectId: 'archived', subject: { name: 'Old Subject', status: 'ARCHIVED', educationLevel: 'PRIMARY' } },
    ]);

    const result = await service.listEligibleSubjectsWithTeachers('school-1', 'grade-level-1', 'ay-1');

    expect(result).toEqual([{ subjectId: 'math', subjectName: 'Math', teacherNames: [] }]);
  });

  it('lists every distinct Teacher currently teaching that Subject anywhere in the Grade/Form\'s own Classes', async () => {
    subjectsService.listSchoolSubjects.mockResolvedValue([
      { subjectId: 'math', subject: { name: 'Math', status: 'ACTIVE', educationLevel: 'PRIMARY' } },
    ]);
    teacherSubjectAssignmentsService.getActiveTeacherIdsForSubjectAcrossClasses.mockResolvedValue([
      'teacher-1',
      'teacher-2',
    ]);
    teachersService.getTeacherById.mockImplementation(async (schoolId, teacherId) => ({
      id: teacherId,
      fullName: teacherId === 'teacher-1' ? 'Ahmed' : 'Yusuf',
    }));

    const result = await service.listEligibleSubjectsWithTeachers('school-1', 'grade-level-1', 'ay-1');

    expect(result).toEqual([{ subjectId: 'math', subjectName: 'Math', teacherNames: ['Ahmed', 'Yusuf'] }]);
    expect(teacherSubjectAssignmentsService.getActiveTeacherIdsForSubjectAcrossClasses).toHaveBeenCalledWith(
      'school-1',
      'math',
      ['class-1', 'class-2'],
      'ay-1'
    );
  });

  it('returns an empty array for a Grade/Form that does not exist or belongs to another school', async () => {
    classesService.getGradeLevelById.mockResolvedValue(null);

    const result = await service.listEligibleSubjectsWithTeachers('school-1', 'bogus', 'ay-1');

    expect(result).toEqual([]);
    expect(subjectsService.listSchoolSubjects).not.toHaveBeenCalled();
  });
});

describe('Stable Public Service Interface', () => {
  describe('getWeeklyPeriodsForAssignment (takes classId, resolves gradeLevelId internally — Technical Design Review finding)', () => {
    it('resolves classId to gradeLevelId and returns the matching line', async () => {
      classesService.getClassById.mockResolvedValue({ id: 'class-1', schoolId: 'school-1', gradeLevelId: 'grade-level-1' });
      repository.findLineByGradeLevelYearSubject.mockResolvedValue({ weeklyPeriods: 5, doublePeriodRequired: true });

      const result = await service.getWeeklyPeriodsForAssignment('school-1', 'class-1', 'ay-1', 'subject-1');

      expect(repository.findLineByGradeLevelYearSubject).toHaveBeenCalledWith(
        'school-1',
        'grade-level-1',
        'ay-1',
        'subject-1'
      );
      expect(result).toEqual({ weeklyPeriods: 5, doublePeriodRequired: true });
    });

    it('returns null when no current allocation/line exists for that combination', async () => {
      classesService.getClassById.mockResolvedValue({ id: 'class-1', schoolId: 'school-1', gradeLevelId: 'grade-level-1' });
      repository.findLineByGradeLevelYearSubject.mockResolvedValue(null);

      const result = await service.getWeeklyPeriodsForAssignment('school-1', 'class-1', 'ay-1', 'subject-1');

      expect(result).toBeNull();
    });

    it('returns null for a cross-school Class', async () => {
      classesService.getClassById.mockResolvedValue({ id: 'class-1', schoolId: 'other-school', gradeLevelId: 'grade-level-1' });

      const result = await service.getWeeklyPeriodsForAssignment('school-1', 'class-1', 'ay-1', 'subject-1');

      expect(result).toBeNull();
      expect(repository.findLineByGradeLevelYearSubject).not.toHaveBeenCalled();
    });
  });

  describe('isSchoolNeedsReview', () => {
    it('is false when zero allocations exist yet', async () => {
      repository.listBySchoolAndYear.mockResolvedValue([]);

      await expect(service.isSchoolNeedsReview('school-1', 'ay-1')).resolves.toBe(false);
    });

    it('is true when any single allocation currently fails isAllocationCurrent', async () => {
      repository.listBySchoolAndYear.mockResolvedValue([
        { id: 'wsa-1', schoolId: 'school-1', gradeLevelId: 'grade-level-1', availablePeriodsAtSave: 35 },
        { id: 'wsa-2', schoolId: 'school-1', gradeLevelId: 'grade-level-2', availablePeriodsAtSave: 999 },
      ]);

      await expect(service.isSchoolNeedsReview('school-1', 'ay-1')).resolves.toBe(true);
    });

    it('is false when every allocation is current', async () => {
      repository.listBySchoolAndYear.mockResolvedValue([
        { id: 'wsa-1', schoolId: 'school-1', gradeLevelId: 'grade-level-1', availablePeriodsAtSave: 35 },
      ]);

      await expect(service.isSchoolNeedsReview('school-1', 'ay-1')).resolves.toBe(false);
    });
  });

  describe('listAllocationsForGradeLevel', () => {
    it('returns the Subject/period/Double-Period rows for a Grade/Form + Academic Year', async () => {
      repository.findByNaturalKey.mockResolvedValue({
        id: 'wsa-1',
        subjects: [{ subjectId: 'subject-1', weeklyPeriods: 5, doublePeriodRequired: false }],
      });

      const result = await service.listAllocationsForGradeLevel('school-1', 'grade-level-1', 'ay-1');

      expect(result).toEqual([{ subjectId: 'subject-1', weeklyPeriods: 5, doublePeriodRequired: false }]);
    });

    it('returns an empty array on a miss', async () => {
      repository.findByNaturalKey.mockResolvedValue(null);

      const result = await service.listAllocationsForGradeLevel('school-1', 'grade-level-1', 'ay-1');

      expect(result).toEqual([]);
    });
  });
});

describe('Subject Management removal-dependency-check registration (Technical Design Review finding — WP3)', () => {
  // Asserted via the captured function itself, not a post-hoc
  // toHaveBeenCalledWith — jest.clearAllMocks() in beforeEach above erases
  // the one-time, module-load-time call's recorded arguments before any
  // test body runs, the same caveat Teacher Subject Assignment's own
  // identical test already documents.
  it('registers a checker at module-load time', () => {
    expect(typeof registeredRemovalCheckFn).toBe('function');
  });

  it('blocks archival when a current allocation line references the Subject', async () => {
    repository.findLineReferencingSubject.mockResolvedValue({ id: 'line-1' });

    const reason = await registeredRemovalCheckFn('school-1', 'subject-1');

    expect(reason).toBe('a current Weekly Subject Allocation references this Subject');
  });

  it('allows archival when no allocation line references the Subject', async () => {
    repository.findLineReferencingSubject.mockResolvedValue(null);

    const reason = await registeredRemovalCheckFn('school-1', 'subject-1');

    expect(reason).toBeNull();
  });
});
