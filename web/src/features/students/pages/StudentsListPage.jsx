import React from 'react';
import { Button, Card, IconButton, Select, Tooltip } from '../../../shared/components';
import { useToast } from '../../../shared/toast/ToastContext';
import { StudentStatusBadge } from '../components/StudentStatusBadge';
import { AdmitStudentDialog } from '../components/AdmitStudentDialog';
import { EnrollStudentDialog } from '../components/EnrollStudentDialog';
import { PromoteStudentDialog } from '../components/PromoteStudentDialog';
import { CorrectClassDialog } from '../components/CorrectClassDialog';
import { TransferStudentDialog } from '../components/TransferStudentDialog';
import { EditStudentDialog } from '../components/EditStudentDialog';
import * as studentsService from '../services/students.service';
import * as classesService from '../../classes/services/classes.service';
import * as academicYearsService from '../../academic-years/services/academic-years.service';
import { formatClassSectionName } from '../../classes/utils/format-class-section-name';
import { formatAcademicYearLabel } from '../../academic-years/utils/format-academic-year-label';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ELIGIBLE_FOR_GRADUATION', label: 'Eligible for Graduation' },
  { value: 'TRANSFERRED', label: 'Transferred' },
  { value: 'WITHDRAWN', label: 'Withdrawn' },
  { value: 'GRADUATED', label: 'Graduated' },
];

const PAGE_SIZE = 20;

export function StudentsListPage() {
  const { showToast } = useToast();
  const [students, setStudents] = React.useState([]);
  const [page, setPage] = React.useState(1);
  const [statusFilter, setStatusFilter] = React.useState('');
  const [classFilter, setClassFilter] = React.useState('');
  const [classes, setClasses] = React.useState([]);
  const [academicYears, setAcademicYears] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const [admitOpen, setAdmitOpen] = React.useState(false);
  const [enrollingStudent, setEnrollingStudent] = React.useState(null);
  const [promotingStudent, setPromotingStudent] = React.useState(null);
  const [correctingStudent, setCorrectingStudent] = React.useState(null);
  const [transferringStudent, setTransferringStudent] = React.useState(null);
  const [editingStudent, setEditingStudent] = React.useState(null);

  const classNameById = React.useMemo(() => {
    const map = {};
    classes.forEach((c) => {
      map[c.id] = c.name;
    });
    return map;
  }, [classes]);

  // (ACR-002) Section name isn't unique platform-wide, so this must be keyed
  // by sectionId specifically (not looked up by name) to combine correctly
  // with the Class name above.
  const sectionNameById = React.useMemo(() => {
    const map = {};
    classes.forEach((c) => {
      (c.sections || []).forEach((s) => {
        map[s.id] = s.name;
      });
    });
    return map;
  }, [classes]);

  const classOptions = React.useMemo(
    () => classes.filter((c) => c.status === 'ACTIVE').map((c) => ({ value: c.id, label: c.name })),
    [classes]
  );

  // (ACR-004) Only non-Archived Academic Years are ever a valid Enrollment/
  // Promotion target (Business Rule #21), mirroring classOptions' own
  // ACTIVE-only filter above.
  const academicYearOptions = React.useMemo(
    () =>
      academicYears
        .filter((ay) => ay.status === 'ACTIVE')
        .map((ay) => ({ value: ay.id, label: formatAcademicYearLabel(ay.startDate, ay.endDate) })),
    [academicYears]
  );

  // (ACR-002) The roster filter (unlike the Enroll/Promote/Correct Class
  // dialogs' own two-step Class-then-Section pickers) is one flat list: a
  // Class with active Sections contributes one option per Section (labeled
  // with the combined "F1A" name, so filtering can narrow to a specific
  // Section), and a Class with none contributes its own plain name. Each
  // option's value carries both classId and sectionId together so load()
  // can filter by both without a second lookup.
  const classSectionFilterOptions = React.useMemo(() => {
    const options = [];
    classes
      .filter((c) => c.status === 'ACTIVE')
      .forEach((c) => {
        const activeSections = (c.sections || []).filter((s) => s.status === 'ACTIVE');
        if (activeSections.length === 0) {
          options.push({ value: c.id, label: c.name, classId: c.id, sectionId: undefined });
        } else {
          activeSections.forEach((s) => {
            options.push({
              value: s.id,
              label: formatClassSectionName(c.name, s.name),
              classId: c.id,
              sectionId: s.id,
            });
          });
        }
      });
    return options;
  }, [classes]);

  const selectedClassSectionFilter = classSectionFilterOptions.find((o) => o.value === classFilter);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [studentsResult, classList, academicYearList] = await Promise.all([
        studentsService.listStudents({
          status: statusFilter || undefined,
          classId: selectedClassSectionFilter?.classId,
          sectionId: selectedClassSectionFilter?.sectionId,
          page,
          pageSize: PAGE_SIZE,
        }),
        classesService.listClasses(),
        academicYearsService.listAcademicYears(),
      ]);
      setStudents(studentsResult);
      setClasses(classList);
      setAcademicYears(academicYearList);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, classFilter, page]);

  // The shared API client only returns `payload.data`, discarding the
  // backend's `metadata.total` — so "is there a next page" is inferred from
  // whether this page came back full (page.length < PAGE_SIZE means last page).
  React.useEffect(() => {
    load();
  }, [load]);

  const handleAdmit = async (data) => {
    await studentsService.admitStudent(data);
    showToast({ tone: 'success', title: 'Student admitted' });
    load();
  };

  const handleEnroll = async (data) => {
    await studentsService.enrollStudent(enrollingStudent.id, data);
    showToast({ tone: 'success', title: 'Student enrolled' });
    load();
  };

  const handlePromote = async (data) => {
    await studentsService.promoteStudent(promotingStudent.id, data);
    showToast({ tone: 'success', title: 'Student promoted' });
    load();
  };

  const handleCorrectClass = async (data) => {
    await studentsService.correctClass(correctingStudent.id, data);
    showToast({ tone: 'success', title: 'Class corrected' });
    load();
  };

  const handleTransfer = async (data) => {
    await studentsService.transferStudent(transferringStudent.id, data);
    showToast({ tone: 'success', title: 'Student transferred' });
    load();
  };

  const handleSaveProfile = async (data) => {
    await studentsService.updateProfile(editingStudent.id, data);
    showToast({ tone: 'success', title: 'Profile updated' });
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

  return (
    <div className="mx-auto max-w-container px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">Students</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage Admission, Enrollment, and lifecycle for your school's Students.
          </p>
        </div>
        <Button onClick={() => setAdmitOpen(true)}>Admit Student</Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <Select
          value={statusFilter}
          onChange={(e) => {
            setPage(1);
            setStatusFilter(e.target.value);
          }}
          options={STATUS_OPTIONS}
        />
        <Select
          value={classFilter}
          onChange={(e) => {
            setPage(1);
            setClassFilter(e.target.value);
          }}
          options={[{ value: '', label: 'All Classes' }, ...classSectionFilterOptions]}
        />
      </div>

      <Card padding="p-0">
        {loading ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : students.length === 0 ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">No Students yet.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-navy-700 dark:text-gray-400">
                <th className="px-5 py-3 font-bold">Name</th>
                <th className="px-5 py-3 font-bold">Class</th>
                <th className="px-5 py-3 font-bold">Status</th>
                <th className="px-5 py-3 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const isActive = student.status === 'ACTIVE';
                const isEligible = student.status === 'ELIGIBLE_FOR_GRADUATION';
                const isWithdrawn = student.status === 'WITHDRAWN';
                const isPermanentlyTerminal = ['TRANSFERRED', 'GRADUATED'].includes(student.status);
                const currentClassName = student.latestEnrollment
                  ? formatClassSectionName(
                      classNameById[student.latestEnrollment.classId] || '—',
                      sectionNameById[student.latestEnrollment.sectionId]
                    )
                  : '—';

                return (
                  <tr key={student.id} className="border-b border-gray-100 last:border-0 dark:border-navy-800">
                    <td className="px-5 py-3 text-gray-900 dark:text-gray-100">{student.fullName}</td>
                    <td className="px-5 py-3 text-gray-700 dark:text-gray-300">{currentClassName}</td>
                    <td className="px-5 py-3">
                      <StudentStatusBadge status={student.status} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1">
                        <Tooltip label="Edit profile">
                          <IconButton label="Edit profile" size="sm" onClick={() => setEditingStudent(student)}>
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        {isActive && !student.latestEnrollment && (
                          <Tooltip label="Enroll">
                            <IconButton label="Enroll" size="sm" onClick={() => setEnrollingStudent(student)}>
                              <EnrollIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        {isActive && student.latestEnrollment && (
                          <Tooltip label="Promote">
                            <IconButton label="Promote" size="sm" onClick={() => setPromotingStudent(student)}>
                              <PromoteIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        {student.latestEnrollment && (isActive || isEligible) && (
                          <Tooltip label="Correct Class">
                            <IconButton label="Correct Class" size="sm" onClick={() => setCorrectingStudent(student)}>
                              <CorrectIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        {isEligible && (
                          <Tooltip label="Graduate">
                            <IconButton
                              label="Graduate"
                              size="sm"
                              onClick={() =>
                                runAction(() => studentsService.graduateStudent(student.id), 'Student graduated')
                              }
                            >
                              <GraduateIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        {(isActive || isEligible) && (
                          <>
                            <Tooltip label="Transfer">
                              <IconButton label="Transfer" size="sm" onClick={() => setTransferringStudent(student)}>
                                <TransferIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip label="Withdraw">
                              <IconButton
                                label="Withdraw"
                                size="sm"
                                onClick={() =>
                                  runAction(() => studentsService.withdrawStudent(student.id), 'Student withdrawn')
                                }
                              >
                                <WithdrawIcon />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                        {isWithdrawn && (
                          <Tooltip label="Restore to Active">
                            <IconButton
                              label="Restore to Active"
                              size="sm"
                              onClick={() =>
                                runAction(
                                  () => studentsService.restoreWithdrawal(student.id),
                                  'Student restored to Active'
                                )
                              }
                            >
                              <RestoreIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        {isPermanentlyTerminal && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            No further actions — permanent
                          </span>
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

      <div className="mt-4 flex items-center justify-between">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Previous
        </Button>
        <span className="text-sm text-gray-500 dark:text-gray-400">Page {page}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={students.length < PAGE_SIZE}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>

      <AdmitStudentDialog open={admitOpen} onClose={() => setAdmitOpen(false)} onCreate={handleAdmit} />
      <EnrollStudentDialog
        open={enrollingStudent !== null}
        onClose={() => setEnrollingStudent(null)}
        onEnroll={handleEnroll}
        classOptions={classOptions}
        classes={classes}
        academicYearOptions={academicYearOptions}
      />
      <PromoteStudentDialog
        open={promotingStudent !== null}
        onClose={() => setPromotingStudent(null)}
        onPromote={handlePromote}
        classOptions={classOptions}
        classes={classes}
        academicYearOptions={academicYearOptions}
      />
      <CorrectClassDialog
        open={correctingStudent !== null}
        onClose={() => setCorrectingStudent(null)}
        onCorrect={handleCorrectClass}
        classOptions={classOptions}
        classes={classes}
      />
      <TransferStudentDialog
        open={transferringStudent !== null}
        onClose={() => setTransferringStudent(null)}
        onTransfer={handleTransfer}
      />
      <EditStudentDialog
        open={editingStudent !== null}
        student={editingStudent}
        onClose={() => setEditingStudent(null)}
        onSave={handleSaveProfile}
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

function EnrollIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 10-10-6L2 10l10 6 10-6Z" />
      <path d="M6 12v5c0 1.5 2.5 3 6 3s6-1.5 6-3v-5" />
    </svg>
  );
}

function PromoteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function GraduateIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10 12 4 2 10l10 6 10-6Z" />
      <path d="M6 12v5c0 1.5 2.5 3 6 3s6-1.5 6-3v-5M22 10v6" />
    </svg>
  );
}

function TransferIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3l4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16" />
    </svg>
  );
}

function WithdrawIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10" />
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

function CorrectIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21 5-9 9-4-4M13.5 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.5" />
    </svg>
  );
}
