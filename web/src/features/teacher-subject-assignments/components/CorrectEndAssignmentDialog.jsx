import React from 'react';
import { Dialog, Input } from '../../../shared/components';

// One dialog backs both "Assignment Correction" and "Assignment Ending" from
// the Business Lifecycle section — the backend's single PATCH endpoint
// decides which one actually happened (setting a previously-unset
// effectiveEndDate for the first time IS ending it); this dialog only
// changes its own title/description framing depending on the record's
// current derived status, per the Technical Design's Frontend Design.
export function CorrectEndAssignmentDialog({ open, assignment, onClose, onSave }) {
  const [effectiveStartDate, setEffectiveStartDate] = React.useState('');
  const [effectiveEndDate, setEffectiveEndDate] = React.useState('');
  const [endReason, setEndReason] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open && assignment) {
      setEffectiveStartDate(assignment.effectiveStartDate ? assignment.effectiveStartDate.slice(0, 10) : '');
      setEffectiveEndDate(assignment.effectiveEndDate ? assignment.effectiveEndDate.slice(0, 10) : '');
      setEndReason(assignment.endReason || '');
      setError(null);
    }
  }, [open, assignment]);

  if (!assignment) return null;

  const isActive = assignment.status === 'ACTIVE';

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onSave(assignment.id, {
        effectiveStartDate,
        effectiveEndDate: effectiveEndDate || null,
        endReason: endReason || null,
      });
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
      title={isActive ? 'Correct or End this Assignment' : 'Correct this Ended Assignment'}
      description={
        isActive
          ? 'Adjust the dates, or set an end date to end this assignment. Teacher, Subject, Class, Section, and Academic Year cannot be changed here.'
          : 'Once ended, an assignment can never become Active again — you may still correct its dates or end reason.'
      }
      confirmLabel={submitting ? 'Saving…' : 'Save'}
    >
      <div className="flex flex-col gap-3">
        <Input
          label="Effective start date"
          type="date"
          value={effectiveStartDate}
          onChange={(e) => setEffectiveStartDate(e.target.value)}
          required
        />
        <Input
          label={isActive ? 'Effective end date (set to end this assignment)' : 'Effective end date'}
          type="date"
          value={effectiveEndDate}
          onChange={(e) => setEffectiveEndDate(e.target.value)}
        />
        <Input label="End reason (optional)" value={endReason} onChange={(e) => setEndReason(e.target.value)} />
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
