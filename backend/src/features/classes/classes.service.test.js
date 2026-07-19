jest.mock('./classes.repository');
jest.mock('../../shared/audit');

const repository = require('./classes.repository');
const { recordAuditEvent } = require('../../shared/audit');
const service = require('./classes.service');

const actingUser = { id: 'admin-1', schoolId: 'school-1' };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createClass', () => {
  it('rejects a duplicate name within the same school (Business Rule #3)', async () => {
    repository.findByName.mockResolvedValue({ id: 'existing' });

    await expect(service.createClass({ name: 'Grade 1' }, actingUser)).rejects.toThrow(
      'A Class with this name already exists in your school'
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('appends a new Class at the end of the sequence, considering archived Classes too', async () => {
    repository.findByName.mockResolvedValue(null);
    repository.listBySchool.mockResolvedValue([
      { sequenceOrder: 1, status: 'ACTIVE' },
      { sequenceOrder: 5, status: 'ARCHIVED' }, // stale archived position must still count
      { sequenceOrder: 3, status: 'ACTIVE' },
    ]);
    repository.create.mockResolvedValue({ id: 'new-class', sequenceOrder: 6 });

    await service.createClass({ name: 'Grade 6' }, actingUser);

    expect(repository.create).toHaveBeenCalledWith({
      schoolId: 'school-1',
      name: 'Grade 6',
      sequenceOrder: 6,
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CLASS_CREATED', schoolId: 'school-1' })
    );
  });

  it('never derives schoolId from anywhere but the authenticated user', async () => {
    repository.findByName.mockResolvedValue(null);
    repository.listBySchool.mockResolvedValue([]);
    repository.create.mockResolvedValue({ id: 'new-class' });

    await service.createClass({ name: 'Grade 1', schoolId: 'attacker-school' }, actingUser);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'school-1' })
    );
  });
});

describe('designateFinalClass (Business Rule #7)', () => {
  it('rejects designating an archived Class as final', async () => {
    repository.findById.mockResolvedValue({ id: 'c1', schoolId: 'school-1', status: 'ARCHIVED' });

    await expect(service.designateFinalClass('c1', actingUser)).rejects.toThrow(
      'An archived Class cannot be designated as the final Class'
    );
    expect(repository.designateFinalClass).not.toHaveBeenCalled();
  });

  it('rejects a Class belonging to another school (tenant isolation)', async () => {
    repository.findById.mockResolvedValue({ id: 'c1', schoolId: 'other-school', status: 'ACTIVE' });

    await expect(service.designateFinalClass('c1', actingUser)).rejects.toThrow('Class not found');
  });

  it('designates an active Class as final', async () => {
    repository.findById
      .mockResolvedValueOnce({ id: 'c1', schoolId: 'school-1', status: 'ACTIVE' })
      .mockResolvedValueOnce({ id: 'c1', schoolId: 'school-1', status: 'ACTIVE', isFinal: true });

    const result = await service.designateFinalClass('c1', actingUser);

    expect(repository.designateFinalClass).toHaveBeenCalledWith('school-1', 'c1');
    expect(result.isFinal).toBe(true);
  });
});

describe('archiveClass / reactivateClass (Business Rule #9, #11, #12)', () => {
  it('is idempotent when archiving an already-archived Class', async () => {
    const archived = { id: 'c1', schoolId: 'school-1', status: 'ARCHIVED' };
    repository.findById.mockResolvedValue(archived);

    const result = await service.archiveClass('c1', actingUser);

    expect(result).toBe(archived);
    expect(repository.archive).not.toHaveBeenCalled();
  });

  it('rejects archiving the currently-final Class (Business Rule #7 — regression)', async () => {
    repository.findById.mockResolvedValue({ id: 'c1', schoolId: 'school-1', status: 'ACTIVE', isFinal: true });

    await expect(service.archiveClass('c1', actingUser)).rejects.toThrow(
      'The final Class cannot be archived — designate a different Class as final first'
    );
    expect(repository.archive).not.toHaveBeenCalled();
  });

  it('allows archiving a non-final Class', async () => {
    repository.findById.mockResolvedValue({ id: 'c1', schoolId: 'school-1', status: 'ACTIVE', isFinal: false });
    repository.archive.mockResolvedValue({ id: 'c1', status: 'ARCHIVED' });

    await service.archiveClass('c1', actingUser);

    expect(repository.archive).toHaveBeenCalledWith('c1');
  });

  it('reactivation appends to the end of the sequence, never restoring the old position', async () => {
    repository.findById.mockResolvedValue({ id: 'c1', schoolId: 'school-1', status: 'ARCHIVED', sequenceOrder: 2 });
    repository.listBySchool.mockResolvedValue([
      { sequenceOrder: 1, status: 'ACTIVE' },
      { sequenceOrder: 2, status: 'ARCHIVED' },
      { sequenceOrder: 4, status: 'ACTIVE' },
    ]);
    repository.reactivate.mockResolvedValue({ id: 'c1', sequenceOrder: 5, status: 'ACTIVE' });

    await service.reactivateClass('c1', actingUser);

    // next position must be max(existing)+1 = 5, not the Class's old position (2)
    expect(repository.reactivate).toHaveBeenCalledWith('c1', 5);
  });

  it('no hard/soft delete function exists on the public interface (Business Rule #12)', () => {
    expect(service.deleteClass).toBeUndefined();
  });
});

describe('getSuggestedNextClass (Business Rule #6 — suggests, never enforces)', () => {
  it('returns the next active Class in sequence', async () => {
    repository.listActiveBySchoolOrdered.mockResolvedValue([
      { id: 'c1', sequenceOrder: 1 },
      { id: 'c2', sequenceOrder: 2 },
    ]);

    const next = await service.getSuggestedNextClass('school-1', 'c1');

    expect(next.id).toBe('c2');
  });

  it('returns null when the current Class is already last in sequence', async () => {
    repository.listActiveBySchoolOrdered.mockResolvedValue([{ id: 'c1', sequenceOrder: 1 }]);

    const next = await service.getSuggestedNextClass('school-1', 'c1');

    expect(next).toBeNull();
  });

  it('returns null when the current Class is not found in the active sequence (e.g. archived)', async () => {
    repository.listActiveBySchoolOrdered.mockResolvedValue([{ id: 'c2', sequenceOrder: 1 }]);

    const next = await service.getSuggestedNextClass('school-1', 'c1');

    expect(next).toBeNull();
  });
});

describe('reorderClass rejects an archived Class (regression)', () => {
  it('throws a clean ConflictError instead of crashing', async () => {
    repository.findById.mockResolvedValue({ id: 'c1', schoolId: 'school-1', status: 'ARCHIVED' });

    await expect(service.reorderClass('c1', 1, actingUser)).rejects.toThrow('An archived Class cannot be reordered');
    expect(repository.reorder).not.toHaveBeenCalled();
  });
});

describe('listActiveSectionsForClass (ACR-002 — Student Management interface)', () => {
  it('returns the active Sections for a Class belonging to the caller\'s school', async () => {
    repository.findById.mockResolvedValue({ id: 'c1', schoolId: 'school-1' });
    repository.listActiveSectionsForClass.mockResolvedValue([{ id: 's1', name: 'A' }]);

    const result = await service.listActiveSectionsForClass('school-1', 'c1');

    expect(repository.listActiveSectionsForClass).toHaveBeenCalledWith('c1');
    expect(result).toEqual([{ id: 's1', name: 'A' }]);
  });

  it('returns an empty array for a Class belonging to a different school (tenant isolation)', async () => {
    repository.findById.mockResolvedValue({ id: 'c1', schoolId: 'other-school' });

    const result = await service.listActiveSectionsForClass('school-1', 'c1');

    expect(result).toEqual([]);
    expect(repository.listActiveSectionsForClass).not.toHaveBeenCalled();
  });

  it('returns an empty array for a non-existent Class', async () => {
    repository.findById.mockResolvedValue(null);

    const result = await service.listActiveSectionsForClass('school-1', 'missing');

    expect(result).toEqual([]);
  });
});

describe('cross-tenant access (Multi-Tenancy)', () => {
  it('getClassOrThrow rejects a Class belonging to a different school', async () => {
    repository.findById.mockResolvedValue({ id: 'c1', schoolId: 'other-school' });

    await expect(service.getClassOrThrow('school-1', 'c1')).rejects.toThrow('Class not found');
  });

  it('getClassOrThrow rejects a non-existent Class', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(service.getClassOrThrow('school-1', 'missing')).rejects.toThrow('Class not found');
  });
});
