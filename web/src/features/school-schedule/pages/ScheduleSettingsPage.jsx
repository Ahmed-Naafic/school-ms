import React from 'react';
import { Badge, Button, Card, IconButton, Switch, Tooltip } from '../../../shared/components';
import { useToast } from '../../../shared/toast/ToastContext';
import { CreateShiftDialog } from '../components/CreateShiftDialog';
import { EditShiftDialog } from '../components/EditShiftDialog';
import { ShiftPeriodsPanel } from '../components/ShiftPeriodsPanel';
import * as scheduleService from '../services/school-schedule.service';

const DAYS_IN_ORDER = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const DAY_LABELS = {
  SUNDAY: 'Sunday',
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
};

export function ScheduleSettingsPage() {
  const { showToast } = useToast();
  const [workingDays, setWorkingDays] = React.useState([]);
  const [shifts, setShifts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [savingCalendar, setSavingCalendar] = React.useState(false);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editingShift, setEditingShift] = React.useState(null);
  const [expandedShiftId, setExpandedShiftId] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [calendar, shiftList] = await Promise.all([
        scheduleService.getSchoolCalendar(),
        scheduleService.listShifts(),
      ]);
      setWorkingDays(calendar.workingDays);
      setShifts(shiftList);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const toggleDay = (day) => {
    setWorkingDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const handleSaveCalendar = async () => {
    setSavingCalendar(true);
    try {
      await scheduleService.updateSchoolCalendar(workingDays);
      showToast({ tone: 'success', title: 'Calendar updated' });
      load();
    } catch (err) {
      showToast({ tone: 'danger', title: 'Update failed', description: err.message });
    } finally {
      setSavingCalendar(false);
    }
  };

  const handleCreateShift = async (data) => {
    await scheduleService.createShift(data);
    showToast({ tone: 'success', title: 'Shift created' });
    load();
  };

  const handleSaveShift = async (id, data) => {
    await scheduleService.updateShift(id, data);
    showToast({ tone: 'success', title: 'Shift updated' });
    load();
  };

  const runAction = async (action, successMessage) => {
    try {
      await action();
      showToast({ tone: 'success', title: successMessage });
      load();
    } catch (err) {
      showToast({ tone: 'danger', title: 'Action failed', description: err.message });
    }
  };

  const activeShifts = shifts.filter((s) => s.status === 'ACTIVE').sort((a, b) => a.displayOrder - b.displayOrder);
  const archivedShifts = shifts.filter((s) => s.status === 'ARCHIVED');
  const orderedShifts = [...activeShifts, ...archivedShifts];

  const moveShift = (shift, delta) => {
    const idx = activeShifts.findIndex((s) => s.id === shift.id);
    const targetPosition = idx + 1 + delta;
    if (targetPosition < 1 || targetPosition > activeShifts.length) return;
    runAction(() => scheduleService.reorderShift(shift.id, targetPosition), 'Shift order updated');
  };

  return (
    <div className="mx-auto max-w-container px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">School Schedule</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Configure your school's Working Days, Weekend Days, and teaching Shifts.
        </p>
      </div>

      <Card className="mb-6">
        <h2 className="mb-1 font-display text-lg font-bold text-navy-900 dark:text-white">Weekly Calendar</h2>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Toggle each day on for a Working Day, off for a Weekend Day. At least one of each is required.
        </p>
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {DAYS_IN_ORDER.map((day) => (
                <Switch
                  key={day}
                  label={DAY_LABELS[day]}
                  checked={workingDays.includes(day)}
                  onChange={() => toggleDay(day)}
                />
              ))}
            </div>
            <Button onClick={handleSaveCalendar} disabled={savingCalendar}>
              {savingCalendar ? 'Saving…' : 'Save Calendar'}
            </Button>
          </>
        )}
      </Card>

      <Card padding="p-0">
        <div className="flex items-center justify-between p-5 pb-0">
          <h2 className="font-display text-lg font-bold text-navy-900 dark:text-white">Shifts</h2>
          <Button onClick={() => setCreateOpen(true)}>Create Shift</Button>
        </div>

        {loading ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : shifts.length === 0 ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">No Shifts yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-navy-700 dark:text-gray-400">
                  <th className="px-5 py-3 font-bold">Order</th>
                  <th className="px-5 py-3 font-bold">Name</th>
                  <th className="px-5 py-3 font-bold">Start</th>
                  <th className="px-5 py-3 font-bold">End</th>
                  <th className="px-5 py-3 font-bold">Default</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orderedShifts.map((shift) => {
                  const isActive = shift.status === 'ACTIVE';
                  const idx = activeShifts.findIndex((s) => s.id === shift.id);
                  const isExpanded = expandedShiftId === shift.id;
                  return (
                    <React.Fragment key={shift.id}>
                    <tr className="border-b border-gray-100 last:border-0 dark:border-navy-800">
                      <td className="px-5 py-3 text-gray-700 dark:text-gray-300">{shift.displayOrder ?? '—'}</td>
                      <td className="px-5 py-3 font-semibold text-gray-900 dark:text-gray-100">{shift.name}</td>
                      <td className="px-5 py-3 text-gray-700 dark:text-gray-300">{shift.startTime}</td>
                      <td className="px-5 py-3 text-gray-700 dark:text-gray-300">{shift.endTime}</td>
                      <td className="px-5 py-3">
                        {shift.isDefault ? (
                          <Badge tone="accent">Default</Badge>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={isActive ? 'success' : 'neutral'}>{isActive ? 'Active' : 'Archived'}</Badge>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {isActive && (
                            <>
                              <Tooltip label="Move up">
                                <IconButton
                                  label="Move up"
                                  size="sm"
                                  disabled={idx <= 0}
                                  onClick={() => moveShift(shift, -1)}
                                >
                                  <UpIcon />
                                </IconButton>
                              </Tooltip>
                              <Tooltip label="Move down">
                                <IconButton
                                  label="Move down"
                                  size="sm"
                                  disabled={idx >= activeShifts.length - 1}
                                  onClick={() => moveShift(shift, 1)}
                                >
                                  <DownIcon />
                                </IconButton>
                              </Tooltip>
                              <Tooltip label="Edit">
                                <IconButton label="Edit" size="sm" onClick={() => setEditingShift(shift)}>
                                  <EditIcon />
                                </IconButton>
                              </Tooltip>
                              {!shift.isDefault && (
                                <Tooltip label="Make Default">
                                  <IconButton
                                    label="Make Default"
                                    size="sm"
                                    onClick={() =>
                                      runAction(
                                        () => scheduleService.designateDefaultShift(shift.id),
                                        'Default Shift updated'
                                      )
                                    }
                                  >
                                    <StarIcon />
                                  </IconButton>
                                </Tooltip>
                              )}
                              <Tooltip label="Archive">
                                <IconButton
                                  label="Archive"
                                  size="sm"
                                  onClick={() =>
                                    runAction(() => scheduleService.archiveShift(shift.id), 'Shift archived')
                                  }
                                >
                                  <ArchiveIcon />
                                </IconButton>
                              </Tooltip>
                            </>
                          )}
                          {!isActive && (
                            <Tooltip label="Reactivate">
                              <IconButton
                                label="Reactivate"
                                size="sm"
                                onClick={() =>
                                  runAction(() => scheduleService.reactivateShift(shift.id), 'Shift reactivated')
                                }
                              >
                                <ReactivateIcon />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip label={isExpanded ? 'Hide Periods' : 'Show Periods'}>
                            <IconButton
                              label={isExpanded ? 'Hide Periods' : 'Show Periods'}
                              size="sm"
                              onClick={() => setExpandedShiftId(isExpanded ? null : shift.id)}
                            >
                              {isExpanded ? <UpIcon /> : <DownIcon />}
                            </IconButton>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-gray-100 last:border-0 dark:border-navy-800">
                        <td colSpan={7} className="bg-gray-50 px-5 py-4 dark:bg-navy-900/40">
                          <ShiftPeriodsPanel shiftId={shift.id} />
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CreateShiftDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreateShift} />
      <EditShiftDialog
        open={editingShift !== null}
        shift={editingShift}
        onClose={() => setEditingShift(null)}
        onSave={handleSaveShift}
      />
    </div>
  );
}

function UpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

function DownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2Z" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" />
    </svg>
  );
}

function ReactivateIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}
