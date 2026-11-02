import { api } from '../../../shared/api/client';

// Mirrors backend/src/features/academic-years/academic-years.routes.js exactly.

export const listAcademicYears = ({ status } = {}) => {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const query = params.toString();
  return api.get(`/academic-years${query ? `?${query}` : ''}`);
};

export const createAcademicYear = (data) => api.post('/academic-years', data);

export const updateAcademicYear = (id, data) => api.patch(`/academic-years/${id}`, data);

export const archiveAcademicYear = (id, newCurrentAcademicYearId) =>
  api.patch(`/academic-years/${id}/archive`, newCurrentAcademicYearId ? { newCurrentAcademicYearId } : undefined);

export const reactivateAcademicYear = (id) => api.patch(`/academic-years/${id}/reactivate`);

export const designateCurrentAcademicYear = (id) => api.patch(`/academic-years/${id}/current`);
