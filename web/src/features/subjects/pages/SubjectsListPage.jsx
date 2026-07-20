import React from 'react';
import { Button, Card, IconButton, Select, Tooltip } from '../../../shared/components';
import { useToast } from '../../../shared/toast/ToastContext';
import { SubjectStatusBadge } from '../components/SubjectStatusBadge';
import { CreateSubjectDialog } from '../components/CreateSubjectDialog';
import { EditSubjectDialog } from '../components/EditSubjectDialog';
import * as subjectsService from '../services/subjects.service';

const EDUCATION_LEVEL_OPTIONS = [
  { value: '', label: 'All Education Levels' },
  { value: 'PRIMARY', label: 'Primary' },
  { value: 'SECONDARY', label: 'Secondary' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ARCHIVED', label: 'Archived' },
];

export function SubjectsListPage() {
  const { showToast } = useToast();
  const [subjects, setSubjects] = React.useState([]);
  const [educationLevelFilter, setEducationLevelFilter] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editingSubject, setEditingSubject] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await subjectsService.listSubjects({
        educationLevel: educationLevelFilter || undefined,
        status: statusFilter || undefined,
      });
      setSubjects(data);
    } finally {
      setLoading(false);
    }
  }, [educationLevelFilter, statusFilter]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (data) => {
    await subjectsService.createSubject(data);
    showToast({ tone: 'success', title: 'Subject created' });
    load();
  };

  const handleSave = async (subjectId, data) => {
    await subjectsService.updateSubject(subjectId, data);
    showToast({ tone: 'success', title: 'Subject updated' });
    load();
  };

  const runLifecycleAction = async (action, subjectId, successMessage) => {
    try {
      await action(subjectId);
      showToast({ tone: 'success', title: successMessage });
      load();
    } catch (err) {
      showToast({ tone: 'danger', title: 'Action failed', description: err.message });
    }
  };

  return (
    <div className="mx-auto max-w-container px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">Subjects</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            The platform-wide curriculum catalog. Assign Subjects to a School from that School's own page.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Create Subject</Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <Select
          value={educationLevelFilter}
          onChange={(e) => setEducationLevelFilter(e.target.value)}
          options={EDUCATION_LEVEL_OPTIONS}
        />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} options={STATUS_OPTIONS} />
      </div>

      <Card padding="p-0">
        {loading ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : subjects.length === 0 ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">No Subjects yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-navy-700 dark:text-gray-400">
                  <th className="px-5 py-3 font-bold">Name</th>
                  <th className="px-5 py-3 font-bold">Education Level</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 font-bold">Schools</th>
                  <th className="px-5 py-3 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((subject) => (
                  <tr key={subject.id} className="border-b border-gray-100 last:border-0 dark:border-navy-800">
                    <td className="px-5 py-3 text-gray-900 dark:text-gray-100">{subject.name}</td>
                    <td className="px-5 py-3 text-gray-700 dark:text-gray-300">
                      {subject.educationLevel === 'PRIMARY' ? 'Primary' : 'Secondary'}
                    </td>
                    <td className="px-5 py-3">
                      <SubjectStatusBadge status={subject.status} />
                    </td>
                    <td className="px-5 py-3 text-gray-700 dark:text-gray-300">{subject.assignedSchoolCount}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1">
                        <Tooltip label="Edit">
                          <IconButton label="Edit" size="sm" onClick={() => setEditingSubject(subject)}>
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        {subject.status === 'ACTIVE' ? (
                          <Tooltip label="Archive">
                            <IconButton
                              label="Archive"
                              size="sm"
                              onClick={() =>
                                runLifecycleAction(subjectsService.archiveSubject, subject.id, 'Subject archived')
                              }
                            >
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
                                  subjectsService.reactivateSubject,
                                  subject.id,
                                  'Subject reactivated'
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

      <CreateSubjectDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
      <EditSubjectDialog
        open={editingSubject !== null}
        subject={editingSubject}
        onClose={() => setEditingSubject(null)}
        onSave={handleSave}
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
