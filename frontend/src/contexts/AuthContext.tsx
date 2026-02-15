import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  checkAuthEnabled,
  clearToken,
  getToken,
  setToken as storeToken,
} from "@/api/auth";

type AuthState = "loading" | "login" | "authenticated";

interface AuthContextValue {
  authState: AuthState;
  authRequired: boolean;
  loginSuccess: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [authRequired, setAuthRequired] = useState(false);
  const navigate = useNavigate();

  const loginSuccess = useCallback((token: string) => {
    storeToken(token);
    setAuthState("authenticated");
    setAuthRequired(true);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setAuthState("login");
    setAuthRequired(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    checkAuthEnabled().then((enabled) => {
      if (cancelled) return;
      if (!enabled) {
        // Auth disabled - allow access without login
        setAuthRequired(false);
        setAuthState("authenticated");
        return;
      }
      // Auth is enabled
      setAuthRequired(true);
      const token = getToken();
      if (token) {
        // Has token - treat as authenticated (backend will validate on API calls)
        setAuthState("authenticated");
      } else {
        // No token - require login
        setAuthState("login");
      }
    }).catch(() => {
      // Backend unreachable - if we have a token, try to use it; otherwise require login
      const token = getToken();
      if (token) {
        // Have token from previous session, assume auth is required
        setAuthRequired(true);
        setAuthState("authenticated");
      } else {
        // No token and can't check backend - assume auth is disabled for better UX
        setAuthRequired(false);
        setAuthState("authenticated");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onAuthRequired = () => {
      clearToken();
      setAuthState("login");
      navigate("/login", { replace: true });
    };
    window.addEventListener("qamp-auth-required", onAuthRequired);
    return () => window.removeEventListener("qamp-auth-required", onAuthRequired);
  }, [navigate]);

  const value: AuthContextValue = {
    authState,
    authRequired,
    loginSuccess,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
