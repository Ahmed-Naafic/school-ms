import { api } from '../../../shared/api/client';

// Mirrors backend/src/features/schools/schools.routes.js exactly.

export const listSchools = () => api.get('/schools');

export const getSchool = (schoolId) => api.get(`/schools/${schoolId}`);

export const createSchool = (data) => api.post('/schools', data);

export const getPlatformStatistics = () => api.get('/schools/statistics');

export const updateCoreIdentity = (schoolId, name) => api.patch(`/schools/${schoolId}/identity`, { name });

export const updateOperationalProfile = (schoolId, fields) => api.patch(`/schools/${schoolId}/profile`, fields);

export const suspendSchool = (schoolId) => api.patch(`/schools/${schoolId}/suspend`);

export const reactivateSchool = (schoolId) => api.patch(`/schools/${schoolId}/reactivate`);

export const closeSchool = (schoolId) => api.patch(`/schools/${schoolId}/close`);

export const reopenSchool = (schoolId) => api.patch(`/schools/${schoolId}/reopen`);

export const updateSubscriptionStatus = (schoolId, subscriptionStatus) =>
  api.patch(`/schools/${schoolId}/subscription`, { subscriptionStatus });
