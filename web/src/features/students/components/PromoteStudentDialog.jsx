import React from 'react';
import { Dialog, Select } from '../../../shared/components';
import { formatClassSectionName } from '../../classes/utils/format-class-section-name';

// classes (full, nested-Section objects) builds the Section picker for an
// explicitly-chosen destination Class. When the Class is left as "Suggested
// next Class (default)", the destination Class itself isn't known until the
// backend resolves it, so no Section picker can be shown — the backend's own
// same-name Section matching (Business Rule #19) still applies in that case,
// it's just not previewable here.
// (ACR-004) academicYearOptions — flat id/label pairs sourced from Academic
// Year Management's own ACTIVE list. Leaving the field as the default
// ("Current Academic Year") omits academicYearId entirely, letting the
// backend resolve it to the school's Current Academic Year (Business Rule
// #23) — the same "leave as default" pattern the Class picker already uses.
export function PromoteStudentDialog({ open, onClose, onPromote, classOptions, classes = [], academicYearOptions = [] }) {
  const [classId, setClassId] = React.useState('');
  const [sectionId, setSectionId] = React.useState('');
  const [academicYearId, setAcademicYearId] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setClassId('');
      setAcademicYearId('');
      setError(null);
    }
  }, [open]);

  React.useEffect(() => {
    setSectionId('');
  }, [classId]);

  const options = [{ value: '', label: 'Suggested next Class (default)' }, ...(classOptions || [])];
  const academicYearSelectOptions = [
    { value: '', label: 'Current Academic Year (default)' },
    ...academicYearOptions,
  ];

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
      await onPromote({
        classId: classId || undefined,
        sectionId: sectionId || undefined,
        academicYearId: academicYearId || undefined,
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
        <Select
          label="Academic Year"
          value={academicYearId}
          onChange={(e) => setAcademicYearId(e.target.value)}
          options={academicYearSelectOptions}
        />
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
