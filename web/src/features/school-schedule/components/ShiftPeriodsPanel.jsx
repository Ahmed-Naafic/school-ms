import React from 'react';
import { Badge, Button, IconButton, Tooltip } from '../../../shared/components';
import { useToast } from '../../../shared/toast/ToastContext';
import { CreatePeriodDialog } from './CreatePeriodDialog';
import { EditPeriodDialog } from './EditPeriodDialog';
import * as scheduleService from '../services/school-schedule.service';

// Embedded inline under an expanded Shift row — a Shift's own ordered
// Period list, with its own Create/Edit/Reorder/Archive/Reactivate actions,
// scoped to that one Shift only (Architecture Update — Periods).
export function ShiftPeriodsPanel({ shiftId }) {
  const { showToast } = useToast();
  const [periods, setPeriods] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editingPeriod, setEditingPeriod] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setPeriods(await scheduleService.listPeriods(shiftId));
    } finally {
      setLoading(false);
    }
  }, [shiftId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const runAction = async (action, successMessage) => {
    try {
      await action();
      showToast({ tone: 'success', title: successMessage });
      load();
    } catch (err) {
      showToast({ tone: 'danger', title: 'Action failed', description: err.message });
    }
  };

  const handleCreate = async (data) => {
    await scheduleService.createPeriod(shiftId, data);
    showToast({ tone: 'success', title: 'Period created' });
    load();
  };

  const handleSave = async (id, data) => {
    await scheduleService.updatePeriod(id, data);
    showToast({ tone: 'success', title: 'Period updated' });
    load();
  };

  const activePeriods = periods.filter((p) => p.status === 'ACTIVE').sort((a, b) => a.displayOrder - b.displayOrder);
  const archivedPeriods = periods.filter((p) => p.status === 'ARCHIVED');
  const orderedPeriods = [...activePeriods, ...archivedPeriods];

  const movePeriod = (period, delta) => {
    const idx = activePeriods.findIndex((p) => p.id === period.id);
    const targetPosition = idx + 1 + delta;
    if (targetPosition < 1 || targetPosition > activePeriods.length) return;
    runAction(() => scheduleService.reorderPeriod(period.id, targetPosition), 'Period order updated');
  };

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-navy-700 dark:bg-navy-900/40">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-body text-sm font-bold text-navy-900 dark:text-white">Periods</h3>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          Add Period
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      ) : periods.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No Periods yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <th className="py-2 pr-3 font-bold">Order</th>
              <th className="py-2 pr-3 font-bold">Name</th>
              <th className="py-2 pr-3 font-bold">Type</th>
              <th className="py-2 pr-3 font-bold">Start</th>
              <th className="py-2 pr-3 font-bold">End</th>
              <th className="py-2 pr-3 font-bold">Status</th>
              <th className="py-2 pr-3 font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orderedPeriods.map((period) => {
              const isActive = period.status === 'ACTIVE';
              const idx = activePeriods.findIndex((p) => p.id === period.id);
              return (
                <tr key={period.id} className="border-t border-gray-200 dark:border-navy-800">
                  <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">{period.displayOrder ?? '—'}</td>
                  <td className="py-2 pr-3 font-semibold text-gray-900 dark:text-gray-100">{period.name}</td>
                  <td className="py-2 pr-3">
                    <Badge tone={period.type === 'BREAK' ? 'warning' : 'accent'}>
                      {period.type === 'BREAK' ? 'Break' : 'Teaching'}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">{period.startTime ?? 'Not configured'}</td>
                  <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">{period.endTime ?? 'Not configured'}</td>
                  <td className="py-2 pr-3">
                    <Badge tone={isActive ? 'success' : 'neutral'}>{isActive ? 'Active' : 'Archived'}</Badge>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap gap-1">
                      {isActive && (
                        <>
                          <Tooltip label="Move up">
                            <IconButton label="Move up" size="sm" disabled={idx <= 0} onClick={() => movePeriod(period, -1)}>
                              <UpIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip label="Move down">
                            <IconButton
                              label="Move down"
                              size="sm"
                              disabled={idx >= activePeriods.length - 1}
                              onClick={() => movePeriod(period, 1)}
                            >
                              <DownIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip label="Edit">
                            <IconButton label="Edit" size="sm" onClick={() => setEditingPeriod(period)}>
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip label="Archive">
                            <IconButton
                              label="Archive"
                              size="sm"
                              onClick={() => runAction(() => scheduleService.archivePeriod(period.id), 'Period archived')}
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
                            onClick={() => runAction(() => scheduleService.reactivatePeriod(period.id), 'Period reactivated')}
                          >
                            <ReactivateIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <CreatePeriodDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
      <EditPeriodDialog
        open={editingPeriod !== null}
        period={editingPeriod}
        onClose={() => setEditingPeriod(null)}
        onSave={handleSave}
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
