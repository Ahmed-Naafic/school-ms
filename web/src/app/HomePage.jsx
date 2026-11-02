import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../shared/auth/AuthContext';

// Sends each role to the section most relevant to them, rather than showing
// a generic dashboard with nothing to do yet. MANAGER/TEACHER route to their
// own first Attendance nav destination (Layout.jsx's own NAV_LINKS) — before
// these entries existed, both roles fell through to the '/accounts' default
// below, which their own ProtectedRoute (SUPER_ADMIN/SCHOOL_ADMIN only)
// immediately bounces back to '/', producing an infinite redirect loop that
// rendered as a blank page rather than a visible error.
const HOME_BY_ROLE = {
  SUPER_ADMIN: '/schools',
  SCHOOL_ADMIN: '/accounts',
  ACCOUNTANT: '/accounts',
  MANAGER: '/attendance/students',
  TEACHER: '/attendance',
};

export function HomePage() {
  const { account } = useAuth();
  return <Navigate to={HOME_BY_ROLE[account.role] || '/accounts'} replace />;
}
