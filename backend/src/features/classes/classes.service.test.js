jest.mock('./classes.repository');
jest.mock('../../shared/audit');
jest.mock('../school-schedule/school-schedule.service');
jest.mock('../../config/database', () => ({
  $transaction: jest.fn((callback) => callback('MOCK_TX')),
}));

const repository = require('./classes.repository');
const { recordAuditEvent } = require('../../shared/audit');
const schoolScheduleService = require('../school-schedule/school-schedule.service');
const service = require('./classes.service');

const actingUser = { id: 'admin-1', schoolId: 'school-1' };

beforeEach(() => {
  jest.clearAllMocks();
  // Default: 'shift-1' is a valid, active Shift for 'school-1', and is the
  // school's own current Default Shift — a no-op unless a test explicitly
  // overrides this to exercise Shift-specific behavior.
  schoolScheduleService.getActiveShift.mockResolvedValue({ id: 'shift-1' });
  schoolScheduleService.validateShift.mockResolvedValue(true);
  // (ACR-009) Default: 'grade-level-1' is a valid, Active GradeLevel for
  // 'school-1', and is the school's own oldest one (createClass's own
  // default when gradeLevelId is omitted) — a no-op unless a test
  // explicitly overrides this to exercise GradeLevel-specific behavior.
  repository.findFirstActiveGradeLevel.mockResolvedValue({ id: 'grade-level-1' });
  repository.findGradeLevelById.mockResolvedValue({ id: 'grade-level-1', schoolId: 'school-1', status: 'ACTIVE' });
  repository.listOtherActiveClassesInGradeLevel.mockResolvedValue([]);
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

    expect(repository.create).toHaveBeenCalledWith(
      {
        schoolId: 'school-1',
        name: 'Grade 6',
        shiftId: 'shift-1',
        gradeLevelId: 'grade-level-1',
        sequenceOrder: 6,
      },
      'MOCK_TX'
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CLASS_CREATED', schoolId: 'school-1' })
    );
  });

  it('never derives schoolId from anywhere but the authenticated user', async () => {
    repository.findByName.mockResolvedValue(null);
    repository.listBySchool.mockResolvedValue([]);
    repository.create.mockResolvedValue({ id: 'new-class' });

    await service.createClass({ name: 'Grade 1', schoolId: 'attacker-school' }, actingUser);

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ schoolId: 'school-1' }), 'MOCK_TX');
  });

  it('defaults shiftId to the school\'s own current Default Shift when omitted (School Schedule Management)', async () => {
    repository.findByName.mockResolvedValue(null);
    repository.listBySchool.mockResolvedValue([]);
    repository.create.mockResolvedValue({ id: 'new-class' });
    schoolScheduleService.getActiveShift.mockResolvedValue({ id: 'default-shift-1' });

    await service.createClass({ name: 'Grade 1' }, actingUser);

    expect(schoolScheduleService.validateShift).toHaveBeenCalledWith('school-1', 'default-shift-1', 'MOCK_TX');
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ shiftId: 'default-shift-1' }), 'MOCK_TX');
  });

  it('rejects an explicit shiftId that is not a valid, active Shift for this school', async () => {
    repository.findByName.mockResolvedValue(null);
    schoolScheduleService.validateShift.mockResolvedValue(false);

    await expect(service.createClass({ name: 'Grade 1', shiftId: 'bogus-shift' }, actingUser)).rejects.toThrow(
      'Invalid Shift'
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects creation when no shiftId is given and the school has no Default Shift to fall back to', async () => {
    repository.findByName.mockResolvedValue(null);
    schoolScheduleService.getActiveShift.mockResolvedValue(null);

    await expect(service.createClass({ name: 'Grade 1' }, actingUser)).rejects.toThrow('A Shift is required');
    expect(repository.create).not.toHaveBeenCalled();
  });

  // (ACR-009, Architecture Update — Grade/Form)
  it('defaults gradeLevelId to the school\'s own oldest Active GradeLevel when omitted', async () => {
    repository.findByName.mockResolvedValue(null);
    repository.create.mockResolvedValue({ id: 'new-class' });
    repository.findFirstActiveGradeLevel.mockResolvedValue({ id: 'oldest-grade-level' });
    repository.findGradeLevelById.mockResolvedValue({ id: 'oldest-grade-level', schoolId: 'school-1', status: 'ACTIVE' });

    await service.createClass({ name: 'Grade 1' }, actingUser);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ gradeLevelId: 'oldest-grade-level' }),
      'MOCK_TX'
    );
  });

  it('rejects an explicit gradeLevelId that is not a valid, Active GradeLevel for this school', async () => {
    repository.findByName.mockResolvedValue(null);
    repository.findGradeLevelById.mockResolvedValue(null);

    await expect(
      service.createClass({ name: 'Grade 1', gradeLevelId: 'bogus-grade-level' }, actingUser)
    ).rejects.toThrow('Invalid Grade/Form');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects creation when no gradeLevelId is given and the school has no GradeLevel to fall back to', async () => {
    repository.findByName.mockResolvedValue(null);
    repository.findFirstActiveGradeLevel.mockResolvedValue(null);

    await expect(service.createClass({ name: 'Grade 1' }, actingUser)).rejects.toThrow('A Grade/Form is required');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects creation if the target GradeLevel already has an Active Class on a different Shift', async () => {
    repository.findByName.mockResolvedValue(null);
    repository.listOtherActiveClassesInGradeLevel.mockResolvedValue([
      { id: 'existing-class', shiftId: 'other-shift' },
    ]);

    await expect(
      service.createClass({ name: 'Grade 1', gradeLevelId: 'grade-level-1', shiftId: 'shift-1' }, actingUser)
    ).rejects.toThrow('Every Class within the same Grade/Form must use the same Shift as its other Classes');
    expect(repository.create).not.toHaveBeenCalled();
  });
});

describe('updateClass (ACR-009 — same-Shift-within-GradeLevel enforcement)', () => {
  it('re-validates the same-Shift invariant when only shiftId changes, not just when gradeLevelId changes', async () => {
    repository.findById.mockResolvedValue({
      id: 'c1',
      schoolId: 'school-1',
      status: 'ACTIVE',
      gradeLevelId: 'grade-level-1',
      shiftId: 'shift-1',
    });
    repository.findByName.mockResolvedValue(null);
    repository.listOtherActiveClassesInGradeLevel.mockResolvedValue([
      { id: 'sibling', shiftId: 'shift-1' },
    ]);
    schoolScheduleService.validateShift.mockResolvedValue(true);

    // Only shiftId is present in the body — gradeLevelId is left unchanged.
    await expect(
      service.updateClass('c1', { shiftId: 'new-shift' }, actingUser)
    ).rejects.toThrow('Every Class within the same Grade/Form must use the same Shift as its other Classes');
  });

  it('leaves the invariant unchecked when neither shiftId nor gradeLevelId is present in the request', async () => {
    repository.findById.mockResolvedValue({
      id: 'c1',
      schoolId: 'school-1',
      status: 'ACTIVE',
      gradeLevelId: 'grade-level-1',
      shiftId: 'shift-1',
    });
    repository.findByName.mockResolvedValue(null);
    repository.update.mockResolvedValue({ id: 'c1', name: 'Renamed' });

    await service.updateClass('c1', { name: 'Renamed' }, actingUser);

    expect(repository.listOtherActiveClassesInGradeLevel).not.toHaveBeenCalled();
    expect(repository.update).toHaveBeenCalledWith(
      'c1',
      { name: 'Renamed', shiftId: 'shift-1', gradeLevelId: 'grade-level-1' },
      'MOCK_TX'
    );
  });
});

describe('GradeLevel CRUD & lifecycle (ACR-009, Architecture Update — Grade/Form)', () => {
  it('rejects a duplicate name within the same school', async () => {
    repository.findGradeLevelByName.mockResolvedValue({ id: 'existing' });

    await expect(service.createGradeLevel({ name: 'Grade 8' }, actingUser)).rejects.toThrow(
      'A Grade/Form with this name already exists in your school'
    );
    expect(repository.createGradeLevel).not.toHaveBeenCalled();
  });

  it('appends a new GradeLevel at the end of the sequence, considering archived ones too', async () => {
    repository.findGradeLevelByName.mockResolvedValue(null);
    repository.listAllGradeLevelsBySchool.mockResolvedValue([
      { sequenceOrder: 1, status: 'ACTIVE' },
      { sequenceOrder: 3, status: 'ARCHIVED' },
    ]);
    repository.createGradeLevel.mockResolvedValue({ id: 'gl-new', sequenceOrder: 4 });

    await service.createGradeLevel({ name: 'Grade 9' }, actingUser);

    expect(repository.createGradeLevel).toHaveBeenCalledWith(
      { schoolId: 'school-1', name: 'Grade 9', sequenceOrder: 4 },
      'MOCK_TX'
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'GRADE_LEVEL_CREATED', schoolId: 'school-1' })
    );
  });

  it('blocks archiving a GradeLevel referenced by an active Class', async () => {
    repository.findGradeLevelById.mockResolvedValue({ id: 'gl1', schoolId: 'school-1', status: 'ACTIVE' });
    repository.countActiveClassesByGradeLevel.mockResolvedValue(2);

    await expect(service.archiveGradeLevel('gl1', actingUser)).rejects.toThrow(
      'This Grade/Form is referenced by an active Class and cannot be archived'
    );
    expect(repository.archiveGradeLevel).not.toHaveBeenCalled();
  });

  it('archives a GradeLevel with no active Class references', async () => {
    repository.findGradeLevelById.mockResolvedValue({ id: 'gl1', schoolId: 'school-1', status: 'ACTIVE' });
    repository.countActiveClassesByGradeLevel.mockResolvedValue(0);
    repository.archiveGradeLevel.mockResolvedValue({ id: 'gl1', status: 'ARCHIVED' });

    await service.archiveGradeLevel('gl1', actingUser);

    expect(repository.archiveGradeLevel).toHaveBeenCalledWith('gl1');
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'GRADE_LEVEL_ARCHIVED' })
    );
  });

  it('reactivateGradeLevel appends to the end of the sequence, never restoring the old position', async () => {
    repository.findGradeLevelById.mockResolvedValue({ id: 'gl1', schoolId: 'school-1', status: 'ARCHIVED', sequenceOrder: 1 });
    repository.listAllGradeLevelsBySchool.mockResolvedValue([
      { sequenceOrder: 1, status: 'ARCHIVED' },
      { sequenceOrder: 3, status: 'ACTIVE' },
    ]);
    repository.reactivateGradeLevel.mockResolvedValue({ id: 'gl1', status: 'ACTIVE', sequenceOrder: 4 });

    await service.reactivateGradeLevel('gl1', actingUser);

    expect(repository.reactivateGradeLevel).toHaveBeenCalledWith('gl1', 4);
  });

  it('rejects reordering an archived GradeLevel', async () => {
    repository.findGradeLevelById.mockResolvedValue({ id: 'gl1', schoolId: 'school-1', status: 'ARCHIVED' });

    await expect(service.reorderGradeLevel('gl1', 1, actingUser)).rejects.toThrow(
      'An archived Grade/Form cannot be reordered'
    );
    expect(repository.reorderGradeLevels).not.toHaveBeenCalled();
  });
});

describe('GradeLevel narrow public interface (Weekly Subject Allocation — future consumer)', () => {
  it('getGradeLevelShift returns the one shiftId every Active member Class shares', async () => {
    repository.findGradeLevelById.mockResolvedValue({ id: 'gl1', schoolId: 'school-1' });
    repository.listOtherActiveClassesInGradeLevel.mockResolvedValue([
      { id: 'c1', shiftId: 'shift-1' },
      { id: 'c2', shiftId: 'shift-1' },
    ]);

    const shiftId = await service.getGradeLevelShift('school-1', 'gl1');

    expect(shiftId).toBe('shift-1');
  });

  it('getGradeLevelShift returns null when the GradeLevel has no member Classes yet', async () => {
    repository.findGradeLevelById.mockResolvedValue({ id: 'gl1', schoolId: 'school-1' });
    repository.listOtherActiveClassesInGradeLevel.mockResolvedValue([]);

    const shiftId = await service.getGradeLevelShift('school-1', 'gl1');

    expect(shiftId).toBeNull();
  });

  it('getGradeLevelShift returns null for a cross-school GradeLevel', async () => {
    repository.findGradeLevelById.mockResolvedValue({ id: 'gl1', schoolId: 'other-school' });

    const shiftId = await service.getGradeLevelShift('school-1', 'gl1');

    expect(shiftId).toBeNull();
  });

  it('validateGradeLevel is true only for an Active GradeLevel belonging to the school', async () => {
    repository.findGradeLevelById.mockResolvedValue({ id: 'gl1', schoolId: 'school-1', status: 'ACTIVE' });
    await expect(service.validateGradeLevel('school-1', 'gl1')).resolves.toBe(true);

    repository.findGradeLevelById.mockResolvedValue({ id: 'gl1', schoolId: 'school-1', status: 'ARCHIVED' });
    await expect(service.validateGradeLevel('school-1', 'gl1')).resolves.toBe(false);

    repository.findGradeLevelById.mockResolvedValue({ id: 'gl1', schoolId: 'other-school', status: 'ACTIVE' });
    await expect(service.validateGradeLevel('school-1', 'gl1')).resolves.toBe(false);
  });

  it('listActiveClassesByGradeLevel returns the Grade/Form\'s own Active member Classes', async () => {
    repository.findGradeLevelById.mockResolvedValue({ id: 'gl1', schoolId: 'school-1' });
    repository.listActiveClassesByGradeLevel.mockResolvedValue([{ id: 'c1', name: 'G8A' }]);

    const result = await service.listActiveClassesByGradeLevel('school-1', 'gl1');

    expect(result).toEqual([{ id: 'c1', name: 'G8A' }]);
  });

  it('listActiveClassesByGradeLevel returns an empty array for a cross-school GradeLevel', async () => {
    repository.findGradeLevelById.mockResolvedValue({ id: 'gl1', schoolId: 'other-school' });

    const result = await service.listActiveClassesByGradeLevel('school-1', 'gl1');

    expect(result).toEqual([]);
    expect(repository.listActiveClassesByGradeLevel).not.toHaveBeenCalled();
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
    repository.findById.mockResolvedValue({
      id: 'c1',
      schoolId: 'school-1',
      status: 'ARCHIVED',
      sequenceOrder: 2,
      gradeLevelId: 'grade-level-1',
      shiftId: 'shift-1',
    });
    repository.listBySchool.mockResolvedValue([
      { sequenceOrder: 1, status: 'ACTIVE' },
      { sequenceOrder: 2, status: 'ARCHIVED' },
      { sequenceOrder: 4, status: 'ACTIVE' },
    ]);
    repository.reactivate.mockResolvedValue({ id: 'c1', sequenceOrder: 5, status: 'ACTIVE' });

    await service.reactivateClass('c1', actingUser);

    // next position must be max(existing)+1 = 5, not the Class's old position (2)
    expect(repository.reactivate).toHaveBeenCalledWith('c1', 5, 'MOCK_TX');
  });

  // (ACR-009, Technical Design Review finding) An Archived Class's own
  // GradeLevel membership cannot be assumed still valid — reactivation must
  // re-clear the same same-Shift gate a fresh create/update would, since a
  // different Class could have joined that same GradeLevel on a different
  // Shift while this one sat archived.
  it('rejects reactivation if a sibling Class in the same GradeLevel now uses a different Shift', async () => {
    repository.findById.mockResolvedValue({
      id: 'c1',
      schoolId: 'school-1',
      status: 'ARCHIVED',
      sequenceOrder: 2,
      gradeLevelId: 'grade-level-1',
      shiftId: 'shift-1',
    });
    repository.listOtherActiveClassesInGradeLevel.mockResolvedValue([
      { id: 'c2', shiftId: 'shift-2' },
    ]);

    await expect(service.reactivateClass('c1', actingUser)).rejects.toThrow(
      'Every Class within the same Grade/Form must use the same Shift as its other Classes'
    );
    expect(repository.reactivate).not.toHaveBeenCalled();
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
