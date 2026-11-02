import React from 'react';
import { Button, Card, IconButton, Input, Select, Tooltip } from '../../../shared/components';
import { useAuth } from '../../../shared/auth/AuthContext';
import { useToast } from '../../../shared/toast/ToastContext';
import { CreateAssignmentDialog } from '../components/CreateAssignmentDialog';
import { CorrectEndAssignmentDialog } from '../components/CorrectEndAssignmentDialog';
import { ReplaceTeacherDialog } from '../components/ReplaceTeacherDialog';
import { CopyAssignmentsDialog } from '../components/CopyAssignmentsDialog';
import * as teacherSubjectAssignmentsService from '../services/teacher-subject-assignments.service';
import * as teachersService from '../../teachers/services/teachers.service';
import * as subjectsService from '../../subjects/services/subjects.service';
import * as classesService from '../../classes/services/classes.service';
import * as academicYearsService from '../../academic-years/services/academic-years.service';
import { formatClassSectionName } from '../../classes/utils/format-class-section-name';
import { formatAcademicYearLabel } from '../../academic-years/utils/format-academic-year-label';

// UI Redesign — this feature's own true responsibility, and only that:
// "which Teacher teaches which Subject to which Classes." Grouped by
// Teacher -> Subject -> Classes, per the approved presentation, rather than
// one row per Teacher Subject Assignment. No weekly lesson requirement,
// workload, or Timetable-generation concern is calculated or displayed
// here — those belong to a future, separate feature; this page reads the
// exact same underlying Teacher Subject Assignment records, just organized
// differently (the data model itself is unchanged).
export function AssignmentsListPage() {
  const { account } = useAuth();
  const { showToast } = useToast();

  const [grouped, setGrouped] = React.useState([]);
  const [teachers, setTeachers] = React.useState([]);
  const [schoolSubjects, setSchoolSubjects] = React.useState([]);
  const [classes, setClasses] = React.useState([]);
  const [academicYears, setAcademicYears] = React.useState([]);
  const [academicYearFilter, setAcademicYearFilter] = React.useState('');
  const [teacherSearch, setTeacherSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [correctingAssignment, setCorrectingAssignment] = React.useState(null);
  const [replacingAssignment, setReplacingAssignment] = React.useState(null);
  const [copyOpen, setCopyOpen] = React.useState(false);

  const teacherNameById = React.useMemo(() => {
    const map = {};
    teachers.forEach((t) => {
      map[t.id] = t.fullName;
    });
    return map;
  }, [teachers]);

  const subjectNameBySubjectId = React.useMemo(() => {
    const map = {};
    schoolSubjects.forEach((row) => {
      map[row.subjectId] = row.subject?.name;
    });
    return map;
  }, [schoolSubjects]);

  const classNameById = React.useMemo(() => {
    const map = {};
    classes.forEach((c) => {
      map[c.id] = c.name;
    });
    return map;
  }, [classes]);

  const sectionNameById = React.useMemo(() => {
    const map = {};
    classes.forEach((c) => {
      (c.sections || []).forEach((s) => {
        map[s.id] = s.name;
      });
    });
    return map;
  }, [classes]);

  const teacherOptions = React.useMemo(
    () => teachers.filter((t) => t.employmentStatus === 'ACTIVE').map((t) => ({ value: t.id, label: t.fullName })),
    [teachers]
  );
  const subjectOptions = React.useMemo(
    () =>
      schoolSubjects
        .filter((row) => row.subject?.status === 'ACTIVE')
        .map((row) => ({ value: row.subjectId, label: row.subject.name })),
    [schoolSubjects]
  );
  const classOptions = React.useMemo(
    () => classes.filter((c) => c.status === 'ACTIVE').map((c) => ({ value: c.id, label: c.name })),
    [classes]
  );
  const academicYearOptions = React.useMemo(
    () =>
      academicYears
        .filter((ay) => ay.status === 'ACTIVE')
        .map((ay) => ({ value: ay.id, label: formatAcademicYearLabel(ay.startDate, ay.endDate) })),
    [academicYears]
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [groupedResult, teacherResult, schoolSubjectResult, classList, academicYearList] = await Promise.all([
        teacherSubjectAssignmentsService.getGroupedAssignments(academicYearFilter || undefined),
        teachersService.listTeachers({}),
        subjectsService.listSchoolSubjects(account.schoolId),
        classesService.listClasses(),
        academicYearsService.listAcademicYears(),
      ]);
      setGrouped(groupedResult);
      setTeachers(teacherResult);
      setSchoolSubjects(schoolSubjectResult);
      setClasses(classList);
      setAcademicYears(academicYearList);

      if (!academicYearFilter) {
        const current = academicYearList.find((ay) => ay.isCurrent);
        if (current) setAcademicYearFilter(current.id);
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academicYearFilter, account.schoolId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (data) => {
    await teacherSubjectAssignmentsService.createAssignment(data);
    showToast({ tone: 'success', title: 'Teacher Subject Assignment created' });
    load();
  };

  const handleCorrectSave = async (id, data) => {
    await teacherSubjectAssignmentsService.correctAssignment(id, data);
    showToast({ tone: 'success', title: 'Assignment updated' });
    load();
  };

  const handleReplace = async (id, data) => {
    await teacherSubjectAssignmentsService.replaceTeacher(id, data);
    showToast({ tone: 'success', title: 'Teacher replaced' });
    load();
  };

  const handleCopy = async (payload) => {
    const result = await teacherSubjectAssignmentsService.copyAssignments(payload);
    if (result.copied.length > 0) {
      showToast({ tone: 'success', title: `Copied ${result.copied.length} assignment(s)` });
      load();
    }
    return result;
  };

  const loadSourceAssignments = React.useCallback(
    async (fromAcademicYearId) => {
      const rows = await teacherSubjectAssignmentsService.listAssignments({ academicYearId: fromAcademicYearId });
      return rows.map((a) => ({
        ...a,
        teacherName: teacherNameById[a.teacherId],
        subjectName: subjectNameBySubjectId[a.subjectId],
        classAndSectionName: formatClassSectionName(classNameById[a.classId] || a.classId, sectionNameById[a.sectionId]),
      }));
    },
    [teacherNameById, subjectNameBySubjectId, classNameById, sectionNameById]
  );

  // The grouped view's own class "chip" only carries identity fields
  // (assignmentId/classId/className/sectionId) — deliberately minimal, per
  // this feature's own narrowed responsibility. The Correct/End and Replace
  // Teacher dialogs need the full record (dates, end reason, current
  // Teacher), so it's fetched on demand, only when an action is actually
  // opened — not carried through the grouped payload "just in case."
  const openCorrect = async (assignmentId) => {
    const full = await teacherSubjectAssignmentsService.getAssignment(assignmentId);
    setCorrectingAssignment(full);
  };
  const openReplace = async (assignmentId) => {
    const full = await teacherSubjectAssignmentsService.getAssignment(assignmentId);
    setReplacingAssignment(full);
  };

  const visibleGroups = grouped.filter(
    (t) => !teacherSearch.trim() || t.teacherName.toLowerCase().includes(teacherSearch.trim().toLowerCase())
  );

  return (
    <div className="mx-auto max-w-container px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">Teacher Subject Assignments</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Which Teacher teaches which Subject to which Classes.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCopyOpen(true)}>
            Copy Between Years
          </Button>
          <Button onClick={() => setCreateOpen(true)}>Create Assignment</Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <Select
          value={academicYearFilter}
          onChange={(e) => setAcademicYearFilter(e.target.value)}
          options={[{ value: '', label: 'Current Academic Year' }, ...academicYearOptions]}
        />
        <Input placeholder="Search Teacher…" value={teacherSearch} onChange={(e) => setTeacherSearch(e.target.value)} />
      </div>

      {loading ? (
        <Card>
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        </Card>
      ) : visibleGroups.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500 dark:text-gray-400">No Teacher Subject Assignments yet for this Academic Year.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {visibleGroups.map((teacherGroup) => (
            <Card key={teacherGroup.teacherId}>
              <h2 className="mb-3 font-display text-lg font-bold text-navy-900 dark:text-white">{teacherGroup.teacherName}</h2>
              <div className="flex flex-col gap-3">
                {teacherGroup.subjects.map((subjectGroup) => (
                  <div key={subjectGroup.subjectId}>
                    <h3 className="mb-1.5 text-[13px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {subjectGroup.subjectName}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {subjectGroup.classes.map((cls) => (
                        <div
                          key={cls.assignmentId}
                          className="flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 py-1 pl-2.5 pr-1 text-[13px] font-semibold text-gray-800 dark:border-navy-700 dark:bg-navy-900 dark:text-gray-200"
                        >
                          {formatClassSectionName(cls.className, sectionNameById[cls.sectionId])}
                          <Tooltip label="Correct / End">
                            <IconButton label="Correct / End" size="sm" onClick={() => openCorrect(cls.assignmentId)}>
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip label="Replace Teacher">
                            <IconButton label="Replace Teacher" size="sm" onClick={() => openReplace(cls.assignmentId)}>
                              <ReplaceIcon />
                            </IconButton>
                          </Tooltip>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateAssignmentDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
        teacherOptions={teacherOptions}
        subjectOptions={subjectOptions}
        classOptions={classOptions}
        classes={classes}
        academicYearOptions={academicYearOptions}
      />
      <CorrectEndAssignmentDialog
        open={correctingAssignment !== null}
        assignment={correctingAssignment}
        onClose={() => setCorrectingAssignment(null)}
        onSave={handleCorrectSave}
      />
      <ReplaceTeacherDialog
        open={replacingAssignment !== null}
        assignment={replacingAssignment}
        teacherOptions={teacherOptions}
        onClose={() => setReplacingAssignment(null)}
        onReplace={handleReplace}
      />
      <CopyAssignmentsDialog
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        onCopy={handleCopy}
        academicYearOptions={academicYearOptions}
        onLoadSourceAssignments={loadSourceAssignments}
      />
    </div>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function ReplaceIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3l4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16" />
    </svg>
  );
}
