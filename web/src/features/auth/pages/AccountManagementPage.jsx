import React from 'react';
import { Button, Card, Dialog, IconButton, Tooltip } from '../../../shared/components';
import { useAuth } from '../../../shared/auth/AuthContext';
import { useToast } from '../../../shared/toast/ToastContext';
import { AccountStatusBadge } from '../components/AccountStatusBadge';
import { CreateAccountDialog } from '../components/CreateAccountDialog';
import * as authService from '../services/auth.service';
import * as schoolsService from '../../schools/services/schools.service';

// ACR-011, Business Rules #29-30: the "Reset Password" action is rendered
// for School Admin on Teacher/Manager/Accountant rows, and for Super Admin on
// School Admin rows only — mirrors the backend's own role-scope check
// exactly, so the button never offers a request the server would reject.
const ADMINISTRATIVE_PASSWORD_RESET_TARGET_ROLES = {
  SCHOOL_ADMIN: ['TEACHER', 'MANAGER', 'ACCOUNTANT'],
  SUPER_ADMIN: ['SCHOOL_ADMIN'],
};

export function AccountManagementPage() {
  const { account } = useAuth();
  const { showToast } = useToast();

  const [accounts, setAccounts] = React.useState([]);
  const [schools, setSchools] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  // Always populated for a Super Admin resetting a School Admin; for a School
  // Admin resetting staff, only when the backend's password-reset delivery
  // mode is `development` (ACR-012) — otherwise this dialog never opens.
  const [temporaryPasswordInfo, setTemporaryPasswordInfo] = React.useState(null);

  const loadAccounts = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await authService.listAccounts();
      setAccounts(data);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadAccounts();
    if (account.role === 'SUPER_ADMIN') {
      schoolsService.listSchools().then(setSchools).catch(() => setSchools([]));
    }
  }, [loadAccounts, account.role]);

  const handleCreate = async (data) => {
    await authService.createAccount(data);
    showToast({ tone: 'success', title: 'Account created' });
    loadAccounts();
  };

  const runAction = async (action, accountId, successMessage) => {
    try {
      await action(accountId);
      showToast({ tone: 'success', title: successMessage });
      loadAccounts();
    } catch (err) {
      showToast({ tone: 'danger', title: 'Action failed', description: err.message });
    }
  };

  // Separate from runAction: the response shape is { account,
  // temporaryPassword }, and success is shown as a one-time dialog (dev mode
  // only) rather than a toast, since the value must stay on screen long
  // enough to copy — a toast auto-dismisses.
  const handleResetPassword = async (acc) => {
    try {
      const result = await authService.resetPasswordAdministratively(acc.id);
      if (result.temporaryPassword) {
        setTemporaryPasswordInfo({ email: acc.email, password: result.temporaryPassword });
      } else {
        showToast({
          tone: 'success',
          title: 'Password reset',
          description: 'They must set a new one via Forgotten Password on the login page.',
        });
      }
      loadAccounts();
    } catch (err) {
      showToast({ tone: 'danger', title: 'Action failed', description: err.message });
    }
  };

  return (
    <div className="mx-auto max-w-container px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">Accounts</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage user accounts and access.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>Create account</Button>
      </div>

      <Card padding="p-0">
        {loading ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : accounts.length === 0 ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">No accounts yet.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-navy-700 dark:text-gray-400">
                <th className="px-5 py-3 font-bold">Email</th>
                <th className="px-5 py-3 font-bold">Role</th>
                <th className="px-5 py-3 font-bold">Status</th>
                <th className="px-5 py-3 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc.id} className="border-b border-gray-100 last:border-0 dark:border-navy-800">
                  <td className="px-5 py-3 text-gray-900 dark:text-gray-100">{acc.email}</td>
                  <td className="px-5 py-3 text-gray-700 dark:text-gray-300">{acc.role}</td>
                  <td className="px-5 py-3">
                    <AccountStatusBadge status={acc.status} />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-1">
                      {acc.status === 'DEACTIVATED' ? (
                        <Tooltip label="Reactivate">
                          <IconButton
                            label="Reactivate"
                            onClick={() => runAction(authService.reactivateAccount, acc.id, 'Account reactivated')}
                          >
                            <RefreshIcon />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Tooltip label="Deactivate">
                          <IconButton
                            label="Deactivate"
                            onClick={() => runAction(authService.deactivateAccount, acc.id, 'Account deactivated')}
                          >
                            <PowerIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                      {acc.status === 'LOCKED' && (
                        <Tooltip label="Unlock">
                          <IconButton label="Unlock" onClick={() => runAction(authService.unlockAccount, acc.id, 'Account unlocked')}>
                            <UnlockIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                      {ADMINISTRATIVE_PASSWORD_RESET_TARGET_ROLES[account.role]?.includes(acc.role) && (
                        <Tooltip label="Reset password">
                          <IconButton label="Reset password" onClick={() => handleResetPassword(acc)}>
                            <KeyIcon />
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

      <CreateAccountDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreate={handleCreate}
        schoolOptions={schools}
      />

      <Dialog
        open={temporaryPasswordInfo !== null}
        title="Temporary password generated"
        description={`Share this with ${temporaryPasswordInfo?.email} directly — it will not be shown again. They must set their own permanent password the moment they log in with it.`}
        cancelLabel="Done"
        onClose={() => setTemporaryPasswordInfo(null)}
      >
        <p className="rounded-md border border-gray-300 bg-gray-50 px-4 py-3 text-center font-mono text-lg font-bold tracking-wide text-navy-900 dark:border-gray-500 dark:bg-navy-800 dark:text-white">
          {temporaryPasswordInfo?.password}
        </p>
      </Dialog>
    </div>
  );
}

function PowerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" />
    </svg>
  );
}

function UnlockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6M15.5 7.5 18 10M18.5 6.5 21 9" />
    </svg>
  );
}
