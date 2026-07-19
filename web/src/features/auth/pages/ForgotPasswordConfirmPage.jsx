import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Input } from '../../../shared/components';
import * as authService from '../services/auth.service';

// Also serves the initial-credential-setup case for accounts an admin
// created (MUST_CHANGE_CREDENTIALS with no password yet) — both reuse this
// same flow, per Authentication-and-Authorization.md Business Rule #9.
export function ForgotPasswordConfirmPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await authService.confirmPasswordReset(token, newPassword);
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-navy-950">
        <Card className="w-full max-w-[400px]" padding="p-8">
          <p className="text-sm text-danger">This link is missing a reset token. Request a new one.</p>
          <Link to="/forgot-password" className="mt-4 block text-center text-sm font-semibold text-teal-600 hover:text-teal-700">
            Request password reset
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-[400px]" padding="p-8">
        <h1 className="mb-1 font-display text-2xl font-bold text-navy-900 dark:text-white">Set a new password</h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">Choose a permanent password for your account.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="New password"
            type="password"
            name="new-password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            hint="At least 8 characters, including a letter and a number."
            required
            autoFocus
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
            {submitting ? 'Saving…' : 'Set password'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
