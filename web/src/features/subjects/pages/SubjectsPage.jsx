import React from 'react';
import { useAuth } from '../../../shared/auth/AuthContext';
import { SubjectsListPage } from './SubjectsListPage';
import { MySubjectsPage } from './MySubjectsPage';

// Single routed entry point for /subjects, role-conditionally rendering the
// Super Admin catalog or the School Admin read-only view — the same shared-
// route pattern already established by /accounts (AccountManagementPage).
export function SubjectsPage() {
  const { account } = useAuth();
  return account.role === 'SUPER_ADMIN' ? <SubjectsListPage /> : <MySubjectsPage />;
}
