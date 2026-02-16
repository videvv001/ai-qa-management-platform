/**
 * Auth API and token storage.
 * When backend auth is enabled, login returns a JWT stored in localStorage.
 *
 * 401 handling: AuthProvider registers a callback via registerOn401(logout).
 * When apiFetch receives a 401, it calls notify401() so the app can clear auth state
 * without using window events.
 */

const AUTH_TOKEN_KEY = "qamp-auth-token";

let on401Callback: (() => void) | null = null;

/**
 * Register a handler to be called when any API request returns 401.
 * Used by AuthProvider to call logout() and transition to login state.
 * Returns an unregister function for cleanup.
 */
export function registerOn401(callback: () => void): () => void {
  on401Callback = callback;
  return () => {
    on401Callback = null;
  };
}

/**
 * Invoke the registered 401 handler. Called by apiFetch on 401 responses.
 */
export function notify401(): void {
  on401Callback?.();
}

const getBaseUrl = (): string => {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (base) return base.replace(/\/$/, "");
  return "";
};

export function getToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {}
}

export function clearToken(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {}
}

export async function login(
  username: string,
  password: string
): Promise<{ token: string }> {
  const res = await fetch(`${getBaseUrl()}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Login failed");
  }
  return res.json();
}

export async function checkAuthEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/auth/auth-enabled`);
    if (!res.ok) return false;
    const json = await res.json();
    return json.auth_enabled === true;
  } catch (err) {
    // Backend may not be running - treat as auth disabled so app still loads
    console.warn("[Auth] checkAuthEnabled failed (is backend running on :8000?):", err);
    return false;
  }
}
