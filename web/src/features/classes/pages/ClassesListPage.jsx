import React from 'react';
import { Button, Card, IconButton, Tag, Tooltip } from '../../../shared/components';
import { useToast } from '../../../shared/toast/ToastContext';
import { ClassStatusBadge } from '../components/ClassStatusBadge';
import { CreateClassDialog } from '../components/CreateClassDialog';
import { CreateSectionDialog } from '../components/CreateSectionDialog';
import { EditClassDialog } from '../components/EditClassDialog';
import { EditSectionDialog } from '../components/EditSectionDialog';
import * as classesService from '../services/classes.service';
import * as gradeLevelsService from '../services/grade-levels.service';
import { formatClassSectionName } from '../utils/format-class-section-name';

export function ClassesListPage() {
  const { showToast } = useToast();
  const [classes, setClasses] = React.useState([]);
  const [gradeLevels, setGradeLevels] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [createClassOpen, setCreateClassOpen] = React.useState(false);
  const [sectionDialogClassId, setSectionDialogClassId] = React.useState(null);
  const [editingClass, setEditingClass] = React.useState(null);
  const [editingSection, setEditingSection] = React.useState(null);

  const classOptions = React.useMemo(
    () => classes.filter((c) => c.status === 'ACTIVE').map((c) => ({ value: c.id, label: c.name })),
    [classes]
  );

  // (ACR-009, Architecture Update — Grade/Form)
  const gradeLevelOptions = React.useMemo(
    () => gradeLevels.filter((gl) => gl.status === 'ACTIVE').map((gl) => ({ value: gl.id, label: gl.name })),
    [gradeLevels]
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [classList, gradeLevelList] = await Promise.all([
        classesService.listClasses(),
        gradeLevelsService.listGradeLevels(),
      ]);
      setClasses(classList);
      setGradeLevels(gradeLevelList);
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

  const handleSaveSectionName = async (data) => {
    await classesService.updateSection(editingSection.classId, editingSection.sectionId, data);
    showToast({ tone: 'success', title: 'Section updated' });
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

  // Only one Sections popup open at a time. Tracked by class id (not the
  // trigger element) so it survives the table re-rendering after a Section
  // action reloads the list.
  const [sectionsPopupClassId, setSectionsPopupClassId] = React.useState(null);
  const closeSectionsPopup = React.useCallback(() => setSectionsPopupClassId(null), []);

  return (
    <div className="mx-auto max-w-container px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">Classes</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage your school's Class structure, Sections, and academic sequence.
          </p>
        </div>
        <Button onClick={() => setCreateClassOpen(true)}>Create Class</Button>
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
                const isExpanded = sectionsPopupClassId === cls.id;
                const activeSectionCount = cls.sections.filter((sec) => sec.status !== 'ARCHIVED').length;
                const archivedSectionCount = cls.sections.length - activeSectionCount;

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
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          aria-haspopup="dialog"
                          data-sections-trigger={cls.id}
                          onClick={() => setSectionsPopupClassId(isExpanded ? null : cls.id)}
                          className={[
                            'inline-flex items-center gap-1.5 rounded-pill border px-3 py-1 text-xs font-bold transition-colors duration-fast',
                            isExpanded
                              ? 'border-teal-500 bg-teal-50 text-teal-700 dark:bg-navy-800 dark:text-teal-300'
                              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-navy-700 dark:bg-navy-900 dark:text-gray-300',
                          ].join(' ')}
                        >
                          {activeSectionCount} {activeSectionCount === 1 ? 'section' : 'sections'}
                          {archivedSectionCount > 0 && (
                            <span className="font-normal text-gray-500 dark:text-gray-400">+{archivedSectionCount} archived</span>
                          )}
                          <ChevronIcon open={isExpanded} />
                        </button>
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
                      {isExpanded && (
                        <SectionsPopup
                          classId={cls.id}
                          title={`${cls.name} — Sections`}
                          onClose={closeSectionsPopup}
                        >
                    {cls.sections.length === 0 && (
                      <span className="px-1 text-xs text-gray-500 dark:text-gray-400">No Sections yet.</span>
                    )}
                    {cls.sections.map((section) => (
                      <div
                        key={section.id}
                        className="flex items-center gap-1 rounded-md border border-gray-200 bg-white py-0.5 pl-1 pr-0.5 dark:border-navy-700 dark:bg-navy-900"
                      >
                        <Tooltip label="Edit Section">
                          <button
                            type="button"
                            onClick={() =>
                              setEditingSection({
                                classId: cls.id,
                                sectionId: section.id,
                                name: section.name,
                                combinedName: formatClassSectionName(cls.name, section.name),
                              })
                            }
                          >
                            <Tag className={['cursor-pointer', section.status === 'ARCHIVED' ? 'opacity-50' : ''].join(' ')}>
                              {formatClassSectionName(cls.name, section.name)}
                            </Tag>
                          </button>
                        </Tooltip>
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
                        </SectionsPopup>
                      )}
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

      <CreateClassDialog
        open={createClassOpen}
        onClose={() => setCreateClassOpen(false)}
        onCreate={handleCreateClass}
      />
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
        initialGradeLevelId={editingClass?.gradeLevelId}
        gradeLevelOptions={gradeLevelOptions}
        onClose={() => setEditingClass(null)}
        onSave={handleSaveClassName}
      />
      <EditSectionDialog
        open={editingSection !== null}
        initialName={editingSection?.name}
        combinedName={editingSection?.combinedName}
        onClose={() => setEditingSection(null)}
        onSave={handleSaveSectionName}
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

// Fixed-positioned so the table's overflow-x-auto wrapper can't clip it.
// Closes on outside click, Escape, scroll or resize (the anchor would move).
function SectionsPopup({ classId, title, onClose, children }) {
  const ref = React.useRef(null);
  const [pos, setPos] = React.useState(null);
  const getAnchor = React.useCallback(
    () => document.querySelector(`[data-sections-trigger="${classId}"]`),
    [classId]
  );

  React.useLayoutEffect(() => {
    const anchor = getAnchor();
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 32);
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
    const height = ref.current ? ref.current.offsetHeight : 0;
    const below = rect.bottom + 6;
    const top = below + height > window.innerHeight - 16 ? Math.max(16, rect.top - height - 6) : below;
    setPos({ top, left, width });
  }, [getAnchor, children]);

  React.useEffect(() => {
    const onPointerDown = (e) => {
      const anchor = getAnchor();
      if (ref.current && !ref.current.contains(e.target) && !(anchor && anchor.contains(e.target))) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose();
        getAnchor()?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [getAnchor, onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={title}
      style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { visibility: 'hidden' }}
      className="fixed z-40 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-navy-700 dark:bg-navy-900"
    >
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</div>
      <div className="flex max-h-64 flex-wrap items-center gap-1.5 overflow-y-auto">{children}</div>
    </div>
  );
}

function ChevronIcon({ open }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={['transition-transform duration-fast', open ? 'rotate-180' : ''].join(' ')}
    >
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
