import { createContext, createElement, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

type AuthContextValue = {
  user: User | null;
  isAdmin: boolean;
  isStaff: boolean;
  canAccessDashboard: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => ReturnType<typeof supabase.auth.signInWithPassword>;
  signOut: () => ReturnType<typeof supabase.auth.signOut>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [loading, setLoading] = useState(true);
  const currentUserId = useRef<string | null>(null);
  const roleCheckedFor = useRef<string | null>(null);

  // Single subscription for the whole app. Only update state when the
  // user identity actually changes — TOKEN_REFRESHED and tab-focus events
  // otherwise re-emit the same user and would cause a cascade of re-renders
  // and role re-checks across every consumer.
  useEffect(() => {
    let mounted = true;

    const applySession = (sessionUser: User | null) => {
      if (!mounted) return;
      const nextId = sessionUser?.id ?? null;
      if (nextId === currentUserId.current) {
        // same identity → no state change, avoid re-render churn
        return;
      }
      currentUserId.current = nextId;
      setUser(sessionUser);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => applySession(session?.user ?? null),
    );

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        applySession(session?.user ?? null);
        if (mounted) setLoading((l) => (currentUserId.current ? l : false));
      })
      .catch(() => {
        applySession(null);
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Role check only when the user id changes — never on token refresh.
  useEffect(() => {
    let cancelled = false;

    if (!user) {
      roleCheckedFor.current = null;
      setIsAdmin(false);
      setIsStaff(false);
      setLoading(false);
      return;
    }

    if (roleCheckedFor.current === user.id) return;
    roleCheckedFor.current = user.id;
    setLoading(true);

    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (cancelled) return;
        const roles = (data ?? []).map((r) => r.role);
        setIsAdmin(roles.includes("admin"));
        setIsStaff(roles.includes("staff"));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const value: AuthContextValue = {
    user,
    isAdmin,
    isStaff,
    canAccessDashboard: isAdmin || isStaff,
    loading,
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signOut: () => supabase.auth.signOut(),
  };

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an <AuthProvider>. Wrap your app in App.tsx.");
  }
  return ctx;
}
