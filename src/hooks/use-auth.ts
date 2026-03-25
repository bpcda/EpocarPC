import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    const applySession = (sessionUser: User | null) => {
      if (!mounted) return;
      setUser(sessionUser);
      setAuthReady(true);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        applySession(session?.user ?? null);
      }
    );

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        applySession(session?.user ?? null);
      })
      .catch(() => {
        applySession(null);
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const checkRole = async (userId: string) => {
      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle();

        console.log("[useAuth] checkRole for", userId, "=>", { data, error: error?.message });

        if (!cancelled) {
          setIsAdmin(!!data);
        }
      } catch (err) {
        console.error("[useAuth] checkRole exception:", err);
        if (!cancelled) {
          setIsAdmin(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (!authReady) {
      setLoading(true);
      return () => {
        cancelled = true;
      };
    }

    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    void checkRole(user.id);

    return () => {
      cancelled = true;
    };
  }, [authReady, user]);

  const signIn = (email: string, password: string) =>
    supabase.auth.signInWithPassword({ email, password });

  const signOut = () => supabase.auth.signOut();

  return { user, isAdmin, loading, signIn, signOut };
}
