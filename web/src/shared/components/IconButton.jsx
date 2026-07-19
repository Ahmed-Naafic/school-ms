import React from 'react';

// Dark-mode primary uses the same fill as Button's accent variant, since
// navy-800 fails contrast against a dark page background — see
// UI-UX-Standards.md's Dark Mode section for the documented exception.
const VARIANT_CLASSES = {
  primary:
    'bg-navy-800 text-white border border-transparent hover:bg-navy-900 dark:bg-teal-500 dark:hover:bg-teal-600',
  secondary:
    'bg-teal-50 text-teal-700 border border-teal-100 hover:bg-teal-100 dark:bg-teal-500/15 dark:text-teal-100 dark:border-teal-500/30 dark:hover:bg-teal-500/25',
  ghost: 'bg-transparent text-gray-700 border border-transparent hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-navy-800',
  outline:
    'bg-transparent text-navy-800 border border-gray-300 hover:bg-gray-100 dark:text-gray-100 dark:border-gray-500 dark:hover:bg-navy-800',
};

const SIZE_CLASSES = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
};

// `label` is required — this is an icon-only control with no visible text,
// per UI-UX-Standards.md's Accessibility section.
export function IconButton({ variant = 'ghost', size = 'md', disabled = false, label, className = '', children, ...rest }) {
  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center rounded-pill transition-colors duration-fast ease-out-brand',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2',
        'disabled:opacity-45 disabled:cursor-not-allowed disabled:pointer-events-none',
        VARIANT_CLASSES[variant] || VARIANT_CLASSES.ghost,
        SIZE_CLASSES[size] || SIZE_CLASSES.md,
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
