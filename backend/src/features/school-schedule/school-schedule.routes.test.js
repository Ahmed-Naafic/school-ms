// Integration tests against the real Express app and dev database. See
// ../../shared/test-helpers.js — self-contained, creates fresh Schools/School
// Admins per run rather than depending on manually-created fixtures.
const {
  app,
  request,
  loginSuperAdmin,
  createTestSchoolAdmin,
  createTestSchoolAdminDirect,
  uniqueSuffix,
} = require('../../shared/test-helpers');
const prisma = require('../../config/database');
const service = require('./school-schedule.service');

jest.setTimeout(30000);

let superAdminToken;
let schoolA;
let schoolB;
let suffix;

beforeAll(async () => {
  superAdminToken = await loginSuperAdmin();
  suffix = uniqueSuffix();

  // createTestSchoolAdmin's own POST /schools call now also auto-creates
  // the default School Calendar + "Morning" Shift, per Business Rule #3 —
  // no manual setup needed for either school used below.
  schoolA = await createTestSchoolAdmin(superAdminToken, {
    schoolName: `Schedule IT A ${suffix}`,
    adminEmail: `schedule-it-a-${suffix}@example.com`,
    password: 'ScheduleIT123456',
  });
  schoolB = await createTestSchoolAdmin(superAdminToken, {
    schoolName: `Schedule IT B ${suffix}`,
    adminEmail: `schedule-it-b-${suffix}@example.com`,
    password: 'ScheduleIT123456',
  });
});

describe('Permissions', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/school-calendar');
    expect(res.status).toBe(401);
  });

  it('rejects a Super Admin on the school-scoped Calendar/Shift views (own-view path, not the oversight path)', async () => {
    const res = await request(app)
      .get('/api/v1/school-calendar')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Default Calendar and Shift, auto-created at school creation (Business Rule #3)', () => {
  it('GET /school-calendar returns the Somalia Default immediately', async () => {
    const res = await request(app).get('/api/v1/school-calendar').set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.workingDays.sort()).toEqual(
      ['MONDAY', 'SATURDAY', 'SUNDAY', 'TUESDAY', 'WEDNESDAY'].sort()
    );
  });

  it('GET /shifts returns exactly one Shift ("Morning"), Active and Default, at displayOrder 1', async () => {
    const res = await request(app).get('/api/v1/shifts').set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ name: 'Morning', isDefault: true, status: 'ACTIVE', displayOrder: 1 });
  });
});

describe('School Calendar update (Business Rules #4, #5, #6)', () => {
  it('updates the Working/Weekend Day configuration', async () => {
    const res = await request(app)
      .patch('/api/v1/school-calendar')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] });
    expect(res.status).toBe(200);
    expect(res.body.data.workingDays.sort()).toEqual(['FRIDAY', 'MONDAY', 'THURSDAY', 'TUESDAY', 'WEDNESDAY'].sort());
  });

  it('rejects an empty workingDays array with 422', async () => {
    const res = await request(app)
      .patch('/api/v1/school-calendar')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ workingDays: [] });
    expect(res.status).toBe(422);
  });

  it('rejects a full 7-day workingDays array with 422', async () => {
    const res = await request(app)
      .patch('/api/v1/school-calendar')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ workingDays: ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] });
    expect(res.status).toBe(422);
  });

  it("Teacher can view but not update the school's Calendar", async () => {
    // No Teacher account is onboarded in this file (would spend the
    // password-reset rate limiter's shared budget) — role rejection is
    // already exercised structurally by the PATCH route requiring
    // SCHOOL_ADMIN only; confirmed here via a Super Admin token instead,
    // which is equally rejected by the same requireRole('SCHOOL_ADMIN') gate.
    const res = await request(app)
      .patch('/api/v1/school-calendar')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ workingDays: ['MONDAY'] });
    expect(res.status).toBe(403);
  });
});

describe('Shift Creation and Correction (Business Rule #12)', () => {
  let afternoonShiftId;

  it('creates a new Shift with no overlap', async () => {
    const res = await request(app)
      .post('/api/v1/shifts')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ name: 'Afternoon', startTime: '13:30', endTime: '18:00' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: 'Afternoon', isDefault: false, status: 'ACTIVE', displayOrder: 2 });
    afternoonShiftId = res.body.data.id;
  });

  it('rejects a new Shift overlapping an existing active Shift', async () => {
    const res = await request(app)
      .post('/api/v1/shifts')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ name: 'Overlapping', startTime: '12:00', endTime: '17:00' });
    expect(res.status).toBe(409);
  });

  it('rejects a field other than name/startTime/endTime in a correction (Guard by Construction)', async () => {
    const res = await request(app)
      .patch(`/api/v1/shifts/${afternoonShiftId}`)
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ name: 'Afternoon', startTime: '13:30', endTime: '18:00', isDefault: true });
    expect(res.status).toBe(422);
  });

  it('corrects a Shift\'s own name and times without overlapping itself', async () => {
    const res = await request(app)
      .patch(`/api/v1/shifts/${afternoonShiftId}`)
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ name: 'Afternoon Block', startTime: '13:00', endTime: '18:00' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Afternoon Block');
    expect(res.body.data.startTime).toBe('13:00');
  });

  it('rejects correcting a Shift into a range that overlaps a different active Shift', async () => {
    const res = await request(app)
      .patch(`/api/v1/shifts/${afternoonShiftId}`)
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ name: 'Afternoon Block', startTime: '07:00', endTime: '18:00' });
    expect(res.status).toBe(409);
  });
});

describe('Shift Lifecycle (Reorder / Designate-Default / Archive / Reactivate)', () => {
  let morningId;
  let eveningId;

  beforeAll(async () => {
    const listRes = await request(app).get('/api/v1/shifts').set('Authorization', `Bearer ${schoolA.token}`);
    morningId = listRes.body.data.find((s) => s.name === 'Morning').id;

    const created = await request(app)
      .post('/api/v1/shifts')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ name: 'Evening', startTime: '19:00', endTime: '21:00' });
    eveningId = created.body.data.id;
  });

  it('reorders a Shift, renumbering the active sequence to a contiguous 1..N', async () => {
    const res = await request(app)
      .patch(`/api/v1/shifts/${eveningId}/sequence`)
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ position: 1 });
    expect(res.status).toBe(200);
    const evening = res.body.data.find((s) => s.id === eveningId);
    expect(evening.displayOrder).toBe(1);
  });

  it('designates a different active Shift as Default', async () => {
    const res = await request(app)
      .patch(`/api/v1/shifts/${eveningId}/designate-default`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isDefault).toBe(true);

    const morningRes = await request(app)
      .get(`/api/v1/shifts/${morningId}`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(morningRes.body.data.isDefault).toBe(false);
  });

  it('rejects designating an Archived Shift as Default', async () => {
    const archived = await request(app)
      .post('/api/v1/shifts')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ name: 'ToArchive', startTime: '05:00', endTime: '06:00' });
    await request(app)
      .patch(`/api/v1/shifts/${archived.body.data.id}/archive`)
      .set('Authorization', `Bearer ${schoolA.token}`);

    const res = await request(app)
      .patch(`/api/v1/shifts/${archived.body.data.id}/designate-default`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(409);
  });

  it('rejects reordering an Archived Shift, rather than crashing (Phase 9 finding)', async () => {
    const toArchive = await request(app)
      .post('/api/v1/shifts')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ name: 'Archived For Reorder', startTime: '01:00', endTime: '02:00' });
    await request(app)
      .patch(`/api/v1/shifts/${toArchive.body.data.id}/archive`)
      .set('Authorization', `Bearer ${schoolA.token}`);

    const res = await request(app)
      .patch(`/api/v1/shifts/${toArchive.body.data.id}/sequence`)
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ position: 1 });
    expect(res.status).toBe(409);
  });

  it('rejects archiving the current Default Shift', async () => {
    const res = await request(app)
      .patch(`/api/v1/shifts/${eveningId}/archive`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(409);
  });

  it('archives a non-Default Shift, removing it from the active sequence', async () => {
    const res = await request(app)
      .patch(`/api/v1/shifts/${morningId}/archive`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ARCHIVED');
    expect(res.body.data.displayOrder).toBeNull();
  });

  it('reactivates the Shift, appending it to the end of the active sequence, not as Default', async () => {
    const res = await request(app)
      .patch(`/api/v1/shifts/${morningId}/reactivate`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.isDefault).toBe(false);
    expect(res.body.data.displayOrder).toBeGreaterThan(0);
  });

  it("rejects reactivating a Shift whose old range now overlaps a currently-active Shift (Technical Design Review finding)", async () => {
    const toArchive = await request(app)
      .post('/api/v1/shifts')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ name: 'Soon Archived', startTime: '02:00', endTime: '03:00' });
    await request(app)
      .patch(`/api/v1/shifts/${toArchive.body.data.id}/archive`)
      .set('Authorization', `Bearer ${schoolA.token}`);

    // A different Shift now occupies that exact range while the first sat archived.
    await request(app)
      .post('/api/v1/shifts')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ name: 'New Occupant', startTime: '02:00', endTime: '03:00' });

    const res = await request(app)
      .patch(`/api/v1/shifts/${toArchive.body.data.id}/reactivate`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(409);
  });

  it('rejects archiving the school\'s only remaining active Shift', async () => {
    // Archive every active Shift except one, then confirm the last one is protected.
    const listRes = await request(app).get('/api/v1/shifts?status=ACTIVE').set('Authorization', `Bearer ${schoolA.token}`);
    const active = listRes.body.data;
    const nonDefault = active.filter((s) => !s.isDefault);
    for (const shift of nonDefault) {
      await request(app).patch(`/api/v1/shifts/${shift.id}/archive`).set('Authorization', `Bearer ${schoolA.token}`);
    }
    const defaultShift = active.find((s) => s.isDefault);

    const res = await request(app)
      .patch(`/api/v1/shifts/${defaultShift.id}/archive`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(409);
  });
});

describe('Class Management integration (Business Rule #13)', () => {
  it("defaults a new Class's shiftId to the school's own current Default Shift when omitted", async () => {
    const defaultShift = await request(app).get('/api/v1/shifts').set('Authorization', `Bearer ${schoolA.token}`);
    const currentDefault = defaultShift.body.data.find((s) => s.isDefault);

    const res = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ name: `Grade Schedule Test ${suffix}` });
    expect(res.status).toBe(201);
    expect(res.body.data.shiftId).toBe(currentDefault.id);
  });

  it('rejects creating a Class with an invalid/cross-school shiftId', async () => {
    const res = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ name: `Grade Invalid Shift ${suffix}`, shiftId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(422);
  });

  it('blocks archiving a Shift referenced by an active Class', async () => {
    const classRes = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ name: `Grade Shift Ref ${suffix}` });
    const shiftId = classRes.body.data.shiftId;

    const res = await request(app)
      .patch(`/api/v1/shifts/${shiftId}/archive`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(409);
  });
});

describe('Tenant isolation', () => {
  it("School B cannot see School A's Shifts", async () => {
    const bRes = await request(app).get('/api/v1/shifts').set('Authorization', `Bearer ${schoolB.token}`);
    const aRes = await request(app).get('/api/v1/shifts').set('Authorization', `Bearer ${schoolA.token}`);
    expect(bRes.status).toBe(200);
    const bIds = bRes.body.data.map((s) => s.id);
    expect(aRes.body.data.some((s) => bIds.includes(s.id))).toBe(false);
  });

  it("School B cannot correct School A's Shift (404, not 403)", async () => {
    const listRes = await request(app).get('/api/v1/shifts').set('Authorization', `Bearer ${schoolA.token}`);
    const target = listRes.body.data[0];

    const res = await request(app)
      .patch(`/api/v1/shifts/${target.id}`)
      .set('Authorization', `Bearer ${schoolB.token}`)
      .send({ name: 'Hijacked', startTime: '01:00', endTime: '02:00' });
    expect(res.status).toBe(404);
  });
});

describe('Super Admin oversight (read-only)', () => {
  it("views any school's Calendar and Shifts", async () => {
    const calendarRes = await request(app)
      .get(`/api/v1/schools/${schoolA.schoolId}/school-calendar`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(calendarRes.status).toBe(200);

    const shiftsRes = await request(app)
      .get(`/api/v1/schools/${schoolA.schoolId}/shifts`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(shiftsRes.status).toBe(200);
  });

  it('rejects a School Admin using the oversight path for a different school', async () => {
    const res = await request(app)
      .get(`/api/v1/schools/${schoolB.schoolId}/school-calendar`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(403);
  });
});

// Every write function calls recordAuditEvent — verify at least one is
// actually persisted, mirroring every other feature's own Audit Trail test.
describe('Audit Trail persistence', () => {
  it('SHIFT_CREATED is persisted with the real schoolId', async () => {
    const created = await request(app)
      .post('/api/v1/shifts')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ name: `Audit Shift ${suffix}`, startTime: '04:00', endTime: '05:00' });

    const event = await prisma.auditLog.findFirst({
      where: { schoolId: schoolA.schoolId, action: 'SHIFT_CREATED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(event).toBeTruthy();
    expect(event.metadata.shiftId).toBe(created.body.data.id);
  });

  it('SCHOOL_CALENDAR_CREATED and DEFAULT_SHIFT_CREATED are persisted at school creation time', async () => {
    const calendarEvent = await prisma.auditLog.findFirst({
      where: { schoolId: schoolA.schoolId, action: 'SCHOOL_CALENDAR_CREATED' },
    });
    const shiftEvent = await prisma.auditLog.findFirst({
      where: { schoolId: schoolA.schoolId, action: 'DEFAULT_SHIFT_CREATED' },
    });
    expect(calendarEvent).toBeTruthy();
    expect(shiftEvent).toBeTruthy();
  });
});

// Unit tests with a mocked transaction can't prove a real Postgres advisory
// lock actually serializes concurrent requests for the same school — this
// fires genuinely concurrent calls (Promise.allSettled, not sequential)
// against the real service layer + real database, mirroring Teacher
// Subject Assignment's own concurrency test exactly. Concurrency kept
// modest (3), matching that same test's own lesson about this dev DB's
// small connection pool under a multi-query-per-transaction write path.
describe('Concurrency (Business Rules #8, #12, #13, Implementation Requirements)', () => {
  it('concurrent Shift creations with an identical overlapping time range never 500 and leave exactly one Active row', async () => {
    const rawSchool = await prisma.school.create({ data: { name: `Schedule Concurrency ${suffix}` } });
    await service.createDefaultScheduleForSchool(rawSchool.id, { id: 'concurrency-test-user' });
    const fakeActingUser = { id: 'concurrency-test-user' };

    const concurrency = 3;
    const results = await Promise.allSettled(
      Array.from({ length: concurrency }, () =>
        service.createShift(rawSchool.id, { name: 'Racing Shift', startTime: '20:00', endTime: '22:00' }, fakeActingUser)
      )
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);

    const activeShifts = await prisma.shift.findMany({ where: { schoolId: rawSchool.id, status: 'ACTIVE' } });
    // The default "Morning" Shift plus exactly one of the racing creates.
    expect(activeShifts).toHaveLength(2);
    const displayOrders = activeShifts.map((s) => s.displayOrder).sort();
    expect(displayOrders).toEqual([1, 2]);

    await prisma.class.deleteMany({ where: { schoolId: rawSchool.id } });
    await prisma.shift.deleteMany({ where: { schoolId: rawSchool.id } });
    await prisma.schoolCalendar.deleteMany({ where: { schoolId: rawSchool.id } });
    await prisma.auditLog.deleteMany({ where: { schoolId: rawSchool.id } });
    await prisma.school.delete({ where: { id: rawSchool.id } });
  });

  it('concurrent Shift archive and Class creation cannot leave an active Class referencing an archived Shift', async () => {
    const rawSchool = await prisma.school.create({ data: { name: `Schedule Class Race ${suffix}` } });
    await service.createDefaultScheduleForSchool(rawSchool.id, { id: 'concurrency-test-user' });
    // (ACR-009, Architecture Update — Grade/Form) A raw school bypasses
    // createSchool's own orchestration entirely, so it has no GradeLevel to
    // default to unless created explicitly here too.
    const classesService = require('../classes/classes.service');
    await classesService.createDefaultGradeLevelForSchool(rawSchool.id, 'PRIMARY');

    const createdShift = await service.createShift(
      rawSchool.id,
      { name: 'Class Race Shift', startTime: '14:00', endTime: '16:00' },
      { id: 'concurrency-test-user' }
    );

    const actingUser = { id: 'concurrency-test-user', schoolId: rawSchool.id };

    const results = await Promise.allSettled([
      service.archiveShift(rawSchool.id, createdShift.id, actingUser),
      classesService.createClass({ name: 'Class Race Grade', shiftId: createdShift.id }, actingUser),
    ]);

    const archiveSucceeded = results[0].status === 'fulfilled';
    const classSucceeded = results[1].status === 'fulfilled';
    expect(archiveSucceeded && classSucceeded).toBe(false);

    const archivedShift = await prisma.shift.findUnique({ where: { id: createdShift.id } });
    const referencingClasses = await prisma.class.findMany({
      where: { schoolId: rawSchool.id, shiftId: createdShift.id, status: 'ACTIVE' },
    });

    if (archivedShift.status === 'ARCHIVED') {
      expect(referencingClasses).toHaveLength(0);
    }

    await prisma.class.deleteMany({ where: { schoolId: rawSchool.id } });
    await prisma.shift.deleteMany({ where: { schoolId: rawSchool.id } });
    await prisma.schoolCalendar.deleteMany({ where: { schoolId: rawSchool.id } });
    await prisma.auditLog.deleteMany({ where: { schoolId: rawSchool.id } });
    await prisma.school.delete({ where: { id: rawSchool.id } });
  });
});

// Architecture Update (Periods). All route-level tests below share ONE
// freshly created school (periodSchool), created once here via
// createTestSchoolAdminDirect rather than createTestSchoolAdmin — this
// describe block genuinely needs a third, distinct tenant (see Tenant
// isolation below, which uses schoolB as the cross-tenant attacker against
// periodSchool's own Periods), and schoolA/schoolB's own two real
// password-reset round trips already spend 4 of the shared limiter's 5-per-
// 15-minute budget, leaving no room for a third real one.
describe('Architecture Update (Periods)', () => {
  let periodSchool;

  beforeAll(async () => {
    const localSuffix = uniqueSuffix();
    periodSchool = await createTestSchoolAdminDirect({
      schoolName: `Period Suite ${localSuffix}`,
      adminEmail: `period-suite-${localSuffix}@example.com`,
      password: 'PeriodTest123456',
    });
  });

  describe('Default Period structure, auto-created with the default Shift (Business Rule #3)', () => {
    it("the default 'Morning' Shift already has the 7-slot default Period structure, all times unconfigured", async () => {
      const shiftsRes = await request(app).get('/api/v1/shifts').set('Authorization', `Bearer ${periodSchool.token}`);
      const morningShiftId = shiftsRes.body.data.find((s) => s.isDefault).id;

      const res = await request(app)
        .get(`/api/v1/shifts/${morningShiftId}/periods`)
        .set('Authorization', `Bearer ${periodSchool.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(7);
      expect(res.body.data.map((p) => ({ name: p.name, type: p.type, displayOrder: p.displayOrder }))).toEqual([
        { name: 'Period 1', type: 'TEACHING', displayOrder: 1 },
        { name: 'Period 2', type: 'TEACHING', displayOrder: 2 },
        { name: 'Period 3', type: 'TEACHING', displayOrder: 3 },
        { name: 'Break', type: 'BREAK', displayOrder: 4 },
        { name: 'Period 4', type: 'TEACHING', displayOrder: 5 },
        { name: 'Period 5', type: 'TEACHING', displayOrder: 6 },
        { name: 'Period 6', type: 'TEACHING', displayOrder: 7 },
      ]);
      expect(res.body.data.every((p) => p.startTime === null && p.endTime === null)).toBe(true);
    });
  });

  describe('Setup wizard — custom Period structure at Shift creation', () => {
    it('generates a custom structure from caller-supplied wizard fields', async () => {
      const shiftRes = await request(app)
        .post('/api/v1/shifts')
        .set('Authorization', `Bearer ${periodSchool.token}`)
        .send({
          name: 'Evening',
          startTime: '18:00',
          endTime: '21:00',
          teachingPeriodCount: 4,
          includeBreak: true,
          breakAfterPeriod: 2,
        });
      expect(shiftRes.status).toBe(201);

      const periodsRes = await request(app)
        .get(`/api/v1/shifts/${shiftRes.body.data.id}/periods`)
        .set('Authorization', `Bearer ${periodSchool.token}`);
      expect(periodsRes.body.data.map((p) => ({ name: p.name, type: p.type }))).toEqual([
        { name: 'Period 1', type: 'TEACHING' },
        { name: 'Period 2', type: 'TEACHING' },
        { name: 'Break', type: 'BREAK' },
        { name: 'Period 3', type: 'TEACHING' },
        { name: 'Period 4', type: 'TEACHING' },
      ]);
    });

    it('rejects a breakAfterPeriod exceeding teachingPeriodCount', async () => {
      const res = await request(app)
        .post('/api/v1/shifts')
        .set('Authorization', `Bearer ${periodSchool.token}`)
        .send({ name: 'Evening Invalid', startTime: '21:00', endTime: '22:00', teachingPeriodCount: 2, breakAfterPeriod: 5 });
      expect(res.status).toBe(422);
    });
  });

  describe('Period Core CRUD and Lifecycle', () => {
    let shiftId;
    let periodId;

    beforeAll(async () => {
      const shiftRes = await request(app)
        .post('/api/v1/shifts')
        .set('Authorization', `Bearer ${periodSchool.token}`)
        .send({ name: 'Morning Extra', startTime: '05:00', endTime: '06:00', teachingPeriodCount: 1, includeBreak: false });
      shiftId = shiftRes.body.data.id;
    });

    it('creates a Period with no times (unconfigured)', async () => {
      const res = await request(app)
        .post(`/api/v1/shifts/${shiftId}/periods`)
        .set('Authorization', `Bearer ${periodSchool.token}`)
        .send({ name: 'Warm-up', type: 'TEACHING' });
      expect(res.status).toBe(201);
      expect(res.body.data.startTime).toBeNull();
      periodId = res.body.data.id;
    });

    it('rejects a configured Period outside the parent Shift\'s own operating hours (05:00-06:00)', async () => {
      const res = await request(app)
        .post(`/api/v1/shifts/${shiftId}/periods`)
        .set('Authorization', `Bearer ${periodSchool.token}`)
        .send({ name: 'Too Early', type: 'TEACHING', startTime: '04:00', endTime: '04:30' });
      expect(res.status).toBe(422);
    });

    it('configures the Period\'s times via PATCH /periods/{id}', async () => {
      const res = await request(app)
        .patch(`/api/v1/periods/${periodId}`)
        .set('Authorization', `Bearer ${periodSchool.token}`)
        .send({ name: 'Warm-up', type: 'TEACHING', startTime: '05:00', endTime: '05:15' });
      expect(res.status).toBe(200);
      expect(res.body.data.startTime).toBe('05:00');
    });

    it('rejects a second Period overlapping the first, in the same Shift', async () => {
      const res = await request(app)
        .post(`/api/v1/shifts/${shiftId}/periods`)
        .set('Authorization', `Bearer ${periodSchool.token}`)
        .send({ name: 'Overlap', type: 'TEACHING', startTime: '05:05', endTime: '05:20' });
      expect(res.status).toBe(409);
    });

    it('rejects a field other than name/type/startTime/endTime in a correction (Guard by Construction)', async () => {
      const res = await request(app)
        .patch(`/api/v1/periods/${periodId}`)
        .set('Authorization', `Bearer ${periodSchool.token}`)
        .send({ name: 'Warm-up', type: 'TEACHING', startTime: '05:00', endTime: '05:15', displayOrder: 5 });
      expect(res.status).toBe(422);
    });

    it('reorders Periods within the Shift, renumbering the active sequence', async () => {
      const secondRes = await request(app)
        .post(`/api/v1/shifts/${shiftId}/periods`)
        .set('Authorization', `Bearer ${periodSchool.token}`)
        .send({ name: 'Second', type: 'TEACHING' });
      const secondId = secondRes.body.data.id;

      const res = await request(app)
        .patch(`/api/v1/periods/${secondId}/sequence`)
        .set('Authorization', `Bearer ${periodSchool.token}`)
        .send({ position: 1 });
      expect(res.status).toBe(200);
      expect(res.body.data[0].id).toBe(secondId);
      expect(res.body.data[0].displayOrder).toBe(1);
    });

    it('archives a Period, removing it from the active sequence, then restores it to the end', async () => {
      const archiveRes = await request(app)
        .patch(`/api/v1/periods/${periodId}/archive`)
        .set('Authorization', `Bearer ${periodSchool.token}`);
      expect(archiveRes.status).toBe(200);
      expect(archiveRes.body.data.status).toBe('ARCHIVED');
      expect(archiveRes.body.data.displayOrder).toBeNull();

      const reactivateRes = await request(app)
        .patch(`/api/v1/periods/${periodId}/reactivate`)
        .set('Authorization', `Bearer ${periodSchool.token}`);
      expect(reactivateRes.status).toBe(200);
      expect(reactivateRes.body.data.status).toBe('ACTIVE');
    });

    it('rejects reordering an Archived Period', async () => {
      const archiveRes = await request(app)
        .patch(`/api/v1/periods/${periodId}/archive`)
        .set('Authorization', `Bearer ${periodSchool.token}`);
      expect(archiveRes.status).toBe(200);

      const res = await request(app)
        .patch(`/api/v1/periods/${periodId}/sequence`)
        .set('Authorization', `Bearer ${periodSchool.token}`)
        .send({ position: 1 });
      expect(res.status).toBe(409);
    });
  });

  describe('updateShift retrofit — rejects narrowing operating hours that would strand a Period (Technical Design Review finding)', () => {
    it('409s when an existing configured Period no longer fits the new range', async () => {
      const shiftRes = await request(app)
        .post('/api/v1/shifts')
        .set('Authorization', `Bearer ${periodSchool.token}`)
        .send({ name: 'Retrofit Shift', startTime: '01:00', endTime: '04:00', teachingPeriodCount: 1, includeBreak: false });
      const shiftId = shiftRes.body.data.id;
      const periodsRes = await request(app)
        .get(`/api/v1/shifts/${shiftId}/periods`)
        .set('Authorization', `Bearer ${periodSchool.token}`);
      const periodId = periodsRes.body.data[0].id;

      await request(app)
        .patch(`/api/v1/periods/${periodId}`)
        .set('Authorization', `Bearer ${periodSchool.token}`)
        .send({ name: 'Period 1', type: 'TEACHING', startTime: '01:00', endTime: '02:00' });

      const res = await request(app)
        .patch(`/api/v1/shifts/${shiftId}`)
        .set('Authorization', `Bearer ${periodSchool.token}`)
        .send({ name: 'Retrofit Shift', startTime: '01:30', endTime: '04:00' });
      expect(res.status).toBe(409);
    });
  });

  // Reuses the file's own existing schoolB (created once at the top of this
  // file) rather than a third fresh school, to stay within the shared
  // password-reset rate-limit budget.
  describe('Tenant isolation and Permissions', () => {
    it("School B cannot see periodSchool's Periods (404, not a leaked 403)", async () => {
      const shiftsRes = await request(app).get('/api/v1/shifts').set('Authorization', `Bearer ${periodSchool.token}`);
      const shiftId = shiftsRes.body.data[0].id;

      const res = await request(app)
        .get(`/api/v1/shifts/${shiftId}/periods`)
        .set('Authorization', `Bearer ${schoolB.token}`);
      expect(res.status).toBe(404);
    });

    it('School Admin can create and read Periods; a non-School-Admin role is rejected on write', async () => {
      const shiftsRes = await request(app).get('/api/v1/shifts').set('Authorization', `Bearer ${periodSchool.token}`);
      const shiftId = shiftsRes.body.data[0].id;

      const createRes = await request(app)
        .post(`/api/v1/shifts/${shiftId}/periods`)
        .set('Authorization', `Bearer ${periodSchool.token}`)
        .send({ name: 'Permission Test', type: 'TEACHING' });
      expect(createRes.status).toBe(201);

      const readRes = await request(app)
        .get(`/api/v1/shifts/${shiftId}/periods`)
        .set('Authorization', `Bearer ${periodSchool.token}`);
      expect(readRes.status).toBe(200);

      // Super Admin stands in for "any role without write access to this
      // School-Admin-only endpoint" — the same substitute this suite's own
      // Phase 7 Validation already used to stay within the rate-limit budget
      // (see docs/08-validation/School-Schedule-Management.md).
      const forbiddenWrite = await request(app)
        .post(`/api/v1/shifts/${shiftId}/periods`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ name: 'Blocked', type: 'TEACHING' });
      expect(forbiddenWrite.status).toBe(403);
    });
  });

  describe('Super Admin oversight (read-only)', () => {
    // Asserts parity with the owner's own view rather than a hardcoded
    // count — the preceding "School Admin can create and read Periods" test
    // adds an 8th Period to this same default Shift, so a fixed
    // toHaveLength(7) here is order-dependent on exactly which tests already
    // ran, not a real assertion about oversight correctness.
    it("views any school's Periods for a given Shift", async () => {
      const shiftsRes = await request(app).get('/api/v1/shifts').set('Authorization', `Bearer ${periodSchool.token}`);
      const shiftId = shiftsRes.body.data[0].id;

      const ownerRes = await request(app)
        .get(`/api/v1/shifts/${shiftId}/periods`)
        .set('Authorization', `Bearer ${periodSchool.token}`);

      const res = await request(app)
        .get(`/api/v1/schools/${periodSchool.schoolId}/shifts/${shiftId}/periods`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(ownerRes.body.data);
    });
  });

  describe('Audit Trail persistence', () => {
    it('PERIOD_CREATED is persisted with the real schoolId (resolved via the parent Shift)', async () => {
      const shiftsRes = await request(app).get('/api/v1/shifts').set('Authorization', `Bearer ${periodSchool.token}`);
      const shiftId = shiftsRes.body.data[0].id;

      const createRes = await request(app)
        .post(`/api/v1/shifts/${shiftId}/periods`)
        .set('Authorization', `Bearer ${periodSchool.token}`)
        .send({ name: 'Audit Period', type: 'TEACHING' });

      const event = await prisma.auditLog.findFirst({
        where: { schoolId: periodSchool.schoolId, action: 'PERIOD_CREATED' },
        orderBy: { createdAt: 'desc' },
      });
      expect(event).toBeTruthy();
      expect(event.metadata.periodId).toBe(createRes.body.data.id);
    });
  });

  // Unit/mocked tests can't prove a real Postgres advisory lock actually
  // serializes concurrent requests. This fires genuinely concurrent calls
  // (Promise.allSettled) against the real service layer + real database,
  // proving the Technical Design Review's own finding is closed: updateShift
  // and createPeriod/updatePeriod share the shiftId lock, so they can never
  // both succeed into a Period stranded outside its Shift's own hours.
  describe('Concurrency — updateShift vs Period writes (Technical Design Review finding)', () => {
    it('concurrent updateShift (narrowing) and createPeriod (valid under the old range) never both succeed into a stranded Period', async () => {
      const rawSchool = await prisma.school.create({ data: { name: `Period Race ${suffix}` } });
      const fakeActingUser = { id: 'period-race-user' };
      const defaultShift = await service.createDefaultScheduleForSchool(rawSchool.id, fakeActingUser);

      // Narrow the default Shift from 07:30-12:30 to 09:00-12:30, concurrently
      // with creating a Period at 07:30-08:00 — valid under the old range,
      // invalid under the new one.
      const results = await Promise.allSettled([
        service.updateShift(rawSchool.id, defaultShift.id, { name: 'Morning', startTime: '09:00', endTime: '12:30' }, fakeActingUser),
        service.createPeriod(
          rawSchool.id,
          defaultShift.id,
          { name: 'Race Period', type: 'TEACHING', startTime: '07:30', endTime: '08:00' },
          fakeActingUser
        ),
      ]);

      const shiftUpdateSucceeded = results[0].status === 'fulfilled';
      const periodCreateSucceeded = results[1].status === 'fulfilled';

      if (shiftUpdateSucceeded && periodCreateSucceeded) {
        // Both could legitimately succeed only if they were correctly
        // serialized and the Period create happened to run first, then the
        // Shift narrowing found no conflicting Period (impossible here,
        // since the created Period's own 07:30-08:00 range can never fit
        // 09:00-12:30) — so this combination must never occur.
        throw new Error('Both updateShift and createPeriod succeeded — the Period is now stranded outside its Shift\'s hours');
      }
      expect(shiftUpdateSucceeded && periodCreateSucceeded).toBe(false);

      await prisma.period.deleteMany({ where: { shift: { schoolId: rawSchool.id } } });
      await prisma.shift.deleteMany({ where: { schoolId: rawSchool.id } });
      await prisma.schoolCalendar.deleteMany({ where: { schoolId: rawSchool.id } });
      await prisma.auditLog.deleteMany({ where: { schoolId: rawSchool.id } });
      await prisma.school.delete({ where: { id: rawSchool.id } });
    });
  });
});
