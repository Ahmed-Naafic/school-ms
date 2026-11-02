import React from 'react';
import { Dialog, Input } from '../../../shared/components';

// Name/Start Time/End Time only — Display Order and Default are each their
// own dedicated action on the list page, never edited here, per Business
// Rule #11/Guard by Construction.
export function EditShiftDialog({ open, shift, onClose, onSave }) {
  const [name, setName] = React.useState('');
  const [startTime, setStartTime] = React.useState('');
  const [endTime, setEndTime] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open && shift) {
      setName(shift.name);
      setStartTime(shift.startTime);
      setEndTime(shift.endTime);
      setError(null);
    }
  }, [open, shift]);

  if (!shift) return null;

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onSave(shift.id, { name, startTime, endTime });
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
      title="Edit Shift"
      confirmLabel={submitting ? 'Saving…' : 'Save'}
    >
      <div className="flex flex-col gap-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        <Input label="Start time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
        <Input label="End time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
