import React from 'react';
import { Button } from './Button';

export function Dialog({ open, title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onClose, children, className = '' }) {
  if (!open) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-navy-950/45 dark:bg-navy-950/70"
    >
      <div
        role="dialog"
        aria-modal="true"
        className={[
          'w-[min(440px,calc(100vw-48px))] rounded-lg bg-white p-7 font-body shadow-lg dark:bg-navy-900',
          className,
        ].join(' ')}
      >
        {title && <div className="mb-2 font-display text-lg font-bold text-navy-900 dark:text-white">{title}</div>}
        {description && (
          <div className="mb-2 text-[14.5px] leading-body text-gray-900 dark:text-gray-100">{description}</div>
        )}
        {children}
        <div className="mt-5 flex justify-end gap-[10px]">
          {onClose && (
            <Button variant="ghost" onClick={onClose}>
              {cancelLabel}
            </Button>
          )}
          {onConfirm && (
            <Button variant="primary" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
