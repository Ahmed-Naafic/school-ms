import React from 'react';
import { Badge, Button, Card, Checkbox, Select } from '../../../shared/components';
import { useAuth } from '../../../shared/auth/AuthContext';
import { useToast } from '../../../shared/toast/ToastContext';
import * as wsaService from '../services/weekly-subject-allocation.service';
import * as gradeLevelsService from '../../classes/services/grade-levels.service';
import * as academicYearsService from '../../academic-years/services/academic-years.service';
import { formatAcademicYearLabel } from '../../academic-years/utils/format-academic-year-label';

// A Timetable-nested sub-feature, positioned in the sidebar just above
// Timetable itself, per docs/03-business/Weekly-Subject-Allocation.md's own
// Architecture Position. This is its own feature module (not physically
// nested under web/src/features/timetable/) — "nested in the menu" is a
// navigation-position decision only, per the Technical Design's own
// Frontend Design section.
//
// Eligible Subjects (and their current Teachers) are auto-populated the
// moment a Grade/Form is selected — scoped to that Grade/Form's own
// Education Level, per the Product Owner's own approved UX improvement.
// The School Admin only ever types a weekly-period count per Subject;
// there is no manual "Add Subject" step, and no free-form Subject picker.
export function WeeklySubjectAllocationPage() {
  const { account } = useAuth();
  const { showToast } = useToast();

  const [gradeLevels, setGradeLevels] = React.useState([]);
  const [academicYears, setAcademicYears] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const [gradeLevelId, setGradeLevelId] = React.useState('');
  const [academicYearId, setAcademicYearId] = React.useState('');

  const [allocationId, setAllocationId] = React.useState(null);
  const [needsReview, setNeedsReview] = React.useState(false);
  const [availablePeriodsAtSave, setAvailablePeriodsAtSave] = React.useState(null);
  const [availablePeriodsNow, setAvailablePeriodsNow] = React.useState(null);
  const [subjectRows, setSubjectRows] = React.useState([]);
  const [loadingAllocation, setLoadingAllocation] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);

  // Other Grade/Forms' own saved allocations for the same Academic Year —
  // lets one Grade/Form's allocation (e.g. F1) be copied as a starting point
  // for another (e.g. F2) instead of always re-entering every Subject's own
  // weekly periods by hand. Copying only pre-fills the rows below; it never
  // saves anything by itself, since the two Grade/Forms' own available
  // periods can differ (different Shifts) and the copied total may need
  // adjusting before it can be saved.
  const [otherAllocations, setOtherAllocations] = React.useState([]);
  const [copyFromId, setCopyFromId] = React.useState('');

  const gradeLevelOptions = React.useMemo(
    () => gradeLevels.filter((gl) => gl.status === 'ACTIVE').map((gl) => ({ value: gl.id, label: gl.name })),
    [gradeLevels]
  );
  const academicYearOptions = React.useMemo(
    () =>
      academicYears
        .filter((ay) => ay.status === 'ACTIVE')
        .map((ay) => ({ value: ay.id, label: formatAcademicYearLabel(ay.startDate, ay.endDate) })),
    [academicYears]
  );

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [gradeLevelList, academicYearList] = await Promise.all([
          gradeLevelsService.listGradeLevels(),
          academicYearsService.listAcademicYears(),
        ]);
        setGradeLevels(gradeLevelList);
        setAcademicYears(academicYearList);

        const current = academicYearList.find((ay) => ay.isCurrent);
        if (current) setAcademicYearId(current.id);

        const firstGradeLevel = gradeLevelList.find((gl) => gl.status === 'ACTIVE');
        if (firstGradeLevel) setGradeLevelId(firstGradeLevel.id);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.schoolId]);

  // Re-resolves whenever the Grade/Form or Academic Year selection changes:
  // builds the row list from every eligible Subject (Education-Level-scoped,
  // with its own current Teachers), then overlays whatever the School Admin
  // already saved for this natural key (if anything).
  React.useEffect(() => {
    if (!gradeLevelId || !academicYearId) return;

    (async () => {
      setLoadingAllocation(true);
      setError(null);
      setCopyFromId('');
      try {
        const [eligibleSubjects, existing, allForYear] = await Promise.all([
          wsaService.listEligibleSubjects(gradeLevelId, academicYearId),
          wsaService.listAllocations({ gradeLevelId, academicYearId }),
          wsaService.listAllocations({ academicYearId }),
        ]);

        setOtherAllocations(allForYear.filter((a) => a.gradeLevelId !== gradeLevelId));

        const allocation = existing[0] || null;
        const savedBySubjectId = new Map((allocation?.subjects || []).map((s) => [s.subjectId, s]));

        setSubjectRows(
          eligibleSubjects.map((subject) => {
            const saved = savedBySubjectId.get(subject.subjectId);
            return {
              subjectId: subject.subjectId,
              subjectName: subject.subjectName,
              teacherNames: subject.teacherNames,
              weeklyPeriods: saved ? String(saved.weeklyPeriods) : '',
              doublePeriodRequired: saved ? saved.doublePeriodRequired : false,
            };
          })
        );

        if (allocation) {
          setAllocationId(allocation.id);
          setNeedsReview(allocation.needsReview);
          setAvailablePeriodsAtSave(allocation.availablePeriodsAtSave);
          setAvailablePeriodsNow(allocation.availablePeriodsNow);
        } else {
          const preview = await wsaService.getAvailablePeriodsPreview(gradeLevelId);
          setAllocationId(null);
          setNeedsReview(false);
          setAvailablePeriodsAtSave(null);
          setAvailablePeriodsNow(preview.availablePeriods);
        }
      } finally {
        setLoadingAllocation(false);
      }
    })();
  }, [gradeLevelId, academicYearId]);

  // Only Subjects the School Admin actually entered a positive period count
  // for are ever submitted — an eligible Subject left blank simply isn't
  // part of this allocation, never a zero-period row.
  const filledRows = subjectRows.filter((row) => Number(row.weeklyPeriods) > 0);
  const runningTotal = filledRows.reduce((sum, row) => sum + Number(row.weeklyPeriods), 0);
  const target = availablePeriodsNow;
  const totalMatches = target !== null && runningTotal === target;
  const hasInvalidEntry = subjectRows.some(
    (row) => row.weeklyPeriods !== '' && !Number.isInteger(Number(row.weeklyPeriods))
  );
  const canSave = target !== null && filledRows.length > 0 && totalMatches && !hasInvalidEntry;

  const updateRow = (subjectId, patch) => {
    setSubjectRows((prev) => prev.map((row) => (row.subjectId === subjectId ? { ...row, ...patch } : row)));
  };

  // Overwrites every row's own weekly-periods/double-period value from the
  // chosen source Grade/Form's own saved allocation — a Subject the source
  // doesn't have a saved line for is cleared, exactly as if it had been
  // typed by hand to match. Nothing is submitted to the backend by this
  // action; the School Admin still reviews and clicks Save Allocation
  // themselves, since a mismatched total (different Shift capacity between
  // the two Grade/Forms) needs their own adjustment first.
  const handleCopyFrom = () => {
    const source = otherAllocations.find((a) => a.gradeLevelId === copyFromId);
    if (!source) return;
    const sourceBySubjectId = new Map(source.subjects.map((s) => [s.subjectId, s]));
    setSubjectRows((prev) =>
      prev.map((row) => {
        const copied = sourceBySubjectId.get(row.subjectId);
        return {
          ...row,
          weeklyPeriods: copied ? String(copied.weeklyPeriods) : '',
          doublePeriodRequired: copied ? copied.doublePeriodRequired : false,
        };
      })
    );
    const sourceGradeLevel = gradeLevels.find((gl) => gl.id === copyFromId);
    showToast({
      tone: 'success',
      title: `Copied from ${sourceGradeLevel ? sourceGradeLevel.name : 'the other Grade/Form'}`,
      description: 'Review the totals below, then Save Allocation.',
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = filledRows.map((row) => ({
        subjectId: row.subjectId,
        weeklyPeriods: Number(row.weeklyPeriods),
        doublePeriodRequired: Boolean(row.doublePeriodRequired),
      }));

      const saved = allocationId
        ? await wsaService.correctAllocation(allocationId, { subjects: payload })
        : await wsaService.createAllocation({ gradeLevelId, academicYearId, subjects: payload });

      setAllocationId(saved.id);
      setNeedsReview(saved.needsReview);
      setAvailablePeriodsAtSave(saved.availablePeriodsAtSave);
      setAvailablePeriodsNow(saved.availablePeriodsNow);
      showToast({ tone: 'success', title: allocationId ? 'Allocation updated' : 'Allocation created' });
    } catch (err) {
      setError(err.message);
      showToast({ tone: 'danger', title: 'Save failed', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-container px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">Weekly Subject Allocation</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          How the available weekly teaching periods are distributed across Subjects, per Grade/Form, per Academic
          Year. The available figure is always calculated live from School Schedule Management and Class
          Management — never entered directly.
        </p>
      </div>

      <Card className="mb-6">
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              label="Grade/Form"
              value={gradeLevelId}
              onChange={(e) => setGradeLevelId(e.target.value)}
              options={gradeLevelOptions}
            />
            <Select
              label="Academic Year"
              value={academicYearId}
              onChange={(e) => setAcademicYearId(e.target.value)}
              options={academicYearOptions}
            />
          </div>
        )}
      </Card>

      {!loading && gradeLevelId && academicYearId && (
        <Card padding="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-0">
            <div>
              <h2 className="font-display text-lg font-bold text-navy-900 dark:text-white">Allocation</h2>
              {loadingAllocation ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Calculating…</p>
              ) : target === null ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  This Grade/Form has no Classes yet — nothing to calculate available periods against.
                </p>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Available weekly teaching periods: <span className="font-bold text-navy-900 dark:text-white">{target}</span>
                  {' · '}Currently allocated:{' '}
                  <span className={totalMatches ? 'font-bold text-success' : 'font-bold text-danger'}>{runningTotal}</span>
                </p>
              )}
            </div>
            {needsReview && (
              <Badge tone="danger">
                Needs Review — available periods changed to {availablePeriodsNow} (last saved: {availablePeriodsAtSave})
              </Badge>
            )}
          </div>

          {!loadingAllocation && otherAllocations.length > 0 && subjectRows.length > 0 && (
            <div className="flex flex-wrap items-end gap-3 px-5 pt-4">
              <div className="min-w-[220px]">
                <Select
                  label="Copy allocation from another Grade/Form"
                  value={copyFromId}
                  onChange={(e) => setCopyFromId(e.target.value)}
                  options={[
                    { value: '', label: 'Select…' },
                    ...otherAllocations.map((a) => ({
                      value: a.gradeLevelId,
                      label: gradeLevels.find((gl) => gl.id === a.gradeLevelId)?.name || a.gradeLevelId,
                    })),
                  ]}
                />
              </div>
              <Button variant="outline" onClick={handleCopyFrom} disabled={!copyFromId}>
                Copy
              </Button>
            </div>
          )}

          <div className="p-5">
            {loadingAllocation ? null : subjectRows.length === 0 ? (
              <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                No Subjects are assigned to your school at this Grade/Form's own Education Level yet. Assign some via
                the Subjects page first.
              </p>
            ) : (
              <div className="mb-4 flex flex-col gap-2">
                <div className="grid grid-cols-[1fr_1fr_120px_120px] gap-3 px-1 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <span>Subject</span>
                  <span>Current Teacher(s)</span>
                  <span>Weekly Periods</span>
                  <span>Double Period</span>
                </div>
                {subjectRows.map((row) => (
                  <div
                    key={row.subjectId}
                    className="grid grid-cols-[1fr_1fr_120px_120px] items-center gap-3 rounded-md border border-gray-200 p-3 dark:border-navy-700"
                  >
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{row.subjectName}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {row.teacherNames.length > 0 ? row.teacherNames.join(', ') : 'Not yet assigned'}
                    </span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-[10px] text-base text-gray-900 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100 dark:border-gray-500 dark:bg-navy-900 dark:text-gray-100 dark:focus:ring-teal-500/30"
                      placeholder="0"
                      value={row.weeklyPeriods}
                      onChange={(e) => updateRow(row.subjectId, { weeklyPeriods: e.target.value })}
                    />
                    <Checkbox
                      label="Double"
                      checked={row.doublePeriodRequired}
                      onChange={(checked) => updateRow(row.subjectId, { doublePeriodRequired: checked })}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handleSave} disabled={!canSave || saving}>
                {saving ? 'Saving…' : 'Save Allocation'}
              </Button>
              {error && <p className="text-[13px] text-danger">{error}</p>}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
