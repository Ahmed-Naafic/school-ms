import React from 'react';
import { Dialog, Input } from '../../../shared/components';

// Mirrors PATCH /teachers/{id}'s own field whitelist exactly — this dialog
// never offers employmentStatus, employeeId, schoolId, or accountId, since
// the backend rejects them outright (Guard by Construction).
export function EditTeacherDialog({ open, teacher, onClose, onSave }) {
  const [fullName, setFullName] = React.useState('');
  const [joiningDate, setJoiningDate] = React.useState('');
  const [contactPhone, setContactPhone] = React.useState('');
  const [contactAddress, setContactAddress] = React.useState('');
  const [employmentType, setEmploymentType] = React.useState('');
  const [qualifications, setQualifications] = React.useState('');
  const [subjectSpecializations, setSubjectSpecializations] = React.useState('');
  const [relevantExperience, setRelevantExperience] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open && teacher) {
      setFullName(teacher.fullName || '');
      setJoiningDate(teacher.joiningDate ? teacher.joiningDate.slice(0, 10) : '');
      setContactPhone(teacher.contactPhone || '');
      setContactAddress(teacher.contactAddress || '');
      setEmploymentType(teacher.employmentType || '');
      setQualifications(teacher.qualifications || '');
      setSubjectSpecializations((teacher.subjectSpecializations || []).join(', '));
      setRelevantExperience(teacher.relevantExperience || '');
    }
  }, [open, teacher]);

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onSave({
        fullName,
        joiningDate,
        contactPhone,
        contactAddress,
        employmentType,
        qualifications,
        subjectSpecializations: subjectSpecializations
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        relevantExperience,
      });
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
      title="Edit Teacher Profile"
      confirmLabel={submitting ? 'Saving…' : 'Save changes'}
      className="w-[min(520px,calc(100vw-48px))]"
    >
      <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
        <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
        <Input
          label="Joining date"
          type="date"
          value={joiningDate}
          onChange={(e) => setJoiningDate(e.target.value)}
        />
        <Input label="Employment type" value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} />
        <Input label="Contact phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        <Input label="Contact address" value={contactAddress} onChange={(e) => setContactAddress(e.target.value)} />
        <Input label="Qualifications" value={qualifications} onChange={(e) => setQualifications(e.target.value)} />
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
