import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../shared/auth/AuthContext';
import { ProtectedRoute } from '../shared/auth/ProtectedRoute';
import { ToastProvider } from '../shared/toast/ToastContext';
import { ThemeProvider } from '../shared/theme/ThemeContext';
import { Layout } from './Layout';
import { HomePage } from './HomePage';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { ChangePasswordPage } from '../features/auth/pages/ChangePasswordPage';
import { ForgotPasswordRequestPage } from '../features/auth/pages/ForgotPasswordRequestPage';
import { ForgotPasswordConfirmPage } from '../features/auth/pages/ForgotPasswordConfirmPage';
import { AccountManagementPage } from '../features/auth/pages/AccountManagementPage';
import { SchoolsListPage } from '../features/schools/pages/SchoolsListPage';
import { SchoolDetailPage } from '../features/schools/pages/SchoolDetailPage';
import { PlatformStatisticsPage } from '../features/schools/pages/PlatformStatisticsPage';
import { ClassesListPage } from '../features/classes/pages/ClassesListPage';
import { StudentsListPage } from '../features/students/pages/StudentsListPage';
import { TeachersListPage } from '../features/teachers/pages/TeachersListPage';
import { DepartmentsPage } from '../features/teachers/pages/DepartmentsPage';

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordRequestPage />} />
            <Route path="/reset-password" element={<ForgotPasswordConfirmPage />} />

            <Route
              path="/change-password"
              element={
                <ProtectedRoute>
                  <ChangePasswordPage />
                </ProtectedRoute>
              }
            />

            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<HomePage />} />

              <Route
                path="/schools"
                element={
                  <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
                    <SchoolsListPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/schools/:schoolId"
                element={
                  <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'SCHOOL_ADMIN']}>
                    <SchoolDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/platform-statistics"
                element={
                  <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
                    <PlatformStatisticsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/accounts"
                element={
                  <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'SCHOOL_ADMIN']}>
                    <AccountManagementPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/classes"
                element={
                  <ProtectedRoute allowedRoles={['SCHOOL_ADMIN']}>
                    <ClassesListPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/students"
                element={
                  <ProtectedRoute allowedRoles={['SCHOOL_ADMIN']}>
                    <StudentsListPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/teachers"
                element={
                  <ProtectedRoute allowedRoles={['SCHOOL_ADMIN']}>
                    <TeachersListPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/departments"
                element={
                  <ProtectedRoute allowedRoles={['SCHOOL_ADMIN']}>
                    <DepartmentsPage />
                  </ProtectedRoute>
                }
              />
            </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
