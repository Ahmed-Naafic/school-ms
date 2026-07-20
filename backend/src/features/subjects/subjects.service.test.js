jest.mock('./subjects.repository');
jest.mock('../schools/schools.service');
jest.mock('../../shared/audit');

const { Prisma } = require('@prisma/client');
const repository = require('./subjects.repository');
const schoolsService = require('../schools/schools.service');
const { recordAuditEvent } = require('../../shared/audit');
const service = require('./subjects.service');

const actingUser = { id: 'super-1', role: 'SUPER_ADMIN' };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createSubject (Business Rule #3)', () => {
  it('rejects a duplicate name within the same Education Level', async () => {
    repository.findByNameAndEducationLevel.mockResolvedValue({ id: 'existing' });

    await expect(
      service.createSubject({ name: 'English', educationLevel: 'PRIMARY' }, actingUser)
    ).rejects.toThrow('A Subject with this name already exists for this Education Level');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('allows the same name across two different Education Levels', async () => {
    repository.findByNameAndEducationLevel.mockResolvedValue(null);
    repository.create.mockResolvedValue({ id: 'subj-1', name: 'English', educationLevel: 'SECONDARY' });

    await service.createSubject({ name: 'English', educationLevel: 'SECONDARY' }, actingUser);

    expect(repository.create).toHaveBeenCalledWith({ name: 'English', educationLevel: 'SECONDARY' });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SUBJECT_CREATED', userId: 'super-1' })
    );
    // Platform-wide entity — no schoolId on this audit event (Business Rule #12).
    expect(recordAuditEvent.mock.calls[0][0].schoolId).toBeUndefined();
  });
});

describe('updateSubject (Business Rule #2)', () => {
  it('always allows a name-only change', async () => {
    repository.findById.mockResolvedValue({ id: 's1', name: 'Old Name', educationLevel: 'PRIMARY' });
    repository.findByNameAndEducationLevel.mockResolvedValue(null);
    repository.update.mockResolvedValue({ id: 's1', name: 'New Name', educationLevel: 'PRIMARY' });

    await service.updateSubject('s1', { name: 'New Name' }, actingUser);

    expect(repository.countActiveAssignments).not.toHaveBeenCalled();
    expect(repository.update).toHaveBeenCalledWith('s1', { name: 'New Name', educationLevel: 'PRIMARY' });
  });

  it('allows an Education Level change when the Subject has zero School assignments', async () => {
    repository.findById.mockResolvedValue({ id: 's1', name: 'Physics', educationLevel: 'PRIMARY' });
    repository.countActiveAssignments.mockResolvedValue(0);
    repository.findByNameAndEducationLevel.mockResolvedValue(null);
    repository.update.mockResolvedValue({ id: 's1', name: 'Physics', educationLevel: 'SECONDARY' });

    await service.updateSubject('s1', { educationLevel: 'SECONDARY' }, actingUser);

    expect(repository.update).toHaveBeenCalledWith('s1', { name: 'Physics', educationLevel: 'SECONDARY' });
  });

  it('rejects an Education Level change once the Subject has at least one School assignment', async () => {
    repository.findById.mockResolvedValue({ id: 's1', name: 'Physics', educationLevel: 'PRIMARY' });
    repository.countActiveAssignments.mockResolvedValue(1);

    await expect(service.updateSubject('s1', { educationLevel: 'SECONDARY' }, actingUser)).rejects.toThrow(
      'Cannot change Education Level — this Subject is currently assigned to at least one School'
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('rejects renaming into a name+level pair already used by another Subject', async () => {
    repository.findById.mockResolvedValue({ id: 's1', name: 'Old', educationLevel: 'PRIMARY' });
    repository.findByNameAndEducationLevel.mockResolvedValue({ id: 's2' });

    await expect(service.updateSubject('s1', { name: 'English' }, actingUser)).rejects.toThrow(
      'A Subject with this name already exists for this Education Level'
    );
  });
});

describe('archiveSubject / reactivateSubject (Business Rule #4)', () => {
  it('archives an Active Subject', async () => {
    repository.findById.mockResolvedValue({ id: 's1', status: 'ACTIVE' });
    repository.archive.mockResolvedValue({ id: 's1', status: 'ARCHIVED' });

    await service.archiveSubject('s1', actingUser);

    expect(repository.archive).toHaveBeenCalledWith('s1');
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'SUBJECT_ARCHIVED' }));
  });

  it('archiving an already-Archived Subject is a no-op', async () => {
    const archived = { id: 's1', status: 'ARCHIVED' };
    repository.findById.mockResolvedValue(archived);

    const result = await service.archiveSubject('s1', actingUser);

    expect(result).toBe(archived);
    expect(repository.archive).not.toHaveBeenCalled();
  });

  it('reactivating an already-Active Subject is a no-op', async () => {
    const active = { id: 's1', status: 'ACTIVE' };
    repository.findById.mockResolvedValue(active);

    const result = await service.reactivateSubject('s1', actingUser);

    expect(result).toBe(active);
    expect(repository.reactivate).not.toHaveBeenCalled();
  });
});

describe('assignSubjectToSchool (Business Rules #5, #6, #7)', () => {
  it('rejects assigning an Archived Subject', async () => {
    repository.findById.mockResolvedValue({ id: 's1', status: 'ARCHIVED', educationLevel: 'PRIMARY' });

    await expect(service.assignSubjectToSchool('school-1', 's1', actingUser)).rejects.toThrow(
      'Cannot assign an Archived Subject to a School'
    );
    expect(schoolsService.hasEducationLevel).not.toHaveBeenCalled();
  });

  it("rejects assignment when the School doesn't offer the Subject's Education Level", async () => {
    repository.findById.mockResolvedValue({ id: 's1', status: 'ACTIVE', educationLevel: 'SECONDARY' });
    schoolsService.hasEducationLevel.mockResolvedValue(false);

    await expect(service.assignSubjectToSchool('school-1', 's1', actingUser)).rejects.toThrow(
      'This School does not currently offer the SECONDARY Education Level'
    );
    expect(repository.createAssignment).not.toHaveBeenCalled();
  });

  it('never queries the School table directly — only calls hasEducationLevel', async () => {
    repository.findById.mockResolvedValue({ id: 's1', status: 'ACTIVE', educationLevel: 'PRIMARY' });
    schoolsService.hasEducationLevel.mockResolvedValue(true);
    repository.findAssignment.mockResolvedValue(null);
    repository.createAssignment.mockResolvedValue({ id: 'ss1' });

    await service.assignSubjectToSchool('school-1', 's1', actingUser);

    expect(schoolsService.hasEducationLevel).toHaveBeenCalledWith('school-1', 'PRIMARY');
  });

  it('creates a new assignment when none exists', async () => {
    repository.findById.mockResolvedValue({ id: 's1', status: 'ACTIVE', educationLevel: 'PRIMARY' });
    schoolsService.hasEducationLevel.mockResolvedValue(true);
    repository.findAssignment.mockResolvedValue(null);
    repository.createAssignment.mockResolvedValue({ id: 'ss1' });

    await service.assignSubjectToSchool('school-1', 's1', actingUser);

    expect(repository.createAssignment).toHaveBeenCalledWith({
      schoolId: 'school-1',
      subjectId: 's1',
      assignedById: 'super-1',
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SUBJECT_ASSIGNED_TO_SCHOOL', schoolId: 'school-1' })
    );
  });

  it('is a no-op when already actively assigned', async () => {
    repository.findById.mockResolvedValue({ id: 's1', status: 'ACTIVE', educationLevel: 'PRIMARY' });
    schoolsService.hasEducationLevel.mockResolvedValue(true);
    const existing = { id: 'ss1', removedAt: null };
    repository.findAssignment.mockResolvedValue(existing);

    const result = await service.assignSubjectToSchool('school-1', 's1', actingUser);

    expect(result).toBe(existing);
    expect(repository.createAssignment).not.toHaveBeenCalled();
    expect(repository.reactivateAssignment).not.toHaveBeenCalled();
  });

  it('reactivates a previously soft-removed assignment rather than inserting a second row', async () => {
    repository.findById.mockResolvedValue({ id: 's1', status: 'ACTIVE', educationLevel: 'PRIMARY' });
    schoolsService.hasEducationLevel.mockResolvedValue(true);
    const removed = { id: 'ss1', removedAt: new Date() };
    repository.findAssignment.mockResolvedValue(removed);
    repository.reactivateAssignment.mockResolvedValue({ id: 'ss1', removedAt: null });

    await service.assignSubjectToSchool('school-1', 's1', actingUser);

    expect(repository.reactivateAssignment).toHaveBeenCalledWith('ss1', 'super-1');
    expect(repository.createAssignment).not.toHaveBeenCalled();
  });

  // Phase 9 code review finding: two concurrent identical assignment
  // requests can both pass the findAssignment check before either commits,
  // so the second createAssignment call collides on the database's own
  // (schoolId, subjectId) unique constraint (Prisma P2002). This must
  // recover as the same idempotent success as the already-assigned case,
  // not surface as an unhandled 500.
  it('recovers from a concurrent-assignment race (P2002) as an idempotent success', async () => {
    repository.findById.mockResolvedValue({ id: 's1', status: 'ACTIVE', educationLevel: 'PRIMARY' });
    schoolsService.hasEducationLevel.mockResolvedValue(true);
    // First call (the pre-write check): nothing exists yet. Second call
    // (post-catch recovery): the concurrent winner's row is now there.
    const winnersRow = { id: 'ss1', removedAt: null };
    repository.findAssignment.mockResolvedValueOnce(null).mockResolvedValueOnce(winnersRow);
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.22.0',
    });
    repository.createAssignment.mockRejectedValue(p2002);

    const result = await service.assignSubjectToSchool('school-1', 's1', actingUser);

    expect(result).toBe(winnersRow);
    expect(repository.findAssignment).toHaveBeenCalledTimes(2);
    // The losing request never claims credit for the assignment — no
    // duplicate audit event, matching the already-assigned no-op branch.
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it('propagates a non-P2002 error from createAssignment unchanged', async () => {
    repository.findById.mockResolvedValue({ id: 's1', status: 'ACTIVE', educationLevel: 'PRIMARY' });
    schoolsService.hasEducationLevel.mockResolvedValue(true);
    repository.findAssignment.mockResolvedValue(null);
    repository.createAssignment.mockRejectedValue(new Error('connection lost'));

    await expect(service.assignSubjectToSchool('school-1', 's1', actingUser)).rejects.toThrow(
      'connection lost'
    );
  });
});

describe('removeSubjectFromSchool (Business Rule #8, dependency-validation registry)', () => {
  it('rejects when no currently-active assignment exists', async () => {
    repository.findAssignment.mockResolvedValue(null);

    await expect(service.removeSubjectFromSchool('school-1', 's1', actingUser)).rejects.toThrow(
      'Subject assignment not found'
    );
  });

  it('rejects when the assignment was already removed', async () => {
    repository.findAssignment.mockResolvedValue({ id: 'ss1', removedAt: new Date() });

    await expect(service.removeSubjectFromSchool('school-1', 's1', actingUser)).rejects.toThrow(
      'Subject assignment not found'
    );
  });

  it('succeeds when the registry has no registered checkers', async () => {
    repository.findAssignment.mockResolvedValue({ id: 'ss1', removedAt: null });
    repository.removeAssignment.mockResolvedValue({ id: 'ss1', removedAt: new Date() });

    await service.removeSubjectFromSchool('school-1', 'no-checkers-yet', actingUser);

    expect(repository.removeAssignment).toHaveBeenCalledWith('ss1', 'super-1');
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SUBJECT_ASSIGNMENT_REMOVED', schoolId: 'school-1' })
    );
  });

  // The registry is module-level state with no reset hook between tests
  // (matching production: it's meant to accumulate registrations for the
  // life of the process). Each checker below only blocks a subjectId unique
  // to its own test, so earlier registrations never interfere with later
  // tests' removal calls for a different subjectId.

  it('is blocked by a registered checker that returns a reason', async () => {
    repository.findAssignment.mockResolvedValue({ id: 'ss1', removedAt: null });
    service.registerRemovalDependencyCheck('fake-dependent', async (schoolId, subjectId) =>
      subjectId === 'blocked-subject' ? 'still referenced by a fake dependent' : null
    );

    await expect(service.removeSubjectFromSchool('school-1', 'blocked-subject', actingUser)).rejects.toThrow(
      'Cannot remove Subject: still referenced by a fake dependent (blocked by fake-dependent)'
    );
    expect(repository.removeAssignment).not.toHaveBeenCalled();
  });

  it('runs multiple checkers in order and short-circuits on the first block', async () => {
    repository.findAssignment.mockResolvedValue({ id: 'ss1', removedAt: null });
    const secondChecker = jest.fn().mockResolvedValue(null);
    service.registerRemovalDependencyCheck('first-blocker', async (schoolId, subjectId) =>
      subjectId === 'ordering-subject' ? 'blocked by first' : null
    );
    service.registerRemovalDependencyCheck('second-checker', secondChecker);

    await expect(service.removeSubjectFromSchool('school-1', 'ordering-subject', actingUser)).rejects.toThrow(
      'blocked by first-blocker'
    );
    expect(secondChecker).not.toHaveBeenCalled();
  });

  it('allows removal for a subject none of the registered checkers object to', async () => {
    repository.findAssignment.mockResolvedValue({ id: 'ss1', removedAt: null });
    repository.removeAssignment.mockResolvedValue({ id: 'ss1', removedAt: new Date() });

    await service.removeSubjectFromSchool('school-1', 'harmless-subject', actingUser);

    expect(repository.removeAssignment).toHaveBeenCalled();
  });
});

describe('assertSchoolAccessible', () => {
  it('never restricts Super Admin', () => {
    expect(() => service.assertSchoolAccessible({ role: 'SUPER_ADMIN' }, 'any-school')).not.toThrow();
  });

  it('allows a School Admin to access their own school', () => {
    expect(() =>
      service.assertSchoolAccessible({ role: 'SCHOOL_ADMIN', schoolId: 'school-1' }, 'school-1')
    ).not.toThrow();
  });

  it('rejects a School Admin targeting another school with 404, not 403', () => {
    expect(() =>
      service.assertSchoolAccessible({ role: 'SCHOOL_ADMIN', schoolId: 'school-1' }, 'school-2')
    ).toThrow('School not found');
  });
});

describe('stable public service interface (getSubjectById, isSubjectAssignedToSchool)', () => {
  it('getSubjectById delegates to the repository', async () => {
    repository.findById.mockResolvedValue({ id: 's1' });
    await expect(service.getSubjectById('s1')).resolves.toEqual({ id: 's1' });
  });

  it('isSubjectAssignedToSchool returns true for a currently-assigned pair', async () => {
    repository.findAssignment.mockResolvedValue({ id: 'ss1', removedAt: null });
    await expect(service.isSubjectAssignedToSchool('school-1', 's1')).resolves.toBe(true);
  });

  it('isSubjectAssignedToSchool returns false for a removed assignment', async () => {
    repository.findAssignment.mockResolvedValue({ id: 'ss1', removedAt: new Date() });
    await expect(service.isSubjectAssignedToSchool('school-1', 's1')).resolves.toBe(false);
  });

  it('isSubjectAssignedToSchool returns false when no assignment exists', async () => {
    repository.findAssignment.mockResolvedValue(null);
    await expect(service.isSubjectAssignedToSchool('school-1', 's1')).resolves.toBe(false);
  });
});
