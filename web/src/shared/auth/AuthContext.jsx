import React from 'react';
import { setTokens, clearTokens, setOnAuthExpired, setOnTokensRefreshed } from '../api/client';

const STORAGE_KEY = 'sms.auth';

const AuthContext = React.createContext(null);

function loadStoredSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStoredSession(session) {
  if (session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = React.useState(() => loadStoredSession());

  React.useEffect(() => {
    if (session) {
      setTokens({ accessToken: session.accessToken, refreshToken: session.refreshToken });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    // If a refresh fails anywhere in the app, the API client calls this to
    // force the session back to logged-out, mirroring the backend's
    // immediate-revocation behavior (Security-Standards.md).
    setOnAuthExpired(() => {
      setSession(null);
      saveStoredSession(null);
    });
  }, []);

  React.useEffect(() => {
    // The backend rotates the refresh token on every use (revokes the old
    // one, issues a new pair) — persist the new pair immediately, or a page
    // reload after any refresh would rehydrate the now-revoked old token
    // from storage and log the user out well before real expiry.
    setOnTokensRefreshed(({ accessToken, refreshToken }) => {
      setSession((prev) => {
        if (!prev) return prev;
        const next = { ...prev, accessToken, refreshToken };
        saveStoredSession(next);
        return next;
      });
    });
  }, []);

  const login = React.useCallback((result) => {
    const next = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      account: result.account,
      mustChangeCredentials: result.mustChangeCredentials,
    };
    setTokens({ accessToken: next.accessToken, refreshToken: next.refreshToken });
    setSession(next);
    saveStoredSession(next);
  }, []);

  const logout = React.useCallback(() => {
    clearTokens();
    setSession(null);
    saveStoredSession(null);
  }, []);

  // Called after a successful forced/changed password, per the backend's
  // Business Rule #23 (bootstrap Super Admin) and #9 (initial setup) flows.
  const clearMustChangeCredentials = React.useCallback(() => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, mustChangeCredentials: false };
      saveStoredSession(next);
      return next;
    });
  }, []);

  const value = React.useMemo(
    () => ({
      isAuthenticated: !!session,
      account: session?.account ?? null,
      mustChangeCredentials: !!session?.mustChangeCredentials,
      login,
      logout,
      clearMustChangeCredentials,
    }),
    [session, login, logout, clearMustChangeCredentials]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
