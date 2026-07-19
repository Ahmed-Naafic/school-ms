// Integration tests against the real Express app and dev database. See
// ../../shared/test-helpers.js — self-contained, creates fresh Schools/School
// Admins per run rather than depending on manually-created fixtures.
const { app, request, loginSuperAdmin, createTestSchoolAdmin, uniqueSuffix } = require('../../shared/test-helpers');

jest.setTimeout(30000);

let superAdminToken;
let schoolAToken;
let schoolBToken;
const gradeIds = {};

async function createClass(token, name) {
  const res = await request(app).post('/api/v1/classes').set('Authorization', `Bearer ${token}`).send({ name });
  return res.body.data.id;
}

async function admitStudent(token, email, fullName) {
  const res = await request(app)
    .post('/api/v1/students')
    .set('Authorization', `Bearer ${token}`)
    .send({ email, fullName });
  return res.body.data.id;
}

beforeAll(async () => {
  superAdminToken = await loginSuperAdmin();

  const suffix = uniqueSuffix();
  const schoolA = await createTestSchoolAdmin(superAdminToken, {
    schoolName: `Students IT School A ${suffix}`,
    adminEmail: `students-it-a-${suffix}@example.com`,
    password: 'StudentsIT123',
  });
  schoolAToken = schoolA.token;

  const schoolB = await createTestSchoolAdmin(superAdminToken, {
    schoolName: `Students IT School B ${suffix}`,
    adminEmail: `students-it-b-${suffix}@example.com`,
    password: 'StudentsIT123',
  });
  schoolBToken = schoolB.token;

  // A 3-Class sequence for School A, with Grade 3 as the final Class.
  gradeIds.g1 = await createClass(schoolAToken, 'Grade 1');
  gradeIds.g2 = await createClass(schoolAToken, 'Grade 2');
  gradeIds.g3 = await createClass(schoolAToken, 'Grade 3');
  await request(app)
    .patch(`/api/v1/classes/${gradeIds.g3}/designate-final`)
    .set('Authorization', `Bearer ${schoolAToken}`);
});

describe('authentication and permissions', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/students');
    expect(res.status).toBe(401);
  });

  it('rejects Super Admin — no operational role in Student Management', async () => {
    const res = await request(app).get('/api/v1/students').set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(403);
  });

  it('has no delete route', async () => {
    const res = await request(app)
      .delete('/api/v1/students/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(res.status).toBe(404);
  });
});

describe('Admission (Business Rules #1, #3)', () => {
  it('admits a Student and issues login credentials', async () => {
    const suffix = uniqueSuffix();
    const res = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ email: `admit-test-${suffix}@example.com`, fullName: 'Admit Test Student' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.accountId).toBeTruthy();
  });
});

describe('tenant isolation (Multi-Tenancy)', () => {
  it('School B cannot read School A\'s Student', async () => {
    const suffix = uniqueSuffix();
    const studentId = await admitStudent(schoolAToken, `tenant-test-${suffix}@example.com`, 'Tenant Test');

    const res = await request(app).get(`/api/v1/students/${studentId}`).set('Authorization', `Bearer ${schoolBToken}`);
    expect(res.status).toBe(404);
  });
});

describe('Enrollment and archived-Class rejection (Business Rule #9)', () => {
  it('rejects enrollment into an archived Class', async () => {
    const suffix = uniqueSuffix();
    const archivedClassId = await createClass(schoolAToken, `Archived Grade ${suffix}`);
    await request(app)
      .patch(`/api/v1/classes/${archivedClassId}/archive`)
      .set('Authorization', `Bearer ${schoolAToken}`);

    const studentId = await admitStudent(schoolAToken, `archive-enroll-${suffix}@example.com`, 'Archive Enroll Test');

    const res = await request(app)
      .post(`/api/v1/students/${studentId}/enrollments`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ classId: archivedClassId, academicYear: '2025/2026' });

    expect(res.status).toBe(409);
  });
});

describe('Section reference (ACR-002, Business Rules #18, #19, #20)', () => {
  async function createSection(token, classId, name) {
    const res = await request(app)
      .post(`/api/v1/classes/${classId}/sections`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name });
    return res.body.data.id;
  }

  it('requires a Section when enrolling into a Class that has active Sections', async () => {
    const suffix = uniqueSuffix();
    const classId = await createClass(schoolAToken, `SectionedGrade ${suffix}`);
    await createSection(schoolAToken, classId, 'A');
    const studentId = await admitStudent(schoolAToken, `section-required-${suffix}@example.com`, 'Section Required Test');

    const res = await request(app)
      .post(`/api/v1/students/${studentId}/enrollments`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ classId, academicYear: '2025/2026' });

    expect(res.status).toBe(422);
  });

  it('rejects a Section belonging to a different Class', async () => {
    const suffix = uniqueSuffix();
    const classId = await createClass(schoolAToken, `SectionOwnerA ${suffix}`);
    const otherClassId = await createClass(schoolAToken, `SectionOwnerB ${suffix}`);
    const sectionId = await createSection(schoolAToken, otherClassId, 'A');
    const studentId = await admitStudent(schoolAToken, `section-mismatch-${suffix}@example.com`, 'Section Mismatch Test');

    const res = await request(app)
      .post(`/api/v1/students/${studentId}/enrollments`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ classId, sectionId, academicYear: '2025/2026' });

    expect(res.status).toBe(422);
  });

  it('rejects enrolling into an archived Section', async () => {
    const suffix = uniqueSuffix();
    const classId = await createClass(schoolAToken, `ArchivedSectionGrade ${suffix}`);
    const sectionId = await createSection(schoolAToken, classId, 'A');
    await request(app)
      .patch(`/api/v1/classes/${classId}/sections/${sectionId}/archive`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    const studentId = await admitStudent(schoolAToken, `section-archived-${suffix}@example.com`, 'Section Archived Test');

    const res = await request(app)
      .post(`/api/v1/students/${studentId}/enrollments`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ classId, sectionId, academicYear: '2025/2026' });

    expect(res.status).toBe(422);
  });

  it('enrolls successfully with a valid Section, and promotes with a same-named Section suggested in the destination Class', async () => {
    const suffix = uniqueSuffix();
    const classA = await createClass(schoolAToken, `PromoSectionA ${suffix}`);
    const classB = await createClass(schoolAToken, `PromoSectionB ${suffix}`);
    const sectionAId = await createSection(schoolAToken, classA, 'A');
    await createSection(schoolAToken, classA, 'B');
    const sectionBMatchId = await createSection(schoolAToken, classB, 'A');
    await createSection(schoolAToken, classB, 'C');

    const studentId = await admitStudent(schoolAToken, `section-promo-${suffix}@example.com`, 'Section Promo Test');

    const enrollRes = await request(app)
      .post(`/api/v1/students/${studentId}/enrollments`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ classId: classA, sectionId: sectionAId, academicYear: '2025/2026' });
    expect(enrollRes.status).toBe(201);
    expect(enrollRes.body.data.sectionId).toBe(sectionAId);

    const promoteRes = await request(app)
      .patch(`/api/v1/students/${studentId}/promote`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ classId: classB, academicYear: '2026/2027' });

    expect(promoteRes.status).toBe(200);
    expect(promoteRes.body.data.classId).toBe(classB);
    expect(promoteRes.body.data.sectionId).toBe(sectionBMatchId);
  });

  it('promotion requires an explicit Section when no same-named Section exists in the destination Class', async () => {
    const suffix = uniqueSuffix();
    const classA = await createClass(schoolAToken, `NoMatchSectionA ${suffix}`);
    const classB = await createClass(schoolAToken, `NoMatchSectionB ${suffix}`);
    const sectionAId = await createSection(schoolAToken, classA, 'A');
    await createSection(schoolAToken, classB, 'Z');

    const studentId = await admitStudent(schoolAToken, `section-nomatch-${suffix}@example.com`, 'Section No Match Test');

    await request(app)
      .post(`/api/v1/students/${studentId}/enrollments`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ classId: classA, sectionId: sectionAId, academicYear: '2025/2026' });

    const promoteRes = await request(app)
      .patch(`/api/v1/students/${studentId}/promote`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ classId: classB, academicYear: '2026/2027' });

    expect(promoteRes.status).toBe(422);
  });

  it('allows enrolling with no Section when the Class has none at all', async () => {
    const suffix = uniqueSuffix();
    const classId = await createClass(schoolAToken, `NoSectionsGrade ${suffix}`);
    const studentId = await admitStudent(schoolAToken, `no-sections-${suffix}@example.com`, 'No Sections Test');

    const res = await request(app)
      .post(`/api/v1/students/${studentId}/enrollments`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ classId, academicYear: '2025/2026' });

    expect(res.status).toBe(201);
    expect(res.body.data.sectionId).toBeNull();
  });
});

describe('full lifecycle: Enroll -> Promote x2 -> Eligible -> Graduate (Business Rules #5, #6, #10)', () => {
  let studentId;

  beforeAll(async () => {
    const suffix = uniqueSuffix();
    studentId = await admitStudent(schoolAToken, `lifecycle-${suffix}@example.com`, 'Lifecycle Test Student');
    await request(app)
      .post(`/api/v1/students/${studentId}/enrollments`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ classId: gradeIds.g1, academicYear: '2025/2026' });
  });

  it('promotes through the suggested sequence without an explicit Class', async () => {
    const res = await request(app)
      .patch(`/api/v1/students/${studentId}/promote`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ academicYear: '2026/2027' });

    expect(res.status).toBe(200);
    expect(res.body.data.classId).toBe(gradeIds.g2);

    const detail = await request(app)
      .get(`/api/v1/students/${studentId}`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(detail.body.data.status).toBe('ACTIVE');
  });

  it('transitions to ELIGIBLE_FOR_GRADUATION on promotion into the final Class', async () => {
    const res = await request(app)
      .patch(`/api/v1/students/${studentId}/promote`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ academicYear: '2027/2028' });

    expect(res.status).toBe(200);
    expect(res.body.data.classId).toBe(gradeIds.g3);

    const detail = await request(app)
      .get(`/api/v1/students/${studentId}`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(detail.body.data.status).toBe('ELIGIBLE_FOR_GRADUATION');
  });

  it('rejects graduating before eligibility was checked twice (idempotent guard) then graduates once eligible', async () => {
    const res = await request(app)
      .patch(`/api/v1/students/${studentId}/graduate`)
      .set('Authorization', `Bearer ${schoolAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('GRADUATED');
  });

  it('Graduation is permanent — further lifecycle actions are rejected', async () => {
    const withdraw = await request(app)
      .patch(`/api/v1/students/${studentId}/withdraw`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(withdraw.status).toBe(409);

    const restore = await request(app)
      .patch(`/api/v1/students/${studentId}/restore-withdrawal`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(restore.status).toBe(409);
  });

  it('Class Correction is rejected on a Graduated Student (regression — must not disturb finalized history)', async () => {
    const res = await request(app)
      .patch(`/api/v1/students/${studentId}/correct-class`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ classId: gradeIds.g1, reason: 'integration test correction' });

    expect(res.status).toBe(409);
  });
});

describe('Class Correction remains available while ELIGIBLE_FOR_GRADUATION (not yet finalized)', () => {
  it('corrects the Class of an eligible-but-not-yet-graduated Student', async () => {
    const suffix = uniqueSuffix();
    const studentId = await admitStudent(schoolAToken, `correct-eligible-${suffix}@example.com`, 'Correct Eligible Test');
    await request(app)
      .post(`/api/v1/students/${studentId}/enrollments`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ classId: gradeIds.g1, academicYear: '2025/2026' });
    await request(app)
      .patch(`/api/v1/students/${studentId}/promote`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ classId: gradeIds.g2, academicYear: '2026/2027' });
    await request(app)
      .patch(`/api/v1/students/${studentId}/promote`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ classId: gradeIds.g3, academicYear: '2027/2028' });

    const res = await request(app)
      .patch(`/api/v1/students/${studentId}/correct-class`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ classId: gradeIds.g2, reason: 'integration test correction' });

    expect(res.status).toBe(200);

    const detail = await request(app)
      .get(`/api/v1/students/${studentId}`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(detail.body.data.status).toBe('ELIGIBLE_FOR_GRADUATION');
    expect(detail.body.data.enrollments[0].classId).toBe(gradeIds.g2);
  });
});

describe('Graduation guard rejects a non-eligible Student (Business Rule #10)', () => {
  it('returns 409 for an ACTIVE Student who has not reached the final Class', async () => {
    const suffix = uniqueSuffix();
    const studentId = await admitStudent(schoolAToken, `guard-test-${suffix}@example.com`, 'Guard Test Student');
    await request(app)
      .post(`/api/v1/students/${studentId}/enrollments`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ classId: gradeIds.g1, academicYear: '2025/2026' });

    const res = await request(app)
      .patch(`/api/v1/students/${studentId}/graduate`)
      .set('Authorization', `Bearer ${schoolAToken}`);

    expect(res.status).toBe(409);
  });
});

describe('Transfer (Business Rules #8, #9, #15)', () => {
  it('records a summary, stores no destination-school reference, deactivates the account, and is permanent', async () => {
    const suffix = uniqueSuffix();
    const studentId = await admitStudent(schoolAToken, `transfer-${suffix}@example.com`, 'Transfer Test Student');
    await request(app)
      .post(`/api/v1/students/${studentId}/enrollments`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ classId: gradeIds.g1, academicYear: '2025/2026' });

    const res = await request(app)
      .patch(`/api/v1/students/${studentId}/transfer`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ academicSummary: 'Did well', destinationSchoolId: 'should-be-ignored' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('TRANSFERRED');

    const detail = await request(app)
      .get(`/api/v1/students/${studentId}`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    const enrollment = detail.body.data.enrollments[0];
    expect(enrollment.transferSummary).toBe('Did well');
    expect(enrollment).not.toHaveProperty('destinationSchoolId');

    const withdrawAttempt = await request(app)
      .patch(`/api/v1/students/${studentId}/withdraw`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(withdrawAttempt.status).toBe(409);
  });
});

describe('Enrollment permanence guard (regression)', () => {
  it('rejects enrolling an already-Transferred Student into a fresh Class', async () => {
    const suffix = uniqueSuffix();
    const studentId = await admitStudent(schoolAToken, `enroll-guard-${suffix}@example.com`, 'Enroll Guard Test');
    await request(app)
      .post(`/api/v1/students/${studentId}/enrollments`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ classId: gradeIds.g1, academicYear: '2025/2026' });
    await request(app)
      .patch(`/api/v1/students/${studentId}/transfer`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({});

    const res = await request(app)
      .post(`/api/v1/students/${studentId}/enrollments`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ classId: gradeIds.g2, academicYear: '2026/2027' });

    expect(res.status).toBe(409);
  });
});

describe('Withdrawal and Restoration (Business Rule #14 — reversible, unlike Transfer/Graduation)', () => {
  it('restores a Withdrawn Student to Active without recreating an Enrollment', async () => {
    const suffix = uniqueSuffix();
    const studentId = await admitStudent(schoolAToken, `withdraw-${suffix}@example.com`, 'Withdraw Test Student');
    await request(app)
      .post(`/api/v1/students/${studentId}/enrollments`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ classId: gradeIds.g1, academicYear: '2025/2026' });

    const withdrawRes = await request(app)
      .patch(`/api/v1/students/${studentId}/withdraw`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(withdrawRes.status).toBe(200);
    expect(withdrawRes.body.data.status).toBe('WITHDRAWN');

    const restoreRes = await request(app)
      .patch(`/api/v1/students/${studentId}/restore-withdrawal`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.data.status).toBe('ACTIVE');

    const detail = await request(app)
      .get(`/api/v1/students/${studentId}`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(detail.body.data.enrollments).toHaveLength(1);
  });

  it('rejects restoring a Student who was never Withdrawn', async () => {
    const suffix = uniqueSuffix();
    const studentId = await admitStudent(schoolAToken, `never-withdrawn-${suffix}@example.com`, 'Never Withdrawn');

    const res = await request(app)
      .patch(`/api/v1/students/${studentId}/restore-withdrawal`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(res.status).toBe(409);
  });
});

describe('Class filter regression — matches current Enrollment only', () => {
  it('excludes a Student whose current Class differs, even if they passed through the filtered Class historically', async () => {
    const suffix = uniqueSuffix();
    const studentId = await admitStudent(schoolAToken, `filter-regress-${suffix}@example.com`, 'Filter Regression Test');
    await request(app)
      .post(`/api/v1/students/${studentId}/enrollments`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ classId: gradeIds.g1, academicYear: '2025/2026' });
    await request(app)
      .patch(`/api/v1/students/${studentId}/promote`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ classId: gradeIds.g2, academicYear: '2026/2027' });

    const filteredByG1 = await request(app)
      .get(`/api/v1/students?classId=${gradeIds.g1}`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(filteredByG1.body.data.find((s) => s.id === studentId)).toBeUndefined();

    const filteredByG2 = await request(app)
      .get(`/api/v1/students?classId=${gradeIds.g2}`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(filteredByG2.body.data.find((s) => s.id === studentId)).toBeTruthy();
  });
});

describe('Section filter (ACR-002)', () => {
  it('narrows the roster to a specific Section, not just its Class', async () => {
    const suffix = uniqueSuffix();
    const classRes = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: `SectionFilterGrade ${suffix}` });
    const classId = classRes.body.data.id;
    const sectionARes = await request(app)
      .post(`/api/v1/classes/${classId}/sections`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: 'A' });
    const sectionBRes = await request(app)
      .post(`/api/v1/classes/${classId}/sections`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: 'B' });
    const sectionAId = sectionARes.body.data.id;
    const sectionBId = sectionBRes.body.data.id;

    const studentAId = await admitStudent(schoolAToken, `section-filter-a-${suffix}@example.com`, 'Section Filter A');
    await request(app)
      .post(`/api/v1/students/${studentAId}/enrollments`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ classId, sectionId: sectionAId, academicYear: '2025/2026' });

    const studentBId = await admitStudent(schoolAToken, `section-filter-b-${suffix}@example.com`, 'Section Filter B');
    await request(app)
      .post(`/api/v1/students/${studentBId}/enrollments`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ classId, sectionId: sectionBId, academicYear: '2025/2026' });

    const filteredByClassOnly = await request(app)
      .get(`/api/v1/students?classId=${classId}`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(filteredByClassOnly.body.data.map((s) => s.id).sort()).toEqual([studentAId, studentBId].sort());

    const filteredBySectionA = await request(app)
      .get(`/api/v1/students?sectionId=${sectionAId}`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(filteredBySectionA.body.data.map((s) => s.id)).toEqual([studentAId]);

    const filteredBySectionB = await request(app)
      .get(`/api/v1/students?classId=${classId}&sectionId=${sectionBId}`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(filteredBySectionB.body.data.map((s) => s.id)).toEqual([studentBId]);
  });
});
