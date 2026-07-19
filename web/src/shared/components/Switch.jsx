import React from 'react';

export function Switch({ label, checked, defaultChecked = false, disabled = false, onChange, className = '' }) {
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
        'inline-flex select-none items-center gap-[10px] font-body text-[14.5px]',
        disabled
          ? 'cursor-not-allowed text-gray-500 opacity-60 dark:text-gray-400'
          : 'cursor-pointer text-gray-900 dark:text-gray-100',
        className,
      ].join(' ')}
    >
      <span
        className={[
          'relative h-[22px] w-[38px] flex-none rounded-pill transition-colors duration-base',
          isOn ? 'bg-teal-500' : 'bg-gray-300 dark:bg-navy-800',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-all duration-base',
            isOn ? 'left-[18px]' : 'left-0.5',
          ].join(' ')}
        />
      </span>
      {label}
    </label>
  );
}
