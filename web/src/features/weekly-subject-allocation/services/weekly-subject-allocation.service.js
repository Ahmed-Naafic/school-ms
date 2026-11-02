import { api } from '../../../shared/api/client';

// Mirrors
// backend/src/features/weekly-subject-allocations/weekly-subject-allocations.routes.js
// exactly.

export const listAllocations = ({ academicYearId, gradeLevelId } = {}) => {
  const params = new URLSearchParams();
  if (academicYearId) params.set('academicYearId', academicYearId);
  if (gradeLevelId) params.set('gradeLevelId', gradeLevelId);
  const query = params.toString();
  return api.get(`/weekly-subject-allocations${query ? `?${query}` : ''}`);
};

export const getAllocation = (allocationId) => api.get(`/weekly-subject-allocations/${allocationId}`);

// A read-only preview of the calculated available-periods figure, for the
// Create flow before any allocation exists yet to derive one from.
export const getAvailablePeriodsPreview = (gradeLevelId) =>
  api.get(`/weekly-subject-allocations/available-periods-preview?gradeLevelId=${gradeLevelId}`);

// Every Subject assigned to the school matching the Grade/Form's own
// Education Level, each with the distinct Teachers currently teaching it
// anywhere in that Grade/Form's own Classes.
export const listEligibleSubjects = (gradeLevelId, academicYearId) =>
  api.get(`/weekly-subject-allocations/eligible-subjects?gradeLevelId=${gradeLevelId}&academicYearId=${academicYearId}`);

export const createAllocation = (data) => api.post('/weekly-subject-allocations', data);

export const correctAllocation = (allocationId, data) =>
  api.patch(`/weekly-subject-allocations/${allocationId}`, data);
