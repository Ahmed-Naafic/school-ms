import React from 'react';
import { Dialog, Input, Select } from '../../../shared/components';

// Ends the current assignment (recording an end reason) and creates a new
// one for the same Subject/Class/Section/Academic Year with the replacement
// Teacher, atomically — this dialog never re-implements that; it only
// collects the inputs the backend's dedicated endpoint needs.
export function ReplaceTeacherDialog({ open, assignment, teacherOptions = [], onClose, onReplace }) {
  const [newTeacherId, setNewTeacherId] = React.useState('');
  const [effectiveEndDate, setEffectiveEndDate] = React.useState('');
  const [endReason, setEndReason] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  const otherTeacherOptions = teacherOptions.filter((t) => t.value !== assignment?.teacherId);

  React.useEffect(() => {
    if (open) {
      setNewTeacherId(otherTeacherOptions?.[0]?.value || '');
      setEffectiveEndDate('');
      setEndReason('');
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, assignment]);

  if (!assignment) return null;

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onReplace(assignment.id, {
        newTeacherId,
        effectiveEndDate: effectiveEndDate || undefined,
        endReason: endReason || undefined,
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
      title="Replace Teacher"
      description="Ends this assignment and creates a new one for the same Subject, Class, Section, and Academic Year with the replacement Teacher — preserving the original assignment's history."
      confirmLabel={submitting ? 'Replacing…' : 'Replace Teacher'}
    >
      <div className="flex flex-col gap-3">
        <Select
          label="Replacement Teacher"
          value={newTeacherId}
          onChange={(e) => setNewTeacherId(e.target.value)}
          options={
            otherTeacherOptions.length > 0 ? otherTeacherOptions : [{ value: '', label: 'No other active Teachers' }]
          }
          required
        />
        <Input
          label="Effective date (defaults to today)"
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
