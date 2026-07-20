// Integration tests against the real Express app and dev database. See
// ../../shared/test-helpers.js — self-contained, creates fresh Schools/School
// Admins per run rather than depending on manually-created fixtures.
const { app, request, loginSuperAdmin, createTestSchoolAdmin, uniqueSuffix } = require('../../shared/test-helpers');
const prisma = require('../../config/database');

jest.setTimeout(30000);

let superAdminToken;
let schoolA; // gains SECONDARY too, below — offers both Education Levels
let schoolB; // stays at the default [PRIMARY] only
let suffix;

async function createSubject(name, educationLevel) {
  const res = await request(app)
    .post('/api/v1/subjects')
    .set('Authorization', `Bearer ${superAdminToken}`)
    .send({ name, educationLevel });
  return res.body.data;
}

beforeAll(async () => {
  superAdminToken = await loginSuperAdmin();
  suffix = uniqueSuffix();

  schoolA = await createTestSchoolAdmin(superAdminToken, {
    schoolName: `Subjects IT A ${suffix}`,
    adminEmail: `subjects-it-a-${suffix}@example.com`,
    password: 'SubjectsIT123',
  });
  schoolB = await createTestSchoolAdmin(superAdminToken, {
    schoolName: `Subjects IT B ${suffix}`,
    adminEmail: `subjects-it-b-${suffix}@example.com`,
    password: 'SubjectsIT123',
  });

  await request(app)
    .patch(`/api/v1/schools/${schoolA.schoolId}/education-levels`)
    .set('Authorization', `Bearer ${superAdminToken}`)
    .send({ educationLevels: ['PRIMARY', 'SECONDARY'] });
});

describe('Subject catalog — permissions', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/subjects');
    expect(res.status).toBe(401);
  });

  it('rejects a School Admin creating a Subject', async () => {
    const res = await request(app)
      .post('/api/v1/subjects')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ name: `Nope ${suffix}`, educationLevel: 'PRIMARY' });
    expect(res.status).toBe(403);
  });

  it('rejects a School Admin listing the platform-wide catalog', async () => {
    const res = await request(app).get('/api/v1/subjects').set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(403);
  });
});

describe('Subject catalog — create (Business Rule #3)', () => {
  it('creates a Subject with valid name + educationLevel', async () => {
    const res = await request(app)
      .post('/api/v1/subjects')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: `English ${suffix}`, educationLevel: 'PRIMARY' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('ACTIVE');
  });

  it('rejects a missing name with 422', async () => {
    const res = await request(app)
      .post('/api/v1/subjects')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ educationLevel: 'PRIMARY' });
    expect(res.status).toBe(422);
  });

  // Phase 9 code review finding: these previously reached Prisma unvalidated
  // and surfaced as an unhandled 500 (PrismaClientValidationError).
  it('rejects an invalid status query filter with 422, not 500', async () => {
    const res = await request(app)
      .get('/api/v1/subjects?status=BOGUS')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(422);
  });

  it('rejects an invalid educationLevel query filter with 422, not 500', async () => {
    const res = await request(app)
      .get('/api/v1/subjects?educationLevel=TERTIARY')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(422);
  });

  it('rejects a duplicate (name, educationLevel) pair with 409', async () => {
    const name = `Duplicate Test ${suffix}`;
    await createSubject(name, 'PRIMARY');

    const res = await request(app)
      .post('/api/v1/subjects')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name, educationLevel: 'PRIMARY' });
    expect(res.status).toBe(409);
  });

  it('allows the same name across two different Education Levels', async () => {
    const name = `English ${suffix}`; // already created as PRIMARY above
    const res = await request(app)
      .post('/api/v1/subjects')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name, educationLevel: 'SECONDARY' });
    expect(res.status).toBe(201);
  });
});

describe('Subject catalog — update, archive, reactivate (Business Rules #2, #4)', () => {
  it('renames a Subject freely', async () => {
    const subject = await createSubject(`Rename Me ${suffix}`, 'PRIMARY');

    const res = await request(app)
      .patch(`/api/v1/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: `Renamed ${suffix}` });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe(`Renamed ${suffix}`);
  });

  it('allows changing Education Level while unassigned', async () => {
    const subject = await createSubject(`Relevel Me ${suffix}`, 'PRIMARY');

    const res = await request(app)
      .patch(`/api/v1/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ educationLevel: 'SECONDARY' });
    expect(res.status).toBe(200);
    expect(res.body.data.educationLevel).toBe('SECONDARY');
  });

  it('rejects changing Education Level once assigned to a School', async () => {
    const subject = await createSubject(`Locked Level ${suffix}`, 'PRIMARY');
    await request(app)
      .post(`/api/v1/schools/${schoolA.schoolId}/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    const res = await request(app)
      .patch(`/api/v1/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ educationLevel: 'SECONDARY' });
    expect(res.status).toBe(409);
  });

  // Phase 9 code review finding: the Implementation Plan's own Risk
  // Assessment called for this exact scenario to be tested (a bug counting
  // soft-removed rows would incorrectly lock Education Level forever), but
  // no test previously removed-then-re-patched to prove the real behavior.
  it('unlocks Education Level again once the Subject\'s only assignment is removed', async () => {
    const subject = await createSubject(`Unlock After Remove ${suffix}`, 'PRIMARY');
    await request(app)
      .post(`/api/v1/schools/${schoolA.schoolId}/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    const stillLocked = await request(app)
      .patch(`/api/v1/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ educationLevel: 'SECONDARY' });
    expect(stillLocked.status).toBe(409);

    await request(app)
      .delete(`/api/v1/schools/${schoolA.schoolId}/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    const unlocked = await request(app)
      .patch(`/api/v1/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ educationLevel: 'SECONDARY' });
    expect(unlocked.status).toBe(200);
    expect(unlocked.body.data.educationLevel).toBe('SECONDARY');
  });

  it('archives an Active Subject and is idempotent on a second archive', async () => {
    const subject = await createSubject(`Archive Me ${suffix}`, 'PRIMARY');

    const first = await request(app)
      .patch(`/api/v1/subjects/${subject.id}/archive`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe('ARCHIVED');

    const second = await request(app)
      .patch(`/api/v1/subjects/${subject.id}/archive`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(second.status).toBe(200);
    expect(second.body.data.status).toBe('ARCHIVED');
  });

  it('reactivates an Archived Subject', async () => {
    const subject = await createSubject(`Reactivate Me ${suffix}`, 'PRIMARY');
    await request(app)
      .patch(`/api/v1/subjects/${subject.id}/archive`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    const res = await request(app)
      .patch(`/api/v1/subjects/${subject.id}/reactivate`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ACTIVE');
  });
});

describe('Subject-to-School assignment (Business Rules #5, #6, #7)', () => {
  it('assigns a Subject to a School that offers its Education Level', async () => {
    const subject = await createSubject(`Assign Happy Path ${suffix}`, 'PRIMARY');

    const res = await request(app)
      .post(`/api/v1/schools/${schoolA.schoolId}/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
  });

  it("rejects assignment to a School that doesn't offer the Subject's Education Level", async () => {
    const subject = await createSubject(`Secondary Only ${suffix}`, 'SECONDARY');

    // schoolB only has PRIMARY.
    const res = await request(app)
      .post(`/api/v1/schools/${schoolB.schoolId}/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(409);
  });

  it('rejects assigning an Archived Subject', async () => {
    const subject = await createSubject(`Archived Assign ${suffix}`, 'PRIMARY');
    await request(app)
      .patch(`/api/v1/subjects/${subject.id}/archive`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    const res = await request(app)
      .post(`/api/v1/schools/${schoolA.schoolId}/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(409);
  });

  it('rejects a School Admin attempting to assign a Subject', async () => {
    const subject = await createSubject(`SA Cannot Assign ${suffix}`, 'PRIMARY');

    const res = await request(app)
      .post(`/api/v1/schools/${schoolA.schoolId}/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(403);
  });

  it('is idempotent on re-assigning an already-assigned Subject', async () => {
    const subject = await createSubject(`Idempotent Assign ${suffix}`, 'PRIMARY');
    await request(app)
      .post(`/api/v1/schools/${schoolA.schoolId}/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    const res = await request(app)
      .post(`/api/v1/schools/${schoolA.schoolId}/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);

    const listRes = await request(app)
      .get(`/api/v1/schools/${schoolA.schoolId}/subjects`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    const matches = listRes.body.data.filter((row) => row.subjectId === subject.id);
    expect(matches).toHaveLength(1);
  });
});

describe("A School's assigned Subjects — read access (Business Rule #10, tenant isolation)", () => {
  it("lets a School Admin view their own school's assigned Subjects", async () => {
    const subject = await createSubject(`Own School View ${suffix}`, 'PRIMARY');
    await request(app)
      .post(`/api/v1/schools/${schoolA.schoolId}/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    const res = await request(app)
      .get(`/api/v1/schools/${schoolA.schoolId}/subjects`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((row) => row.subjectId === subject.id)).toBe(true);
  });

  it("rejects a School Admin viewing another school's assigned Subjects with 404", async () => {
    const res = await request(app)
      .get(`/api/v1/schools/${schoolB.schoolId}/subjects`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(404);
  });

  it('lets Super Admin view any school\'s assigned Subjects', async () => {
    const res = await request(app)
      .get(`/api/v1/schools/${schoolB.schoolId}/subjects`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
  });

  it('shows an Archived-but-assigned Subject, clearly marked', async () => {
    const subject = await createSubject(`Archived But Assigned ${suffix}`, 'PRIMARY');
    await request(app)
      .post(`/api/v1/schools/${schoolA.schoolId}/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    await request(app)
      .patch(`/api/v1/subjects/${subject.id}/archive`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    const res = await request(app)
      .get(`/api/v1/schools/${schoolA.schoolId}/subjects`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    const row = res.body.data.find((r) => r.subjectId === subject.id);
    expect(row).toBeDefined();
    expect(row.subject.status).toBe('ARCHIVED');
  });
});

describe('Subject-to-School removal (Business Rule #8)', () => {
  it('removes an assignment when no dependency checker objects', async () => {
    const subject = await createSubject(`Remove Me ${suffix}`, 'PRIMARY');
    await request(app)
      .post(`/api/v1/schools/${schoolA.schoolId}/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    const res = await request(app)
      .delete(`/api/v1/schools/${schoolA.schoolId}/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);

    const listRes = await request(app)
      .get(`/api/v1/schools/${schoolA.schoolId}/subjects`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(listRes.body.data.some((row) => row.subjectId === subject.id)).toBe(false);
  });

  it('rejects removing an assignment that was never made', async () => {
    const subject = await createSubject(`Never Assigned ${suffix}`, 'PRIMARY');

    const res = await request(app)
      .delete(`/api/v1/schools/${schoolA.schoolId}/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(404);
  });

  it('rejects a School Admin attempting to remove a Subject assignment', async () => {
    const subject = await createSubject(`SA Cannot Remove ${suffix}`, 'PRIMARY');
    await request(app)
      .post(`/api/v1/schools/${schoolA.schoolId}/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    const res = await request(app)
      .delete(`/api/v1/schools/${schoolA.schoolId}/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(403);
  });

  it('re-assigning after removal reactivates the same assignment (no duplicate rows)', async () => {
    const subject = await createSubject(`Reassign After Remove ${suffix}`, 'PRIMARY');
    await request(app)
      .post(`/api/v1/schools/${schoolA.schoolId}/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    await request(app)
      .delete(`/api/v1/schools/${schoolA.schoolId}/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    const reassign = await request(app)
      .post(`/api/v1/schools/${schoolA.schoolId}/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(reassign.status).toBe(200);

    const listRes = await request(app)
      .get(`/api/v1/schools/${schoolA.schoolId}/subjects`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    const matches = listRes.body.data.filter((row) => row.subjectId === subject.id);
    expect(matches).toHaveLength(1);
  });
});

// Every write function calls recordAuditEvent, and the unit tests
// (subjects.service.test.js) each assert it was *called* against a mocked
// repository — but nothing had verified an audit event is actually
// *persisted* for this feature specifically. These query the real
// audit_logs table directly, per Business Rule #11 and the standard audit
// record (Tenant, User, Action, Timestamp) defined in Multi-Tenancy.md.
describe('Audit Trail persistence (Business Rule #11, #12)', () => {
  async function findAuditEvent(action, matcher) {
    const events = await prisma.auditLog.findMany({
      where: { action },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return events.find(matcher);
  }

  it('SUBJECT_CREATED is persisted with schoolId: null — Subject is platform-wide, not tenant-scoped', async () => {
    const subject = await createSubject(`Audit Create ${suffix}`, 'PRIMARY');

    const event = await findAuditEvent('SUBJECT_CREATED', (e) => e.metadata?.subjectId === subject.id);
    expect(event).toBeTruthy();
    expect(event.schoolId).toBeNull();
    expect(event.userId).toBeTruthy();
  });

  it('SUBJECT_ASSIGNED_TO_SCHOOL and SUBJECT_ASSIGNMENT_REMOVED are persisted with the target schoolId', async () => {
    const subject = await createSubject(`Audit Assign ${suffix}`, 'PRIMARY');
    await request(app)
      .post(`/api/v1/schools/${schoolA.schoolId}/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    await request(app)
      .delete(`/api/v1/schools/${schoolA.schoolId}/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    const assignEvent = await findAuditEvent(
      'SUBJECT_ASSIGNED_TO_SCHOOL',
      (e) => e.metadata?.subjectId === subject.id
    );
    const removeEvent = await findAuditEvent(
      'SUBJECT_ASSIGNMENT_REMOVED',
      (e) => e.metadata?.subjectId === subject.id
    );
    expect(assignEvent).toBeTruthy();
    expect(assignEvent.schoolId).toBe(schoolA.schoolId);
    expect(removeEvent).toBeTruthy();
    expect(removeEvent.schoolId).toBe(schoolA.schoolId);
  });
});
