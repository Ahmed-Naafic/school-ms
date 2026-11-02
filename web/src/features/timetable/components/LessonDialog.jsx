import React from 'react';
import { Dialog, Select } from '../../../shared/components';
import { useAuth } from '../../../shared/auth/AuthContext';
import * as timetableService from '../services/timetable.service';
import * as scheduleService from '../../school-schedule/services/school-schedule.service';
import * as tsaService from '../../teacher-subject-assignments/services/teacher-subject-assignments.service';
import * as teachersService from '../../teachers/services/teachers.service';
import * as subjectsService from '../../subjects/services/subjects.service';
import * as classesService from '../../classes/services/classes.service';

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const DAY_LABELS = {
  SUNDAY: 'Sunday',
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
};

// Create or move/swap a Lesson — the only editable action in this feature
// (Business Rule #13, the Master Timetable is the sole editable view).
// Every conflict/eligibility rule is enforced backend-side; this dialog only
// collects the three fields a Lesson needs and reflects whatever the
// backend rejects, per System-Architecture.md's Business Logic Ownership.
//
// Teacher Subject Assignment rows carry only ids (teacherId/subjectId/
// classId), never nested names — the same plain-row shape Teacher Subject
// Assignment's own list page already works around by building its own
// client-side Teacher/Subject/Class name lookups; this dialog does the same.
export function LessonDialog({ open, lesson, prefill, onClose, onSaved }) {
  const { account } = useAuth();
  const [assignments, setAssignments] = React.useState([]);
  const [teacherNameById, setTeacherNameById] = React.useState({});
  const [subjectNameById, setSubjectNameById] = React.useState({});
  const [classNameById, setClassNameById] = React.useState({});
  const [periods, setPeriods] = React.useState([]);
  const [teacherSubjectAssignmentId, setTeacherSubjectAssignmentId] = React.useState('');
  const [dayOfWeek, setDayOfWeek] = React.useState('MONDAY');
  const [periodId, setPeriodId] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    (async () => {
      const [assignmentList, teachers, schoolSubjects, classes, shifts] = await Promise.all([
        tsaService.listAssignments({ pageSize: 200 }),
        teachersService.listTeachers({}),
        subjectsService.listSchoolSubjects(account.schoolId),
        classesService.listClasses(),
        scheduleService.listShifts({ status: 'ACTIVE' }),
      ]);

      setAssignments(assignmentList.filter((a) => a.status === 'ACTIVE'));
      setTeacherNameById(Object.fromEntries(teachers.map((t) => [t.id, t.fullName])));
      setSubjectNameById(Object.fromEntries(schoolSubjects.map((row) => [row.subjectId, row.subject && row.subject.name])));
      setClassNameById(Object.fromEntries(classes.map((c) => [c.id, c.name])));

      const periodLists = await Promise.all(shifts.map((shift) => scheduleService.listPeriods(shift.id, { status: 'ACTIVE' })));
      const allPeriods = shifts.flatMap((shift, index) =>
        periodLists[index].filter((p) => p.type === 'TEACHING').map((p) => ({ ...p, shiftName: shift.name }))
      );
      setPeriods(allPeriods);

      if (lesson) {
        setTeacherSubjectAssignmentId(lesson.teacherSubjectAssignmentId);
        setDayOfWeek(lesson.dayOfWeek);
        setPeriodId(lesson.period ? lesson.period.id : '');
      } else {
        setTeacherSubjectAssignmentId('');
        setDayOfWeek((prefill && prefill.dayOfWeek) || 'MONDAY');
        setPeriodId((prefill && prefill.periodId) || '');
      }
      setError(null);
    })();
  }, [open, lesson, prefill, account.schoolId]);

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const payload = { teacherSubjectAssignmentId, dayOfWeek, periodId };
      if (lesson) {
        await timetableService.updateLesson(lesson.id, payload);
      } else {
        await timetableService.createLesson(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // When opened from a specific Master Timetable cell, narrow the
  // Assignment list to that Class only — the cell already fixes which
  // Class this Lesson belongs to; still shown as a dropdown, never
  // silently assumed, since a Class may have several Assignments to choose
  // from (different Subjects/Teachers).
  const assignmentsForDialog =
    !lesson && prefill && prefill.classId ? assignments.filter((a) => a.classId === prefill.classId) : assignments;
  const assignmentOptions = assignmentsForDialog.map((a) => ({
    value: a.id,
    label: `${teacherNameById[a.teacherId] || a.teacherId} — ${subjectNameById[a.subjectId] || a.subjectId} — ${
      classNameById[a.classId] || a.classId
    }`,
  }));
  const periodOptions = periods.map((p) => ({ value: p.id, label: `${p.shiftName} — ${p.name}` }));
  const dayOptions = DAYS.map((d) => ({ value: d, label: DAY_LABELS[d] }));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onConfirm={handleConfirm}
      title={lesson ? 'Move / Swap Lesson' : 'Create Lesson'}
      confirmLabel={submitting ? 'Saving…' : 'Save'}
    >
      <div className="flex flex-col gap-3">
        <Select
          label="Teacher Subject Assignment"
          options={[{ value: '', label: 'Select…' }, ...assignmentOptions]}
          value={teacherSubjectAssignmentId}
          onChange={(e) => setTeacherSubjectAssignmentId(e.target.value)}
        />
        <Select label="Day" options={dayOptions} value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)} />
        <Select
          label="Period"
          options={[{ value: '', label: 'Select…' }, ...periodOptions]}
          value={periodId}
          onChange={(e) => setPeriodId(e.target.value)}
        />
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
