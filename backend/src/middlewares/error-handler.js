const { AppError, AuthorizationError } = require('../shared/errors');
const { sendError } = require('../shared/response');
const { recordAuditEvent } = require('../shared/audit');

// Centralized error handler, per Coding-Standards.md: "Never hide errors...
// Return meaningful error messages... Do not expose internal implementation
// details."
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    // Business Rule #22: every denied authorization attempt is audited, not
    // only repeated or suspicious ones.
    if (err instanceof AuthorizationError && req.user) {
      recordAuditEvent({
        schoolId: req.user.schoolId,
        userId: req.user.id,
        action: 'AUTHORIZATION_DENIED',
        metadata: { path: req.originalUrl, method: req.method },
      }).catch((auditError) => console.error('Failed to record audit event:', auditError));
    }

    return sendError(res, {
      statusCode: err.statusCode,
      message: err.message,
      errors: err.errors || null,
    });
  }

  // Unexpected failures are logged, never leaked to the client, per
  // AI-Development-Playbook.md's Error Handling rule.
  console.error(err);
  return sendError(res, { statusCode: 500, message: 'Internal server error' });
}

module.exports = errorHandler;
