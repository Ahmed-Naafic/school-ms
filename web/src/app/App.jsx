import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../shared/auth/AuthContext';
import { ProtectedRoute } from '../shared/auth/ProtectedRoute';
import { ToastProvider } from '../shared/toast/ToastContext';
import { ThemeProvider } from '../shared/theme/ThemeContext';
import { Layout } from './Layout';
import { HomePage } from './HomePage';
import { SettingsPage } from './SettingsPage';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { ChangePasswordPage } from '../features/auth/pages/ChangePasswordPage';
import { ForgotPasswordRequestPage } from '../features/auth/pages/ForgotPasswordRequestPage';
import { ForgotPasswordConfirmPage } from '../features/auth/pages/ForgotPasswordConfirmPage';
import { AccountManagementPage } from '../features/auth/pages/AccountManagementPage';
import { SchoolsListPage } from '../features/schools/pages/SchoolsListPage';
import { SchoolDetailPage } from '../features/schools/pages/SchoolDetailPage';
import { PlatformStatisticsPage } from '../features/schools/pages/PlatformStatisticsPage';
import { ClassesListPage } from '../features/classes/pages/ClassesListPage';
import { GradeLevelsPage } from '../features/classes/pages/GradeLevelsPage';
import { StudentsListPage } from '../features/students/pages/StudentsListPage';
import { TeachersListPage } from '../features/teachers/pages/TeachersListPage';
import { SubjectsPage } from '../features/subjects/pages/SubjectsPage';
import { AcademicYearsListPage } from '../features/academic-years/pages/AcademicYearsListPage';
import { ScheduleSettingsPage } from '../features/school-schedule/pages/ScheduleSettingsPage';
import { AssignmentsListPage } from '../features/teacher-subject-assignments/pages/AssignmentsListPage';
import { MasterTimetablePage } from '../features/timetable/pages/MasterTimetablePage';
import { ClassTimetablePage } from '../features/timetable/pages/ClassTimetablePage';
import { TeacherTimetablePage } from '../features/timetable/pages/TeacherTimetablePage';
import { TimetableSettingsPage } from '../features/timetable/pages/TimetableSettingsPage';
import { WeeklySubjectAllocationPage } from '../features/weekly-subject-allocation/pages/WeeklySubjectAllocationPage';
import { TeacherAttendancePage } from '../features/attendance/pages/TeacherAttendancePage';
import { ManagerStudentAttendancePage } from '../features/attendance/pages/ManagerStudentAttendancePage';
import { ManagerStaffAttendancePage } from '../features/attendance/pages/ManagerStaffAttendancePage';
import { AdminManagerAttendancePage } from '../features/attendance/pages/AdminManagerAttendancePage';
import { AttendanceSettingsPage } from '../features/attendance/pages/AttendanceSettingsPage';
import { StaffCheckInPage } from '../features/attendance/pages/StaffCheckInPage';

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
                path="/grade-levels"
                element={
                  <ProtectedRoute allowedRoles={['SCHOOL_ADMIN']}>
                    <GradeLevelsPage />
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
                path="/subjects"
                element={
                  <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'SCHOOL_ADMIN']}>
                    <SubjectsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/academic-years"
                element={
                  <ProtectedRoute allowedRoles={['SCHOOL_ADMIN']}>
                    <AcademicYearsListPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute allowedRoles={['SCHOOL_ADMIN']}>
                    <SettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/teacher-subject-assignments"
                element={
                  <ProtectedRoute allowedRoles={['SCHOOL_ADMIN']}>
                    <AssignmentsListPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/school-schedule"
                element={
                  <ProtectedRoute allowedRoles={['SCHOOL_ADMIN']}>
                    <ScheduleSettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/weekly-subject-allocation"
                element={
                  <ProtectedRoute allowedRoles={['SCHOOL_ADMIN']}>
                    <WeeklySubjectAllocationPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/timetable"
                element={
                  <ProtectedRoute allowedRoles={['SCHOOL_ADMIN']}>
                    <MasterTimetablePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/timetable/classes/:classId"
                element={
                  <ProtectedRoute allowedRoles={['SCHOOL_ADMIN']}>
                    <ClassTimetablePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/timetable/teachers/:teacherId"
                element={
                  <ProtectedRoute allowedRoles={['SCHOOL_ADMIN']}>
                    <TeacherTimetablePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/timetable/settings"
                element={
                  <ProtectedRoute allowedRoles={['SCHOOL_ADMIN']}>
                    <TimetableSettingsPage />
                  </ProtectedRoute>
                }
              />

              {/* Attendance Management — strictly school-based (Business Rule
                  #34): SUPER_ADMIN is never included in allowedRoles on any
                  route below, deliberately and permanently. */}
              <Route
                path="/attendance"
                element={
                  <ProtectedRoute allowedRoles={['TEACHER']}>
                    <TeacherAttendancePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/attendance/students"
                element={
                  <ProtectedRoute allowedRoles={['MANAGER']}>
                    <ManagerStudentAttendancePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/attendance/staff"
                element={
                  <ProtectedRoute allowedRoles={['MANAGER']}>
                    <ManagerStaffAttendancePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/attendance/managers"
                element={
                  <ProtectedRoute allowedRoles={['SCHOOL_ADMIN']}>
                    <AdminManagerAttendancePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/attendance/settings"
                element={
                  <ProtectedRoute allowedRoles={['SCHOOL_ADMIN']}>
                    <AttendanceSettingsPage />
                  </ProtectedRoute>
                }
              />
              {/* (v1.7) Staff self check-in — a Teacher, Accountant, or
                  Manager records their own arrival here. Never SCHOOL_ADMIN
                  (Business Rule #33: no attendance record of their own). */}
              <Route
                path="/attendance/check-in"
                element={
                  <ProtectedRoute allowedRoles={['TEACHER', 'ACCOUNTANT', 'MANAGER']}>
                    <StaffCheckInPage />
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
