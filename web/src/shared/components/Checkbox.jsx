import React from 'react';

export function Checkbox({ label, checked, defaultChecked = false, disabled = false, onChange, className = '' }) {
  const [internal, setInternal] = React.useState(defaultChecked);
  const isOn = checked !== undefined ? checked : internal;

  const toggle = () => {
    if (disabled) return;
    if (checked === undefined) setInternal(!isOn);
    onChange && onChange(!isOn);
  };

  return (
    <label
      onClick={toggle}
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
          'flex h-[19px] w-[19px] flex-none items-center justify-center rounded-md border-[1.5px] transition-colors duration-fast',
          isOn ? 'border-teal-500 bg-teal-500' : 'border-gray-300 bg-white dark:border-gray-500 dark:bg-navy-900',
        ].join(' ')}
      >
        {isOn && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </span>
      {label}
    </label>
  );
}
