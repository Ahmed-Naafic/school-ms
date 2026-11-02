import React from 'react';

const SIZE_CLASSES = {
  sm: 'py-[7px] px-3',
  md: 'py-[10px] px-[14px]',
};

// Error state overrides the hint — never show both at once, per
// UI-UX-Standards.md's Interaction States section.
export function Input({ label, hint, error, size = 'md', disabled = false, className = '', ...rest }) {
  return (
    <label className={['flex flex-col gap-1.5 font-body', className].join(' ')}>
      {label && <span className="text-[13px] font-bold text-navy-900 dark:text-white">{label}</span>}
      <input
        disabled={disabled}
        className={[
          'rounded-md border font-body text-base text-gray-900 outline-none transition-colors duration-fast dark:text-gray-100',
          disabled ? 'cursor-not-allowed bg-gray-100 dark:bg-navy-800' : 'bg-white dark:bg-navy-900',
          error
            ? 'border-danger focus:ring-4 focus:ring-danger-bg dark:focus:ring-danger/30'
            : 'border-gray-300 focus:border-teal-500 focus:ring-4 focus:ring-teal-100 dark:border-gray-500 dark:focus:ring-teal-500/30',
          SIZE_CLASSES[size] || SIZE_CLASSES.md,
        ].join(' ')}
        {...rest}
      />
      {error ? (
        <span className="text-[12.5px] text-danger">{error}</span>
      ) : hint ? (
        <span className="text-[12.5px] text-gray-500 dark:text-gray-400">{hint}</span>
      ) : null}
    </label>
  );
}
