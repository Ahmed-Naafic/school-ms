import { api } from '../../../shared/api/client';

// Mirrors backend/src/features/school-schedule/school-schedule.routes.js exactly.

export const getSchoolCalendar = () => api.get('/school-calendar');

export const updateSchoolCalendar = (workingDays) => api.patch('/school-calendar', { workingDays });

export const listShifts = ({ status } = {}) => {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const query = params.toString();
  return api.get(`/shifts${query ? `?${query}` : ''}`);
};

export const createShift = (data) => api.post('/shifts', data);

export const updateShift = (id, data) => api.patch(`/shifts/${id}`, data);

export const reorderShift = (id, position) => api.patch(`/shifts/${id}/sequence`, { position });

export const designateDefaultShift = (id) => api.patch(`/shifts/${id}/designate-default`);

export const archiveShift = (id) => api.patch(`/shifts/${id}/archive`);

export const reactivateShift = (id) => api.patch(`/shifts/${id}/reactivate`);

// --- Period (Architecture Update) ----------------------------------------------

export const listPeriods = (shiftId, { status } = {}) => {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const query = params.toString();
  return api.get(`/shifts/${shiftId}/periods${query ? `?${query}` : ''}`);
};

export const createPeriod = (shiftId, data) => api.post(`/shifts/${shiftId}/periods`, data);

export const updatePeriod = (id, data) => api.patch(`/periods/${id}`, data);

export const reorderPeriod = (id, position) => api.patch(`/periods/${id}/sequence`, { position });

export const archivePeriod = (id) => api.patch(`/periods/${id}/archive`);

export const reactivatePeriod = (id) => api.patch(`/periods/${id}/reactivate`);
