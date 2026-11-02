import React from 'react';
import { Dialog, Select } from '../../../shared/components';
import * as classesService from '../../classes/services/classes.service';
import * as teachersService from '../../teachers/services/teachers.service';

const TITLES = { export: 'Export PDF', print: 'Print', view: 'View Timetable' };
const CONFIRM_LABELS = { export: 'Export', print: 'Print', view: 'View' };
const QUESTION_LABELS = { export: 'What do you want to export?', print: 'What do you want to print?', view: 'What do you want to view?' };

// Shared by the Print, Export PDF, and View toolbar actions — all three
// offer the identical three targets (Entire School, Class, Teacher). View
// is the on-screen-only counterpart to Print/Export: it's the only way to
// reach a Class's or Teacher's own read-only Timetable page without also
// triggering a print or a download, since those two actions' own routes are
// otherwise the sole path to that page.
export function PrintExportPicker({ open, mode, onClose, onConfirm }) {
  // View has no "Entire School" option — you're already viewing the Master
  // Timetable on-screen when this dialog opens, so there is nothing extra
  // that choice would do; default straight to Class instead.
  const defaultScopeType = mode === 'view' ? 'CLASS' : 'SCHOOL';
  const [scopeType, setScopeType] = React.useState(defaultScopeType);
  const [classId, setClassId] = React.useState('');
  const [teacherId, setTeacherId] = React.useState('');
  const [classes, setClasses] = React.useState([]);
  const [teachers, setTeachers] = React.useState([]);

  React.useEffect(() => {
    if (!open) return;
    setScopeType(defaultScopeType);
    setClassId('');
    setTeacherId('');
    (async () => {
      const [classList, teacherList] = await Promise.all([classesService.listClasses(), teachersService.listTeachers({})]);
      setClasses(classList);
      setTeachers(teacherList);
    })();
  }, [open]);

  const valid = (mode !== 'view' && scopeType === 'SCHOOL') || (scopeType === 'CLASS' && classId) || (scopeType === 'TEACHER' && teacherId);

  const handleConfirm = () => {
    if (!valid) return;
    onConfirm({ type: scopeType, classId, teacherId });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onConfirm={handleConfirm}
      title={TITLES[mode]}
      confirmLabel={CONFIRM_LABELS[mode]}
    >
      <div className="flex flex-col gap-3">
        <Select
          label={QUESTION_LABELS[mode]}
          options={[
            ...(mode === 'view' ? [] : [{ value: 'SCHOOL', label: 'Entire School (Master Timetable)' }]),
            { value: 'CLASS', label: 'One Class' },
            { value: 'TEACHER', label: 'One Teacher' },
          ]}
          value={scopeType}
          onChange={(e) => setScopeType(e.target.value)}
        />
        {scopeType === 'CLASS' && (
          <Select
            label="Class"
            options={[{ value: '', label: 'Select…' }, ...classes.map((c) => ({ value: c.id, label: c.name }))]}
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          />
        )}
        {scopeType === 'TEACHER' && (
          <Select
            label="Teacher"
            options={[{ value: '', label: 'Select…' }, ...teachers.map((t) => ({ value: t.id, label: t.fullName }))]}
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
          />
        )}
      </div>
    </Dialog>
  );
}
