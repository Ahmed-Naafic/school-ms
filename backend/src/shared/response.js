// Standard response envelope defined in API-Standards.md.

function sendSuccess(res, { statusCode = 200, message = 'Success', data = null, metadata = null } = {}) {
  return res.status(statusCode).json({ success: true, message, data, metadata });
}

function sendError(res, { statusCode = 500, message = 'Something went wrong', errors = null } = {}) {
  return res.status(statusCode).json({ success: false, message, errors });
}

module.exports = { sendSuccess, sendError };
