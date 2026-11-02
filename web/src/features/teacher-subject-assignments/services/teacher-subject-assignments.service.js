import { api } from '../../../shared/api/client';

// Mirrors backend/src/features/teacher-subject-assignments/teacher-subject-assignments.routes.js exactly.

export const listAssignments = ({
  academicYearId,
  teacherId,
  subjectId,
  classId,
  sectionId,
  page,
  pageSize,
} = {}) => {
  const params = new URLSearchParams();
  if (academicYearId) params.set('academicYearId', academicYearId);
  if (teacherId) params.set('teacherId', teacherId);
  if (subjectId) params.set('subjectId', subjectId);
  if (classId) params.set('classId', classId);
  if (sectionId) params.set('sectionId', sectionId);
  if (page) params.set('page', page);
  if (pageSize) params.set('pageSize', pageSize);
  const query = params.toString();
  return api.get(`/teacher-subject-assignments${query ? `?${query}` : ''}`);
};

// UI Redesign — this feature's own true responsibility, Teacher -> Subject
// -> Classes. A pure read-side presentation of the same Active assignments
// listAssignments already returns.
export const getGroupedAssignments = (academicYearId) => {
  const query = academicYearId ? `?academicYearId=${academicYearId}` : '';
  return api.get(`/teacher-subject-assignments/grouped${query}`);
};

export const getAssignment = (id) => api.get(`/teacher-subject-assignments/${id}`);

export const createAssignment = (data) => api.post('/teacher-subject-assignments', data);

export const correctAssignment = (id, data) => api.patch(`/teacher-subject-assignments/${id}`, data);

export const replaceTeacher = (id, data) => api.post(`/teacher-subject-assignments/${id}/replace-teacher`, data);

export const copyAssignments = (data) => api.post('/teacher-subject-assignments/copy', data);
