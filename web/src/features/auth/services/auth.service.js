import { api } from '../../../shared/api/client';

// Mirrors backend/src/features/auth/auth.routes.js exactly.

export const login = (credentials) => api.post('/auth/login', credentials, { auth: false });

export const logout = (refreshToken) => api.post('/auth/logout', { refreshToken });

export const requestPasswordReset = (email) =>
  api.post('/auth/password-reset/request', { email }, { auth: false });

export const confirmPasswordReset = (token, newPassword) =>
  api.post('/auth/password-reset/confirm', { token, newPassword }, { auth: false });

export const changePassword = (currentPassword, newPassword) =>
  api.patch('/auth/password', { currentPassword, newPassword });

export const createAccount = (data) => api.post('/auth/accounts', data);

export const listAccounts = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return api.get(`/auth/accounts${query ? `?${query}` : ''}`);
};

export const deactivateAccount = (accountId) => api.patch(`/auth/accounts/${accountId}/deactivate`);

export const reactivateAccount = (accountId) => api.patch(`/auth/accounts/${accountId}/reactivate`);

export const unlockAccount = (accountId) => api.patch(`/auth/accounts/${accountId}/unlock`);

// ACR-011, Business Rules #29-30: School Admin resets Teacher/Manager/
// Accountant within their own school; Super Admin resets School Admin
// accounts. Returns { account, temporaryPassword } — temporaryPassword is
// always set for a Super Admin reset, and for School Admin resets only in
// development mode (ACR-012).
export const resetPasswordAdministratively = (accountId) => api.patch(`/auth/accounts/${accountId}/reset-password`);

export const changeRole = (accountId, role) => api.patch(`/auth/accounts/${accountId}/role`, { role });
