jest.mock('./schools.repository');
jest.mock('../../shared/audit');
jest.mock('../auth/auth.service');
jest.mock('../school-schedule/school-schedule.service');
jest.mock('../timetable/timetable.service');
jest.mock('../classes/classes.service');
jest.mock('../subjects/subjects.service');

const repository = require('./schools.repository');
const { recordAuditEvent } = require('../../shared/audit');
const authService = require('../auth/auth.service');
const schoolScheduleService = require('../school-schedule/school-schedule.service');
const timetableService = require('../timetable/timetable.service');
const classesService = require('../classes/classes.service');
const subjectsService = require('../subjects/subjects.service');
const service = require('./schools.service');

const actingUser = { id: 'super-1', role: 'SUPER_ADMIN' };

beforeEach(() => {
  jest.clearAllMocks();
  schoolScheduleService.createDefaultScheduleForSchool.mockResolvedValue({ id: 'shift-1' });
  timetableService.createDefaultOptimizationSettingsForSchool.mockResolvedValue({ id: 'settings-1' });
  // (ACR-009, Architecture Update — Grade/Form)
  classesService.createDefaultGradeLevelForSchool.mockResolvedValue({ id: 'grade-level-1' });
});

describe('createSchool (Business Rules #1, #2, #16)', () => {
  it('rejects a duplicate school name', async () => {
    repository.findByName.mockResolvedValue({ id: 'existing' });

    await expect(
      service.createSchool({ name: 'Existing School', firstSchoolAdminEmail: 'a@example.com' }, actingUser)
    ).rejects.toThrow('A school with this name already exists');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('creates the school and its first School Admin account together', async () => {
    repository.findByName.mockResolvedValue(null);
    repository.create.mockResolvedValue({ id: 'school-1', name: 'New School', educationLevels: ['PRIMARY'] });
    authService.createInitialSchoolAdmin.mockResolvedValue({
      account: { id: 'admin-account-1' },
      temporaryPassword: 'TempPass1234',
    });

    const result = await service.createSchool(
      { name: 'New School', firstSchoolAdminEmail: 'admin@example.com' },
      actingUser
    );

    expect(result.initialSchoolAdmin).toEqual({ email: 'admin@example.com', temporaryPassword: 'TempPass1234' });
    expect(repository.create).toHaveBeenCalledWith({ name: 'New School' });
    expect(schoolScheduleService.createDefaultScheduleForSchool).toHaveBeenCalledWith('school-1', actingUser);
    expect(timetableService.createDefaultOptimizationSettingsForSchool).toHaveBeenCalledWith('school-1');
    expect(classesService.createDefaultGradeLevelForSchool).toHaveBeenCalledWith('school-1', 'PRIMARY');
    expect(authService.createInitialSchoolAdmin).toHaveBeenCalledWith({
      email: 'admin@example.com',
      schoolId: 'school-1',
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'SCHOOL_CREATED' }));
  });

  it('creates the default School Calendar/Shift and Optimization Settings before the first School Admin account', async () => {
    repository.findByName.mockResolvedValue(null);
    repository.create.mockResolvedValue({ id: 'school-1', name: 'New School', educationLevels: ['PRIMARY'] });
    authService.createInitialSchoolAdmin.mockResolvedValue({ id: 'admin-account-1' });

    const callOrder = [];
    schoolScheduleService.createDefaultScheduleForSchool.mockImplementation(async () => {
      callOrder.push('schedule');
      return { id: 'shift-1' };
    });
    timetableService.createDefaultOptimizationSettingsForSchool.mockImplementation(async () => {
      callOrder.push('optimization-settings');
      return { id: 'settings-1' };
    });
    classesService.createDefaultGradeLevelForSchool.mockImplementation(async () => {
      callOrder.push('grade-level');
      return { id: 'grade-level-1' };
    });
    authService.createInitialSchoolAdmin.mockImplementation(async () => {
      callOrder.push('admin');
      return { id: 'admin-account-1' };
    });

    await service.createSchool({ name: 'New School', firstSchoolAdminEmail: 'admin@example.com' }, actingUser);

    expect(callOrder).toEqual(['schedule', 'optimization-settings', 'grade-level', 'admin']);
  });
});

describe('createSchool orphan-rollback (regression)', () => {
  it('deletes the just-created School if the mandatory first School Admin account fails to be created', async () => {
    repository.findByName.mockResolvedValue(null);
    repository.create.mockResolvedValue({ id: 'school-1', name: 'New School', educationLevels: ['PRIMARY'] });
    authService.createInitialSchoolAdmin.mockRejectedValue(new Error('email already exists'));

    await expect(
      service.createSchool({ name: 'New School', firstSchoolAdminEmail: 'taken@example.com' }, actingUser)
    ).rejects.toThrow('email already exists');

    expect(repository.hardDeleteIncompleteSchool).toHaveBeenCalledWith('school-1');
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it('deletes the just-created School if the default School Calendar/Shift fails to be created', async () => {
    repository.findByName.mockResolvedValue(null);
    repository.create.mockResolvedValue({ id: 'school-1', name: 'New School', educationLevels: ['PRIMARY'] });
    schoolScheduleService.createDefaultScheduleForSchool.mockRejectedValue(new Error('unexpected failure'));

    await expect(
      service.createSchool({ name: 'New School', firstSchoolAdminEmail: 'admin@example.com' }, actingUser)
    ).rejects.toThrow('unexpected failure');

    expect(repository.hardDeleteIncompleteSchool).toHaveBeenCalledWith('school-1');
    expect(authService.createInitialSchoolAdmin).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it('deletes the just-created School if the default School Optimization Settings fail to be created', async () => {
    repository.findByName.mockResolvedValue(null);
    repository.create.mockResolvedValue({ id: 'school-1', name: 'New School', educationLevels: ['PRIMARY'] });
    timetableService.createDefaultOptimizationSettingsForSchool.mockRejectedValue(new Error('unexpected failure'));

    await expect(
      service.createSchool({ name: 'New School', firstSchoolAdminEmail: 'admin@example.com' }, actingUser)
    ).rejects.toThrow('unexpected failure');

    expect(repository.hardDeleteIncompleteSchool).toHaveBeenCalledWith('school-1');
    expect(authService.createInitialSchoolAdmin).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  // (ACR-009, Architecture Update — Grade/Form)
  it('deletes the just-created School if the default GradeLevel fails to be created', async () => {
    repository.findByName.mockResolvedValue(null);
    repository.create.mockResolvedValue({ id: 'school-1', name: 'New School', educationLevels: ['PRIMARY'] });
    classesService.createDefaultGradeLevelForSchool.mockRejectedValue(new Error('unexpected failure'));

    await expect(
      service.createSchool({ name: 'New School', firstSchoolAdminEmail: 'admin@example.com' }, actingUser)
    ).rejects.toThrow('unexpected failure');

    expect(repository.hardDeleteIncompleteSchool).toHaveBeenCalledWith('school-1');
    expect(authService.createInitialSchoolAdmin).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});

describe('lifecycle transitions (Business Rules #5, #6, #12)', () => {
  it('suspend is idempotent on an already-suspended school', async () => {
    const suspended = { id: 's1', lifecycleStatus: 'SUSPENDED' };
    repository.findById.mockResolvedValue(suspended);

    const result = await service.suspendSchool('s1', actingUser);

    expect(result).toBe(suspended);
    expect(repository.updateLifecycleStatus).not.toHaveBeenCalled();
  });

  it('reactivate is idempotent on an already-active school (regression)', async () => {
    const active = { id: 's1', lifecycleStatus: 'ACTIVE' };
    repository.findById.mockResolvedValue(active);

    const result = await service.reactivateSchool('s1', actingUser);

    expect(result).toBe(active);
    expect(repository.updateLifecycleStatus).not.toHaveBeenCalled();
  });

  it('close is idempotent on an already-closed school (regression)', async () => {
    const closed = { id: 's1', lifecycleStatus: 'CLOSED' };
    repository.findById.mockResolvedValue(closed);

    const result = await service.closeSchool('s1', actingUser);

    expect(result).toBe(closed);
    expect(repository.updateLifecycleStatus).not.toHaveBeenCalled();
  });

  it('rejects suspending a Closed school', async () => {
    repository.findById.mockResolvedValue({ id: 's1', lifecycleStatus: 'CLOSED' });

    await expect(service.suspendSchool('s1', actingUser)).rejects.toThrow(
      'A closed school cannot be suspended; it must be reopened first'
    );
  });

  it('rejects reactivating a Closed school (must use reopen instead)', async () => {
    repository.findById.mockResolvedValue({ id: 's1', lifecycleStatus: 'CLOSED' });

    await expect(service.reactivateSchool('s1', actingUser)).rejects.toThrow(
      'This school is closed, not suspended. Use the reopen action instead of reactivate.'
    );
  });

  it('reopen only works on a Closed school', async () => {
    repository.findById.mockResolvedValue({ id: 's1', lifecycleStatus: 'ACTIVE' });

    await expect(service.reopenSchool('s1', actingUser)).rejects.toThrow('Only a closed school can be reopened');
  });

  it('reopen succeeds on a Closed school', async () => {
    repository.findById.mockResolvedValue({ id: 's1', lifecycleStatus: 'CLOSED' });
    repository.updateLifecycleStatus.mockResolvedValue({ id: 's1', lifecycleStatus: 'ACTIVE' });

    await service.reopenSchool('s1', actingUser);

    expect(repository.updateLifecycleStatus).toHaveBeenCalledWith('s1', 'ACTIVE');
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'SCHOOL_REOPENED' }));
  });
});

describe('subscription status independence (Business Rule #13)', () => {
  it('changing subscription status never touches lifecycleStatus', async () => {
    repository.findById.mockResolvedValue({ id: 's1', lifecycleStatus: 'ACTIVE' });
    repository.updateSubscriptionStatus.mockResolvedValue({ id: 's1', subscriptionStatus: 'EXPIRED' });

    await service.updateSubscriptionStatus('s1', 'EXPIRED', actingUser);

    expect(repository.updateLifecycleStatus).not.toHaveBeenCalled();
    expect(repository.updateSubscriptionStatus).toHaveBeenCalledWith('s1', 'EXPIRED');
  });
});

describe('getPlatformStatistics (Business Rule #10 — aggregate only)', () => {
  it('returns only aggregate counts, never per-school data', async () => {
    repository.getPlatformStatistics.mockResolvedValue({
      totalSchools: 5,
      activeSchools: 4,
      suspendedSchools: 1,
      closedSchools: 0,
    });

    const stats = await service.getPlatformStatistics();

    expect(Object.keys(stats)).toEqual(['totalSchools', 'activeSchools', 'suspendedSchools', 'closedSchools']);
  });
});

describe('updateOperationalProfile mass-assignment guard (regression)', () => {
  it('strips any field outside the operational-profile allow-list before writing', async () => {
    repository.findById.mockResolvedValue({ id: 's1', lifecycleStatus: 'ACTIVE' });
    repository.updateOperationalProfile.mockResolvedValue({ id: 's1' });

    await service.updateOperationalProfile(
      's1',
      { contactEmail: 'ok@example.com', name: 'Hijacked Name', lifecycleStatus: 'SUSPENDED', subscriptionStatus: 'ACTIVE' },
      actingUser
    );

    expect(repository.updateOperationalProfile).toHaveBeenCalledWith('s1', { contactEmail: 'ok@example.com' });
  });
});

describe('getSchoolOrThrow', () => {
  it('throws when the school does not exist', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(service.getSchoolOrThrow('missing')).rejects.toThrow('School not found');
  });
});

describe('updateEducationLevels (ACR-003, Business Rule #17)', () => {
  it('allows growing the set of Education Levels', async () => {
    repository.findById.mockResolvedValue({ id: 's1', educationLevels: ['PRIMARY'] });
    repository.updateEducationLevels.mockResolvedValue({ id: 's1', educationLevels: ['PRIMARY', 'SECONDARY'] });

    await service.updateEducationLevels('s1', ['PRIMARY', 'SECONDARY'], actingUser);

    expect(repository.updateEducationLevels).toHaveBeenCalledWith('s1', ['PRIMARY', 'SECONDARY']);
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SCHOOL_EDUCATION_LEVELS_CHANGED',
        metadata: { previousLevels: ['PRIMARY'], newLevels: ['PRIMARY', 'SECONDARY'] },
      })
    );
  });

  it('allows resubmitting the exact same set (idempotent)', async () => {
    repository.findById.mockResolvedValue({ id: 's1', educationLevels: ['PRIMARY'] });
    repository.updateEducationLevels.mockResolvedValue({ id: 's1', educationLevels: ['PRIMARY'] });

    await service.updateEducationLevels('s1', ['PRIMARY'], actingUser);

    expect(repository.updateEducationLevels).toHaveBeenCalledWith('s1', ['PRIMARY']);
  });

  it('removes a dropped level and unassigns its Subjects', async () => {
    repository.findById.mockResolvedValue({ id: 's1', educationLevels: ['PRIMARY', 'SECONDARY'] });
    repository.updateEducationLevels.mockResolvedValue({ id: 's1', educationLevels: ['PRIMARY'] });
    subjectsService.findLevelRemovalBlockers.mockResolvedValue([]);

    await service.updateEducationLevels('s1', ['PRIMARY'], actingUser);

    expect(subjectsService.removeAllSubjectsOfLevelFromSchool).toHaveBeenCalledWith('s1', 'SECONDARY', actingUser);
    expect(repository.updateEducationLevels).toHaveBeenCalledWith('s1', ['PRIMARY']);
  });

  it('rejects dropping a level whose Subjects are still in use, changing nothing', async () => {
    repository.findById.mockResolvedValue({ id: 's1', educationLevels: ['PRIMARY', 'SECONDARY'] });
    subjectsService.findLevelRemovalBlockers.mockResolvedValue(['Math: 1 Teacher Subject Assignment']);

    await expect(service.updateEducationLevels('s1', ['PRIMARY'], actingUser)).rejects.toThrow(
      'these Subjects are still in use: Math: 1 Teacher Subject Assignment'
    );
    expect(subjectsService.removeAllSubjectsOfLevelFromSchool).not.toHaveBeenCalled();
    expect(repository.updateEducationLevels).not.toHaveBeenCalled();
  });

  it('rejects updating Education Levels for a non-existent school', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(service.updateEducationLevels('missing', ['PRIMARY'], actingUser)).rejects.toThrow(
      'School not found'
    );
  });
});

describe('Subject auto-assignment on Education Level gain', () => {
  it('auto-assigns only the newly added level Subjects', async () => {
    repository.findById.mockResolvedValue({ id: 's1', educationLevels: ['PRIMARY'] });
    repository.updateEducationLevels.mockResolvedValue({ id: 's1', educationLevels: ['PRIMARY', 'SECONDARY'] });

    await service.updateEducationLevels('s1', ['PRIMARY', 'SECONDARY'], actingUser);

    expect(subjectsService.assignAllActiveSubjectsOfLevelToSchool).toHaveBeenCalledTimes(1);
    expect(subjectsService.assignAllActiveSubjectsOfLevelToSchool).toHaveBeenCalledWith('s1', 'SECONDARY', actingUser);
  });

  it('auto-assigns nothing when the set is unchanged', async () => {
    repository.findById.mockResolvedValue({ id: 's1', educationLevels: ['PRIMARY'] });
    repository.updateEducationLevels.mockResolvedValue({ id: 's1', educationLevels: ['PRIMARY'] });

    await service.updateEducationLevels('s1', ['PRIMARY'], actingUser);

    expect(subjectsService.assignAllActiveSubjectsOfLevelToSchool).not.toHaveBeenCalled();
  });

  it('does not fail the level change when auto-assignment fails', async () => {
    repository.findById.mockResolvedValue({ id: 's1', educationLevels: ['PRIMARY'] });
    repository.updateEducationLevels.mockResolvedValue({ id: 's1', educationLevels: ['PRIMARY', 'SECONDARY'] });
    subjectsService.assignAllActiveSubjectsOfLevelToSchool.mockRejectedValueOnce(new Error('boom'));
    jest.spyOn(console, 'error').mockImplementationOnce(() => {});

    await expect(service.updateEducationLevels('s1', ['PRIMARY', 'SECONDARY'], actingUser)).resolves.toEqual({
      id: 's1',
      educationLevels: ['PRIMARY', 'SECONDARY'],
    });
  });

  it('auto-assigns the default level Subjects of a new school', async () => {
    repository.findByName.mockResolvedValue(null);
    repository.create.mockResolvedValue({ id: 'school-1', name: 'New School', educationLevels: ['PRIMARY'] });
    authService.createInitialSchoolAdmin.mockResolvedValue({ id: 'admin-1' });

    await service.createSchool({ name: 'New School', firstSchoolAdminEmail: 'admin@example.com' }, actingUser);

    expect(subjectsService.assignAllActiveSubjectsOfLevelToSchool).toHaveBeenCalledWith('school-1', 'PRIMARY', actingUser);
  });
});

describe('hasEducationLevel (narrow interface for Subject Management)', () => {
  it('returns true when the school has the level', async () => {
    repository.findById.mockResolvedValue({ id: 's1', educationLevels: ['PRIMARY', 'SECONDARY'] });

    await expect(service.hasEducationLevel('s1', 'SECONDARY')).resolves.toBe(true);
  });

  it('returns false when the school does not have the level', async () => {
    repository.findById.mockResolvedValue({ id: 's1', educationLevels: ['PRIMARY'] });

    await expect(service.hasEducationLevel('s1', 'SECONDARY')).resolves.toBe(false);
  });

  it('returns false for a non-existent school, never throwing', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(service.hasEducationLevel('missing', 'PRIMARY')).resolves.toBe(false);
  });
});
