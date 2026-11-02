import React from 'react';
import { Badge } from '../../../shared/components';

const STATUS_TONE = {
  ACTIVE: 'success',
  ELIGIBLE_FOR_GRADUATION: 'accent',
  TRANSFERRED: 'warning',
  WITHDRAWN: 'neutral',
  GRADUATED: 'brand',
};

const STATUS_LABEL = {
  ACTIVE: 'Active',
  ELIGIBLE_FOR_GRADUATION: 'Eligible for Graduation',
  TRANSFERRED: 'Transferred',
  WITHDRAWN: 'Withdrawn',
  GRADUATED: 'Graduated',
};

export function StudentStatusBadge({ status }) {
  return <Badge tone={STATUS_TONE[status] || 'neutral'}>{STATUS_LABEL[status] || status}</Badge>;
}
