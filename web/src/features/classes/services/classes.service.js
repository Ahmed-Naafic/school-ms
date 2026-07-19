import { api } from '../../../shared/api/client';

// Mirrors backend/src/features/classes/classes.routes.js exactly.

export const listClasses = () => api.get('/classes');

export const getClass = (classId) => api.get(`/classes/${classId}`);

export const createClass = (data) => api.post('/classes', data);

export const updateClass = (classId, data) => api.patch(`/classes/${classId}`, data);

export const archiveClass = (classId) => api.patch(`/classes/${classId}/archive`);

export const reactivateClass = (classId) => api.patch(`/classes/${classId}/reactivate`);

export const reorderClass = (classId, position) => api.patch(`/classes/${classId}/sequence`, { position });

export const designateFinalClass = (classId) => api.patch(`/classes/${classId}/designate-final`);

export const createSection = (classId, data) => api.post(`/classes/${classId}/sections`, data);

export const updateSection = (classId, sectionId, data) =>
  api.patch(`/classes/${classId}/sections/${sectionId}`, data);

export const archiveSection = (classId, sectionId) =>
  api.patch(`/classes/${classId}/sections/${sectionId}/archive`);

export const reactivateSection = (classId, sectionId) =>
  api.patch(`/classes/${classId}/sections/${sectionId}/reactivate`);
