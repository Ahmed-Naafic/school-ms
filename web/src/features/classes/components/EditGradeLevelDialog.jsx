import React from 'react';
import { Dialog, Input, Select } from '../../../shared/components';

const EDUCATION_LEVEL_OPTIONS = [
  { value: 'PRIMARY', label: 'Primary' },
  { value: 'SECONDARY', label: 'Secondary' },
];

export function EditGradeLevelDialog({ open, initialName, initialEducationLevel, onClose, onSave }) {
  const [name, setName] = React.useState(initialName || '');
  const [educationLevel, setEducationLevel] = React.useState(initialEducationLevel || 'PRIMARY');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(initialName || '');
      setEducationLevel(initialEducationLevel || 'PRIMARY');
    }
  }, [open, initialName, initialEducationLevel]);

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onSave({ name, educationLevel });
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
      title="Edit Grade/Form"
      confirmLabel={submitting ? 'Saving…' : 'Save changes'}
    >
      <div className="flex flex-col gap-3">
        <Input label="Grade/Form name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        <Select
          label="Education Level"
          value={educationLevel}
          onChange={(e) => setEducationLevel(e.target.value)}
          options={EDUCATION_LEVEL_OPTIONS}
        />
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
