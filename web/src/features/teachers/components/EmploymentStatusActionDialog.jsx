import React from 'react';
import { Dialog, Input } from '../../../shared/components';

// One shared, parameterized dialog for all six named transitions, per the
// Implementation Plan's WP8 design note: unlike Student Management's
// per-action dialogs (which collect materially different fields), Teacher's
// six transitions share an identical shape — a target action and an
// optional reason — so one parameterized component is the right level of
// abstraction here, not six near-duplicates.
const ACTION_CONFIG = {
  leave: { title: 'Place on Leave', confirmLabel: 'Place on Leave' },
  returnFromLeave: { title: 'Return from Leave', confirmLabel: 'Return from Leave' },
  resign: { title: 'Mark as Resigned', confirmLabel: 'Resign' },
  rehire: { title: 'Rehire', confirmLabel: 'Rehire' },
  terminate: { title: 'Terminate', confirmLabel: 'Terminate' },
  retire: { title: 'Retire', confirmLabel: 'Retire' },
};

export function EmploymentStatusActionDialog({ open, action, teacher, onClose, onConfirm }) {
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) setReason('');
  }, [open, action]);

  const config = ACTION_CONFIG[action] || {};

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm({ reason: reason || undefined });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onConfirm={handleConfirm}
      title={config.title}
      description={teacher ? `Applies to ${teacher.fullName}.` : undefined}
      confirmLabel={submitting ? 'Saving…' : config.confirmLabel || 'Confirm'}
    >
      <div className="flex flex-col gap-3">
        <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
