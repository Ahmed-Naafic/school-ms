import React from 'react';
import { Button, Card, Input, Select } from '../../../shared/components';
import { useToast } from '../../../shared/toast/ToastContext';
import { StudentAttendanceList } from '../components/StudentAttendanceList';
import * as attendanceService from '../services/attendance.service';

const CHECKPOINT_OPTIONS = [
  { value: 'BEFORE_BREAK', label: 'Before Break' },
  { value: 'AFTER_BREAK', label: 'After Break' },
];

const CHECKPOINT_HEADING = {
  BEFORE_BREAK: { title: 'BEFORE BREAK', description: 'Attendance for periods before the configured break.' },
  AFTER_BREAK: { title: 'AFTER BREAK', description: 'Attendance for periods after the configured break.' },
};

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

// Business Lifecycle §2-4: a Manager may record Student attendance for any
// Class, per checkpoint. Once recorded, the Manager becomes the source of
// record for the covered Periods (Business Rules #10-11) — this page's own
// "Save" always corrects an existing record rather than re-creating it, so a
// second save never 409s the way a Teacher's create-only path would.
export function ManagerStudentAttendancePage() {
  const { showToast } = useToast();
  const [classes, setClasses] = React.useState([]);
  const [classId, setClassId] = React.useState('');
  const [checkpoint, setCheckpoint] = React.useState('BEFORE_BREAK');
  const [date, setDate] = React.useState(todayDateStr());
  const [view, setView] = React.useState(null);
  const [draft, setDraft] = React.useState({});
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    attendanceService.listClassesForManager().then((data) => {
      setClasses(data);
      if (data.length > 0) setClassId(data[0].id);
    });
  }, []);

  const load = React.useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    try {
      const data = await attendanceService.getManagerCheckpointView(classId, checkpoint, date);
      setView(data);
      const nextDraft = {};
      data.students.forEach((s) => {
        nextDraft[s.studentId] = s.status === 'NOT_RECORDED' ? 'PRESENT' : s.status;
      });
      setDraft(nextDraft);
    } catch (err) {
      showToast({ tone: 'danger', title: 'Could not load checkpoint attendance', description: err.message });
      setView(null);
    } finally {
      setLoading(false);
    }
  }, [classId, checkpoint, date, showToast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleDraftChange = (studentId, status) => {
    setDraft((prev) => ({ ...prev, [studentId]: status }));
  };

  const handleSave = async () => {
    if (!view) return;
    setSaving(true);
    try {
      const toCreate = view.students.filter((s) => s.recordId === null);
      const toCorrect = view.students.filter((s) => s.recordId !== null);

      if (toCreate.length > 0) {
        await attendanceService.recordManagerCheckpointAttendance(
          classId,
          checkpoint,
          date,
          toCreate.map((s) => ({ studentId: s.studentId, status: draft[s.studentId] }))
        );
      }
      for (const s of toCorrect) {
        if (draft[s.studentId] !== s.status) {
          // eslint-disable-next-line no-await-in-loop
          await attendanceService.correctStudentAttendance(s.recordId, draft[s.studentId]);
        }
      }
      showToast({ tone: 'success', title: 'Checkpoint attendance saved' });
      load();
    } catch (err) {
      showToast({ tone: 'danger', title: 'Could not save attendance', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const heading = CHECKPOINT_HEADING[checkpoint];

  return (
    <div className="mx-auto max-w-container px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">Student Attendance</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Record Before Break / After Break attendance for any Class at the school.
        </p>
      </div>

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Class"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            options={classes.map((c) => ({ value: c.id, label: c.name }))}
          />
          <Select
            label="Checkpoint"
            value={checkpoint}
            onChange={(e) => setCheckpoint(e.target.value)}
            options={CHECKPOINT_OPTIONS}
          />
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Button onClick={handleSave} disabled={saving || !view}>
            {saving ? 'Saving…' : 'Save Attendance'}
          </Button>
        </div>
        <div className="mt-4 border-t border-gray-100 pt-3 dark:border-navy-800">
          <p className="font-display text-sm font-bold tracking-wide text-navy-900 dark:text-white">{heading.title}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{heading.description}</p>
          {view && view.coveredPeriods && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Covers: {view.coveredPeriods.map((p) => p.name).join(', ') || 'no Periods configured'}
            </p>
          )}
        </div>
      </Card>

      <Card padding="p-0">
        {loading ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : (
          <StudentAttendanceList students={view ? view.students : []} draft={draft} onChange={handleDraftChange} />
        )}
      </Card>
    </div>
  );
}
