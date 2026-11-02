import React from 'react';

const TONE_CLASSES = {
  neutral: 'bg-gray-100 text-gray-700 dark:bg-navy-800 dark:text-gray-300',
  brand: 'bg-navy-50 text-navy-800 dark:bg-navy-800/60 dark:text-navy-100',
  accent: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-100',
  highlight: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-500',
  success: 'bg-success-bg text-success dark:bg-success/15',
  warning: 'bg-warning-bg text-warning dark:bg-warning/15',
  danger: 'bg-danger-bg text-danger dark:bg-danger/15',
};

export function Badge({ tone = 'neutral', className = '', children, ...rest }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-pill px-[11px] py-1 text-xs font-bold tracking-wide font-body',
        TONE_CLASSES[tone] || TONE_CLASSES.neutral,
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </span>
  );
}
