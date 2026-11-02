import React from 'react';
import { Button } from '../../../shared/components';
import { AttendanceStatusDot } from './AttendanceStatusDot';

// Exactly the three alternative statuses (Present is never a fourth option
// here — it's represented by the header control below, reusing the same
// dot/control language as the row it was opened from).
const ALT_STATUSES = ['ABSENT', 'LATE', 'EXCUSED'];
const STATUS_LABEL = { PRESENT: 'Present', ABSENT: 'Absent', LATE: 'Late', EXCUSED: 'Excused' };

function getFocusable(node) {
  if (!node) return [];
  return Array.from(
    node.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}

// Self-contained accessible dialog (focus trap, Escape-to-close, focus
// restored to the triggering control on close) — deliberately not built on
// the shared Dialog component, since that component is used across many
// unrelated modules (Timetable, TSA, WSA, Schools, ...) and this task's
// scope is Student Attendance only; changing shared/components/Dialog.jsx
// would risk behavior changes well outside that scope. Visual language
// (backdrop tone, corner radius, shadow) matches Dialog.jsx for consistency.
export function StudentStatusModal({ open, studentName, currentStatus, onSelect, onClose, returnFocusRef }) {
  const dialogRef = React.useRef(null);
  const previouslyFocusedRef = React.useRef(null);
  const titleId = React.useId();

  React.useEffect(() => {
    if (!open) return undefined;

    previouslyFocusedRef.current = document.activeElement;
    const node = dialogRef.current;
    const focusable = getFocusable(node);
    (focusable[0] || node)?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === 'Tab') {
        const items = getFocusable(dialogRef.current);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      const returnTarget = (returnFocusRef && returnFocusRef.current) || previouslyFocusedRef.current;
      returnTarget?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-navy-950/45 p-4 backdrop-blur-sm dark:bg-navy-950/70"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-[min(320px,calc(100vw-32px))] rounded-lg bg-white p-5 font-body shadow-lg dark:bg-navy-900"
      >
        <button
          type="button"
          onClick={() => onSelect('PRESENT')}
          className="mb-4 flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:hover:bg-navy-800"
        >
          <AttendanceStatusDot status="PRESENT" filled={currentStatus === 'PRESENT'} size="md" />
          <span className="min-w-0">
            <span id={titleId} className="block truncate font-display text-base font-bold text-navy-900 dark:text-white">
              {studentName}
            </span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              {currentStatus === 'PRESENT' ? 'Currently Present' : 'Tap to mark Present'}
            </span>
          </span>
        </button>

        <div className="flex flex-col gap-1.5" role="group" aria-label={`Change ${studentName || 'student'}'s status to`}>
          {ALT_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => onSelect(status)}
              aria-pressed={currentStatus === status}
              className={[
                'flex min-h-[44px] items-center justify-center rounded-md border text-sm font-bold transition-colors duration-fast ease-out-brand',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
                currentStatus === status
                  ? 'border-transparent bg-navy-800 text-white dark:bg-teal-500'
                  : 'border-gray-200 text-gray-900 hover:bg-gray-50 dark:border-navy-700 dark:text-gray-100 dark:hover:bg-navy-800',
              ].join(' ')}
            >
              {STATUS_LABEL[status]}
            </button>
          ))}
        </div>

        <Button variant="ghost" className="mt-4 w-full" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
