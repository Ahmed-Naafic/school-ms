// Thin fetch wrapper. Every backend response follows the standard envelope
// defined in API-Standards.md: { success, message, data, metadata } or
// { success, message, errors }.

const BASE_URL = '/api/v1';

let accessToken = null;
let refreshToken = null;
let onAuthExpired = null;
let onTokensRefreshed = null;

export function setTokens({ accessToken: at, refreshToken: rt }) {
  accessToken = at;
  refreshToken = rt;
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
}

// Called by AuthContext so the client can force a logout when refresh fails,
// without this module importing the router directly.
export function setOnAuthExpired(callback) {
  onAuthExpired = callback;
}

// Called by AuthContext so a silently-rotated token pair (see tryRefresh)
// gets persisted to storage, not just held in this module's memory — the
// backend revokes the old refresh token on every refresh, so without this
// the session would die on the next page load even though the new refresh
// token is still valid.
export function setOnTokensRefreshed(callback) {
  onTokensRefreshed = callback;
}

async function rawRequest(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({ success: false, message: 'Invalid server response' }));
  return { status: response.status, payload };
}

// The backend rotates the refresh token on every use (revokes the old one),
// so if two requests 401 around the same time and each called this
// independently, only the first refresh would succeed — the second would
// present an already-revoked token and fail, wrongly logging the user out
// even though a valid session was just re-established. Sharing one in-flight
// promise means concurrent callers all await the same attempt and result.
let refreshPromise = null;

function tryRefresh() {
  if (!refreshToken) return Promise.resolve(false);
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const { status, payload } = await rawRequest('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
      auth: false,
    });

    if (status === 200 && payload.data) {
      setTokens({ accessToken: payload.data.accessToken, refreshToken: payload.data.refreshToken });
      onTokensRefreshed && onTokensRefreshed(payload.data);
      return true;
    }

    return false;
  })();

  return refreshPromise.finally(() => {
    refreshPromise = null;
  });
}

// Public request function used by every feature's service module. Retries
// once after a successful token refresh on a 401; otherwise surfaces the
// error to the caller.
export async function request(path, options = {}) {
  let { status, payload } = await rawRequest(path, options);

  if (status === 401 && options.auth !== false) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      ({ status, payload } = await rawRequest(path, options));
    } else {
      clearTokens();
      onAuthExpired && onAuthExpired();
    }
  }

  if (!payload.success) {
    const error = new Error(payload.message || 'Request failed');
    error.status = status;
    error.errors = payload.errors;
    throw error;
  }

  return payload.data;
}

export const api = {
  get: (path) => request(path, { method: 'GET' }),
  post: (path, body, options) => request(path, { method: 'POST', body, ...options }),
  patch: (path, body, options) => request(path, { method: 'PATCH', body, ...options }),
  delete: (path, options) => request(path, { method: 'DELETE', ...options }),
};
