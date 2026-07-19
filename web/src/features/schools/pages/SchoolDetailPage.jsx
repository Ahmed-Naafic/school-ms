import React from 'react';
import { useParams } from 'react-router-dom';
import { Button, Card, Input, Select, Dialog } from '../../../shared/components';
import { useAuth } from '../../../shared/auth/AuthContext';
import { useToast } from '../../../shared/toast/ToastContext';
import { SchoolStatusBadge } from '../components/SchoolStatusBadge';
import * as schoolsService from '../services/schools.service';

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
