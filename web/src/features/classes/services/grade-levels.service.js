import { api } from '../../../shared/api/client';

// (ACR-009, Architecture Update — Grade/Form) Mirrors
// backend/src/features/classes/classes.routes.js's gradeLevelsRouter exactly.

export const listGradeLevels = () => api.get('/grade-levels');

export const getGradeLevel = (gradeLevelId) => api.get(`/grade-levels/${gradeLevelId}`);

export const createGradeLevel = (data) => api.post('/grade-levels', data);

export const updateGradeLevel = (gradeLevelId, data) => api.patch(`/grade-levels/${gradeLevelId}`, data);

export const reorderGradeLevel = (gradeLevelId, position) =>
  api.patch(`/grade-levels/${gradeLevelId}/sequence`, { position });

export const archiveGradeLevel = (gradeLevelId) => api.patch(`/grade-levels/${gradeLevelId}/archive`);

export const reactivateGradeLevel = (gradeLevelId) => api.patch(`/grade-levels/${gradeLevelId}/reactivate`);
