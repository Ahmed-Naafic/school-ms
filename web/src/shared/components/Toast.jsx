import React from 'react';

// The accent bar pairs with color so tone is never conveyed by color alone,
// per UI-UX-Standards.md's Accessibility section.
const TONE_BAR_CLASSES = {
  neutral: 'bg-navy-800',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

export function Toast({ tone = 'neutral', title, description, onClose, className = '' }) {
  return (
    <div
      className={[
        'flex max-w-[380px] items-start gap-3 rounded-md border border-gray-200 bg-white p-[13px_16px] font-body shadow-md',
        'dark:border-navy-700 dark:bg-navy-900',
        className,
      ].join(' ')}
    >
      <span className={['w-1 flex-none self-stretch rounded-sm', TONE_BAR_CLASSES[tone] || TONE_BAR_CLASSES.neutral].join(' ')} />
      <div className="flex-1">
        {title && <div className="text-sm font-bold text-navy-900 dark:text-white">{title}</div>}
        {description && <div className="mt-0.5 text-xs leading-snug text-gray-500 dark:text-gray-400">{description}</div>}
      </div>
      {onClose && (
        <button type="button" aria-label="Dismiss" onClick={onClose} className="p-0.5 text-gray-500 dark:text-gray-400">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
