import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Input } from '../../../shared/components';
import * as authService from '../services/auth.service';

export function ForgotPasswordRequestPage() {
  const [email, setEmail] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await authService.requestPasswordReset(email);
    } finally {
      // Always show the same confirmation, whether or not the account
      // exists, to avoid account enumeration (Security-Standards.md).
      setSubmitting(false);
      setSubmitted(true);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-navy-950">
      <Card className="w-full max-w-[400px]" padding="p-8">
        <h1 className="mb-1 font-display text-2xl font-bold text-navy-900 dark:text-white">Reset your password</h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">We'll send recovery instructions to your email.</p>

        {submitted ? (
          <p className="text-sm text-gray-900 dark:text-gray-100">
            If an account with that email exists, password reset instructions have been sent.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Email"
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
            <Button type="submit" disabled={submitting} className="mt-2 w-full">
              {submitting ? 'Sending…' : 'Send reset instructions'}
            </Button>
          </form>
        )}

        <Link to="/login" className="mt-4 block text-center text-sm font-semibold text-teal-600 hover:text-teal-700">
          Back to sign in
        </Link>
      </Card>
    </div>
  );
}
