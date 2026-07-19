import React from 'react';
import { Button, Card, IconButton, Switch, Tooltip } from '../../../shared/components';
import { useToast } from '../../../shared/toast/ToastContext';
import { DepartmentStatusBadge } from '../components/DepartmentStatusBadge';
import { CreateDepartmentDialog } from '../components/CreateDepartmentDialog';
import { EditDepartmentDialog } from '../components/EditDepartmentDialog';
import * as teachersService from '../services/teachers.service';

export function DepartmentsPage() {
  const { showToast } = useToast();
  const [departments, setDepartments] = React.useState([]);
  const [includeArchived, setIncludeArchived] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editingDepartment, setEditingDepartment] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setDepartments(await teachersService.listDepartments({ includeArchived }));
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (data) => {
    await teachersService.createDepartment(data);
    showToast({ tone: 'success', title: 'Department created' });
    load();
  };

  const handleSaveName = async (data) => {
    await teachersService.updateDepartment(editingDepartment.id, data);
    showToast({ tone: 'success', title: 'Department updated' });
    load();
  };

  const handleArchive = async (department) => {
    try {
      await teachersService.archiveDepartment(department.id);
      showToast({ tone: 'success', title: 'Department archived' });
      load();
    } catch (err) {
      showToast({ tone: 'danger', title: 'Action failed', description: err.message });
    }
  };

  return (
    <div className="mx-auto max-w-container px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">Departments</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage your school's Department reference list, used when onboarding or editing Teachers.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Create Department</Button>
      </div>

      <div className="mb-4">
        <Switch label="Show archived" checked={includeArchived} onChange={setIncludeArchived} />
      </div>

      <Card padding="p-0">
        {loading ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : departments.length === 0 ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">No Departments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-navy-700 dark:text-gray-400">
                  <th className="px-5 py-3 font-bold">Name</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((department) => {
                  const isArchived = department.status === 'ARCHIVED';
                  return (
                    <tr key={department.id} className="border-b border-gray-100 last:border-0 dark:border-navy-800">
                      <td className="px-5 py-3 text-gray-900 dark:text-gray-100">{department.name}</td>
                      <td className="px-5 py-3">
                        <DepartmentStatusBadge status={department.status} />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1">
                          <Tooltip label="Rename">
                            <IconButton
                              label="Rename"
                              size="sm"
                              onClick={() => setEditingDepartment(department)}
                            >
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          {!isArchived && (
                            <Tooltip label="Archive">
                              <IconButton label="Archive" size="sm" onClick={() => handleArchive(department)}>
                                <ArchiveIcon />
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
          </div>
        )}
      </Card>

      <CreateDepartmentDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
      <EditDepartmentDialog
        open={editingDepartment !== null}
        initialName={editingDepartment?.name}
        onClose={() => setEditingDepartment(null)}
        onSave={handleSaveName}
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
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4" />
    </svg>
  );
}
