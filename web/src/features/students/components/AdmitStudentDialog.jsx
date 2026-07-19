import React from 'react';
import { Dialog, Input } from '../../../shared/components';

export function AdmitStudentDialog({ open, onClose, onCreate }) {
  const [email, setEmail] = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [parentName, setParentName] = React.useState('');
  const [parentContact, setParentContact] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  const reset = () => {
    setEmail('');
    setFullName('');
    setParentName('');
    setParentContact('');
  };

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onCreate({ email, fullName, parentName, parentContact });
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
      onClose={onClose}
      onConfirm={handleConfirm}
      title="Admit a Student"
      description="The Student's own login account is created automatically — they'll set their password via the password recovery flow."
      confirmLabel={submitting ? 'Admitting…' : 'Admit Student'}
    >
      <div className="flex flex-col gap-3">
        <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
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
