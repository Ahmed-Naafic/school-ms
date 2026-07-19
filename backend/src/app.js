const express = require('express');
const cors = require('cors');
const errorHandler = require('./middlewares/error-handler');
const authRoutes = require('./features/auth');
const schoolsRoutes = require('./features/schools');
const classesRoutes = require('./features/classes');
const studentsRoutes = require('./features/students');
const { teachersRouter, departmentsRouter } = require('./features/teachers');

const app = express();

app.use(cors());
app.use(express.json());

// Versioned REST API, per API-Standards.md.
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/schools', schoolsRoutes);
app.use('/api/v1/classes', classesRoutes);
app.use('/api/v1/students', studentsRoutes);
app.use('/api/v1/teachers', teachersRouter);
// Department reference list is owned by the teachers module (Technical
// Design's Backend Design section) but exposed at its own flat path, since
// a Department belongs to the school, not to any single Teacher instance.
app.use('/api/v1/departments', departmentsRouter);

app.get('/api/v1/health', (req, res) => {
  res.json({ success: true, message: 'OK', data: null, metadata: null });
});

// Must be registered last, per Express convention.
app.use(errorHandler);

module.exports = app;
