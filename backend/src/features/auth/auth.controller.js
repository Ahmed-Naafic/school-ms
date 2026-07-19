const asyncHandler = require('../../shared/async-handler');
const { sendSuccess } = require('../../shared/response');
const service = require('./auth.service');
const validation = require('./auth.validation');

const login = asyncHandler(async (req, res) => {
  validation.validateLogin(req.body);
  const result = await service.login(req.body);
  return sendSuccess(res, { message: 'Login successful', data: result });
});

const logout = asyncHandler(async (req, res) => {
  await service.logout(req.body, req.user);
  return sendSuccess(res, { message: 'Logout successful' });
});

const refresh = asyncHandler(async (req, res) => {
  const result = await service.refreshAccessToken(req.body);
  return sendSuccess(res, { message: 'Token refreshed', data: result });
});

const createAccount = asyncHandler(async (req, res) => {
  validation.validateCreateAccount(req.body);
  const account = await service.createAccount(req.body, req.user);
  return sendSuccess(res, { statusCode: 201, message: 'Account created', data: account });
});

const listAccounts = asyncHandler(async (req, res) => {
  const accounts = await service.listAccounts(req.query, req.user);
  return sendSuccess(res, { message: 'Accounts retrieved', data: accounts });
});

const requestPasswordReset = asyncHandler(async (req, res) => {
  validation.validatePasswordResetRequest(req.body);
  await service.requestPasswordReset(req.body);
  return sendSuccess(res, {
    message: 'If an account with that email exists, password reset instructions have been sent.',
  });
});

const confirmPasswordReset = asyncHandler(async (req, res) => {
  validation.validatePasswordResetConfirm(req.body);
  await service.confirmPasswordReset(req.body);
  return sendSuccess(res, { message: 'Password has been reset. Please log in with your new password.' });
});

const changePassword = asyncHandler(async (req, res) => {
  validation.validateChangePassword(req.body);
  await service.changePassword({ accountId: req.user.id, ...req.body });
  return sendSuccess(res, { message: 'Password changed successfully' });
});

// ACR-001: a direct call to either endpoint is always the administrative/
// security override path — source is hard-coded here, never client-
// supplied, since it is this file's own job to say "this came from the
// override endpoint," not the request body's.
const deactivateAccount = asyncHandler(async (req, res) => {
  validation.validateAccountOverride(req.body);
  const account = await service.deactivateAccount(req.params.accountId, req.user, {
    source: 'authentication_override',
    reason: req.body.reason ?? null,
  });
  return sendSuccess(res, { message: 'Account deactivated', data: account });
});

const reactivateAccount = asyncHandler(async (req, res) => {
  validation.validateAccountOverride(req.body);
  const account = await service.reactivateAccount(req.params.accountId, req.user, {
    source: 'authentication_override',
    reason: req.body.reason ?? null,
  });
  return sendSuccess(res, { message: 'Account reactivated', data: account });
});

const unlockAccount = asyncHandler(async (req, res) => {
  const account = await service.unlockAccount(req.params.accountId, req.user);
  return sendSuccess(res, { message: 'Account unlocked', data: account });
});

const changeRole = asyncHandler(async (req, res) => {
  validation.validateRoleChange(req.body);
  const account = await service.changeRole(req.params.accountId, req.body.role, req.user);
  return sendSuccess(res, { message: 'Role changed', data: account });
});

module.exports = {
  login,
  logout,
  refresh,
  createAccount,
  listAccounts,
  requestPasswordReset,
  confirmPasswordReset,
  changePassword,
  deactivateAccount,
  reactivateAccount,
  unlockAccount,
  changeRole,
};
