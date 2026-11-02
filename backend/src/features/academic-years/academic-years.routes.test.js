// Integration tests against the real Express app and dev database. See
// ../../shared/test-helpers.js — self-contained, creates fresh Schools/School
// Admins per run rather than depending on manually-created fixtures.
const { app, request, loginSuperAdmin, createTestSchoolAdmin, uniqueSuffix } = require('../../shared/test-helpers');
const prisma = require('../../config/database');
const academicYearsService = require('./academic-years.service');

jest.setTimeout(30000);

let superAdminToken;
let schoolA;
let schoolB;
let suffix;

function range(startDate, endDate) {
  return { startDate, endDate };
}

beforeAll(async () => {
  superAdminToken = await loginSuperAdmin();
  suffix = uniqueSuffix();

  schoolA = await createTestSchoolAdmin(superAdminToken, {
    schoolName: `Academic Years IT A ${suffix}`,
    adminEmail: `academic-years-it-a-${suffix}@example.com`,
    password: 'AcademicYearsIT123',
  });
  schoolB = await createTestSchoolAdmin(superAdminToken, {
    schoolName: `Academic Years IT B ${suffix}`,
    adminEmail: `academic-years-it-b-${suffix}@example.com`,
    password: 'AcademicYearsIT123',
  });
});

describe('Permissions', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/academic-years');
    expect(res.status).toBe(401);
  });

  it('rejects a Super Admin — no operational role here', async () => {
    const res = await request(app)
      .get('/api/v1/academic-years')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Create Academic Year (Business Rules #3, #4, #9)', () => {
  it('creates the first Academic Year for a school, which automatically becomes Current', async () => {
    const res = await request(app)
      .post('/api/v1/academic-years')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send(range('2024-09-01', '2025-06-30'));
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.isCurrent).toBe(true);
  });

  it('rejects missing dates with 422', async () => {
    const res = await request(app)
      .post('/api/v1/academic-years')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ startDate: '2030-09-01' });
    expect(res.status).toBe(422);
  });

  it('a second Academic Year is created but does NOT automatically become Current', async () => {
    const res = await request(app)
      .post('/api/v1/academic-years')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send(range('2025-09-01', '2026-06-30'));
    expect(res.status).toBe(201);
    expect(res.body.data.isCurrent).toBe(false);
  });

  it('rejects a date range overlapping an existing Active Academic Year', async () => {
    const res = await request(app)
      .post('/api/v1/academic-years')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send(range('2025-01-01', '2025-12-31')); // overlaps 2024-09-01..2025-06-30
    expect(res.status).toBe(409);
  });

  it('rejects a date range overlapping an Archived Academic Year (Business Review decision)', async () => {
    const created = await request(app)
      .post('/api/v1/academic-years')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send(range('2027-09-01', '2028-06-30'));
    await request(app)
      .patch(`/api/v1/academic-years/${created.body.data.id}/archive`)
      .set('Authorization', `Bearer ${schoolA.token}`);

    const res = await request(app)
      .post('/api/v1/academic-years')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send(range('2027-09-01', '2028-06-30'));
    expect(res.status).toBe(409);
  });

  it('rejects a non-overlapping range whose derived label duplicates an existing one', async () => {
    await request(app)
      .post('/api/v1/academic-years')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send(range('2030-01-01', '2030-03-31'));

    const res = await request(app)
      .post('/api/v1/academic-years')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send(range('2030-09-01', '2030-11-30')); // both derive to "2030/2030"
    expect(res.status).toBe(409);
  });
});

describe('Update Academic Year (Business Rule #6)', () => {
  it('allows editing an Archived Academic Year', async () => {
    const created = await request(app)
      .post('/api/v1/academic-years')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send(range('2040-09-01', '2041-06-30'));
    await request(app)
      .patch(`/api/v1/academic-years/${created.body.data.id}/archive`)
      .set('Authorization', `Bearer ${schoolA.token}`);

    const res = await request(app)
      .patch(`/api/v1/academic-years/${created.body.data.id}`)
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send(range('2040-10-01', '2041-07-31'));
    expect(res.status).toBe(200);
  });

  it('rejects updating a nonexistent Academic Year with 404', async () => {
    const res = await request(app)
      .patch('/api/v1/academic-years/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send(range('2050-09-01', '2051-06-30'));
    expect(res.status).toBe(404);
  });
});

describe('Archive with Current replacement (Business Rule #9)', () => {
  it('rejects archiving the Current Academic Year without a replacement', async () => {
    const currentRes = await request(app)
      .get('/api/v1/academic-years')
      .set('Authorization', `Bearer ${schoolA.token}`);
    const current = currentRes.body.data.find((y) => y.isCurrent);

    const res = await request(app)
      .patch(`/api/v1/academic-years/${current.id}/archive`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(409);
  });

  it('archives the Current Academic Year and hands off Current atomically when a replacement is given', async () => {
    const listRes = await request(app)
      .get('/api/v1/academic-years')
      .set('Authorization', `Bearer ${schoolA.token}`);
    const current = listRes.body.data.find((y) => y.isCurrent);
    const replacement = listRes.body.data.find((y) => y.status === 'ACTIVE' && !y.isCurrent);

    const res = await request(app)
      .patch(`/api/v1/academic-years/${current.id}/archive`)
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ newCurrentAcademicYearId: replacement.id });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ARCHIVED');

    const afterRes = await request(app)
      .get('/api/v1/academic-years')
      .set('Authorization', `Bearer ${schoolA.token}`);
    const newCurrent = afterRes.body.data.find((y) => y.isCurrent);
    expect(newCurrent.id).toBe(replacement.id);
  });

  it('archiving an already-Archived Academic Year is a no-op', async () => {
    const created = await request(app)
      .post('/api/v1/academic-years')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send(range('2060-09-01', '2061-06-30'));
    await request(app)
      .patch(`/api/v1/academic-years/${created.body.data.id}/archive`)
      .set('Authorization', `Bearer ${schoolA.token}`);

    const res = await request(app)
      .patch(`/api/v1/academic-years/${created.body.data.id}/archive`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ARCHIVED');
  });
});

describe('Reactivate (Business Rule #5)', () => {
  it('reactivates an Archived Academic Year without making it Current', async () => {
    const created = await request(app)
      .post('/api/v1/academic-years')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send(range('2070-09-01', '2071-06-30'));
    await request(app)
      .patch(`/api/v1/academic-years/${created.body.data.id}/archive`)
      .set('Authorization', `Bearer ${schoolA.token}`);

    const res = await request(app)
      .patch(`/api/v1/academic-years/${created.body.data.id}/reactivate`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.isCurrent).toBe(false);
  });

  it('reactivating an already-Active Academic Year is a no-op', async () => {
    const created = await request(app)
      .post('/api/v1/academic-years')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send(range('2080-09-01', '2081-06-30'));

    const res = await request(app)
      .patch(`/api/v1/academic-years/${created.body.data.id}/reactivate`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ACTIVE');
  });
});

describe('Designate Current (Business Rule #8)', () => {
  it('rejects designating an Archived Academic Year as Current', async () => {
    const created = await request(app)
      .post('/api/v1/academic-years')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send(range('2090-09-01', '2091-06-30'));
    await request(app)
      .patch(`/api/v1/academic-years/${created.body.data.id}/archive`)
      .set('Authorization', `Bearer ${schoolA.token}`);

    const res = await request(app)
      .patch(`/api/v1/academic-years/${created.body.data.id}/current`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(409);
  });

  it('designating an Active Academic Year as Current unsets the previous one', async () => {
    const created = await request(app)
      .post('/api/v1/academic-years')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send(range('2100-09-01', '2101-06-30'));

    const res = await request(app)
      .patch(`/api/v1/academic-years/${created.body.data.id}/current`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isCurrent).toBe(true);

    const listRes = await request(app)
      .get('/api/v1/academic-years')
      .set('Authorization', `Bearer ${schoolA.token}`);
    const currentOnes = listRes.body.data.filter((y) => y.isCurrent);
    expect(currentOnes).toHaveLength(1);
    expect(currentOnes[0].id).toBe(created.body.data.id);
  });

  it('re-designating an already-Current Academic Year is a no-op', async () => {
    const listRes = await request(app)
      .get('/api/v1/academic-years')
      .set('Authorization', `Bearer ${schoolA.token}`);
    const current = listRes.body.data.find((y) => y.isCurrent);

    const res = await request(app)
      .patch(`/api/v1/academic-years/${current.id}/current`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isCurrent).toBe(true);
  });
});

describe('List filtering', () => {
  it('filters by status', async () => {
    const res = await request(app)
      .get('/api/v1/academic-years?status=ARCHIVED')
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((y) => y.status === 'ARCHIVED')).toBe(true);
  });

  it('rejects an invalid status filter with 422, not 500', async () => {
    const res = await request(app)
      .get('/api/v1/academic-years?status=BOGUS')
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(422);
  });
});

describe('Tenant isolation', () => {
  it("School B cannot see School A's Academic Years", async () => {
    const res = await request(app)
      .get('/api/v1/academic-years')
      .set('Authorization', `Bearer ${schoolB.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it("School B cannot update School A's Academic Year (404, not 403)", async () => {
    const listRes = await request(app)
      .get('/api/v1/academic-years')
      .set('Authorization', `Bearer ${schoolA.token}`);
    const target = listRes.body.data[0];

    const res = await request(app)
      .patch(`/api/v1/academic-years/${target.id}`)
      .set('Authorization', `Bearer ${schoolB.token}`)
      .send(range('2029-09-01', '2029-12-31'));
    expect(res.status).toBe(404);
  });
});

// Every write function calls recordAuditEvent, and the unit tests
// (academic-years.service.test.js) each assert it was *called* against a
// mocked repository — but nothing had verified an audit event is actually
// *persisted*, the same gap Subject Management's own Phase 7 Validation
// found and closed after the fact. Built in from the start here instead.
describe('Audit Trail persistence (Business Rule #13)', () => {
  async function findAuditEvent(schoolId, action, matcher) {
    const events = await prisma.auditLog.findMany({
      where: { schoolId, action },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return events.find(matcher);
  }

  it('ACADEMIC_YEAR_CREATED is persisted with the real schoolId', async () => {
    await request(app)
      .post('/api/v1/academic-years')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send(range('2110-09-01', '2111-06-30'));

    const event = await findAuditEvent(schoolA.schoolId, 'ACADEMIC_YEAR_CREATED', () => true);
    expect(event).toBeTruthy();
    expect(event.userId).toBeTruthy();
  });

  it('ACADEMIC_YEAR_CURRENT_CHANGED is persisted with previous and new Current ids', async () => {
    const created = await request(app)
      .post('/api/v1/academic-years')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send(range('2120-09-01', '2121-06-30'));

    await request(app)
      .patch(`/api/v1/academic-years/${created.body.data.id}/current`)
      .set('Authorization', `Bearer ${schoolA.token}`);

    const event = await findAuditEvent(
      schoolA.schoolId,
      'ACADEMIC_YEAR_CURRENT_CHANGED',
      (e) => e.metadata && e.metadata.newCurrentId === created.body.data.id
    );
    expect(event).toBeTruthy();
    expect(event.metadata.previousCurrentId).toBeTruthy();
  });
});

// Phase 9 code review findings (Critical, both live-reproduced against the
// running dev server before being fixed): concurrent requests could corrupt
// the isCurrent invariant. Unit tests with a mocked transaction can't prove
// a real Postgres advisory lock actually serializes concurrent requests —
// these fire genuinely concurrent HTTP requests (Promise.all, not
// sequential) against the real app + real database.
describe('Concurrency (Phase 9 code review, Business Rules #8, #9)', () => {
  it('concurrent first-Academic-Year creations for the same school never 500 and leave exactly one Current', async () => {
    // Created directly via Prisma, not the full Onboarding + password-reset
    // flow — this race is about createAcademicYear's own concurrency
    // handling, not authentication, and the password-reset endpoint's rate
    // limit (5/15min, Security-Standards.md) is a shared, easily-exhausted
    // budget across a whole test run that this test doesn't need to spend.
    const rawSchool = await prisma.school.create({ data: { name: `Academic Years Concurrency ${suffix}` } });
    const fakeActingUser = { id: 'concurrency-test-user' };

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => {
        const startYear = 2200 + i;
        return academicYearsService.createAcademicYear(
          rawSchool.id,
          { startDate: `${startYear}-09-01`, endDate: `${startYear + 1}-06-30` },
          fakeActingUser
        );
      })
    );

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    const currentOnes = await prisma.academicYear.findMany({ where: { schoolId: rawSchool.id, isCurrent: true } });
    expect(currentOnes).toHaveLength(1);

    await prisma.academicYear.deleteMany({ where: { schoolId: rawSchool.id } });
    await prisma.auditLog.deleteMany({ where: { schoolId: rawSchool.id } });
    await prisma.school.delete({ where: { id: rawSchool.id } });
  });

  it('concurrent archive + designate-current on the same record never leaves it both Archived and Current', async () => {
    const created = await request(app)
      .post('/api/v1/academic-years')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send(range('2210-09-01', '2211-06-30'));
    const targetId = created.body.data.id;
    expect(created.body.data.isCurrent).toBe(false); // schoolA already has a Current year from earlier tests

    await Promise.all([
      request(app)
        .patch(`/api/v1/academic-years/${targetId}/archive`)
        .set('Authorization', `Bearer ${schoolA.token}`),
      request(app)
        .patch(`/api/v1/academic-years/${targetId}/current`)
        .set('Authorization', `Bearer ${schoolA.token}`),
    ]);

    const listRes = await request(app)
      .get('/api/v1/academic-years')
      .set('Authorization', `Bearer ${schoolA.token}`);
    const row = listRes.body.data.find((y) => y.id === targetId);

    // The invalid corrupted state this bug produced was status: ARCHIVED
    // with isCurrent: true simultaneously. Either final outcome (archived-
    // and-not-current, or active-and-current) is a valid resolution of the
    // race; the corrupted combination is not.
    expect(row.status === 'ARCHIVED' && row.isCurrent).toBe(false);
  });
});
