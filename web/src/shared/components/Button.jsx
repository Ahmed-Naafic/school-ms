import React from 'react';

// Variants and sizes per docs/02-standards/UI-UX-Standards.md's Component Library section.
// Dark-mode primary uses the same fill as accent (teal), since navy-800
// fails contrast against a dark page background — see UI-UX-Standards.md's
// Dark Mode section for the documented exception to "navy leads".
const VARIANT_CLASSES = {
  primary: 'bg-navy-800 text-white hover:bg-navy-900 dark:bg-teal-500 dark:hover:bg-teal-600',
  accent: 'bg-teal-500 text-white hover:bg-teal-600',
  secondary:
    'bg-teal-50 text-teal-700 border border-teal-100 hover:bg-teal-100 dark:bg-teal-500/15 dark:text-teal-100 dark:border-teal-500/30 dark:hover:bg-teal-500/25',
  outline:
    'bg-transparent text-navy-800 border border-gray-300 hover:bg-gray-100 dark:text-gray-100 dark:border-gray-500 dark:hover:bg-navy-800',
  ghost: 'bg-transparent text-navy-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-navy-800',
};

const SIZE_CLASSES = {
  sm: 'text-sm px-[14px] py-[7px] min-h-[32px]',
  md: 'text-base px-5 py-[10px] min-h-[40px]',
  lg: 'text-lg px-[26px] py-[13px] min-h-[48px]',
};

export function Button({ variant = 'primary', size = 'md', disabled = false, className = '', children, ...rest }) {
  return (
    <button
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill font-body font-bold',
        'transition-colors duration-fast ease-out-brand active:translate-y-px',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2',
        'disabled:opacity-45 disabled:cursor-not-allowed disabled:pointer-events-none',
        VARIANT_CLASSES[variant] || VARIANT_CLASSES.primary,
        SIZE_CLASSES[size] || SIZE_CLASSES.md,
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
