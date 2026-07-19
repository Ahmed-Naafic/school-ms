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
  DepartmentsIcon,
  SunIcon,
  MoonIcon,
  MenuIcon,
  CloseIcon,
} from './nav-icons';
import saxaabLogoLight from '../assets/saxaab-logo-light.png';
import saxaabLogoDark from '../assets/saxaab-logo-dark.png';

const NAV_LINKS = {
  SUPER_ADMIN: [
    { to: '/schools', label: 'Schools', icon: SchoolsIcon },
    { to: '/platform-statistics', label: 'Platform', icon: PlatformIcon },
    { to: '/accounts', label: 'Accounts', icon: AccountsIcon },
  ],
  SCHOOL_ADMIN: [
    { to: '/students', label: 'Students', icon: StudentsIcon },
    { to: '/teachers', label: 'Teachers', icon: TeachersIcon },
    { to: '/departments', label: 'Departments', icon: DepartmentsIcon },
    { to: '/classes', label: 'Classes', icon: ClassesIcon },
    { to: '/accounts', label: 'Accounts', icon: AccountsIcon },
  ],
  ACCOUNTANT: [],
};

export function Layout() {
  const { account, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const links = NAV_LINKS[account.role] || [];

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
    <div className="flex min-h-screen bg-gray-50 dark:bg-navy-950">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-navy-950/45 dark:bg-navy-950/70 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 flex w-[200px] shrink-0 flex-col border-r border-gray-200 bg-white transition-transform duration-fast ease-out-brand dark:border-navy-700 dark:bg-navy-950',
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
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-md px-3 py-[10px] text-sm font-semibold',
                  'transition-colors duration-fast ease-out-brand',
                  isActive
                    ? 'bg-teal-50 text-teal-700 dark:bg-navy-800 dark:text-white'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-navy-900 dark:text-white/70 dark:hover:bg-navy-800 dark:hover:text-white',
                ].join(' ')
              }
            >
              <link.icon size={20} />
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-gray-200 bg-white dark:border-navy-700 dark:bg-navy-900">
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
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
