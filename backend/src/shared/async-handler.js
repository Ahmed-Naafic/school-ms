// Avoids repeating try/catch in every controller, per Coding-Standards.md's
// guidance to avoid deeply nested/duplicated error-handling code.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = asyncHandler;
