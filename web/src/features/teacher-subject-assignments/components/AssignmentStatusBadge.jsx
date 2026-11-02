import React from 'react';
import { Badge } from '../../../shared/components';

// Reflects the backend's own derived status (effectiveEndDate === null ?
// 'ACTIVE' : 'ENDED') — this component never re-derives it itself, per
// System-Architecture.md's Business Logic Ownership rule.
const STATUS_TONE = {
  ACTIVE: 'success',
  ENDED: 'neutral',
};

const STATUS_LABEL = {
  ACTIVE: 'Active',
  ENDED: 'Ended',
};

export function AssignmentStatusBadge({ status }) {
  return <Badge tone={STATUS_TONE[status] || 'neutral'}>{STATUS_LABEL[status] || status}</Badge>;
}
