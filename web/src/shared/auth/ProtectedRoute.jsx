import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

// Mirrors the backend's requireCredentialsEstablished middleware: an account
// in MUST_CHANGE_CREDENTIALS status can reach nothing except the
// change-password page, per Authentication-and-Authorization.md Business Rule #23.
export function ProtectedRoute({ allowedRoles, children }) {
  const { isAuthenticated, account, mustChangeCredentials } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (mustChangeCredentials && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(account.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
