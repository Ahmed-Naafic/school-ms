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
  measureBlockerTelemetry,
  rankRepairCandidates,
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

  it('the SAME scenario now SUCCEEDS via the real attemptRepair — Stage 1 telemetry ordering tries the fix candidate (1 free alternative) before the 6 dead ends (0 free alternatives each)', async () => {
    const { ctx, unit } = await buildScenario();
    const slot = await attemptRepair(SCHOOL_ID, unit, ctx, [DAY]);
    expect(slot).not.toBeNull();
    expect(slot.period.id).toBe(`p${FIX_SLOT_INDEX}`);
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
    // p1 is free for the BLOCKER to escape to (TA has nothing there). p2 is
    // locked for the TARGET class specifically, so p0 (via repair) is the
    // target's only viable path — p1 must stay reachable for the blocker's
    // own relocation search without also being a direct candidate for the
    // target itself (Stage 1's own "check already-free before repairing"
    // ordering would otherwise pick a trivially-free target slot over ever
    // exercising the relocation this test is actually about).
    occupySlot(ctx, record({ lessonId: 'target-locked-p1', teacherId: 'teacher-other', classId: C_TARGET, periodId: 'p1', relocatable: false, assignment: null }), DAY, 'p1');
    occupySlot(ctx, record({ lessonId: 'target-locked-p2', teacherId: 'teacher-other', classId: C_TARGET, periodId: 'p2', relocatable: false, assignment: null }), DAY, 'p2');
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

// --- Stage 1: telemetry-based candidate ordering -----------------------------
// rankRepairCandidates/measureBlockerTelemetry themselves — attemptRepair's
// own use of them is already exercised throughout the describe blocks above
// (the repurposed "SAME scenario now SUCCEEDS" test and the tightened
// relocation-mechanics test). These five specifically cover the ranking
// signals in isolation, the exact real-world shapes (F3A Biology #1 and #2)
// the read-only experiment measured, and the safety properties (Locked
// protection, no Hard Constraint bypass) that must hold no matter what order
// candidates are tried in.
describe('Stage 1 — telemetry-based candidate ordering', () => {
  const TA = 'teacher-TA';

  // Three single-blocker candidates for one target unit, laid out so exactly
  // ONE (Y) has a real free alternative to escape to — the F3A Biology #1
  // shape (one uniquely-promising candidate among several structurally
  // weaker ones). The free slot (p0) is placed at the LOWEST period index in
  // every blocker's own domain and is reachable by Y in a single, direct
  // domain-scan step — Y's own relocateLesson search finds it as the very
  // first candidate it inspects and returns immediately, before ever
  // consulting getBlockersForSlot for anyone else. This is deliberate: it
  // keeps the scenario free of a real, pre-existing aliasing hazard in
  // relocateLesson (X and Z each sit at a slot that is itself one of the
  // OTHER's domain candidates, which — if the domain scan reached that far —
  // can recurse back into a Lesson whose own relocation search is already
  // in progress; relocateLesson is explicitly out of scope for Stage 1 and
  // is not being touched, so these tests are built to never exercise that
  // path rather than to probe it).
  async function buildXYZScenario() {
    const periods = makePeriods(5); // p0..p4
    schoolScheduleService.getWorkingDays.mockResolvedValue([DAY]);
    schoolScheduleService.getShiftPeriods.mockResolvedValue(periods);
    const ctx = await buildContext(SCHOOL_ID);

    // p0: TA and class-Y are BOTH left free here — Y's one real escape.
    // Every other blocker's own class is locked-busy here so nobody else
    // can use it, and the target class is locked-busy here too so
    // attemptRepair's own already-free check never short-circuits straight
    // to it.
    occupySlot(ctx, record({ lessonId: 'x-locked-p0', teacherId: 'teacher-filler', classId: 'class-X', periodId: 'p0', relocatable: false, assignment: null }), DAY, 'p0');
    occupySlot(ctx, record({ lessonId: 'z-locked-p0', teacherId: 'teacher-filler', classId: 'class-Z', periodId: 'p0', relocatable: false, assignment: null }), DAY, 'p0');
    occupySlot(ctx, record({ lessonId: 'target-locked-p0', teacherId: 'teacher-filler-target', classId: 'class-target-xyz', periodId: 'p0', relocatable: false, assignment: null }), DAY, 'p0');

    const xRecord = record({ lessonId: 'lesson-X', teacherId: TA, classId: 'class-X', periodId: 'p1', relocatable: true, assignment: { id: 'tsa-X', classId: 'class-X', teacherId: TA } });
    occupySlot(ctx, xRecord, DAY, 'p1');

    const yRecord = record({ lessonId: 'lesson-Y', teacherId: TA, classId: 'class-Y', periodId: 'p2', relocatable: true, assignment: { id: 'tsa-Y', classId: 'class-Y', teacherId: TA } });
    occupySlot(ctx, yRecord, DAY, 'p2');

    const zRecord = record({ lessonId: 'lesson-Z', teacherId: TA, classId: 'class-Z', periodId: 'p3', relocatable: true, assignment: { id: 'tsa-Z', classId: 'class-Z', teacherId: TA } });
    occupySlot(ctx, zRecord, DAY, 'p3');

    // p4: locks out X, Y and Z's own class here too, and the target class —
    // so none of the four candidates has any escape besides Y's p0, and the
    // target has no stray fifth direct-free slot.
    occupySlot(ctx, record({ lessonId: 'x-locked-p4', teacherId: 'teacher-filler', classId: 'class-X', periodId: 'p4', relocatable: false, assignment: null }), DAY, 'p4');
    occupySlot(ctx, record({ lessonId: 'y-locked-p4', teacherId: 'teacher-filler', classId: 'class-Y', periodId: 'p4', relocatable: false, assignment: null }), DAY, 'p4');
    occupySlot(ctx, record({ lessonId: 'z-locked-p4', teacherId: 'teacher-filler', classId: 'class-Z', periodId: 'p4', relocatable: false, assignment: null }), DAY, 'p4');
    occupySlot(ctx, record({ lessonId: 'target-locked-p4', teacherId: 'teacher-filler-target', classId: 'class-target-xyz', periodId: 'p4', relocatable: false, assignment: null }), DAY, 'p4');

    const unit = { assignment: { id: 'tsa-target-xyz', classId: 'class-target-xyz', teacherId: TA }, isDouble: false };
    return { ctx, unit, xRecord, yRecord, zRecord };
  }

  it('F3A Biology #1-style: prioritizes the one candidate with a free alternative over structurally weaker candidates, regardless of scan position', async () => {
    const { ctx, unit, xRecord, yRecord, zRecord } = await buildXYZScenario();
    const candidates = [
      { slot: { day: DAY, period: xRecord.periodObj }, blocker: xRecord, scopeDays: [DAY], originalIndex: 0 },
      { slot: { day: DAY, period: yRecord.periodObj }, blocker: yRecord, scopeDays: [DAY], originalIndex: 1 },
      { slot: { day: DAY, period: zRecord.periodObj }, blocker: zRecord, scopeDays: [DAY], originalIndex: 2 },
    ];

    const ranked = await rankRepairCandidates(SCHOOL_ID, unit, candidates, ctx, null);

    expect(ranked[0].blocker.lessonId).toBe('lesson-Y'); // the middle candidate in scan order — genuinely reordered, not just "first wins"
    expect(ranked[0].telemetry.freeCount).toBe(1);
    expect(ranked[1].telemetry.freeCount).toBe(0);
    expect(ranked[2].telemetry.freeCount).toBe(0);
  });

  // F3A Biology #2-style: no candidate has a free alternative (freeCount and
  // domainSize tie for both), so the third signal — how many of a blocker's
  // own candidates are only a single relocation away from resolvable — must
  // be what breaks the tie, prioritizing the more structurally promising
  // blocker (P) over the one deeper in genuinely-contested territory (Q).
  it('F3A Biology #2-style: when no candidate has a free alternative, bounded structural feasibility (single-blocker count) breaks the tie', async () => {
    const periods = makePeriods(7); // p0..p6
    schoolScheduleService.getWorkingDays.mockResolvedValue([DAY]);
    schoolScheduleService.getShiftPeriods.mockResolvedValue(periods);
    const ctx = await buildContext(SCHOOL_ID);

    const pRecord = record({ lessonId: 'lesson-P', teacherId: TA, classId: 'class-P', periodId: 'p0', relocatable: true, assignment: { id: 'tsa-P', classId: 'class-P', teacherId: TA } });
    occupySlot(ctx, pRecord, DAY, 'p0');
    const qRecord = record({ lessonId: 'lesson-Q', teacherId: TA, classId: 'class-Q', periodId: 'p6', relocatable: true, assignment: { id: 'tsa-Q', classId: 'class-Q', teacherId: TA } });
    occupySlot(ctx, qRecord, DAY, 'p6');

    // TA teaches three other classes at p1/p2/p3 — makes TA busy (shared,
    // global) at those three slots for BOTH P and Q's own domain checks.
    ['p1', 'p2', 'p3'].forEach((periodId, i) => {
      occupySlot(ctx, record({ lessonId: `ta-elsewhere-${i}`, teacherId: TA, classId: `class-ta-elsewhere-${i}`, periodId, relocatable: false, assignment: null }), DAY, periodId);
    });
    // class-P is locked-busy only at p4/p5/p6 — free at p1/p2/p3, so those
    // three TA-busy slots are single-blocker (TA only) for P.
    ['p4', 'p5', 'p6'].forEach((periodId) => {
      occupySlot(ctx, record({ lessonId: `p-locked-${periodId}`, teacherId: 'teacher-filler-p', classId: 'class-P', periodId, relocatable: false, assignment: null }), DAY, periodId);
    });
    // class-Q is locked-busy at EVERY slot in its own domain — at p1/p2/p3
    // that makes it two-blocker (TA + class), not single; at p4/p5 (where TA
    // is free) it's single (class only); at p0 (P's own slot) it's
    // two-blocker (TA=P + class).
    ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'].forEach((periodId) => {
      occupySlot(ctx, record({ lessonId: `q-locked-${periodId}`, teacherId: 'teacher-filler-q', classId: 'class-Q', periodId, relocatable: false, assignment: null }), DAY, periodId);
    });

    const unit = { assignment: { id: 'tsa-target-pq', classId: 'class-target-pq', teacherId: TA }, isDouble: false };
    const candidates = [
      { slot: { day: DAY, period: pRecord.periodObj }, blocker: pRecord, scopeDays: [DAY], originalIndex: 0 },
      { slot: { day: DAY, period: qRecord.periodObj }, blocker: qRecord, scopeDays: [DAY], originalIndex: 1 },
    ];

    const ranked = await rankRepairCandidates(SCHOOL_ID, unit, candidates, ctx, null);

    expect(ranked[0].blocker.lessonId).toBe('lesson-P');
    expect(ranked[0].telemetry).toEqual({ freeCount: 0, singleBlockerCount: 5, domainSize: 6 });
    expect(ranked[1].blocker.lessonId).toBe('lesson-Q');
    expect(ranked[1].telemetry).toEqual({ freeCount: 0, singleBlockerCount: 2, domainSize: 6 });
  });

  it('preserves original scan order when telemetry and Soft Preference score tie exactly (stable sort)', async () => {
    const periods = makePeriods(2);
    schoolScheduleService.getWorkingDays.mockResolvedValue([DAY]);
    schoolScheduleService.getShiftPeriods.mockResolvedValue(periods);
    const ctx = await buildContext(SCHOOL_ID);

    // Two Locked blockers — both short-circuit to identical worst-possible
    // telemetry (0,0,0) without any domain computation, and both score 0
    // (no Teacher/Subject preference, no optimization settings), so nothing
    // distinguishes them except their original scan order.
    const lockedA = record({ lessonId: 'locked-A', teacherId: TA, classId: 'class-locked-A', periodId: 'p0', relocatable: false, assignment: null });
    const lockedB = record({ lessonId: 'locked-B', teacherId: TA, classId: 'class-locked-B', periodId: 'p1', relocatable: false, assignment: null });
    occupySlot(ctx, lockedA, DAY, 'p0');
    occupySlot(ctx, lockedB, DAY, 'p1');

    const unit = { assignment: { id: 'tsa-tie', classId: 'class-target-tie', teacherId: TA }, isDouble: false };
    const candidates = [
      { slot: { day: DAY, period: lockedA.periodObj }, blocker: lockedA, scopeDays: [DAY], originalIndex: 0 },
      { slot: { day: DAY, period: lockedB.periodObj }, blocker: lockedB, scopeDays: [DAY], originalIndex: 1 },
    ];

    const ranked = await rankRepairCandidates(SCHOOL_ID, unit, candidates, ctx, null);

    expect(ranked[0].blocker.lessonId).toBe('locked-A');
    expect(ranked[1].blocker.lessonId).toBe('locked-B');
    expect(ranked[0].telemetry).toEqual({ freeCount: 0, singleBlockerCount: 0, domainSize: 0 });
    expect(ranked[1].telemetry).toEqual(ranked[0].telemetry);
  });

  it('never ranks a Locked blocker above a relocatable one with a real escape, and never moves or persists it, even though its own slot is scanned first', async () => {
    const C_TARGET = 'class-target-locked-protect';
    const C_LOCKED = 'class-locked-owner-2';
    const C_RELOC = 'class-relocatable-owner';
    const C_DUMMY = 'class-dummy';
    const periods = makePeriods(4);
    schoolScheduleService.getWorkingDays.mockResolvedValue([DAY]);
    schoolScheduleService.getShiftPeriods.mockResolvedValue(periods);
    const ctx = await buildContext(SCHOOL_ID);

    // p0: a real Locked Lesson (relocatable: false) — scanned FIRST, and
    // structurally indistinguishable from a promising candidate unless the
    // ranking correctly short-circuits it to worst-possible telemetry.
    const lockedBlocker = record({ lessonId: 'locked-blocker', teacherId: TA, classId: C_LOCKED, periodId: 'p0', relocatable: false, assignment: { id: 'tsa-locked', classId: C_LOCKED, teacherId: TA } });
    occupySlot(ctx, lockedBlocker, DAY, 'p0');

    // p1: a relocatable blocker with a real escape at p3.
    const relocBlocker = record({ lessonId: 'reloc-blocker', teacherId: TA, classId: C_RELOC, periodId: 'p1', relocatable: true, assignment: { id: 'tsa-reloc', classId: C_RELOC, teacherId: TA } });
    occupySlot(ctx, relocBlocker, DAY, 'p1');

    // p2: excluded from target's own single-blocker candidates entirely
    // (two independent blockers here — TA via a dummy class, and the target
    // class itself locked by someone else — out of this bounded pass's
    // scope either way).
    occupySlot(ctx, record({ lessonId: 'dummy-p2', teacherId: TA, classId: C_DUMMY, periodId: 'p2', relocatable: false, assignment: null }), DAY, 'p2');
    occupySlot(ctx, record({ lessonId: 'target-locked-p2', teacherId: 'teacher-filler', classId: C_TARGET, periodId: 'p2', relocatable: false, assignment: null }), DAY, 'p2');

    // p3: a third, also-Locked single-blocker candidate for the target — AND
    // the relocatable blocker's real (TA-free, class-free) escape route.
    occupySlot(ctx, record({ lessonId: 'target-locked-p3', teacherId: 'teacher-filler', classId: C_TARGET, periodId: 'p3', relocatable: false, assignment: null }), DAY, 'p3');

    const unit = { assignment: { id: 'tsa-target', classId: C_TARGET, teacherId: TA }, isDouble: false };
    const slot = await attemptRepair(SCHOOL_ID, unit, ctx, [DAY]);

    expect(slot).not.toBeNull();
    expect(slot.period.id).toBe('p1'); // the relocatable blocker's original candidate slot, now vacated
    expect(relocBlocker.periodId).toBe('p3'); // relocated to its real escape

    // The Locked blocker: never touched, no matter how the ranking sorted it.
    expect(lockedBlocker.periodId).toBe('p0');
    expect(lockedBlocker.dayOfWeek).toBe(DAY);
    expect(repository.updateLesson).not.toHaveBeenCalledWith('locked-blocker', expect.anything());
    expect(repository.updateLesson).toHaveBeenCalledWith('reloc-blocker', { dayOfWeek: DAY, periodId: 'p3' });
  });

  it('a repair resolved via a reordered (non-first-scanned) candidate still leaves the search state fully Hard-Constraint-clean, and inspecting the non-winning candidates never mutates or persists anything', async () => {
    const { ctx, unit, xRecord, yRecord, zRecord } = await buildXYZScenario();

    const slot = await attemptRepair(SCHOOL_ID, unit, ctx, [DAY]);

    expect(slot).not.toBeNull();
    expect(slot.period.id).toBe('p2'); // Y's original candidate slot, now vacated
    // Only Y moved — X and Z were inspected during telemetry ranking (their
    // own domains were scanned) but never touched.
    expect(yRecord.periodId).toBe('p0');
    expect(xRecord.periodId).toBe('p1');
    expect(zRecord.periodId).toBe('p3');
    expect(repository.updateLesson).toHaveBeenCalledTimes(1);
    expect(repository.updateLesson).toHaveBeenCalledWith('lesson-Y', { dayOfWeek: DAY, periodId: 'p0' });

    // Y's new slot: exactly one consistent occupant for both Teacher and Class.
    expect(ctx.teacherOccupant.get(slotKey(TA, DAY, 'p0'))).toBe(yRecord);
    expect(ctx.classOccupant.get(slotKey('class-Y', DAY, 'p0'))).toBe(yRecord);
    // Y's old slot fully vacated — no stale busy/occupant entries left behind.
    expect(ctx.teacherBusy.has(slotKey(TA, DAY, 'p2'))).toBe(false);
    expect(ctx.classBusy.has(slotKey('class-Y', DAY, 'p2'))).toBe(false);
    expect(ctx.classOccupant.has(slotKey('class-Y', DAY, 'p2'))).toBe(false);
    // X and Z remain correctly registered at their original, untouched slots.
    expect(ctx.teacherOccupant.get(slotKey(TA, DAY, 'p1'))).toBe(xRecord);
    expect(ctx.teacherOccupant.get(slotKey(TA, DAY, 'p3'))).toBe(zRecord);
  });
});

// --- Repair-chain safety fix: in-flight cycle guard + destination revalidation
// A real Test School regeneration run under Stage 1 crashed on a Class-slot
// unique-constraint violation (a genuine attempted double-booking, caught by
// the DB before it could persist). Root cause: relocateLesson had no guard
// against recursing back into a Lesson whose own relocation was already in
// progress higher up the same chain (A's only candidate blocked by B, B's
// only candidate blocked by A) — MAX_REPAIR_DEPTH=3 does not prevent this,
// since a 2-node cycle fits well inside it. These tests cover the two
// independent defenses added: (1) `budget.inFlight`, a per-chain cycle
// guard; (2) a live re-check of destination freeness immediately before
// every actual move/placement, never trusting a value computed earlier in
// the recursion.
describe('Repair-chain safety fix — in-flight cycle guard and destination revalidation', () => {
  const TA = 'teacher-TA';

  // A <-> B: A's only domain candidate is blocked by B; B's only domain
  // candidate is blocked by A. No escape exists for either — the textbook
  // "A -> B -> A" mutual cycle from the fix's own requirements.
  async function buildPureCycleScenario() {
    const periods = makePeriods(2); // p0, p1
    schoolScheduleService.getWorkingDays.mockResolvedValue([DAY]);
    schoolScheduleService.getShiftPeriods.mockResolvedValue(periods);
    const ctx = await buildContext(SCHOOL_ID);

    const aRecord = record({ lessonId: 'lesson-A-cycle', teacherId: TA, classId: 'class-A-cycle', periodId: 'p0', relocatable: true, assignment: { id: 'tsa-A-cycle', classId: 'class-A-cycle', teacherId: TA } });
    occupySlot(ctx, aRecord, DAY, 'p0');
    const bRecord = record({ lessonId: 'lesson-B-cycle', teacherId: TA, classId: 'class-B-cycle', periodId: 'p1', relocatable: true, assignment: { id: 'tsa-B-cycle', classId: 'class-B-cycle', teacherId: TA } });
    occupySlot(ctx, bRecord, DAY, 'p1');

    return { ctx, aRecord, bRecord };
  }

  // A: A's first candidate (p1, blocked by B) is a pure A<->B cycle with no
  // escape; A's SECOND candidate (p2, blocked by C) resolves via a genuinely
  // separate, non-cyclic chain (C escapes directly to p3). B is a dead end
  // everywhere else (locked), so its own resolution never accidentally
  // succeeds through some other route — the only thing that ends its search
  // is the cycle guard.
  async function buildCyclicPlusEscapeScenario() {
    const periods = makePeriods(4); // p0..p3
    schoolScheduleService.getWorkingDays.mockResolvedValue([DAY]);
    schoolScheduleService.getShiftPeriods.mockResolvedValue(periods);
    const ctx = await buildContext(SCHOOL_ID);

    const aRecord = record({ lessonId: 'lesson-A', teacherId: TA, classId: 'class-A', periodId: 'p0', relocatable: true, assignment: { id: 'tsa-A', classId: 'class-A', teacherId: TA } });
    occupySlot(ctx, aRecord, DAY, 'p0');
    const bRecord = record({ lessonId: 'lesson-B', teacherId: TA, classId: 'class-B', periodId: 'p1', relocatable: true, assignment: { id: 'tsa-B', classId: 'class-B', teacherId: TA } });
    occupySlot(ctx, bRecord, DAY, 'p1');
    const cRecord = record({ lessonId: 'lesson-C', teacherId: TA, classId: 'class-C', periodId: 'p2', relocatable: true, assignment: { id: 'tsa-C', classId: 'class-C', teacherId: TA } });
    occupySlot(ctx, cRecord, DAY, 'p2');

    // B is locked out of every slot except its own cyclic one (p0, blocked
    // by A) — a genuine, independent dead end that never touches C.
    occupySlot(ctx, record({ lessonId: 'b-locked-p2', teacherId: 'teacher-filler', classId: 'class-B', periodId: 'p2', relocatable: false, assignment: null }), DAY, 'p2');
    occupySlot(ctx, record({ lessonId: 'b-locked-p3', teacherId: 'teacher-filler', classId: 'class-B', periodId: 'p3', relocatable: false, assignment: null }), DAY, 'p3');
    // p3 is left genuinely open (TA free, class-C free) — C's real escape.

    return { ctx, aRecord, bRecord, cRecord };
  }

  it('A: an A -> B -> A mutual relocation cycle with no escape terminates safely as a failed branch (no crash, no write)', async () => {
    const { ctx, aRecord, bRecord } = await buildPureCycleScenario();
    const budget = { attempts: MAX_REPAIR_ATTEMPTS_PER_CANDIDATE, maxDepth: MAX_REPAIR_DEPTH };

    const cleared = await relocateLesson(SCHOOL_ID, aRecord, ctx, [DAY], budget, 1);

    expect(cleared).toBe(false);
    expect(aRecord.periodId).toBe('p0'); // never moved
    expect(bRecord.periodId).toBe('p1'); // never moved
    expect(repository.updateLesson).not.toHaveBeenCalled();
    // Terminated cheaply — the cyclic re-entry cost nothing beyond the two
    // domain-scan attempts that discovered it, not a budget blowout.
    expect(budget.attempts).toBeGreaterThan(MAX_REPAIR_ATTEMPTS_PER_CANDIDATE - 5);
  });

  it('B: the abandoned cyclic branch is never written — the search safely continues past it to a genuinely different, valid candidate', async () => {
    const { ctx, aRecord, bRecord, cRecord } = await buildCyclicPlusEscapeScenario();
    const budget = { attempts: MAX_REPAIR_ATTEMPTS_PER_CANDIDATE, maxDepth: MAX_REPAIR_DEPTH };

    const cleared = await relocateLesson(SCHOOL_ID, aRecord, ctx, [DAY], budget, 1);

    expect(cleared).toBe(true);
    expect(aRecord.periodId).toBe('p2'); // resolved via C's chain, not the cyclic B candidate
    expect(cRecord.periodId).toBe('p3');
    expect(bRecord.periodId).toBe('p1'); // the cyclic candidate: inspected, abandoned, never moved
    // Exactly two real moves happened — never a third (stale/duplicate) write for B.
    expect(repository.updateLesson).toHaveBeenCalledTimes(2);
    expect(repository.updateLesson).toHaveBeenCalledWith('lesson-C', { dayOfWeek: DAY, periodId: 'p3' });
    expect(repository.updateLesson).toHaveBeenCalledWith('lesson-A', { dayOfWeek: DAY, periodId: 'p2' });
  });

  it('C: no duplicate/ghost class-slot occupancy is ever produced by a chain that touches a would-be cycle', async () => {
    const { ctx, aRecord, bRecord, cRecord } = await buildCyclicPlusEscapeScenario();
    const budget = { attempts: MAX_REPAIR_ATTEMPTS_PER_CANDIDATE, maxDepth: MAX_REPAIR_DEPTH };
    await relocateLesson(SCHOOL_ID, aRecord, ctx, [DAY], budget, 1);

    // Every moved record's OLD class slot is fully vacated — no leftover
    // "ghost" occupant left registered at a position the record no longer holds.
    expect(ctx.classBusy.has(slotKey('class-A', DAY, 'p0'))).toBe(false);
    expect(ctx.classOccupant.has(slotKey('class-A', DAY, 'p0'))).toBe(false);
    expect(ctx.classBusy.has(slotKey('class-C', DAY, 'p2'))).toBe(false);
    expect(ctx.classOccupant.has(slotKey('class-C', DAY, 'p2'))).toBe(false);

    // Every record's own class is occupied at exactly one place: itself, at
    // its own current (post-move) position — never duplicated, never split.
    expect(ctx.classOccupant.get(slotKey('class-A', DAY, aRecord.periodId))).toBe(aRecord);
    expect(ctx.classOccupant.get(slotKey('class-C', DAY, cRecord.periodId))).toBe(cRecord);
    expect(ctx.classOccupant.get(slotKey('class-B', DAY, bRecord.periodId))).toBe(bRecord);
  });

  it('D: no Teacher conflict is ever produced by a chain that touches a would-be cycle — each Period has exactly the expected single occupant', async () => {
    const { ctx, aRecord, bRecord, cRecord } = await buildCyclicPlusEscapeScenario();
    const budget = { attempts: MAX_REPAIR_ATTEMPTS_PER_CANDIDATE, maxDepth: MAX_REPAIR_DEPTH };
    await relocateLesson(SCHOOL_ID, aRecord, ctx, [DAY], budget, 1);

    // TA's old slot (p0, A's original position) is fully vacated.
    expect(ctx.teacherBusy.has(slotKey(TA, DAY, 'p0'))).toBe(false);
    // TA is busy at exactly p1 (B, untouched), p2 (A, moved here) and p3 (C,
    // moved here) — one consistent occupant each, never two Lessons sharing
    // the same Teacher/Day/Period.
    expect(ctx.teacherOccupant.get(slotKey(TA, DAY, 'p1'))).toBe(bRecord);
    expect(ctx.teacherOccupant.get(slotKey(TA, DAY, 'p2'))).toBe(aRecord);
    expect(ctx.teacherOccupant.get(slotKey(TA, DAY, 'p3'))).toBe(cRecord);
  });

  it('E: a Locked Lesson participating in a would-be cyclic relationship is still never relocated', async () => {
    const periods = makePeriods(2); // p0, p1
    schoolScheduleService.getWorkingDays.mockResolvedValue([DAY]);
    schoolScheduleService.getShiftPeriods.mockResolvedValue(periods);
    const ctx = await buildContext(SCHOOL_ID);

    const aRecord = record({ lessonId: 'lesson-A-locked-cyc', teacherId: TA, classId: 'class-A-locked-cyc', periodId: 'p0', relocatable: true, assignment: { id: 'tsa-A-locked-cyc', classId: 'class-A-locked-cyc', teacherId: TA } });
    occupySlot(ctx, aRecord, DAY, 'p0');
    // A real Locked Lesson survivor (relocatable: false, assignment: null —
    // exactly as generateTimetable's own survivor pre-load sets up) sits at
    // A's only other domain slot.
    const lockedRecord = record({ lessonId: 'locked-lesson-cyc', teacherId: TA, classId: 'class-locked-cyc', periodId: 'p1', relocatable: false, assignment: null });
    occupySlot(ctx, lockedRecord, DAY, 'p1');

    const budget = { attempts: MAX_REPAIR_ATTEMPTS_PER_CANDIDATE, maxDepth: MAX_REPAIR_DEPTH };
    const cleared = await relocateLesson(SCHOOL_ID, aRecord, ctx, [DAY], budget, 1);

    expect(cleared).toBe(false); // A's only candidate is Locked — genuinely unrepairable
    expect(lockedRecord.periodId).toBe('p1');
    expect(lockedRecord.dayOfWeek).toBe(DAY);
    expect(aRecord.periodId).toBe('p0');
    expect(repository.updateLesson).not.toHaveBeenCalled();
  });

  it('F: existing (non-cyclic) multi-hop repair behavior is unchanged by the safety fix — attemptRepair still resolves a real 2-hop chain end to end', async () => {
    const TA_F = 'teacher-TA-f';
    const C_TARGET = 'class-target-f';
    const periods = makePeriods(3); // p0, p1, p2
    schoolScheduleService.getWorkingDays.mockResolvedValue([DAY]);
    schoolScheduleService.getShiftPeriods.mockResolvedValue(periods);
    const ctx = await buildContext(SCHOOL_ID);

    // link0 (p0) blocks the target's only candidate; link0's own escape (p1)
    // is blocked by link1; link1's own escape (p2) is genuinely free. A
    // straight 2-hop chain — link1's own domain naturally includes link0's
    // CURRENT slot as a candidate too (an incidental cycle-guard hit, not a
    // real dead end), proving the fix doesn't over-block the common case.
    const link0 = record({ lessonId: 'link0', teacherId: TA_F, classId: 'class-link0', periodId: 'p0', relocatable: true, assignment: { id: 'tsa-link0', classId: 'class-link0', teacherId: TA_F } });
    occupySlot(ctx, link0, DAY, 'p0');
    const link1 = record({ lessonId: 'link1', teacherId: TA_F, classId: 'class-link1', periodId: 'p1', relocatable: true, assignment: { id: 'tsa-link1', classId: 'class-link1', teacherId: TA_F } });
    occupySlot(ctx, link1, DAY, 'p1');
    occupySlot(ctx, record({ lessonId: 'link0-locked-p2', teacherId: 'teacher-filler', classId: 'class-link0', periodId: 'p2', relocatable: false, assignment: null }), DAY, 'p2');

    // Target free only at p0; locked everywhere else so this is its one candidate.
    occupySlot(ctx, record({ lessonId: 'target-locked-p1', teacherId: 'teacher-filler', classId: C_TARGET, periodId: 'p1', relocatable: false, assignment: null }), DAY, 'p1');
    occupySlot(ctx, record({ lessonId: 'target-locked-p2', teacherId: 'teacher-filler', classId: C_TARGET, periodId: 'p2', relocatable: false, assignment: null }), DAY, 'p2');

    const unit = { assignment: { id: 'tsa-target-f', classId: C_TARGET, teacherId: TA_F }, isDouble: false };
    const slot = await attemptRepair(SCHOOL_ID, unit, ctx, [DAY]);

    expect(slot).not.toBeNull();
    expect(slot.period.id).toBe('p0');
    expect(link0.periodId).toBe('p1');
    expect(link1.periodId).toBe('p2');
  });

  it('G: rankRepairCandidates/measureBlockerTelemetry remain fully read-only even when the candidates\' own blockers form a would-be cycle', async () => {
    const periods = makePeriods(2); // p0, p1
    schoolScheduleService.getWorkingDays.mockResolvedValue([DAY]);
    schoolScheduleService.getShiftPeriods.mockResolvedValue(periods);
    const ctx = await buildContext(SCHOOL_ID);

    const aRecord = record({ lessonId: 'lesson-A-ro', teacherId: TA, classId: 'class-A-ro', periodId: 'p0', relocatable: true, assignment: { id: 'tsa-A-ro', classId: 'class-A-ro', teacherId: TA } });
    occupySlot(ctx, aRecord, DAY, 'p0');
    const bRecord = record({ lessonId: 'lesson-B-ro', teacherId: TA, classId: 'class-B-ro', periodId: 'p1', relocatable: true, assignment: { id: 'tsa-B-ro', classId: 'class-B-ro', teacherId: TA } });
    occupySlot(ctx, bRecord, DAY, 'p1');

    const unit = { assignment: { id: 'tsa-target-ro', classId: 'class-target-ro', teacherId: TA }, isDouble: false };
    const candidates = [
      { slot: { day: DAY, period: aRecord.periodObj }, blocker: aRecord, scopeDays: [DAY], originalIndex: 0 },
      { slot: { day: DAY, period: bRecord.periodObj }, blocker: bRecord, scopeDays: [DAY], originalIndex: 1 },
    ];
    const teacherBusyBefore = new Set(ctx.teacherBusy);
    const classBusyBefore = new Set(ctx.classBusy);

    const ranked = await rankRepairCandidates(SCHOOL_ID, unit, candidates, ctx, null);

    expect(ranked).toHaveLength(2);
    expect(aRecord.periodId).toBe('p0');
    expect(bRecord.periodId).toBe('p1');
    expect(repository.updateLesson).not.toHaveBeenCalled();
    expect(ctx.teacherBusy).toEqual(teacherBusyBefore);
    expect(ctx.classBusy).toEqual(classBusyBefore);
  });
});
