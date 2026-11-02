import React from 'react';
import { Button, Card, IconButton, Select, Tooltip } from '../../../shared/components';
import { useToast } from '../../../shared/toast/ToastContext';
import { TeacherStatusBadge } from '../components/TeacherStatusBadge';
import { OnboardTeacherDialog } from '../components/OnboardTeacherDialog';
import { EditTeacherDialog } from '../components/EditTeacherDialog';
import { EmploymentStatusActionDialog } from '../components/EmploymentStatusActionDialog';
import * as teachersService from '../services/teachers.service';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ON_LEAVE', label: 'On Leave' },
  { value: 'RESIGNED', label: 'Resigned' },
  { value: 'TERMINATED', label: 'Terminated' },
  { value: 'RETIRED', label: 'Retired' },
];

// Mirrors the backend's Employment Status Transition Matrix exactly — which
// action is offered for which current status. The frontend never invents or
// widens this; it only reflects what the backend will actually accept.
const TRANSITIONS_BY_STATUS = {
  ACTIVE: ['leave', 'resign', 'terminate', 'retire'],
  ON_LEAVE: ['returnFromLeave', 'resign', 'terminate', 'retire'],
  RESIGNED: ['rehire'],
  TERMINATED: [],
  RETIRED: [],
};

const TRANSITION_ICON = {
  leave: PauseIcon,
  returnFromLeave: PlayIcon,
  resign: ExitIcon,
  rehire: RestoreIcon,
  terminate: TerminateIcon,
  retire: RetireIcon,
};

const TRANSITION_LABEL = {
  leave: 'Place on Leave',
  returnFromLeave: 'Return from Leave',
  resign: 'Resign',
  rehire: 'Rehire',
  terminate: 'Terminate',
  retire: 'Retire',
};

const TRANSITION_SERVICE = {
  leave: teachersService.placeOnLeave,
  returnFromLeave: teachersService.returnFromLeave,
  resign: teachersService.resign,
  rehire: teachersService.rehire,
  terminate: teachersService.terminate,
  retire: teachersService.retire,
};

const PAGE_SIZE = 20;

export function TeachersListPage() {
  const { showToast } = useToast();
  const [teachers, setTeachers] = React.useState([]);
  const [page, setPage] = React.useState(1);
  const [statusFilter, setStatusFilter] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  const [onboardOpen, setOnboardOpen] = React.useState(false);
  const [editingTeacher, setEditingTeacher] = React.useState(null);
  const [transition, setTransition] = React.useState(null); // { action, teacher }

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const teacherResult = await teachersService.listTeachers({
        employmentStatus: statusFilter || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setTeachers(teacherResult);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleOnboard = async (data) => {
    await teachersService.onboardTeacher(data);
    showToast({ tone: 'success', title: 'Teacher onboarded' });
    load();
  };

  const handleSaveProfile = async (data) => {
    await teachersService.updateTeacherProfile(editingTeacher.id, data);
    showToast({ tone: 'success', title: 'Profile updated' });
    load();
  };

  const handleTransitionConfirm = async (data) => {
    const serviceFn = TRANSITION_SERVICE[transition.action];
    await serviceFn(transition.teacher.id, data);
    showToast({ tone: 'success', title: `${TRANSITION_LABEL[transition.action]} applied` });
    load();
  };

  return (
    <div className="mx-auto max-w-container px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">Teachers</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage Onboarding, profiles, and employment status for your school's Teachers.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setOnboardOpen(true)}>Onboard Teacher</Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <Select
          value={statusFilter}
          onChange={(e) => {
            setPage(1);
            setStatusFilter(e.target.value);
          }}
          options={STATUS_OPTIONS}
        />
      </div>

      <Card padding="p-0">
        {loading ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : teachers.length === 0 ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">No Teachers yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-navy-700 dark:text-gray-400">
                  <th className="px-5 py-3 font-bold">Name</th>
                  <th className="px-5 py-3 font-bold">Employee ID</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((teacher) => {
                  const availableTransitions = TRANSITIONS_BY_STATUS[teacher.employmentStatus] || [];

                  return (
                    <tr key={teacher.id} className="border-b border-gray-100 last:border-0 dark:border-navy-800">
                      <td className="px-5 py-3 text-gray-900 dark:text-gray-100">{teacher.fullName}</td>
                      <td className="px-5 py-3 text-gray-700 dark:text-gray-300">{teacher.employeeId}</td>
                      <td className="px-5 py-3">
                        <TeacherStatusBadge status={teacher.employmentStatus} />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1">
                          <Tooltip label="Edit profile">
                            <IconButton label="Edit profile" size="sm" onClick={() => setEditingTeacher(teacher)}>
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          {availableTransitions.map((action) => {
                            const Icon = TRANSITION_ICON[action];
                            return (
                              <Tooltip key={action} label={TRANSITION_LABEL[action]}>
                                <IconButton
                                  label={TRANSITION_LABEL[action]}
                                  size="sm"
                                  onClick={() => setTransition({ action, teacher })}
                                >
                                  <Icon />
                                </IconButton>
                              </Tooltip>
                            );
                          })}
                          {availableTransitions.length === 0 && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              No further actions — permanent
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-4 flex items-center justify-between">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Previous
        </Button>
        <span className="text-sm text-gray-500 dark:text-gray-400">Page {page}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={teachers.length < PAGE_SIZE}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>

      <OnboardTeacherDialog open={onboardOpen} onClose={() => setOnboardOpen(false)} onCreate={handleOnboard} />
      <EditTeacherDialog
        open={editingTeacher !== null}
        teacher={editingTeacher}
        onClose={() => setEditingTeacher(null)}
        onSave={handleSaveProfile}
      />
      <EmploymentStatusActionDialog
        open={transition !== null}
        action={transition?.action}
        teacher={transition?.teacher}
        onClose={() => setTransition(null)}
        onConfirm={handleTransitionConfirm}
      />
    </div>
  );
}

function EditIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3v18l15-9L6 3Z" />
    </svg>
  );
}

function ExitIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function TerminateIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6M9 9l6 6" />
    </svg>
  );
}

function RetireIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22V4a1 1 0 0 1 1-1c1.5 1.5 3.5 1.5 5 0s3.5-1.5 5 0 3.5 1.5 5 0v13c-1.5 1.5-3.5 1.5-5 0s-3.5-1.5-5 0-3.5 1.5-5 0" />
    </svg>
  );
}
