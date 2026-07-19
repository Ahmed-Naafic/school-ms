import React from 'react';
import { Dialog, Select, Input } from '../../../shared/components';
import { formatClassSectionName } from '../../classes/utils/format-class-section-name';

export function CorrectClassDialog({ open, onClose, onCorrect, classOptions, classes = [] }) {
  const [classId, setClassId] = React.useState('');
  const [sectionId, setSectionId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setClassId(classOptions?.[0]?.value || '');
      setReason('');
      setError(null);
    }
  }, [open, classOptions]);

  const selectedClass = classes.find((c) => c.id === classId);
  const activeSections = (selectedClass?.sections || []).filter((s) => s.status === 'ACTIVE');
  const sectionOptions = activeSections.map((s) => ({
    value: s.id,
    label: formatClassSectionName(selectedClass.name, s.name),
  }));

  React.useEffect(() => {
    setSectionId('');
  }, [classId]);

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onCorrect({ classId, sectionId: sectionId || undefined, reason: reason || undefined });
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
      title="Correct Class"
      description="Fixes a data-entry mistake in the Student's current Class. This is not a Promotion — it creates no new Enrollment, no new academic year, and does not affect Graduation eligibility."
      confirmLabel={submitting ? 'Correcting…' : 'Correct Class'}
    >
      <div className="flex flex-col gap-3">
        <Select label="Correct Class" value={classId} onChange={(e) => setClassId(e.target.value)} options={classOptions} />
        {sectionOptions.length > 0 && (
          <Select
            label="Section"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            options={[{ value: '', label: 'Select a Section' }, ...sectionOptions]}
            required
          />
        )}
        <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
