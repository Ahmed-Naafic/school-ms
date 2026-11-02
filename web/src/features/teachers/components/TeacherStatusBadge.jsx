import React from 'react';
import { Badge } from '../../../shared/components';

const STATUS_TONE = {
  ACTIVE: 'success',
  ON_LEAVE: 'warning',
  RESIGNED: 'neutral',
  TERMINATED: 'danger',
  RETIRED: 'brand',
};

const STATUS_LABEL = {
  ACTIVE: 'Active',
  ON_LEAVE: 'On Leave',
  RESIGNED: 'Resigned',
  TERMINATED: 'Terminated',
  RETIRED: 'Retired',
};

export function TeacherStatusBadge({ status }) {
  return <Badge tone={STATUS_TONE[status] || 'neutral'}>{STATUS_LABEL[status] || status}</Badge>;
}
