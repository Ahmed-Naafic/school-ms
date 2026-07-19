import React from 'react';

export function Radio({ label, checked = false, disabled = false, onChange, name, className = '' }) {
  return (
    <label
      onClick={() => !disabled && onChange && onChange()}
      className={[
        'inline-flex select-none items-center gap-[9px] font-body text-[14.5px]',
        disabled
          ? 'cursor-not-allowed text-gray-500 opacity-60 dark:text-gray-400'
          : 'cursor-pointer text-gray-900 dark:text-gray-100',
        className,
      ].join(' ')}
    >
      <span
        className={[
          'flex h-[19px] w-[19px] flex-none items-center justify-center rounded-full border-[1.5px] bg-white transition-colors duration-fast',
          'dark:bg-navy-900',
          checked ? 'border-teal-500' : 'border-gray-300 dark:border-gray-500',
        ].join(' ')}
      >
        {checked && <span className="h-[9px] w-[9px] rounded-full bg-teal-500" />}
      </span>
      {label}
      <input type="radio" name={name} checked={checked} onChange={() => {}} className="sr-only" />
    </label>
  );
}
