import React from 'react';
import { Button, Card, IconButton, Tag, Tooltip } from '../../../shared/components';
import { useToast } from '../../../shared/toast/ToastContext';
import { ClassStatusBadge } from '../components/ClassStatusBadge';
import { CreateClassDialog } from '../components/CreateClassDialog';
import { CreateSectionDialog } from '../components/CreateSectionDialog';
import { EditClassDialog } from '../components/EditClassDialog';
import * as classesService from '../services/classes.service';
import { formatClassSectionName } from '../utils/format-class-section-name';

export function ClassesListPage() {
  const { showToast } = useToast();
  const [classes, setClasses] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [createClassOpen, setCreateClassOpen] = React.useState(false);
  const [sectionDialogClassId, setSectionDialogClassId] = React.useState(null);
  const [editingClass, setEditingClass] = React.useState(null);

  const classOptions = React.useMemo(
    () => classes.filter((c) => c.status === 'ACTIVE').map((c) => ({ value: c.id, label: c.name })),
    [classes]
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setClasses(await classesService.listClasses());
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleCreateClass = async (data) => {
    await classesService.createClass(data);
    showToast({ tone: 'success', title: 'Class created' });
    load();
  };

  const handleCreateSection = async (classId, data) => {
    await classesService.createSection(classId, data);
    showToast({ tone: 'success', title: 'Section added' });
    load();
  };

  const handleSaveClassName = async (data) => {
    await classesService.updateClass(editingClass.id, data);
    showToast({ tone: 'success', title: 'Class updated' });
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

  const activeClasses = classes.filter((c) => c.status === 'ACTIVE');

  return (
    <div className="mx-auto max-w-container px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">Classes</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage your school's Class structure, Sections, and academic sequence.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSectionDialogClassId('')}>
            Add Section
          </Button>
          <Button onClick={() => setCreateClassOpen(true)}>Create Class</Button>
        </div>
      </div>

      <Card padding="p-0">
        {loading ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : classes.length === 0 ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">No Classes yet.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-navy-700 dark:text-gray-400">
                <th className="px-5 py-3 font-bold">#</th>
                <th className="px-5 py-3 font-bold">Name</th>
                <th className="px-5 py-3 font-bold">Status</th>
                <th className="px-5 py-3 font-bold">Sections</th>
                <th className="px-5 py-3 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((cls) => {
                const index = activeClasses.findIndex((c) => c.id === cls.id);
                const isArchived = cls.status === 'ARCHIVED';

                return (
                  <tr key={cls.id} className="border-b border-gray-100 last:border-0 dark:border-navy-800">
                    <td className="px-5 py-3 text-gray-700 dark:text-gray-300">{cls.sequenceOrder}</td>
                    <td className="px-5 py-3 text-gray-900 dark:text-gray-100">
                      <div className="flex items-center gap-2">
                        {cls.name}
                        {cls.isFinal && <Tag>Final Class</Tag>}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <ClassStatusBadge status={cls.status} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {cls.sections.map((section) => (
                          <div key={section.id} className="flex items-center gap-1">
                            <Tag className={section.status === 'ARCHIVED' ? 'opacity-50' : ''}>
                              {formatClassSectionName(cls.name, section.name)}
                            </Tag>
                            {!isArchived &&
                              (section.status === 'ARCHIVED' ? (
                                <Tooltip label="Reactivate Section">
                                  <IconButton
                                    label="Reactivate Section"
                                    size="sm"
                                    onClick={() =>
                                      runAction(
                                        () => classesService.reactivateSection(cls.id, section.id),
                                        'Section reactivated'
                                      )
                                    }
                                  >
                                    <RestoreIcon />
                                  </IconButton>
                                </Tooltip>
                              ) : (
                                <Tooltip label="Archive Section">
                                  <IconButton
                                    label="Archive Section"
                                    size="sm"
                                    onClick={() =>
                                      runAction(
                                        () => classesService.archiveSection(cls.id, section.id),
                                        'Section archived'
                                      )
                                    }
                                  >
                                    <ArchiveIcon />
                                  </IconButton>
                                </Tooltip>
                              ))}
                          </div>
                        ))}
                        {!isArchived && (
                          <Tooltip label="Add Section">
                            <IconButton
                              label="Add Section"
                              size="sm"
                              onClick={() => setSectionDialogClassId(cls.id)}
                            >
                              <PlusIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1">
                        <Tooltip label="Rename">
                          <IconButton label="Rename" size="sm" onClick={() => setEditingClass(cls)}>
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        {isArchived ? (
                          <Tooltip label="Reactivate">
                            <IconButton
                              label="Reactivate"
                              size="sm"
                              onClick={() =>
                                runAction(() => classesService.reactivateClass(cls.id), 'Class reactivated')
                              }
                            >
                              <RestoreIcon />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <>
                            <Tooltip label="Move up">
                              <IconButton
                                label="Move up"
                                size="sm"
                                disabled={index <= 0}
                                onClick={() =>
                                  runAction(
                                    () => classesService.reorderClass(cls.id, index),
                                    'Class moved'
                                  )
                                }
                              >
                                <ArrowUpIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip label="Move down">
                              <IconButton
                                label="Move down"
                                size="sm"
                                disabled={index === -1 || index >= activeClasses.length - 1}
                                onClick={() =>
                                  runAction(
                                    () => classesService.reorderClass(cls.id, index + 2),
                                    'Class moved'
                                  )
                                }
                              >
                                <ArrowDownIcon />
                              </IconButton>
                            </Tooltip>
                            {!cls.isFinal && (
                              <Tooltip label="Designate as final Class">
                                <IconButton
                                  label="Designate as final Class"
                                  size="sm"
                                  onClick={() =>
                                    runAction(
                                      () => classesService.designateFinalClass(cls.id),
                                      'Final Class designated'
                                    )
                                  }
                                >
                                  <FlagIcon />
                                </IconButton>
                              </Tooltip>
                            )}
                            <Tooltip label="Archive">
                              <IconButton
                                label="Archive"
                                size="sm"
                                onClick={() => runAction(() => classesService.archiveClass(cls.id), 'Class archived')}
                              >
                                <ArchiveIcon />
                              </IconButton>
                            </Tooltip>
                          </>
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

      <CreateClassDialog open={createClassOpen} onClose={() => setCreateClassOpen(false)} onCreate={handleCreateClass} />
      <CreateSectionDialog
        open={sectionDialogClassId !== null}
        classOptions={classOptions}
        initialClassId={sectionDialogClassId || ''}
        onClose={() => setSectionDialogClassId(null)}
        onCreate={handleCreateSection}
      />
      <EditClassDialog
        open={editingClass !== null}
        initialName={editingClass?.name}
        onClose={() => setEditingClass(null)}
        onSave={handleSaveClassName}
      />
    </div>
  );
}

function ArrowUpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22V4a1 1 0 0 1 1-1c1.5 1.5 3.5 1.5 5 0s3.5-1.5 5 0 3.5 1.5 5 0v13c-1.5 1.5-3.5 1.5-5 0s-3.5-1.5-5 0-3.5 1.5-5 0" />
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

function RestoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
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
