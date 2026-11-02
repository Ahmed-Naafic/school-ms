// Integration tests against the real Express app and dev database (via
// supertest, in-process — no network hop, no dependency on the separately
// running dev server). Self-contained: creates its own fresh School(s) and
// School Admin(s) for every run rather than depending on manually-created
// fixtures. See ../../shared/test-helpers.js.
const { app, request, loginSuperAdmin, createTestSchoolAdmin, uniqueSuffix } = require('../../shared/test-helpers');

jest.setTimeout(30000);

let superAdminToken;
let schoolAToken;
let schoolBToken;

beforeAll(async () => {
  superAdminToken = await loginSuperAdmin();

  const suffix = uniqueSuffix();
  const schoolA = await createTestSchoolAdmin(superAdminToken, {
    schoolName: `Classes IT School A ${suffix}`,
    adminEmail: `classes-it-a-${suffix}@example.com`,
    password: 'ClassesIT123',
  });
  schoolAToken = schoolA.token;

  const schoolB = await createTestSchoolAdmin(superAdminToken, {
    schoolName: `Classes IT School B ${suffix}`,
    adminEmail: `classes-it-b-${suffix}@example.com`,
    password: 'ClassesIT123',
  });
  schoolBToken = schoolB.token;
});

describe('authentication and permissions', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/classes');
    expect(res.status).toBe(401);
  });

  it('rejects Super Admin — no operational role in Class Management', async () => {
    const res = await request(app).get('/api/v1/classes').set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(403);
  });

  it('allows School Admin to list Classes (their own, initially empty)', async () => {
    const res = await request(app).get('/api/v1/classes').set('Authorization', `Bearer ${schoolAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('Class CRUD and Business Rule #3 (name unique per school, not platform-wide)', () => {
  it('creates a Class', async () => {
    const res = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: 'Grade 1' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Grade 1');
    expect(res.body.data.sequenceOrder).toBe(1);
  });

  it('rejects a duplicate name within the same school', async () => {
    const res = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: 'Grade 1' });

    expect(res.status).toBe(409);
  });

  it('rejects a missing name', async () => {
    const res = await request(app).post('/api/v1/classes').set('Authorization', `Bearer ${schoolAToken}`).send({});
    expect(res.status).toBe(422);
  });

  it('allows the identical name in a different school (tenant-scoped uniqueness)', async () => {
    const res = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${schoolBToken}`)
      .send({ name: 'Grade 1' });

    expect(res.status).toBe(201);
  });
});

describe('tenant isolation (Multi-Tenancy)', () => {
  let schoolAClassId;

  beforeAll(async () => {
    const res = await request(app).get('/api/v1/classes').set('Authorization', `Bearer ${schoolAToken}`);
    schoolAClassId = res.body.data[0].id;
  });

  it('School B cannot read School A\'s Class', async () => {
    const res = await request(app)
      .get(`/api/v1/classes/${schoolAClassId}`)
      .set('Authorization', `Bearer ${schoolBToken}`);
    expect(res.status).toBe(404);
  });

  it('School B cannot archive School A\'s Class', async () => {
    const res = await request(app)
      .patch(`/api/v1/classes/${schoolAClassId}/archive`)
      .set('Authorization', `Bearer ${schoolBToken}`);
    expect(res.status).toBe(404);
  });
});

describe('final-Class designation (Business Rule #7) and archive/reactivate (#9, #11, #12)', () => {
  let grade2Id;
  let grade3Id;

  beforeAll(async () => {
    const res2 = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: 'Grade 2' });
    grade2Id = res2.body.data.id;

    const res3 = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: 'Grade 3' });
    grade3Id = res3.body.data.id;
  });

  it('designates a Class as final, unsetting any previous one', async () => {
    const first = await request(app)
      .patch(`/api/v1/classes/${grade2Id}/designate-final`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(first.status).toBe(200);
    expect(first.body.data.isFinal).toBe(true);

    const second = await request(app)
      .patch(`/api/v1/classes/${grade3Id}/designate-final`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(second.body.data.isFinal).toBe(true);

    const list = await request(app).get('/api/v1/classes').set('Authorization', `Bearer ${schoolAToken}`);
    const finals = list.body.data.filter((c) => c.isFinal);
    expect(finals).toHaveLength(1);
    expect(finals[0].id).toBe(grade3Id);
  });

  it('rejects designating an archived Class as final', async () => {
    await request(app).patch(`/api/v1/classes/${grade2Id}/archive`).set('Authorization', `Bearer ${schoolAToken}`);

    const res = await request(app)
      .patch(`/api/v1/classes/${grade2Id}/designate-final`)
      .set('Authorization', `Bearer ${schoolAToken}`);

    expect(res.status).toBe(409);
  });

  it('reactivation appends to the end of the sequence, not the old position', async () => {
    const before = await request(app).get('/api/v1/classes').set('Authorization', `Bearer ${schoolAToken}`);
    const maxSeq = Math.max(...before.body.data.map((c) => c.sequenceOrder));

    const res = await request(app)
      .patch(`/api/v1/classes/${grade2Id}/reactivate`)
      .set('Authorization', `Bearer ${schoolAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.sequenceOrder).toBe(maxSeq + 1);
    expect(res.body.data.status).toBe('ACTIVE');
  });

  it('has no delete route', async () => {
    const res = await request(app)
      .delete(`/api/v1/classes/${grade2Id}`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(res.status).toBe(404);
  });

  it('rejects archiving the currently-final Class (Business Rule #7 — regression)', async () => {
    const res = await request(app)
      .patch(`/api/v1/classes/${grade3Id}/archive`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(res.status).toBe(409);

    const stillFinal = await request(app).get(`/api/v1/classes/${grade3Id}`).set('Authorization', `Bearer ${schoolAToken}`);
    expect(stillFinal.body.data.status).toBe('ACTIVE');
    expect(stillFinal.body.data.isFinal).toBe(true);
  });

  it('rejects reordering an archived Class with a clean 409, not a 500 (regression)', async () => {
    const res = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: 'Grade To Archive And Reorder' });
    const freshId = res.body.data.id;
    await request(app).patch(`/api/v1/classes/${freshId}/archive`).set('Authorization', `Bearer ${schoolAToken}`);

    const reorderRes = await request(app)
      .patch(`/api/v1/classes/${freshId}/sequence`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ position: 1 });
    expect(reorderRes.status).toBe(409);
  });
});

describe('Sections (Business Rule #4)', () => {
  let classId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: 'Grade 4' });
    classId = res.body.data.id;
  });

  it('creates a Section under a Class', async () => {
    const res = await request(app)
      .post(`/api/v1/classes/${classId}/sections`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: 'Section A' });
    expect(res.status).toBe(201);
  });

  it('rejects a duplicate Section name within the same Class', async () => {
    const res = await request(app)
      .post(`/api/v1/classes/${classId}/sections`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: 'Section A' });
    expect(res.status).toBe(409);
  });
});

describe('GradeLevel CRUD and lifecycle (ACR-009, Architecture Update — Grade/Form)', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/grade-levels');
    expect(res.status).toBe(401);
  });

  it('every new school already has its own placeholder "Ungrouped" GradeLevel', async () => {
    const res = await request(app).get('/api/v1/grade-levels').set('Authorization', `Bearer ${schoolAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((gl) => gl.name === 'Ungrouped')).toBe(true);
  });

  it('creates a GradeLevel', async () => {
    const res = await request(app)
      .post('/api/v1/grade-levels')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: 'Grade 8', educationLevel: 'PRIMARY' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Grade 8');
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.educationLevel).toBe('PRIMARY');
  });

  it('rejects a missing educationLevel', async () => {
    const res = await request(app)
      .post('/api/v1/grade-levels')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: 'Missing Level Grade' });
    expect(res.status).toBe(422);
  });

  it('rejects a duplicate name within the same school', async () => {
    const res = await request(app)
      .post('/api/v1/grade-levels')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: 'Grade 8', educationLevel: 'PRIMARY' });
    expect(res.status).toBe(409);
  });

  it('allows the identical name in a different school (tenant-scoped uniqueness)', async () => {
    const res = await request(app)
      .post('/api/v1/grade-levels')
      .set('Authorization', `Bearer ${schoolBToken}`)
      .send({ name: 'Grade 8', educationLevel: 'PRIMARY' });
    expect(res.status).toBe(201);
  });

  it('PATCH accepts a corrected educationLevel', async () => {
    const list = await request(app).get('/api/v1/grade-levels').set('Authorization', `Bearer ${schoolAToken}`);
    const gradeLevelId = list.body.data.find((gl) => gl.name === 'Grade 8').id;

    const res = await request(app)
      .patch(`/api/v1/grade-levels/${gradeLevelId}`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: 'Grade 8', educationLevel: 'SECONDARY' });
    expect(res.status).toBe(200);
    expect(res.body.data.educationLevel).toBe('SECONDARY');
  });

  it('PATCH rejects any field other than name/educationLevel (Guard by Construction)', async () => {
    const list = await request(app).get('/api/v1/grade-levels').set('Authorization', `Bearer ${schoolAToken}`);
    const gradeLevelId = list.body.data.find((gl) => gl.name === 'Grade 8').id;

    const res = await request(app)
      .patch(`/api/v1/grade-levels/${gradeLevelId}`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: 'Grade 8 Renamed', status: 'ARCHIVED' });
    expect(res.status).toBe(422);
  });

  it('School B cannot read or archive School A\'s GradeLevel (tenant isolation)', async () => {
    const list = await request(app).get('/api/v1/grade-levels').set('Authorization', `Bearer ${schoolAToken}`);
    const gradeLevelId = list.body.data.find((gl) => gl.name === 'Grade 8').id;

    const getRes = await request(app)
      .get(`/api/v1/grade-levels/${gradeLevelId}`)
      .set('Authorization', `Bearer ${schoolBToken}`);
    expect(getRes.status).toBe(404);

    const archiveRes = await request(app)
      .patch(`/api/v1/grade-levels/${gradeLevelId}/archive`)
      .set('Authorization', `Bearer ${schoolBToken}`);
    expect(archiveRes.status).toBe(404);
  });

  it('blocks archiving a GradeLevel referenced by an active Class', async () => {
    const gradeLevelRes = await request(app)
      .post('/api/v1/grade-levels')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: 'Grade 10', educationLevel: 'PRIMARY' });
    const gradeLevelId = gradeLevelRes.body.data.id;

    await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: 'Grade 10A', gradeLevelId });

    const archiveRes = await request(app)
      .patch(`/api/v1/grade-levels/${gradeLevelId}/archive`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(archiveRes.status).toBe(409);
  });

  it('has no delete route', async () => {
    const list = await request(app).get('/api/v1/grade-levels').set('Authorization', `Bearer ${schoolAToken}`);
    const gradeLevelId = list.body.data[0].id;

    const res = await request(app)
      .delete(`/api/v1/grade-levels/${gradeLevelId}`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(res.status).toBe(404);
  });
});

describe('Same-Shift-within-GradeLevel enforcement (ACR-009), including reactivation (Technical Design Review finding)', () => {
  let sharedGradeLevelId;
  let shiftAId;
  let shiftBId;

  beforeAll(async () => {
    const gradeLevelRes = await request(app)
      .post('/api/v1/grade-levels')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: 'Shared Grade/Form', educationLevel: 'PRIMARY' });
    sharedGradeLevelId = gradeLevelRes.body.data.id;

    // Times chosen to avoid overlapping the school's own auto-created
    // default "Morning" Shift (07:30-12:30).
    const shiftARes = await request(app)
      .post('/api/v1/shifts')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: 'Shift A', startTime: '13:00', endTime: '15:00' });
    shiftAId = shiftARes.body.data.id;

    const shiftBRes = await request(app)
      .post('/api/v1/shifts')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: 'Shift B', startTime: '15:30', endTime: '17:30' });
    shiftBId = shiftBRes.body.data.id;
  });

  it('allows two Classes in the same GradeLevel on the same Shift', async () => {
    const first = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: 'Shared A', gradeLevelId: sharedGradeLevelId, shiftId: shiftAId });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: 'Shared B', gradeLevelId: sharedGradeLevelId, shiftId: shiftAId });
    expect(second.status).toBe(201);
  });

  it('rejects creating a Class in that GradeLevel on a different Shift', async () => {
    const res = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: 'Shared C', gradeLevelId: sharedGradeLevelId, shiftId: shiftBId });
    expect(res.status).toBe(409);
  });

  it('rejects updating an existing Class\'s shiftId alone if it would conflict with its GradeLevel siblings', async () => {
    const list = await request(app).get('/api/v1/classes').set('Authorization', `Bearer ${schoolAToken}`);
    const sharedA = list.body.data.find((c) => c.name === 'Shared A');

    // shiftId is sent, gradeLevelId is left unchanged (name is required on
    // every PATCH regardless, an existing, unrelated Guard). Technical
    // Design Review's own finding: this must be re-checked exactly as if
    // gradeLevelId itself had changed.
    const res = await request(app)
      .patch(`/api/v1/classes/${sharedA.id}`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: sharedA.name, shiftId: shiftBId });
    expect(res.status).toBe(409);
  });

  it('rejects reactivating a Class whose GradeLevel gained a same-Shift-violating sibling while it sat archived (Technical Design Review finding)', async () => {
    // Archive both existing members of sharedGradeLevelId ("Shared A" and
    // "Shared B", both Shift A), leaving it with zero Active Classes — the
    // only state that lets a brand-new Class join it on a *different*
    // Shift with nothing (yet) to conflict with.
    const list = await request(app).get('/api/v1/classes').set('Authorization', `Bearer ${schoolAToken}`);
    const sharedA = list.body.data.find((c) => c.name === 'Shared A');
    const sharedB = list.body.data.find((c) => c.name === 'Shared B');
    await request(app).patch(`/api/v1/classes/${sharedA.id}/archive`).set('Authorization', `Bearer ${schoolAToken}`);
    await request(app).patch(`/api/v1/classes/${sharedB.id}/archive`).set('Authorization', `Bearer ${schoolAToken}`);

    // A brand-new Class now joins sharedGradeLevelId on Shift B — allowed,
    // since sharedGradeLevelId currently has zero Active members.
    const newClassRes = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: 'Shared E', gradeLevelId: sharedGradeLevelId, shiftId: shiftBId });
    expect(newClassRes.status).toBe(201);

    // Reactivating "Shared A" (Shift A) must now be rejected — restoring it
    // would create two Active Classes in sharedGradeLevelId on different
    // Shifts (A and B), exactly the invariant this Architecture Update
    // exists to prevent. Before this fix, reactivateClass never re-checked
    // this at all.
    const reactivateRes = await request(app)
      .patch(`/api/v1/classes/${sharedA.id}/reactivate`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(reactivateRes.status).toBe(409);
  });
});
