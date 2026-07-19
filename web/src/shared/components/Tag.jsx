import React from 'react';

export function Tag({ onRemove, className = '', children, ...rest }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-pill border border-gray-300 bg-white px-3 py-1',
        'text-sm font-semibold text-gray-700 font-body',
        'dark:border-gray-500 dark:bg-navy-900 dark:text-gray-300',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          aria-label="Remove"
          onClick={onRemove}
          className="flex h-4 w-4 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-navy-800"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}
