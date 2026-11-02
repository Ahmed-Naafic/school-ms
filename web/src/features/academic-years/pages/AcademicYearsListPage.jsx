import React from 'react';
import { Button, Card, IconButton, Select, Tooltip } from '../../../shared/components';
import { useToast } from '../../../shared/toast/ToastContext';
import { AcademicYearStatusBadge } from '../components/AcademicYearStatusBadge';
import { CreateAcademicYearDialog } from '../components/CreateAcademicYearDialog';
import { EditAcademicYearDialog } from '../components/EditAcademicYearDialog';
import { ArchiveAcademicYearDialog } from '../components/ArchiveAcademicYearDialog';
import { formatAcademicYearLabel } from '../utils/format-academic-year-label';
import * as academicYearsService from '../services/academic-years.service';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ARCHIVED', label: 'Archived' },
];

export function AcademicYearsListPage() {
  const { showToast } = useToast();
  const [academicYears, setAcademicYears] = React.useState([]);
  const [statusFilter, setStatusFilter] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editingYear, setEditingYear] = React.useState(null);
  const [archivingYear, setArchivingYear] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await academicYearsService.listAcademicYears({ status: statusFilter || undefined });
      setAcademicYears(data);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (data) => {
    await academicYearsService.createAcademicYear(data);
    showToast({ tone: 'success', title: 'Academic Year created' });
    load();
  };

  const handleSave = async (id, data) => {
    await academicYearsService.updateAcademicYear(id, data);
    showToast({ tone: 'success', title: 'Academic Year updated' });
    load();
  };

  const handleArchiveConfirm = async (id, newCurrentAcademicYearId) => {
    await academicYearsService.archiveAcademicYear(id, newCurrentAcademicYearId);
    showToast({ tone: 'success', title: 'Academic Year archived' });
    load();
  };

  const runLifecycleAction = async (action, id, successMessage) => {
    try {
      await action(id);
      showToast({ tone: 'success', title: successMessage });
      load();
    } catch (err) {
      showToast({ tone: 'danger', title: 'Action failed', description: err.message });
    }
  };

  const otherActiveYearsFor = (target) =>
    academicYears.filter((y) => y.id !== target.id && y.status === 'ACTIVE');

  return (
    <div className="mx-auto max-w-container px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">Academic Years</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage your school's Academic Years and which one is Current.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Create Academic Year</Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} options={STATUS_OPTIONS} />
      </div>

      <Card padding="p-0">
        {loading ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : academicYears.length === 0 ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">No Academic Years yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-navy-700 dark:text-gray-400">
                  <th className="px-5 py-3 font-bold">Academic Year</th>
                  <th className="px-5 py-3 font-bold">Start</th>
                  <th className="px-5 py-3 font-bold">End</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 font-bold">Current</th>
                  <th className="px-5 py-3 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {academicYears.map((year) => (
                  <tr key={year.id} className="border-b border-gray-100 last:border-0 dark:border-navy-800">
                    <td className="px-5 py-3 font-semibold text-gray-900 dark:text-gray-100">
                      {formatAcademicYearLabel(year.startDate, year.endDate)}
                    </td>
                    <td className="px-5 py-3 text-gray-700 dark:text-gray-300">
                      {new Date(year.startDate).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-gray-700 dark:text-gray-300">
                      {new Date(year.endDate).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3">
                      <AcademicYearStatusBadge status={year.status} />
                    </td>
                    <td className="px-5 py-3">
                      {year.isCurrent ? (
                        <span className="text-xs font-bold text-teal-700 dark:text-teal-400">Current</span>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Tooltip label="Edit">
                          <IconButton label="Edit" size="sm" onClick={() => setEditingYear(year)}>
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        {year.status === 'ACTIVE' && !year.isCurrent && (
                          <Tooltip label="Make Current">
                            <IconButton
                              label="Make Current"
                              size="sm"
                              onClick={() =>
                                runLifecycleAction(
                                  academicYearsService.designateCurrentAcademicYear,
                                  year.id,
                                  'Current Academic Year updated'
                                )
                              }
                            >
                              <StarIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        {year.status === 'ACTIVE' ? (
                          <Tooltip label="Archive">
                            <IconButton label="Archive" size="sm" onClick={() => setArchivingYear(year)}>
                              <ArchiveIcon />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Tooltip label="Reactivate">
                            <IconButton
                              label="Reactivate"
                              size="sm"
                              onClick={() =>
                                runLifecycleAction(
                                  academicYearsService.reactivateAcademicYear,
                                  year.id,
                                  'Academic Year reactivated'
                                )
                              }
                            >
                              <ReactivateIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CreateAcademicYearDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
      <EditAcademicYearDialog
        open={editingYear !== null}
        academicYear={editingYear}
        onClose={() => setEditingYear(null)}
        onSave={handleSave}
      />
      <ArchiveAcademicYearDialog
        open={archivingYear !== null}
        academicYear={archivingYear}
        otherActiveYears={archivingYear ? otherActiveYearsFor(archivingYear) : []}
        onClose={() => setArchivingYear(null)}
        onConfirm={handleArchiveConfirm}
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

function StarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2Z" />
    </svg>
  );
}
