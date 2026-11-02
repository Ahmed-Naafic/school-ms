import React from 'react';
import { Dialog, Input, Select } from '../../../shared/components';
import { useAuth } from '../../../shared/auth/AuthContext';

// Role options mirror the backend's role-creation matrix exactly
// (auth.service.js's createAccount), per Authentication-and-Authorization.md's
// Permissions section.
const ROLE_OPTIONS_BY_ACTOR = {
  SUPER_ADMIN: [
    { value: 'SCHOOL_ADMIN', label: 'School Admin' },
    { value: 'SUPER_ADMIN', label: 'Super Admin' },
  ],
  SCHOOL_ADMIN: [
    { value: 'ACCOUNTANT', label: 'Accountant' },
    { value: 'TEACHER', label: 'Teacher' },
    { value: 'STUDENT', label: 'Student' },
  ],
};

export function CreateAccountDialog({ open, onClose, onCreate, schoolOptions }) {
  const { account } = useAuth();
  const roleOptions = ROLE_OPTIONS_BY_ACTOR[account.role] || [];

  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState(roleOptions[0]?.value || '');
  const [schoolId, setSchoolId] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  const needsSchoolPicker = account.role === 'SUPER_ADMIN' && role === 'SCHOOL_ADMIN';

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onCreate({ email, role, schoolId: needsSchoolPicker ? schoolId : undefined });
      setEmail('');
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
      title="Create account"
      description="The new user will set their own password via the password recovery flow."
      confirmLabel={submitting ? 'Creating…' : 'Create account'}
    >
      <div className="flex flex-col gap-3">
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Select label="Role" value={role} onChange={(e) => setRole(e.target.value)} options={roleOptions} />
        {needsSchoolPicker && (
          <Select
            label="School"
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
            options={(schoolOptions || []).map((s) => ({ value: s.id, label: s.name }))}
          />
        )}
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
