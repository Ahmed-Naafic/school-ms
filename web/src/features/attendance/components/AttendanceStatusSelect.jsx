import React from 'react';
import { Select } from '../../../shared/components';

// Business Rule #5: exactly these four values, ever. NOT_RECORDED is
// deliberately absent — it is never a value a user can choose, only a
// read-time display state (see AttendanceStatusBadge).
const STATUS_OPTIONS = [
  { value: 'PRESENT', label: 'Present' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'LATE', label: 'Late' },
  { value: 'EXCUSED', label: 'Excused' },
];

export function AttendanceStatusSelect({ value, onChange, disabled }) {
  return (
    <Select
      value={value || 'PRESENT'}
      onChange={(e) => onChange(e.target.value)}
      options={STATUS_OPTIONS}
      disabled={disabled}
      className="min-w-[140px]"
    />
  );
}
