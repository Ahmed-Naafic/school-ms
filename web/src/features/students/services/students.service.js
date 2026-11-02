import { api } from '../../../shared/api/client';

// Mirrors backend/src/features/students/students.routes.js exactly.

export const listStudents = ({ status, classId, sectionId, page, pageSize } = {}) => {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (classId) params.set('classId', classId);
  if (sectionId) params.set('sectionId', sectionId);
  if (page) params.set('page', page);
  if (pageSize) params.set('pageSize', pageSize);
  const query = params.toString();
  return api.get(`/students${query ? `?${query}` : ''}`);
};

export const getStudent = (studentId) => api.get(`/students/${studentId}`);

export const admitStudent = (data) => api.post('/students', data);

export const enrollStudent = (studentId, data) => api.post(`/students/${studentId}/enrollments`, data);

export const promoteStudent = (studentId, data) => api.patch(`/students/${studentId}/promote`, data);

export const correctClass = (studentId, data) => api.patch(`/students/${studentId}/correct-class`, data);

export const transferStudent = (studentId, data) => api.patch(`/students/${studentId}/transfer`, data);

export const withdrawStudent = (studentId) => api.patch(`/students/${studentId}/withdraw`);

export const restoreWithdrawal = (studentId) => api.patch(`/students/${studentId}/restore-withdrawal`);

export const graduateStudent = (studentId) => api.patch(`/students/${studentId}/graduate`);

export const updateProfile = (studentId, data) => api.patch(`/students/${studentId}`, data);
