import { api } from '../../../shared/api/client';

// Mirrors backend/src/features/timetable/timetable.routes.js exactly.

// --- Lesson writes --------------------------------------------------------------

export const createLesson = (data) => api.post('/lessons', data);

export const updateLesson = (id, data) => api.patch(`/lessons/${id}`, data);

export const archiveLesson = (id) => api.patch(`/lessons/${id}/archive`);

export const reactivateLesson = (id) => api.patch(`/lessons/${id}/reactivate`);

// Architecture Update (Generation-First)
export const lockLesson = (id) => api.patch(`/lessons/${id}/lock`);
export const unlockLesson = (id) => api.patch(`/lessons/${id}/unlock`);
export const splitLessonGroup = (groupId) => api.patch(`/lesson-groups/${groupId}/split`);

// --- Views ------------------------------------------------------------------------

// includeArchived=true also returns a cancelled Lesson (with a Restore
// action available in the UI) — the Master Timetable's own management page
// always passes this; read-only views never do.
export const getMasterTimetable = ({ includeArchived } = {}) =>
  api.get(`/timetable/master${includeArchived ? '?includeArchived=true' : ''}`);

export const getClassTimetable = (classId) => api.get(`/timetable/classes/${classId}`);

export const getTeacherTimetable = (teacherId) => api.get(`/timetable/teachers/${teacherId}`);

export const getOwnTimetable = () => api.get('/timetable/me');

// --- Printing / PDF export (returns a Blob for download) -------------------------
// fetch is used directly here (not the shared api client) since a PDF
// response isn't the { success, data } JSON envelope api.get expects — the
// access token is read from the same storage key AuthContext itself uses
// ('sms.auth'), the only place the current session lives.

async function downloadPdf(path, filename) {
  const session = JSON.parse(localStorage.getItem('sms.auth') || 'null');
  const response = await fetch(`/api/v1${path}`, {
    headers: { Authorization: `Bearer ${session ? session.accessToken : ''}` },
  });
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

export const downloadMasterTimetablePdf = () => downloadPdf('/timetable/master/pdf', 'master-timetable.pdf');
export const downloadClassTimetablePdf = (classId) =>
  downloadPdf(`/timetable/classes/${classId}/pdf`, 'class-timetable.pdf');
export const downloadTeacherTimetablePdf = (teacherId) =>
  downloadPdf(`/timetable/teachers/${teacherId}/pdf`, 'teacher-timetable.pdf');
export const downloadOwnTimetablePdf = () => downloadPdf('/timetable/me/pdf', 'my-timetable.pdf');

// --- Preferences and Optimization Settings ----------------------------------------

export const getTeacherPreference = (teacherId) => api.get(`/teachers/${teacherId}/schedule-preference`);
export const updateTeacherPreference = (teacherId, data) => api.put(`/teachers/${teacherId}/schedule-preference`, data);

export const getOwnTeacherPreference = () => api.get('/teachers/me/schedule-preference');
export const updateOwnTeacherPreference = (data) => api.put('/teachers/me/schedule-preference', data);

export const getSubjectPreference = (assignmentId) =>
  api.get(`/teacher-subject-assignments/${assignmentId}/schedule-preference`);
export const updateSubjectPreference = (assignmentId, data) =>
  api.put(`/teacher-subject-assignments/${assignmentId}/schedule-preference`, data);

export const getOptimizationSettings = () => api.get('/school-optimization-settings');
export const updateOptimizationSettings = (data) => api.patch('/school-optimization-settings', data);

// --- Quality Score (illustrative) --------------------------------------------------

export const getQualityScore = () => api.get('/timetable/quality-score');

// (Teacher weekly capacity Hard Constraint, Business Rule #30) A proactive
// check — every Teacher with an Active assignment for the Academic Year,
// their own committed weekly periods vs. their own weekly capacity, and
// whether they're over it. The same figures generation's own pre-flight
// gate blocks on, available here on demand before ever clicking Generate.
export const getTeacherCapacityReport = () => api.get('/timetable/teacher-capacity-check');

// --- Generation (Architecture Update — Generation-First) --------------------------
// Generation runs as a background job — startGeneration returns a jobId
// immediately; the caller polls getGenerationJob until status is COMPLETED
// or FAILED, per Technical Design's own Job Execution Model.

export const startGeneration = (scope, academicYearId) =>
  api.post('/timetable/generate', { scope, ...(academicYearId ? { academicYearId } : {}) });

export const getGenerationJob = (jobId) => api.get(`/timetable/generation-jobs/${jobId}`);

export const listGenerationJobs = () => api.get('/timetable/generation-jobs');

// --- Publish (Architecture Update) -------------------------------------------------

export const publishTimetable = (academicYearId) =>
  api.post('/timetable/publish', academicYearId ? { academicYearId } : {});
