import React from 'react';
import { Badge, Dialog } from '../../../shared/components';
import * as timetableService from '../services/timetable.service';

// Architecture Update (Generation-First) — the primary "Generate" workflow.
// Generation always targets the entire school — Teacher/Class are not
// generation options at all (those exist only as future, separate
// Regenerate tools), so this dialog starts the job the moment it opens,
// with no configuration step, then polls until it completes or fails,
// finally showing a full Validation Report so the Administrator never has
// to wonder whether the result is trustworthy.
export function GenerateTimetableDialog({ open, onClose, onGenerated, classCount, teacherCount }) {
  const [phase, setPhase] = React.useState('running'); // running | done | error
  const [job, setJob] = React.useState(null);
  const [error, setError] = React.useState(null);
  const pollRef = React.useRef(null);
  const startedRef = React.useRef(false);

  React.useEffect(() => {
    if (!open) {
      startedRef.current = false;
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    setPhase('running');
    setJob({ status: 'QUEUED', totalUnits: 0, placedUnits: 0 });
    setError(null);
    start();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open]);

  const start = async () => {
    try {
      const { jobId } = await timetableService.startGeneration({ type: 'ALL' });
      pollRef.current = setInterval(async () => {
        try {
          const latest = await timetableService.getGenerationJob(jobId);
          setJob(latest);
          if (latest.status === 'COMPLETED' || latest.status === 'FAILED') {
            clearInterval(pollRef.current);
            setPhase(latest.status === 'COMPLETED' ? 'done' : 'error');
          }
        } catch (err) {
          clearInterval(pollRef.current);
          setError(err.message);
          setPhase('error');
        }
      }, 1000);
    } catch (err) {
      setError(err.message);
      setPhase('error');
    }
  };

  const handleClose = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (phase === 'done') onGenerated();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Generate Timetable — Entire School"
      cancelLabel={phase === 'done' || phase === 'error' ? 'Close' : 'Cancel'}
    >
      {phase === 'running' && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-gray-700 dark:text-gray-300">{job && job.currentPhase ? job.currentPhase : 'Starting…'}</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-navy-800">
            <div
              className="h-full bg-brand-600 transition-all"
              style={{ width: `${job && job.totalUnits ? Math.round((job.placedUnits / job.totalUnits) * 100) : 0}%` }}
            />
          </div>
          <p className="text-[12px] text-gray-500 dark:text-gray-400">
            {job ? `${job.placedUnits} of ${job.totalUnits} required Lessons placed` : 'Queued…'}
          </p>
        </div>
      )}

      {phase === 'done' && job && job.result && (
        <div className="flex flex-col gap-3 text-[13px]">
          <p className="font-display text-base font-bold text-navy-900 dark:text-white">
            Validation Report — Overall Quality: {job.result.overallQuality ?? '—'}%
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <ReportRow label="Classes" value={classCount} />
            <ReportRow label="Teachers" value={teacherCount} />
            <ReportRow label="Required Lessons Placed" value={`${job.placedUnits} / ${job.totalUnits}`} />
            <ReportRow label="Teacher Conflicts" value={job.result.teacherConflicts} tone={job.result.teacherConflicts > 0 ? 'danger' : 'success'} />
            <ReportRow label="Class Conflicts" value={job.result.classConflicts} tone={job.result.classConflicts > 0 ? 'danger' : 'success'} />
            <ReportRow label="Missing Lessons" value={job.result.missingLessons} tone={job.result.missingLessons > 0 ? 'warning' : 'success'} />
            <ReportRow
              label="Double Period Violations"
              value={job.result.doublePeriodViolations}
              tone={job.result.doublePeriodViolations > 0 ? 'danger' : 'success'}
            />
            <ReportRow label="Teacher Preference Satisfaction" value={fmtPct(job.result.teacherPreferenceSatisfaction)} />
            <ReportRow label="Subject Requirement Satisfaction" value={fmtPct(job.result.subjectRequirementSatisfaction)} />
            <ReportRow label="Subject Distribution" value={fmtPct(job.result.subjectDistribution)} />
            <ReportRow label="Teacher Gap Score" value={fmtPct(job.result.teacherGapScore)} />
            <ReportRow label="Workload Balance" value={fmtPct(job.result.workloadBalance)} />
          </dl>

          {job.result.missingDetails && job.result.missingDetails.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-md border border-warning/30 bg-warning/5 p-3">
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                Why these {job.result.missingLessons} Lesson{job.result.missingLessons === 1 ? ' is' : 's are'} missing
              </p>
              <div className="max-h-[180px] overflow-auto">
                <table className="w-full min-w-[420px] text-left text-[12px]">
                  <thead>
                    <tr className="text-gray-500 dark:text-gray-400">
                      <th className="py-1 pr-2 font-semibold">Class</th>
                      <th className="py-1 pr-2 font-semibold">Subject</th>
                      <th className="py-1 pr-2 font-semibold">Teacher</th>
                      <th className="py-1 pr-2 font-semibold">Missing</th>
                      <th className="py-1 font-semibold">Fixable now?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.result.missingDetails.map((d) => (
                      <tr key={d.teacherSubjectAssignmentId} className="border-t border-gray-100 dark:border-navy-800">
                        <td className="py-1 pr-2 text-gray-900 dark:text-gray-100">{d.className}</td>
                        <td className="py-1 pr-2 text-gray-700 dark:text-gray-300">{d.subjectName}</td>
                        <td className="py-1 pr-2 text-gray-700 dark:text-gray-300">{d.teacherName}</td>
                        <td className="py-1 pr-2 text-gray-700 dark:text-gray-300">{d.missing}</td>
                        <td className="py-1">
                          <Badge tone={d.hasOpenSlot ? 'success' : 'danger'}>{d.hasOpenSlot ? 'Yes' : 'No'}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11.5px] text-gray-500 dark:text-gray-400">
                <strong>"No"</strong> means this Teacher is already busy in another Class at every remaining open Period for
                this Class — reassign the Subject to a different Teacher, or free up Periods elsewhere, before it can be
                placed. <strong>"Yes"</strong> means an open Period genuinely exists right now — add it manually in Edit
                Mode below, or Regenerate.
              </p>
            </div>
          )}

          <p className="text-[12px] text-gray-500 dark:text-gray-400">
            Illustrative — review the Draft below and adjust as needed before publishing.
          </p>
        </div>
      )}

      {phase === 'error' && (
        <p className="text-[13px] text-danger">Generation failed{error ? `: ${error}` : job && job.errorMessage ? `: ${job.errorMessage}` : '.'}</p>
      )}
    </Dialog>
  );
}

function fmtPct(value) {
  return value === null || value === undefined ? '—' : `${value}%`;
}

const TONE_CLASSES = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

function ReportRow({ label, value, tone }) {
  return (
    <>
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className={['text-right font-semibold', tone ? TONE_CLASSES[tone] : 'text-gray-900 dark:text-gray-100'].join(' ')}>
        {value ?? '—'}
      </dd>
    </>
  );
}
