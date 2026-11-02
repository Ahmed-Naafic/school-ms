const { ValidationError } = require('../../shared/errors');

// Server-side validation only — never trust client input, per Coding-Standards.md.
// Shape-only here; every business-meaning check (current-lesson membership,
// roster membership, working-day/holiday, lock/authority, role-vs-source
// legality, edit/correction window) lives in attendance.service.js, per this
// project's established validation/service split.

// Business Rule #5: exactly these four values, ever.
const VALID_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];
const VALID_CHECKPOINTS = ['BEFORE_BREAK', 'AFTER_BREAK'];

function isValidDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime());
}

function validateDate(date, errors) {
  if (!isValidDateString(date)) {
    errors.date = 'A valid date (YYYY-MM-DD) is required.';
  }
}

function validateStatus(status, errors, field = 'status') {
  if (!VALID_STATUSES.includes(status)) {
    errors[field] = `Status must be one of: ${VALID_STATUSES.join(', ')}.`;
  }
}

function validateStudentRecordsBody(body) {
  const errors = {};
  validateDate(body.date, errors);

  if (!Array.isArray(body.records) || body.records.length === 0) {
    errors.records = 'A non-empty array of records is required.';
  } else {
    body.records.forEach((record, index) => {
      if (!record || typeof record.studentId !== 'string' || record.studentId.trim().length === 0) {
        errors[`records[${index}].studentId`] = 'studentId is required.';
      }
      validateStatus(record && record.status, errors, `records[${index}].status`);
    });
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid attendance recording request', errors);
  }
}

// (v1.3) The "excuse" body is optional-date only — never a status field.
// EXCUSED is implied by calling this action at all (Business Rule #37); a
// client can never request any other status through this endpoint.
function validateOptionalDateBody(body) {
  const errors = {};
  if (body && body.date !== undefined) {
    validateDate(body.date, errors);
  }
  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid attendance excuse request', errors);
  }
}

// (v1.9) Historical correction requires an explicit date — never defaulted
// to today the way the normal Excuse action's optional date is (Business
// Rule #41). Shape-only here, same as validateOptionalDateBody; whether the
// date is actually a legal past date is a service-layer concern (Section S's
// established split).
function validateRequiredDateBody(body) {
  const errors = {};
  if (!body || body.date === undefined) {
    errors.date = 'Required — historical correction must specify which date to correct.';
  } else {
    validateDate(body.date, errors);
  }
  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid historical correction request', errors);
  }
}

function validateDateQuery(query) {
  const errors = {};
  validateDate(query.date, errors);
  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid attendance query', errors);
  }
}

function validateCheckpointParam(checkpoint) {
  if (!VALID_CHECKPOINTS.includes(checkpoint)) {
    throw new ValidationError('Invalid checkpoint', { checkpoint: `Checkpoint must be one of: ${VALID_CHECKPOINTS.join(', ')}.` });
  }
}

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidTimeString(value) {
  return typeof value === 'string' && TIME_REGEX.test(value);
}

// (v1.3) School Admin's Staff Attendance Timing Settings — all three
// required together (a partial configuration is not meaningfully usable:
// "Come" needs all three to determine anything), and must be in a sensible
// order (start <= late threshold <= absence cutoff) so the derivation in
// Business Lifecycle §11 never has to reconcile a contradictory config.
function validateAttendanceSettingsBody(body) {
  const errors = {};
  ['staffAttendanceStartTime', 'staffAttendanceLateThreshold', 'staffAttendanceAbsenceCutoff'].forEach((field) => {
    if (!isValidTimeString(body[field])) {
      errors[field] = 'A valid time (HH:mm) is required.';
    }
  });

  if (Object.keys(errors).length === 0) {
    const { staffAttendanceStartTime, staffAttendanceLateThreshold, staffAttendanceAbsenceCutoff } = body;
    if (staffAttendanceStartTime > staffAttendanceLateThreshold) {
      errors.staffAttendanceLateThreshold = 'The late threshold must be at or after the start time.';
    } else if (staffAttendanceLateThreshold > staffAttendanceAbsenceCutoff) {
      errors.staffAttendanceAbsenceCutoff = 'The absence cutoff must be at or after the late threshold.';
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Staff Attendance Timing Settings', errors);
  }
}

function validateCorrectionBody(body) {
  const errors = {};
  validateStatus(body.status, errors);
  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid attendance correction request', errors);
  }
}

module.exports = {
  validateStudentRecordsBody,
  validateOptionalDateBody,
  validateRequiredDateBody,
  validateDateQuery,
  validateCheckpointParam,
  validateCorrectionBody,
  validateAttendanceSettingsBody,
};
