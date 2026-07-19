import React from 'react';
import { Dialog, Select, Input } from '../../../shared/components';
import { formatClassSectionName } from '../../classes/utils/format-class-section-name';

// classes (full, nested-Section objects) is used only to build the Section
// picker for whichever Class is currently selected — classOptions (flat
// id/label pairs) still drives the Class picker itself, unchanged.
export function EnrollStudentDialog({ open, onClose, onEnroll, classOptions, classes = [] }) {
  const [classId, setClassId] = React.useState('');
  const [sectionId, setSectionId] = React.useState('');
  const [academicYear, setAcademicYear] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setClassId(classOptions?.[0]?.value || '');
      setAcademicYear('');
      setError(null);
    }
  }, [open, classOptions]);

  const selectedClass = classes.find((c) => c.id === classId);
  const activeSections = (selectedClass?.sections || []).filter((s) => s.status === 'ACTIVE');
  const sectionOptions = activeSections.map((s) => ({
    value: s.id,
    label: formatClassSectionName(selectedClass.name, s.name),
  }));

  // A different Class's Sections are never valid for the newly-selected
  // Class, per Student-Management.md Business Rule #18 — reset rather than
  // silently carrying over a stale sectionId.
  React.useEffect(() => {
    setSectionId('');
  }, [classId]);

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onEnroll({ classId, sectionId: sectionId || undefined, academicYear });
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
      title="Enroll Student"
      confirmLabel={submitting ? 'Enrolling…' : 'Enroll'}
    >
      <div className="flex flex-col gap-3">
        <Select label="Class" value={classId} onChange={(e) => setClassId(e.target.value)} options={classOptions} />
        {sectionOptions.length > 0 && (
          <Select
            label="Section"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            options={[{ value: '', label: 'Select a Section' }, ...sectionOptions]}
            required
          />
        )}
        <Input
          label="Academic year"
          placeholder="e.g. 2025/2026"
          value={academicYear}
          onChange={(e) => setAcademicYear(e.target.value)}
          required
        />
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
