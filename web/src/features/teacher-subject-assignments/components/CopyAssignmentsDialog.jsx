import React from 'react';
import { Checkbox, Dialog, Select } from '../../../shared/components';

// Copying is always selective (Business Rule #12) — never "copy everything."
// This dialog loads the source Academic Year's own assignments into a
// checklist only once a source is chosen, submits the explicit selected ids,
// and then shows the backend's own copied-vs-skipped summary — it never
// re-implements the per-candidate eligibility checks itself (Business Rule
// #13), only reflects what the backend returns.
export function CopyAssignmentsDialog({ open, onClose, onCopy, academicYearOptions = [], onLoadSourceAssignments }) {
  const [fromAcademicYearId, setFromAcademicYearId] = React.useState('');
  const [toAcademicYearId, setToAcademicYearId] = React.useState('');
  const [sourceAssignments, setSourceAssignments] = React.useState([]);
  const [selectedIds, setSelectedIds] = React.useState([]);
  const [loadingSource, setLoadingSource] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [result, setResult] = React.useState(null);

  React.useEffect(() => {
    if (open) {
      setFromAcademicYearId('');
      setToAcademicYearId('');
      setSourceAssignments([]);
      setSelectedIds([]);
      setError(null);
      setResult(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (!fromAcademicYearId) {
      setSourceAssignments([]);
      setSelectedIds([]);
      return;
    }
    let cancelled = false;
    setLoadingSource(true);
    onLoadSourceAssignments(fromAcademicYearId)
      .then((assignments) => {
        if (!cancelled) {
          setSourceAssignments(assignments);
          setSelectedIds([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSource(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fromAcademicYearId, onLoadSourceAssignments]);

  const toggleSelected = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleConfirm = async () => {
    setError(null);
    if (selectedIds.length === 0) {
      setError('Select at least one assignment to copy.');
      return;
    }
    setSubmitting(true);
    try {
      const copyResult = await onCopy({ fromAcademicYearId, toAcademicYearId, assignmentIds: selectedIds });
      setResult(copyResult);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const yearOptionsExcluding = (excludeId) => academicYearOptions.filter((o) => o.value !== excludeId);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onConfirm={result ? undefined : handleConfirm}
      title="Copy Assignments to Another Academic Year"
      description="Select which of the source Academic Year's own assignments to copy — each is validated independently; invalid ones are skipped, not rejected as a whole batch."
      confirmLabel={submitting ? 'Copying…' : 'Copy Selected'}
      cancelLabel={result ? 'Close' : 'Cancel'}
    >
      {result ? (
        <div className="flex flex-col gap-3">
          <p className="text-[14px] font-semibold text-navy-900 dark:text-white">
            Copied {result.copied.length}, skipped {result.skipped.length}.
          </p>
          {result.skipped.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-md bg-gray-50 p-3 text-[13px] text-gray-700 dark:bg-navy-800 dark:text-gray-300">
              {result.skipped.map((s) => (
                <li key={s.assignmentId}>{s.reason}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Select
            label="From Academic Year"
            value={fromAcademicYearId}
            onChange={(e) => setFromAcademicYearId(e.target.value)}
            options={[{ value: '', label: 'Choose a source Academic Year' }, ...yearOptionsExcluding(toAcademicYearId)]}
          />
          <Select
            label="To Academic Year"
            value={toAcademicYearId}
            onChange={(e) => setToAcademicYearId(e.target.value)}
            options={[{ value: '', label: 'Choose a target Academic Year' }, ...yearOptionsExcluding(fromAcademicYearId)]}
          />

          {loadingSource ? (
            <p className="text-[13px] text-gray-500 dark:text-gray-400">Loading assignments…</p>
          ) : fromAcademicYearId && sourceAssignments.length === 0 ? (
            <p className="text-[13px] text-gray-500 dark:text-gray-400">This Academic Year has no assignments.</p>
          ) : (
            sourceAssignments.length > 0 && (
              <div className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-md border border-gray-200 p-3 dark:border-navy-700">
                {sourceAssignments.map((a) => (
                  <Checkbox
                    key={a.id}
                    label={`${a.teacherName || a.teacherId} — ${a.subjectName || a.subjectId} — ${a.classAndSectionName || a.classId}`}
                    checked={selectedIds.includes(a.id)}
                    onChange={() => toggleSelected(a.id)}
                  />
                ))}
              </div>
            )
          )}
          {error && <p className="text-[13px] text-danger">{error}</p>}
        </div>
      )}
    </Dialog>
  );
}
