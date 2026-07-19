import React from 'react';
import { Dialog, Input, Select } from '../../../shared/components';

export function OnboardTeacherDialog({ open, onClose, onCreate, departmentOptions }) {
  const [email, setEmail] = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [joiningDate, setJoiningDate] = React.useState('');
  const [contactPhone, setContactPhone] = React.useState('');
  const [contactAddress, setContactAddress] = React.useState('');
  const [employmentType, setEmploymentType] = React.useState('');
  const [departmentId, setDepartmentId] = React.useState('');
  const [qualifications, setQualifications] = React.useState('');
  const [subjectSpecializations, setSubjectSpecializations] = React.useState('');
  const [relevantExperience, setRelevantExperience] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  const reset = () => {
    setEmail('');
    setFullName('');
    setJoiningDate('');
    setContactPhone('');
    setContactAddress('');
    setEmploymentType('');
    setDepartmentId('');
    setQualifications('');
    setSubjectSpecializations('');
    setRelevantExperience('');
  };

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onCreate({
        email,
        fullName,
        joiningDate,
        contactPhone: contactPhone || undefined,
        contactAddress: contactAddress || undefined,
        employmentType: employmentType || undefined,
        departmentId: departmentId || undefined,
        qualifications: qualifications || undefined,
        subjectSpecializations: subjectSpecializations
          ? subjectSpecializations.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined,
        relevantExperience: relevantExperience || undefined,
      });
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
      title="Onboard a Teacher"
      description="The Teacher's own login account is created automatically — they'll set their password via the password recovery flow."
      confirmLabel={submitting ? 'Onboarding…' : 'Onboard Teacher'}
      className="w-[min(520px,calc(100vw-48px))]"
    >
      <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
        <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input
          label="Joining date"
          type="date"
          value={joiningDate}
          onChange={(e) => setJoiningDate(e.target.value)}
          required
        />
        <Select
          label="Department"
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          options={[{ value: '', label: 'No department' }, ...departmentOptions]}
        />
        <Input
          label="Employment type"
          value={employmentType}
          onChange={(e) => setEmploymentType(e.target.value)}
          hint="e.g. Full-time, Part-time"
        />
        <Input label="Contact phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        <Input label="Contact address" value={contactAddress} onChange={(e) => setContactAddress(e.target.value)} />
        <Input
          label="Qualifications"
          value={qualifications}
          onChange={(e) => setQualifications(e.target.value)}
        />
        <Input
          label="Subject specializations"
          value={subjectSpecializations}
          onChange={(e) => setSubjectSpecializations(e.target.value)}
          hint="Comma-separated, e.g. Math, Science"
        />
        <Input
          label="Relevant experience"
          value={relevantExperience}
          onChange={(e) => setRelevantExperience(e.target.value)}
        />
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
