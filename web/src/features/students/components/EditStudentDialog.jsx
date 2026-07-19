import React from 'react';
import { Dialog, Input } from '../../../shared/components';

export function EditStudentDialog({ open, student, onClose, onSave }) {
  const [fullName, setFullName] = React.useState('');
  const [parentName, setParentName] = React.useState('');
  const [parentContact, setParentContact] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open && student) {
      setFullName(student.fullName || '');
      setParentName(student.parentName || '');
      setParentContact(student.parentContact || '');
    }
  }, [open, student]);

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onSave({ fullName, parentName, parentContact });
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
      title="Edit Student Profile"
      confirmLabel={submitting ? 'Saving…' : 'Save changes'}
    >
      <div className="flex flex-col gap-3">
        <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
        <Input label="Parent name" value={parentName} onChange={(e) => setParentName(e.target.value)} />
        <Input
          label="Parent contact"
          value={parentContact}
          onChange={(e) => setParentContact(e.target.value)}
        />
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
