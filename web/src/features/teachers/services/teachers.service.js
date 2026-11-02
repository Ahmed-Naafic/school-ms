import { api } from '../../../shared/api/client';

// Mirrors backend/src/features/teachers/teachers.routes.js exactly.

export const listTeachers = ({ employmentStatus, page, pageSize } = {}) => {
  const params = new URLSearchParams();
  if (employmentStatus) params.set('employmentStatus', employmentStatus);
  if (page) params.set('page', page);
  if (pageSize) params.set('pageSize', pageSize);
  const query = params.toString();
  return api.get(`/teachers${query ? `?${query}` : ''}`);
};

export const getTeacher = (teacherId) => api.get(`/teachers/${teacherId}`);

export const onboardTeacher = (data) => api.post('/teachers', data);

export const updateTeacherProfile = (teacherId, data) => api.patch(`/teachers/${teacherId}`, data);

// --- Employment Status Transitions ------------------------------------------
// One function per named transition, per the Employment Status Transition
// Matrix — never a generic "set status" call.

export const placeOnLeave = (teacherId, data) => api.patch(`/teachers/${teacherId}/leave`, data);

export const returnFromLeave = (teacherId, data) => api.patch(`/teachers/${teacherId}/return-from-leave`, data);

export const resign = (teacherId, data) => api.patch(`/teachers/${teacherId}/resign`, data);

export const rehire = (teacherId, data) => api.patch(`/teachers/${teacherId}/rehire`, data);

export const terminate = (teacherId, data) => api.patch(`/teachers/${teacherId}/terminate`, data);

export const retire = (teacherId, data) => api.patch(`/teachers/${teacherId}/retire`, data);
