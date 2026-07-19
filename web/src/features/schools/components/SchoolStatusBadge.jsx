import React from 'react';
import { Badge } from '../../../shared/components';

const STATUS_TONE = { ACTIVE: 'success', SUSPENDED: 'warning', CLOSED: 'neutral' };
const STATUS_LABEL = { ACTIVE: 'Active', SUSPENDED: 'Suspended', CLOSED: 'Closed' };

export function SchoolStatusBadge({ status }) {
  return <Badge tone={STATUS_TONE[status] || 'neutral'}>{STATUS_LABEL[status] || status}</Badge>;
}
