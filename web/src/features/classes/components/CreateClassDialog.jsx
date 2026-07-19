import React from 'react';
import { Dialog, Input } from '../../../shared/components';

export function CreateClassDialog({ open, onClose, onCreate }) {
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onCreate({ name });
      setName('');
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
      title="Create a Class"
      description="Classes are reused every academic year — you won't need to recreate them annually."
      confirmLabel={submitting ? 'Creating…' : 'Create Class'}
    >
      <div className="flex flex-col gap-3">
        <Input label="Class name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
