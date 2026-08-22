// The Timetable generation engine (Architecture Update — Generation-First).
// A pragmatic, deterministic-enough heuristic — most-constrained-first
// greedy placement with preference-weighted scoring, plus a bounded
// conflict-aware repair pass (a short chain of single-Lesson relocations,
// never a formal CSP/SAT solver) — per Technical Design's own Architecture
// section. Kept in its own file, separate from timetable.service.js, for
// the same single-responsibility reasoning timetable.pdf.js already
// established.
//
// Constraint-aware scheduling (why this exists): being below a Teacher's
// own weekly capacity (Business Rule check, see assertNoTeacherOverCapacity)
// is a necessary but not sufficient condition for every required Lesson to
// actually be placeable. Capacity is a simple weekly total; placement needs
// the Teacher AND the Class to be simultaneously free at the same Day+
// Period. A Teacher spread across many Classes for the same Subject can be
// comfortably under capacity in aggregate while still colliding with
// themselves across those Classes' own scarce remaining free Periods — a
// scheduling-feasibility problem, not a workload problem. Two things in this
// file exist specifically to reduce avoidable misses of that kind, without
// ever touching the Hard Constraints or the Business Rules above them:
// (1) candidate scoring that avoids consuming a slot other still-pending
// units scarcely need (see scoreFutureFeasibility), and (2) a bounded
// repair pass that, when a unit has zero free slots left, tries relocating
// the single Lesson blocking one of its slots — possibly chained a few
// Lessons deep — before ever giving up on it (see attemptRepair).
const repository = require('./timetable.repository');
const teacherSubjectAssignmentsService = require('../teacher-subject-assignments/teacher-subject-assignments.service');
const schoolScheduleService = require('../school-schedule/school-schedule.service');
const classesService = require('../classes/classes.service');
const weeklySubjectAllocationsService = require('../weekly-subject-allocations/weekly-subject-allocations.service');
const teachersService = require('../teachers/teachers.service');
const subjectsService = require('../subjects/subjects.service');

// Lazily required — timetable.service.js requires this module for its own
// getTimetableQualityScore delegation, so a top-level require here would
// create a cycle. Only this module's own top-level functions need
// service.js's exported helpers, and only once they are actually called.
function getService() {
  return require('./timetable.service');
}

// --- Bounded repair configuration -----------------------------------------
// Kept as simple module-level constants (not a School-configurable setting,
// and not a new column on SchoolOptimizationSettings) — no Product Owner
// requirement asked for these to be tunable per-school, and adding a schema
// field for them would be a data-model change beyond what this refactor
// strictly needs. MAX_REPAIR_DEPTH bounds how long a single displacement
// chain may run (Lesson A moves to make room, which itself needs Lesson B to
// move, which needs Lesson C, ...).
//
// MAX_REPAIR_ATTEMPTS_PER_CANDIDATE bounds the candidate-slot checks one
// single top-level candidate slot's own relocation search (relocateLesson,
// across every depth of its own chain) may spend. It is given FRESH to each
// top-level candidate in attemptRepair's own loop — not shared across
// candidates. A shared budget previously meant one expensive-but-failed
// first candidate could exhaust the entire search before ever reaching a
// later candidate with a trivial, valid fix (confirmed on real data: a
// depth-1 fix sitting behind candidate #4 was never reached because
// candidate #1 alone burned the whole then-shared budget) — a false
// negative, not a genuine dead end. Resetting per candidate fixes that.
//
// MAX_TOTAL_REPAIR_ATTEMPTS_PER_UNIT is the safety net a per-candidate reset
// otherwise removes: without an overall cap, a missing unit with many
// single-blocker candidate slots could spend MAX_REPAIR_ATTEMPTS_PER_CANDIDATE
// on every single one of them, unbounded in total. Shared (not reset) across
// every candidate in one attemptRepair call, same role the old single budget
// played, just no longer the thing that starves individual candidates.
// Briefly tried at 1000 (read-only analysis had found a handful of missing
// Lessons whose fix sat behind enough dead-end candidates to exhaust a 300
// total) but reverted back to 300: on the real stress-test School, the wider
// ceiling let an earlier-processed unit's own repair relocate things more
// freely, which then consumed slots a *later* unit's repair had depended on
// — net regression (416/420 -> 415/420), not an improvement. That's an
// inherent trade-off of this greedy-plus-repair heuristic's live, order-
// dependent state, not something a bigger number alone fixes — left at 300
// pending an actual algorithm change, not attempted here.
const MAX_REPAIR_DEPTH = 3;
const MAX_REPAIR_ATTEMPTS_PER_CANDIDATE = 60;
const MAX_TOTAL_REPAIR_ATTEMPTS_PER_UNIT = 300;

// budget.attempts is the current candidate's own remaining allowance;
// budget.total (shared, not reset per candidate) is the overall safety cap.
// Exhausting either stops the search — see constants above.
function budgetExhausted(budget) {
  return budget.attempts <= 0 || (budget.total ? budget.total.remaining <= 0 : false);
}

function spendAttempt(budget) {
  budget.attempts -= 1;
  if (budget.total) budget.total.remaining -= 1;
}

function emptyQualityScore() {
  return {
    illustrative: true,
    overallQuality: null,
    teacherConflicts: 0,
    classConflicts: 0,
    missingLessons: 0,
    missingDetails: [],
    doublePeriodViolations: 0,
    teacherPreferenceSatisfaction: null,
    subjectDistribution: null,
    subjectRequirementSatisfaction: null,
    teacherGapScore: null,
    workloadBalance: null,
    notes: ['No active Lessons to score yet.'],
  };
}

// --- Unit resolution (Backend Design, Step 1) ----------------------------------

// alreadySatisfiedCounts maps teacherSubjectAssignmentId -> count of
// surviving (Locked, or outside this run's own scope) Active Lessons
// already referencing it — subtracted from the weekly target before
// computing how many *new* units this run still needs to place. Without
// this, a Locked Lesson would not count toward its own Assignment's weekly
// target, and the engine would place additional Lessons past that target —
// violating the very Hard Constraint (Business Rule #8) it must never
// violate.
//
// Required-lesson-unit count and Double Period status now both come from
// Weekly Subject Allocation's own getWeeklyPeriodsForAssignment, replacing
// this engine's prior reliance on TeacherSubjectAssignment.weeklyLessonTarget
// (ACR-006, now removed) and SubjectSchedulePreference.doublePeriodPreferred
// (now removed). When no current allocation line exists at all for an
// Assignment's own Class/Subject/Academic-Year combination,
// getWeeklyPeriodsForAssignment returns null — that Assignment contributes
// *zero* units, never a silent default of 1 the way the superseded
// weeklyLessonTarget-unset case used to. Weekly Subject Allocation's own
// entire premise is that this number is now authoritative and required;
// carrying the old default forward would quietly undermine that (resolved
// explicitly during that feature's own Business Review).
async function buildUnits(schoolId, academicYearId, assignments, alreadySatisfiedCounts = new Map()) {
  const units = [];
  for (const assignment of assignments) {
    const allocationLine = await weeklySubjectAllocationsService.getWeeklyPeriodsForAssignment(
      schoolId,
      assignment.classId,
      academicYearId,
      assignment.subjectId
    );
    const target = allocationLine ? allocationLine.weeklyPeriods : 0;
    const alreadySatisfied = alreadySatisfiedCounts.get(assignment.id) || 0;
    // Still read for its own remaining soft preferences (preferredPeriods,
    // avoidPeriods, preferredDays, avoidDays, maxLessonsPerDay) — only
    // doublePeriodPreferred itself relocated to Weekly Subject Allocation.
    const subjectPreference = await repository.findSubjectPreference(assignment.id);
    const wantsDouble = Boolean(allocationLine && allocationLine.doublePeriodRequired);

    let remaining = Math.max(0, target - alreadySatisfied);
    if (wantsDouble) {
      while (remaining >= 2) {
        units.push({ assignment, subjectPreference, isDouble: true });
        remaining -= 2;
      }
    }
    while (remaining >= 1) {
      units.push({ assignment, subjectPreference, isDouble: false });
      remaining -= 1;
    }
  }
  return units;
}

// --- Per-run context (caches + in-memory conflict tracking) -------------------
// All local to one generateTimetable call — never module-level state, so
// concurrent or sequential runs (different schools, or the same school at
// different times) never leak state into one another.

async function buildContext(schoolId) {
  const workingDays = await schoolScheduleService.getWorkingDays(schoolId);
  const optimizationSettings = await repository.findOptimizationSettings(schoolId);
  return {
    workingDays,
    optimizationSettings: optimizationSettings || {},
    classPeriodsCache: new Map(),
    teacherPreferenceCache: new Map(),
    teacherBusy: new Set(),
    classBusy: new Set(),
    // Repair support — who currently occupies a given Teacher/Class slot,
    // keyed the same way as teacherBusy/classBusy. Every occupied slot gets
    // an entry (survivors included), but only entries with relocatable:true
    // (a Lesson this very run placed) are ever candidates for the repair
    // pass to move — a survivor (Locked, or simply outside this run's own
    // scope) is recorded here purely so Hard Constraint checks see it as
    // busy, never as something repair may touch (Hard Constraint #5: never
    // move a Locked Lesson; scope contract: never touch an out-of-scope one).
    teacherOccupant: new Map(),
    classOccupant: new Map(),
    // Running counts for Soft Preference scoring — teacherId|day -> count,
    // teacherId -> total placed, subjectId|day -> count.
    teacherDayCount: new Map(),
    teacherTotalCount: new Map(),
    subjectDayCount: new Map(),
    // balanceFirstLastPeriods: teacherId -> how many first-or-last-Teaching-
    // Period Lessons this Teacher already has.
    teacherFirstLastCount: new Map(),
    // minimizeTeacherGaps: teacherId|day -> Set of that Teacher's own
    // already-placed Period displayOrders that day, used to find the
    // nearest existing Lesson (by displayOrder distance) for a candidate.
    teacherDayDisplayOrders: new Map(),
  };
}

async function getClassPeriods(schoolId, classId, ctx) {
  if (ctx.classPeriodsCache.has(classId)) return ctx.classPeriodsCache.get(classId);
  const cls = await classesService.getClassById(classId);
  const periods = cls ? await schoolScheduleService.getShiftPeriods(schoolId, cls.shiftId, { status: 'ACTIVE' }) : [];
  const sorted = [...periods].sort((a, b) => a.displayOrder - b.displayOrder);
  const result = { shiftId: cls ? cls.shiftId : null, periods: sorted };
  ctx.classPeriodsCache.set(classId, result);
  return result;
}

async function getTeacherPreference(teacherId, ctx) {
  if (ctx.teacherPreferenceCache.has(teacherId)) return ctx.teacherPreferenceCache.get(teacherId);
  const preference = await repository.findTeacherPreference(teacherId);
  ctx.teacherPreferenceCache.set(teacherId, preference);
  return preference;
}

function slotKey(entityId, dayOfWeek, periodId) {
  return `${entityId}|${dayOfWeek}|${periodId}`;
}

function isSlotFree(ctx, teacherId, classId, dayOfWeek, periodId) {
  return !ctx.teacherBusy.has(slotKey(teacherId, dayOfWeek, periodId)) && !ctx.classBusy.has(slotKey(classId, dayOfWeek, periodId));
}

function markSlotBusy(ctx, teacherId, classId, dayOfWeek, periodId) {
  ctx.teacherBusy.add(slotKey(teacherId, dayOfWeek, periodId));
  ctx.classBusy.add(slotKey(classId, dayOfWeek, periodId));
}

function clearSlotBusy(ctx, teacherId, classId, dayOfWeek, periodId) {
  ctx.teacherBusy.delete(slotKey(teacherId, dayOfWeek, periodId));
  ctx.classBusy.delete(slotKey(classId, dayOfWeek, periodId));
}

// Registers an occupant record for one Day+Period — record.relocatable
// governs whether the repair pass below may ever propose moving it.
// Occupies both the Hard Constraint busy-set (isSlotFree) and the
// occupant-lookup map (who is here, for repair to inspect) together, so the
// two structures can never drift apart.
function occupySlot(ctx, record, dayOfWeek, periodId) {
  markSlotBusy(ctx, record.teacherId, record.classId, dayOfWeek, periodId);
  ctx.teacherOccupant.set(slotKey(record.teacherId, dayOfWeek, periodId), record);
  ctx.classOccupant.set(slotKey(record.classId, dayOfWeek, periodId), record);
}

function vacateSlot(ctx, record, dayOfWeek, periodId) {
  clearSlotBusy(ctx, record.teacherId, record.classId, dayOfWeek, periodId);
  ctx.teacherOccupant.delete(slotKey(record.teacherId, dayOfWeek, periodId));
  ctx.classOccupant.delete(slotKey(record.classId, dayOfWeek, periodId));
}

// Feeds balanceFirstLastPeriods and minimizeTeacherGaps' own running stats —
// called once per actually-placed Period (both halves of a double period),
// mirroring the existing teacherDayCount/teacherTotalCount/subjectDayCount
// bookkeeping just below each call site.
async function recordSoftPreferenceStats(schoolId, ctx, classId, teacherId, dayOfWeek, period) {
  const { periods } = await getClassPeriods(schoolId, classId, ctx);
  const teaching = periods.filter((p) => p.type === 'TEACHING');
  if (teaching.length > 0 && (period.id === teaching[0].id || period.id === teaching[teaching.length - 1].id)) {
    ctx.teacherFirstLastCount.set(teacherId, (ctx.teacherFirstLastCount.get(teacherId) || 0) + 1);
  }
  const teacherDayKey = `${teacherId}|${dayOfWeek}`;
  if (!ctx.teacherDayDisplayOrders.has(teacherDayKey)) {
    ctx.teacherDayDisplayOrders.set(teacherDayKey, new Set());
  }
  ctx.teacherDayDisplayOrders.get(teacherDayKey).add(period.displayOrder);
}

// The exact inverse of recordSoftPreferenceStats — used only when the
// repair pass moves an already-placed-this-run Lesson away from a slot, so
// its running Soft Preference contribution at the OLD slot doesn't linger
// and skew scoring for whatever gets scored next. Best-effort bookkeeping
// for illustrative scoring only (see scoreCandidate's own comment) — never
// consulted by any Hard Constraint check.
async function unrecordSoftPreferenceStats(schoolId, ctx, classId, teacherId, dayOfWeek, period) {
  const { periods } = await getClassPeriods(schoolId, classId, ctx);
  const teaching = periods.filter((p) => p.type === 'TEACHING');
  if (teaching.length > 0 && (period.id === teaching[0].id || period.id === teaching[teaching.length - 1].id)) {
    ctx.teacherFirstLastCount.set(teacherId, Math.max(0, (ctx.teacherFirstLastCount.get(teacherId) || 0) - 1));
  }
  const teacherDayKey = `${teacherId}|${dayOfWeek}`;
  const existing = ctx.teacherDayDisplayOrders.get(teacherDayKey);
  if (existing) existing.delete(period.displayOrder);
}

function isTeacherUnavailable(preference, dayOfWeek, periodId) {
  if (!preference || !preference.unavailableSlots) return false;
  const slots = Array.isArray(preference.unavailableSlots) ? preference.unavailableSlots : [];
  return slots.some((slot) => slot && slot.dayOfWeek === dayOfWeek && slot.periodId === periodId);
}

// --- Candidate generation & Hard Constraint filtering (Backend Design, Step 4.1-4.2) --

// Every structurally valid slot for this unit — "structurally valid" meaning
// the Period is a TEACHING Period (never a Break), the Teacher hasn't
// recorded themselves unavailable there (a Hard Constraint, same as
// createLesson's own manual-edit path), and, for a double period, its
// immediate next Period exists, is also TEACHING, and is also not
// Unavailable. Deliberately does NOT filter on isSlotFree — unlike
// getCandidateSlots below, this includes slots that are currently occupied,
// so the repair pass can inspect exactly who is occupying them.
async function getFullDomainSlots(schoolId, unit, ctx, scopeDays) {
  const { assignment, isDouble } = unit;
  const { periods } = await getClassPeriods(schoolId, assignment.classId, ctx);
  const teacherPreference = await getTeacherPreference(assignment.teacherId, ctx);
  const days = scopeDays || ctx.workingDays;

  const domain = [];
  for (const day of days) {
    for (let i = 0; i < periods.length; i += 1) {
      const period = periods[i];
      if (period.type !== 'TEACHING') continue;
      if (isTeacherUnavailable(teacherPreference, day, period.id)) continue;

      if (isDouble) {
        const next = periods[i + 1];
        if (!next || next.type !== 'TEACHING') continue;
        if (isTeacherUnavailable(teacherPreference, day, next.id)) continue;
        domain.push({ day, period, secondPeriod: next });
      } else {
        domain.push({ day, period });
      }
    }
  }
  return domain;
}

function isDomainSlotFree(ctx, unit, slot) {
  const { assignment } = unit;
  if (!isSlotFree(ctx, assignment.teacherId, assignment.classId, slot.day, slot.period.id)) return false;
  if (slot.secondPeriod && !isSlotFree(ctx, assignment.teacherId, assignment.classId, slot.day, slot.secondPeriod.id)) return false;
  return true;
}

async function getCandidateSlots(schoolId, unit, ctx, scopeDays) {
  const domain = await getFullDomainSlots(schoolId, unit, ctx, scopeDays);
  return domain.filter((slot) => isDomainSlotFree(ctx, unit, slot));
}

// --- Soft Preference scoring (Backend Design, Step 4.4) ------------------------
// A simple additive weighted score — explicitly illustrative, not a
// Product-Owner-approved formula, per this feature's own established
// Quality Score caveat. Soft Preferences may be violated whenever necessary;
// this scoring only ever chooses among candidates that already survived
// every Hard Constraint filter above.

async function scoreCandidate(schoolId, candidate, unit, ctx, teacherPreference) {
  const { assignment, subjectPreference } = unit;
  const { day, period } = candidate;
  let score = 0;

  const inList = (list, id) => Array.isArray(list) && list.includes(id);

  if (teacherPreference) {
    if (inList(teacherPreference.preferredPeriods, period.id)) score += 3;
    if (inList(teacherPreference.avoidPeriods, period.id)) score -= 3;
    if (Array.isArray(teacherPreference.preferredWorkingDays) && teacherPreference.preferredWorkingDays.length > 0) {
      score += teacherPreference.preferredWorkingDays.includes(day) ? 2 : -1;
    }
  }
  if (subjectPreference) {
    if (inList(subjectPreference.preferredPeriods, period.id)) score += 2;
    if (inList(subjectPreference.avoidPeriods, period.id)) score -= 2;
    if (Array.isArray(subjectPreference.preferredDays) && subjectPreference.preferredDays.length > 0) {
      score += subjectPreference.preferredDays.includes(day) ? 1 : 0;
    }
    if (Array.isArray(subjectPreference.avoidDays) && subjectPreference.avoidDays.includes(day)) score -= 1;
  }

  // Max lessons per day (soft) — penalize, never hard-block, exceeding
  // either the Teacher's or the Subject's own configured maximum.
  const teacherDayKey = `${assignment.teacherId}|${day}`;
  const teacherDaySoFar = ctx.teacherDayCount.get(teacherDayKey) || 0;
  if (teacherPreference && teacherPreference.maxLessonsPerDay && teacherDaySoFar >= teacherPreference.maxLessonsPerDay) {
    score -= 5;
  }
  if (subjectPreference && subjectPreference.maxLessonsPerDay && teacherDaySoFar >= subjectPreference.maxLessonsPerDay) {
    score -= 5;
  }

  // School-level balance settings — simple proxies, explicitly illustrative.
  if (ctx.optimizationSettings.balanceTeacherWorkloads) {
    const teacherTotal = ctx.teacherTotalCount.get(assignment.teacherId) || 0;
    score -= teacherTotal * 0.1; // mild preference for the currently-lighter-loaded Teacher
  }
  if (ctx.optimizationSettings.distributeSubjectsFairly) {
    const subjectDayKey = `${assignment.subjectId}|${day}`;
    const subjectDaySoFar = ctx.subjectDayCount.get(subjectDayKey) || 0;
    score -= subjectDaySoFar; // discourage piling the same Subject onto one Day
  }

  if (ctx.optimizationSettings.balanceFirstLastPeriods) {
    const { periods } = await getClassPeriods(schoolId, assignment.classId, ctx);
    const teaching = periods.filter((p) => p.type === 'TEACHING');
    const isFirstOrLast = teaching.length > 0 && (period.id === teaching[0].id || period.id === teaching[teaching.length - 1].id);
    if (isFirstOrLast) {
      const soFar = ctx.teacherFirstLastCount.get(assignment.teacherId) || 0;
      score -= soFar * 0.5; // mild preference for the Teacher with fewer first/last-Period Lessons so far
    }
  }

  if (ctx.optimizationSettings.minimizeTeacherGaps) {
    const teacherDayKeyForGaps = `${assignment.teacherId}|${day}`;
    const existingDisplayOrders = ctx.teacherDayDisplayOrders.get(teacherDayKeyForGaps);
    if (existingDisplayOrders && existingDisplayOrders.size > 0) {
      const distances = [...existingDisplayOrders].map((displayOrder) => Math.abs(period.displayOrder - displayOrder));
      const minDistance = Math.min(...distances);
      score += minDistance === 1 ? 1 : -(minDistance - 1); // adjacent to an existing Lesson that day is preferred; a wider gap is discouraged proportionally
    }
  }

  return score;
}

// --- Future-feasibility scoring (protect scarce slots) -------------------------
// Priority chain (Technical Design's own constraint-aware ordering): Hard
// Constraints, then candidate validity, then future feasibility, then Soft
// Preference score. scoreCandidate above implements the last of those only —
// this implements the one above it. Combined in pickBestCandidate below by
// giving this a weight large enough that it always dominates soft-preference
// score, so it can only ever be a tie-break among slots this function scores
// identically, never overridden by a soft preference.
const FEASIBILITY_WEIGHT = 1000;

// How much placing this unit into `slot` would cost OTHER still-pending
// units — only ones sharing this unit's own Teacher or Class even matter
// (nobody else could possibly want this exact Teacher/Class slot). For each
// such other unit whose own current candidate set includes this slot, the
// cost is weighted by how scarce that other unit's own options already are
// (1 / candidateCount) — taking away one of a unit's only 2 remaining
// options costs far more than taking away one of another unit's 12. Lower
// returned cost is better.
function scarcityCost(slot, unit, otherPendingWithCandidates) {
  const { assignment } = unit;
  let cost = 0;
  for (const { unit: other, candidates: otherCandidates } of otherPendingWithCandidates) {
    if (other === unit) continue;
    if (other.assignment.teacherId !== assignment.teacherId && other.assignment.classId !== assignment.classId) continue;
    const occupiesSameSlot = otherCandidates.some(
      (c) => c.day === slot.day && c.period.id === slot.period.id && (c.secondPeriod ? c.secondPeriod.id === (slot.secondPeriod && slot.secondPeriod.id) : !slot.secondPeriod)
    );
    if (occupiesSameSlot) {
      cost += 1 / Math.max(1, otherCandidates.length);
    }
  }
  return cost;
}

// Picks the best of `candidates` for `unit`, in the Hard-Constraint-already-
// filtered / candidate-validity-already-established chain's own next two
// steps: future feasibility first (dominant), Soft Preference score second
// (the existing tie-break). `pendingWithCandidates` is this same outer
// iteration's own already-computed {unit, candidates} pairs for every other
// still-pending unit — reused, never recomputed, purely for the scarcity
// calculation above.
async function pickBestCandidate(schoolId, candidates, unit, ctx, teacherPreference, pendingWithCandidates) {
  let best = candidates[0];
  let bestTotal = -Infinity;
  for (const candidate of candidates) {
    const feasibility = -scarcityCost(candidate, unit, pendingWithCandidates);
    const soft = await scoreCandidate(schoolId, candidate, unit, ctx, teacherPreference);
    const total = feasibility * FEASIBILITY_WEIGHT + soft;
    if (total > bestTotal) {
      best = candidate;
      bestTotal = total;
    }
  }
  return best;
}

// --- Bounded conflict-aware repair (Hard Constraints #5, never Locked, never
// out-of-scope) --------------------------------------------------------------
// Triggered only when a unit's own candidate list is genuinely empty. Looks
// at what is actually occupying each of the unit's structurally valid slots
// and, within a small bounded search per candidate (MAX_REPAIR_DEPTH chain
// length, MAX_REPAIR_ATTEMPTS_PER_CANDIDATE candidate checks — reset fresh
// for every candidate slot, so an expensive failed search on one candidate
// can never starve a later, easier one; MAX_TOTAL_REPAIR_ATTEMPTS_PER_UNIT
// still caps the whole attempt), tries relocating the single Lesson blocking
// one of them elsewhere first — a short displacement chain, the same idea as
// an augmenting-path search — before the unit is ever reported Missing.
// Every relocation this performs is itself re-checked against the exact
// same Hard Constraints as an ordinary placement (never a Teacher/Class
// double-booking, never an Unavailable slot); nothing here bypasses them.

// The occupant(s) blocking `slot` for `unit` — deduplicated by Lesson id.
// Multi-blocker slots (e.g. a double period whose two halves are occupied by
// two different Lessons, or a slot where the Teacher is busy with one Lesson
// while the Class is separately busy with another) are deliberately left
// unrepaired by this bounded pass — coordinating more than one simultaneous
// relocation is out of scope for it; the caller simply treats such a slot as
// not currently repairable and moves on to the next one.
function getBlockersForSlot(ctx, unit, slot) {
  const { assignment } = unit;
  const periodsInvolved = slot.secondPeriod ? [slot.period, slot.secondPeriod] : [slot.period];
  const blockers = new Map();
  for (const period of periodsInvolved) {
    const teacherOccupant = ctx.teacherOccupant.get(slotKey(assignment.teacherId, slot.day, period.id));
    if (teacherOccupant) blockers.set(teacherOccupant.lessonId, teacherOccupant);
    const classOccupant = ctx.classOccupant.get(slotKey(assignment.classId, slot.day, period.id));
    if (classOccupant) blockers.set(classOccupant.lessonId, classOccupant);
  }
  return [...blockers.values()];
}

function sameSlotAsRecord(slot, record) {
  return slot.day === record.dayOfWeek && slot.period.id === record.periodId;
}

// Persists one relocation — both the DB row (repository.updateLesson) and
// every in-memory structure that must stay consistent with it (the busy-set/
// occupant maps used by every Hard Constraint check above, and the running
// Soft Preference counters). record is mutated in place so subsequent
// lookups (including a still-unfinished outer repair chain) see the moved
// Lesson at its new slot immediately.
async function performMove(schoolId, ctx, record, targetSlot) {
  const oldDay = record.dayOfWeek;
  const oldPeriod = record.periodObj;

  vacateSlot(ctx, record, oldDay, record.periodId);
  await unrecordSoftPreferenceStats(schoolId, ctx, record.classId, record.teacherId, oldDay, oldPeriod);

  await repository.updateLesson(record.lessonId, { dayOfWeek: targetSlot.day, periodId: targetSlot.period.id });

  record.dayOfWeek = targetSlot.day;
  record.periodId = targetSlot.period.id;
  record.periodObj = targetSlot.period;
  occupySlot(ctx, record, targetSlot.day, targetSlot.period.id);
  await recordSoftPreferenceStats(schoolId, ctx, record.classId, record.teacherId, targetSlot.day, targetSlot.period);
}

// Tries to move `record` (a Lesson this same run placed) to any other slot
// in its own Assignment's domain — directly if a slot is already free, or by
// recursively repairing one single blocker at a time if depth budget
// remains. Returns true only once `record` has actually been moved.
async function relocateLesson(schoolId, record, ctx, scopeDays, budget, depth) {
  if (!record.relocatable || record.lessonGroupId) return false;
  if (depth > budget.maxDepth) return false;

  const pseudoUnit = { assignment: record.assignment, subjectPreference: null, isDouble: false };
  const domain = await getFullDomainSlots(schoolId, pseudoUnit, ctx, scopeDays);

  for (const candidate of domain) {
    if (sameSlotAsRecord(candidate, record)) continue;
    if (budgetExhausted(budget)) return false;
    spendAttempt(budget);

    if (isDomainSlotFree(ctx, pseudoUnit, candidate)) {
      await performMove(schoolId, ctx, record, candidate);
      return true;
    }

    if (depth < budget.maxDepth) {
      const blockers = getBlockersForSlot(ctx, pseudoUnit, candidate);
      if (blockers.length === 1 && blockers[0].lessonId !== record.lessonId) {
        const cleared = await relocateLesson(schoolId, blockers[0], ctx, scopeDays, budget, depth + 1);
        if (cleared) {
          await performMove(schoolId, ctx, record, candidate);
          return true;
        }
      }
    }
  }
  return false;
}

// Top-level entry point — tries to find `unit` (not yet placed; it has no
// Lesson of its own yet) a slot by relocating whatever single Lesson blocks
// one of its own structurally valid slots, bounded the same way
// relocateLesson is. Returns the now-free slot to place `unit` into, or null
// once the bounded search is exhausted (a genuine dead end for now).
//
// Each candidate slot's relocateLesson call gets its own fresh
// MAX_REPAIR_ATTEMPTS_PER_CANDIDATE budget (see this file's own repair
// configuration comment above for why) — only totalBudget carries over
// between candidates, as the overall safety cap.
async function attemptRepair(schoolId, unit, ctx, scopeDays) {
  const domain = await getFullDomainSlots(schoolId, unit, ctx, scopeDays);
  const totalBudget = { remaining: MAX_TOTAL_REPAIR_ATTEMPTS_PER_UNIT };

  for (const slot of domain) {
    if (isDomainSlotFree(ctx, unit, slot)) return slot; // already free — normal candidate path would have found this
    if (totalBudget.remaining <= 0) return null;

    const blockers = getBlockersForSlot(ctx, unit, slot);
    if (blockers.length !== 1) continue; // multi-blocker slot — out of this bounded pass's scope

    const budget = { attempts: MAX_REPAIR_ATTEMPTS_PER_CANDIDATE, maxDepth: MAX_REPAIR_DEPTH, total: totalBudget };
    spendAttempt(budget);
    const cleared = await relocateLesson(schoolId, blockers[0], ctx, scopeDays, budget, 1);
    if (cleared) return slot;
  }
  return null;
}

// --- Global Repair Phase (bounded combination optimizer) ---------------------
// Approved design review, implemented additively on top of everything above
// — attemptRepair/relocateLesson/performMove are called, never modified, and
// MAX_REPAIR_DEPTH / MAX_REPAIR_ATTEMPTS_PER_CANDIDATE /
// MAX_TOTAL_REPAIR_ATTEMPTS_PER_UNIT are reused unchanged. Runs once, after
// the greedy + local-repair while-loop below has already finished and
// produced its own `missing` list — this phase's only input, never touched
// mid-run. The problem it exists for: attemptRepair takes the FIRST
// relocation it finds for one missing unit and commits it immediately
// (repository.updateLesson, inside performMove) before the next missing
// unit is even considered — so a repair that helps unit C can silently cost
// unit D a slot it needed, and nothing before this notices. Confirmed on
// real data: raising MAX_TOTAL_REPAIR_ATTEMPTS_PER_UNIT 300 -> 1000 fixed
// one missing Lesson and broke a different, previously-fine one — net
// regression, not an improvement, because no comparison against "don't make
// this move" ever happened.
//
// This phase fixes that by separating propose from commit: generate several
// candidate RepairPlans per missing unit (read-only — never calls
// repository.updateLesson while proposing), search the bounded space of
// mutually-compatible combinations, score each complete combination with
// the SAME computeQualityScore production already uses, and commit only the
// winner — and only if it is strictly better than committing nothing at
// all. "Nothing" (the empty combination) is always in the running and
// always wins ties, which is what guarantees this phase can never make the
// existing 416/420 result worse: if no combination beats the baseline, the
// baseline IS what gets returned, unchanged.
const MAX_PLANS_PER_UNIT = 3;
const MAX_MISSING_FOR_GLOBAL_REPAIR = 15;
// Bounds the combination search itself (Requirement 14: "never allow
// unbounded recursion") — decremented once per node the backtracking search
// visits (both "skip this unit" and "try this unit's plan #N" branches),
// independent of how many missing units or plans-per-unit there are. At
// realistic scale (a handful of missing units, <=3 plans each) this search
// finishes in a few hundred nodes; this is a safety ceiling for a
// pathological input, not a number tuned to the common case.
const MAX_COMBINATION_SEARCH_NODES = 2000;
// How many fully-valid complete combinations get carried through to the
// (expensive — see below) quality-scoring step. Kept small deliberately:
// computeQualityScore does a DB read per Lesson (Teacher Preference,
// Period lookups), so scoring is not something this phase can afford to do
// for every branch the search visits — only for the finalists.
const MAX_COLLECTED_BRANCHES = 25;

// Pure ctx mutation — the read-only counterpart to performMove (Requirement
// 5: repository.updateLesson must never execute while PROPOSING a plan).
// Mirrors performMove's ctx-side effect only (vacate old slot, occupy new
// one) — no DB write, no Soft Preference bookkeeping (irrelevant to Hard
// Constraint validity, and undone by rollbackMoves anyway before this phase
// ever commits anything for real).
function simulateMove(ctx, record, targetSlot, moveLog) {
  const oldDay = record.dayOfWeek;
  const oldPeriodId = record.periodId;
  vacateSlot(ctx, record, oldDay, oldPeriodId);
  record.dayOfWeek = targetSlot.day;
  record.periodId = targetSlot.period.id;
  occupySlot(ctx, record, targetSlot.day, targetSlot.period.id);
  moveLog.push({ lessonId: record.lessonId, record, from: { day: oldDay, periodId: oldPeriodId }, to: { day: targetSlot.day, period: targetSlot.period } });
}

// Undoes a moveLog produced by simulateMove, in reverse order, restoring
// ctx exactly to what it was before — the sandbox's own rollback half.
function rollbackMoves(ctx, moveLog) {
  for (let i = moveLog.length - 1; i >= 0; i -= 1) {
    const { record, from } = moveLog[i];
    vacateSlot(ctx, record, record.dayOfWeek, record.periodId);
    record.dayOfWeek = from.day;
    record.periodId = from.periodId;
    occupySlot(ctx, record, from.day, from.periodId);
  }
  moveLog.length = 0;
}

// A completed moveLog is only trustworthy if no step is a no-op (a lesson
// "moved" back to the slot it started at) and no two steps land on the same
// destination — both are signatures of the same chain-aliasing risk
// relocateLesson itself never has room to hit at MAX_REPAIR_DEPTH=3 /
// MAX_REPAIR_ATTEMPTS_PER_CANDIDATE=60, but which a read-only diagnostic
// pass earlier in this project's own history hit once, at a much larger,
// exploratory budget. Second line of defense behind the inFlight guard in
// simulateRelocate below — never rely on either alone.
function moveLogIsSane(moveLog) {
  const seen = new Set();
  for (const move of moveLog) {
    if (move.from.day === move.to.day && move.from.periodId === move.to.period.id) return false;
    const key = `${move.to.day}|${move.to.period.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

// Read-only mirror of relocateLesson: identical Hard Constraint checks
// (getFullDomainSlots, isDomainSlotFree, getBlockersForSlot), identical
// MAX_REPAIR_DEPTH / budget semantics (the SAME budget object shape
// relocateLesson itself uses — budgetExhausted/spendAttempt, unchanged),
// but proposes via simulateMove instead of performMove, and additionally
// refuses to revisit a Lesson already mid-chain in this same search
// (inFlight) — relocateLesson doesn't need this guard because production
// never runs it wide/deep enough to hit the aliasing risk it guards
// against; generating several alternative plans here can.
async function simulateRelocate(schoolId, record, ctx, scopeDays, budget, depth, moveLog, inFlight) {
  if (!record.relocatable || record.lessonGroupId) return false;
  if (depth > budget.maxDepth) return false;
  if (inFlight.has(record.lessonId)) return false;
  inFlight.add(record.lessonId);

  const pseudoUnit = { assignment: record.assignment, subjectPreference: null, isDouble: false };
  const domain = await getFullDomainSlots(schoolId, pseudoUnit, ctx, scopeDays);

  for (const candidate of domain) {
    if (sameSlotAsRecord(candidate, record)) continue;
    if (budgetExhausted(budget)) {
      inFlight.delete(record.lessonId);
      return false;
    }
    spendAttempt(budget);

    if (isDomainSlotFree(ctx, pseudoUnit, candidate)) {
      simulateMove(ctx, record, candidate, moveLog);
      inFlight.delete(record.lessonId);
      return true;
    }

    if (depth < budget.maxDepth) {
      const blockers = getBlockersForSlot(ctx, pseudoUnit, candidate);
      if (blockers.length === 1 && blockers[0].lessonId !== record.lessonId) {
        const cleared = await simulateRelocate(schoolId, blockers[0], ctx, scopeDays, budget, depth + 1, moveLog, inFlight);
        if (cleared) {
          simulateMove(ctx, record, candidate, moveLog);
          inFlight.delete(record.lessonId);
          return true;
        }
      }
    }
  }
  inFlight.delete(record.lessonId);
  return false;
}

// Proposes up to MAX_PLANS_PER_UNIT independent RepairPlans for one missing
// unit — read-only throughout, each found against the SAME clean ctx
// (rolled back after every attempt, successful or not — Requirement 5) so
// plan #2 is never influenced by plan #1's own moves. Reuses the exact same
// domain-scan-then-relocate shape attemptRepair itself uses (single-blocker
// candidates only — Requirement 6/7's Hard Constraints apply identically);
// the only difference is collecting several candidates instead of
// committing the first. Budgeted exactly like attemptRepair
// (MAX_REPAIR_ATTEMPTS_PER_CANDIDATE per candidate slot,
// MAX_TOTAL_REPAIR_ATTEMPTS_PER_UNIT shared across the whole scan for this
// one unit — Requirement 14's "preserve the existing 300 limit per unit").
//
// Double-period units are out of scope for this phase (returns no plans) —
// applyPlanToShadowCtx's own final-placement step only ever occupies one
// Period, and no double-period unit exists among this school's own real
// missing Lessons to justify the added complexity; they remain exactly as
// handled today, by attemptRepair alone.
async function generateCandidatePlansForUnit(schoolId, missingUnitKey, unit, ctx, scopeDays) {
  if (unit.isDouble) return [];

  const domain = await getFullDomainSlots(schoolId, unit, ctx, scopeDays);
  const totalBudget = { remaining: MAX_TOTAL_REPAIR_ATTEMPTS_PER_UNIT };
  const plans = [];

  for (const slot of domain) {
    if (plans.length >= MAX_PLANS_PER_UNIT) break;
    if (totalBudget.remaining <= 0) break;

    if (isDomainSlotFree(ctx, unit, slot)) {
      // Already free with zero moves — shouldn't happen for a genuinely
      // missing unit (the ordinary candidate-scan path earlier in
      // generateTimetable would already have placed it), but if it ever
      // does, it is trivially the cheapest possible plan.
      plans.push({ planId: `${missingUnitKey}@${slot.day}-${slot.period.id}`, missingUnitKey, unit, finalSlot: slot, moves: [], depth: 0, attemptsSpent: 0 });
      continue;
    }

    const blockers = getBlockersForSlot(ctx, unit, slot);
    if (blockers.length !== 1) continue; // multi-blocker — same as attemptRepair, out of this pass's scope

    const spentBefore = totalBudget.remaining;
    const budget = { attempts: MAX_REPAIR_ATTEMPTS_PER_CANDIDATE, maxDepth: MAX_REPAIR_DEPTH, total: totalBudget };
    spendAttempt(budget);
    const moveLog = [];
    const inFlight = new Set();
    const cleared = await simulateRelocate(schoolId, blockers[0], ctx, scopeDays, budget, 1, moveLog, inFlight);

    if (cleared && moveLogIsSane(moveLog)) {
      plans.push({
        planId: `${missingUnitKey}@${slot.day}-${slot.period.id}`,
        missingUnitKey,
        unit,
        finalSlot: slot,
        moves: moveLog.map((m) => ({ lessonId: m.lessonId, from: m.from, to: m.to })),
        depth: moveLog.length,
        attemptsSpent: spentBefore - totalBudget.remaining,
      });
    }
    if (moveLog.length > 0) rollbackMoves(ctx, moveLog); // always undo — proposing must never leave ctx mutated
  }
  return plans;
}

// A stand-in for a missing unit's own not-yet-real Lesson, once a plan for
// it has been applied to the shared sandbox ctx — occupies its own
// Teacher+Class slot so a LATER plan considered in the same combination
// correctly sees it as busy (Requirement 8: whole-combination validity, not
// pairwise). Never relocatable — nothing in this same search needs to move
// a unit's own brand-new placement while still deciding the rest of the
// combination.
function placeholderRecordForPlan(plan) {
  return {
    lessonId: `pending:${plan.missingUnitKey}`,
    teacherId: plan.unit.assignment.teacherId,
    classId: plan.unit.assignment.classId,
    dayOfWeek: plan.finalSlot.day,
    periodId: plan.finalSlot.period.id,
    lessonGroupId: null,
    relocatable: false,
    assignment: plan.unit.assignment,
  };
}

// Applies one RepairPlan's moves plus its own final placement to `ctx`,
// RE-VALIDATING every step live against the CURRENT ctx rather than trusting
// it is still valid the way it was when generated against the clean
// baseline (Requirement 15) — an earlier plan already applied in this same
// combination may have since moved the very Lesson this plan expects to
// find at `move.from`, or already taken the slot this plan wants to move
// into. Returns `{ moveLog, placeholder }` on full success, or null if any
// step is no longer valid — in which case whatever this call itself already
// applied is rolled back before returning, leaving ctx exactly as found.
function applyPlanToShadowCtx(ctx, plan, recordsByLessonId) {
  const moveLog = [];
  for (const move of plan.moves) {
    const record = recordsByLessonId.get(move.lessonId);
    if (!record || record.dayOfWeek !== move.from.day || record.periodId !== move.from.periodId) {
      // Missing, or no longer where this plan assumed — an earlier plan in
      // THIS combination already touched it. Reject the whole plan.
      rollbackMoves(ctx, moveLog);
      return null;
    }
    const pseudoUnit = { assignment: record.assignment, isDouble: false };
    const targetSlot = { day: move.to.day, period: move.to.period };
    if (!isDomainSlotFree(ctx, pseudoUnit, targetSlot)) {
      rollbackMoves(ctx, moveLog);
      return null;
    }
    simulateMove(ctx, record, targetSlot, moveLog);
  }

  const finalSlot = { day: plan.finalSlot.day, period: plan.finalSlot.period };
  if (!isDomainSlotFree(ctx, plan.unit, finalSlot)) {
    rollbackMoves(ctx, moveLog);
    return null;
  }
  const placeholder = placeholderRecordForPlan(plan);
  occupySlot(ctx, placeholder, finalSlot.day, finalSlot.period.id);
  recordsByLessonId.set(placeholder.lessonId, placeholder);

  return { moveLog, placeholder };
}

// Exact inverse of applyPlanToShadowCtx — used by the backtracking search
// below when un-choosing a plan it had provisionally applied.
function undoPlanApplication(ctx, applied, recordsByLessonId) {
  vacateSlot(ctx, applied.placeholder, applied.placeholder.dayOfWeek, applied.placeholder.periodId);
  recordsByLessonId.delete(applied.placeholder.lessonId);
  rollbackMoves(ctx, applied.moveLog);
}

// Cheap (no DB access) summary of one candidate combination — every field
// here comes straight from which plans were chosen, nothing requires
// scoring. Objective (a) of Requirement 12's lexicographic order lives
// here; (d) and (e) do too, as tie-breakers below (b) and (c).
function summarizeBranch(appliedPlans) {
  return {
    appliedPlans,
    placedDelta: appliedPlans.length,
    movedCount: appliedPlans.reduce((sum, p) => sum + p.moves.length, 0),
    totalCost: appliedPlans.reduce((sum, p) => sum + p.attemptsSpent, 0),
  };
}

// Builds the hypothetical Lesson list one combination would produce —
// baseline Lessons with every applied plan's moves overlaid, plus one
// synthetic row per newly-placed missing unit — and hands it to the REAL,
// unmodified computeQualityScore. This is the only place this phase touches
// that function, and it never writes anything; computeQualityScore already
// only ever reads its `lessons` argument.
function materializeLessonsForScoring(baselineLessons, appliedPlans) {
  const movedTo = new Map();
  for (const plan of appliedPlans) {
    for (const move of plan.moves) movedTo.set(move.lessonId, { dayOfWeek: move.to.day, periodId: move.to.period.id });
  }
  const materialized = baselineLessons.map((lesson) => {
    const moved = movedTo.get(lesson.id);
    return moved ? { ...lesson, dayOfWeek: moved.dayOfWeek, periodId: moved.periodId } : lesson;
  });
  for (const plan of appliedPlans) {
    materialized.push({
      id: `pending:${plan.missingUnitKey}`,
      teacherId: plan.unit.assignment.teacherId,
      classId: plan.unit.assignment.classId,
      teacherSubjectAssignmentId: plan.unit.assignment.id,
      dayOfWeek: plan.finalSlot.day,
      periodId: plan.finalSlot.period.id,
      lessonGroupId: null,
      status: 'ACTIVE',
    });
  }
  return materialized;
}

// computeQualityScore does a DB read per Lesson (Teacher Preference +
// Period lookups) — on a real school's several hundred Lessons that is not
// something this phase can call once per branch it merely visits, only once
// per branch it might actually need to compare. Memoized per unique set of
// applied plans so the same combination is never scored twice within one
// call to planGlobalRepair.
async function getBranchQuality(schoolId, academicYearId, timetableVersionId, baselineLessons, summary, qualityCache) {
  const cacheKey = summary.appliedPlans.map((p) => p.planId).sort().join('|');
  if (qualityCache.has(cacheKey)) return qualityCache.get(cacheKey);
  const materialized = materializeLessonsForScoring(baselineLessons, summary.appliedPlans);
  const result = await computeQualityScore(schoolId, academicYearId, timetableVersionId, materialized);
  qualityCache.set(cacheKey, result);
  return result;
}

// Requirement 12's full lexicographic order: (a) more placed wins outright;
// otherwise (b) a combination that somehow produced a Hard Constraint
// conflict is never chosen (defense in depth — applyPlanToShadowCtx's own
// live revalidation should make this unreachable, the same "should never
// happen, but treat it as a bug if it does" posture computeQualityScore's
// own conflict count already takes); then (c) higher quality; then (d)
// fewer Lessons moved; then (e) less search cost spent finding it.
async function isStrictlyBetter(schoolId, academicYearId, timetableVersionId, baselineLessons, candidate, current, qualityCache) {
  if (candidate.placedDelta !== current.placedDelta) return candidate.placedDelta > current.placedDelta;

  const [candQuality, currQuality] = await Promise.all([
    getBranchQuality(schoolId, academicYearId, timetableVersionId, baselineLessons, candidate, qualityCache),
    getBranchQuality(schoolId, academicYearId, timetableVersionId, baselineLessons, current, qualityCache),
  ]);
  const candConflicts = candQuality.teacherConflicts + candQuality.classConflicts;
  const currConflicts = currQuality.teacherConflicts + currQuality.classConflicts;
  if (candConflicts !== currConflicts) return candConflicts < currConflicts;

  if (candQuality.overallQuality !== currQuality.overallQuality) return candQuality.overallQuality > currQuality.overallQuality;
  if (candidate.movedCount !== current.movedCount) return candidate.movedCount < current.movedCount;
  return candidate.totalCost < current.totalCost;
}

// Top-level entry point. Read-only with respect to the database throughout
// (Requirement 5) — every exploration is applied to the real `ctx` via
// applyPlanToShadowCtx/simulateMove and always undone via
// undoPlanApplication/rollbackMoves before this function returns, so `ctx`
// comes back exactly as it was found regardless of what this phase decides.
// The caller (generateTimetable) is the only place that performs the real
// commit, using the unmodified performMove/placeUnitAtSlot — see
// Requirement 16.
//
// `missingEntries`: [{ key, unit }] — key disambiguates multiple missing
// instances of the SAME Assignment (e.g. this school's own F3A Biology,
// missing 2 of its 4 required weekly periods) so they are always treated,
// and can never be scored, as one unit occupying one slot twice
// (Requirement/Test H).
async function planGlobalRepair(schoolId, academicYearId, timetableVersionId, missingEntries, ctx, scopeDays, baselineLessons) {
  if (missingEntries.length === 0 || missingEntries.length > MAX_MISSING_FOR_GLOBAL_REPAIR) {
    return { attempted: false, committedPlans: [], plansGenerated: 0, combinationsEvaluated: 0 };
  }

  const recordsByLessonId = new Map();
  for (const record of new Set(ctx.teacherOccupant.values())) recordsByLessonId.set(record.lessonId, record);

  let plansGenerated = 0;
  const plansByUnit = [];
  for (const entry of missingEntries) {
    const plans = await generateCandidatePlansForUnit(schoolId, entry.key, entry.unit, ctx, scopeDays);
    plansGenerated += plans.length;
    plansByUnit.push(plans);
  }

  const collected = [];
  const nodeBudget = { remaining: MAX_COMBINATION_SEARCH_NODES };

  async function backtrack(index, chosen) {
    if (nodeBudget.remaining <= 0) return;
    nodeBudget.remaining -= 1;

    if (index === plansByUnit.length) {
      if (chosen.length > 0 && collected.length < MAX_COLLECTED_BRANCHES) collected.push([...chosen]);
      return;
    }

    // Branch: leave this unit missing — always explored, so "do nothing
    // more for this unit" is reachable at every level, not only the top.
    await backtrack(index + 1, chosen);

    // Branch: try each of this unit's own candidate plans.
    for (const plan of plansByUnit[index]) {
      if (nodeBudget.remaining <= 0) return;
      const applied = applyPlanToShadowCtx(ctx, plan, recordsByLessonId);
      if (!applied) continue; // conflicts with an earlier choice in THIS branch — skip it, don't abort the whole search
      chosen.push(plan);
      await backtrack(index + 1, chosen);
      chosen.pop();
      undoPlanApplication(ctx, applied, recordsByLessonId);
    }
  }

  await backtrack(0, []);

  // The empty combination — Requirement 10, always a candidate, and it
  // never needs scoring since every other summary is compared against it.
  const qualityCache = new Map();
  let best = summarizeBranch([]);
  for (const appliedPlans of collected) {
    const candidate = summarizeBranch(appliedPlans);
    const better = await isStrictlyBetter(schoolId, academicYearId, timetableVersionId, baselineLessons, candidate, best, qualityCache);
    if (better) best = candidate;
  }

  return {
    attempted: true,
    committedPlans: best.appliedPlans, // Requirement 11 — empty unless something beat the baseline
    plansGenerated,
    combinationsEvaluated: collected.length + 1, // +1 for the baseline itself
  };
}

// --- Main engine (Backend Design, Steps 1-5) -----------------------------------

async function resolveScopeAssignments(schoolId, academicYearId, scope) {
  const { assignments } = await teacherSubjectAssignmentsService.listAssignments(schoolId, {
    academicYearId,
    classId: scope.type === 'CLASS' ? scope.classId : undefined,
    teacherId: scope.type === 'TEACHER' ? scope.teacherId : undefined,
    pageSize: 1000,
  });
  return assignments.filter((a) => a.status === 'ACTIVE');
}

function buildClearFilter(scope) {
  if (scope.type === 'CLASS') return { classId: scope.classId };
  if (scope.type === 'TEACHER') return { teacherId: scope.teacherId };
  if (scope.type === 'DAY') return { dayOfWeek: scope.dayOfWeek };
  return {};
}

// --- Pre-flight Hard Constraints (Product Owner-approved) ----------------------
// Both run before anything else in generateTimetable — including resolving
// or creating the Draft itself — so a blocked attempt leaves the school's
// existing Draft completely untouched. Both apply school-wide, regardless
// of the requested scope (ALL/CLASS/TEACHER/DAY): Needs-Review already
// established that "block everything, not just the affected part"
// philosophy, and the Teacher capacity check follows it for the same
// reason (an over-committed Teacher's own Lessons could span any scope).
// Thrown Errors propagate up through timetable.jobs.js's own runGenerationJob,
// which already persists any thrown error as the job's FAILED errorMessage —
// no separate handling needed here.

async function getAllActiveTeacherIdsForSchool(schoolId, academicYearId) {
  const { assignments } = await teacherSubjectAssignmentsService.listAssignments(schoolId, {
    academicYearId,
    pageSize: 1000,
  });
  const active = assignments.filter((a) => a.status === 'ACTIVE');
  return [...new Set(active.map((a) => a.teacherId))];
}

async function assertNoNeedsReviewAllocations(schoolId, academicYearId) {
  const needsReview = await weeklySubjectAllocationsService.isSchoolNeedsReview(schoolId, academicYearId);
  if (needsReview) {
    throw new Error(
      'Generation is blocked: one or more Weekly Subject Allocations need review because the calculated available weekly teaching periods no longer match what was saved. Review and re-save every Needs-Review allocation, then try again.'
    );
  }
}

// Catches the unambiguous case only — a Teacher's own total committed
// weekly periods exceeding the full physical week (Working Days x Teaching
// Periods, summed across every distinct Shift their own Classes use) — see
// getTeacherWeeklyCommitmentAndCapacity's own comment for why this
// deliberately ignores each Teacher's own finer-grained availability
// pattern (unavailableSlots), which generation's existing per-slot Hard
// Constraint already handles correctly at placement time.
async function assertNoTeacherOverCapacity(schoolId, academicYearId) {
  const teacherIds = await getAllActiveTeacherIdsForSchool(schoolId, academicYearId);
  const overCapacity = [];
  for (const teacherId of teacherIds) {
    const { committed, capacity } = await teacherSubjectAssignmentsService.getTeacherWeeklyCommitmentAndCapacity(
      schoolId,
      teacherId,
      academicYearId
    );
    if (committed > capacity) {
      const teacher = await teachersService.getTeacherById(schoolId, teacherId);
      overCapacity.push({ name: teacher ? teacher.fullName : teacherId, committed, capacity });
    }
  }
  if (overCapacity.length > 0) {
    const details = overCapacity
      .map((t) => `${t.name} is assigned ${t.committed} periods/week but is only available for ${t.capacity}`)
      .join('; ');
    throw new Error(`Generation is blocked: one or more Teachers are over their own weekly capacity — ${details}.`);
  }
}

// Read-only counterpart to assertNoTeacherOverCapacity — lets a School Admin
// check every Teacher's own committed-vs-capacity figures proactively,
// before ever running generation, rather than only finding out from a
// failed generation job's own errorMessage. Never throws; always returns
// the full report (including Teachers comfortably within capacity), so a
// school with no problem gets a clear "all clear" rather than silence.
async function getTeacherCapacityReport(schoolId, academicYearId) {
  const teacherIds = await getAllActiveTeacherIdsForSchool(schoolId, academicYearId);
  const report = await Promise.all(
    teacherIds.map(async (teacherId) => {
      const { committed, capacity } = await teacherSubjectAssignmentsService.getTeacherWeeklyCommitmentAndCapacity(
        schoolId,
        teacherId,
        academicYearId
      );
      const teacher = await teachersService.getTeacherById(schoolId, teacherId);
      return {
        teacherId,
        teacherName: teacher ? teacher.fullName : teacherId,
        committed,
        capacity,
        overCapacity: committed > capacity,
      };
    })
  );
  return report.sort((a, b) => a.teacherName.localeCompare(b.teacherName));
}

// Invoked by timetable.jobs.js's own runGenerationJob — never called
// synchronously from a controller. Updates the job's own progress fields as
// it proceeds so a concurrent poll reflects real progress.
async function generateTimetable(schoolId, academicYearId, scope, jobId) {
  const timetableService = getService();
  const prisma = require('../../config/database');

  await assertNoNeedsReviewAllocations(schoolId, academicYearId);
  await assertNoTeacherOverCapacity(schoolId, academicYearId);

  const draftVersion = await prisma.$transaction(async (tx) => {
    await repository.acquireSchoolLock(schoolId, tx);
    return timetableService.getOrCreateDraftVersion(schoolId, academicYearId, tx);
  });

  await repository.updateJob(jobId, { timetableVersionId: draftVersion.id, currentPhase: 'Clearing existing Lessons' });

  // Step 2 — clear non-Locked Lessons within scope (never Locked ones,
  // never Lessons outside the scope).
  await repository.archiveNonLockedLessons(draftVersion.id, buildClearFilter(scope));

  const ctx = await buildContext(schoolId);
  const scopeDays = scope.type === 'DAY' ? [scope.dayOfWeek] : null;

  // Seed the in-memory conflict tracker with whatever survived the clearing
  // step above (Locked Lessons, plus anything outside this run's own scope),
  // and count how many of each Assignment's own weekly target those
  // survivors already satisfy.
  const survivors = await repository.listLessonsByVersion(draftVersion.id, { includeArchived: false });
  const alreadySatisfiedCounts = new Map();
  for (const lesson of survivors) {
    const { periods: survivorPeriods } = await getClassPeriods(schoolId, lesson.classId, ctx);
    const survivorPeriod = survivorPeriods.find((p) => p.id === lesson.periodId);
    // relocatable:false — a survivor is either Locked (Hard Constraint #5:
    // repair may never move a Locked Lesson) or simply outside this run's
    // own scope (the scope contract: a CLASS/TEACHER/DAY-scoped regeneration
    // never touches anything outside it) — either way, repair must only ever
    // see it as busy, never as something it may relocate.
    occupySlot(
      ctx,
      {
        lessonId: lesson.id,
        teacherId: lesson.teacherId,
        classId: lesson.classId,
        dayOfWeek: lesson.dayOfWeek,
        periodId: lesson.periodId,
        periodObj: survivorPeriod || null,
        lessonGroupId: lesson.lessonGroupId,
        assignment: null,
        relocatable: false,
      },
      lesson.dayOfWeek,
      lesson.periodId
    );
    alreadySatisfiedCounts.set(
      lesson.teacherSubjectAssignmentId,
      (alreadySatisfiedCounts.get(lesson.teacherSubjectAssignmentId) || 0) + 1
    );
    if (survivorPeriod) {
      await recordSoftPreferenceStats(schoolId, ctx, lesson.classId, lesson.teacherId, lesson.dayOfWeek, survivorPeriod);
    }
  }

  await repository.updateJob(jobId, { currentPhase: 'Resolving required Lessons' });
  const assignments = await resolveScopeAssignments(schoolId, academicYearId, scope);
  const units = await buildUnits(schoolId, academicYearId, assignments, alreadySatisfiedCounts);

  await repository.updateJob(jobId, { totalUnits: units.length, placedUnits: 0, currentPhase: 'Placing Lessons' });

  const missing = [];
  // Parallel to `missing`, one entry per pushed item — the full {unit} the
  // Global Repair Phase below needs and `missing` itself never carried
  // (Requirement: multiple missing instances of the same Assignment, e.g.
  // this school's own F3A Biology missing 2 of 4, must stay distinguishable
  // — the instance counter below is exactly that key).
  const missingEntries = [];
  const missingInstanceCounters = new Map();
  const placedLessons = [];
  let placedCount = 0;
  let repairedCount = 0;
  let globalRepairedCount = 0;

  // Places `unit` at `slot`, persisting the Lesson(s) and updating every
  // in-memory structure the rest of generation (candidate checks, repair,
  // Soft Preference scoring) relies on — shared by both the ordinary
  // most-constrained-first path and the post-repair path below, so a
  // repaired placement is indistinguishable from an ordinary one once done.
  async function placeUnitAtSlot(unit, slot) {
    const lessonGroup = unit.isDouble ? await repository.createLessonGroup(schoolId) : null;
    const baseData = {
      schoolId,
      academicYearId,
      timetableVersionId: draftVersion.id,
      classId: unit.assignment.classId,
      teacherId: unit.assignment.teacherId,
      teacherSubjectAssignmentId: unit.assignment.id,
      dayOfWeek: slot.day,
      status: 'ACTIVE',
    };

    const firstLesson = await repository.createLesson({
      ...baseData,
      periodId: slot.period.id,
      lessonGroupId: lessonGroup ? lessonGroup.id : null,
      sequenceInGroup: lessonGroup ? 1 : null,
    });
    placedLessons.push(firstLesson);
    occupySlot(
      ctx,
      {
        lessonId: firstLesson.id,
        teacherId: unit.assignment.teacherId,
        classId: unit.assignment.classId,
        dayOfWeek: slot.day,
        periodId: slot.period.id,
        periodObj: slot.period,
        lessonGroupId: lessonGroup ? lessonGroup.id : null,
        assignment: unit.assignment,
        relocatable: !lessonGroup,
      },
      slot.day,
      slot.period.id
    );
    await recordSoftPreferenceStats(schoolId, ctx, unit.assignment.classId, unit.assignment.teacherId, slot.day, slot.period);

    if (unit.isDouble) {
      const secondLesson = await repository.createLesson({
        ...baseData,
        periodId: slot.secondPeriod.id,
        lessonGroupId: lessonGroup.id,
        sequenceInGroup: 2,
      });
      placedLessons.push(secondLesson);
      occupySlot(
        ctx,
        {
          lessonId: secondLesson.id,
          teacherId: unit.assignment.teacherId,
          classId: unit.assignment.classId,
          dayOfWeek: slot.day,
          periodId: slot.secondPeriod.id,
          periodObj: slot.secondPeriod,
          lessonGroupId: lessonGroup.id,
          assignment: unit.assignment,
          relocatable: false, // a double period's own two halves are never independently relocatable — see relocateLesson's own lessonGroupId check
        },
        slot.day,
        slot.secondPeriod.id
      );
      await recordSoftPreferenceStats(schoolId, ctx, unit.assignment.classId, unit.assignment.teacherId, slot.day, slot.secondPeriod);
    }

    const teacherDayKey = `${unit.assignment.teacherId}|${slot.day}`;
    ctx.teacherDayCount.set(teacherDayKey, (ctx.teacherDayCount.get(teacherDayKey) || 0) + 1);
    ctx.teacherTotalCount.set(unit.assignment.teacherId, (ctx.teacherTotalCount.get(unit.assignment.teacherId) || 0) + 1);
    const subjectDayKey = `${unit.assignment.subjectId}|${slot.day}`;
    ctx.subjectDayCount.set(subjectDayKey, (ctx.subjectDayCount.get(subjectDayKey) || 0) + 1);

    placedCount += 1;
    await repository.updateJob(jobId, { placedUnits: placedCount });
  }

  // Step 3 — most-constrained-first: candidate counts are recomputed fresh
  // every iteration (busy state changes with every unit already placed or
  // relocated), and every pending unit's own {unit, candidates} pair from
  // this same pass is kept (not discarded) so the winning unit's own
  // candidate-scoring step can reuse it — see scarcityCost/pickBestCandidate
  // — instead of recomputing everyone else's candidates a second time.
  const pending = [...units];
  while (pending.length > 0) {
    let bestIndex = -1;
    let bestCandidates = null;
    const pendingWithCandidates = [];
    for (let i = 0; i < pending.length; i += 1) {
      const candidates = await getCandidateSlots(schoolId, pending[i], ctx, scopeDays);
      pendingWithCandidates.push({ unit: pending[i], candidates });
      if (bestCandidates === null || candidates.length < bestCandidates.length) {
        bestIndex = i;
        bestCandidates = candidates;
      }
    }

    const unit = pending.splice(bestIndex, 1)[0];
    const candidates = bestCandidates;

    if (candidates.length === 0) {
      const repairedSlot = await attemptRepair(schoolId, unit, ctx, scopeDays);
      if (repairedSlot) {
        repairedCount += 1;
        await placeUnitAtSlot(unit, repairedSlot);
        continue;
      }
      missing.push({
        teacherSubjectAssignmentId: unit.assignment.id,
        isDouble: unit.isDouble,
        reason: 'No conflict-free slot remained after bounded repair.',
      });
      const instanceNumber = (missingInstanceCounters.get(unit.assignment.id) || 0) + 1;
      missingInstanceCounters.set(unit.assignment.id, instanceNumber);
      missingEntries.push({ key: `${unit.assignment.id}#${instanceNumber}`, unit });
      continue;
    }

    const teacherPreference = await getTeacherPreference(unit.assignment.teacherId, ctx);
    const best = await pickBestCandidate(schoolId, candidates, unit, ctx, teacherPreference, pendingWithCandidates);
    await placeUnitAtSlot(unit, best);
  }

  // Step 6 — Global Repair Phase. Strictly additive: everything above ran
  // exactly as it does without this phase, producing `missing`/
  // `missingEntries` exactly as it always has. Read-only with respect to
  // the database throughout planGlobalRepair itself — commits below are the
  // first and only writes this phase performs, and only for the winning
  // combination, using the same placeUnitAtSlot/performMove as everywhere
  // else in this function.
  await repository.updateJob(jobId, { currentPhase: 'Global Repair' });
  const baselineLessonsForGlobalRepair = await repository.listLessonsByVersion(draftVersion.id, { includeArchived: false });
  const globalRepairPlan = await planGlobalRepair(
    schoolId,
    academicYearId,
    draftVersion.id,
    missingEntries,
    ctx,
    scopeDays,
    baselineLessonsForGlobalRepair
  );

  const globalRepairCommitted = [];
  if (globalRepairPlan.committedPlans.length > 0) {
    await repository.updateJob(jobId, { currentPhase: 'Committing Global Repair' });
    const commitRecordsByLessonId = new Map();
    for (const record of new Set(ctx.teacherOccupant.values())) commitRecordsByLessonId.set(record.lessonId, record);

    for (const plan of globalRepairPlan.committedPlans) {
      for (const move of plan.moves) {
        const record = commitRecordsByLessonId.get(move.lessonId);
        await performMove(schoolId, ctx, record, { day: move.to.day, period: move.to.period });
      }
      await placeUnitAtSlot(plan.unit, plan.finalSlot);
      globalRepairedCount += 1;
      globalRepairCommitted.push(plan.planId);
    }
  }

  const resolvedByGlobalRepair = new Set(globalRepairPlan.committedPlans.map((p) => p.missingUnitKey));
  const finalMissing = missing.filter((_, idx) => !resolvedByGlobalRepair.has(missingEntries[idx].key));

  await repository.updateJob(jobId, { currentPhase: 'Computing Quality Score' });
  const allActiveLessons = await repository.listLessonsByVersion(draftVersion.id, { includeArchived: false });
  const result = await computeQualityScore(schoolId, academicYearId, draftVersion.id, allActiveLessons);

  return {
    timetableVersionId: draftVersion.id,
    placedCount: placedCount + globalRepairedCount,
    totalUnits: units.length,
    repairedCount,
    missing: finalMissing,
    result,
    globalRepair: {
      attempted: globalRepairPlan.attempted,
      plansGenerated: globalRepairPlan.plansGenerated,
      combinationsEvaluated: globalRepairPlan.combinationsEvaluated,
      committedPlans: globalRepairCommitted,
      unitsResolved: globalRepairedCount,
      lessonsMoved: globalRepairPlan.committedPlans.reduce((sum, p) => sum + p.moves.length, 0),
    },
  };
}

// --- Quality Score / Validation Report (shared between a completed job's
// own result and the standalone on-demand endpoint) ----------------------------
// Architecture Update (Validation Report): missingLessons and
// subjectRequirementSatisfaction are derived directly from persisted state
// (every Active Teacher Subject Assignment's own required weekly periods,
// read from Weekly Subject Allocation, vs. its actual Active Lesson count
// in this Version) rather than a transient generation-run's own
// bookkeeping — this makes the score meaningful when requested on demand
// (e.g. after a manual edit), not only immediately after a generation job
// completes.

// (Missing Lessons diagnostic) Whether any Day+Period exists, right now in
// this Version's own Active Lessons, where both the given Class and the
// given Teacher are simultaneously free — i.e. whether a Missing Lesson
// shortfall is a genuine dead end (every remaining option for this Class is
// already blocked by this Teacher being busy elsewhere, or vice versa,
// meaning something else must move first) or merely a slot the engine's own
// most-constrained-first, non-backtracking order happened not to try
// (meaning simply adding it by hand, or Regenerating, may well work).
async function hasOpenOverlapSlot(schoolId, classId, teacherId, lessons) {
  const cls = await classesService.getClassById(classId);
  if (!cls) return false;
  const [workingDays, periods] = await Promise.all([
    schoolScheduleService.getWorkingDays(schoolId),
    schoolScheduleService.getShiftPeriods(schoolId, cls.shiftId, { status: 'ACTIVE' }),
  ]);
  const teachingPeriods = periods.filter((p) => p.type === 'TEACHING');

  const classBusy = new Set();
  const teacherBusy = new Set();
  for (const lesson of lessons) {
    if (lesson.classId === classId) classBusy.add(`${lesson.dayOfWeek}|${lesson.periodId}`);
    if (lesson.teacherId === teacherId) teacherBusy.add(`${lesson.dayOfWeek}|${lesson.periodId}`);
  }

  for (const day of workingDays) {
    for (const period of teachingPeriods) {
      const key = `${day}|${period.id}`;
      if (!classBusy.has(key) && !teacherBusy.has(key)) return true;
    }
  }
  return false;
}

async function computeQualityScore(schoolId, academicYearId, timetableVersionId, lessons) {
  if (!timetableVersionId) {
    return emptyQualityScore();
  }

  // Teacher/Class conflicts are always 0 for anything this engine placed —
  // Hard Constraints are never violated by construction. A non-zero value
  // here would only be reachable via a bug elsewhere, so this doubles as a
  // self-check on the data, not just a report.
  const teacherSlots = new Set();
  const classSlots = new Set();
  let teacherConflicts = 0;
  let classConflicts = 0;
  for (const lesson of lessons) {
    const tKey = slotKey(lesson.teacherId, lesson.dayOfWeek, lesson.periodId);
    const cKey = slotKey(lesson.classId, lesson.dayOfWeek, lesson.periodId);
    if (teacherSlots.has(tKey)) teacherConflicts += 1;
    else teacherSlots.add(tKey);
    if (classSlots.has(cKey)) classConflicts += 1;
    else classSlots.add(cKey);
  }

  // Subject Requirement Satisfaction + Missing Lessons — every Active
  // Assignment for this school + Academic Year, regardless of whether it
  // has any Lesson yet in this Version at all.
  const { assignments } = await teacherSubjectAssignmentsService.listAssignments(schoolId, { academicYearId, pageSize: 1000 });
  const activeAssignments = assignments.filter((a) => a.status === 'ACTIVE');
  const lessonCountByAssignment = new Map();
  for (const lesson of lessons) {
    lessonCountByAssignment.set(
      lesson.teacherSubjectAssignmentId,
      (lessonCountByAssignment.get(lesson.teacherSubjectAssignmentId) || 0) + 1
    );
  }
  let missingLessons = 0;
  let totalRequiredLessons = 0;
  let satisfiedAssignments = 0;
  const missingDetails = [];
  // Cache — Teacher Weekly Capacity is a single school-wide-per-Teacher
  // figure (Business Rule check, see assertNoTeacherOverCapacity), not
  // per-Assignment; several missingDetails entries can share one Teacher.
  const teacherCapacityCache = new Map();
  for (const assignment of activeAssignments) {
    const allocationLine = await weeklySubjectAllocationsService.getWeeklyPeriodsForAssignment(
      schoolId,
      assignment.classId,
      academicYearId,
      assignment.subjectId
    );
    const target = allocationLine ? allocationLine.weeklyPeriods : 0;
    totalRequiredLessons += target;
    const actual = lessonCountByAssignment.get(assignment.id) || 0;
    if (actual >= target) {
      satisfiedAssignments += 1;
    } else {
      missingLessons += target - actual;
      const [cls, subject, teacher, openSlot] = await Promise.all([
        classesService.getClassById(assignment.classId),
        subjectsService.getSubjectById(assignment.subjectId),
        teachersService.getTeacherById(schoolId, assignment.teacherId),
        hasOpenOverlapSlot(schoolId, assignment.classId, assignment.teacherId, lessons),
      ]);

      if (!teacherCapacityCache.has(assignment.teacherId)) {
        teacherCapacityCache.set(
          assignment.teacherId,
          await teacherSubjectAssignmentsService.getTeacherWeeklyCommitmentAndCapacity(schoolId, assignment.teacherId, academicYearId)
        );
      }
      const { committed, capacity } = teacherCapacityCache.get(assignment.teacherId);
      const teacherWorkloadValid = committed <= capacity;

      missingDetails.push({
        teacherSubjectAssignmentId: assignment.id,
        className: cls ? cls.name : assignment.classId,
        subjectName: subject ? subject.name : assignment.subjectId,
        teacherName: teacher ? teacher.fullName : assignment.teacherId,
        required: target,
        placed: actual,
        missing: target - actual,
        // true: an open Day+Period exists for both right now — adding it by
        // hand (or Regenerating) may resolve it. false: the bounded repair
        // pass (attemptRepair) already tried relocating whatever was
        // blocking every one of this Class's remaining Periods for this
        // Teacher, within its own bounded search, and could not clear one —
        // something else must move first (beyond this pass's own bounded
        // depth/attempts), or this Teacher's own Class load for this
        // Subject should be reduced/shared with another Teacher.
        hasOpenSlot: openSlot,
        // Distinguishes a Teacher workload problem (Business Rule — total
        // committed weekly Periods exceeding their own capacity) from a pure
        // scheduling-feasibility problem (committed periods fit within
        // capacity in aggregate, but no conflict-free Day+Period combination
        // was found for this particular Class+Subject) — see this file's own
        // top-of-file comment on why the two are not the same thing.
        teacherWorkloadValid,
        reason: !teacherWorkloadValid
          ? `Teacher workload: ${teacher ? teacher.fullName : assignment.teacherId} = ${committed}/${capacity} periods/week → OVER CAPACITY.`
          : openSlot
            ? `Timetable feasibility: an open Day+Period exists for both this Class and this Teacher right now — adding it by hand, or Regenerating, may resolve it.`
            : `Timetable feasibility: ${cls ? cls.name : assignment.classId} ${subject ? subject.name : assignment.subjectId} = ${actual}/${target} → ${target - actual} missing. Teacher workload (${committed}/${capacity}) is within capacity — no conflict-free slot remained after bounded repair.`,
      });
    }
  }
  const subjectRequirementSatisfaction =
    activeAssignments.length > 0 ? Math.round((satisfiedAssignments / activeAssignments.length) * 100) : null;

  // Double Period Violations — a Lesson Group is only ever valid when it
  // has exactly two Active members, on the same Day, in consecutive
  // Periods (by that Shift's own active Period Display Order). Anything
  // else (a group missing a member, split across Days, or non-consecutive)
  // is reported, never silently ignored — this is a safety net over manual
  // edits as much as a check on the generator's own output.
  const groupMembers = new Map();
  for (const lesson of lessons) {
    if (!lesson.lessonGroupId) continue;
    if (!groupMembers.has(lesson.lessonGroupId)) groupMembers.set(lesson.lessonGroupId, []);
    groupMembers.get(lesson.lessonGroupId).push(lesson);
  }
  let doublePeriodViolations = 0;
  for (const members of groupMembers.values()) {
    if (members.length !== 2) {
      doublePeriodViolations += 1;
      continue;
    }
    const [a, b] = members;
    if (a.dayOfWeek !== b.dayOfWeek) {
      doublePeriodViolations += 1;
      continue;
    }
    const [periodA, periodB] = await Promise.all([
      schoolScheduleService.getPeriodById(schoolId, a.periodId),
      schoolScheduleService.getPeriodById(schoolId, b.periodId),
    ]);
    if (!periodA || !periodB || Math.abs(periodA.displayOrder - periodB.displayOrder) !== 1) {
      doublePeriodViolations += 1;
    }
  }

  let preferenceMatches = 0;
  let preferenceConsidered = 0;
  const teacherLessonCounts = new Map();
  for (const lesson of lessons) {
    teacherLessonCounts.set(lesson.teacherId, (teacherLessonCounts.get(lesson.teacherId) || 0) + 1);
    const preference = await repository.findTeacherPreference(lesson.teacherId);
    if (preference && Array.isArray(preference.preferredPeriods) && preference.preferredPeriods.length > 0) {
      preferenceConsidered += 1;
      if (preference.preferredPeriods.includes(lesson.periodId)) preferenceMatches += 1;
    }
  }
  const teacherPreferenceSatisfaction =
    preferenceConsidered > 0 ? Math.round((preferenceMatches / preferenceConsidered) * 100) : null;

  const subjectDayCounts = new Map();
  for (const lesson of lessons) {
    const key = `${lesson.teacherSubjectAssignmentId}|${lesson.dayOfWeek}`;
    subjectDayCounts.set(key, (subjectDayCounts.get(key) || 0) + 1);
  }
  const maxPerSubjectDay = subjectDayCounts.size > 0 ? Math.max(...subjectDayCounts.values()) : 0;
  const subjectDistribution =
    subjectDayCounts.size > 0 && lessons.length > 0
      ? Math.round((1 - Math.max(0, maxPerSubjectDay - 1) / lessons.length) * 100)
      : null;

  const counts = [...teacherLessonCounts.values()];
  const workloadBalance =
    counts.length > 1
      ? Math.round((1 - (Math.max(...counts) - Math.min(...counts)) / Math.max(...counts)) * 100)
      : counts.length === 1
        ? 100
        : null;

  // Teacher Gap Score — illustrative proxy: percentage of Teacher/Day
  // combinations whose Lessons occupy a contiguous run of Periods (no gaps).
  const teacherDayPeriods = new Map();
  for (const lesson of lessons) {
    const key = `${lesson.teacherId}|${lesson.dayOfWeek}`;
    if (!teacherDayPeriods.has(key)) teacherDayPeriods.set(key, []);
    const period = await schoolScheduleService.getPeriodById(schoolId, lesson.periodId);
    if (period) teacherDayPeriods.get(key).push(period.displayOrder);
  }
  let gapFreeCount = 0;
  let gapConsideredCount = 0;
  for (const orders of teacherDayPeriods.values()) {
    if (orders.length < 2) continue;
    gapConsideredCount += 1;
    const sorted = [...orders].sort((a, b) => a - b);
    const span = sorted[sorted.length - 1] - sorted[0] + 1;
    if (span === sorted.length) gapFreeCount += 1;
  }
  const teacherGapScore = gapConsideredCount > 0 ? Math.round((gapFreeCount / gapConsideredCount) * 100) : null;

  const missingPenalty = totalRequiredLessons > 0 ? (missingLessons / totalRequiredLessons) * 100 : 0;
  const conflictPenalty = (teacherConflicts + classConflicts + doublePeriodViolations) * 10;
  const componentScores = [
    teacherPreferenceSatisfaction,
    subjectDistribution,
    subjectRequirementSatisfaction,
    teacherGapScore,
    workloadBalance,
  ].filter((v) => v !== null);
  const averageComponent =
    componentScores.length > 0 ? componentScores.reduce((sum, v) => sum + v, 0) / componentScores.length : 100;
  const overallQuality = Math.max(0, Math.round(averageComponent - missingPenalty - conflictPenalty));

  return {
    illustrative: true,
    overallQuality,
    teacherConflicts,
    classConflicts,
    missingLessons,
    missingDetails,
    doublePeriodViolations,
    teacherPreferenceSatisfaction,
    subjectDistribution,
    subjectRequirementSatisfaction,
    teacherGapScore,
    workloadBalance,
    notes: [],
  };
}

module.exports = {
  generateTimetable,
  computeQualityScore,
  emptyQualityScore,
  getTeacherCapacityReport,
  // Test-only surface — the bounded repair search (attemptRepair/
  // relocateLesson) is deliberately tested in isolation from the greedy
  // placement loop's own scoring/ordering (a different concern, not what
  // this surface's own budget-per-candidate fix touches), so tests build a
  // ctx by hand and call these directly rather than going through
  // generateTimetable end-to-end. Not part of the real public interface.
  __testing: {
    buildContext,
    occupySlot,
    getFullDomainSlots,
    attemptRepair,
    relocateLesson,
    slotKey,
    MAX_REPAIR_DEPTH,
    MAX_REPAIR_ATTEMPTS_PER_CANDIDATE,
    MAX_TOTAL_REPAIR_ATTEMPTS_PER_UNIT,
    // Global Repair Phase internals — same test-only-surface rationale as
    // the block above: exercised directly, with a hand-built ctx, so tests
    // aren't hostage to the greedy loop's own scoring/ordering.
    generateCandidatePlansForUnit,
    applyPlanToShadowCtx,
    undoPlanApplication,
    planGlobalRepair,
    summarizeBranch,
    isStrictlyBetter,
    materializeLessonsForScoring,
    MAX_PLANS_PER_UNIT,
    MAX_MISSING_FOR_GLOBAL_REPAIR,
    MAX_COMBINATION_SEARCH_NODES,
  },
};
