import React from 'react';
import { Dialog, Input, Select } from '../../../shared/components';

const PERIOD_TYPES = [
  { value: 'TEACHING', label: 'Teaching' },
  { value: 'BREAK', label: 'Break' },
];

// Times are optional — a Period may be created unconfigured, the same
// "structurally valid but not yet configured" shape the bootstrap/wizard
// structures already use, per the Business Specification.
export function CreatePeriodDialog({ open, onClose, onCreate }) {
  const [name, setName] = React.useState('');
  const [type, setType] = React.useState('TEACHING');
  const [startTime, setStartTime] = React.useState('');
  const [endTime, setEndTime] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  const reset = () => {
    setName('');
    setType('TEACHING');
    setStartTime('');
    setEndTime('');
  };

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onCreate({
        name,
        type,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
      });
      reset();
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
      onClose={() => {
        reset();
        onClose();
      }}
      onConfirm={handleConfirm}
      title="Create Period"
      confirmLabel={submitting ? 'Creating…' : 'Create Period'}
    >
      <div className="flex flex-col gap-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        <Select label="Type" options={PERIOD_TYPES} value={type} onChange={(e) => setType(e.target.value)} />
        <Input
          label="Start time (optional)"
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          hint="Leave both times empty to configure them later."
        />
        <Input label="End time (optional)" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
