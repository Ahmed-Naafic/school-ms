// Focused unit tests for the bounded repair search (attemptRepair /
// relocateLesson) — specifically the budget-sharing fix. Deliberately tested
// in isolation from the greedy placement loop's own scoring/ordering
// (scoreCandidate, scarcityCost, etc.) via generation.__testing, a small
// test-only export — that scoring machinery is a separate concern untouched
// by this fix, and driving it through generateTimetable end-to-end to force
// one specific unit into repair would make these tests hostage to unrelated
// tie-breaking behavior. ctx is built by hand instead, using the same real
// buildContext/occupySlot/getFullDomainSlots/attemptRepair/relocateLesson
// this file's own generation engine uses — no reimplemented Hard Constraint
// logic anywhere in this file.
jest.mock('./timetable.repository');
jest.mock('../classes/classes.service');
jest.mock('../school-schedule/school-schedule.service');

const repository = require('./timetable.repository');
const classesService = require('../classes/classes.service');
const schoolScheduleService = require('../school-schedule/school-schedule.service');
const generation = require('./timetable.generation');
const {
  buildContext,
  occupySlot,
  getFullDomainSlots,
  attemptRepair,
  relocateLesson,
  slotKey,
  MAX_REPAIR_DEPTH,
  MAX_REPAIR_ATTEMPTS_PER_CANDIDATE,
  MAX_TOTAL_REPAIR_ATTEMPTS_PER_UNIT,
} = generation.__testing;

const SCHOOL_ID = 'school-1';
const DAY = 'MONDAY';
const SHIFT_ID = 'shift-1';

function period(id, displayOrder) {
  return { id, name: `P${displayOrder}`, type: 'TEACHING', displayOrder };
}

// A single day, N-period domain shared by every class in these tests —
// plenty for the budget-exhaustion scenarios below (each candidate slot,
// free or not, costs exactly one attempt to visit).
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

beforeEach(() => {
  jest.clearAllMocks();
  repository.findOptimizationSettings.mockResolvedValue(null);
  repository.findTeacherPreference.mockResolvedValue(null); // no unavailableSlots anywhere in these tests
  repository.updateLesson.mockResolvedValue({});
  classesService.getClassById.mockImplementation(async (classId) => ({ id: classId, shiftId: SHIFT_ID }));
});

// --- Test 1: the budget-starvation fix itself --------------------------------
describe('per-candidate repair budget (the fix)', () => {
  const PERIOD_COUNT = 65; // > MAX_REPAIR_ATTEMPTS_PER_CANDIDATE (60), so a genuine dead end can exhaust a full budget on breadth alone
  const periods = makePeriods(PERIOD_COUNT);

  const TA = 'teacher-TA';
  const TB = 'teacher-filler-1';
  const TB2 = 'teacher-filler-2';
  const C_TARGET = 'class-target';
  const C2 = 'class-blocker-1'; // candidate #1: a genuine dead end
  const C3 = 'class-blocker-2'; // candidate #2 (later in domain order): has a real fix

  // Builds ctx with:
  //  - Target class free at p0 and p40 only (locked-busy everywhere else) —
  //    its own direct candidate scan is already empty, exactly the
  //    "genuinely needs repair" precondition attemptRepair exists for.
  //  - p0's blocker (TA teaching C2) has NO escape anywhere in its own
  //    65-slot domain — every other slot is locked-busy for C2, so
  //    relocating it is a genuine, budget-consuming dead end.
  //  - p40's blocker (TA teaching C3) DOES have a real escape (p41, left
  //    completely open) — reachable only after relocateLesson visits ~41
  //    slots first, well inside a full 60-attempt budget but requiring real
  //    search, not an instant match.
  async function buildScenario() {
    schoolScheduleService.getWorkingDays.mockResolvedValue([DAY]);
    schoolScheduleService.getShiftPeriods.mockResolvedValue(periods);

    const ctx = await buildContext(SCHOOL_ID);

    const c2Blocker = record({
      lessonId: 'lesson-c2-p0',
      teacherId: TA,
      classId: C2,
      periodId: 'p0',
      relocatable: true,
      assignment: { id: 'tsa-c2', classId: C2, teacherId: TA },
    });
    occupySlot(ctx, c2Blocker, DAY, 'p0');
    for (let i = 1; i < PERIOD_COUNT; i += 1) {
      occupySlot(
        ctx,
        record({ lessonId: `lesson-c2-locked-${i}`, teacherId: TB, classId: C2, periodId: `p${i}`, relocatable: false, assignment: null }),
        DAY,
        `p${i}`
      );
    }

    const c3Blocker = record({
      lessonId: 'lesson-c3-p40',
      teacherId: TA,
      classId: C3,
      periodId: 'p40',
      relocatable: true,
      assignment: { id: 'tsa-c3', classId: C3, teacherId: TA },
    });
    occupySlot(ctx, c3Blocker, DAY, 'p40');
    // Locked-busy for C3 at p0..p39 only — p41 onward is left genuinely
    // open (both C3 and TA free there), the real escape route.
    for (let i = 0; i < 40; i += 1) {
      occupySlot(
        ctx,
        record({ lessonId: `lesson-c3-locked-${i}`, teacherId: TB2, classId: C3, periodId: `p${i}`, relocatable: false, assignment: null }),
        DAY,
        `p${i}`
      );
    }

    // Target class: free only at p0 and p40 (both already TA-busy above,
    // via C2/C3) — locked-busy everywhere else.
    for (let i = 1; i < PERIOD_COUNT; i += 1) {
      if (i === 40) continue;
      occupySlot(
        ctx,
        record({ lessonId: `lesson-target-locked-${i}`, teacherId: TB, classId: C_TARGET, periodId: `p${i}`, relocatable: false, assignment: null }),
        DAY,
        `p${i}`
      );
    }

    const unit = { assignment: { id: 'tsa-target', classId: C_TARGET, teacherId: TA }, isDouble: false };
    return { ctx, unit, c2Blocker, c3Blocker };
  }

  it('confirms the target unit genuinely has zero direct candidates (repair precondition)', async () => {
    const { ctx, unit } = await buildScenario();
    const domain = await getFullDomainSlots(SCHOOL_ID, unit, ctx, [DAY]);
    expect(domain).toHaveLength(PERIOD_COUNT);
    for (const slot of domain) {
      const teacherFree = !ctx.teacherBusy.has(slotKey(unit.assignment.teacherId, slot.day, slot.period.id));
      const classFree = !ctx.classBusy.has(slotKey(unit.assignment.classId, slot.day, slot.period.id));
      expect(teacherFree && classFree).toBe(false);
    }
  });

  it('candidate #1 (p0) is a genuine dead end: its own relocation search finds nothing, exhausting a full budget on breadth alone', async () => {
    const { ctx, c2Blocker } = await buildScenario();
    const budget = { attempts: MAX_REPAIR_ATTEMPTS_PER_CANDIDATE, maxDepth: MAX_REPAIR_DEPTH };
    const cleared = await relocateLesson(SCHOOL_ID, c2Blocker, ctx, [DAY], budget, 1);
    expect(cleared).toBe(false);
    expect(budget.attempts).toBe(0); // fully consumed — 64 candidates available, budget caps it at 60
    // Nothing moved — a failed search must never mutate state.
    expect(c2Blocker.periodId).toBe('p0');
  });

  it('candidate #2 (p40) has a real fix, reachable well inside a fresh 60-attempt budget', async () => {
    const { ctx, c3Blocker } = await buildScenario();
    const budget = { attempts: MAX_REPAIR_ATTEMPTS_PER_CANDIDATE, maxDepth: MAX_REPAIR_DEPTH };
    const cleared = await relocateLesson(SCHOOL_ID, c3Blocker, ctx, [DAY], budget, 1);
    expect(cleared).toBe(true);
    expect(c3Blocker.periodId).toBe('p41');
    expect(budget.attempts).toBeGreaterThan(0); // succeeded with budget to spare
  });

  it('OLD shared-budget behavior (reproduced with a single budget object across both candidates) fails on candidate #2 despite a real fix existing — this is the bug', async () => {
    const { ctx, c2Blocker, c3Blocker } = await buildScenario();
    // Exactly how the pre-fix attemptRepair called relocateLesson: one
    // budget object, reused unreset across every candidate slot.
    const sharedBudget = { attempts: MAX_REPAIR_ATTEMPTS_PER_CANDIDATE, maxDepth: MAX_REPAIR_DEPTH };

    const firstCleared = await relocateLesson(SCHOOL_ID, c2Blocker, ctx, [DAY], sharedBudget, 1);
    expect(firstCleared).toBe(false);
    expect(sharedBudget.attempts).toBe(0);

    const secondCleared = await relocateLesson(SCHOOL_ID, c3Blocker, ctx, [DAY], sharedBudget, 1);
    expect(secondCleared).toBe(false); // starved of budget before even being tried, even though it would have succeeded
    expect(c3Blocker.periodId).toBe('p40'); // never moved
  });

  it('NEW attemptRepair (per-candidate budget) finds the fix at candidate #2 that the old shared budget missed', async () => {
    const { ctx, unit, c3Blocker } = await buildScenario();
    const slot = await attemptRepair(SCHOOL_ID, unit, ctx, [DAY]);
    expect(slot).not.toBeNull();
    expect(slot.day).toBe(DAY);
    expect(slot.period.id).toBe('p40');
    // The blocker actually got relocated to make room.
    expect(c3Blocker.periodId).toBe('p41');
  });
});

// --- MAX_TOTAL_REPAIR_ATTEMPTS_PER_UNIT: tried at 1000, reverted to 300 -----
// (see this file's own comment above attemptRepair for why: a real
// stress-test regeneration at 1000 fixed one missing Lesson but regressed a
// different one that had been fine at 300 — net worse, not better — so 300
// is back until an actual algorithm change, not just a bigger number, is
// attempted.)
describe('MAX_TOTAL_REPAIR_ATTEMPTS_PER_UNIT (the global bound)', () => {
  it('is 300 — 1000 was tried and reverted', () => {
    expect(MAX_TOTAL_REPAIR_ATTEMPTS_PER_UNIT).toBe(300);
  });

  // Six genuine dead-end candidates (each capped at a full
  // MAX_REPAIR_ATTEMPTS_PER_CANDIDATE = 60, same as always — this constant
  // is unchanged) followed by a seventh candidate with a real, findable fix.
  // 6 * 60 = 360: past the 300 total cap, so candidate #7's real fix is
  // never reached — this is the known, accepted limitation of keeping the
  // cap at 300 (the same shape of miss the original per-candidate bug had,
  // one level up: budget exhausted by earlier candidates before a later,
  // easy one is even tried).
  const PERIOD_COUNT = 65;
  const periods = makePeriods(PERIOD_COUNT);
  const TA = 'teacher-TA';
  const C_TARGET = 'class-target';
  const DEAD_END_COUNT = 6;
  const FIX_SLOT_INDEX = 60; // candidate #7, well past 6 * 60 = 360

  async function buildScenario() {
    schoolScheduleService.getWorkingDays.mockResolvedValue([DAY]);
    schoolScheduleService.getShiftPeriods.mockResolvedValue(periods);
    const ctx = await buildContext(SCHOOL_ID);

    const deadEndSlotIndices = [];
    for (let i = 0; i < DEAD_END_COUNT; i += 1) {
      const slotIndex = i * 10; // 0, 10, 20, 30, 40, 50 — spread out, all < FIX_SLOT_INDEX
      deadEndSlotIndices.push(slotIndex);
      const classId = `class-dead-end-${i}`;
      occupySlot(
        ctx,
        record({ lessonId: `dead-end-${i}`, teacherId: TA, classId, periodId: `p${slotIndex}`, relocatable: true, assignment: { id: `tsa-dead-end-${i}`, classId, teacherId: TA } }),
        DAY,
        `p${slotIndex}`
      );
      for (let j = 0; j < PERIOD_COUNT; j += 1) {
        if (j === slotIndex) continue;
        occupySlot(ctx, record({ lessonId: `dead-end-${i}-locked-${j}`, teacherId: 'teacher-filler', classId, periodId: `p${j}`, relocatable: false, assignment: null }), DAY, `p${j}`);
      }
    }

    const fixClassId = 'class-fix';
    occupySlot(
      ctx,
      record({ lessonId: 'fix-blocker', teacherId: TA, classId: fixClassId, periodId: `p${FIX_SLOT_INDEX}`, relocatable: true, assignment: { id: 'tsa-fix', classId: fixClassId, teacherId: TA } }),
      DAY,
      `p${FIX_SLOT_INDEX}`
    );
    // The fix-blocker's OWN relocation search scans its domain from index 0
    // regardless of where its own slot sits, so the escape must be reachable
    // within its own MAX_REPAIR_ATTEMPTS_PER_CANDIDATE (60) budget counted
    // from p0 — not merely "close to its own slot". ESCAPE_INDEX sits well
    // under 60 candidates in. Locked (via the SAME class, so every dead-end
    // slot is ALSO class-conflict here — multi-blocker, no wasteful
    // recursion into a dead-end's own hopeless search) everywhere else
    // before it.
    const ESCAPE_INDEX = 55;
    for (let j = 0; j < FIX_SLOT_INDEX; j += 1) {
      if (j === ESCAPE_INDEX) continue;
      occupySlot(ctx, record({ lessonId: `fix-locked-${j}`, teacherId: 'teacher-filler', classId: fixClassId, periodId: `p${j}`, relocatable: false, assignment: null }), DAY, `p${j}`);
    }

    // Target: free only at the 6 dead-end slots + the fix slot — locked everywhere else.
    const targetFreeIndices = new Set([...deadEndSlotIndices, FIX_SLOT_INDEX]);
    for (let j = 0; j < PERIOD_COUNT; j += 1) {
      if (targetFreeIndices.has(j)) continue;
      occupySlot(ctx, record({ lessonId: `target-locked-${j}`, teacherId: 'teacher-filler', classId: C_TARGET, periodId: `p${j}`, relocatable: false, assignment: null }), DAY, `p${j}`);
    }

    const unit = { assignment: { id: 'tsa-target', classId: C_TARGET, teacherId: TA }, isDouble: false };
    return { ctx, unit };
  }

  it('a fix past 6 dead-end candidates (360 total attempts) is unreachable at a 300 total budget', async () => {
    const { ctx, unit } = await buildScenario();
    // Manual reproduction with an explicit total=300, independent of
    // whatever the exported constant currently is — isolates "what does a
    // 300 total do" from "what is the constant set to right now" (the next
    // test covers that).
    const domain = await getFullDomainSlots(SCHOOL_ID, unit, ctx, [DAY]);
    const totalBudget300 = { attempts: 300, maxDepth: MAX_REPAIR_DEPTH };
    let found = null;
    for (const slot of domain) {
      if (totalBudget300.attempts <= 0) break;
      const key = slotKey(unit.assignment.teacherId, slot.day, slot.period.id);
      if (!ctx.teacherBusy.has(key)) continue; // only single (teacher-conflict) candidates exist in this scenario
      totalBudget300.attempts -= 1;
      const blocker = ctx.teacherOccupant.get(key);
      const cleared = await relocateLesson(SCHOOL_ID, blocker, ctx, [DAY], totalBudget300, 1);
      if (cleared) { found = slot; break; }
    }
    expect(found).toBeNull();
  });

  it('the SAME scenario also fails via the real (current, 300) attemptRepair — confirms the constant is genuinely back to 300, not silently still 1000', async () => {
    const { ctx, unit } = await buildScenario();
    const slot = await attemptRepair(SCHOOL_ID, unit, ctx, [DAY]);
    expect(slot).toBeNull();
  });

  it('the global cap still applies at 300 — an all-dead-end scenario past it still returns null, not an unbounded search', async () => {
    // All candidates dead ends (no fix slot at all) — 20 dead-end candidates
    // (20 * 60 = 1200 > 300) confirms attemptRepair still stops instead of
    // exhaustively trying every one.
    const COUNT = 20;
    schoolScheduleService.getWorkingDays.mockResolvedValue([DAY]);
    schoolScheduleService.getShiftPeriods.mockResolvedValue(periods);
    const ctx = await buildContext(SCHOOL_ID);
    const indices = [];
    for (let i = 0; i < COUNT; i += 1) indices.push(i * 3); // 0,3,...,57 — all within PERIOD_COUNT

    for (const idx of indices) {
      const classId = `class-dead-end-many-${idx}`;
      occupySlot(ctx, record({ lessonId: `many-${idx}`, teacherId: TA, classId, periodId: `p${idx}`, relocatable: true, assignment: { id: `tsa-many-${idx}`, classId, teacherId: TA } }), DAY, `p${idx}`);
      for (let j = 0; j < PERIOD_COUNT; j += 1) {
        if (j === idx) continue;
        occupySlot(ctx, record({ lessonId: `many-${idx}-locked-${j}`, teacherId: 'teacher-filler', classId, periodId: `p${j}`, relocatable: false, assignment: null }), DAY, `p${j}`);
      }
    }
    const indexSet = new Set(indices);
    for (let j = 0; j < PERIOD_COUNT; j += 1) {
      if (indexSet.has(j)) continue;
      occupySlot(ctx, record({ lessonId: `target-many-locked-${j}`, teacherId: 'teacher-filler', classId: C_TARGET, periodId: `p${j}`, relocatable: false, assignment: null }), DAY, `p${j}`);
    }
    const unit = { assignment: { id: 'tsa-target-many', classId: C_TARGET, teacherId: TA }, isDouble: false };

    const slot = await attemptRepair(SCHOOL_ID, unit, ctx, [DAY]);
    expect(slot).toBeNull();
  });
});

// --- Test 2: MAX_REPAIR_DEPTH is still respected -----------------------------
describe('MAX_REPAIR_DEPTH is unchanged (still 3)', () => {
  const TA = 'teacher-TA';
  const C_TARGET = 'class-target';

  // A straight displacement chain: record0 (at the target's only candidate
  // slot) can only move to slot1, which is occupied by record1, which can
  // only move to slot2 (record2), which can only move to slot3 (record3),
  // which can only move to slot4 — free. That is a 4-deep chain (depths
  // 1,2,3,4) — one level beyond MAX_REPAIR_DEPTH.
  async function buildChain(length) {
    const periods = makePeriods(length + 2);
    schoolScheduleService.getWorkingDays.mockResolvedValue([DAY]);
    schoolScheduleService.getShiftPeriods.mockResolvedValue(periods);
    const ctx = await buildContext(SCHOOL_ID);

    const classes = [C_TARGET];
    for (let i = 0; i < length; i += 1) classes.push(`class-chain-${i}`);

    // classes[i+1] (classes[0] is the target itself) has its only free slot
    // at p(i); it's placed at p(i) except the final link, which is left
    // free (the actual escape).
    for (let i = 0; i < length; i += 1) {
      occupySlot(
        ctx,
        record({
          lessonId: `lesson-${i}`,
          teacherId: TA,
          classId: classes[i + 1],
          periodId: `p${i}`,
          relocatable: true,
          assignment: { id: `tsa-${i}`, classId: classes[i + 1], teacherId: TA },
        }),
        DAY,
        `p${i}`
      );
      // Every other slot is locked for this class except p(i) (current) and
      // p(i+1) (where it would need to move to continue the chain).
      for (let j = 0; j < length + 2; j += 1) {
        if (j === i || j === i + 1) continue;
        occupySlot(
          ctx,
          record({ lessonId: `lesson-${i}-locked-${j}`, teacherId: 'teacher-filler', classId: classes[i + 1], periodId: `p${j}`, relocatable: false, assignment: null }),
          DAY,
          `p${j}`
        );
      }
    }
    // Target: free only at p0 (already TA-busy via lesson-0) — locked
    // everywhere else.
    for (let j = 1; j < length + 2; j += 1) {
      occupySlot(
        ctx,
        record({ lessonId: `lesson-target-locked-${j}`, teacherId: 'teacher-filler', classId: C_TARGET, periodId: `p${j}`, relocatable: false, assignment: null }),
        DAY,
        `p${j}`
      );
    }

    const unit = { assignment: { id: 'tsa-target', classId: C_TARGET, teacherId: TA }, isDouble: false };
    return { ctx, unit };
  }

  it('a chain solvable within depth 3 succeeds', async () => {
    const { ctx, unit } = await buildChain(3); // depths 1,2,3 — exactly at the limit
    const slot = await attemptRepair(SCHOOL_ID, unit, ctx, [DAY]);
    expect(slot).not.toBeNull();
    expect(slot.period.id).toBe('p0');
  });

  it('a chain that needs depth 4 still fails — MAX_REPAIR_DEPTH was not raised by this fix', async () => {
    const { ctx, unit } = await buildChain(4); // needs depths 1,2,3,4 — one past the limit
    const slot = await attemptRepair(SCHOOL_ID, unit, ctx, [DAY]);
    expect(slot).toBeNull();
  });
});

// --- Test 3: Locked Lessons are never moved ----------------------------------
describe('Locked Lessons are never relocated', () => {
  it('a locked blocker occupying the only other candidate is left untouched, and repair fails rather than moving it', async () => {
    const TA = 'teacher-TA';
    const C_TARGET = 'class-target';
    const C_LOCKED_OWNER = 'class-locked-owner';
    const periods = makePeriods(3);
    schoolScheduleService.getWorkingDays.mockResolvedValue([DAY]);
    schoolScheduleService.getShiftPeriods.mockResolvedValue(periods);
    const ctx = await buildContext(SCHOOL_ID);

    // Target free only at p0; p0 is blocked by a LOCKED lesson (relocatable:
    // false) — a real Locked Lesson survivor, exactly as
    // generateTimetable's own survivor pre-load sets up.
    const lockedBlocker = record({ lessonId: 'locked-lesson', teacherId: TA, classId: 'class-locked-blocker', periodId: 'p0', relocatable: false, assignment: { id: 'tsa-locked', classId: 'class-locked-blocker', teacherId: TA } });
    occupySlot(ctx, lockedBlocker, DAY, 'p0');
    // p1, p2 also busy for the target class, so there is no other candidate.
    occupySlot(ctx, record({ lessonId: 'target-busy-1', teacherId: 'teacher-other', classId: C_TARGET, periodId: 'p1', relocatable: false, assignment: null }), DAY, 'p1');
    occupySlot(ctx, record({ lessonId: 'target-busy-2', teacherId: 'teacher-other', classId: C_TARGET, periodId: 'p2', relocatable: false, assignment: null }), DAY, 'p2');

    const unit = { assignment: { id: 'tsa-target', classId: C_TARGET, teacherId: TA }, isDouble: false };
    const slot = await attemptRepair(SCHOOL_ID, unit, ctx, [DAY]);

    expect(slot).toBeNull();
    expect(lockedBlocker.dayOfWeek).toBe(DAY);
    expect(lockedBlocker.periodId).toBe('p0'); // never moved
    expect(repository.updateLesson).not.toHaveBeenCalled();
  });
});

// --- Test 4: repair never creates a Teacher/Class conflict -------------------
describe('a successful repair never creates a Teacher or Class conflict', () => {
  it('after relocating a blocker, its new slot has exactly one occupant and its old slot is vacated', async () => {
    const TA = 'teacher-TA';
    const C_TARGET = 'class-target';
    const C_BLOCKER = 'class-blocker';
    const periods = makePeriods(3);
    schoolScheduleService.getWorkingDays.mockResolvedValue([DAY]);
    schoolScheduleService.getShiftPeriods.mockResolvedValue(periods);
    const ctx = await buildContext(SCHOOL_ID);

    const blocker = record({ lessonId: 'lesson-blocker', teacherId: TA, classId: C_BLOCKER, periodId: 'p0', relocatable: true, assignment: { id: 'tsa-blocker', classId: C_BLOCKER, teacherId: TA } });
    occupySlot(ctx, blocker, DAY, 'p0');
    // p1 is free for the blocker to escape to; target is free at p0 and p1
    // is left alone (irrelevant to target).
    const unit = { assignment: { id: 'tsa-target', classId: C_TARGET, teacherId: TA }, isDouble: false };

    const slot = await attemptRepair(SCHOOL_ID, unit, ctx, [DAY]);

    expect(slot).not.toBeNull();
    expect(slot.period.id).toBe('p0');
    expect(blocker.periodId).toBe('p1');

    // Old slot (TA, p0) has no occupant left for the blocker's teacher/class pairing.
    expect(ctx.teacherBusy.has(slotKey(TA, DAY, 'p1'))).toBe(true);
    expect(ctx.classBusy.has(slotKey(C_BLOCKER, DAY, 'p1'))).toBe(true);
    expect(ctx.teacherOccupant.get(slotKey(TA, DAY, 'p1'))).toBe(blocker);
    expect(ctx.classOccupant.get(slotKey(C_BLOCKER, DAY, 'p1'))).toBe(blocker);
    // p0 (TA) is now free — vacated, not double-booked with anything.
    expect(ctx.teacherBusy.has(slotKey(TA, DAY, 'p0'))).toBe(false);
  });
});

// --- Test 5: a genuine dead end still remains missing -------------------------
describe('a genuine dead end is still correctly reported as unrepairable', () => {
  it('when every candidate is a dead end, attemptRepair returns null (not a false positive)', async () => {
    const TA = 'teacher-TA';
    const TB = 'teacher-filler';
    const C_TARGET = 'class-target';
    const C2 = 'class-blocker-1';
    const C3 = 'class-blocker-2';
    const PERIOD_COUNT = 10;
    const periods = makePeriods(PERIOD_COUNT);
    schoolScheduleService.getWorkingDays.mockResolvedValue([DAY]);
    schoolScheduleService.getShiftPeriods.mockResolvedValue(periods);
    const ctx = await buildContext(SCHOOL_ID);

    // Two candidate slots for target (p0 via C2, p5 via C3), NEITHER of
    // which has any escape anywhere — both classes are locked-busy at every
    // other slot, with no exceptions.
    occupySlot(ctx, record({ lessonId: 'c2-p0', teacherId: TA, classId: C2, periodId: 'p0', relocatable: true, assignment: { id: 'tsa-c2', classId: C2, teacherId: TA } }), DAY, 'p0');
    occupySlot(ctx, record({ lessonId: 'c3-p5', teacherId: TA, classId: C3, periodId: 'p5', relocatable: true, assignment: { id: 'tsa-c3', classId: C3, teacherId: TA } }), DAY, 'p5');
    for (let i = 0; i < PERIOD_COUNT; i += 1) {
      if (i !== 0) occupySlot(ctx, record({ lessonId: `c2-locked-${i}`, teacherId: TB, classId: C2, periodId: `p${i}`, relocatable: false, assignment: null }), DAY, `p${i}`);
      if (i !== 5) occupySlot(ctx, record({ lessonId: `c3-locked-${i}`, teacherId: TB, classId: C3, periodId: `p${i}`, relocatable: false, assignment: null }), DAY, `p${i}`);
      if (i !== 0 && i !== 5) {
        occupySlot(ctx, record({ lessonId: `target-locked-${i}`, teacherId: TB, classId: C_TARGET, periodId: `p${i}`, relocatable: false, assignment: null }), DAY, `p${i}`);
      }
    }

    const unit = { assignment: { id: 'tsa-target', classId: C_TARGET, teacherId: TA }, isDouble: false };
    const slot = await attemptRepair(SCHOOL_ID, unit, ctx, [DAY]);

    expect(slot).toBeNull();
    expect(repository.updateLesson).not.toHaveBeenCalled();
  });
});
