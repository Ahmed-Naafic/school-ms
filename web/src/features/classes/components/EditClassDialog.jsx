import React from 'react';
import { Dialog, Input, Select } from '../../../shared/components';

// (ACR-009, Architecture Update — Grade/Form)
export function EditClassDialog({ open, initialName, initialGradeLevelId, gradeLevelOptions = [], onClose, onSave }) {
  const [name, setName] = React.useState(initialName || '');
  const [gradeLevelId, setGradeLevelId] = React.useState(initialGradeLevelId || '');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(initialName || '');
      setGradeLevelId(initialGradeLevelId || '');
    }
  }, [open, initialName, initialGradeLevelId]);

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onSave({ name, gradeLevelId });
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
      title="Edit Class"
      confirmLabel={submitting ? 'Saving…' : 'Save changes'}
    >
      <div className="flex flex-col gap-3">
        <Input label="Class name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        <Select
          label="Grade/Form"
          value={gradeLevelId}
          onChange={(e) => setGradeLevelId(e.target.value)}
          options={gradeLevelOptions}
        />
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
