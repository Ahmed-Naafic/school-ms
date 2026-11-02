import React from 'react';
import { Dialog, Input, Select } from '../../../shared/components';

const PERIOD_TYPES = [
  { value: 'TEACHING', label: 'Teaching' },
  { value: 'BREAK', label: 'Break' },
];

// Name/Type/Start Time/End Time only — Display Order and Status are each
// their own dedicated action, never edited here, per Guard by Construction.
export function EditPeriodDialog({ open, period, onClose, onSave }) {
  const [name, setName] = React.useState('');
  const [type, setType] = React.useState('TEACHING');
  const [startTime, setStartTime] = React.useState('');
  const [endTime, setEndTime] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open && period) {
      setName(period.name);
      setType(period.type);
      setStartTime(period.startTime || '');
      setEndTime(period.endTime || '');
      setError(null);
    }
  }, [open, period]);

  if (!period) return null;

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onSave(period.id, { name, type, startTime: startTime || undefined, endTime: endTime || undefined });
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
      title="Edit Period"
      confirmLabel={submitting ? 'Saving…' : 'Save'}
    >
      <div className="flex flex-col gap-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        <Select label="Type" options={PERIOD_TYPES} value={type} onChange={(e) => setType(e.target.value)} />
        <Input label="Start time (optional)" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        <Input label="End time (optional)" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
