import React from 'react';
import { Badge } from '../../../shared/components';

const STATUS_TONE = { ACTIVE: 'success', ARCHIVED: 'neutral' };
const STATUS_LABEL = { ACTIVE: 'Active', ARCHIVED: 'Archived' };

export function DepartmentStatusBadge({ status }) {
  return <Badge tone={STATUS_TONE[status] || 'neutral'}>{STATUS_LABEL[status] || status}</Badge>;
}
