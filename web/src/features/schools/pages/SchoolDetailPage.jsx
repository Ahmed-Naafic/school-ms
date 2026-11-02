import React from 'react';
import { useParams } from 'react-router-dom';
import { Button, Card, Checkbox, Input, Select, Dialog } from '../../../shared/components';
import { useAuth } from '../../../shared/auth/AuthContext';
import { useToast } from '../../../shared/toast/ToastContext';
import { SchoolStatusBadge } from '../components/SchoolStatusBadge';
import { SubjectStatusBadge } from '../../subjects/components/SubjectStatusBadge';
import * as schoolsService from '../services/schools.service';
import * as subjectsService from '../../subjects/services/subjects.service';
import * as authService from '../../auth/services/auth.service';
import { AccountStatusBadge } from '../../auth/components/AccountStatusBadge';

const SUBSCRIPTION_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'TRIAL', label: 'Trial' },
  { value: 'EXPIRED', label: 'Expired' },
];

export function SchoolDetailPage() {
  const { schoolId } = useParams();
  const { account } = useAuth();
  const { showToast } = useToast();
  const isSuperAdmin = account.role === 'SUPER_ADMIN';

  const [school, setSchool] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [confirmAction, setConfirmAction] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setSchool(await schoolsService.getSchool(schoolId));
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const runAction = async (action, successMessage) => {
    try {
      await action(schoolId);
      showToast({ tone: 'success', title: successMessage });
      setConfirmAction(null);
      load();
    } catch (err) {
      showToast({ tone: 'danger', title: 'Action failed', description: err.message });
    }
  };

  const saveProfile = async (fields) => {
    try {
      const updated = await schoolsService.updateOperationalProfile(schoolId, fields);
      setSchool(updated);
      showToast({ tone: 'success', title: 'Profile updated' });
    } catch (err) {
      showToast({ tone: 'danger', title: 'Update failed', description: err.message });
    }
  };

  const saveSubscription = async (subscriptionStatus) => {
    try {
      const updated = await schoolsService.updateSubscriptionStatus(schoolId, subscriptionStatus);
      setSchool(updated);
      showToast({ tone: 'success', title: 'Subscription status updated' });
    } catch (err) {
      showToast({ tone: 'danger', title: 'Update failed', description: err.message });
    }
  };

  // (ACR-003) The backend is the only real enforcement of "never fewer levels
  // than the school currently has" — this just reflects what it accepts or
  // rejects, per System-Architecture.md's Business Logic Ownership rule; a
  // rejected save simply leaves the school's levels unchanged on screen.
  const saveEducationLevels = async (educationLevels) => {
    try {
      const updated = await schoolsService.updateEducationLevels(schoolId, educationLevels);
      setSchool(updated);
      showToast({ tone: 'success', title: 'Education Levels updated' });
    } catch (err) {
      showToast({ tone: 'danger', title: 'Update failed', description: err.message });
      throw err;
    }
  };

  if (loading || !school) {
    return <div className="mx-auto max-w-container px-4 py-8 sm:px-6 text-sm text-gray-500 dark:text-gray-400">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-container px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">{school.name}</h1>
        <SchoolStatusBadge status={school.lifecycleStatus} />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-display text-lg font-bold text-navy-900 dark:text-white">Operational profile</h2>
          <ProfileForm school={school} onSave={saveProfile} />
        </Card>

        {isSuperAdmin && (
          <Card>
            <h2 className="mb-4 font-display text-lg font-bold text-navy-900 dark:text-white">Platform administration</h2>

            <div className="mb-5">
              <Select
                label="Subscription status"
                value={school.subscriptionStatus}
                onChange={(e) => saveSubscription(e.target.value)}
                options={SUBSCRIPTION_OPTIONS}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Changing this never automatically suspends the school — suspending is always a separate, manual action.
              </p>
            </div>

            <div className="mb-5">
              <EducationLevelsForm school={school} onSave={saveEducationLevels} />
            </div>

            <div className="mb-5">
              <SchoolAdminsSection schoolId={schoolId} />
            </div>

            <div className="mb-5">
              <SubjectsAssignmentSection schoolId={schoolId} educationLevels={school.educationLevels || []} />
            </div>

            <div className="flex flex-wrap gap-2">
              {school.lifecycleStatus === 'ACTIVE' && (
                <Button variant="outline" onClick={() => setConfirmAction('suspend')}>
                  Suspend school
                </Button>
              )}
              {school.lifecycleStatus === 'SUSPENDED' && (
                <Button variant="accent" onClick={() => runAction(schoolsService.reactivateSchool, 'School reactivated')}>
                  Reactivate school
                </Button>
              )}
              {school.lifecycleStatus !== 'CLOSED' && (
                <Button variant="outline" onClick={() => setConfirmAction('close')}>
                  Close school
                </Button>
              )}
              {school.lifecycleStatus === 'CLOSED' && (
                <Button variant="accent" onClick={() => setConfirmAction('reopen')}>
                  Reopen school
                </Button>
              )}
            </div>
          </Card>
        )}
      </div>

      <Dialog
        open={confirmAction === 'suspend'}
        title="Suspend this school?"
        description="Every user of this school, except Super Admin, immediately loses the ability to log in. This is reversible."
        confirmLabel="Suspend"
        onConfirm={() => runAction(schoolsService.suspendSchool, 'School suspended')}
        onClose={() => setConfirmAction(null)}
      />
      <Dialog
        open={confirmAction === 'close'}
        title="Close this school?"
        description="Closure is permanent. Data is preserved but reopening requires a separate, deliberate action."
        confirmLabel="Close"
        onConfirm={() => runAction(schoolsService.closeSchool, 'School closed')}
        onClose={() => setConfirmAction(null)}
      />
      <Dialog
        open={confirmAction === 'reopen'}
        title="Reopen this school?"
        description="This restores the school to active status."
        confirmLabel="Reopen"
        onConfirm={() => runAction(schoolsService.reopenSchool, 'School reopened')}
        onClose={() => setConfirmAction(null)}
      />
    </div>
  );
}

// (ACR-003) Always sends the full desired set. The backend refuses to drop a
// level whose Subjects are still in use — on that error this form reverts to
// what the school actually has.
function EducationLevelsForm({ school, onSave }) {
  const [levels, setLevels] = React.useState(school.educationLevels || []);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setLevels(school.educationLevels || []);
  }, [school.educationLevels]);

  const toggle = (level, checked) => {
    setLevels((prev) => (checked ? [...new Set([...prev, level])] : prev.filter((l) => l !== level)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(levels);
    } catch {
      setLevels(school.educationLevels || []);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-bold text-navy-900 dark:text-white">Education Levels offered</span>
      <div className="flex flex-wrap gap-4">
        <Checkbox label="Primary" checked={levels.includes('PRIMARY')} onChange={(checked) => toggle('PRIMARY', checked)} />
        <Checkbox label="Secondary" checked={levels.includes('SECONDARY')} onChange={(checked) => toggle('SECONDARY', checked)} />
      </div>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Adding a level assigns all of its Active Subjects to this school; removing a level unassigns them (refused if any of them is still used by a teacher assignment or weekly allocation).
      </p>
      <Button variant="outline" size="sm" className="mt-2" disabled={saving} onClick={handleSave}>
        {saving ? 'Saving…' : 'Save Education Levels'}
      </Button>
    </div>
  );
}

// Super Admin's view of this school's School Admin account(s), with the
// administrative password reset — the backend always returns a one-time
// temporary password for this reset, shown in a dialog (not a toast, which
// auto-dismisses) since it is never retrievable again.
function SchoolAdminsSection({ schoolId }) {
  const { showToast } = useToast();
  const [admins, setAdmins] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [confirmTarget, setConfirmTarget] = React.useState(null);
  const [credentials, setCredentials] = React.useState(null);

  const load = React.useCallback(async () => {
    try {
      setAdmins(await authService.listAccounts({ schoolId, role: 'SCHOOL_ADMIN' }));
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleReset = async () => {
    const target = confirmTarget;
    setConfirmTarget(null);
    try {
      const result = await authService.resetPasswordAdministratively(target.id);
      setCredentials({ email: target.email, temporaryPassword: result.temporaryPassword });
      load();
    } catch (err) {
      showToast({ tone: 'danger', title: 'Reset failed', description: err.message });
    }
  };

  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-bold text-navy-900 dark:text-white">School Admin</span>
      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      ) : admins.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No School Admin account.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {admins.map((admin) => (
            <li key={admin.id} className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm text-gray-900 dark:text-gray-100">{admin.email}</span>
                <AccountStatusBadge status={admin.status} />
              </div>
              <Button variant="outline" size="sm" onClick={() => setConfirmTarget(admin)}>
                Reset password
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={confirmTarget !== null}
        title="Reset this School Admin's password?"
        description={`${confirmTarget?.email} will be logged out and their current password will stop working. A new temporary password will be generated, and they must change it when they next log in.`}
        confirmLabel="Reset password"
        onConfirm={handleReset}
        onClose={() => setConfirmTarget(null)}
      />
      <Dialog
        open={credentials !== null}
        title="Temporary password generated"
        description={`Share this with ${credentials?.email} directly — it will not be shown again. They must set their own password the first time they log in.`}
        cancelLabel="Done"
        onClose={() => setCredentials(null)}
      >
        <p className="rounded-md border border-gray-300 bg-gray-50 px-4 py-3 text-center font-mono text-lg font-bold tracking-wide text-navy-900 dark:border-gray-500 dark:bg-navy-800 dark:text-white">
          {credentials?.temporaryPassword}
        </p>
      </Dialog>
    </div>
  );
}

const LEVEL_LABELS = { PRIMARY: 'Primary', SECONDARY: 'Secondary' };

// Gaining an Education Level auto-assigns every Active Subject of that level
// on the backend, so this section is an uncheck-to-remove checklist rather
// than a one-at-a-time picker. Each toggle is its own assign/remove call —
// the backend stays the real enforcement (e.g. a removal blocked by a
// dependent Teacher Subject Assignment surfaces as an error toast and the
// box stays checked).
function SubjectsAssignmentSection({ schoolId, educationLevels }) {
  const { showToast } = useToast();
  const [assignments, setAssignments] = React.useState([]);
  const [catalog, setCatalog] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [pendingIds, setPendingIds] = React.useState(() => new Set());

  // Re-fetched whenever the school's levels change, since saving a new
  // level assigns that level's Subjects server-side.
  const levelsKey = educationLevels.join(',');
  const load = React.useCallback(async () => {
    try {
      const [assignedRows, allSubjects] = await Promise.all([
        subjectsService.listSchoolSubjects(schoolId),
        subjectsService.listSubjects({ status: 'ACTIVE' }),
      ]);
      setAssignments(assignedRows);
      setCatalog(allSubjects);
    } finally {
      setLoading(false);
    }
  }, [schoolId, levelsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    load();
  }, [load]);

  const assignedSubjectIds = new Set(assignments.map((row) => row.subjectId));

  // Only the school's offered levels are ever shown: Active catalog Subjects
  // of those levels, plus any already-assigned Subject of those levels that
  // the Active-only catalog fetch misses (Archived-but-assigned), so it can
  // still be unchecked.
  const subjectsById = new Map();
  for (const subject of catalog) {
    if (educationLevels.includes(subject.educationLevel)) subjectsById.set(subject.id, subject);
  }
  for (const row of assignments) {
    if (educationLevels.includes(row.subject.educationLevel) && !subjectsById.has(row.subjectId)) {
      subjectsById.set(row.subjectId, row.subject);
    }
  }
  const allSubjects = [...subjectsById.values()].sort((a, b) => a.name.localeCompare(b.name));
  const levelsShown = ['PRIMARY', 'SECONDARY'].filter((level) => educationLevels.includes(level));

  const setPending = (ids, on) =>
    setPendingIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  const toggle = async (subject, checked) => {
    setPending([subject.id], true);
    try {
      if (checked) {
        await subjectsService.assignSubjectToSchool(schoolId, subject.id);
      } else {
        await subjectsService.removeSubjectFromSchool(schoolId, subject.id);
      }
      await load();
    } catch (err) {
      showToast({
        tone: 'danger',
        title: checked ? 'Assignment failed' : 'Removal failed',
        description: err.message,
      });
    } finally {
      setPending([subject.id], false);
    }
  };

  const assignAll = async (subjects) => {
    const ids = subjects.map((s) => s.id);
    setPending(ids, true);
    try {
      const results = await Promise.allSettled(ids.map((id) => subjectsService.assignSubjectToSchool(schoolId, id)));
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length > 0) {
        showToast({ tone: 'danger', title: `${failed.length} Subject(s) could not be assigned`, description: failed[0].reason.message });
      }
      await load();
    } finally {
      setPending(ids, false);
    }
  };

  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-bold text-navy-900 dark:text-white">
        Subjects assigned to this school
      </span>

      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4">
          {levelsShown.map((level) => {
            const levelSubjects = allSubjects.filter((s) => s.educationLevel === level);
            const unassigned = levelSubjects.filter((s) => !assignedSubjectIds.has(s.id) && s.status === 'ACTIVE');
            const assignedCount = levelSubjects.filter((s) => assignedSubjectIds.has(s.id)).length;
            return (
              <div key={level}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {LEVEL_LABELS[level] || level} · {assignedCount}/{levelSubjects.length}
                  </span>
                  {unassigned.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => assignAll(unassigned)}>
                      Select all
                    </Button>
                  )}
                </div>
                {levelSubjects.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No Active Subjects in the catalog for this level.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                    {levelSubjects.map((subject) => {
                      const isAssigned = assignedSubjectIds.has(subject.id);
                      return (
                        <div key={subject.id} className="flex items-center gap-2">
                          <Checkbox
                            label={subject.name}
                            checked={isAssigned}
                            // An Archived Subject can be unassigned but never (re)assigned.
                            disabled={pendingIds.has(subject.id) || (!isAssigned && subject.status !== 'ACTIVE')}
                            onChange={(checked) => toggle(subject, checked)}
                          />
                          {subject.status !== 'ACTIVE' && <SubjectStatusBadge status={subject.status} />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Adding an Education Level assigns all of its Active Subjects automatically — uncheck any this school doesn't teach.
      </p>
    </div>
  );
}

function ProfileForm({ school, onSave }) {
  const [contactEmail, setContactEmail] = React.useState(school.contactEmail || '');
  const [contactPhone, setContactPhone] = React.useState(school.contactPhone || '');
  const [address, setAddress] = React.useState(school.address || '');
  const [saving, setSaving] = React.useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ contactEmail, contactPhone, address });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Input label="Contact email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
      <Input label="Contact phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
      <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
      <Button type="submit" disabled={saving} className="mt-2 self-start">
        {saving ? 'Saving…' : 'Save profile'}
      </Button>
    </form>
  );
}
