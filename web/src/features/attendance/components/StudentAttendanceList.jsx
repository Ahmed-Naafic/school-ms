import React from 'react';
import { AttendanceStatusDot } from './AttendanceStatusDot';
import { StudentStatusModal } from './StudentStatusModal';

const STATUS_LABEL = { PRESENT: 'Present', ABSENT: 'Absent', LATE: 'Late', EXCUSED: 'Excused' };
const STATUS_TEXT_CLASS = {
  PRESENT: 'text-success',
  ABSENT: 'text-danger',
  LATE: 'text-warning',
  EXCUSED: 'text-navy-800 dark:text-navy-100',
};

function initTouched(students) {
  const next = {};
  students.forEach((s) => {
    // A student with a real prior record (any status other than the derived
    // NOT_RECORDED) renders filled from the start — only a genuinely
    // never-recorded student starts as the empty "not yet decided" circle.
    next[s.studentId] = s.status !== 'NOT_RECORDED';
  });
  return next;
}

// Compact Student Attendance list shared by the Teacher and Manager pages.
// Interaction model (Section 2-6 of the spec this implements):
//  - A student's single control starts empty ("not yet recorded"). The
//    first click on it marks the student PRESENT directly — no popup.
//  - Once a student has any recorded status (including PRESENT), clicking
//    the control again opens the status modal, since there's now something
//    to potentially change.
//  - The modal offers exactly three alternative statuses (Absent/Late/
//    Excused) as its option list; returning to PRESENT is done via the
//    modal's own header control, which reuses the same dot/status language
//    as the row it was opened from — never a fourth item in the option list.
//  - "All Present" bulk-marks every editable (non-locked) student PRESENT
//    and touched in one action.
export function StudentAttendanceList({ students, draft, onChange, disabledAll = false, emptyMessage = 'No students to show.' }) {
  const [touched, setTouched] = React.useState(() => initTouched(students));
  const [modalStudentId, setModalStudentId] = React.useState(null);
  const triggerRefs = React.useRef({});

  React.useEffect(() => {
    setTouched(initTouched(students));
  }, [students]);

  const setStatus = React.useCallback(
    (studentId, status) => {
      onChange(studentId, status);
      setTouched((prev) => ({ ...prev, [studentId]: true }));
    },
    [onChange]
  );

  const handleRowClick = (student) => {
    if (disabledAll || student.locked) return;
    if (!touched[student.studentId]) {
      setStatus(student.studentId, 'PRESENT');
    } else {
      setModalStudentId(student.studentId);
    }
  };

  const eligible = students.filter((s) => !s.locked);
  const allPresent =
    eligible.length > 0 && eligible.every((s) => touched[s.studentId] && draft[s.studentId] === 'PRESENT');

  const handleAllPresent = () => {
    if (disabledAll || eligible.length === 0) return;
    eligible.forEach((s) => onChange(s.studentId, 'PRESENT'));
    setTouched((prev) => {
      const next = { ...prev };
      eligible.forEach((s) => {
        next[s.studentId] = true;
      });
      return next;
    });
  };

  const summary = students.reduce(
    (acc, s) => {
      const status = draft[s.studentId] || 'PRESENT';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 }
  );

  const activeStudent = students.find((s) => s.studentId === modalStudentId) || null;
  const closeModal = () => setModalStudentId(null);

  if (students.length === 0) {
    return <p className="p-6 text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-bold dark:border-navy-700 dark:bg-navy-900/40">
        <span className="text-success">Present: {summary.PRESENT}</span>
        <span className="text-danger">Absent: {summary.ABSENT}</span>
        <span className="text-warning">Late: {summary.LATE}</span>
        <span className="text-navy-800 dark:text-navy-100">Excused: {summary.EXCUSED}</span>
      </div>

      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-2.5 dark:border-navy-700">
        <span className="text-sm font-bold text-navy-900 dark:text-white">All Present</span>
        <button
          type="button"
          onClick={handleAllPresent}
          disabled={disabledAll || eligible.length === 0}
          aria-pressed={allPresent}
          aria-label={allPresent ? 'All students marked Present' : 'Mark all students Present'}
          className="flex min-h-[36px] items-center gap-2 rounded-pill px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <AttendanceStatusDot status="PRESENT" filled={allPresent} size="md" />
        </button>
      </div>

      <div role="list" aria-label="Students">
        {students.map((s) => {
          const status = draft[s.studentId] || 'PRESENT';
          const isTouched = touched[s.studentId];
          const rowDisabled = disabledAll || s.locked;
          const label = !isTouched
            ? `${s.fullName}, attendance not yet recorded. Press to mark Present.`
            : `${s.fullName}, attendance: ${STATUS_LABEL[status]}.${rowDisabled ? ' Read only.' : ' Press to change status.'}`;

          return (
            <div
              key={s.studentId}
              role="listitem"
              className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-2.5 last:border-0 dark:border-navy-800"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                {s.fullName}
                {s.locked && <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">read only</span>}
              </span>
              <button
                type="button"
                ref={(el) => {
                  triggerRefs.current[s.studentId] = el;
                }}
                onClick={() => handleRowClick(s)}
                disabled={rowDisabled}
                aria-haspopup={isTouched ? 'dialog' : undefined}
                aria-label={label}
                className="flex min-h-[36px] min-w-[104px] items-center justify-end gap-2 rounded-pill px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isTouched && <span className={['text-xs font-bold', STATUS_TEXT_CLASS[status]].join(' ')}>{STATUS_LABEL[status]}</span>}
                <AttendanceStatusDot status={isTouched ? status : null} filled={isTouched} />
              </button>
            </div>
          );
        })}
      </div>

      <StudentStatusModal
        open={Boolean(activeStudent)}
        studentName={activeStudent?.fullName}
        currentStatus={activeStudent ? draft[activeStudent.studentId] : null}
        onSelect={(status) => {
          if (activeStudent) setStatus(activeStudent.studentId, status);
          closeModal();
        }}
        onClose={closeModal}
        returnFocusRef={{ current: activeStudent ? triggerRefs.current[activeStudent.studentId] : null }}
      />
    </div>
  );
}
