import React from 'react';
import { Button } from '../../../shared/components';

function getFocusable(node) {
  if (!node) return [];
  return Array.from(
    node.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}

// The one manual staff-attendance override (Business Rule #37): a compact,
// accessible confirm popup offering exactly EXCUSED and Cancel — never
// PRESENT/ABSENT/LATE, which are always automatic. Deliberately a separate
// component from Student Attendance's StudentStatusModal (not a shared one)
// so this feature's own accessibility/focus-trap behavior never risks
// changing Student Attendance's, even though the two look alike.
//
// (v1.9) `historical`/`targetDateLabel` make a past-date correction visually
// unmistakable from an ordinary same-day Excuse — the caller decides which
// mode this is (today vs. a past date), never this component itself; see
// Business Rule #41.
export function StaffExcuseModal({ open, staffName, historical = false, targetDateLabel, onConfirm, onClose, returnFocusRef }) {
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
        <p id={titleId} className="font-display text-base font-bold text-navy-900 dark:text-white">
          {historical ? 'Historical correction' : staffName}
        </p>
        {historical ? (
          <>
            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{staffName}</p>
            <p className="mb-4 mt-1 rounded-md bg-warning-bg px-3 py-2 text-xs font-semibold text-warning">
              This corrects the record for {targetDateLabel} — a past date, not today. Use this only for a genuine
              correction to an already-elapsed day.
            </p>
          </>
        ) : (
          <div className="mb-4" />
        )}

        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={onConfirm}
            className="flex min-h-[44px] items-center justify-center rounded-md border border-transparent bg-navy-800 text-sm font-bold text-white transition-colors duration-fast ease-out-brand hover:bg-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:bg-teal-500 dark:hover:bg-teal-600"
          >
            {historical ? `Apply Excused for ${targetDateLabel}` : 'Excused'}
          </button>
        </div>

        <Button variant="ghost" className="mt-4 w-full" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
