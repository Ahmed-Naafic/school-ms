jest.mock('./schools.repository');
jest.mock('../../shared/audit');
jest.mock('../auth/auth.service');

const repository = require('./schools.repository');
const { recordAuditEvent } = require('../../shared/audit');
const authService = require('../auth/auth.service');
const service = require('./schools.service');

const actingUser = { id: 'super-1', role: 'SUPER_ADMIN' };

beforeEach(() => {
  jest.clearAllMocks();
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
    repository.create.mockResolvedValue({ id: 'school-1', name: 'New School' });
    authService.createInitialSchoolAdmin.mockResolvedValue({ id: 'admin-account-1' });

    await service.createSchool({ name: 'New School', firstSchoolAdminEmail: 'admin@example.com' }, actingUser);

    expect(repository.create).toHaveBeenCalledWith({ name: 'New School' });
    expect(authService.createInitialSchoolAdmin).toHaveBeenCalledWith({
      email: 'admin@example.com',
      schoolId: 'school-1',
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'SCHOOL_CREATED' }));
  });
});

describe('createSchool orphan-rollback (regression)', () => {
  it('deletes the just-created School if the mandatory first School Admin account fails to be created', async () => {
    repository.findByName.mockResolvedValue(null);
    repository.create.mockResolvedValue({ id: 'school-1', name: 'New School' });
    authService.createInitialSchoolAdmin.mockRejectedValue(new Error('email already exists'));

    await expect(
      service.createSchool({ name: 'New School', firstSchoolAdminEmail: 'taken@example.com' }, actingUser)
    ).rejects.toThrow('email already exists');

    expect(repository.hardDeleteIncompleteSchool).toHaveBeenCalledWith('school-1');
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
