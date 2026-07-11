const express = require('express');
const cors = require('cors');
const errorHandler = require('./middlewares/error-handler');
const authRoutes = require('./features/auth');
const schoolsRoutes = require('./features/schools');

const app = express();

app.use(cors());
app.use(express.json());

// Versioned REST API, per API-Standards.md.
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/schools', schoolsRoutes);

app.get('/api/v1/health', (req, res) => {
  res.json({ success: true, message: 'OK', data: null, metadata: null });
});

// Must be registered last, per Express convention.
app.use(errorHandler);

module.exports = app;
