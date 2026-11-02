const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const requireCredentialsEstablished = require('../../middlewares/require-credentials-established');
const { requireRole } = require('../../middlewares/authorize');
const controller = require('./school-schedule.controller');

// Own view — School-scoped, resolved from the authenticated token, never a
// client-supplied schoolId. GETs additionally permit TEACHER (read-only),
// per the Business Specification's Permissions section; every write is
// School-Admin-only.

const schoolCalendarRouter = express.Router();
schoolCalendarRouter.use(authenticate);
schoolCalendarRouter.use(requireCredentialsEstablished);
schoolCalendarRouter.get('/', requireRole('SCHOOL_ADMIN', 'TEACHER'), controller.getSchoolCalendar);
schoolCalendarRouter.patch('/', requireRole('SCHOOL_ADMIN'), controller.updateSchoolCalendar);

const shiftsRouter = express.Router();
shiftsRouter.use(authenticate);
shiftsRouter.use(requireCredentialsEstablished);
shiftsRouter.get('/', requireRole('SCHOOL_ADMIN', 'TEACHER'), controller.listShifts);
shiftsRouter.get('/:shiftId', requireRole('SCHOOL_ADMIN', 'TEACHER'), controller.getShiftById);
shiftsRouter.post('/', requireRole('SCHOOL_ADMIN'), controller.createShift);
shiftsRouter.patch('/:shiftId', requireRole('SCHOOL_ADMIN'), controller.updateShift);
shiftsRouter.patch('/:shiftId/sequence', requireRole('SCHOOL_ADMIN'), controller.reorderShift);
shiftsRouter.patch('/:shiftId/designate-default', requireRole('SCHOOL_ADMIN'), controller.designateDefaultShift);
shiftsRouter.patch('/:shiftId/archive', requireRole('SCHOOL_ADMIN'), controller.archiveShift);
shiftsRouter.patch('/:shiftId/reactivate', requireRole('SCHOOL_ADMIN'), controller.reactivateShift);

// (Architecture Update — Periods) Nested under their own Shift, the same
// "child belongs to exactly one parent, never referenced independently of
// it in the URL" shape Class Management's own /classes/{id}/sections uses.
shiftsRouter.get('/:shiftId/periods', requireRole('SCHOOL_ADMIN', 'TEACHER'), controller.listPeriods);
shiftsRouter.post('/:shiftId/periods', requireRole('SCHOOL_ADMIN'), controller.createPeriod);

// (Architecture Update — Periods) Flat detail/write routes once a periodId is
// known, mirroring GET /shifts/{id} and Class Management's own /sections/{id}
// precedent — the parent shiftId is resolved server-side from the Period's
// own row, not re-supplied in the path.
const periodsRouter = express.Router();
periodsRouter.use(authenticate);
periodsRouter.use(requireCredentialsEstablished);
periodsRouter.get('/:periodId', requireRole('SCHOOL_ADMIN', 'TEACHER'), controller.getPeriodById);
periodsRouter.patch('/:periodId', requireRole('SCHOOL_ADMIN'), controller.updatePeriod);
periodsRouter.patch('/:periodId/sequence', requireRole('SCHOOL_ADMIN'), controller.reorderPeriod);
periodsRouter.patch('/:periodId/archive', requireRole('SCHOOL_ADMIN'), controller.archivePeriod);
periodsRouter.patch('/:periodId/reactivate', requireRole('SCHOOL_ADMIN'), controller.reactivatePeriod);

// --- Super Admin oversight (read-only), mirroring Subject Management's own
// /schools/{schoolId}/subjects nested-route precedent — no write route
// exists at this path, per Business Rule #19. mergeParams is required for
// :schoolId from the parent mount path (app.js) to reach req.params here,
// the same requirement Subject Management's own schoolSubjectsRouter
// already established.
const schoolScheduleAdminRouter = express.Router({ mergeParams: true });
schoolScheduleAdminRouter.use(authenticate);
schoolScheduleAdminRouter.use(requireCredentialsEstablished);
schoolScheduleAdminRouter.use(requireRole('SUPER_ADMIN'));
schoolScheduleAdminRouter.get('/school-calendar', controller.getSchoolCalendarForSchool);
schoolScheduleAdminRouter.get('/shifts', controller.listShiftsForSchool);
schoolScheduleAdminRouter.get('/shifts/:shiftId/periods', controller.listPeriodsForSchool);

module.exports = { schoolCalendarRouter, shiftsRouter, periodsRouter, schoolScheduleAdminRouter };
