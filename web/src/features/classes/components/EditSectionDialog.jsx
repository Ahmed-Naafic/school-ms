import React from 'react';
import { Dialog, Input } from '../../../shared/components';

export function EditSectionDialog({ open, initialName, combinedName, onClose, onSave }) {
  const [name, setName] = React.useState(initialName || '');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(initialName || '');
      setError(null);
    }
  }, [open, initialName]);

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onSave({ name });
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
      title={combinedName ? `Edit Section — ${combinedName}` : 'Edit Section'}
      confirmLabel={submitting ? 'Saving…' : 'Save changes'}
    >
      <div className="flex flex-col gap-3">
        <Input label="Section name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
