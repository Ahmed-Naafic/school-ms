import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Input } from '../../../shared/components';
import { useAuth } from '../../../shared/auth/AuthContext';
import { useToast } from '../../../shared/toast/ToastContext';
import * as authService from '../services/auth.service';

export function ChangePasswordPage() {
  const { mustChangeCredentials, clearMustChangeCredentials } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      clearMustChangeCredentials();
      showToast({ tone: 'success', title: 'Password changed' });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-navy-950">
      <Card className="w-full max-w-[400px]" padding="p-8">
        <h1 className="mb-1 font-display text-2xl font-bold text-navy-900 dark:text-white">Change password</h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          {mustChangeCredentials
            ? 'You are using a temporary password. You must change it before continuing.'
            : 'Update your account password.'}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label={mustChangeCredentials ? 'Temporary password' : 'Current password'}
            type="password"
            name="current-password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoFocus
          />
          <Input
            label="New password"
            type="password"
            name="new-password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            hint="At least 8 characters, including a letter and a number."
            required
          />
          <Input
            label="Confirm new password"
            type="password"
            name="confirm-new-password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          {error && <p className="text-[13px] text-danger">{error}</p>}

          <Button type="submit" disabled={submitting} className="mt-2 w-full">
            {submitting ? 'Saving…' : 'Save new password'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
