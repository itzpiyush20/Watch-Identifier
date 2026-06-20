import React, { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Hard timeout — if Supabase never responds, unblock the app after 5s
    const timeout = setTimeout(() => {
      console.warn("[Auth] getSession timed out — proceeding unauthenticated");
      setLoading(false);
    }, 5000);

    // Fetch initial session from SecureStore (fast — no network needed)
    supabase.auth
      .getSession()
      .then(({ data: { session: initialSession } }) => {
        clearTimeout(timeout);
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        setLoading(false);
      })
      .catch((err) => {
        clearTimeout(timeout);
        console.error("[Auth] getSession failed:", err);
        // Still unblock the app — user will be shown login screen
        setLoading(false);
      });

    // Listen for auth state changes (sign-in / sign-out)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("[Auth] Error signing out:", e);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
