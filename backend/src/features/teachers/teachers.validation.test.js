const validation = require('./teachers.validation');

describe('validateOnboardTeacher', () => {
  const validBody = {
    email: 'teacher@example.com',
    fullName: 'A Teacher',
    joiningDate: '2026-01-15',
  };

  it('accepts a minimal valid request', () => {
    expect(() => validation.validateOnboardTeacher(validBody)).not.toThrow();
  });

  it('requires email, fullName, and joiningDate', () => {
    expect(() => validation.validateOnboardTeacher({})).toThrow('Invalid Onboarding request');
  });

  it('rejects an invalid joiningDate', () => {
    expect(() =>
      validation.validateOnboardTeacher({ ...validBody, joiningDate: 'not-a-date' })
    ).toThrow('Invalid Onboarding request');
  });

  it('accepts optional string fields and a subjectSpecializations array', () => {
    expect(() =>
      validation.validateOnboardTeacher({
        ...validBody,
        contactPhone: '555-0100',
        contactAddress: '1 Main St',
        employmentType: 'Full-time',
        departmentId: 'dept-1',
        qualifications: 'B.Ed.',
        subjectSpecializations: ['Math', 'Science'],
        relevantExperience: '5 years',
      })
    ).not.toThrow();
  });

  it('rejects a non-array subjectSpecializations', () => {
    expect(() =>
      validation.validateOnboardTeacher({ ...validBody, subjectSpecializations: 'Math' })
    ).toThrow('Invalid Onboarding request');
  });

  it('rejects a subjectSpecializations array containing a non-string', () => {
    expect(() =>
      validation.validateOnboardTeacher({ ...validBody, subjectSpecializations: ['Math', 42] })
    ).toThrow('Invalid Onboarding request');
  });

  // Technical Design's Guard-by-Construction principle: employmentStatus is
  // only ever written by the transition endpoints (WP3); employeeId,
  // schoolId, and accountId are structural and never client-settable.
  it.each(['employmentStatus', 'employeeId', 'schoolId', 'accountId'])(
    'rejects a request containing %s',
    (field) => {
      expect(() => validation.validateOnboardTeacher({ ...validBody, [field]: 'x' })).toThrow(
        'Invalid Onboarding request'
      );
    }
  );
});

describe('validateUpdateTeacherProfile', () => {
  it('accepts an empty update', () => {
    expect(() => validation.validateUpdateTeacherProfile({})).not.toThrow();
  });

  it('accepts every allowed profile field', () => {
    expect(() =>
      validation.validateUpdateTeacherProfile({
        fullName: 'Updated Name',
        contactPhone: '555-0100',
        contactAddress: '1 Main St',
        joiningDate: '2026-01-15',
        employmentType: 'Part-time',
        departmentId: 'dept-1',
        qualifications: 'M.Ed.',
        subjectSpecializations: ['History'],
        relevantExperience: '10 years',
      })
    ).not.toThrow();
  });

  it('allows departmentId to be explicitly cleared with null', () => {
    expect(() => validation.validateUpdateTeacherProfile({ departmentId: null })).not.toThrow();
  });

  it('rejects an empty-string fullName', () => {
    expect(() => validation.validateUpdateTeacherProfile({ fullName: '   ' })).toThrow(
      'Invalid Teacher profile update'
    );
  });

  it('rejects an invalid joiningDate', () => {
    expect(() => validation.validateUpdateTeacherProfile({ joiningDate: 'not-a-date' })).toThrow(
      'Invalid Teacher profile update'
    );
  });

  // Critical finding from the Technical Design Review: the general
  // profile-update endpoint must never accept these four fields.
  it.each(['employmentStatus', 'employeeId', 'schoolId', 'accountId'])(
    'rejects a request containing %s',
    (field) => {
      expect(() => validation.validateUpdateTeacherProfile({ [field]: 'x' })).toThrow(
        'Invalid Teacher profile update'
      );
    }
  );
});

describe('validateUpdateOwnContactInfo', () => {
  it('accepts an empty update', () => {
    expect(() => validation.validateUpdateOwnContactInfo({})).not.toThrow();
  });

  it('accepts contactPhone and contactAddress', () => {
    expect(() =>
      validation.validateUpdateOwnContactInfo({ contactPhone: '555-0100', contactAddress: '1 Main St' })
    ).not.toThrow();
  });

  it('rejects a non-string contactPhone', () => {
    expect(() => validation.validateUpdateOwnContactInfo({ contactPhone: 5550100 })).toThrow(
      'Invalid self-service profile update'
    );
  });

  // Business Rule #10: only contactPhone/contactAddress are Teacher-editable
  // — stricter than the School-Admin-facing profile update, which only
  // rejects the four structural/lifecycle fields.
  it.each(['fullName', 'joiningDate', 'departmentId', 'employmentStatus', 'employeeId', 'schoolId', 'accountId'])(
    'rejects a request containing %s, even though some of these are legitimate School-Admin fields',
    (field) => {
      expect(() => validation.validateUpdateOwnContactInfo({ [field]: 'x' })).toThrow(
        'Invalid self-service profile update'
      );
    }
  );
});

describe('validateListTeachers', () => {
  it('accepts an empty query', () => {
    expect(() => validation.validateListTeachers({})).not.toThrow();
  });

  it('accepts a valid employmentStatus filter', () => {
    expect(() => validation.validateListTeachers({ employmentStatus: 'ON_LEAVE' })).not.toThrow();
  });

  it('rejects an invalid employmentStatus filter', () => {
    expect(() => validation.validateListTeachers({ employmentStatus: 'BOGUS' })).toThrow(
      'Invalid roster query'
    );
  });

  it('rejects a non-positive page', () => {
    expect(() => validation.validateListTeachers({ page: '0' })).toThrow('Invalid roster query');
  });

  it('rejects a non-positive pageSize', () => {
    expect(() => validation.validateListTeachers({ pageSize: '-1' })).toThrow('Invalid roster query');
  });
});
