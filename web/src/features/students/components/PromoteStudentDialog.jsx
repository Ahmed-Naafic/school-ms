import React from 'react';
import { Dialog, Select, Input } from '../../../shared/components';
import { formatClassSectionName } from '../../classes/utils/format-class-section-name';

// classes (full, nested-Section objects) builds the Section picker for an
// explicitly-chosen destination Class. When the Class is left as "Suggested
// next Class (default)", the destination Class itself isn't known until the
// backend resolves it, so no Section picker can be shown — the backend's own
// same-name Section matching (Business Rule #19) still applies in that case,
// it's just not previewable here.
export function PromoteStudentDialog({ open, onClose, onPromote, classOptions, classes = [] }) {
  const [classId, setClassId] = React.useState('');
  const [sectionId, setSectionId] = React.useState('');
  const [academicYear, setAcademicYear] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setClassId('');
      setAcademicYear('');
      setError(null);
    }
  }, [open]);

  React.useEffect(() => {
    setSectionId('');
  }, [classId]);

  const options = [{ value: '', label: 'Suggested next Class (default)' }, ...(classOptions || [])];

  const selectedClass = classId ? classes.find((c) => c.id === classId) : null;
  const activeSections = (selectedClass?.sections || []).filter((s) => s.status === 'ACTIVE');
  const sectionOptions = activeSections.map((s) => ({
    value: s.id,
    label: formatClassSectionName(selectedClass.name, s.name),
  }));

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onPromote({ classId: classId || undefined, sectionId: sectionId || undefined, academicYear });
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
      title="Promote Student"
      description="Leave the Class as the default to use Class Management's suggested next Class, or choose a different destination."
      confirmLabel={submitting ? 'Promoting…' : 'Promote'}
    >
      <div className="flex flex-col gap-3">
        <Select label="Destination Class" value={classId} onChange={(e) => setClassId(e.target.value)} options={options} />
        {selectedClass && sectionOptions.length > 0 && (
          <Select
            label="Destination Section"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            options={[{ value: '', label: 'Suggested Section (default)' }, ...sectionOptions]}
          />
        )}
        <Input
          label="Academic year"
          placeholder="e.g. 2026/2027"
          value={academicYear}
          onChange={(e) => setAcademicYear(e.target.value)}
          required
        />
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
