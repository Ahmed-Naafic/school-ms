import React from 'react';
import { Dialog, Input } from '../../../shared/components';

function toDateInputValue(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : '';
}

export function EditAcademicYearDialog({ open, academicYear, onClose, onSave }) {
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (academicYear) {
      setStartDate(toDateInputValue(academicYear.startDate));
      setEndDate(toDateInputValue(academicYear.endDate));
      setError(null);
    }
  }, [academicYear]);

  if (!academicYear) return null;

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onSave(academicYear.id, { startDate, endDate });
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
      title="Edit Academic Year"
      description="Editing is available regardless of Active/Archived status — this is the intended way to correct a mistake, rather than archiving and creating a replacement."
      confirmLabel={submitting ? 'Saving…' : 'Save changes'}
    >
      <div className="flex flex-col gap-3">
        <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required autoFocus />
        <Input label="End date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
