import React from 'react';

// Lucide-equivalent stroke icons for sidebar navigation, per
// UI-UX-Standards.md's Iconography section (2px stroke, rounded caps).
const Icon = ({ size = 20, children }) => (
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
    {children}
  </svg>
);

export const SchoolsIcon = (props) => (
  <Icon {...props}>
    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
    <path d="M10 6h4M10 10h4M10 14h4M10 18h4" />
  </Icon>
);

export const PlatformIcon = (props) => (
  <Icon {...props}>
    <line x1="12" x2="12" y1="20" y2="10" />
    <line x1="18" x2="18" y1="20" y2="4" />
    <line x1="6" x2="6" y1="20" y2="16" />
  </Icon>
);

export const AccountsIcon = (props) => (
  <Icon {...props}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Icon>
);

export const AttendanceIcon = (props) => (
  <Icon {...props}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
    <path d="m9 16 2 2 4-4" />
  </Icon>
);

export const ClassesIcon = (props) => (
  <Icon {...props}>
    <path d="m22 10-10-6L2 10l10 6 10-6Z" />
    <path d="M6 12v5c0 1.5 2.5 3 6 3s6-1.5 6-3v-5" />
  </Icon>
);

export const StudentsIcon = (props) => (
  <Icon {...props}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
  </Icon>
);

export const TeachersIcon = (props) => (
  <Icon {...props}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    <path d="M8 7h8M8 11h5" />
  </Icon>
);

export const SubjectsIcon = (props) => (
  <Icon {...props}>
    <path d="M12 3v18" />
    <path d="M3 6a2 2 0 0 1 2-2h6v16H5a2 2 0 0 1-2-2V6Z" />
    <path d="M21 6a2 2 0 0 0-2-2h-6v16h6a2 2 0 0 0 2-2V6Z" />
  </Icon>
);

export const AcademicYearsIcon = (props) => (
  <Icon {...props}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M3 9h18M8 2v4M16 2v4" />
  </Icon>
);

export const TeacherSubjectAssignmentsIcon = (props) => (
  <Icon {...props}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    <path d="M9 10a2 2 0 1 0 4 0 2 2 0 1 0-4 0M9 15h4" />
  </Icon>
);

export const ScheduleIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </Icon>
);

export const TimetableIcon = (props) => (
  <Icon {...props}>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 9h18M8 3v3M16 3v3" />
    <path d="M7.5 13h2M7.5 17h2M11.5 13h2M11.5 17h2M15.5 13h2M15.5 17h2" />
  </Icon>
);

export const GradeLevelsIcon = (props) => (
  <Icon {...props}>
    <path d="M22 10 12 4 2 10l10 6 10-6Z" />
    <path d="M6 12v5c0 1.5 2.5 3 6 3s6-1.5 6-3v-5" />
  </Icon>
);

// (Weekly Subject Allocation) A pie/allocation-style icon, distinct from
// TimetableIcon's own grid shape.
export const WeeklySubjectAllocationIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v9l7 4" />
  </Icon>
);

// (Settings) A gear — the sidebar's link to the dedicated /settings page.
export const SettingsIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </Icon>
);


export const SunIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </Icon>
);

export const MoonIcon = (props) => (
  <Icon {...props}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
  </Icon>
);

export const MenuIcon = (props) => (
  <Icon {...props}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Icon>
);

export const CloseIcon = (props) => (
  <Icon {...props}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);
