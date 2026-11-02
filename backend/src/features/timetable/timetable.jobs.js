// Background job mechanism for Timetable generation (Architecture Update —
// Generation-First). No job queue/worker infrastructure exists anywhere in
// this project — this is deliberately the simplest mechanism that fits the
// current single-process architecture: a DB-persisted status/progress row,
// updated by an async function fired via setImmediate and never awaited by
// the request handler, per Technical Design's own Job Execution Model.
// A process crash mid-run leaves a job stuck at RUNNING in the database
// forever (nothing marks it FAILED on its own) — recovered from lazily, not
// proactively: assertNoActiveGeneration below treats a QUEUED/RUNNING job
// with no progress in over STALE_JOB_THRESHOLD_MS as abandoned the next
// time anyone tries to start a new generation for that School, and
// auto-fails it before proceeding.
const repository = require('./timetable.repository');
const { recordAuditEvent } = require('../../shared/audit');
const { ConflictError } = require('../../shared/errors');

// Lazily required — timetable.generation.js requires timetable.service.js,
// which itself lazily requires timetable.generation.js for the Quality
// Score delegation; requiring the generation engine at this file's own top
// level is safe (jobs -> generation -> service is a one-way chain, service
// never requires jobs), but kept lazy anyway for consistency with the
// established "avoid fragile load-order assumptions" convention.
function getGenerationEngine() {
  return require('./timetable.generation');
}

// A QUEUED/RUNNING job with no progress update in this long is treated as
// abandoned, never as still legitimately in flight — the known "process
// crash mid-run leaves a job stuck at RUNNING forever" gap this file's own
// top comment already calls out (Accepted Technical Debt).
// Set low deliberately for local dev testing (fast recovery from stuck
// jobs). A real run can legitimately go longer than this between phase
// updates, so raise this back to several minutes before this leaves local
// dev — a threshold this low will misclassify a genuinely running job as
// abandoned and let a second one start over it.
const STALE_JOB_THRESHOLD_MS = 30 * 1000;

// Refuses to start a second concurrent run for a School that already has
// one in flight — every run shares the same Draft Version and the same
// school-scoped advisory lock (acquireSchoolLock), so two overlapping runs
// don't just waste work, they clear and rebuild each other's Lessons out
// from under one another (exactly what happened before this guard existed:
// repeated "Generate" clicks each started their own job, and the pile-up of
// simultaneous clear/rebuild cycles corrupted the shared Draft). A stale
// job (see STALE_JOB_THRESHOLD_MS) is auto-marked FAILED and never blocks a
// fresh attempt — this is what actually recovers from a crashed process,
// rather than leaving the School permanently unable to regenerate.
async function assertNoActiveGeneration(schoolId) {
  const active = await repository.findActiveJobForSchool(schoolId);
  if (!active) return;

  const ageMs = Date.now() - new Date(active.updatedAt).getTime();
  if (ageMs > STALE_JOB_THRESHOLD_MS) {
    await repository.updateJob(active.id, {
      status: 'FAILED',
      errorMessage: `Abandoned — no progress for over ${Math.round(STALE_JOB_THRESHOLD_MS / 60000)} minutes (likely an interrupted process). Superseded by a new generation request.`,
      completedAt: new Date(),
    });
    return;
  }

  throw new ConflictError(
    'A Timetable generation is already in progress for this School. Wait for it to finish (or fail) before starting another.'
  );
}

// Starts a generation job and returns immediately — the actual work is
// fired via setImmediate, not awaited, so the HTTP response has already
// been sent by the time it runs. School-Admin-only, tenant-scoped by the
// caller (the controller resolves schoolId from the token).
async function startGenerationJob(schoolId, academicYearId, scope, actingUser) {
  await assertNoActiveGeneration(schoolId);

  const job = await repository.createJob({
    schoolId,
    academicYearId,
    status: 'QUEUED',
    scope,
    requestedById: actingUser.id,
  });

  await recordAuditEvent({
    schoolId,
    userId: actingUser.id,
    action: 'TIMETABLE_GENERATION_STARTED',
    metadata: { jobId: job.id, scope },
  });

  setImmediate(() => {
    runGenerationJob(job.id).catch(() => {
      // runGenerationJob's own try/catch already persists a FAILED status
      // with errorMessage before this could ever throw further — this
      // outer catch exists only so an unforeseen error in that persistence
      // step itself can never surface as an unhandled promise rejection.
    });
  });

  return job;
}

async function runGenerationJob(jobId) {
  const job = await repository.findJobById(jobId);
  if (!job) return;

  await repository.updateJob(jobId, { status: 'RUNNING', startedAt: new Date(), currentPhase: 'Starting' });

  try {
    const engine = getGenerationEngine();
    const outcome = await engine.generateTimetable(job.schoolId, job.academicYearId, job.scope, jobId);

    await repository.updateJob(jobId, {
      status: 'COMPLETED',
      timetableVersionId: outcome.timetableVersionId,
      result: outcome.result,
      completedAt: new Date(),
      currentPhase: 'Completed',
    });

    await recordAuditEvent({
      schoolId: job.schoolId,
      userId: job.requestedById,
      action: 'TIMETABLE_GENERATION_COMPLETED',
      metadata: { jobId, placedUnits: outcome.placedCount, totalUnits: outcome.totalUnits, missing: outcome.missing.length },
    });
  } catch (error) {
    await repository.updateJob(jobId, {
      status: 'FAILED',
      errorMessage: error.message || 'Generation failed',
      completedAt: new Date(),
    });

    await recordAuditEvent({
      schoolId: job.schoolId,
      userId: job.requestedById,
      action: 'TIMETABLE_GENERATION_FAILED',
      metadata: { jobId, errorMessage: error.message },
    });
  }
}

async function getJob(schoolId, jobId) {
  const job = await repository.findJobById(jobId);
  if (!job || job.schoolId !== schoolId) return null;
  return job;
}

async function listJobs(schoolId) {
  return repository.listJobsBySchool(schoolId);
}

module.exports = {
  startGenerationJob,
  runGenerationJob,
  getJob,
  listJobs,
};
