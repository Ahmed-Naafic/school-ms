import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Dialog, Switch } from '../../../shared/components';
import { useToast } from '../../../shared/toast/ToastContext';
import { LessonDialog } from '../components/LessonDialog';
import { GenerateTimetableDialog } from '../components/GenerateTimetableDialog';
import { MasterTimetableGrid } from '../components/MasterTimetableGrid';
import { PrintExportPicker } from '../components/PrintExportPicker';
import { TeacherCapacityDialog } from '../components/TeacherCapacityDialog';
import { sortDays } from '../utils/formatting';
import * as timetableService from '../services/timetable.service';
import * as scheduleService from '../../school-schedule/services/school-schedule.service';

// Architecture Update (Generation-First) + UI Redesign — the true Master
// Timetable: one row per Class, the entire school on one screen, read by
// default (Subject + Teacher + status badges only) and only editable while
// Edit Mode is on. Generation always targets the whole school — Class/
// Teacher are not generation options here, only future Regenerate tools.
export function MasterTimetablePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [groups, setGroups] = React.useState([]);
  const [days, setDays] = React.useState([]);
  const [periods, setPeriods] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [editMode, setEditMode] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingLesson, setEditingLesson] = React.useState(null);
  const [prefill, setPrefill] = React.useState(null);
  const [generateOpen, setGenerateOpen] = React.useState(false);
  const [publishOpen, setPublishOpen] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [printOpen, setPrintOpen] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [viewOpen, setViewOpen] = React.useState(false);
  const [capacityOpen, setCapacityOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [master, calendar, shifts] = await Promise.all([
        timetableService.getMasterTimetable(),
        scheduleService.getSchoolCalendar(),
        scheduleService.listShifts({ status: 'ACTIVE' }),
      ]);
      setGroups(master);
      setDays(sortDays(calendar.workingDays));

      // Master Timetable's own column basis: the school's own (first)
      // active Shift's Teaching Periods. Schools with more than one Shift
      // are a future refinement — this project's own schools so far are
      // all single-Shift.
      if (shifts.length > 0) {
        const shiftPeriods = await scheduleService.listPeriods(shifts[0].id, { status: 'ACTIVE' });
        setPeriods(shiftPeriods.filter((p) => p.type === 'TEACHING').sort((a, b) => a.displayOrder - b.displayOrder));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const classCount = groups.filter((g) => g.class).length;
  const teacherCount = new Set(groups.flatMap((g) => g.lessons.filter((l) => l.status === 'ACTIVE' && l.teacher).map((l) => l.teacher.id)))
    .size;

  const withErrorToast = (fn) => async (...args) => {
    try {
      await fn(...args);
      load();
    } catch (err) {
      showToast({ tone: 'danger', title: 'Action failed', description: err.message });
    }
  };

  const handleMoveSwap = (lesson) => {
    setEditingLesson(lesson);
    setPrefill(null);
    setDialogOpen(true);
  };
  const handleLock = withErrorToast(async (lesson) => {
    await timetableService.lockLesson(lesson.id);
    showToast({ tone: 'success', title: 'Lesson locked' });
  });
  const handleUnlock = withErrorToast(async (lesson) => {
    await timetableService.unlockLesson(lesson.id);
    showToast({ tone: 'success', title: 'Lesson unlocked' });
  });
  const handleSplit = withErrorToast(async (lesson) => {
    if (!window.confirm('This lesson is configured as a double period.\n\nSplitting it will break the lesson group, may violate subject preferences, and may reduce the timetable quality score.\n\nThe two lessons will become independent timetable entries and can be moved or edited separately.\n\nDo you want to continue?')) {
      return;
    }
    await timetableService.splitLessonGroup(lesson.lessonGroupId);
    showToast({ tone: 'success', title: 'Double period split into independent Lessons' });
  });
  const handleDelete = withErrorToast(async (lesson) => {
    await timetableService.archiveLesson(lesson.id);
    showToast({ tone: 'success', title: 'Lesson removed' });
  });
  const handleCellClick = (cls, day, period) => {
    setEditingLesson(null);
    setPrefill({ classId: cls.id, dayOfWeek: day, periodId: period.id });
    setDialogOpen(true);
  };

  const handleSaved = () => {
    showToast({ tone: 'success', title: editingLesson ? 'Lesson updated' : 'Lesson created' });
    load();
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      await timetableService.publishTimetable();
      showToast({ tone: 'success', title: 'Timetable published' });
      setPublishOpen(false);
      load();
    } catch (err) {
      showToast({ tone: 'danger', title: 'Publish failed', description: err.message });
    } finally {
      setPublishing(false);
    }
  };

  const handlePrintConfirm = (scope) => {
    if (scope.type === 'SCHOOL') {
      window.print();
    } else if (scope.type === 'CLASS') {
      navigate(`/timetable/classes/${scope.classId}?autoprint=1`);
    } else if (scope.type === 'TEACHER') {
      navigate(`/timetable/teachers/${scope.teacherId}?autoprint=1`);
    }
  };

  const handleExportConfirm = (scope) => {
    if (scope.type === 'SCHOOL') timetableService.downloadMasterTimetablePdf();
    else if (scope.type === 'CLASS') timetableService.downloadClassTimetablePdf(scope.classId);
    else if (scope.type === 'TEACHER') timetableService.downloadTeacherTimetablePdf(scope.teacherId);
  };

  // On-screen preview only — never triggers print or download. This is the
  // only way to reach a Class's or Teacher's own read-only Timetable page
  // without also invoking Print or Export PDF (both of which navigate here
  // too, but with ?autoprint=1 immediately firing the browser's print
  // dialog once the page loads).
  const handleViewConfirm = (scope) => {
    if (scope.type === 'CLASS') navigate(`/timetable/classes/${scope.classId}`);
    else if (scope.type === 'TEACHER') navigate(`/timetable/teachers/${scope.teacherId}`);
  };

  return (
    <div className="mx-auto max-w-container px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 no-print">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">Master Timetable</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            The Draft you're reviewing — the entire school, one screen. Teachers and Students only ever see the last Published
            Timetable.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Switch label="Edit Mode" checked={editMode} onChange={setEditMode} />
          <Button variant="outline" onClick={() => navigate('/timetable/settings')}>
            Settings
          </Button>
          <Button variant="outline" onClick={() => setViewOpen(true)}>
            View Class / Teacher
          </Button>
          <Button variant="outline" onClick={() => setCapacityOpen(true)}>
            Teacher Capacity
          </Button>
          <Button variant="outline" onClick={() => setPrintOpen(true)}>
            Print
          </Button>
          <Button variant="outline" onClick={() => setExportOpen(true)}>
            Export PDF
          </Button>
          <Button variant="outline" onClick={() => setPublishOpen(true)}>
            Publish
          </Button>
          <Button onClick={() => setGenerateOpen(true)}>Generate Timetable</Button>
        </div>
      </div>

      <div className="print-area">
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : groups.length === 0 ? (
          <Card>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No Lessons yet — click Generate Timetable to build the school's schedule automatically.
            </p>
          </Card>
        ) : (
          <MasterTimetableGrid
            groups={groups}
            days={days}
            periods={periods}
            editMode={editMode}
            onMoveSwap={handleMoveSwap}
            onLock={handleLock}
            onUnlock={handleUnlock}
            onSplit={handleSplit}
            onDelete={handleDelete}
            onCellClick={handleCellClick}
          />
        )}
      </div>

      <LessonDialog
        open={dialogOpen}
        lesson={editingLesson}
        prefill={prefill}
        onClose={() => setDialogOpen(false)}
        onSaved={handleSaved}
      />

      <GenerateTimetableDialog
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onGenerated={load}
        classCount={classCount}
        teacherCount={teacherCount}
      />

      <Dialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onConfirm={handlePublish}
        title="Publish Timetable"
        confirmLabel={publishing ? 'Publishing…' : 'Publish'}
        description="Teachers and Students will immediately begin seeing this Draft as the current Timetable. Your previous Published Timetable is kept as history, not deleted. You can keep adjusting a new Draft afterward."
      />

      <PrintExportPicker open={printOpen} mode="print" onClose={() => setPrintOpen(false)} onConfirm={handlePrintConfirm} />
      <PrintExportPicker open={exportOpen} mode="export" onClose={() => setExportOpen(false)} onConfirm={handleExportConfirm} />
      <PrintExportPicker open={viewOpen} mode="view" onClose={() => setViewOpen(false)} onConfirm={handleViewConfirm} />
      <TeacherCapacityDialog open={capacityOpen} onClose={() => setCapacityOpen(false)} />
    </div>
  );
}
