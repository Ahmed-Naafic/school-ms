import React from 'react';
import { useParams } from 'react-router-dom';
import { Button, Card, Checkbox, Input, Select, Dialog } from '../../../shared/components';
import { useAuth } from '../../../shared/auth/AuthContext';
import { useToast } from '../../../shared/toast/ToastContext';
import { SchoolStatusBadge } from '../components/SchoolStatusBadge';
import { SubjectStatusBadge } from '../../subjects/components/SubjectStatusBadge';
import * as schoolsService from '../services/schools.service';
import * as subjectsService from '../../subjects/services/subjects.service';

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

// (ACR-003) Always sends the full desired set — the backend rejects any
// submission that would drop a level the school currently has (no removal
// support yet), so unchecking an already-assigned level and saving simply
// fails with a clear error, and this form reverts to what the school
// actually has once the reload from onSave's response comes back.
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
        Only Subjects belonging to an offered Education Level can be assigned to this school. Removing an already-offered level isn't supported yet.
      </p>
      <Button variant="outline" size="sm" className="mt-2" disabled={saving} onClick={handleSave}>
        {saving ? 'Saving…' : 'Save Education Levels'}
      </Button>
    </div>
  );
}

// Assignment is a separate, explicit action from Education Level assignment
// (ACR-003's two-step, non-cascading workflow) — this section only narrows
// the picker to Active Subjects belonging to an Education Level this school
// already offers; the backend remains the real enforcement either way.
function SubjectsAssignmentSection({ schoolId, educationLevels }) {
  const { showToast } = useToast();
  const [assignments, setAssignments] = React.useState([]);
  const [catalog, setCatalog] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedSubjectId, setSelectedSubjectId] = React.useState('');
  const [assigning, setAssigning] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
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
  }, [schoolId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const assignedSubjectIds = new Set(assignments.map((row) => row.subjectId));
  const eligibleToAssign = catalog.filter(
    (subject) => educationLevels.includes(subject.educationLevel) && !assignedSubjectIds.has(subject.id)
  );

  const handleAssign = async () => {
    if (!selectedSubjectId) return;
    setAssigning(true);
    try {
      await subjectsService.assignSubjectToSchool(schoolId, selectedSubjectId);
      showToast({ tone: 'success', title: 'Subject assigned' });
      setSelectedSubjectId('');
      load();
    } catch (err) {
      showToast({ tone: 'danger', title: 'Assignment failed', description: err.message });
    } finally {
      setAssigning(false);
    }
  };

  const handleRemove = async (subjectId) => {
    try {
      await subjectsService.removeSubjectFromSchool(schoolId, subjectId);
      showToast({ tone: 'success', title: 'Subject removed' });
      load();
    } catch (err) {
      showToast({ tone: 'danger', title: 'Removal failed', description: err.message });
    }
  };

  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-bold text-navy-900 dark:text-white">
        Subjects assigned to this school
      </span>

      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      ) : assignments.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No Subjects assigned yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {assignments.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-2 text-sm text-gray-900 dark:text-gray-100"
            >
              <span className="flex items-center gap-2">
                {row.subject.name}
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  ({row.subject.educationLevel === 'PRIMARY' ? 'Primary' : 'Secondary'})
                </span>
                <SubjectStatusBadge status={row.subject.status} />
              </span>
              <Button variant="ghost" size="sm" onClick={() => handleRemove(row.subjectId)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Select
          className="min-w-[220px]"
          value={selectedSubjectId}
          onChange={(e) => setSelectedSubjectId(e.target.value)}
          options={[
            {
              value: '',
              label: eligibleToAssign.length === 0 ? 'No eligible Subjects' : 'Choose a Subject to assign',
            },
            ...eligibleToAssign.map((s) => ({
              value: s.id,
              label: `${s.name} (${s.educationLevel === 'PRIMARY' ? 'Primary' : 'Secondary'})`,
            })),
          ]}
          disabled={eligibleToAssign.length === 0}
        />
        <Button variant="outline" size="sm" disabled={!selectedSubjectId || assigning} onClick={handleAssign}>
          {assigning ? 'Assigning…' : 'Assign Subject'}
        </Button>
      </div>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Only Active Subjects belonging to an Education Level this school offers can be assigned.
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
