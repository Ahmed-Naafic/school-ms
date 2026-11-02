import React from 'react';
import { Badge, Button, Card, Input, Select, Switch } from '../../../shared/components';
import { useToast } from '../../../shared/toast/ToastContext';
import * as timetableService from '../services/timetable.service';
import * as teachersService from '../../teachers/services/teachers.service';

const GAP_OPTIONS = [
  { value: 'NO_PREFERENCE', label: 'No preference' },
  { value: 'MINIMIZE', label: 'Minimize gaps' },
  { value: 'ALLOW', label: 'Gaps are fine' },
];

// School Admin: school-wide optimization priorities, a Teacher's own
// scheduling preference (picked from a dropdown), and the illustrative
// Quality Score. All four are genuinely read by the generation engine's own
// Soft Preference scoring (Backend Design's Generation Engine subsection) —
// they influence which of several Hard-Constraint-satisfying slots is
// chosen, but never which Lessons get placed at all, and may be overridden
// whenever satisfying a Hard Constraint requires it.
export function TimetableSettingsPage() {
  const { showToast } = useToast();
  const [settings, setSettings] = React.useState(null);
  const [qualityScore, setQualityScore] = React.useState(null);
  const [teachers, setTeachers] = React.useState([]);
  const [selectedTeacherId, setSelectedTeacherId] = React.useState('');
  const [preference, setPreference] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [savingSettings, setSavingSettings] = React.useState(false);
  const [savingPreference, setSavingPreference] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [settingsResult, scoreResult, teacherList] = await Promise.all([
        timetableService.getOptimizationSettings(),
        timetableService.getQualityScore(),
        teachersService.listTeachers({}),
      ]);
      // Only these four fields are ever editable/saveable here — the raw
      // GET response also carries id/schoolId/createdAt/updatedAt, which
      // the backend's own Guard-by-Construction validation rejects outright
      // if echoed back on save, so they're never kept in this page's state.
      setSettings({
        balanceTeacherWorkloads: settingsResult ? settingsResult.balanceTeacherWorkloads : false,
        balanceFirstLastPeriods: settingsResult ? settingsResult.balanceFirstLastPeriods : false,
        minimizeTeacherGaps: settingsResult ? settingsResult.minimizeTeacherGaps : false,
        distributeSubjectsFairly: settingsResult ? settingsResult.distributeSubjectsFairly : false,
      });
      setQualityScore(scoreResult);
      setTeachers(teacherList.filter((t) => t.employmentStatus === 'ACTIVE'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (!selectedTeacherId) {
      setPreference(null);
      return;
    }
    (async () => {
      const result = await timetableService.getTeacherPreference(selectedTeacherId);
      setPreference(
        result || { maxLessonsPerDay: '', maxConsecutiveLessons: '', gapPreference: 'NO_PREFERENCE' }
      );
    })();
  }, [selectedTeacherId]);

  const toggleSetting = (key) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await timetableService.updateOptimizationSettings(settings);
      showToast({ tone: 'success', title: 'Optimization Settings saved' });
    } catch (err) {
      showToast({ tone: 'danger', title: 'Save failed', description: err.message });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSavePreference = async () => {
    setSavingPreference(true);
    try {
      await timetableService.updateTeacherPreference(selectedTeacherId, {
        maxLessonsPerDay: preference.maxLessonsPerDay === '' ? null : Number(preference.maxLessonsPerDay),
        maxConsecutiveLessons:
          preference.maxConsecutiveLessons === '' ? null : Number(preference.maxConsecutiveLessons),
        gapPreference: preference.gapPreference || 'NO_PREFERENCE',
      });
      showToast({ tone: 'success', title: 'Teacher preference saved' });
    } catch (err) {
      showToast({ tone: 'danger', title: 'Save failed', description: err.message });
    } finally {
      setSavingPreference(false);
    }
  };

  if (loading || !settings) {
    return <p className="p-8 text-sm text-gray-500 dark:text-gray-400">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-container px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">Timetable Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          School-wide optimization priorities and Teacher preferences — these guide Generate Timetable's own choices
          (which of several equally-valid slots it prefers), but never override a Hard Constraint and never change an
          already-generated Timetable on their own. Save your changes, then Generate again for them to take effect.
        </p>
      </div>

      <Card className="mb-6">
        <h2 className="mb-3 font-display text-lg font-bold text-navy-900 dark:text-white">School Optimization Priorities</h2>
        <div className="flex flex-col gap-3">
          <Switch
            label="Balance Teacher workloads"
            checked={settings.balanceTeacherWorkloads}
            onChange={() => toggleSetting('balanceTeacherWorkloads')}
          />
          <Switch
            label="Balance first and last Periods"
            checked={settings.balanceFirstLastPeriods}
            onChange={() => toggleSetting('balanceFirstLastPeriods')}
          />
          <Switch
            label="Minimize Teacher gaps"
            checked={settings.minimizeTeacherGaps}
            onChange={() => toggleSetting('minimizeTeacherGaps')}
          />
          <Switch
            label="Distribute Subjects fairly across the week"
            checked={settings.distributeSubjectsFairly}
            onChange={() => toggleSetting('distributeSubjectsFairly')}
          />
          <Button onClick={handleSaveSettings} disabled={savingSettings} className="self-start">
            {savingSettings ? 'Saving…' : 'Save Priorities'}
          </Button>
        </div>
      </Card>

      <Card className="mb-6">
        <h2 className="mb-3 font-display text-lg font-bold text-navy-900 dark:text-white">Teacher Preference</h2>
        <Select
          label="Teacher"
          options={[{ value: '', label: 'Select a Teacher…' }, ...teachers.map((t) => ({ value: t.id, label: t.fullName }))]}
          value={selectedTeacherId}
          onChange={(e) => setSelectedTeacherId(e.target.value)}
        />
        {preference && (
          <div className="mt-4 flex flex-col gap-3">
            <Input
              label="Maximum Lessons per Day"
              type="number"
              min="1"
              value={preference.maxLessonsPerDay ?? ''}
              onChange={(e) => setPreference({ ...preference, maxLessonsPerDay: e.target.value })}
            />
            <Input
              label="Maximum Consecutive Lessons"
              type="number"
              min="1"
              value={preference.maxConsecutiveLessons ?? ''}
              onChange={(e) => setPreference({ ...preference, maxConsecutiveLessons: e.target.value })}
            />
            <Select
              label="Gap Preference"
              options={GAP_OPTIONS}
              value={preference.gapPreference || 'NO_PREFERENCE'}
              onChange={(e) => setPreference({ ...preference, gapPreference: e.target.value })}
            />
            <Button onClick={handleSavePreference} disabled={savingPreference} className="self-start">
              {savingPreference ? 'Saving…' : 'Save Teacher Preference'}
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="font-display text-lg font-bold text-navy-900 dark:text-white">Timetable Quality Score</h2>
          <Badge tone="highlight">Illustrative</Badge>
        </div>
        {qualityScore && qualityScore.overallQuality === null ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{(qualityScore.notes || [])[0] || 'No score available yet.'}</p>
        ) : (
          qualityScore && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <span className="font-display text-3xl font-bold text-navy-900 dark:text-white">{qualityScore.overallQuality}%</span>{' '}
                overall — a rough, illustrative diagnostic combining Missing Lessons, conflicts, and how well the current
                Draft matches Teacher/Subject preferences and school-wide priorities. It never blocks a save.
              </p>
              {qualityScore.missingLessons > 0 && (
                <div className="flex flex-col gap-1.5 rounded-md border border-warning/30 bg-warning/5 p-3">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {qualityScore.missingLessons} Lesson{qualityScore.missingLessons === 1 ? '' : 's'} still missing
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
                        {(qualityScore.missingDetails || []).map((d) => (
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
                    <strong>"No"</strong> means this Teacher is already busy in another Class at every remaining open Period
                    for this Class — reassign the Subject to a different Teacher, or free up Periods elsewhere.{' '}
                    <strong>"Yes"</strong> means an open Period genuinely exists right now — add it manually in Master
                    Timetable's Edit Mode, or Regenerate.
                  </p>
                </div>
              )}
            </div>
          )
        )}
      </Card>
    </div>
  );
}
