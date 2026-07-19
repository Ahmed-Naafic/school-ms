import React from 'react';

const SIDE_CLASSES = {
  top: 'bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2',
  bottom: 'top-[calc(100%+8px)] left-1/2 -translate-x-1/2',
  left: 'right-[calc(100%+8px)] top-1/2 -translate-y-1/2',
  right: 'left-[calc(100%+8px)] top-1/2 -translate-y-1/2',
};

export function Tooltip({ label, side = 'top', className = '', children }) {
  return (
    <span className={['group relative inline-flex', className].join(' ')}>
      {children}
      <span
        role="tooltip"
        className={[
          'pointer-events-none absolute z-[100] whitespace-nowrap rounded-sm bg-navy-900 px-[10px] py-[6px]',
          'font-body text-xs font-semibold text-white shadow-md opacity-0 transition-opacity duration-fast',
          'group-hover:opacity-100 group-focus-within:opacity-100',
          SIDE_CLASSES[side] || SIDE_CLASSES.top,
        ].join(' ')}
      >
        {label}
      </span>
    </span>
  );
}
