import React from 'react';
import { Badge, Button, Card, IconButton, Tooltip } from '../../../shared/components';
import { useToast } from '../../../shared/toast/ToastContext';
import { CreateGradeLevelDialog } from '../components/CreateGradeLevelDialog';
import { EditGradeLevelDialog } from '../components/EditGradeLevelDialog';
import * as gradeLevelsService from '../services/grade-levels.service';

// (ACR-009, Architecture Update — Grade/Form) Mirrors ScheduleSettingsPage's
// own Shifts table shape one level up — same reorder-by-button, Archive/
// Reactivate convention.
export function GradeLevelsPage() {
  const { showToast } = useToast();
  const [gradeLevels, setGradeLevels] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editingGradeLevel, setEditingGradeLevel] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setGradeLevels(await gradeLevelsService.listGradeLevels());
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (data) => {
    await gradeLevelsService.createGradeLevel(data);
    showToast({ tone: 'success', title: 'Grade/Form created' });
    load();
  };

  const handleSave = async (data) => {
    await gradeLevelsService.updateGradeLevel(editingGradeLevel.id, data);
    showToast({ tone: 'success', title: 'Grade/Form updated' });
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

  const activeGradeLevels = gradeLevels
    .filter((gl) => gl.status === 'ACTIVE')
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  const archivedGradeLevels = gradeLevels.filter((gl) => gl.status === 'ARCHIVED');
  const orderedGradeLevels = [...activeGradeLevels, ...archivedGradeLevels];

  const moveGradeLevel = (gradeLevel, delta) => {
    const idx = activeGradeLevels.findIndex((gl) => gl.id === gradeLevel.id);
    const targetPosition = idx + 1 + delta;
    if (targetPosition < 1 || targetPosition > activeGradeLevels.length) return;
    runAction(() => gradeLevelsService.reorderGradeLevel(gradeLevel.id, targetPosition), 'Grade/Form order updated');
  };

  return (
    <div className="mx-auto max-w-container px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">Grade/Form</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Groups of Classes sharing the same year level (e.g. "Grade 8" groups G8A, G8B, G8C). Every Class within
            one Grade/Form must use the same Shift.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Create Grade/Form</Button>
      </div>

      <Card padding="p-0">
        {loading ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : gradeLevels.length === 0 ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">No Grade/Forms yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-navy-700 dark:text-gray-400">
                  <th className="px-5 py-3 font-bold">Order</th>
                  <th className="px-5 py-3 font-bold">Name</th>
                  <th className="px-5 py-3 font-bold">Education Level</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orderedGradeLevels.map((gradeLevel) => {
                  const isActive = gradeLevel.status === 'ACTIVE';
                  const idx = activeGradeLevels.findIndex((gl) => gl.id === gradeLevel.id);
                  // Every pre-existing school's own migration-created
                  // placeholder — a real, temporary artifact, not a Grade/
                  // Form a School Admin deliberately created. Flagged
                  // distinctly so it's never mistaken for one.
                  const isPlaceholder = gradeLevel.name === 'Ungrouped';

                  return (
                    <tr key={gradeLevel.id} className="border-b border-gray-100 last:border-0 dark:border-navy-800">
                      <td className="px-5 py-3 text-gray-700 dark:text-gray-300">{gradeLevel.sequenceOrder}</td>
                      <td className="px-5 py-3 font-semibold text-gray-900 dark:text-gray-100">
                        <div className="flex items-center gap-2">
                          {gradeLevel.name}
                          {isPlaceholder && <Badge tone="neutral">Ungrouped — reassign your Classes</Badge>}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-700 dark:text-gray-300">
                        {gradeLevel.educationLevel === 'PRIMARY' ? 'Primary' : 'Secondary'}
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
                                  onClick={() => moveGradeLevel(gradeLevel, -1)}
                                >
                                  <UpIcon />
                                </IconButton>
                              </Tooltip>
                              <Tooltip label="Move down">
                                <IconButton
                                  label="Move down"
                                  size="sm"
                                  disabled={idx >= activeGradeLevels.length - 1}
                                  onClick={() => moveGradeLevel(gradeLevel, 1)}
                                >
                                  <DownIcon />
                                </IconButton>
                              </Tooltip>
                              <Tooltip label="Rename">
                                <IconButton label="Rename" size="sm" onClick={() => setEditingGradeLevel(gradeLevel)}>
                                  <EditIcon />
                                </IconButton>
                              </Tooltip>
                              <Tooltip label="Archive">
                                <IconButton
                                  label="Archive"
                                  size="sm"
                                  onClick={() =>
                                    runAction(
                                      () => gradeLevelsService.archiveGradeLevel(gradeLevel.id),
                                      'Grade/Form archived'
                                    )
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
                                  runAction(
                                    () => gradeLevelsService.reactivateGradeLevel(gradeLevel.id),
                                    'Grade/Form reactivated'
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CreateGradeLevelDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
      <EditGradeLevelDialog
        open={editingGradeLevel !== null}
        initialName={editingGradeLevel?.name}
        initialEducationLevel={editingGradeLevel?.educationLevel}
        onClose={() => setEditingGradeLevel(null)}
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
