import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../shared/auth/AuthContext';

// Sends each role to the section most relevant to them, rather than showing
// a generic dashboard with nothing to do yet.
const HOME_BY_ROLE = {
  SUPER_ADMIN: '/schools',
  SCHOOL_ADMIN: '/accounts',
  ACCOUNTANT: '/accounts',
};

export function HomePage() {
  const { account } = useAuth();
  return <Navigate to={HOME_BY_ROLE[account.role] || '/accounts'} replace />;
}
