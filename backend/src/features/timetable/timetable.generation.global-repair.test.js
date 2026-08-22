// Tests for the Global Repair Phase — a bounded combination optimizer that
// runs AFTER the existing greedy pass + local repair (attemptRepair/
// relocateLesson, untouched) and only ever acts on units THAT pass has
// already reported missing. Same isolation strategy as
// timetable.generation.repair.test.js: ctx is built by hand via
// generation.__testing, so these tests exercise the real Hard Constraint
// functions without being hostage to the greedy loop's own scoring/
// ordering (a separate, untouched concern).
jest.mock('./timetable.repository');
jest.mock('../classes/classes.service');
jest.mock('../school-schedule/school-schedule.service');
jest.mock('../teacher-subject-assignments/teacher-subject-assignments.service');
jest.mock('../subjects/subjects.service');
jest.mock('../teachers/teachers.service');
jest.mock('../weekly-subject-allocations/weekly-subject-allocations.service');

const repository = require('./timetable.repository');
const classesService = require('../classes/classes.service');
const schoolScheduleService = require('../school-schedule/school-schedule.service');
const teacherSubjectAssignmentsService = require('../teacher-subject-assignments/teacher-subject-assignments.service');
const subjectsService = require('../subjects/subjects.service');
const teachersService = require('../teachers/teachers.service');
const weeklySubjectAllocationsService = require('../weekly-subject-allocations/weekly-subject-allocations.service');
const generation = require('./timetable.generation');
const {
  buildContext,
  occupySlot,
  slotKey,
  generateCandidatePlansForUnit,
  applyPlanToShadowCtx,
  undoPlanApplication,
  planGlobalRepair,
  summarizeBranch,
  isStrictlyBetter,
  MAX_PLANS_PER_UNIT,
  MAX_MISSING_FOR_GLOBAL_REPAIR,
} = generation.__testing;

const SCHOOL_ID = 'school-1';
const ACADEMIC_YEAR_ID = 'year-1';
const TIMETABLE_VERSION_ID = 'draft-1';
const DAY = 'MONDAY';

function period(id, displayOrder) {
  return { id, name: `P${displayOrder}`, type: 'TEACHING', displayOrder };
}
function makePeriods(count) {
  const periods = [];
  for (let i = 0; i < count; i += 1) periods.push(period(`p${i}`, i));
  return periods;
}
function record({ lessonId, teacherId, classId, periodId, relocatable, assignment }) {
  const displayOrder = Number(periodId.slice(1));
  return {
    lessonId,
    teacherId,
    classId,
    dayOfWeek: DAY,
    periodId,
    periodObj: period(periodId, displayOrder),
    lessonGroupId: null,
    relocatable,
    assignment,
  };
}
function dbLesson({ id, teacherId, classId, periodId, teacherSubjectAssignmentId }) {
  return { id, teacherId, classId, dayOfWeek: DAY, periodId, teacherSubjectAssignmentId, lessonGroupId: null, status: 'ACTIVE' };
}

beforeEach(() => {
  jest.clearAllMocks();
  repository.findOptimizationSettings.mockResolvedValue(null);
  repository.findTeacherPreference.mockResolvedValue(null);
  repository.updateLesson.mockResolvedValue({});
  repository.createLesson.mockImplementation(async (data) => ({ id: `new-${Math.random().toString(36).slice(2)}`, ...data }));
  classesService.getClassById.mockImplementation(async (classId) => ({ id: classId, shiftId: 'shift-1' }));
  teacherSubjectAssignmentsService.listAssignments.mockResolvedValue({ assignments: [] });
  teacherSubjectAssignmentsService.getTeacherWeeklyCommitmentAndCapacity.mockResolvedValue({ committed: 0, capacity: 999 });
  subjectsService.getSubjectById.mockResolvedValue({ id: 'subject-1', name: 'Subject' });
  teachersService.getTeacherById.mockResolvedValue({ id: 'teacher', fullName: 'Teacher' });
  weeklySubjectAllocationsService.getWeeklyPeriodsForAssignment.mockResolvedValue(null);
});

async function buildCtx(periodCount) {
  schoolScheduleService.getWorkingDays.mockResolvedValue([DAY]);
  schoolScheduleService.getShiftPeriods.mockResolvedValue(makePeriods(periodCount));
  return buildContext(SCHOOL_ID);
}

function missingUnit(assignmentId, classId, teacherId, instance = 1) {
  return { key: `${assignmentId}#${instance}`, unit: { assignment: { id: assignmentId, classId, teacherId }, isDouble: false } };
}

describe('Test A — two individually valid plans that conflict with each other', () => {
  it('never commits both when both want the same Teacher at the same Day+Period', async () => {
    const ctx = await buildCtx(10);
    const TA = 'teacher-TA';
    // Two missing units, same Teacher, different Classes. Each is free ONLY
    // at p0 for that Teacher — a genuinely single-candidate, zero-move plan
    // each (depth 0), but both plans want the exact same (TA, MONDAY, p0).
    const entryX = missingUnit('tsa-x', 'class-x', TA);
    const entryY = missingUnit('tsa-y', 'class-y', TA);

    // Each Class is free ONLY at p0 (locked elsewhere) — so each unit has
    // exactly ONE possible plan, and both plans are individually, trivially
    // valid (no moves needed) against the clean baseline. With no
    // alternative slot available for either, the optimizer cannot dodge the
    // conflict by picking a different candidate the way it legitimately
    // could if one of them had a second option.
    for (let i = 1; i < 10; i += 1) {
      occupySlot(ctx, record({ lessonId: `x-locked-${i}`, teacherId: 'teacher-filler', classId: 'class-x', periodId: `p${i}`, relocatable: false, assignment: null }), DAY, `p${i}`);
      occupySlot(ctx, record({ lessonId: `y-locked-${i}`, teacherId: 'teacher-filler', classId: 'class-y', periodId: `p${i}`, relocatable: false, assignment: null }), DAY, `p${i}`);
    }

    const result = await planGlobalRepair(SCHOOL_ID, ACADEMIC_YEAR_ID, TIMETABLE_VERSION_ID, [entryX, entryY], ctx, [DAY], []);

    expect(result.committedPlans.length).toBeLessThanOrEqual(1);
    // Whichever one committed, verify the OTHER never also lands at p0 for TA.
    if (result.committedPlans.length === 1) {
      expect(result.committedPlans[0].moves).toEqual([]);
    }
  });
});

describe('Test B — two plans individually valid and compatible', () => {
  it('selects both', async () => {
    const ctx = await buildCtx(10);
    // Two missing units, disjoint Teachers and Classes, disjoint free slots
    // — nothing about placing one affects the other.
    const entryX = missingUnit('tsa-x', 'class-x', 'teacher-A');
    const entryY = missingUnit('tsa-y', 'class-y', 'teacher-B');
    // class-x/teacher-A free only at p0; class-y/teacher-B free only at p1
    // — occupy every OTHER slot for each pairing so each has exactly one,
    // non-conflicting candidate.
    for (let i = 1; i < 10; i += 1) {
      occupySlot(ctx, record({ lessonId: `x-locked-${i}`, teacherId: 'teacher-filler', classId: 'class-x', periodId: `p${i}`, relocatable: false, assignment: null }), DAY, `p${i}`);
    }
    for (let i = 0; i < 10; i += 1) {
      if (i === 1) continue;
      occupySlot(ctx, record({ lessonId: `y-locked-${i}`, teacherId: 'teacher-filler', classId: 'class-y', periodId: `p${i}`, relocatable: false, assignment: null }), DAY, `p${i}`);
    }

    const result = await planGlobalRepair(SCHOOL_ID, ACADEMIC_YEAR_ID, TIMETABLE_VERSION_ID, [entryX, entryY], ctx, [DAY], []);

    expect(result.committedPlans.length).toBe(2);
    const keys = result.committedPlans.map((p) => p.missingUnitKey).sort();
    expect(keys).toEqual(['tsa-x#1', 'tsa-y#1']);
  });
});

describe('Test C — placed count strictly dominates quality (Requirement 12 order)', () => {
  it('a combination that places more is chosen over one that places less, regardless of quality', async () => {
    const placesOne = summarizeBranch([{ missingUnitKey: 'a#1', moves: [], attemptsSpent: 1, planId: 'a#1@x' }]);
    const placesNone = summarizeBranch([]);
    // isStrictlyBetter must decide this from placedDelta ALONE — it must
    // never even need to call computeQualityScore (Requirement 12: (a)
    // before (c)). If it tried to, these mocked services (returning empty/
    // neutral data) would make "placesNone" score higher on every quality
    // component that defaults away from 0 for an empty lesson list — a
    // wrong implementation would visibly pick the WRONG branch here.
    const better = await isStrictlyBetter(SCHOOL_ID, ACADEMIC_YEAR_ID, TIMETABLE_VERSION_ID, [], placesOne, placesNone, new Map());
    expect(better).toBe(true);
  });
});

describe('Test D — no repair combination improves the baseline', () => {
  it('commits nothing when every candidate slot is a genuine dead end', async () => {
    const ctx = await buildCtx(10);
    const TA = 'teacher-TA';
    const entry = missingUnit('tsa-dead', 'class-dead', TA);
    // The only candidate slot (p0) is single-blocker (class-dead busy via a
    // LOCKED lesson) — and that blocker can never move (locked).
    occupySlot(ctx, record({ lessonId: 'locked-blocker', teacherId: 'teacher-other', classId: 'class-dead', periodId: 'p0', relocatable: false, assignment: null }), DAY, 'p0');
    for (let i = 1; i < 10; i += 1) {
      occupySlot(ctx, record({ lessonId: `dead-locked-${i}`, teacherId: 'teacher-filler', classId: 'class-dead', periodId: `p${i}`, relocatable: false, assignment: null }), DAY, `p${i}`);
    }

    const result = await planGlobalRepair(SCHOOL_ID, ACADEMIC_YEAR_ID, TIMETABLE_VERSION_ID, [entry], ctx, [DAY], []);

    expect(result.committedPlans).toEqual([]);
    expect(repository.updateLesson).not.toHaveBeenCalled();
  });
});

describe('Test E — a Locked Lesson in a candidate repair is never moved', () => {
  it('is never proposed as a relocatable blocker, and is never touched', async () => {
    const ctx = await buildCtx(4);
    const TA = 'teacher-TA';
    const lockedBlocker = record({ lessonId: 'locked-1', teacherId: TA, classId: 'class-locked-owner', periodId: 'p0', relocatable: false, assignment: { id: 'tsa-locked-owner', classId: 'class-locked-owner', teacherId: TA } });
    occupySlot(ctx, lockedBlocker, DAY, 'p0');
    occupySlot(ctx, record({ lessonId: 'busy-1', teacherId: 'teacher-other', classId: 'class-missing', periodId: 'p1', relocatable: false, assignment: null }), DAY, 'p1');
    occupySlot(ctx, record({ lessonId: 'busy-2', teacherId: 'teacher-other', classId: 'class-missing', periodId: 'p2', relocatable: false, assignment: null }), DAY, 'p2');
    occupySlot(ctx, record({ lessonId: 'busy-3', teacherId: 'teacher-other', classId: 'class-missing', periodId: 'p3', relocatable: false, assignment: null }), DAY, 'p3');

    const unit = { assignment: { id: 'tsa-missing', classId: 'class-missing', teacherId: TA }, isDouble: false };
    const plans = await generateCandidatePlansForUnit(SCHOOL_ID, 'tsa-missing#1', unit, ctx, [DAY]);

    expect(plans).toEqual([]);
    expect(lockedBlocker.dayOfWeek).toBe(DAY);
    expect(lockedBlocker.periodId).toBe('p0');
    expect(repository.updateLesson).not.toHaveBeenCalled();
  });
});

describe('Test F — a combination that would create a Teacher conflict is rejected', () => {
  it('applyPlanToShadowCtx refuses the second plan once the first already occupies that Teacher slot', async () => {
    const ctx = await buildCtx(4);
    const TA = 'teacher-TA';
    const planA = { planId: 'a#1@final', missingUnitKey: 'a#1', unit: { assignment: { id: 'tsa-a', classId: 'class-a', teacherId: TA }, isDouble: false }, finalSlot: { day: DAY, period: period('p0', 0) }, moves: [], depth: 0, attemptsSpent: 0 };
    // Same Teacher, DIFFERENT Class, SAME final slot — a genuine Teacher conflict if both were applied.
    const planB = { planId: 'b#1@final', missingUnitKey: 'b#1', unit: { assignment: { id: 'tsa-b', classId: 'class-b', teacherId: TA }, isDouble: false }, finalSlot: { day: DAY, period: period('p0', 0) }, moves: [], depth: 0, attemptsSpent: 0 };

    const recordsByLessonId = new Map();
    const appliedA = applyPlanToShadowCtx(ctx, planA, recordsByLessonId);
    expect(appliedA).not.toBeNull();

    const appliedB = applyPlanToShadowCtx(ctx, planB, recordsByLessonId);
    expect(appliedB).toBeNull(); // rejected — TA is already busy at MONDAY p0 from plan A

    undoPlanApplication(ctx, appliedA, recordsByLessonId);
    expect(ctx.teacherBusy.has(slotKey(TA, DAY, 'p0'))).toBe(false);
  });
});

describe('Test G — a combination that would create a Class conflict is rejected', () => {
  it('applyPlanToShadowCtx refuses the second plan once the first already occupies that Class slot', async () => {
    const ctx = await buildCtx(4);
    const CLASS = 'class-shared';
    const planA = { planId: 'a#1@final', missingUnitKey: 'a#1', unit: { assignment: { id: 'tsa-a', classId: CLASS, teacherId: 'teacher-A' }, isDouble: false }, finalSlot: { day: DAY, period: period('p0', 0) }, moves: [], depth: 0, attemptsSpent: 0 };
    // Same Class, DIFFERENT Teacher, SAME final slot — a genuine Class conflict if both were applied.
    const planB = { planId: 'b#1@final', missingUnitKey: 'b#1', unit: { assignment: { id: 'tsa-b', classId: CLASS, teacherId: 'teacher-B' }, isDouble: false }, finalSlot: { day: DAY, period: period('p0', 0) }, moves: [], depth: 0, attemptsSpent: 0 };

    const recordsByLessonId = new Map();
    const appliedA = applyPlanToShadowCtx(ctx, planA, recordsByLessonId);
    expect(appliedA).not.toBeNull();

    const appliedB = applyPlanToShadowCtx(ctx, planB, recordsByLessonId);
    expect(appliedB).toBeNull(); // rejected — the Class is already busy at MONDAY p0 from plan A

    undoPlanApplication(ctx, appliedA, recordsByLessonId);
    expect(ctx.classBusy.has(slotKey(CLASS, DAY, 'p0'))).toBe(false);
  });
});

describe('Test H — multiple missing instances of the SAME Assignment', () => {
  it('are treated as separate units and can never both occupy the same slot', async () => {
    const ctx = await buildCtx(10);
    const TA = 'teacher-TA';
    const CLASS = 'class-f3a-biology';
    // Same Assignment (tsa-biology), two missing instances — F3A Biology's
    // own real shape (missing 2 of 4). Free only at p0 and p1 for this
    // (Teacher, Class) pairing.
    for (let i = 2; i < 10; i += 1) {
      occupySlot(ctx, record({ lessonId: `locked-${i}`, teacherId: 'teacher-filler', classId: CLASS, periodId: `p${i}`, relocatable: false, assignment: null }), DAY, `p${i}`);
    }
    const entry1 = missingUnit('tsa-biology', CLASS, TA, 1);
    const entry2 = missingUnit('tsa-biology', CLASS, TA, 2);
    expect(entry1.key).not.toBe(entry2.key);

    const result = await planGlobalRepair(SCHOOL_ID, ACADEMIC_YEAR_ID, TIMETABLE_VERSION_ID, [entry1, entry2], ctx, [DAY], []);

    // Both instances resolvable (p0 for one, p1 for the other) — verify
    // they land on DIFFERENT slots, never the same one twice.
    expect(result.committedPlans.length).toBe(2);
    const finalSlots = result.committedPlans.map((p) => `${p.finalSlot.day}|${p.finalSlot.period.id}`);
    expect(new Set(finalSlots).size).toBe(2);
    const keys = result.committedPlans.map((p) => p.missingUnitKey).sort();
    expect(keys).toEqual(['tsa-biology#1', 'tsa-biology#2']);
  });
});

describe('Test I — can never reduce the baseline', () => {
  it('the empty combination (baseline) is always available and always wins when nothing improves on it', async () => {
    const ctx = await buildCtx(4);
    // No missing entries at all — the simplest "baseline can't regress" case.
    const result = await planGlobalRepair(SCHOOL_ID, ACADEMIC_YEAR_ID, TIMETABLE_VERSION_ID, [], ctx, [DAY], []);
    expect(result.attempted).toBe(false);
    expect(result.committedPlans).toEqual([]);
  });

  it('skips entirely (never even attempts) when missing.length exceeds the safety ceiling', async () => {
    const ctx = await buildCtx(4);
    const entries = [];
    for (let i = 0; i < MAX_MISSING_FOR_GLOBAL_REPAIR + 1; i += 1) {
      entries.push(missingUnit(`tsa-${i}`, `class-${i}`, `teacher-${i}`));
    }
    const result = await planGlobalRepair(SCHOOL_ID, ACADEMIC_YEAR_ID, TIMETABLE_VERSION_ID, entries, ctx, [DAY], []);
    expect(result.attempted).toBe(false);
    expect(result.committedPlans).toEqual([]);
  });
});

describe('Requirement 5 — plan generation never writes to the database', () => {
  it('repository.updateLesson is never called while generating candidate plans, even for a successful multi-move plan', async () => {
    const ctx = await buildCtx(65);
    const TA = 'teacher-TA';
    const C_TARGET = 'class-target';
    const C_BLOCKER = 'class-blocker';
    occupySlot(ctx, record({ lessonId: 'blocker', teacherId: TA, classId: C_BLOCKER, periodId: 'p0', relocatable: true, assignment: { id: 'tsa-blocker', classId: C_BLOCKER, teacherId: TA } }), DAY, 'p0');
    // p1 open for the blocker to escape to.
    const unit = { assignment: { id: 'tsa-target', classId: C_TARGET, teacherId: TA }, isDouble: false };

    const plans = await generateCandidatePlansForUnit(SCHOOL_ID, 'tsa-target#1', unit, ctx, [DAY]);

    expect(plans.length).toBeGreaterThan(0);
    expect(repository.updateLesson).not.toHaveBeenCalled();
    expect(repository.createLesson).not.toHaveBeenCalled();
    // ctx must be exactly as found — rolled back after every candidate.
    expect(ctx.teacherBusy.has(slotKey(TA, DAY, 'p0'))).toBe(true);
  });
});

describe('MAX_PLANS_PER_UNIT is respected', () => {
  it('never generates more than 3 plans for one missing unit', async () => {
    const ctx = await buildCtx(20);
    const TA = 'teacher-TA';
    const C_TARGET = 'class-target';
    // Five independent single-move escapes for the target — more than MAX_PLANS_PER_UNIT.
    for (let i = 0; i < 5; i += 1) {
      const blockerClass = `class-blocker-${i}`;
      occupySlot(ctx, record({ lessonId: `blocker-${i}`, teacherId: TA, classId: blockerClass, periodId: `p${i}`, relocatable: true, assignment: { id: `tsa-blocker-${i}`, classId: blockerClass, teacherId: TA } }), DAY, `p${i}`);
    }
    // Target free only at p0..p4 (each currently TA-busy above), locked elsewhere.
    for (let i = 5; i < 20; i += 1) {
      occupySlot(ctx, record({ lessonId: `target-locked-${i}`, teacherId: 'teacher-filler', classId: C_TARGET, periodId: `p${i}`, relocatable: false, assignment: null }), DAY, `p${i}`);
    }
    const unit = { assignment: { id: 'tsa-target', classId: C_TARGET, teacherId: TA }, isDouble: false };

    const plans = await generateCandidatePlansForUnit(SCHOOL_ID, 'tsa-target#1', unit, ctx, [DAY]);
    expect(plans.length).toBeLessThanOrEqual(MAX_PLANS_PER_UNIT);
  });
});
