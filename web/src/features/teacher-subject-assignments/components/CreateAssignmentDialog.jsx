import React from 'react';
import { Dialog, Input, Select } from '../../../shared/components';
import { formatClassSectionName } from '../../classes/utils/format-class-section-name';

// classes (full, nested-Section objects) is used only to build the Section
// picker for whichever Class is currently selected — classOptions (flat
// id/label pairs) still drives the Class picker itself, mirroring
// EnrollStudentDialog's own Class+Section handling exactly (Business Rule
// #23: a Section is required once the Class has active Sections, and
// forbidden when it has none).
export function CreateAssignmentDialog({
  open,
  onClose,
  onCreate,
  teacherOptions = [],
  subjectOptions = [],
  classOptions = [],
  classes = [],
  academicYearOptions = [],
}) {
  const [teacherId, setTeacherId] = React.useState('');
  const [subjectId, setSubjectId] = React.useState('');
  const [classId, setClassId] = React.useState('');
  const [sectionId, setSectionId] = React.useState('');
  const [academicYearId, setAcademicYearId] = React.useState('');
  const [effectiveStartDate, setEffectiveStartDate] = React.useState('');
  const [effectiveEndDate, setEffectiveEndDate] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setTeacherId(teacherOptions?.[0]?.value || '');
      setSubjectId(subjectOptions?.[0]?.value || '');
      setClassId(classOptions?.[0]?.value || '');
      setAcademicYearId(academicYearOptions?.[0]?.value || '');
      setEffectiveStartDate('');
      setEffectiveEndDate('');
      setError(null);
    }
  }, [open, teacherOptions, subjectOptions, classOptions, academicYearOptions]);

  const selectedClass = classes.find((c) => c.id === classId);
  const activeSections = (selectedClass?.sections || []).filter((s) => s.status === 'ACTIVE');
  const sectionOptions = activeSections.map((s) => ({
    value: s.id,
    label: formatClassSectionName(selectedClass.name, s.name),
  }));

  // A different Class's Sections are never valid for the newly-selected
  // Class — reset rather than silently carrying over a stale sectionId.
  React.useEffect(() => {
    setSectionId('');
  }, [classId]);

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onCreate({
        teacherId,
        subjectId,
        classId,
        sectionId: sectionId || undefined,
        academicYearId: academicYearId || undefined,
        effectiveStartDate,
        effectiveEndDate: effectiveEndDate || undefined,
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
      title="Create Teacher Subject Assignment"
      confirmLabel={submitting ? 'Creating…' : 'Create Assignment'}
    >
      <div className="flex flex-col gap-3">
        <Select
          label="Teacher"
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
          options={teacherOptions.length > 0 ? teacherOptions : [{ value: '', label: 'No active Teachers yet' }]}
          required
        />
        <Select
          label="Subject"
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          options={subjectOptions.length > 0 ? subjectOptions : [{ value: '', label: 'No Subjects assigned yet' }]}
          required
        />
        <Select label="Class" value={classId} onChange={(e) => setClassId(e.target.value)} options={classOptions} required />
        {sectionOptions.length > 0 && (
          <Select
            label="Section"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            options={[{ value: '', label: 'Select a Section' }, ...sectionOptions]}
            required
          />
        )}
        <Select
          label="Academic Year"
          value={academicYearId}
          onChange={(e) => setAcademicYearId(e.target.value)}
          options={
            academicYearOptions.length > 0
              ? academicYearOptions
              : [{ value: '', label: 'No Academic Years yet — create one first' }]
          }
          required
        />
        <Input
          label="Effective start date"
          type="date"
          value={effectiveStartDate}
          onChange={(e) => setEffectiveStartDate(e.target.value)}
          required
        />
        <Input
          label="Effective end date (optional)"
          type="date"
          value={effectiveEndDate}
          onChange={(e) => setEffectiveEndDate(e.target.value)}
        />
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
