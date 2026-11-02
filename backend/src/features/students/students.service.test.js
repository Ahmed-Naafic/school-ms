jest.mock('./students.repository');
jest.mock('../../shared/audit');
jest.mock('../auth/auth.service');
jest.mock('../classes/classes.service');
jest.mock('../academic-years/academic-years.service');

const repository = require('./students.repository');
const { recordAuditEvent } = require('../../shared/audit');
const authService = require('../auth/auth.service');
const classesService = require('../classes/classes.service');
const academicYearsService = require('../academic-years/academic-years.service');
const service = require('./students.service');

const actingUser = { id: 'admin-1', schoolId: 'school-1' };

beforeEach(() => {
  jest.clearAllMocks();
  // (ACR-002) Default: the target Class has no active Sections, so
  // assertSectionEnrollable is a no-op unless a test explicitly overrides
  // this to exercise Section-specific behavior.
  classesService.listActiveSectionsForClass.mockResolvedValue([]);
  // (ACR-004) Default: 'ay1' is a valid, non-Archived Academic Year for
  // 'school-1', so assertAcademicYearEnrollable is a no-op unless a test
  // explicitly overrides this to exercise Academic-Year-specific behavior.
  academicYearsService.getAcademicYearById.mockResolvedValue({ id: 'ay1', schoolId: 'school-1', status: 'ACTIVE' });
  academicYearsService.getCurrentAcademicYear.mockResolvedValue({ id: 'ay1', schoolId: 'school-1', status: 'ACTIVE' });
});

describe('admitStudent (Business Rules #1, #3)', () => {
  it('creates a login account before creating the Student record', async () => {
    authService.createAccount.mockResolvedValue({ id: 'account-1' });
    repository.create.mockResolvedValue({ id: 'student-1', accountId: 'account-1' });

    await service.admitStudent({ email: 'a@example.com', fullName: 'A Student' }, actingUser);

    expect(authService.createAccount).toHaveBeenCalledWith(
      { email: 'a@example.com', role: 'STUDENT', schoolId: 'school-1' },
      actingUser
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'school-1', accountId: 'account-1', fullName: 'A Student' })
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'STUDENT_ADMITTED' }));
  });
});

describe('enrollStudent / assertClassEnrollable (Business Rule #9)', () => {
  it('rejects enrollment into an archived Class', async () => {
    repository.findById.mockResolvedValue({ id: 's1', schoolId: 'school-1', status: 'ACTIVE' });
    classesService.getClassById.mockResolvedValue({ id: 'c1', schoolId: 'school-1', status: 'ARCHIVED' });

    await expect(
      service.enrollStudent('s1', { classId: 'c1', academicYearId: 'ay1' }, actingUser)
    ).rejects.toThrow('This Class is archived and cannot accept new Enrollment');
    expect(repository.createEnrollment).not.toHaveBeenCalled();
  });

  it('rejects enrollment into a Class belonging to a different school', async () => {
    repository.findById.mockResolvedValue({ id: 's1', schoolId: 'school-1', status: 'ACTIVE' });
    classesService.getClassById.mockResolvedValue({ id: 'c1', schoolId: 'other-school', status: 'ACTIVE' });

    await expect(
      service.enrollStudent('s1', { classId: 'c1', academicYearId: 'ay1' }, actingUser)
    ).rejects.toThrow('Class not found');
  });

  it.each(['TRANSFERRED', 'WITHDRAWN', 'GRADUATED'])(
    'rejects enrolling a %s Student, even into a valid Class (regression — permanence must not be bypassable via Enrollment)',
    async (status) => {
      repository.findById.mockResolvedValue({ id: 's1', schoolId: 'school-1', status });

      await expect(
        service.enrollStudent('s1', { classId: 'c1', academicYearId: 'ay1' }, actingUser)
      ).rejects.toThrow('Only an active Student may be enrolled');
      expect(repository.createEnrollment).not.toHaveBeenCalled();
    }
  );
});

describe('enrollStudent Section reference (ACR-002, Business Rule #18)', () => {
  beforeEach(() => {
    repository.findById.mockResolvedValue({ id: 's1', schoolId: 'school-1', status: 'ACTIVE' });
    classesService.getClassById.mockResolvedValue({ id: 'c1', schoolId: 'school-1', status: 'ACTIVE' });
  });

  it('requires a sectionId when the Class has active Sections', async () => {
    classesService.listActiveSectionsForClass.mockResolvedValue([{ id: 'sec-a', name: 'A' }]);

    await expect(
      service.enrollStudent('s1', { classId: 'c1', academicYearId: 'ay1' }, actingUser)
    ).rejects.toThrow('A Section is required');
    expect(repository.createEnrollment).not.toHaveBeenCalled();
  });

  it('rejects a sectionId that does not belong to the selected Class (wrong Class, archived, or nonexistent)', async () => {
    classesService.listActiveSectionsForClass.mockResolvedValue([{ id: 'sec-a', name: 'A' }]);

    await expect(
      service.enrollStudent('s1', { classId: 'c1', sectionId: 'sec-from-elsewhere', academicYearId: 'ay1' }, actingUser)
    ).rejects.toThrow('Invalid Section');
    expect(repository.createEnrollment).not.toHaveBeenCalled();
  });

  it('accepts a valid sectionId belonging to the selected Class', async () => {
    classesService.listActiveSectionsForClass.mockResolvedValue([{ id: 'sec-a', name: 'A' }]);
    repository.createEnrollment.mockResolvedValue({ id: 'enr-1', classId: 'c1', sectionId: 'sec-a' });

    await service.enrollStudent('s1', { classId: 'c1', sectionId: 'sec-a', academicYearId: 'ay1' }, actingUser);

    expect(repository.createEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({ classId: 'c1', sectionId: 'sec-a' })
    );
  });

  it('allows omitting sectionId when the Class has no active Sections', async () => {
    classesService.listActiveSectionsForClass.mockResolvedValue([]);
    repository.createEnrollment.mockResolvedValue({ id: 'enr-1', classId: 'c1', sectionId: null });

    await service.enrollStudent('s1', { classId: 'c1', academicYearId: 'ay1' }, actingUser);

    expect(repository.createEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({ classId: 'c1', sectionId: null })
    );
  });
});

describe('enrollStudent Academic Year reference (ACR-004, Business Rules #21, #22)', () => {
  beforeEach(() => {
    repository.findById.mockResolvedValue({ id: 's1', schoolId: 'school-1', status: 'ACTIVE' });
    classesService.getClassById.mockResolvedValue({ id: 'c1', schoolId: 'school-1', status: 'ACTIVE' });
  });

  it('rejects Enrollment with no academicYearId (Business Rule #22 — no valid value to supply when the school has none)', async () => {
    await expect(
      service.enrollStudent('s1', { classId: 'c1' }, actingUser)
    ).rejects.toThrow('An Academic Year is required');
    expect(academicYearsService.getAcademicYearById).not.toHaveBeenCalled();
    expect(repository.createEnrollment).not.toHaveBeenCalled();
  });

  it('rejects a nonexistent or cross-school academicYearId', async () => {
    academicYearsService.getAcademicYearById.mockResolvedValue(null);

    await expect(
      service.enrollStudent('s1', { classId: 'c1', academicYearId: 'other-school-ay' }, actingUser)
    ).rejects.toThrow('Invalid Academic Year');
    expect(repository.createEnrollment).not.toHaveBeenCalled();
  });

  it('rejects an Archived academicYearId', async () => {
    academicYearsService.getAcademicYearById.mockResolvedValue({ id: 'ay1', schoolId: 'school-1', status: 'ARCHIVED' });

    await expect(
      service.enrollStudent('s1', { classId: 'c1', academicYearId: 'ay1' }, actingUser)
    ).rejects.toThrow('Invalid Academic Year');
    expect(repository.createEnrollment).not.toHaveBeenCalled();
  });

  it('accepts a valid, non-Archived academicYearId belonging to the school', async () => {
    repository.createEnrollment.mockResolvedValue({ id: 'enr-1', classId: 'c1', academicYearId: 'ay1' });

    await service.enrollStudent('s1', { classId: 'c1', academicYearId: 'ay1' }, actingUser);

    expect(academicYearsService.getAcademicYearById).toHaveBeenCalledWith('school-1', 'ay1');
    expect(repository.createEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({ classId: 'c1', academicYearId: 'ay1' })
    );
  });
});

describe('promoteStudent (Business Rules #6, #10)', () => {
  const baseStudent = { id: 's1', schoolId: 'school-1', status: 'ACTIVE' };

  it('uses the suggested next Class when none is explicitly given', async () => {
    repository.findById.mockResolvedValue(baseStudent);
    repository.findLatestEnrollment.mockResolvedValue({ classId: 'grade-1' });
    classesService.getSuggestedNextClass.mockResolvedValue({ id: 'grade-2' });
    classesService.getClassById.mockResolvedValue({ id: 'grade-2', schoolId: 'school-1', status: 'ACTIVE' });
    classesService.getFinalClass.mockResolvedValue({ id: 'grade-5' });
    repository.createEnrollment.mockResolvedValue({ id: 'enr-2', classId: 'grade-2' });

    await service.promoteStudent('s1', { academicYearId: 'ay1' }, actingUser);

    expect(repository.createEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({ classId: 'grade-2' })
    );
    expect(repository.updateStatus).not.toHaveBeenCalled();
  });

  it('lets School Admin override the suggested Class (Business Rule #6)', async () => {
    repository.findById.mockResolvedValue(baseStudent);
    repository.findLatestEnrollment.mockResolvedValue({ classId: 'grade-1' });
    classesService.getClassById.mockResolvedValue({ id: 'grade-3', schoolId: 'school-1', status: 'ACTIVE' });
    classesService.getFinalClass.mockResolvedValue({ id: 'grade-5' });
    repository.createEnrollment.mockResolvedValue({ id: 'enr-2', classId: 'grade-3' });

    await service.promoteStudent('s1', { classId: 'grade-3', academicYearId: 'ay1' }, actingUser);

    expect(classesService.getSuggestedNextClass).not.toHaveBeenCalled();
    expect(repository.createEnrollment).toHaveBeenCalledWith(expect.objectContaining({ classId: 'grade-3' }));
  });

  it('transitions to ELIGIBLE_FOR_GRADUATION when promoted into the final Class', async () => {
    repository.findById.mockResolvedValue(baseStudent);
    repository.findLatestEnrollment.mockResolvedValue({ classId: 'grade-4' });
    classesService.getClassById.mockResolvedValue({ id: 'grade-5', schoolId: 'school-1', status: 'ACTIVE' });
    classesService.getFinalClass.mockResolvedValue({ id: 'grade-5' });
    repository.createEnrollment.mockResolvedValue({ id: 'enr-5', classId: 'grade-5' });

    await service.promoteStudent('s1', { classId: 'grade-5', academicYearId: 'ay1' }, actingUser);

    expect(repository.updateStatus).toHaveBeenCalledWith('s1', 'ELIGIBLE_FOR_GRADUATION');
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'STUDENT_ELIGIBLE_FOR_GRADUATION' })
    );
  });

  it('rejects promotion of a non-ACTIVE Student', async () => {
    repository.findById.mockResolvedValue({ ...baseStudent, status: 'WITHDRAWN' });

    await expect(
      service.promoteStudent('s1', { academicYearId: 'ay1' }, actingUser)
    ).rejects.toThrow('Only an active Student may be promoted');
  });

  it('requires an existing Enrollment before promotion', async () => {
    repository.findById.mockResolvedValue(baseStudent);
    repository.findLatestEnrollment.mockResolvedValue(null);

    await expect(
      service.promoteStudent('s1', { academicYearId: 'ay1' }, actingUser)
    ).rejects.toThrow('Student must be enrolled before they can be promoted');
  });
});

describe('promoteStudent Section matching (ACR-002, Business Rule #19)', () => {
  const baseStudent = { id: 's1', schoolId: 'school-1', status: 'ACTIVE' };

  it('suggests a same-named Section in the destination Class when the current Enrollment has one', async () => {
    repository.findById.mockResolvedValue(baseStudent);
    repository.findLatestEnrollment.mockResolvedValue({ classId: 'grade-1', sectionId: 'g1-sec-a' });
    classesService.getClassById.mockResolvedValue({ id: 'grade-2', schoolId: 'school-1', status: 'ACTIVE' });
    classesService.getFinalClass.mockResolvedValue(null);
    classesService.listActiveSectionsForClass.mockImplementation((schoolId, classId) => {
      if (classId === 'grade-1') return Promise.resolve([{ id: 'g1-sec-a', name: 'A' }]);
      if (classId === 'grade-2') return Promise.resolve([{ id: 'g2-sec-a', name: 'A' }, { id: 'g2-sec-b', name: 'B' }]);
      return Promise.resolve([]);
    });
    repository.createEnrollment.mockResolvedValue({ id: 'enr-2', classId: 'grade-2', sectionId: 'g2-sec-a' });

    await service.promoteStudent('s1', { classId: 'grade-2', academicYearId: 'ay1' }, actingUser);

    expect(repository.createEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({ classId: 'grade-2', sectionId: 'g2-sec-a' })
    );
  });

  it('leaves the Section unset (and requires explicit choice) when no same-named Section exists in the destination Class', async () => {
    repository.findById.mockResolvedValue(baseStudent);
    repository.findLatestEnrollment.mockResolvedValue({ classId: 'grade-1', sectionId: 'g1-sec-a' });
    classesService.getClassById.mockResolvedValue({ id: 'grade-2', schoolId: 'school-1', status: 'ACTIVE' });
    classesService.listActiveSectionsForClass.mockImplementation((schoolId, classId) => {
      if (classId === 'grade-1') return Promise.resolve([{ id: 'g1-sec-a', name: 'A' }]);
      if (classId === 'grade-2') return Promise.resolve([{ id: 'g2-sec-x', name: 'X' }]);
      return Promise.resolve([]);
    });

    await expect(
      service.promoteStudent('s1', { classId: 'grade-2', academicYearId: 'ay1' }, actingUser)
    ).rejects.toThrow('A Section is required');
    expect(repository.createEnrollment).not.toHaveBeenCalled();
  });

  it('an explicitly-chosen sectionId always wins over the same-name suggestion', async () => {
    repository.findById.mockResolvedValue(baseStudent);
    repository.findLatestEnrollment.mockResolvedValue({ classId: 'grade-1', sectionId: 'g1-sec-a' });
    classesService.getClassById.mockResolvedValue({ id: 'grade-2', schoolId: 'school-1', status: 'ACTIVE' });
    classesService.getFinalClass.mockResolvedValue(null);
    classesService.listActiveSectionsForClass.mockImplementation((schoolId, classId) => {
      if (classId === 'grade-2') return Promise.resolve([{ id: 'g2-sec-a', name: 'A' }, { id: 'g2-sec-b', name: 'B' }]);
      return Promise.resolve([]);
    });
    repository.createEnrollment.mockResolvedValue({ id: 'enr-2', classId: 'grade-2', sectionId: 'g2-sec-b' });

    await service.promoteStudent(
      's1',
      { classId: 'grade-2', sectionId: 'g2-sec-b', academicYearId: 'ay1' },
      actingUser
    );

    expect(repository.createEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({ classId: 'grade-2', sectionId: 'g2-sec-b' })
    );
  });

  it('promotes without a Section when neither the current nor destination Class has any', async () => {
    repository.findById.mockResolvedValue(baseStudent);
    repository.findLatestEnrollment.mockResolvedValue({ classId: 'grade-1', sectionId: null });
    classesService.getClassById.mockResolvedValue({ id: 'grade-2', schoolId: 'school-1', status: 'ACTIVE' });
    classesService.getFinalClass.mockResolvedValue(null);
    classesService.listActiveSectionsForClass.mockResolvedValue([]);
    repository.createEnrollment.mockResolvedValue({ id: 'enr-2', classId: 'grade-2', sectionId: null });

    await service.promoteStudent('s1', { classId: 'grade-2', academicYearId: 'ay1' }, actingUser);

    expect(repository.createEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({ classId: 'grade-2', sectionId: null })
    );
  });
});

describe('promoteStudent Academic Year default (ACR-004, Business Rules #21, #23)', () => {
  const baseStudent = { id: 's1', schoolId: 'school-1', status: 'ACTIVE' };

  beforeEach(() => {
    repository.findById.mockResolvedValue(baseStudent);
    repository.findLatestEnrollment.mockResolvedValue({ classId: 'grade-1' });
    classesService.getClassById.mockResolvedValue({ id: 'grade-2', schoolId: 'school-1', status: 'ACTIVE' });
    classesService.getFinalClass.mockResolvedValue(null);
    repository.createEnrollment.mockResolvedValue({ id: 'enr-2', classId: 'grade-2', academicYearId: 'ay1' });
  });

  it('defaults to the school\'s Current Academic Year when academicYearId is omitted', async () => {
    await service.promoteStudent('s1', { classId: 'grade-2' }, actingUser);

    expect(academicYearsService.getCurrentAcademicYear).toHaveBeenCalledWith('school-1');
    expect(repository.createEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({ classId: 'grade-2', academicYearId: 'ay1' })
    );
  });

  it('an explicitly-chosen academicYearId always wins over the Current-Academic-Year default', async () => {
    academicYearsService.getAcademicYearById.mockResolvedValue({ id: 'ay2', schoolId: 'school-1', status: 'ACTIVE' });

    await service.promoteStudent('s1', { classId: 'grade-2', academicYearId: 'ay2' }, actingUser);

    expect(academicYearsService.getCurrentAcademicYear).not.toHaveBeenCalled();
    expect(repository.createEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({ classId: 'grade-2', academicYearId: 'ay2' })
    );
  });

  it('rejects Promotion when the school has no Current Academic Year and none was explicitly chosen (Business Rule #22)', async () => {
    academicYearsService.getCurrentAcademicYear.mockResolvedValue(null);

    await expect(
      service.promoteStudent('s1', { classId: 'grade-2' }, actingUser)
    ).rejects.toThrow('An Academic Year is required');
    expect(repository.createEnrollment).not.toHaveBeenCalled();
  });

  it('the defaulted Current Academic Year still passes through the same Archived/cross-school validation as an explicit choice', async () => {
    academicYearsService.getCurrentAcademicYear.mockResolvedValue({ id: 'ay1', schoolId: 'school-1', status: 'ARCHIVED' });
    academicYearsService.getAcademicYearById.mockResolvedValue({ id: 'ay1', schoolId: 'school-1', status: 'ARCHIVED' });

    await expect(
      service.promoteStudent('s1', { classId: 'grade-2' }, actingUser)
    ).rejects.toThrow('Invalid Academic Year');
    expect(repository.createEnrollment).not.toHaveBeenCalled();
  });
});

describe('correctStudentClass (Business Rule #16 — never a Promotion)', () => {
  it.each(['TRANSFERRED', 'WITHDRAWN', 'GRADUATED'])(
    'rejects correcting a %s Student\'s Class (regression — must not disturb finalized history)',
    async (status) => {
      repository.findById.mockResolvedValue({ id: 's1', schoolId: 'school-1', status });

      await expect(
        service.correctStudentClass('s1', { classId: 'grade-5' }, actingUser)
      ).rejects.toThrow();
      expect(repository.correctEnrollmentClass).not.toHaveBeenCalled();
    }
  );

  it('mutates the current Enrollment in place and never touches Graduation eligibility', async () => {
    repository.findById.mockResolvedValue({ id: 's1', schoolId: 'school-1', status: 'ELIGIBLE_FOR_GRADUATION' });
    repository.findLatestEnrollment.mockResolvedValue({ id: 'enr-1', classId: 'grade-4' });
    classesService.getClassById.mockResolvedValue({ id: 'grade-5', schoolId: 'school-1', status: 'ACTIVE' });
    repository.correctEnrollmentClass.mockResolvedValue({ id: 'enr-1', classId: 'grade-5' });

    await service.correctStudentClass('s1', { classId: 'grade-5', reason: 'data entry fix' }, actingUser);

    expect(repository.correctEnrollmentClass).toHaveBeenCalledWith('enr-1', 'grade-5', undefined);
    expect(repository.createEnrollment).not.toHaveBeenCalled();
    expect(repository.updateStatus).not.toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'STUDENT_CLASS_CORRECTED',
        metadata: expect.objectContaining({ previousClassId: 'grade-4', newClassId: 'grade-5', reason: 'data entry fix' }),
      })
    );
  });

  it('rejects correction when the Student has no current Enrollment', async () => {
    repository.findById.mockResolvedValue({ id: 's1', schoolId: 'school-1', status: 'ACTIVE' });
    repository.findLatestEnrollment.mockResolvedValue(null);

    await expect(
      service.correctStudentClass('s1', { classId: 'grade-5' }, actingUser)
    ).rejects.toThrow('Student has no current Enrollment to correct');
  });

  // (ACR-002, Business Rule #20)
  it('requires a sectionId when correcting into a Class with active Sections', async () => {
    repository.findById.mockResolvedValue({ id: 's1', schoolId: 'school-1', status: 'ACTIVE' });
    repository.findLatestEnrollment.mockResolvedValue({ id: 'enr-1', classId: 'grade-4', sectionId: null });
    classesService.getClassById.mockResolvedValue({ id: 'grade-5', schoolId: 'school-1', status: 'ACTIVE' });
    classesService.listActiveSectionsForClass.mockResolvedValue([{ id: 'g5-sec-a', name: 'A' }]);

    await expect(
      service.correctStudentClass('s1', { classId: 'grade-5' }, actingUser)
    ).rejects.toThrow('A Section is required');
    expect(repository.correctEnrollmentClass).not.toHaveBeenCalled();
  });

  it('corrects the Section, clearing a stale Section that belonged to the old Class', async () => {
    repository.findById.mockResolvedValue({ id: 's1', schoolId: 'school-1', status: 'ACTIVE' });
    repository.findLatestEnrollment.mockResolvedValue({ id: 'enr-1', classId: 'grade-4', sectionId: 'g4-sec-a' });
    classesService.getClassById.mockResolvedValue({ id: 'grade-5', schoolId: 'school-1', status: 'ACTIVE' });
    classesService.listActiveSectionsForClass.mockResolvedValue([{ id: 'g5-sec-b', name: 'B' }]);
    repository.correctEnrollmentClass.mockResolvedValue({ id: 'enr-1', classId: 'grade-5', sectionId: 'g5-sec-b' });

    await service.correctStudentClass('s1', { classId: 'grade-5', sectionId: 'g5-sec-b' }, actingUser);

    expect(repository.correctEnrollmentClass).toHaveBeenCalledWith('enr-1', 'grade-5', 'g5-sec-b');
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ previousSectionId: 'g4-sec-a', newSectionId: 'g5-sec-b' }),
      })
    );
  });
});

describe('transferStudent / withdrawStudent (Business Rules #7, #8, #9, #15)', () => {
  it('transfer records a summary and deactivates the account, never a destination school', async () => {
    repository.findById.mockResolvedValue({ id: 's1', schoolId: 'school-1', status: 'ACTIVE', accountId: 'acc-1' });
    repository.findLatestEnrollment.mockResolvedValue({ id: 'enr-1' });
    repository.updateStatus.mockResolvedValue({ id: 's1', status: 'TRANSFERRED' });

    await service.transferStudent('s1', { academicSummary: 'did well', destinationSchoolId: 'ignored' }, actingUser);

    expect(repository.setTransferSummary).toHaveBeenCalledWith('enr-1', 'did well');
    expect(repository.updateStatus).toHaveBeenCalledWith('s1', 'TRANSFERRED');
    expect(authService.deactivateAccount).toHaveBeenCalledWith('acc-1', actingUser);
  });

  it('rejects transferring an already-terminal Student (Business Rule #15)', async () => {
    repository.findById.mockResolvedValue({ id: 's1', schoolId: 'school-1', status: 'GRADUATED' });

    await expect(service.transferStudent('s1', {}, actingUser)).rejects.toThrow('Student has already graduated');
  });

  it('rejects withdrawing an already-transferred Student', async () => {
    repository.findById.mockResolvedValue({ id: 's1', schoolId: 'school-1', status: 'TRANSFERRED' });

    await expect(service.withdrawStudent('s1', actingUser)).rejects.toThrow('Student has already transferred');
  });
});

describe('restoreWithdrawnStudent (Business Rule #14 — Withdrawal alone is reversible)', () => {
  it('restores a Withdrawn Student to Active and reactivates the account', async () => {
    repository.findById.mockResolvedValue({ id: 's1', schoolId: 'school-1', status: 'WITHDRAWN', accountId: 'acc-1' });
    repository.updateStatus.mockResolvedValue({ id: 's1', status: 'ACTIVE' });

    await service.restoreWithdrawnStudent('s1', actingUser);

    expect(repository.updateStatus).toHaveBeenCalledWith('s1', 'ACTIVE');
    expect(authService.reactivateAccount).toHaveBeenCalledWith('acc-1', actingUser);
  });

  it('rejects restoring a non-Withdrawn Student', async () => {
    repository.findById.mockResolvedValue({ id: 's1', schoolId: 'school-1', status: 'ACTIVE' });

    await expect(service.restoreWithdrawnStudent('s1', actingUser)).rejects.toThrow(
      'Only a Withdrawn Student can be restored'
    );
  });

  it('rejects restoring a Transferred or Graduated Student (Business Rule #15 — permanent)', async () => {
    repository.findById.mockResolvedValue({ id: 's1', schoolId: 'school-1', status: 'TRANSFERRED' });

    await expect(service.restoreWithdrawnStudent('s1', actingUser)).rejects.toThrow(
      'Only a Withdrawn Student can be restored'
    );
  });
});

describe('graduateStudent (strict guard, Business Rule #10)', () => {
  it('graduates a Student who is Eligible for Graduation', async () => {
    repository.findById.mockResolvedValue({
      id: 's1',
      schoolId: 'school-1',
      status: 'ELIGIBLE_FOR_GRADUATION',
      accountId: 'acc-1',
    });
    repository.updateStatus.mockResolvedValue({ id: 's1', status: 'GRADUATED' });

    await service.graduateStudent('s1', actingUser);

    expect(repository.updateStatus).toHaveBeenCalledWith('s1', 'GRADUATED');
    expect(authService.deactivateAccount).toHaveBeenCalledWith('acc-1', actingUser);
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'STUDENT_GRADUATED' }));
  });

  it('rejects graduating a non-eligible ACTIVE Student and audits the rejection', async () => {
    repository.findById.mockResolvedValue({ id: 's1', schoolId: 'school-1', status: 'ACTIVE' });

    await expect(service.graduateStudent('s1', actingUser)).rejects.toThrow(
      'Only a Student who is Eligible for Graduation may be graduated'
    );
    expect(repository.updateStatus).not.toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'STUDENT_GRADUATION_REJECTED' })
    );
  });

  it('there is no direct ACTIVE -> GRADUATED path, even with an explicit attempt', async () => {
    repository.findById.mockResolvedValue({ id: 's1', schoolId: 'school-1', status: 'ACTIVE' });

    await expect(service.graduateStudent('s1', actingUser)).rejects.toThrow();
    expect(authService.deactivateAccount).not.toHaveBeenCalled();
  });
});

describe('cross-tenant access (Multi-Tenancy)', () => {
  it('getStudentOrThrow rejects a Student belonging to a different school', async () => {
    repository.findById.mockResolvedValue({ id: 's1', schoolId: 'other-school' });

    await expect(service.getStudentOrThrow('school-1', 's1')).rejects.toThrow('Student not found');
  });
});

describe('listStudents Class filter (regression — must match current Enrollment only)', () => {
  it('filters on each Student\'s latest Enrollment, not any historical one', async () => {
    repository.listAllBySchool.mockResolvedValue([
      { id: 's1' }, // currently in the target Class
      { id: 's2' }, // was in the target Class historically, has since moved on
    ]);
    repository.findLatestEnrollment.mockImplementation(async (studentId) => {
      if (studentId === 's1') return { classId: 'grade-2' };
      return { classId: 'grade-5' };
    });

    const result = await service.listStudents({ classId: 'grade-2', page: 1, pageSize: 20 }, actingUser);

    expect(result.students).toHaveLength(1);
    expect(result.students[0].id).toBe('s1');
    expect(repository.listBySchool).not.toHaveBeenCalled();
  });
});

describe('listStudents Section filter (ACR-002)', () => {
  it('filters by sectionId in addition to classId, on the latest Enrollment only', async () => {
    repository.listAllBySchool.mockResolvedValue([
      { id: 's1' }, // grade-2, Section A — matches
      { id: 's2' }, // grade-2, Section B — same Class, different Section
      { id: 's3' }, // grade-2, no Section
    ]);
    repository.findLatestEnrollment.mockImplementation(async (studentId) => {
      if (studentId === 's1') return { classId: 'grade-2', sectionId: 'sec-a' };
      if (studentId === 's2') return { classId: 'grade-2', sectionId: 'sec-b' };
      return { classId: 'grade-2', sectionId: null };
    });

    const result = await service.listStudents(
      { classId: 'grade-2', sectionId: 'sec-a', page: 1, pageSize: 20 },
      actingUser
    );

    expect(result.students).toHaveLength(1);
    expect(result.students[0].id).toBe('s1');
  });

  it('filters by sectionId alone, without an explicit classId', async () => {
    repository.listAllBySchool.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
    repository.findLatestEnrollment.mockImplementation(async (studentId) => {
      if (studentId === 's1') return { classId: 'grade-2', sectionId: 'sec-a' };
      return { classId: 'grade-3', sectionId: 'sec-z' };
    });

    const result = await service.listStudents({ sectionId: 'sec-a', page: 1, pageSize: 20 }, actingUser);

    expect(result.students).toHaveLength(1);
    expect(result.students[0].id).toBe('s1');
    expect(repository.listBySchool).not.toHaveBeenCalled();
  });
});
