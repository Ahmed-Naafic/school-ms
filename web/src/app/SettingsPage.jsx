import React from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../shared/components';
import {
  GradeLevelsIcon,
  TeacherSubjectAssignmentsIcon,
  ScheduleIcon,
  WeeklySubjectAllocationIcon,
  AttendanceIcon,
} from './nav-icons';

// Not a nav icon (nav-icons.jsx is scoped to sidebar items) — the card's own
// clickable-affordance arrow, kept local to this page.
function ArrowRightIcon({ size = 18, className = '' }) {
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
      className={className}
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

// Reuses the four already-existing features' own routes/pages/APIs verbatim
// — this page only organizes links to them, never duplicates them. Grouped
// into named sections so a future "School Setup" section (School
// Configuration, not implemented yet) can be added the same way without
// redesigning this page.
const SETTINGS_SECTIONS = [
  {
    title: 'Academic Setup',
    items: [
      {
        to: '/grade-levels',
        label: 'Grade/Form',
        description: "Manage grades, forms and their academic structure.",
        icon: GradeLevelsIcon,
      },
      {
        to: '/teacher-subject-assignments',
        label: 'Teaching Assignments',
        description: 'Assign subjects to teachers and manage teaching assignments.',
        icon: TeacherSubjectAssignmentsIcon,
      },
    ],
  },
  {
    title: 'Scheduling',
    items: [
      {
        to: '/school-schedule',
        label: 'School Schedule',
        description: 'Configure school days, periods and shifts.',
        icon: ScheduleIcon,
      },
      {
        to: '/weekly-subject-allocation',
        label: 'Weekly Subject Allocation',
        description: 'Define how many periods each subject has per week.',
        icon: WeeklySubjectAllocationIcon,
      },
    ],
  },
  {
    title: 'Attendance',
    items: [
      {
        to: '/attendance/settings',
        label: 'Staff Attendance Timing',
        description: 'Set the start time, late threshold, and absence cutoff for staff attendance.',
        icon: AttendanceIcon,
      },
    ],
  },
];

function SettingsCard({ to, label, description, icon: Icon }) {
  return (
    <Link to={to} className="group block rounded-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-100 dark:focus-visible:ring-teal-500/30">
      <Card hoverable className="flex items-start gap-4 p-6">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-navy-800 dark:text-teal-400">
          <Icon size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="font-display text-base font-bold text-navy-900 dark:text-white">{label}</span>
            <ArrowRightIcon
              size={18}
              className="shrink-0 text-gray-400 transition-transform duration-fast ease-out-brand group-hover:translate-x-1 dark:text-gray-500"
            />
          </span>
          <span className="mt-1 block text-sm text-gray-500 dark:text-gray-400">{description}</span>
        </span>
      </Card>
    </Link>
  );
}

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-container px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Manage your school's academic and scheduling configuration.
        </p>
      </div>

      <div className="flex flex-col gap-8">
        {SETTINGS_SECTIONS.map((section) => (
          <div key={section.title}>
            <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {section.title}
            </h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {section.items.map((item) => (
                <SettingsCard key={item.to} {...item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
