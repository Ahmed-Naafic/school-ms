import React from 'react';
import { Button, Card } from '../../../shared/components';
import { useToast } from '../../../shared/toast/ToastContext';
import { StudentAttendanceList } from '../components/StudentAttendanceList';
import * as attendanceService from '../services/attendance.service';

const CHECKPOINT_LABEL = { MANAGER_BEFORE_BREAK: 'Before Break', MANAGER_AFTER_BREAK: 'After Break' };

// Business Lifecycle §1: the Teacher never manually picks Class/Subject/
// Period — the backend resolves the current lesson entirely from the
// Timetable and School Schedule, per Business Rules #3-4. This page only
// ever renders whatever the backend already decided.
export function TeacherAttendancePage() {
  const { showToast } = useToast();
  const [view, setView] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [draft, setDraft] = React.useState({});
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await attendanceService.getTeacherCurrentLesson();
      setView(data);
      const nextDraft = {};
      data.students.forEach((s) => {
        nextDraft[s.studentId] = s.status === 'NOT_RECORDED' ? 'PRESENT' : s.status;
      });
      setDraft(nextDraft);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleDraftChange = (studentId, status) => {
    setDraft((prev) => ({ ...prev, [studentId]: status }));
  };

  const handleSave = async () => {
    if (!view || !view.lesson) return;
    setSaving(true);
    try {
      const toCreate = view.students.filter((s) => !s.locked && s.recordId === null);
      const toEdit = view.students.filter((s) => !s.locked && s.recordId !== null);

      if (toCreate.length > 0) {
        await attendanceService.recordTeacherAttendance(
          view.lesson.id,
          view.date,
          toCreate.map((s) => ({ studentId: s.studentId, status: draft[s.studentId] }))
        );
      }
      if (toEdit.length > 0) {
        await attendanceService.editTeacherAttendance(
          view.lesson.id,
          view.date,
          toEdit.map((s) => ({ studentId: s.studentId, status: draft[s.studentId] }))
        );
      }
      showToast({ tone: 'success', title: 'Attendance saved' });
      load();
    } catch (err) {
      showToast({ tone: 'danger', title: 'Could not save attendance', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  // Section H's own "locked" flag is per-student, not per-view — but a
  // checkpoint lock always covers the whole Period at once (Technical
  // Design's Teacher-lock mechanism), so every locked student here shares
  // the same source. Only what the API already returns is shown — no
  // Manager name or timestamp, since the Teacher-view endpoint doesn't
  // expose either (out of scope for this UI-only change to surface).
  const lockedStudent = view?.students.find((s) => s.locked);
  const checkpointLabel = lockedStudent ? CHECKPOINT_LABEL[lockedStudent.source] : null;

  return (
    <div className="mx-auto max-w-container px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">Student Attendance</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Your current lesson's attendance, automatically determined from the Timetable.
        </p>
      </div>

      {loading ? (
        <Card>
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        </Card>
      ) : !view || !view.lesson ? (
        <Card>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            You have no lesson scheduled right now — attendance opens automatically once your Timetable places you in
            a Period.
          </p>
        </Card>
      ) : (
        <>
          <Card className="mb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-display text-lg font-bold text-navy-900 dark:text-white">
                  {view.lesson.class?.name} · {view.lesson.subject?.name} · {view.lesson.period?.name}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {view.lesson.period?.startTime}–{view.lesson.period?.endTime}
                </p>
              </div>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save Attendance'}
              </Button>
            </div>
            {checkpointLabel && (
              <p className="mt-3 rounded-md bg-warning-bg px-3 py-2 text-xs font-semibold text-warning">
                Attendance for this Period was already recorded by a Manager ({checkpointLabel}) — editing is
                disabled for those students. A Manager can correct it if needed.
              </p>
            )}
          </Card>

          <Card padding="p-0">
            <StudentAttendanceList students={view.students} draft={draft} onChange={handleDraftChange} />
          </Card>
        </>
      )}
    </div>
  );
}
