jest.mock('./academic-years.repository');
jest.mock('../../shared/audit');
// setCurrentAcademicYear/archiveAcademicYear wrap their writes in
// prisma.$transaction. Without mocking this, $transaction would open a real
// transaction against the real dev database on every test run here
// (repository is already mocked, but the raw prisma import isn't) — the
// same fix Teacher Management's own service tests already established,
// verified with a fake transaction runner that just invokes the callback
// synchronously with a recognizable fake client.
jest.mock('../../config/database', () => ({
  $transaction: jest.fn((callback) => callback('MOCK_TX')),
}));

const repository = require('./academic-years.repository');
const { recordAuditEvent } = require('../../shared/audit');
const service = require('./academic-years.service');

const actingUser = { id: 'admin-1', schoolId: 'school-1' };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createAcademicYear (Business Rules #3, #4, #9)', () => {
  it('rejects a date range overlapping an existing Active Academic Year', async () => {
    repository.listAllBySchool.mockResolvedValue([
      { id: 'ay1', startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31') },
    ]);

    await expect(
      service.createAcademicYear('school-1', { startDate: '2025-06-01', endDate: '2026-05-31' }, actingUser)
    ).rejects.toThrow('This date range overlaps an existing Academic Year at this school');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects a date range overlapping an existing Archived Academic Year (Business Review decision)', async () => {
    repository.listAllBySchool.mockResolvedValue([
      { id: 'ay1', startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31'), status: 'ARCHIVED' },
    ]);

    await expect(
      service.createAcademicYear('school-1', { startDate: '2025-06-01', endDate: '2026-05-31' }, actingUser)
    ).rejects.toThrow('This date range overlaps an existing Academic Year at this school');
  });

  it('rejects a non-overlapping range whose derived label duplicates an existing one', async () => {
    repository.listAllBySchool.mockResolvedValue([
      { id: 'ay1', startDate: new Date('2025-01-01'), endDate: new Date('2025-03-31') },
    ]);

    await expect(
      service.createAcademicYear('school-1', { startDate: '2025-09-01', endDate: '2025-11-30' }, actingUser)
    ).rejects.toThrow('An Academic Year labeled 2025/2025 already exists at this school');
  });

  it('creates successfully when no overlap or duplicate label exists', async () => {
    repository.listAllBySchool.mockResolvedValue([]);
    repository.countBySchool.mockResolvedValue(1);
    repository.create.mockResolvedValue({ id: 'ay-new' });

    await service.createAcademicYear('school-1', { startDate: '2025-09-01', endDate: '2026-06-30' }, actingUser);

    expect(repository.create).toHaveBeenCalledWith(
      { schoolId: 'school-1', startDate: new Date('2025-09-01'), endDate: new Date('2026-06-30') },
      'MOCK_TX'
    );
    expect(repository.setCurrent).not.toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ACADEMIC_YEAR_CREATED', schoolId: 'school-1' })
    );
  });

  it("automatically becomes Current when it's the school's first-ever Academic Year", async () => {
    repository.listAllBySchool.mockResolvedValue([]);
    repository.countBySchool.mockResolvedValue(0);
    repository.create.mockResolvedValue({ id: 'ay-first' });
    repository.setCurrent.mockResolvedValue({ id: 'ay-first', isCurrent: true });

    const result = await service.createAcademicYear(
      'school-1',
      { startDate: '2025-09-01', endDate: '2026-06-30' },
      actingUser
    );

    expect(repository.setCurrent).toHaveBeenCalledWith('ay-first', 'MOCK_TX');
    expect(result).toEqual({ id: 'ay-first', isCurrent: true });
  });
});

describe('updateAcademicYear (Business Rule #6)', () => {
  it('allows editing an Archived Academic Year (no lifecycle restriction on editing)', async () => {
    repository.findById.mockResolvedValue({ id: 'ay1', schoolId: 'school-1', status: 'ARCHIVED' });
    repository.listAllBySchool.mockResolvedValue([]);
    repository.update.mockResolvedValue({ id: 'ay1' });

    await service.updateAcademicYear(
      'school-1',
      'ay1',
      { startDate: '2027-01-01', endDate: '2027-12-31' },
      actingUser
    );

    expect(repository.update).toHaveBeenCalledWith('ay1', {
      startDate: new Date('2027-01-01'),
      endDate: new Date('2027-12-31'),
    });
  });

  it('excludes itself from the overlap/duplicate-label check', async () => {
    repository.findById.mockResolvedValue({ id: 'ay1', schoolId: 'school-1', status: 'ACTIVE' });
    repository.listAllBySchool.mockResolvedValue([
      { id: 'ay1', startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31') },
    ]);
    repository.update.mockResolvedValue({ id: 'ay1' });

    await expect(
      service.updateAcademicYear('school-1', 'ay1', { startDate: '2025-01-01', endDate: '2025-12-31' }, actingUser)
    ).resolves.toBeDefined();
  });

  it('rejects updating a nonexistent Academic Year', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(
      service.updateAcademicYear('school-1', 'missing', { startDate: '2025-01-01', endDate: '2025-12-31' }, actingUser)
    ).rejects.toThrow('Academic Year not found');
  });
});

describe('designateCurrentAcademicYear (Business Rule #8)', () => {
  it('rejects designating an Archived Academic Year as Current', async () => {
    repository.findById.mockResolvedValue({ id: 'ay1', schoolId: 'school-1', status: 'ARCHIVED', isCurrent: false });

    await expect(service.designateCurrentAcademicYear('school-1', 'ay1', actingUser)).rejects.toThrow(
      'Cannot designate an Archived Academic Year as Current'
    );
  });

  it('is a no-op when the target is already Current', async () => {
    const current = { id: 'ay1', schoolId: 'school-1', status: 'ACTIVE', isCurrent: true };
    repository.findById.mockResolvedValue(current);

    const result = await service.designateCurrentAcademicYear('school-1', 'ay1', actingUser);

    expect(result).toBe(current);
    expect(repository.unsetCurrent).not.toHaveBeenCalled();
  });

  it('unsets the previous Current and sets the new one atomically', async () => {
    repository.findById.mockResolvedValue({ id: 'ay2', schoolId: 'school-1', status: 'ACTIVE', isCurrent: false });
    repository.findCurrentBySchool.mockResolvedValue({ id: 'ay1' });
    repository.setCurrent.mockResolvedValue({ id: 'ay2', isCurrent: true });

    await service.designateCurrentAcademicYear('school-1', 'ay2', actingUser);

    expect(repository.unsetCurrent).toHaveBeenCalledWith('school-1', 'MOCK_TX');
    expect(repository.setCurrent).toHaveBeenCalledWith('ay2', 'MOCK_TX');
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ACADEMIC_YEAR_CURRENT_CHANGED',
        metadata: { previousCurrentId: 'ay1', newCurrentId: 'ay2' },
      })
    );
  });
});

describe('archiveAcademicYear (Business Rules #5, #9)', () => {
  it('is a no-op on an already-Archived Academic Year', async () => {
    const archived = { id: 'ay1', schoolId: 'school-1', status: 'ARCHIVED', isCurrent: false };
    repository.findById.mockResolvedValue(archived);

    const result = await service.archiveAcademicYear('school-1', 'ay1', undefined, actingUser);

    expect(result).toBe(archived);
    expect(repository.archive).not.toHaveBeenCalled();
  });

  it('archives directly when the target is not Current', async () => {
    repository.findById.mockResolvedValue({ id: 'ay1', schoolId: 'school-1', status: 'ACTIVE', isCurrent: false });
    repository.archive.mockResolvedValue({ id: 'ay1', status: 'ARCHIVED' });

    await service.archiveAcademicYear('school-1', 'ay1', undefined, actingUser);

    expect(repository.archive).toHaveBeenCalledWith('ay1', 'MOCK_TX');
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACADEMIC_YEAR_ARCHIVED' }));
  });

  it('rejects archiving the Current Academic Year without a replacement', async () => {
    repository.findById.mockResolvedValue({ id: 'ay1', schoolId: 'school-1', status: 'ACTIVE', isCurrent: true });

    await expect(service.archiveAcademicYear('school-1', 'ay1', undefined, actingUser)).rejects.toThrow(
      'Cannot archive the Current Academic Year without designating a replacement — provide newCurrentAcademicYearId'
    );
    expect(repository.archive).not.toHaveBeenCalled();
  });

  it('rejects a replacement that is the same record being archived', async () => {
    repository.findById.mockResolvedValueOnce({ id: 'ay1', schoolId: 'school-1', status: 'ACTIVE', isCurrent: true });
    repository.findById.mockResolvedValueOnce({ id: 'ay1', schoolId: 'school-1', status: 'ACTIVE', isCurrent: true });

    await expect(service.archiveAcademicYear('school-1', 'ay1', 'ay1', actingUser)).rejects.toThrow(
      'The replacement Academic Year must be different from the one being archived'
    );
  });

  it('rejects a replacement that is not Active', async () => {
    repository.findById.mockResolvedValueOnce({ id: 'ay1', schoolId: 'school-1', status: 'ACTIVE', isCurrent: true });
    repository.findById.mockResolvedValueOnce({ id: 'ay2', schoolId: 'school-1', status: 'ARCHIVED' });

    await expect(service.archiveAcademicYear('school-1', 'ay1', 'ay2', actingUser)).rejects.toThrow(
      'The replacement Academic Year must be Active'
    );
  });

  it('archives and hands off Current atomically when a valid replacement is given', async () => {
    repository.findById.mockResolvedValueOnce({ id: 'ay1', schoolId: 'school-1', status: 'ACTIVE', isCurrent: true });
    repository.findById.mockResolvedValueOnce({ id: 'ay2', schoolId: 'school-1', status: 'ACTIVE', isCurrent: false });
    repository.archive.mockResolvedValue({ id: 'ay1', status: 'ARCHIVED' });

    await service.archiveAcademicYear('school-1', 'ay1', 'ay2', actingUser);

    expect(repository.unsetCurrent).toHaveBeenCalledWith('school-1', 'MOCK_TX');
    expect(repository.setCurrent).toHaveBeenCalledWith('ay2', 'MOCK_TX');
    expect(repository.archive).toHaveBeenCalledWith('ay1', 'MOCK_TX');
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ACADEMIC_YEAR_CURRENT_CHANGED' })
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACADEMIC_YEAR_ARCHIVED' }));
  });
});

describe('reactivateAcademicYear (Business Rule #5)', () => {
  it('is a no-op on an already-Active Academic Year', async () => {
    const active = { id: 'ay1', schoolId: 'school-1', status: 'ACTIVE' };
    repository.findById.mockResolvedValue(active);

    const result = await service.reactivateAcademicYear('school-1', 'ay1', actingUser);

    expect(result).toBe(active);
    expect(repository.reactivate).not.toHaveBeenCalled();
  });

  it('reactivates an Archived Academic Year without changing isCurrent', async () => {
    repository.findById.mockResolvedValue({ id: 'ay1', schoolId: 'school-1', status: 'ARCHIVED' });
    repository.reactivate.mockResolvedValue({ id: 'ay1', status: 'ACTIVE' });

    await service.reactivateAcademicYear('school-1', 'ay1', actingUser);

    expect(repository.reactivate).toHaveBeenCalledWith('ay1');
    expect(repository.setCurrent).not.toHaveBeenCalled();
  });
});

describe('stable public service interface', () => {
  it('getAcademicYearById returns null for a cross-tenant id', async () => {
    repository.findById.mockResolvedValue({ id: 'ay1', schoolId: 'school-2' });
    await expect(service.getAcademicYearById('school-1', 'ay1')).resolves.toBeNull();
  });

  it('getAcademicYearById returns the record for the correct tenant', async () => {
    const year = { id: 'ay1', schoolId: 'school-1' };
    repository.findById.mockResolvedValue(year);
    await expect(service.getAcademicYearById('school-1', 'ay1')).resolves.toBe(year);
  });

  it('getCurrentAcademicYear delegates to the repository', async () => {
    repository.findCurrentBySchool.mockResolvedValue({ id: 'ay1', isCurrent: true });
    await expect(service.getCurrentAcademicYear('school-1')).resolves.toEqual({ id: 'ay1', isCurrent: true });
  });

  it('listActiveAcademicYears filters to ACTIVE only', async () => {
    repository.listBySchool.mockResolvedValue([]);
    await service.listActiveAcademicYears('school-1');
    expect(repository.listBySchool).toHaveBeenCalledWith('school-1', { status: 'ACTIVE' });
  });
});
