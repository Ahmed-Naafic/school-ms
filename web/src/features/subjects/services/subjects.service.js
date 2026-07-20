import { api } from '../../../shared/api/client';

// Mirrors backend/src/features/subjects/subjects.routes.js exactly.

export const listSubjects = ({ educationLevel, status } = {}) => {
  const params = new URLSearchParams();
  if (educationLevel) params.set('educationLevel', educationLevel);
  if (status) params.set('status', status);
  const query = params.toString();
  return api.get(`/subjects${query ? `?${query}` : ''}`);
};

export const createSubject = (data) => api.post('/subjects', data);

export const updateSubject = (subjectId, data) => api.patch(`/subjects/${subjectId}`, data);

export const archiveSubject = (subjectId) => api.patch(`/subjects/${subjectId}/archive`);

export const reactivateSubject = (subjectId) => api.patch(`/subjects/${subjectId}/reactivate`);

// --- School <-> Subject assignment ------------------------------------------

export const listSchoolSubjects = (schoolId) => api.get(`/schools/${schoolId}/subjects`);

export const assignSubjectToSchool = (schoolId, subjectId) =>
  api.post(`/schools/${schoolId}/subjects/${subjectId}`);

export const removeSubjectFromSchool = (schoolId, subjectId) =>
  api.delete(`/schools/${schoolId}/subjects/${subjectId}`);
