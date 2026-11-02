import React from 'react';
import { Dialog, Input, Select } from '../../../shared/components';

const EDUCATION_LEVEL_OPTIONS = [
  { value: 'PRIMARY', label: 'Primary' },
  { value: 'SECONDARY', label: 'Secondary' },
];

export function CreateSubjectDialog({ open, onClose, onCreate }) {
  const [name, setName] = React.useState('');
  const [educationLevel, setEducationLevel] = React.useState('PRIMARY');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  const reset = () => {
    setName('');
    setEducationLevel('PRIMARY');
  };

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onCreate({ name, educationLevel });
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
      title="Create a Subject"
      description="Subject names are unique within their own Education Level — the same name may exist once per level."
      confirmLabel={submitting ? 'Creating…' : 'Create Subject'}
    >
      <div className="flex flex-col gap-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
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
