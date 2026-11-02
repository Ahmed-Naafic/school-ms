import React from 'react';

// Wraps a native <select> rather than a custom-built dropdown, to keep
// built-in keyboard and screen-reader behavior, per UI-UX-Standards.md's
// Accessibility section.
export function Select({ label, options = [], disabled = false, className = '', ...rest }) {
  return (
    <label className={['flex flex-col gap-1.5 font-body', className].join(' ')}>
      {label && <span className="text-[13px] font-bold text-navy-900 dark:text-white">{label}</span>}
      <div className="relative flex">
        <select
          disabled={disabled}
          className={[
            'w-full appearance-none rounded-md border py-[10px] pl-[14px] pr-9 font-body text-base text-gray-900',
            'outline-none transition-colors duration-fast dark:text-gray-100',
            'focus:border-teal-500 focus:ring-4 focus:ring-teal-100 dark:focus:ring-teal-500/30',
            disabled
              ? 'cursor-not-allowed bg-gray-100 dark:bg-navy-800'
              : 'cursor-pointer bg-white border-gray-300 dark:bg-navy-900 dark:border-gray-500',
          ].join(' ')}
          {...rest}
        >
          {options.map((o) => {
            const opt = typeof o === 'string' ? { value: o, label: o } : o;
            return (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            );
          })}
        </select>
        <svg
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </label>
  );
}
