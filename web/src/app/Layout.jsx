import React from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button, IconButton } from '../shared/components';
import { useAuth } from '../shared/auth/AuthContext';
import { useTheme } from '../shared/theme/ThemeContext';
import * as authService from '../features/auth/services/auth.service';
import {
  SchoolsIcon,
  PlatformIcon,
  AccountsIcon,
  ClassesIcon,
  StudentsIcon,
  TeachersIcon,
  SubjectsIcon,
  AcademicYearsIcon,
  TimetableIcon,
  SettingsIcon,
  AttendanceIcon,
  SunIcon,
  MoonIcon,
  MenuIcon,
  CloseIcon,
} from './nav-icons';
import saxaabLogoLight from '../assets/saxaab-logo-light.png';
import saxaabLogoDark from '../assets/saxaab-logo-dark.png';

// Settings is one ordinary nav item, like every other — it links to the
// dedicated /settings page (SettingsPage.jsx), which is where the four
// existing features (Grade/Form, Teaching Assignments, School Schedule,
// Weekly Subject Allocation) are actually organized. Only SCHOOL_ADMIN gets
// it, matching the roles allowed on /settings and on all four underlying
// routes in App.jsx — never grants access beyond what already existed.
// Attendance Management is a strictly school-based operational feature
// (Attendance-Management.md Business Rule #34) — SUPER_ADMIN has zero
// Attendance access of any kind, so the SUPER_ADMIN list below deliberately
// never gains an Attendance entry, now or in the future. School Admin gets
// "Manager Attendance" (recording/correcting each Manager's own daily
// attendance, Business Lifecycle §6) — a School Admin has no attendance
// record of their own to view (Business Rule #33), so no such page exists.
const NAV_LINKS = {
  SUPER_ADMIN: [
    { to: '/schools', label: 'Schools', icon: SchoolsIcon },
    { to: '/subjects', label: 'Subjects', icon: SubjectsIcon },
    { to: '/platform-statistics', label: 'Platform', icon: PlatformIcon },
    { to: '/accounts', label: 'Accounts', icon: AccountsIcon },
  ],
  SCHOOL_ADMIN: [
    { to: '/students', label: 'Students', icon: StudentsIcon },
    { to: '/teachers', label: 'Teachers', icon: TeachersIcon },
    { to: '/classes', label: 'Classes', icon: ClassesIcon },
    { to: '/subjects', label: 'Subjects', icon: SubjectsIcon },
    { to: '/academic-years', label: 'Academic Years', icon: AcademicYearsIcon },
    { to: '/timetable', label: 'Timetable', icon: TimetableIcon },
    { to: '/attendance/managers', label: 'Manager Attendance', icon: AttendanceIcon },
    { to: '/accounts', label: 'Accounts', icon: AccountsIcon },
    { to: '/settings', label: 'Settings', icon: SettingsIcon },
  ],
  MANAGER: [
    { to: '/attendance/students', label: 'Student Attendance', icon: AttendanceIcon },
    { to: '/attendance/staff', label: 'Staff Attendance', icon: AttendanceIcon },
    { to: '/attendance/check-in', label: 'My Attendance', icon: AttendanceIcon },
  ],
  TEACHER: [
    { to: '/attendance', label: 'Attendance', icon: AttendanceIcon },
    { to: '/attendance/check-in', label: 'My Attendance', icon: AttendanceIcon },
  ],
  // (v1.7) An Accountant's first-ever Attendance nav entry — self check-in
  // is now their only attendance-recording capability (Business
  // Specification v1.5, Actors > Accountant).
  ACCOUNTANT: [{ to: '/attendance/check-in', label: 'My Attendance', icon: AttendanceIcon }],
};

const navLinkClassName = ({ isActive }) =>
  [
    'flex items-center gap-3 rounded-md px-3 py-[10px] text-sm font-semibold',
    'transition-colors duration-fast ease-out-brand',
    isActive
      ? 'bg-teal-50 text-teal-700 dark:bg-navy-800 dark:text-white'
      : 'text-gray-700 hover:bg-gray-100 hover:text-navy-900 dark:text-white/70 dark:hover:bg-navy-800 dark:hover:text-white',
  ].join(' ');

// The four routes SettingsPage.jsx organizes — used only to decide when to
// show the "Back to Settings" affordance below, never to gate access (App.jsx's
// own ProtectedRoute already does that, unchanged).
const SETTINGS_CHILD_ROUTES = [
  '/grade-levels',
  '/teacher-subject-assignments',
  '/school-schedule',
  '/weekly-subject-allocation',
  '/attendance/settings',
];

// Not a nav icon (nav-icons.jsx is scoped to sidebar items) — kept local,
// same reasoning as SettingsPage.jsx's own ArrowRightIcon.
function ArrowLeftIcon({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

export function Layout() {
  const { account, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const links = NAV_LINKS[account.role] || [];
  const showBackToSettings = SETTINGS_CHILD_ROUTES.includes(location.pathname);

  // Below `lg` (1024px — the approved responsive breakpoint, per UI-UX-
  // Standards.md's Responsive Design section), the sidebar is an off-canvas
  // drawer rather than a persistent column. It auto-closes on navigation so
  // it never lingers open over the next page on tablet/narrow viewports.
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  React.useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    const stored = JSON.parse(localStorage.getItem('sms.auth') || 'null');
    try {
      if (stored?.refreshToken) {
        await authService.logout(stored.refreshToken);
      }
    } finally {
      logout();
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-navy-950">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-navy-950/45 dark:bg-navy-950/70 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 flex w-[200px] shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-white transition-transform duration-fast ease-out-brand dark:border-navy-700 dark:bg-navy-950',
          'lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="relative flex items-center justify-center px-6 py-4">
          <Link to="/" className="flex justify-center">
            {/* The logo's navy elements need to contrast against the sidebar's
                surface, which flips from white (light mode) to navy (dark mode) —
                so two color variants of the same mark are swapped by theme. */}
            <img
              src={theme === 'dark' ? saxaabLogoDark : saxaabLogoLight}
              alt="School Management System"
              className="h-16 w-auto"
            />
          </Link>
          <IconButton
            variant="ghost"
            size="sm"
            label="Close menu"
            onClick={() => setSidebarOpen(false)}
            className="absolute right-3 top-3 lg:hidden"
          >
            <CloseIcon size={18} />
          </IconButton>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} className={navLinkClassName}>
              <link.icon size={20} />
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-gray-200 bg-white dark:border-navy-700 dark:bg-navy-900">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:justify-end">
            <IconButton
              variant="ghost"
              size="sm"
              label="Open menu"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden"
            >
              <MenuIcon size={20} />
            </IconButton>
            <div className="flex items-center gap-4">
              <IconButton
                variant="ghost"
                size="sm"
                label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                onClick={toggleTheme}
              >
                {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
              </IconButton>
              <span className="hidden text-sm text-gray-500 dark:text-gray-400 sm:inline">{account.email}</span>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Sign out
              </Button>
            </div>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto">
          {showBackToSettings && (
            <div className="mx-auto max-w-container px-4 pt-6 sm:px-6">
              <Link
                to="/settings"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 transition-colors duration-fast ease-out-brand hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
              >
                <ArrowLeftIcon size={16} />
                Back to Settings
              </Link>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
