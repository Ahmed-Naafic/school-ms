import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Card, IconButton, Input } from '../../../shared/components';
import { useAuth } from '../../../shared/auth/AuthContext';
import { useTheme } from '../../../shared/theme/ThemeContext';
import { SunIcon, MoonIcon } from '../../../app/nav-icons';
import * as authService from '../services/auth.service';

export function LoginPage() {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await authService.login({ email, password });
      login(result);
      const redirectTo = location.state?.from?.pathname || '/';
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-navy-950">
      <IconButton
        variant="ghost"
        size="sm"
        label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        onClick={toggleTheme}
        className="absolute right-4 top-4"
      >
        {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
      </IconButton>

      <Card className="w-full max-w-[400px]" padding="p-8">
        <h1 className="mb-1 font-display text-2xl font-bold text-navy-900 dark:text-white">Sign in</h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">School Management System</p>

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
          <Input
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <p className="text-[13px] text-danger">{error}</p>}

          <Button type="submit" disabled={submitting} className="mt-2 w-full">
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <Link to="/forgot-password" className="mt-4 block text-center text-sm font-semibold text-teal-600 hover:text-teal-700">
          Forgot your password?
        </Link>
      </Card>
    </div>
  );
}
