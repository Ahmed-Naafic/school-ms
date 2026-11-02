import React from 'react';
import { Dialog, Input, Select } from '../../../shared/components';

const EDUCATION_LEVEL_OPTIONS = [
  { value: 'PRIMARY', label: 'Primary' },
  { value: 'SECONDARY', label: 'Secondary' },
];

export function EditSubjectDialog({ open, subject, onClose, onSave }) {
  const [name, setName] = React.useState('');
  const [educationLevel, setEducationLevel] = React.useState('PRIMARY');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (subject) {
      setName(subject.name);
      setEducationLevel(subject.educationLevel);
      setError(null);
    }
  }, [subject]);

  if (!subject) return null;

  // Reflects, never re-implements, the backend's own Business Rule #2 guard
  // (Education Level is editable only while the Subject has zero School
  // assignments) — the backend remains the real enforcement either way.
  const levelLocked = subject.assignedSchoolCount > 0;

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onSave(subject.id, { name, educationLevel });
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
      title="Edit Subject"
      confirmLabel={submitting ? 'Saving…' : 'Save changes'}
    >
      <div className="flex flex-col gap-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        <Select
          label="Education Level"
          value={educationLevel}
          onChange={(e) => setEducationLevel(e.target.value)}
          options={EDUCATION_LEVEL_OPTIONS}
          disabled={levelLocked}
        />
        {levelLocked && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Assigned to {subject.assignedSchoolCount} School{subject.assignedSchoolCount === 1 ? '' : 's'} — Education
            Level can't be changed while assigned. Archive this Subject and create a correctly-categorized
            replacement instead.
          </p>
        )}
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
