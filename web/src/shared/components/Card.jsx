import React from 'react';

export function Card({ padding = 'p-6', hoverable = false, className = '', children, ...rest }) {
  return (
    <div
      className={[
        'rounded-lg border border-gray-200 bg-white font-body text-gray-900 shadow-sm',
        'dark:border-navy-700 dark:bg-navy-900 dark:text-gray-100',
        'transition-shadow transition-transform duration-base ease-out-brand',
        hoverable ? 'hover:shadow-md hover:-translate-y-0.5' : '',
        padding,
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}
