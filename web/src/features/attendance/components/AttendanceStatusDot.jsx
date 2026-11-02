import React from 'react';

// Compact, purely presentational status indicator shared by the row control,
// the "All Present" control, and the status modal's own Present affordance —
// one visual language for "this represents a status" across all three.
const DOT_COLOR_CLASS = {
  PRESENT: 'border-transparent bg-success',
  ABSENT: 'border-transparent bg-danger',
  LATE: 'border-transparent bg-warning',
  EXCUSED: 'border-transparent bg-navy-800 dark:bg-navy-100',
};

const SIZE_CLASS = {
  sm: 'h-[18px] w-[18px]',
  md: 'h-5 w-5',
};

export function AttendanceStatusDot({ status, filled, size = 'sm' }) {
  return (
    <span
      aria-hidden="true"
      className={[
        'inline-flex flex-none rounded-full border-[1.5px] transition-colors duration-fast ease-out-brand',
        SIZE_CLASS[size] || SIZE_CLASS.sm,
        filled && status ? DOT_COLOR_CLASS[status] : 'border-gray-300 bg-white dark:border-gray-500 dark:bg-navy-900',
      ].join(' ')}
    />
  );
}
