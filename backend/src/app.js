const express = require('express');
const cors = require('cors');
const errorHandler = require('./middlewares/error-handler');
const authRoutes = require('./features/auth');
const schoolsRoutes = require('./features/schools');
const { classesRouter, gradeLevelsRouter } = require('./features/classes');
const studentsRoutes = require('./features/students');
const { teachersRouter } = require('./features/teachers');
const { subjectsRouter, schoolSubjectsRouter } = require('./features/subjects');
const academicYearsRoutes = require('./features/academic-years');
const teacherSubjectAssignmentsRoutes = require('./features/teacher-subject-assignments');
const { schoolCalendarRouter, shiftsRouter, periodsRouter, schoolScheduleAdminRouter } = require('./features/school-schedule');
const {
  lessonsRouter,
  lessonGroupsRouter,
  timetableRouter,
  teacherPreferenceRouter,
  subjectPreferenceRouter,
  optimizationSettingsRouter,
  timetableAdminRouter,
} = require('./features/timetable');
const weeklySubjectAllocationsRoutes = require('./features/weekly-subject-allocations');
const attendanceRoutes = require('./features/attendance');

const app = express();

app.use(cors());
app.use(express.json());

// Versioned REST API, per API-Standards.md.
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/schools', schoolsRoutes);
app.use('/api/v1/classes', classesRouter);
app.use('/api/v1/grade-levels', gradeLevelsRouter);
app.use('/api/v1/students', studentsRoutes);
// teacherPreferenceRouter is mounted at the SAME /api/v1/teachers prefix as
// teachersRouter, but MUST come first: teachersRouter's own router applies
// requireRole('SCHOOL_ADMIN') as blanket, path-less middleware after its own
// /me route, which runs unconditionally for anything reaching that point in
// ITS chain — including a request meant for a route only THIS router
// defines (e.g. GET /teachers/me/schedule-preference for a TEACHER caller).
// Express only falls through to the next router mounted at a prefix when
// nothing in the current one has already ended the request; a blanket
// role-gate ends it (with a 403) before that fallthrough can happen, even
// though teachersRouter itself has no matching route for that path. Mounting
// the narrower router first avoids ever reaching that gate for its own
// routes, while anything neither router recognizes still falls through to
// teachersRouter's own 404 handling unchanged.
app.use('/api/v1/teachers', teacherPreferenceRouter);
app.use('/api/v1/teachers', teachersRouter);
app.use('/api/v1/subjects', subjectsRouter);
app.use('/api/v1/schools/:schoolId/subjects', schoolSubjectsRouter);
app.use('/api/v1/academic-years', academicYearsRoutes);
// Same reasoning as teacherPreferenceRouter above — Teacher Subject
// Assignment's own router also applies requireRole('SCHOOL_ADMIN') as
// blanket middleware after its own /me route.
app.use('/api/v1/teacher-subject-assignments', subjectPreferenceRouter);
app.use('/api/v1/teacher-subject-assignments', teacherSubjectAssignmentsRoutes);
app.use('/api/v1/school-calendar', schoolCalendarRouter);
app.use('/api/v1/shifts', shiftsRouter);
app.use('/api/v1/periods', periodsRouter);
app.use('/api/v1/schools/:schoolId', schoolScheduleAdminRouter);
app.use('/api/v1/lessons', lessonsRouter);
app.use('/api/v1/lesson-groups', lessonGroupsRouter);
app.use('/api/v1/timetable', timetableRouter);
// A top-level, singleton path — NOT nested under /api/v1/schools/:schoolId,
// the same reason /api/v1/school-calendar is its own top-level path rather
// than /api/v1/schools/school-calendar: nesting it would risk colliding with
// the schoolScheduleAdminRouter's own :schoolId param mount above.
app.use('/api/v1/school-optimization-settings', optimizationSettingsRouter);
app.use('/api/v1/schools/:schoolId/timetable', timetableAdminRouter);
app.use('/api/v1/weekly-subject-allocations', weeklySubjectAllocationsRoutes);
app.use('/api/v1/attendance', attendanceRoutes);

app.get('/api/v1/health', (req, res) => {
  res.json({ success: true, message: 'OK', data: null, metadata: null });
});

// Must be registered last, per Express convention.
app.use(errorHandler);

module.exports = app;
