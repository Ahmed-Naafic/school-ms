import React from 'react';
import { Badge } from '../../../shared/components';

// NOT_RECORDED is never a stored status (Business Rule #25) — it only ever
// appears here as a derived display value the backend computes at read time
// from the absence of a row (Technical Design Section N).
const TONE_BY_STATUS = {
  PRESENT: 'success',
  LATE: 'warning',
  ABSENT: 'danger',
  EXCUSED: 'brand',
  NOT_RECORDED: 'neutral',
};

const LABEL_BY_STATUS = {
  PRESENT: 'Present',
  LATE: 'Late',
  ABSENT: 'Absent',
  EXCUSED: 'Excused',
  NOT_RECORDED: 'Not recorded',
};

export function AttendanceStatusBadge({ status }) {
  return <Badge tone={TONE_BY_STATUS[status] || 'neutral'}>{LABEL_BY_STATUS[status] || status}</Badge>;
}
