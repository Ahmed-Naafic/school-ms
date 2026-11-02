const validation = require('./teacher-subject-assignments.validation');

const validCreateBody = {
  teacherId: 'teacher-1',
  subjectId: 'subject-1',
  classId: 'class-1',
  effectiveStartDate: '2026-02-01',
};

describe('validateCreateAssignment', () => {
  it('accepts a minimal valid request', () => {
    expect(() => validation.validateCreateAssignment(validCreateBody)).not.toThrow();
  });

  it('requires teacherId, subjectId, classId, and effectiveStartDate', () => {
    expect(() => validation.validateCreateAssignment({})).toThrow('Invalid Teacher Subject Assignment creation request');
  });

  it('rejects an effectiveEndDate preceding effectiveStartDate', () => {
    expect(() =>
      validation.validateCreateAssignment({
        ...validCreateBody,
        effectiveStartDate: '2026-06-01',
        effectiveEndDate: '2026-01-01',
      })
    ).toThrow('Invalid Teacher Subject Assignment creation request');
  });

  it('accepts an explicit academicYearId and sectionId', () => {
    expect(() =>
      validation.validateCreateAssignment({ ...validCreateBody, academicYearId: 'ay-1', sectionId: 'sec-1' })
    ).not.toThrow();
  });

  it('rejects a non-string reason', () => {
    expect(() => validation.validateCreateAssignment({ ...validCreateBody, reason: 42 })).toThrow(
      'Invalid Teacher Subject Assignment creation request'
    );
  });
});

describe('validateCorrectAssignment (Guard by Construction, Business Rule #11)', () => {
  it('accepts an empty body (no-op correction)', () => {
    expect(() => validation.validateCorrectAssignment({})).not.toThrow();
  });

  it('accepts effectiveStartDate, effectiveEndDate, and endReason', () => {
    expect(() =>
      validation.validateCorrectAssignment({
        effectiveStartDate: '2026-02-01',
        effectiveEndDate: '2026-06-01',
        endReason: 'Reassigned',
      })
    ).not.toThrow();
  });

  it('accepts an explicit null for effectiveEndDate and endReason (partial-update clearing)', () => {
    expect(() => validation.validateCorrectAssignment({ effectiveEndDate: null, endReason: null })).not.toThrow();
  });

  it('rejects teacherId, subjectId, classId, sectionId, or academicYearId — immutable per Business Rule #11', () => {
    expect(() => validation.validateCorrectAssignment({ teacherId: 'teacher-2' })).toThrow(
      'Invalid Teacher Subject Assignment correction request'
    );
    expect(() => validation.validateCorrectAssignment({ academicYearId: 'ay-2' })).toThrow(
      'Invalid Teacher Subject Assignment correction request'
    );
  });

  it('rejects an explicit null for effectiveStartDate — it is required and cannot be cleared', () => {
    expect(() => validation.validateCorrectAssignment({ effectiveStartDate: null })).toThrow(
      'Invalid Teacher Subject Assignment correction request'
    );
  });

  it('rejects a non-date effectiveEndDate', () => {
    expect(() => validation.validateCorrectAssignment({ effectiveEndDate: 'not-a-date' })).toThrow(
      'Invalid Teacher Subject Assignment correction request'
    );
  });
});

describe('validateReplaceTeacher', () => {
  it('requires newTeacherId', () => {
    expect(() => validation.validateReplaceTeacher({})).toThrow('Invalid Replace Teacher request');
  });

  it('accepts a minimal valid request', () => {
    expect(() => validation.validateReplaceTeacher({ newTeacherId: 'teacher-2' })).not.toThrow();
  });

  it('accepts an optional effectiveEndDate and endReason', () => {
    expect(() =>
      validation.validateReplaceTeacher({
        newTeacherId: 'teacher-2',
        effectiveEndDate: '2026-06-01',
        endReason: 'Reassigned',
      })
    ).not.toThrow();
  });
});

describe('validateCopyAssignments (Business Rule #12)', () => {
  it('requires fromAcademicYearId, toAcademicYearId, and a non-empty assignmentIds array', () => {
    expect(() => validation.validateCopyAssignments({})).toThrow('Invalid copy request');
    expect(() =>
      validation.validateCopyAssignments({ fromAcademicYearId: 'ay-1', toAcademicYearId: 'ay-2', assignmentIds: [] })
    ).toThrow('Invalid copy request');
  });

  it('accepts a valid selective-copy request', () => {
    expect(() =>
      validation.validateCopyAssignments({
        fromAcademicYearId: 'ay-1',
        toAcademicYearId: 'ay-2',
        assignmentIds: ['a1', 'a2'],
      })
    ).not.toThrow();
  });

  it('rejects a non-array or non-string-array assignmentIds', () => {
    expect(() =>
      validation.validateCopyAssignments({ fromAcademicYearId: 'ay-1', toAcademicYearId: 'ay-2', assignmentIds: 'a1' })
    ).toThrow('Invalid copy request');
    expect(() =>
      validation.validateCopyAssignments({
        fromAcademicYearId: 'ay-1',
        toAcademicYearId: 'ay-2',
        assignmentIds: [1, 2],
      })
    ).toThrow('Invalid copy request');
  });
});

describe('validateListAssignments', () => {
  it('accepts an empty query', () => {
    expect(() => validation.validateListAssignments({})).not.toThrow();
  });

  it('rejects a non-positive page or pageSize', () => {
    expect(() => validation.validateListAssignments({ page: '0' })).toThrow('Invalid Teacher Subject Assignment query');
    expect(() => validation.validateListAssignments({ pageSize: '-1' })).toThrow(
      'Invalid Teacher Subject Assignment query'
    );
  });

  it('accepts every documented filter', () => {
    expect(() =>
      validation.validateListAssignments({
        academicYearId: 'ay-1',
        teacherId: 'teacher-1',
        subjectId: 'subject-1',
        classId: 'class-1',
        sectionId: 'sec-1',
        page: '1',
        pageSize: '20',
      })
    ).not.toThrow();
  });
});
