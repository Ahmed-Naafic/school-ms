jest.mock('./teachers.repository');
jest.mock('../../shared/audit');
jest.mock('../auth/auth.service');
// Unit tests only — teachers.service.js's onboardTeacher/applyEmploymentTransition
// wrap their writes in prisma.$transaction. Without mocking this, $transaction
// would open a real transaction against the real dev database on every test
// run here (repository and authService are already mocked, but the raw
// prisma import isn't) — exactly the Completion Review's Critical finding's
// fix, verified with a fake transaction runner that just invokes the
// callback synchronously with a recognizable fake client.
jest.mock('../../config/database', () => ({
  $transaction: jest.fn((callback) => callback('MOCK_TX')),
}));

const repository = require('./teachers.repository');
const { recordAuditEvent } = require('../../shared/audit');
const authService = require('../auth/auth.service');
const service = require('./teachers.service');

const actingUser = { id: 'admin-1', schoolId: 'school-1' };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('onboardTeacher (Business Rules #1, #2, #3)', () => {
  it('creates a login account before creating the Teacher record, with employmentStatus defaulting to ACTIVE', async () => {
    authService.createAccount.mockResolvedValue({ id: 'account-1' });
    repository.create.mockResolvedValue({ id: 'teacher-1', accountId: 'account-1' });

    await service.onboardTeacher(
      { email: 'a@example.com', fullName: 'A Teacher', joiningDate: '2026-01-15' },
      actingUser
    );

    expect(authService.createAccount).toHaveBeenCalledWith(
      { email: 'a@example.com', role: 'TEACHER', schoolId: 'school-1' },
      actingUser,
      'MOCK_TX'
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-1',
        accountId: 'account-1',
        fullName: 'A Teacher',
        subjectSpecializations: [],
      }),
      'MOCK_TX'
    );
    // employmentStatus is not passed explicitly — the schema's own default
    // (ACTIVE) applies, per Business Rule #4/#5's Architecture.
    expect(repository.create.mock.calls[0][0]).not.toHaveProperty('employmentStatus');
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'TEACHER_ONBOARDED' }));
  });

  it('generates a system employeeId, never accepting one from the caller', async () => {
    authService.createAccount.mockResolvedValue({ id: 'account-1' });
    repository.create.mockResolvedValue({ id: 'teacher-1' });

    await service.onboardTeacher(
      { email: 'a@example.com', fullName: 'A Teacher', joiningDate: '2026-01-15', employeeId: 'CLIENT-SUPPLIED' },
      actingUser
    );

    const createArg = repository.create.mock.calls[0][0];
    expect(createArg.employeeId).toMatch(/^EMP-[0-9A-F]{8}$/);
    expect(createArg.employeeId).not.toBe('CLIENT-SUPPLIED');
  });

});

describe('getTeacherDetail / getTeacherOrThrow (tenant isolation)', () => {
  it('returns a Teacher belonging to the acting user\'s school', async () => {
    repository.findById.mockResolvedValue({ id: 't1', schoolId: 'school-1' });

    const result = await service.getTeacherDetail('t1', actingUser);
    expect(result).toEqual({ id: 't1', schoolId: 'school-1' });
  });

  it('returns 404-mapped NotFoundError for a Teacher in a different school (never 403 — avoids confirming existence)', async () => {
    repository.findById.mockResolvedValue({ id: 't1', schoolId: 'other-school' });

    await expect(service.getTeacherDetail('t1', actingUser)).rejects.toThrow('Teacher not found');
  });

  it('returns NotFoundError when no Teacher exists at all', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(service.getTeacherDetail('missing', actingUser)).rejects.toThrow('Teacher not found');
  });
});

describe('updateTeacherProfile (Business Rules #10, #11)', () => {
  it('updates only the fields provided', async () => {
    repository.findById.mockResolvedValue({ id: 't1', schoolId: 'school-1' });
    repository.update.mockResolvedValue({ id: 't1', fullName: 'New Name' });

    await service.updateTeacherProfile('t1', { fullName: 'New Name' }, actingUser);

    expect(repository.update).toHaveBeenCalledWith('t1', { fullName: 'New Name' });
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'TEACHER_PROFILE_UPDATED' }));
  });

  it('never forwards employmentStatus, employeeId, schoolId, or accountId even if present in the payload (defense in depth beyond validation)', async () => {
    repository.findById.mockResolvedValue({ id: 't1', schoolId: 'school-1' });
    repository.update.mockResolvedValue({ id: 't1' });

    await service.updateTeacherProfile(
      't1',
      { fullName: 'New Name', employmentStatus: 'TERMINATED', employeeId: 'X', schoolId: 'other', accountId: 'other' },
      actingUser
    );

    const updateArg = repository.update.mock.calls[0][1];
    expect(updateArg).toEqual({ fullName: 'New Name' });
  });

  it('rejects updating a Teacher outside the acting user\'s school', async () => {
    repository.findById.mockResolvedValue({ id: 't1', schoolId: 'other-school' });

    await expect(
      service.updateTeacherProfile('t1', { fullName: 'New Name' }, actingUser)
    ).rejects.toThrow('Teacher not found');
    expect(repository.update).not.toHaveBeenCalled();
  });
});

describe('Employment Status Transitions (Business Rules #4, #5, #6)', () => {
  const activeTeacher = { id: 't1', schoolId: 'school-1', accountId: 'acc-1', employmentStatus: 'ACTIVE' };
  const onLeaveTeacher = { id: 't1', schoolId: 'school-1', accountId: 'acc-1', employmentStatus: 'ON_LEAVE' };
  const resignedTeacher = { id: 't1', schoolId: 'school-1', accountId: 'acc-1', employmentStatus: 'RESIGNED' };
  const terminatedTeacher = { id: 't1', schoolId: 'school-1', accountId: 'acc-1', employmentStatus: 'TERMINATED' };
  const retiredTeacher = { id: 't1', schoolId: 'school-1', accountId: 'acc-1', employmentStatus: 'RETIRED' };

  describe('placeOnLeave (ACTIVE -> ON_LEAVE, no account call)', () => {
    it('succeeds from ACTIVE and makes no account call', async () => {
      repository.findById.mockResolvedValue(activeTeacher);
      repository.updateEmploymentStatus.mockResolvedValue({ ...activeTeacher, employmentStatus: 'ON_LEAVE' });

      await service.placeOnLeave('t1', {}, actingUser);

      expect(repository.updateEmploymentStatus).toHaveBeenCalledWith('t1', 'ON_LEAVE', 'MOCK_TX');
      expect(authService.deactivateAccount).not.toHaveBeenCalled();
      expect(authService.reactivateAccount).not.toHaveBeenCalled();
      expect(recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TEACHER_EMPLOYMENT_STATUS_CHANGED',
          metadata: expect.objectContaining({ previousStatus: 'ACTIVE', newStatus: 'ON_LEAVE' }),
        })
      );
    });

    it.each(['RESIGNED', 'TERMINATED', 'RETIRED', 'ON_LEAVE'])('rejects from %s', async (status) => {
      repository.findById.mockResolvedValue({ ...activeTeacher, employmentStatus: status });

      await expect(service.placeOnLeave('t1', {}, actingUser)).rejects.toThrow();
      expect(repository.updateEmploymentStatus).not.toHaveBeenCalled();
    });
  });

  describe('returnFromLeave (ON_LEAVE -> ACTIVE, enables account)', () => {
    it('succeeds from ON_LEAVE and reactivates the account', async () => {
      repository.findById.mockResolvedValue(onLeaveTeacher);
      repository.updateEmploymentStatus.mockResolvedValue({ ...onLeaveTeacher, employmentStatus: 'ACTIVE' });

      await service.returnFromLeave('t1', {}, actingUser);

      expect(authService.reactivateAccount).toHaveBeenCalledWith('acc-1', actingUser, {
        source: 'teacher_management',
        reason: null,
      }, 'MOCK_TX');
      expect(authService.deactivateAccount).not.toHaveBeenCalled();
      expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'TEACHER_REINSTATED' }));
    });

    it.each(['ACTIVE', 'RESIGNED', 'TERMINATED', 'RETIRED'])('rejects from %s', async (status) => {
      repository.findById.mockResolvedValue({ ...activeTeacher, employmentStatus: status });

      await expect(service.returnFromLeave('t1', {}, actingUser)).rejects.toThrow();
      expect(authService.reactivateAccount).not.toHaveBeenCalled();
    });
  });

  describe('resign (ACTIVE/ON_LEAVE -> RESIGNED, disables account)', () => {
    it.each(['ACTIVE', 'ON_LEAVE'])('succeeds from %s and deactivates the account', async (status) => {
      repository.findById.mockResolvedValue({ ...activeTeacher, employmentStatus: status });
      repository.updateEmploymentStatus.mockResolvedValue({ ...activeTeacher, employmentStatus: 'RESIGNED' });

      await service.resign('t1', { reason: 'Personal reasons' }, actingUser);

      expect(authService.deactivateAccount).toHaveBeenCalledWith('acc-1', actingUser, {
        source: 'teacher_management',
        reason: null,
      }, 'MOCK_TX');
      expect(recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TEACHER_EMPLOYMENT_STATUS_CHANGED',
          metadata: expect.objectContaining({ newStatus: 'RESIGNED', reason: 'Personal reasons' }),
        })
      );
    });

    it.each(['RESIGNED', 'TERMINATED', 'RETIRED'])('rejects from %s', async (status) => {
      repository.findById.mockResolvedValue({ ...activeTeacher, employmentStatus: status });

      await expect(service.resign('t1', {}, actingUser)).rejects.toThrow();
      expect(authService.deactivateAccount).not.toHaveBeenCalled();
    });
  });

  describe('rehire (RESIGNED -> ACTIVE, enables account)', () => {
    it('succeeds from RESIGNED and reactivates the account', async () => {
      repository.findById.mockResolvedValue(resignedTeacher);
      repository.updateEmploymentStatus.mockResolvedValue({ ...resignedTeacher, employmentStatus: 'ACTIVE' });

      await service.rehire('t1', {}, actingUser);

      expect(authService.reactivateAccount).toHaveBeenCalledWith('acc-1', actingUser, {
        source: 'teacher_management',
        reason: null,
      }, 'MOCK_TX');
      expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'TEACHER_REINSTATED' }));
    });

    it.each(['ACTIVE', 'ON_LEAVE', 'TERMINATED', 'RETIRED'])('rejects from %s', async (status) => {
      repository.findById.mockResolvedValue({ ...activeTeacher, employmentStatus: status });

      await expect(service.rehire('t1', {}, actingUser)).rejects.toThrow();
      expect(authService.reactivateAccount).not.toHaveBeenCalled();
    });
  });

  describe('terminate (ACTIVE/ON_LEAVE -> TERMINATED, disables account, terminal)', () => {
    it.each(['ACTIVE', 'ON_LEAVE'])('succeeds from %s and deactivates the account', async (status) => {
      repository.findById.mockResolvedValue({ ...activeTeacher, employmentStatus: status });
      repository.updateEmploymentStatus.mockResolvedValue({ ...activeTeacher, employmentStatus: 'TERMINATED' });

      await service.terminate('t1', {}, actingUser);

      expect(authService.deactivateAccount).toHaveBeenCalledWith('acc-1', actingUser, {
        source: 'teacher_management',
        reason: null,
      }, 'MOCK_TX');
    });

    it.each(['RESIGNED', 'TERMINATED', 'RETIRED'])('rejects from %s (regression — terminal state permanence)', async (status) => {
      repository.findById.mockResolvedValue({ ...activeTeacher, employmentStatus: status });

      await expect(service.terminate('t1', {}, actingUser)).rejects.toThrow();
      expect(repository.updateEmploymentStatus).not.toHaveBeenCalled();
    });
  });

  describe('retire (ACTIVE/ON_LEAVE -> RETIRED, disables account, terminal)', () => {
    it.each(['ACTIVE', 'ON_LEAVE'])('succeeds from %s and deactivates the account', async (status) => {
      repository.findById.mockResolvedValue({ ...activeTeacher, employmentStatus: status });
      repository.updateEmploymentStatus.mockResolvedValue({ ...activeTeacher, employmentStatus: 'RETIRED' });

      await service.retire('t1', {}, actingUser);

      expect(authService.deactivateAccount).toHaveBeenCalledWith('acc-1', actingUser, {
        source: 'teacher_management',
        reason: null,
      }, 'MOCK_TX');
    });

    it.each(['RESIGNED', 'TERMINATED', 'RETIRED'])('rejects from %s (regression — terminal state permanence)', async (status) => {
      repository.findById.mockResolvedValue({ ...activeTeacher, employmentStatus: status });

      await expect(service.retire('t1', {}, actingUser)).rejects.toThrow();
      expect(repository.updateEmploymentStatus).not.toHaveBeenCalled();
    });
  });

  it('rejects any transition on a Teacher outside the acting user\'s school (tenant isolation)', async () => {
    repository.findById.mockResolvedValue({ ...activeTeacher, schoolId: 'other-school' });

    await expect(service.terminate('t1', {}, actingUser)).rejects.toThrow('Teacher not found');
    expect(repository.updateEmploymentStatus).not.toHaveBeenCalled();
  });

  // No transition function accepts an arbitrary target status — each of the
  // six is a fixed key into the private EMPLOYMENT_TRANSITIONS table, so
  // there is no code path from any of these functions to a status outside
  // its own hard-coded `to` value. This is a structural property, not
  // something a single test can directly assert, but the exhaustive
  // from/to coverage above confirms every documented cell of the Employment
  // Status Transition Matrix behaves exactly as specified, and nothing else
  // is reachable.
});

describe('Self-Service (Business Rules #10, #12)', () => {
  describe('getOwnProfile', () => {
    it('resolves from the authenticated account, not a client-supplied id', async () => {
      repository.findByAccountId.mockResolvedValue({ id: 't1', accountId: 'acc-1' });

      const result = await service.getOwnProfile('acc-1');

      expect(repository.findByAccountId).toHaveBeenCalledWith('acc-1');
      expect(result).toEqual({ id: 't1', accountId: 'acc-1' });
    });

    it('throws NotFoundError when no Teacher record is linked to the account', async () => {
      repository.findByAccountId.mockResolvedValue(null);

      await expect(service.getOwnProfile('acc-1')).rejects.toThrow('Teacher record not found');
    });
  });

  describe('updateOwnContactInfo', () => {
    it('updates only contactPhone/contactAddress', async () => {
      repository.findByAccountId.mockResolvedValue({ id: 't1', accountId: 'acc-1', schoolId: 'school-1' });
      repository.update.mockResolvedValue({ id: 't1', contactPhone: '555-0100' });

      await service.updateOwnContactInfo('acc-1', { contactPhone: '555-0100' });

      expect(repository.update).toHaveBeenCalledWith('t1', { contactPhone: '555-0100' });
      expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'TEACHER_PROFILE_UPDATED' }));
    });

    it('never forwards any field beyond contactPhone/contactAddress, even if present in the payload', async () => {
      repository.findByAccountId.mockResolvedValue({ id: 't1', accountId: 'acc-1', schoolId: 'school-1' });
      repository.update.mockResolvedValue({ id: 't1' });

      await service.updateOwnContactInfo('acc-1', {
        contactPhone: '555-0100',
        fullName: 'Hijacked Name',
        employmentStatus: 'TERMINATED',
      });

      expect(repository.update).toHaveBeenCalledWith('t1', { contactPhone: '555-0100' });
    });
  });
});

describe('listTeachers', () => {
  it('scopes the roster to the acting user\'s school and passes filters through', async () => {
    repository.listBySchool.mockResolvedValue({ teachers: [{ id: 't1' }], total: 1 });

    const result = await service.listTeachers({ employmentStatus: 'ACTIVE' }, actingUser);

    expect(repository.listBySchool).toHaveBeenCalledWith({
      schoolId: 'school-1',
      employmentStatus: 'ACTIVE',
      page: 1,
      pageSize: 20,
    });
    expect(result).toEqual({ teachers: [{ id: 't1' }], total: 1, page: 1, pageSize: 20 });
  });
});
