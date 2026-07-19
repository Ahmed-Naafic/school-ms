const {
  validateAdmitStudent,
  validateEnrollStudent,
  validatePromoteStudent,
  validateCorrectClass,
  validateTransferStudent,
  validateUpdateProfile,
} = require('./students.validation');

describe('validateAdmitStudent', () => {
  it('accepts a valid request', () => {
    expect(() => validateAdmitStudent({ email: 'a@example.com', fullName: 'A Student' })).not.toThrow();
  });

  it('rejects a missing email', () => {
    expect(() => validateAdmitStudent({ fullName: 'A Student' })).toThrow('Invalid Admission request');
  });

  it('rejects a missing fullName', () => {
    expect(() => validateAdmitStudent({ email: 'a@example.com' })).toThrow();
  });

  it('rejects a non-string parentName', () => {
    expect(() =>
      validateAdmitStudent({ email: 'a@example.com', fullName: 'A Student', parentName: 123 })
    ).toThrow();
  });

  it('accepts an optional parentName/parentContact when omitted', () => {
    expect(() => validateAdmitStudent({ email: 'a@example.com', fullName: 'A Student' })).not.toThrow();
  });
});

describe('validateEnrollStudent', () => {
  it('accepts a valid request', () => {
    expect(() => validateEnrollStudent({ classId: 'c1', academicYear: '2025/2026' })).not.toThrow();
  });

  it('rejects a missing classId', () => {
    expect(() => validateEnrollStudent({ academicYear: '2025/2026' })).toThrow('Invalid Enrollment request');
  });

  it('rejects a missing academicYear', () => {
    expect(() => validateEnrollStudent({ classId: 'c1' })).toThrow();
  });
});

describe('validatePromoteStudent', () => {
  it('accepts a request with no explicit classId (suggested next Class)', () => {
    expect(() => validatePromoteStudent({ academicYear: '2025/2026' })).not.toThrow();
  });

  it('accepts an explicit classId override', () => {
    expect(() => validatePromoteStudent({ classId: 'c1', academicYear: '2025/2026' })).not.toThrow();
  });

  it('rejects a missing academicYear', () => {
    expect(() => validatePromoteStudent({})).toThrow('Invalid Promotion request');
  });
});

describe('validateCorrectClass', () => {
  it('accepts a valid request', () => {
    expect(() => validateCorrectClass({ classId: 'c1' })).not.toThrow();
  });

  it('rejects a missing classId', () => {
    expect(() => validateCorrectClass({})).toThrow('Invalid Class Correction request');
  });

  it('rejects a non-string reason', () => {
    expect(() => validateCorrectClass({ classId: 'c1', reason: 123 })).toThrow();
  });
});

describe('validateTransferStudent', () => {
  it('accepts an empty body (academicSummary is optional)', () => {
    expect(() => validateTransferStudent({})).not.toThrow();
  });

  it('rejects a non-string academicSummary', () => {
    expect(() => validateTransferStudent({ academicSummary: 123 })).toThrow('Invalid Transfer request');
  });

  it('ignores unknown fields such as a client-supplied destination school', () => {
    expect(() => validateTransferStudent({ academicSummary: 'ok', destinationSchoolId: 'nope' })).not.toThrow();
  });
});

describe('validateUpdateProfile', () => {
  it('accepts a partial update', () => {
    expect(() => validateUpdateProfile({ fullName: 'New Name' })).not.toThrow();
  });

  it('rejects a non-string field', () => {
    expect(() => validateUpdateProfile({ parentContact: 12345 })).toThrow('Invalid profile update');
  });
});
