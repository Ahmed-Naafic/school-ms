const { ValidationError } = require('../../shared/errors');

// Server-side validation only — never trust client input, per
// Coding-Standards.md. Shape-only here; whether a workingDays configuration
// or a Shift's time range is *eligible* (at least one Working/Weekend Day,
// no overlap, Default-Shift/archival invariants) is a data-dependent,
// cross-row concern and stays entirely in the service layer, per the
// Technical Design's Validation Strategy.

const VALID_DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const VALID_SHIFT_STATUSES = ['ACTIVE', 'ARCHIVED'];
const VALID_PERIOD_STATUSES = ['ACTIVE', 'ARCHIVED'];
const VALID_PERIOD_TYPES = ['TEACHING', 'BREAK'];
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Must match school-schedule.service.js's own DEFAULT_WIZARD_TEACHING_PERIOD_COUNT
// — used here only to resolve "does breakAfterPeriod exceed teachingPeriodCount"
// when the client omits teachingPeriodCount and relies on the service's default.
const DEFAULT_WIZARD_TEACHING_PERIOD_COUNT = 6;

function validateUpdateSchoolCalendar(body) {
  const errors = {};

  if (!Array.isArray(body.workingDays) || body.workingDays.length === 0) {
    errors.workingDays = 'A non-empty array of Working Days is required.';
  } else if (!body.workingDays.every((day) => VALID_DAYS.includes(day))) {
    errors.workingDays = `Each Working Day must be one of: ${VALID_DAYS.join(', ')}.`;
  } else if (new Set(body.workingDays).size !== body.workingDays.length) {
    errors.workingDays = 'Working Days must not contain duplicates.';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid School Calendar update request', errors);
  }
}

function validateShiftTimes(body, errors) {
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    errors.name = 'Name is required.';
  }
  if (typeof body.startTime !== 'string' || !TIME_PATTERN.test(body.startTime)) {
    errors.startTime = 'Start time must be a valid time in HH:mm format.';
  }
  if (typeof body.endTime !== 'string' || !TIME_PATTERN.test(body.endTime)) {
    errors.endTime = 'End time must be a valid time in HH:mm format.';
  }
  if (!errors.startTime && !errors.endTime && body.endTime <= body.startTime) {
    errors.endTime = 'End time must be after start time.';
  }
}

// (Architecture Update — Periods) The setup wizard's own three optional
// fields, folded into POST /shifts itself rather than a separate endpoint.
// Shape-only: both are plain numbers/booleans from the same request body, no
// DB state needed to compare them against each other.
function validateWizardFields(body, errors) {
  if (body.teachingPeriodCount !== undefined) {
    if (!Number.isInteger(body.teachingPeriodCount) || body.teachingPeriodCount < 1) {
      errors.teachingPeriodCount = 'Number of Teaching Periods must be a positive whole number.';
    }
  }
  if (body.includeBreak !== undefined && typeof body.includeBreak !== 'boolean') {
    errors.includeBreak = 'Include Break must be true or false.';
  }
  // When includeBreak is explicitly false, breakAfterPeriod is ignored
  // entirely — not validated, not used (Technical Design's Backend Design).
  if (body.includeBreak !== false && body.breakAfterPeriod !== undefined) {
    if (!Number.isInteger(body.breakAfterPeriod) || body.breakAfterPeriod < 1) {
      errors.breakAfterPeriod = 'Break After Period must be a positive whole number.';
    } else if (!errors.teachingPeriodCount) {
      const effectiveTeachingPeriodCount = Number.isInteger(body.teachingPeriodCount)
        ? body.teachingPeriodCount
        : DEFAULT_WIZARD_TEACHING_PERIOD_COUNT;
      if (body.breakAfterPeriod > effectiveTeachingPeriodCount) {
        errors.breakAfterPeriod = 'Break After Period cannot exceed the Number of Teaching Periods.';
      }
    }
  }
}

function validateCreateShift(body) {
  const errors = {};
  validateShiftTimes(body, errors);
  validateWizardFields(body, errors);

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Shift creation request', errors);
  }
}

// Guard by Construction (Business Rule #11 analog): displayOrder, isDefault,
// and status are never accepted here — each has its own dedicated action.
const CORRECTABLE_SHIFT_FIELDS = ['name', 'startTime', 'endTime'];

function validateUpdateShift(body) {
  const errors = {};

  for (const key of Object.keys(body || {})) {
    if (!CORRECTABLE_SHIFT_FIELDS.includes(key)) {
      errors[key] = 'This field cannot be modified through this endpoint.';
    }
  }

  validateShiftTimes(body, errors);

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Shift update request', errors);
  }
}

function validateReorderShift(body) {
  const errors = {};

  if (!Number.isInteger(body.position) || body.position < 1) {
    errors.position = 'Position must be a positive whole number.';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid sequence update request', errors);
  }
}

function validateListShifts(query) {
  const errors = {};

  if (query.status !== undefined && !VALID_SHIFT_STATUSES.includes(query.status)) {
    errors.status = `Status must be one of: ${VALID_SHIFT_STATUSES.join(', ')}.`;
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Shift query', errors);
  }
}

// --- Period (Architecture Update) ----------------------------------------------
// Data-dependent checks (containment within the parent Shift, overlap among
// active Periods in the same Shift) stay in the service layer, per this
// project's established validation/service split — the shape-only checks
// here mirror Shift's own.

function validatePeriodShape(body, errors) {
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    errors.name = 'Name is required.';
  }
  if (!VALID_PERIOD_TYPES.includes(body.type)) {
    errors.type = `Type must be one of: ${VALID_PERIOD_TYPES.join(', ')}.`;
  }

  const hasStart = body.startTime !== undefined && body.startTime !== null && body.startTime !== '';
  const hasEnd = body.endTime !== undefined && body.endTime !== null && body.endTime !== '';

  if (hasStart !== hasEnd) {
    errors.startTime = 'Start Time and End Time must both be provided, or both left empty.';
  } else if (hasStart && hasEnd) {
    if (!TIME_PATTERN.test(body.startTime)) {
      errors.startTime = 'Start time must be a valid time in HH:mm format.';
    }
    if (!TIME_PATTERN.test(body.endTime)) {
      errors.endTime = 'End time must be a valid time in HH:mm format.';
    }
    if (!errors.startTime && !errors.endTime && body.endTime <= body.startTime) {
      errors.endTime = 'End time must be after start time.';
    }
  }
}

function validateCreatePeriod(body) {
  const errors = {};
  validatePeriodShape(body, errors);

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Period creation request', errors);
  }
}

// Guard by Construction: displayOrder and status are never accepted here —
// each has its own dedicated action, the same convention validateUpdateShift
// already established.
const CORRECTABLE_PERIOD_FIELDS = ['name', 'type', 'startTime', 'endTime'];

function validateUpdatePeriod(body) {
  const errors = {};

  for (const key of Object.keys(body || {})) {
    if (!CORRECTABLE_PERIOD_FIELDS.includes(key)) {
      errors[key] = 'This field cannot be modified through this endpoint.';
    }
  }

  validatePeriodShape(body, errors);

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Period update request', errors);
  }
}

function validateReorderPeriod(body) {
  const errors = {};

  if (!Number.isInteger(body.position) || body.position < 1) {
    errors.position = 'Position must be a positive whole number.';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid sequence update request', errors);
  }
}

function validateListPeriods(query) {
  const errors = {};

  if (query.status !== undefined && !VALID_PERIOD_STATUSES.includes(query.status)) {
    errors.status = `Status must be one of: ${VALID_PERIOD_STATUSES.join(', ')}.`;
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Period query', errors);
  }
}

module.exports = {
  validateUpdateSchoolCalendar,
  validateCreateShift,
  validateUpdateShift,
  validateReorderShift,
  validateListShifts,
  validateCreatePeriod,
  validateUpdatePeriod,
  validateReorderPeriod,
  validateListPeriods,
};
