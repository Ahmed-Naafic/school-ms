jest.mock('./teacher-subject-assignments.repository');
jest.mock('../../shared/audit');
jest.mock('../teachers/teachers.service');
jest.mock('../subjects/subjects.service');
jest.mock('../classes/classes.service');
jest.mock('../academic-years/academic-years.service');
jest.mock('../school-schedule/school-schedule.service');
jest.mock('../weekly-subject-allocations/weekly-subject-allocations.service');
// createAssignment/replaceTeacher/copyAssignments each wrap their entire
// read-decide-write sequence in prisma.$transaction, acquiring the
// per-school advisory lock as the first statement (Implementation
// Requirements). Without mocking this, $transaction would open a real
// transaction against the real dev database on every test run here —
// mirroring Academic Year Management's own service test fix exactly, with a
// fake transaction runner that just invokes the callback synchronously with
// a recognizable fake client.
jest.mock('../../config/database', () => ({
  $transaction: jest.fn((callback) => callback('MOCK_TX')),
}));

const repository = require('./teacher-subject-assignments.repository');
const { recordAuditEvent } = require('../../shared/audit');
const teachersService = require('../teachers/teachers.service');
const subjectsService = require('../subjects/subjects.service');
const classesService = require('../classes/classes.service');
const academicYearsService = require('../academic-years/academic-years.service');
const schoolScheduleService = require('../school-schedule/school-schedule.service');
const weeklySubjectAllocationsService = require('../weekly-subject-allocations/weekly-subject-allocations.service');
const service = require('./teacher-subject-assignments.service');

// Captured immediately after this module is first required (module-load
// time) — jest.clearAllMocks() in beforeEach below would otherwise erase the
// one-time registration call's recorded arguments before any test could
// observe them.
const [, registeredRemovalCheckFn] = subjectsService.registerRemovalDependencyCheck.mock.calls[0];

const actingUser = { id: 'admin-1', schoolId: 'school-1' };

const ACTIVE_TEACHER = { id: 'teacher-1', schoolId: 'school-1', employmentStatus: 'ACTIVE' };
const ACTIVE_SUBJECT = { id: 'subject-1', status: 'ACTIVE' };
const ACTIVE_CLASS = { id: 'class-1', schoolId: 'school-1', status: 'ACTIVE' };
const ACTIVE_YEAR = {
  id: 'ay-1',
  schoolId: 'school-1',
  status: 'ACTIVE',
  startDate: new Date('2026-01-01'),
  endDate: new Date('2026-12-31'),
};

function setHappyPathDefaults() {
  teachersService.getTeacherById.mockResolvedValue(ACTIVE_TEACHER);
  subjectsService.getSubjectById.mockResolvedValue(ACTIVE_SUBJECT);
  subjectsService.isSubjectAssignedToSchool.mockResolvedValue(true);
  classesService.getClassById.mockResolvedValue(ACTIVE_CLASS);
  classesService.listActiveSectionsForClass.mockResolvedValue([]);
  academicYearsService.getAcademicYearById.mockResolvedValue(ACTIVE_YEAR);
  academicYearsService.getCurrentAcademicYear.mockResolvedValue(ACTIVE_YEAR);
  repository.findActiveByScope.mockResolvedValue(null);
}

beforeEach(() => {
  jest.clearAllMocks();
  setHappyPathDefaults();
});

const basePayload = {
  teacherId: 'teacher-1',
  subjectId: 'subject-1',
  classId: 'class-1',
  academicYearId: 'ay-1',
  effectiveStartDate: '2026-02-01',
};

describe('createAssignment — shared assertion pipeline', () => {
  it('acquires the per-school advisory lock as the first statement of the transaction', async () => {
    repository.create.mockResolvedValue({ id: 'tsa-1', ...basePayload, effectiveEndDate: null });

    await service.createAssignment('school-1', basePayload, actingUser);

    expect(repository.acquireSchoolLock).toHaveBeenCalledWith('school-1', 'MOCK_TX');
    // The lock call must precede every assertion helper's own read.
    const lockOrder = repository.acquireSchoolLock.mock.invocationCallOrder[0];
    const teacherCheckOrder = teachersService.getTeacherById.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(teacherCheckOrder);
  });

  it('defaults academicYearId to the school\'s Current Academic Year when omitted (Business Rule #16)', async () => {
    repository.create.mockResolvedValue({ id: 'tsa-1' });
    const { academicYearId, ...withoutYear } = basePayload;

    await service.createAssignment('school-1', withoutYear, actingUser);

    expect(academicYearsService.getCurrentAcademicYear).toHaveBeenCalledWith('school-1');
    expect(academicYearsService.getAcademicYearById).toHaveBeenCalledWith('school-1', 'ay-1');
  });

  it('rejects a Teacher who is not ACTIVE (Business Rule #7)', async () => {
    teachersService.getTeacherById.mockResolvedValue({ ...ACTIVE_TEACHER, employmentStatus: 'RESIGNED' });

    await expect(service.createAssignment('school-1', basePayload, actingUser)).rejects.toThrow('Invalid Teacher');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects a nonexistent or cross-school Teacher', async () => {
    teachersService.getTeacherById.mockResolvedValue(null);

    await expect(service.createAssignment('school-1', basePayload, actingUser)).rejects.toThrow('Invalid Teacher');
  });

  it('rejects a Subject that is not ACTIVE (Business Rule #14)', async () => {
    subjectsService.getSubjectById.mockResolvedValue({ id: 'subject-1', status: 'ARCHIVED' });

    await expect(service.createAssignment('school-1', basePayload, actingUser)).rejects.toThrow('Invalid Subject');
  });

  it('rejects a Subject not currently assigned to the school (Business Rule #14)', async () => {
    subjectsService.isSubjectAssignedToSchool.mockResolvedValue(false);

    await expect(service.createAssignment('school-1', basePayload, actingUser)).rejects.toThrow('Invalid Subject');
  });

  it('rejects an Archived Class (Business Rule #15)', async () => {
    classesService.getClassById.mockResolvedValue({ ...ACTIVE_CLASS, status: 'ARCHIVED' });

    await expect(service.createAssignment('school-1', basePayload, actingUser)).rejects.toThrow('Invalid Class');
  });

  it('requires a Section once the Class has active Sections (Business Rule #23)', async () => {
    classesService.listActiveSectionsForClass.mockResolvedValue([{ id: 'sec-1', name: 'A' }]);

    await expect(service.createAssignment('school-1', basePayload, actingUser)).rejects.toThrow(
      'A Section is required'
    );
  });

  it('rejects a sectionId when the Class has no active Sections (Business Rule #23)', async () => {
    classesService.listActiveSectionsForClass.mockResolvedValue([]);

    await expect(
      service.createAssignment('school-1', { ...basePayload, sectionId: 'sec-1' }, actingUser)
    ).rejects.toThrow('Invalid Section');
  });

  it('accepts a Section that is one of the Class\'s own active Sections', async () => {
    classesService.listActiveSectionsForClass.mockResolvedValue([{ id: 'sec-1', name: 'A' }]);
    repository.create.mockResolvedValue({ id: 'tsa-1' });

    await service.createAssignment('school-1', { ...basePayload, sectionId: 'sec-1' }, actingUser);

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ sectionId: 'sec-1' }), 'MOCK_TX');
  });

  it('rejects an Archived Academic Year (Business Rule #16)', async () => {
    academicYearsService.getAcademicYearById.mockResolvedValue({ ...ACTIVE_YEAR, status: 'ARCHIVED' });

    await expect(service.createAssignment('school-1', basePayload, actingUser)).rejects.toThrow(
      'Invalid Academic Year'
    );
  });

  it('rejects effectiveStartDate outside the selected Academic Year\'s own date range (Validation Rule #7)', async () => {
    await expect(
      service.createAssignment('school-1', { ...basePayload, effectiveStartDate: '2027-01-15' }, actingUser)
    ).rejects.toThrow('Invalid effective start date');
  });

  it('rejects a duplicate Active assignment for the same scope (Business Rule #4)', async () => {
    repository.findActiveByScope.mockResolvedValue({ id: 'existing' });

    await expect(service.createAssignment('school-1', basePayload, actingUser)).rejects.toThrow(
      'An Active Teacher Subject Assignment already exists for this School, Academic Year, Class, Section, and Subject combination'
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('creates successfully and derives ACTIVE status when every assertion passes', async () => {
    repository.create.mockResolvedValue({
      id: 'tsa-1',
      ...basePayload,
      effectiveStartDate: new Date('2026-02-01'),
      effectiveEndDate: null,
    });

    const result = await service.createAssignment('school-1', basePayload, actingUser);

    expect(result.status).toBe('ACTIVE');
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TEACHER_SUBJECT_ASSIGNMENT_CREATED', schoolId: 'school-1' })
    );
  });
});

describe('listAssignments / getAssignmentDetail', () => {
  it('paginates and derives status for each row', async () => {
    repository.listBySchool.mockResolvedValue({
      assignments: [
        { id: 'a1', effectiveEndDate: null },
        { id: 'a2', effectiveEndDate: new Date('2026-06-01') },
      ],
      total: 2,
    });

    const result = await service.listAssignments('school-1', {});

    expect(result.assignments[0].status).toBe('ACTIVE');
    expect(result.assignments[1].status).toBe('ENDED');
    expect(result.total).toBe(2);
  });

  it('rejects a cross-tenant assignment with 404, not 403', async () => {
    repository.findById.mockResolvedValue({ id: 'a1', schoolId: 'other-school' });

    await expect(service.getAssignmentDetail('school-1', 'a1')).rejects.toThrow(
      'Teacher Subject Assignment not found'
    );
  });
});

describe('getAssignmentsGroupedByTeacher (UI Redesign — Teacher -> Subject -> Classes)', () => {
  it('groups Active assignments by Teacher, then by Subject, listing every Class taught', async () => {
    academicYearsService.getCurrentAcademicYear.mockResolvedValue({ id: 'year-1' });
    repository.listBySchool.mockResolvedValue({
      assignments: [
        { id: 'a1', teacherId: 't-ahmed', subjectId: 's-physics', classId: 'c-f1a', sectionId: null, effectiveEndDate: null },
        { id: 'a2', teacherId: 't-ahmed', subjectId: 's-physics', classId: 'c-f1b', sectionId: null, effectiveEndDate: null },
        { id: 'a3', teacherId: 't-ahmed', subjectId: 's-math', classId: 'c-g8a', sectionId: null, effectiveEndDate: null },
        // Ended — must never appear in this "current picture" grouping.
        { id: 'a4', teacherId: 't-ahmed', subjectId: 's-math', classId: 'c-g8b', sectionId: null, effectiveEndDate: new Date('2020-01-01') },
      ],
      total: 4,
    });
    teachersService.getTeacherById.mockImplementation((schoolId, id) => Promise.resolve({ id, fullName: 'Ahmed' }));
    classesService.getClassById.mockImplementation((id) =>
      Promise.resolve({ id, name: { 'c-f1a': 'F1A', 'c-f1b': 'F1B', 'c-g8a': 'G8A' }[id] })
    );
    subjectsService.getSubjectById.mockImplementation((id) =>
      Promise.resolve({ id, name: { 's-physics': 'Physics', 's-math': 'Math' }[id] })
    );

    const result = await service.getAssignmentsGroupedByTeacher('school-1', {});

    expect(result).toHaveLength(1);
    expect(result[0].teacherName).toBe('Ahmed');
    expect(result[0].subjects.map((s) => s.subjectName)).toEqual(['Math', 'Physics']);
    const physics = result[0].subjects.find((s) => s.subjectName === 'Physics');
    expect(physics.classes.map((c) => c.className).sort()).toEqual(['F1A', 'F1B']);
    const math = result[0].subjects.find((s) => s.subjectName === 'Math');
    expect(math.classes).toHaveLength(1); // the Ended row (a4) is excluded
    expect(math.classes[0].className).toBe('G8A');
  });

  it('returns an empty array when the school has no current Academic Year', async () => {
    academicYearsService.getCurrentAcademicYear.mockResolvedValue(null);
    const result = await service.getAssignmentsGroupedByTeacher('school-1', {});
    expect(result).toEqual([]);
  });

  it('never exposes any workload figure beyond the shaped class entry', async () => {
    academicYearsService.getCurrentAcademicYear.mockResolvedValue({ id: 'year-1' });
    repository.listBySchool.mockResolvedValue({
      assignments: [
        { id: 'a1', teacherId: 't1', subjectId: 's1', classId: 'c1', sectionId: null, effectiveEndDate: null },
      ],
      total: 1,
    });
    teachersService.getTeacherById.mockResolvedValue({ id: 't1', fullName: 'Ahmed' });
    classesService.getClassById.mockResolvedValue({ id: 'c1', name: 'F1A' });
    subjectsService.getSubjectById.mockResolvedValue({ id: 's1', name: 'Physics' });

    const result = await service.getAssignmentsGroupedByTeacher('school-1', {});

    const classEntry = result[0].subjects[0].classes[0];
    expect(classEntry).toEqual({ assignmentId: 'a1', classId: 'c1', className: 'F1A', sectionId: null });
  });
});

describe('correctAssignment (Business Rules #11, #24)', () => {
  it('leaves a field unchanged when absent from the body', async () => {
    repository.findById.mockResolvedValue({ id: 'a1', schoolId: 'school-1', effectiveEndDate: null });
    repository.update.mockResolvedValue({ id: 'a1', effectiveEndDate: null });

    await service.correctAssignment('school-1', 'a1', { endReason: 'typo fix' }, actingUser);

    expect(repository.update).toHaveBeenCalledWith('a1', { endReason: 'typo fix' });
  });

  it('treats setting a previously-unset effectiveEndDate as Ending, not Correcting', async () => {
    repository.findById.mockResolvedValue({ id: 'a1', schoolId: 'school-1', effectiveEndDate: null });
    repository.update.mockResolvedValue({ id: 'a1', effectiveEndDate: new Date('2026-06-01') });

    await service.correctAssignment('school-1', 'a1', { effectiveEndDate: '2026-06-01' }, actingUser);

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TEACHER_SUBJECT_ASSIGNMENT_ENDED' })
    );
  });

  it('treats adjusting an already-set effectiveEndDate as a Correction, not an Ending', async () => {
    repository.findById.mockResolvedValue({
      id: 'a1',
      schoolId: 'school-1',
      effectiveEndDate: new Date('2026-05-01'),
    });
    repository.update.mockResolvedValue({ id: 'a1', effectiveEndDate: new Date('2026-06-01') });

    await service.correctAssignment('school-1', 'a1', { effectiveEndDate: '2026-06-01' }, actingUser);

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TEACHER_SUBJECT_ASSIGNMENT_CORRECTED' })
    );
  });

  it('rejects clearing an already-set effectiveEndDate back to null (Business Rule #24)', async () => {
    repository.findById.mockResolvedValue({
      id: 'a1',
      schoolId: 'school-1',
      effectiveEndDate: new Date('2026-05-01'),
    });

    await expect(
      service.correctAssignment('school-1', 'a1', { effectiveEndDate: null }, actingUser)
    ).rejects.toThrow('Cannot clear an already-set effectiveEndDate — ending an assignment is one-way');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('is a no-op for an explicit null on an already-Active assignment (nothing actually changes)', async () => {
    repository.findById.mockResolvedValue({ id: 'a1', schoolId: 'school-1', effectiveEndDate: null });
    repository.update.mockResolvedValue({ id: 'a1', effectiveEndDate: null });

    await expect(
      service.correctAssignment('school-1', 'a1', { effectiveEndDate: null }, actingUser)
    ).resolves.toBeDefined();
  });
});

describe('replaceTeacher (Business Rule #9, Technical Design Review finding)', () => {
  const existingAssignment = {
    id: 'a1',
    schoolId: 'school-1',
    teacherId: 'old-teacher',
    subjectId: 'subject-1',
    classId: 'class-1',
    sectionId: null,
    academicYearId: 'ay-1',
    effectiveEndDate: null,
  };

  it('rejects replacing on a nonexistent or cross-school assignment', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(
      service.replaceTeacher('school-1', 'a1', { newTeacherId: 'teacher-1' }, actingUser)
    ).rejects.toThrow('Teacher Subject Assignment not found');
  });

  it('rejects replacing an assignment that is not currently Active', async () => {
    repository.findById.mockResolvedValue({ ...existingAssignment, effectiveEndDate: new Date('2026-03-01') });

    await expect(
      service.replaceTeacher('school-1', 'a1', { newTeacherId: 'teacher-1' }, actingUser)
    ).rejects.toThrow('Only an Active assignment may be replaced');
  });

  it('re-runs the full eligibility pipeline against the new Teacher, not merely swapping the id', async () => {
    repository.findById.mockResolvedValue(existingAssignment);
    teachersService.getTeacherById.mockResolvedValue({ ...ACTIVE_TEACHER, employmentStatus: 'RESIGNED' });

    // repository.update (ending the old assignment) and this rejection both
    // happen inside the same prisma.$transaction — a real DB rolls the whole
    // thing back atomically on this throw; what matters observably here is
    // that no replacement row is ever created.
    await expect(
      service.replaceTeacher('school-1', 'a1', { newTeacherId: 'teacher-1' }, actingUser)
    ).rejects.toThrow('Invalid Teacher');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('ends the existing assignment and creates a replacement atomically, carrying over Subject/Class/Section/Academic Year', async () => {
    repository.findById.mockResolvedValue(existingAssignment);
    repository.update.mockResolvedValue({ ...existingAssignment, effectiveEndDate: new Date('2026-04-01'), teacherId: 'old-teacher' });
    repository.create.mockResolvedValue({ id: 'a2', teacherId: 'teacher-1', effectiveEndDate: null });

    const result = await service.replaceTeacher(
      'school-1',
      'a1',
      { newTeacherId: 'teacher-1', effectiveEndDate: '2026-04-01', endReason: 'Replaced' },
      actingUser
    );

    expect(repository.update).toHaveBeenCalledWith(
      'a1',
      { effectiveEndDate: new Date('2026-04-01'), endReason: 'Replaced' },
      'MOCK_TX'
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        teacherId: 'teacher-1',
        subjectId: 'subject-1',
        classId: 'class-1',
        sectionId: null,
        academicYearId: 'ay-1',
      }),
      'MOCK_TX'
    );
    expect(result.status).toBe('ACTIVE');
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TEACHER_SUBJECT_ASSIGNMENT_TEACHER_REPLACED' })
    );
  });
});

describe('copyAssignments (Business Rules #12, #13)', () => {
  const source1 = {
    id: 'src-1',
    schoolId: 'school-1',
    academicYearId: 'from-year',
    teacherId: 'teacher-1',
    subjectId: 'subject-1',
    classId: 'class-1',
    sectionId: null,
  };
  const source2 = { ...source1, id: 'src-2' };

  beforeEach(() => {
    academicYearsService.getAcademicYearById.mockResolvedValue({
      ...ACTIVE_YEAR,
      id: 'to-year',
      startDate: new Date('2027-01-01'),
      endDate: new Date('2027-12-31'),
    });
  });

  it('copies a valid candidate and skips an invalid one without aborting the batch', async () => {
    repository.findById.mockImplementation((id) => {
      if (id === 'src-1') return Promise.resolve(source1);
      if (id === 'src-2') return Promise.resolve(source2);
      return Promise.resolve(null);
    });
    // src-1 succeeds; src-2 hits a duplicate on the second call only.
    repository.findActiveByScope
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'already-exists' });
    repository.create.mockResolvedValue({ id: 'copied-1', effectiveEndDate: null });

    const result = await service.copyAssignments(
      'school-1',
      { fromAcademicYearId: 'from-year', toAcademicYearId: 'to-year', assignmentIds: ['src-1', 'src-2'] },
      actingUser
    );

    expect(result.copied).toHaveLength(1);
    expect(result.copied[0].status).toBe('ACTIVE');
    expect(result.skipped).toEqual([
      {
        assignmentId: 'src-2',
        reason:
          'An Active Teacher Subject Assignment already exists for this School, Academic Year, Class, Section, and Subject combination',
      },
    ]);
  });

  it('skips a source assignment that does not belong to fromAcademicYearId', async () => {
    repository.findById.mockResolvedValue({ ...source1, academicYearId: 'a-different-year' });

    const result = await service.copyAssignments(
      'school-1',
      { fromAcademicYearId: 'from-year', toAcademicYearId: 'to-year', assignmentIds: ['src-1'] },
      actingUser
    );

    expect(result.copied).toHaveLength(0);
    expect(result.skipped[0].reason).toBe('Source Teacher Subject Assignment not found');
  });

  it('defaults each copied candidate\'s effectiveStartDate to the target Academic Year\'s own startDate', async () => {
    repository.findById.mockResolvedValue(source1);
    repository.findActiveByScope.mockResolvedValue(null);
    repository.create.mockResolvedValue({ id: 'copied-1', effectiveEndDate: null });

    await service.copyAssignments(
      'school-1',
      { fromAcademicYearId: 'from-year', toAcademicYearId: 'to-year', assignmentIds: ['src-1'] },
      actingUser
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ effectiveStartDate: new Date('2027-01-01') }),
      'MOCK_TX'
    );
  });
});

describe('getOwnAssignments (Business Rule #18, Teacher self-service)', () => {
  it('resolves teacherId strictly from the authenticated account, never a client-supplied value', async () => {
    teachersService.getOwnProfile.mockResolvedValue({ id: 'teacher-1', schoolId: 'school-1' });
    repository.listByTeacher.mockResolvedValue([{ id: 'a1', effectiveEndDate: null }]);

    const result = await service.getOwnAssignments('account-1', { academicYearId: 'ay-1' });

    expect(teachersService.getOwnProfile).toHaveBeenCalledWith('account-1');
    expect(repository.listByTeacher).toHaveBeenCalledWith('teacher-1', { academicYearId: 'ay-1' });
    expect(result[0].status).toBe('ACTIVE');
  });
});

describe('Subject Management dependency-validation registration (Business Rule #19)', () => {
  it('was registered under this feature\'s own name at module-load time', () => {
    expect(registeredRemovalCheckFn).toEqual(expect.any(Function));
  });

  it('reports a blocking reason when an Active assignment references the Subject', async () => {
    repository.findActiveBySubject.mockResolvedValue({ id: 'a1' });
    await expect(registeredRemovalCheckFn('school-1', 'subject-1')).resolves.toBe(
      'an active Teacher Subject Assignment references this Subject'
    );
  });

  it('reports no blocking reason when no Active assignment references the Subject', async () => {
    repository.findActiveBySubject.mockResolvedValue(null);
    await expect(registeredRemovalCheckFn('school-1', 'subject-1')).resolves.toBeNull();
  });
});

describe('getActiveTeacherIdsForSubjectAcrossClasses (Weekly Subject Allocation — new narrow interface)', () => {
  it('returns distinct Teacher ids across every matching assignment', async () => {
    repository.listActiveAssignmentsForSubjectAndClasses.mockResolvedValue([
      { teacherId: 'teacher-1' },
      { teacherId: 'teacher-2' },
      { teacherId: 'teacher-1' },
    ]);

    const result = await service.getActiveTeacherIdsForSubjectAcrossClasses(
      'school-1',
      'subject-1',
      ['class-1', 'class-2'],
      'ay-1'
    );

    expect(result).toEqual(['teacher-1', 'teacher-2']);
    expect(repository.listActiveAssignmentsForSubjectAndClasses).toHaveBeenCalledWith(
      'school-1',
      'subject-1',
      ['class-1', 'class-2'],
      'ay-1'
    );
  });

  it('returns an empty array without querying when classIds is empty', async () => {
    const result = await service.getActiveTeacherIdsForSubjectAcrossClasses('school-1', 'subject-1', [], 'ay-1');

    expect(result).toEqual([]);
    expect(repository.listActiveAssignmentsForSubjectAndClasses).not.toHaveBeenCalled();
  });
});

describe('getTeacherWeeklyCommitmentAndCapacity (Timetable generation pre-flight — Teacher weekly capacity Hard Constraint)', () => {
  it('sums weeklyPeriods across every Active assignment, skipping Ended ones and lines missing from Weekly Subject Allocation', async () => {
    repository.listBySchool.mockResolvedValue({
      assignments: [
        { id: 'a1', teacherId: 'teacher-1', classId: 'class-1', subjectId: 'subject-1', effectiveEndDate: null },
        { id: 'a2', teacherId: 'teacher-1', classId: 'class-1', subjectId: 'subject-2', effectiveEndDate: null },
        { id: 'a3', teacherId: 'teacher-1', classId: 'class-1', subjectId: 'subject-3', effectiveEndDate: new Date('2026-01-01') },
      ],
      total: 3,
    });
    weeklySubjectAllocationsService.getWeeklyPeriodsForAssignment.mockImplementation((schoolId, classId, academicYearId, subjectId) => {
      if (subjectId === 'subject-1') return Promise.resolve({ weeklyPeriods: 20, doublePeriodRequired: false });
      if (subjectId === 'subject-2') return Promise.resolve(null);
      return Promise.resolve({ weeklyPeriods: 999, doublePeriodRequired: false });
    });
    classesService.getClassById.mockResolvedValue({ id: 'class-1', shiftId: 'shift-1' });
    schoolScheduleService.getWorkingDays.mockResolvedValue(['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY']);
    schoolScheduleService.getShiftPeriods.mockResolvedValue([
      { type: 'TEACHING' },
      { type: 'TEACHING' },
      { type: 'BREAK' },
    ]);

    const result = await service.getTeacherWeeklyCommitmentAndCapacity('school-1', 'teacher-1', 'ay-1');

    // committed: 20 (subject-1) + 0 (subject-2, no allocation line) — the
    // Ended assignment (subject-3) is never even looked up.
    expect(result.committed).toBe(20);
    // capacity: 5 working days x 2 Teaching Periods (the Break excluded).
    expect(result.capacity).toBe(10);
    expect(weeklySubjectAllocationsService.getWeeklyPeriodsForAssignment).not.toHaveBeenCalledWith(
      'school-1',
      'class-1',
      'ay-1',
      'subject-3'
    );
  });

  it('sums capacity once per distinct Shift, never double-counting two Classes on the same Shift', async () => {
    repository.listBySchool.mockResolvedValue({
      assignments: [
        { id: 'a1', teacherId: 'teacher-1', classId: 'class-1', subjectId: 'subject-1', effectiveEndDate: null },
        { id: 'a2', teacherId: 'teacher-1', classId: 'class-2', subjectId: 'subject-2', effectiveEndDate: null },
      ],
      total: 2,
    });
    weeklySubjectAllocationsService.getWeeklyPeriodsForAssignment.mockResolvedValue({ weeklyPeriods: 5, doublePeriodRequired: false });
    classesService.getClassById.mockImplementation((classId) =>
      Promise.resolve({ id: classId, shiftId: classId === 'class-2' ? 'shift-2' : 'shift-1' })
    );
    schoolScheduleService.getWorkingDays.mockResolvedValue(['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY']);
    schoolScheduleService.getShiftPeriods.mockResolvedValue([{ type: 'TEACHING' }]);

    const result = await service.getTeacherWeeklyCommitmentAndCapacity('school-1', 'teacher-1', 'ay-1');

    expect(result.committed).toBe(10);
    // Two distinct Shifts, each contributing 5 working days x 1 Teaching Period.
    expect(result.capacity).toBe(10);
    expect(schoolScheduleService.getShiftPeriods).toHaveBeenCalledTimes(2);
  });

  it('returns zero committed and zero capacity when the Teacher has no Active assignments', async () => {
    repository.listBySchool.mockResolvedValue({ assignments: [], total: 0 });
    schoolScheduleService.getWorkingDays.mockResolvedValue(['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY']);

    const result = await service.getTeacherWeeklyCommitmentAndCapacity('school-1', 'teacher-1', 'ay-1');

    expect(result).toEqual({ committed: 0, capacity: 0 });
    expect(schoolScheduleService.getShiftPeriods).not.toHaveBeenCalled();
  });
});
