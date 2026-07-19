import React from 'react';
import { Badge } from '../../../shared/components';

const STATUS_TONE = {
  ACTIVE: 'success',
  LOCKED: 'danger',
  DEACTIVATED: 'neutral',
  MUST_CHANGE_CREDENTIALS: 'warning',
};

const STATUS_LABEL = {
  ACTIVE: 'Active',
  LOCKED: 'Locked',
  DEACTIVATED: 'Deactivated',
  MUST_CHANGE_CREDENTIALS: 'Setup pending',
};

export function AccountStatusBadge({ status }) {
  return <Badge tone={STATUS_TONE[status] || 'neutral'}>{STATUS_LABEL[status] || status}</Badge>;
}
