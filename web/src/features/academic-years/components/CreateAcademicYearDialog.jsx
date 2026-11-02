import React from 'react';
import { Dialog, Input } from '../../../shared/components';

export function CreateAcademicYearDialog({ open, onClose, onCreate }) {
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  const reset = () => {
    setStartDate('');
    setEndDate('');
  };

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onCreate({ startDate, endDate });
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
      title="Create an Academic Year"
      description="The display label (e.g. 2025/2026) is generated automatically from these dates — there's no separate name to enter."
      confirmLabel={submitting ? 'Creating…' : 'Create Academic Year'}
    >
      <div className="flex flex-col gap-3">
        <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required autoFocus />
        <Input label="End date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
