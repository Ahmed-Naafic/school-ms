import React from 'react';
import { Dialog, Input } from '../../../shared/components';

export function TransferStudentDialog({ open, onClose, onTransfer }) {
  const [academicSummary, setAcademicSummary] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) setAcademicSummary('');
  }, [open]);

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onTransfer({ academicSummary: academicSummary || undefined });
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
      title="Transfer Student"
      description="This summary is kept only in this Student's own archived record here — it is not shared with, or linked to, any other school on the platform. If the receiving school needs it, you'll need to pass it along yourself outside the system."
      confirmLabel={submitting ? 'Transferring…' : 'Transfer'}
    >
      <div className="flex flex-col gap-3">
        <Input
          label="Academic summary"
          placeholder="e.g. Completed Grade 3, strong in math"
          value={academicSummary}
          onChange={(e) => setAcademicSummary(e.target.value)}
        />
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
