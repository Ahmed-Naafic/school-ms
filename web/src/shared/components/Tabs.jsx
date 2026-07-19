import React from 'react';

export function Tabs({ tabs = [], value, defaultValue, onChange, className = '' }) {
  const firstValue = tabs[0] && (tabs[0].value ?? tabs[0]);
  const [internal, setInternal] = React.useState(defaultValue ?? firstValue);
  const active = value !== undefined ? value : internal;

  const pick = (v) => {
    if (value === undefined) setInternal(v);
    onChange && onChange(v);
  };

  return (
    <div className={['inline-flex gap-1 rounded-pill bg-gray-100 p-1 font-body dark:bg-navy-800', className].join(' ')}>
      {tabs.map((t) => {
        const tab = typeof t === 'string' ? { value: t, label: t } : t;
        const isActive = tab.value === active;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => pick(tab.value)}
            className={[
              'rounded-pill px-[18px] py-2 text-sm font-bold transition-colors duration-fast',
              isActive
                ? 'bg-white text-navy-800 shadow-sm dark:bg-navy-900 dark:text-white'
                : 'bg-transparent text-gray-500 dark:text-gray-400',
            ].join(' ')}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
