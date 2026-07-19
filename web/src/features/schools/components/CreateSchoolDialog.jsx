import React from 'react';
import { Dialog, Input } from '../../../shared/components';

export function CreateSchoolDialog({ open, onClose, onCreate }) {
  const [name, setName] = React.useState('');
  const [firstSchoolAdminEmail, setFirstSchoolAdminEmail] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onCreate({ name, firstSchoolAdminEmail });
      setName('');
      setFirstSchoolAdminEmail('');
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
      title="Onboard a school"
      description="Only the school's name and its first School Admin's email are required to get started."
      confirmLabel={submitting ? 'Creating…' : 'Create school'}
    >
      <div className="flex flex-col gap-3">
        <Input label="School name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input
          label="First School Admin email"
          type="email"
          value={firstSchoolAdminEmail}
          onChange={(e) => setFirstSchoolAdminEmail(e.target.value)}
          required
        />
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
