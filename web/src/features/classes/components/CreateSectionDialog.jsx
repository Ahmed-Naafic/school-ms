import React from 'react';
import { Dialog, Input, Select } from '../../../shared/components';

// classOptions/initialClassId let this one dialog serve both entry points:
// the per-row "+" (initialClassId pre-filled, per Class already implied) and
// the global "Add Section" button next to "Create Class" (initialClassId
// empty, School Admin picks the Class here).
export function CreateSectionDialog({ open, onClose, onCreate, classOptions = [], initialClassId = '' }) {
  const [classId, setClassId] = React.useState('');
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setClassId(initialClassId);
      setName('');
      setError(null);
    }
  }, [open, initialClassId]);

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onCreate(classId, { name });
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
      title="Add a Section"
      confirmLabel={submitting ? 'Adding…' : 'Add Section'}
    >
      <div className="flex flex-col gap-3">
        <Select label="Class" value={classId} onChange={(e) => setClassId(e.target.value)} options={classOptions} />
        <Input label="Section name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
