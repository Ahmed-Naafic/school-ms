jest.mock('./timetable.repository');
jest.mock('../../shared/audit');
jest.mock('../teacher-subject-assignments/teacher-subject-assignments.service');
jest.mock('../school-schedule/school-schedule.service');
jest.mock('../classes/classes.service');
jest.mock('../teachers/teachers.service');
jest.mock('../subjects/subjects.service');
jest.mock('../academic-years/academic-years.service');
jest.mock('../weekly-subject-allocations/weekly-subject-allocations.service');
// Every Lesson write wraps its entire read-decide-write sequence in
// prisma.$transaction, acquiring the per-school advisory lock as the first
// statement — mirroring every other feature's own service-test fix, with a
// fake transaction runner invoking the callback synchronously.
jest.mock('../../config/database', () => ({
  $transaction: jest.fn((callback) => callback('MOCK_TX')),
}));

const repository = require('./timetable.repository');
const { recordAuditEvent } = require('../../shared/audit');
const teacherSubjectAssignmentsService = require('../teacher-subject-assignments/teacher-subject-assignments.service');
const schoolScheduleService = require('../school-schedule/school-schedule.service');
const classesService = require('../classes/classes.service');
const teachersService = require('../teachers/teachers.service');
const subjectsService = require('../subjects/subjects.service');
const academicYearsService = require('../academic-years/academic-years.service');
const weeklySubjectAllocationsService = require('../weekly-subject-allocations/weekly-subject-allocations.service');
const service = require('./timetable.service');

const actingUser = { id: 'admin-1', schoolId: 'school-1' };

function activeAssignment(overrides = {}) {
  return {
    id: 'assignment-1',
    schoolId: 'school-1',
    academicYearId: 'year-1',
    teacherId: 'teacher-1',
    subjectId: 'subject-1',
    classId: 'class-1',
    sectionId: null,
    status: 'ACTIVE',
    ...overrides,
  };
}

function activePeriod(overrides = {}) {
  return {
    id: 'period-1',
    shiftId: 'shift-1',
    name: 'Period 1',
    type: 'TEACHING',
    status: 'ACTIVE',
    ...overrides,
  };
}

function draftVersion(overrides = {}) {
  return { id: 'draft-1', schoolId: 'school-1', academicYearId: 'year-1', status: 'DRAFT', ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  teacherSubjectAssignmentsService.getAssignmentById.mockResolvedValue(activeAssignment());
  schoolScheduleService.getPeriodById.mockResolvedValue(activePeriod());
  classesService.getClassById.mockResolvedValue({ id: 'class-1', schoolId: 'school-1', shiftId: 'shift-1', name: 'Grade 1' });
  academicYearsService.getCurrentAcademicYear.mockResolvedValue({ id: 'year-1' });
  repository.findActiveByTeacherSlot.mockResolvedValue(null);
  repository.findActiveByClassSlot.mockResolvedValue(null);
  repository.countActiveByAssignment.mockResolvedValue(0);
  repository.findDraftVersion.mockResolvedValue(draftVersion());
  repository.findPublishedVersion.mockResolvedValue(null);
  repository.createVersion.mockResolvedValue(draftVersion());
  repository.findTeacherPreference.mockResolvedValue(null);
  weeklySubjectAllocationsService.getWeeklyPeriodsForAssignment.mockResolvedValue(null);
});

describe('getOrCreateDraftVersion (Architecture Update)', () => {
  it('reuses an existing Draft rather than creating a second one', async () => {
    repository.createLesson.mockResolvedValue({ id: 'lesson-1' });
    await service.createLesson(
      'school-1',
      { teacherSubjectAssignmentId: 'assignment-1', dayOfWeek: 'MONDAY', periodId: 'period-1' },
      actingUser
    );
    expect(repository.createVersion).not.toHaveBeenCalled();
  });

  it('creates a Draft lazily on first write when none exists yet', async () => {
    repository.findDraftVersion.mockResolvedValue(null);
    repository.createLesson.mockResolvedValue({ id: 'lesson-1' });

    await service.createLesson(
      'school-1',
      { teacherSubjectAssignmentId: 'assignment-1', dayOfWeek: 'MONDAY', periodId: 'period-1' },
      actingUser
    );

    expect(repository.createVersion).toHaveBeenCalledWith(
      { schoolId: 'school-1', academicYearId: 'year-1', status: 'DRAFT' },
      'MOCK_TX'
    );
  });
});

describe('createLesson (Business Rules #3-#10, v2.0 numbering)', () => {
  const payload = { teacherSubjectAssignmentId: 'assignment-1', dayOfWeek: 'MONDAY', periodId: 'period-1' };

  it('creates successfully, copying classId/teacherId/academicYearId from the Assignment and the resolved Draft version', async () => {
    repository.createLesson.mockResolvedValue({ id: 'lesson-1', ...payload, schoolId: 'school-1' });

    const result = await service.createLesson('school-1', payload, actingUser);

    expect(repository.createLesson).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-1',
        academicYearId: 'year-1',
        timetableVersionId: 'draft-1',
        classId: 'class-1',
        teacherId: 'teacher-1',
        teacherSubjectAssignmentId: 'assignment-1',
        dayOfWeek: 'MONDAY',
        periodId: 'period-1',
        status: 'ACTIVE',
      }),
      'MOCK_TX'
    );
    expect(result.id).toBe('lesson-1');
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'LESSON_CREATED' }));
  });

  it('rejects an invalid dayOfWeek', async () => {
    await expect(
      service.createLesson('school-1', { ...payload, dayOfWeek: 'FUNDAY' }, actingUser)
    ).rejects.toThrow('Invalid Day');
  });

  it('rejects a missing Teacher Subject Assignment', async () => {
    teacherSubjectAssignmentsService.getAssignmentById.mockResolvedValue(null);
    await expect(service.createLesson('school-1', payload, actingUser)).rejects.toThrow('Invalid Teacher Subject Assignment');
  });

  it('rejects an Ended (non-Active) Teacher Subject Assignment', async () => {
    teacherSubjectAssignmentsService.getAssignmentById.mockResolvedValue(activeAssignment({ status: 'ENDED' }));
    await expect(service.createLesson('school-1', payload, actingUser)).rejects.toThrow('Invalid Teacher Subject Assignment');
  });

  it('rejects when the Assignment is already at its own weekly target from Weekly Subject Allocation', async () => {
    weeklySubjectAllocationsService.getWeeklyPeriodsForAssignment.mockResolvedValue({ weeklyPeriods: 2, doublePeriodRequired: false });
    repository.countActiveByAssignment.mockResolvedValue(2);
    await expect(service.createLesson('school-1', payload, actingUser)).rejects.toThrow('weekly target');
  });

  it('allows scheduling below the weekly target', async () => {
    weeklySubjectAllocationsService.getWeeklyPeriodsForAssignment.mockResolvedValue({ weeklyPeriods: 2, doublePeriodRequired: false });
    repository.countActiveByAssignment.mockResolvedValue(1);
    repository.createLesson.mockResolvedValue({ id: 'lesson-1' });
    await expect(service.createLesson('school-1', payload, actingUser)).resolves.toBeDefined();
  });

  it('rejects a Break Period (Break Period protection)', async () => {
    schoolScheduleService.getPeriodById.mockResolvedValue(activePeriod({ type: 'BREAK' }));
    await expect(service.createLesson('school-1', payload, actingUser)).rejects.toThrow('Break Period');
  });

  it('rejects a missing/inactive Period', async () => {
    schoolScheduleService.getPeriodById.mockResolvedValue(null);
    await expect(service.createLesson('school-1', payload, actingUser)).rejects.toThrow('Invalid Period');
  });

  it('rejects a Period whose Shift does not match the Class\'s own assigned Shift (Shift compatibility)', async () => {
    classesService.getClassById.mockResolvedValue({ id: 'class-1', schoolId: 'school-1', shiftId: 'shift-2', name: 'Grade 1' });
    await expect(service.createLesson('school-1', payload, actingUser)).rejects.toThrow('Shift');
  });

  it('rejects a Teacher conflict (Business Rule #6)', async () => {
    repository.findActiveByTeacherSlot.mockResolvedValue({ id: 'other-lesson' });
    await expect(service.createLesson('school-1', payload, actingUser)).rejects.toThrow('Teacher already has an active Lesson');
  });

  it('rejects a Class conflict (Business Rule #7)', async () => {
    repository.findActiveByClassSlot.mockResolvedValue({ id: 'other-lesson' });
    await expect(service.createLesson('school-1', payload, actingUser)).rejects.toThrow('Class already has an active Lesson');
  });

  it('rejects a slot on the Teacher\'s own recorded unavailable list (Hard Constraint, distinct from soft avoidPeriods)', async () => {
    repository.findTeacherPreference.mockResolvedValue({ unavailableSlots: [{ dayOfWeek: 'MONDAY', periodId: 'period-1' }] });
    await expect(service.createLesson('school-1', payload, actingUser)).rejects.toThrow('unavailable');
  });
});

describe('updateLesson (Business Rule #13, v2.0 numbering — same pipeline, excludes its own prior slot)', () => {
  it('excludes the Lesson\'s own id from the Teacher/Class conflict checks', async () => {
    repository.findLessonById.mockResolvedValue({ id: 'lesson-1', schoolId: 'school-1', locked: false, lessonGroupId: null });
    repository.updateLesson.mockResolvedValue({ id: 'lesson-1' });

    await service.updateLesson(
      'school-1',
      'lesson-1',
      { teacherSubjectAssignmentId: 'assignment-1', dayOfWeek: 'TUESDAY', periodId: 'period-1' },
      actingUser
    );

    expect(repository.findActiveByTeacherSlot).toHaveBeenCalledWith(
      expect.objectContaining({ excludeLessonId: 'lesson-1', timetableVersionId: 'draft-1' }),
      'MOCK_TX'
    );
    expect(repository.findActiveByClassSlot).toHaveBeenCalledWith(
      expect.objectContaining({ excludeLessonId: 'lesson-1', timetableVersionId: 'draft-1' }),
      'MOCK_TX'
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'LESSON_UPDATED' }));
  });

  it('rejects moving into a slot that conflicts with a different Lesson', async () => {
    repository.findLessonById.mockResolvedValue({ id: 'lesson-1', schoolId: 'school-1', locked: false, lessonGroupId: null });
    repository.findActiveByTeacherSlot.mockResolvedValue({ id: 'other-lesson' });

    await expect(
      service.updateLesson(
        'school-1',
        'lesson-1',
        { teacherSubjectAssignmentId: 'assignment-1', dayOfWeek: 'TUESDAY', periodId: 'period-1' },
        actingUser
      )
    ).rejects.toThrow('Teacher already has an active Lesson');
  });

  it('rejects moving a Locked Lesson (Architecture Update — Hard Constraint)', async () => {
    repository.findLessonById.mockResolvedValue({ id: 'lesson-1', schoolId: 'school-1', locked: true, lessonGroupId: null });

    await expect(
      service.updateLesson(
        'school-1',
        'lesson-1',
        { teacherSubjectAssignmentId: 'assignment-1', dayOfWeek: 'TUESDAY', periodId: 'period-1' },
        actingUser
      )
    ).rejects.toThrow('Locked');
    expect(repository.updateLesson).not.toHaveBeenCalled();
  });
});

describe('archiveLesson / reactivateLesson', () => {
  it('archives an Active Lesson', async () => {
    repository.findLessonById.mockResolvedValue({ id: 'lesson-1', schoolId: 'school-1', status: 'ACTIVE', locked: false });
    repository.updateLesson.mockResolvedValue({ id: 'lesson-1', status: 'ARCHIVED' });

    const result = await service.archiveLesson('school-1', 'lesson-1', actingUser);

    expect(repository.updateLesson).toHaveBeenCalledWith('lesson-1', { status: 'ARCHIVED' }, 'MOCK_TX');
    expect(result.status).toBe('ARCHIVED');
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'LESSON_ARCHIVED' }));
  });

  it('rejects archiving a Locked Lesson', async () => {
    repository.findLessonById.mockResolvedValue({ id: 'lesson-1', schoolId: 'school-1', status: 'ACTIVE', locked: true });
    await expect(service.archiveLesson('school-1', 'lesson-1', actingUser)).rejects.toThrow('Locked');
  });

  it('is a no-op on an already-Archived Lesson', async () => {
    repository.findLessonById.mockResolvedValue({ id: 'lesson-1', schoolId: 'school-1', status: 'ARCHIVED', locked: false });
    await service.archiveLesson('school-1', 'lesson-1', actingUser);
    expect(repository.updateLesson).not.toHaveBeenCalled();
  });

  it('reactivateLesson re-validates the full pipeline against current state (Business Rule #13, v2.0 numbering)', async () => {
    repository.findLessonById.mockResolvedValue({
      id: 'lesson-1',
      schoolId: 'school-1',
      status: 'ARCHIVED',
      locked: false,
      teacherSubjectAssignmentId: 'assignment-1',
      dayOfWeek: 'MONDAY',
      periodId: 'period-1',
      timetableVersionId: 'draft-1',
    });
    repository.findActiveByClassSlot.mockResolvedValue({ id: 'since-taken-lesson' });

    await expect(service.reactivateLesson('school-1', 'lesson-1', actingUser)).rejects.toThrow(
      'Class already has an active Lesson'
    );
    expect(repository.updateLesson).not.toHaveBeenCalled();
  });

  it('reactivates successfully when the slot is still free', async () => {
    repository.findLessonById.mockResolvedValue({
      id: 'lesson-1',
      schoolId: 'school-1',
      status: 'ARCHIVED',
      locked: false,
      teacherSubjectAssignmentId: 'assignment-1',
      dayOfWeek: 'MONDAY',
      periodId: 'period-1',
      timetableVersionId: 'draft-1',
    });
    repository.updateLesson.mockResolvedValue({ id: 'lesson-1', status: 'ACTIVE' });

    await service.reactivateLesson('school-1', 'lesson-1', actingUser);
    expect(repository.updateLesson).toHaveBeenCalledWith('lesson-1', { status: 'ACTIVE' }, 'MOCK_TX');
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'LESSON_REACTIVATED' }));
  });
});

describe('Locking (Architecture Update)', () => {
  it('lockLesson sets locked true and audits it', async () => {
    repository.findLessonById.mockResolvedValue({ id: 'lesson-1', schoolId: 'school-1', lessonGroupId: null });
    repository.updateLesson.mockResolvedValue({ id: 'lesson-1', locked: true });

    await service.lockLesson('school-1', 'lesson-1', actingUser);

    expect(repository.updateLesson).toHaveBeenCalledWith('lesson-1', { locked: true }, 'MOCK_TX');
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'LESSON_LOCKED' }));
  });

  it('locking a grouped Lesson locks every member of its Group', async () => {
    repository.findLessonById
      .mockResolvedValueOnce({ id: 'lesson-1', schoolId: 'school-1', lessonGroupId: 'group-1' })
      .mockResolvedValueOnce({ id: 'lesson-1', schoolId: 'school-1', lessonGroupId: 'group-1', locked: true });
    repository.findLessonGroupById.mockResolvedValue({
      id: 'group-1',
      schoolId: 'school-1',
      lessons: [{ id: 'lesson-1' }, { id: 'lesson-2' }],
    });

    await service.lockLesson('school-1', 'lesson-1', actingUser);

    expect(repository.updateLesson).toHaveBeenCalledWith('lesson-1', { locked: true }, 'MOCK_TX');
    expect(repository.updateLesson).toHaveBeenCalledWith('lesson-2', { locked: true }, 'MOCK_TX');
  });

  it('unlockLesson sets locked false and audits it', async () => {
    repository.findLessonById.mockResolvedValue({ id: 'lesson-1', schoolId: 'school-1', lessonGroupId: null });
    repository.updateLesson.mockResolvedValue({ id: 'lesson-1', locked: false });

    await service.unlockLesson('school-1', 'lesson-1', actingUser);

    expect(repository.updateLesson).toHaveBeenCalledWith('lesson-1', { locked: false }, 'MOCK_TX');
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'LESSON_UNLOCKED' }));
  });
});

describe('Lesson Groups / Split (Architecture Update)', () => {
  it('splitLessonGroup clears the grouping link on both members and deletes the group', async () => {
    repository.findLessonGroupById.mockResolvedValue({
      id: 'group-1',
      schoolId: 'school-1',
      lessons: [{ id: 'lesson-1' }, { id: 'lesson-2' }],
    });

    await service.splitLessonGroup('school-1', 'group-1', actingUser);

    expect(repository.updateLesson).toHaveBeenCalledWith('lesson-1', { lessonGroupId: null, sequenceInGroup: null }, 'MOCK_TX');
    expect(repository.updateLesson).toHaveBeenCalledWith('lesson-2', { lessonGroupId: null, sequenceInGroup: null }, 'MOCK_TX');
    expect(repository.deleteLessonGroup).toHaveBeenCalledWith('group-1', 'MOCK_TX');
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'LESSON_GROUP_SPLIT' }));
  });

  it('rejects a cross-school Lesson Group', async () => {
    repository.findLessonGroupById.mockResolvedValue({ id: 'group-1', schoolId: 'other-school', lessons: [] });
    await expect(service.splitLessonGroup('school-1', 'group-1', actingUser)).rejects.toThrow('not found');
  });
});

describe('Publish (Architecture Update)', () => {
  it('rejects publishing when no Draft exists', async () => {
    repository.findDraftVersion.mockResolvedValue(null);
    await expect(service.publishTimetableVersion('school-1', 'year-1', actingUser)).rejects.toThrow('no Draft');
  });

  it('archives the current Published version and promotes the Draft', async () => {
    repository.findDraftVersion.mockResolvedValue(draftVersion());
    repository.findPublishedVersion.mockResolvedValue({ id: 'published-old', status: 'PUBLISHED' });
    repository.updateVersion.mockImplementation((id, data) => Promise.resolve({ id, ...data }));

    const result = await service.publishTimetableVersion('school-1', 'year-1', actingUser);

    expect(repository.updateVersion).toHaveBeenCalledWith('published-old', { status: 'ARCHIVED' }, 'MOCK_TX');
    expect(repository.updateVersion).toHaveBeenCalledWith(
      'draft-1',
      expect.objectContaining({ status: 'PUBLISHED' }),
      'MOCK_TX'
    );
    expect(result.status).toBe('PUBLISHED');
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'TIMETABLE_PUBLISHED' }));
  });

  it('promotes the Draft directly when no Published version exists yet', async () => {
    repository.findDraftVersion.mockResolvedValue(draftVersion());
    repository.findPublishedVersion.mockResolvedValue(null);
    repository.updateVersion.mockImplementation((id, data) => Promise.resolve({ id, ...data }));

    await service.publishTimetableVersion('school-1', 'year-1', actingUser);

    expect(repository.updateVersion).toHaveBeenCalledTimes(1);
    expect(repository.updateVersion).toHaveBeenCalledWith(
      'draft-1',
      expect.objectContaining({ status: 'PUBLISHED' }),
      'MOCK_TX'
    );
  });
});

describe('View assembly (Architecture Update — version-scoped)', () => {
  beforeEach(() => {
    teachersService.getTeacherById.mockResolvedValue({ id: 'teacher-1', fullName: 'Jane Doe' });
    subjectsService.getSubjectById.mockResolvedValue({ id: 'subject-1', name: 'Mathematics' });
  });

  it('getClassTimetable rejects a cross-school Class', async () => {
    classesService.getClassById.mockResolvedValue({ id: 'class-1', schoolId: 'other-school' });
    await expect(service.getClassTimetable('school-1', 'class-1')).rejects.toThrow('Class not found');
  });

  it('getClassTimetable returns enriched Lessons for a valid Class, reading the Draft by default', async () => {
    repository.listLessonsByClassAndVersion.mockResolvedValue([
      { id: 'lesson-1', schoolId: 'school-1', classId: 'class-1', teacherId: 'teacher-1', teacherSubjectAssignmentId: 'assignment-1', periodId: 'period-1', dayOfWeek: 'MONDAY', status: 'ACTIVE' },
    ]);

    const result = await service.getClassTimetable('school-1', 'class-1');
    expect(repository.listLessonsByClassAndVersion).toHaveBeenCalledWith('class-1', 'draft-1', { includeArchived: false });
    expect(result).toHaveLength(1);
    expect(result[0].teacher.fullName).toBe('Jane Doe');
    expect(result[0].subject.name).toBe('Mathematics');
  });

  it('getClassTimetable returns an empty array when the requested Version does not exist yet', async () => {
    repository.findDraftVersion.mockResolvedValue(null);
    const result = await service.getClassTimetable('school-1', 'class-1');
    expect(result).toEqual([]);
  });

  it('getTeacherTimetable rejects a nonexistent Teacher', async () => {
    teachersService.getTeacherById.mockResolvedValue(null);
    await expect(service.getTeacherTimetable('school-1', 'teacher-x')).rejects.toThrow('Teacher not found');
  });

  it('getMasterTimetable groups Lessons by Class', async () => {
    repository.listLessonsByVersion.mockResolvedValue([
      { id: 'lesson-1', schoolId: 'school-1', classId: 'class-1', teacherId: 'teacher-1', teacherSubjectAssignmentId: 'assignment-1', periodId: 'period-1', dayOfWeek: 'MONDAY', status: 'ACTIVE' },
    ]);

    const result = await service.getMasterTimetable('school-1');
    expect(result).toHaveLength(1);
    expect(result[0].class.id).toBe('class-1');
    expect(result[0].lessons).toHaveLength(1);
  });

  it('getMasterTimetable reads the Published version when explicitly requested', async () => {
    repository.findPublishedVersion.mockResolvedValue({ id: 'published-1', status: 'PUBLISHED' });
    repository.listLessonsByVersion.mockResolvedValue([]);

    await service.getMasterTimetable('school-1', { versionType: 'PUBLISHED' });
    expect(repository.listLessonsByVersion).toHaveBeenCalledWith('published-1', { includeArchived: false });
  });
});

describe('Stable Public Service Interface (Architecture Update — reads the Published version only)', () => {
  it('getLessonById returns null for a cross-school id', async () => {
    repository.findLessonById.mockResolvedValue({ id: 'lesson-1', schoolId: 'other-school' });
    await expect(service.getLessonById('school-1', 'lesson-1')).resolves.toBeNull();
  });

  it('validateLesson is true only for an Active Lesson belonging to the school', async () => {
    repository.findLessonById.mockResolvedValue({ id: 'lesson-1', schoolId: 'school-1', status: 'ARCHIVED' });
    await expect(service.validateLesson('school-1', 'lesson-1')).resolves.toBe(false);

    repository.findLessonById.mockResolvedValue({ id: 'lesson-1', schoolId: 'school-1', status: 'ACTIVE' });
    await expect(service.validateLesson('school-1', 'lesson-1')).resolves.toBe(true);
  });

  it('getLessonsForClass returns an empty array when no Published version exists', async () => {
    repository.findPublishedVersion.mockResolvedValue(null);
    await expect(service.getLessonsForClass('school-1', 'class-1')).resolves.toEqual([]);
  });

  it('getLessonsForClass reads the Published version, never the Draft', async () => {
    repository.findPublishedVersion.mockResolvedValue({ id: 'published-1' });
    repository.listLessonsByClassAndVersion.mockResolvedValue([{ id: 'lesson-1', status: 'ACTIVE' }]);

    await service.getLessonsForClass('school-1', 'class-1');
    expect(repository.listLessonsByClassAndVersion).toHaveBeenCalledWith('class-1', 'published-1', { includeArchived: true });
  });

  it('countActiveLessonsForAssignment delegates to the repository', async () => {
    repository.countActiveByAssignment.mockResolvedValue(3);
    await expect(service.countActiveLessonsForAssignment('school-1', 'assignment-1', 'draft-1')).resolves.toBe(3);
  });
});

describe('Preferences and Optimization Settings (pure data, no enforcement on their own)', () => {
  it('updateTeacherPreference stores whatever is given, without validating it against any Lesson', async () => {
    teachersService.getTeacherById.mockResolvedValue({ id: 'teacher-1' });
    repository.upsertTeacherPreference.mockResolvedValue({ id: 'pref-1' });

    await service.updateTeacherPreference('school-1', 'teacher-1', { maxLessonsPerDay: 4 }, actingUser);

    expect(repository.upsertTeacherPreference).toHaveBeenCalledWith('school-1', 'teacher-1', { maxLessonsPerDay: 4 });
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'TEACHER_SCHEDULE_PREFERENCE_UPDATED' }));
  });

  it('updateOptimizationSettings updates in place', async () => {
    repository.updateOptimizationSettings.mockResolvedValue({ balanceTeacherWorkloads: true });
    await service.updateOptimizationSettings('school-1', { balanceTeacherWorkloads: true }, actingUser);
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'SCHOOL_OPTIMIZATION_SETTINGS_UPDATED' }));
  });
});

describe('Timetable Quality Score (delegates to timetable.generation.js)', () => {
  it('returns the empty score when no Version exists yet', async () => {
    repository.findDraftVersion.mockResolvedValue(null);
    const result = await service.getTimetableQualityScore('school-1');
    expect(result.illustrative).toBe(true);
    expect(result.overallQuality).toBeNull();
  });

  it('never mutates any stored data', async () => {
    repository.listLessonsByVersion.mockResolvedValue([]);
    teacherSubjectAssignmentsService.listAssignments.mockResolvedValue({ assignments: [] });
    await service.getTimetableQualityScore('school-1');
    expect(repository.updateLesson).not.toHaveBeenCalled();
    expect(repository.upsertTeacherPreference).not.toHaveBeenCalled();
  });
});
