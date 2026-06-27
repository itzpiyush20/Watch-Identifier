import React, { createContext, useContext, useEffect, useState } from "react";
import { auth } from "@/services/firebase";

export interface Session {
  access_token: string;
}

export interface AuthUser {
  id: string;
  email: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
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
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Hard timeout — if Firebase never responds, unblock the app after 5s
    const timeout = setTimeout(() => {
      console.warn("[Auth] Firebase Auth timed out — proceeding unauthenticated");
      setLoading(false);
    }, 5000);

    // Listen for auth state changes (sign-in / sign-out)
    const unsubscribe = auth.onAuthStateChanged(async (currentUser: any) => {
      clearTimeout(timeout);
      if (currentUser) {
        try {
          // Force refresh the token to ensure we have a valid one
          const token = await currentUser.getIdToken(true);
          setSession({ access_token: token });
          setUser({
            id: currentUser.uid,
            email: currentUser.email,
          });
        } catch (err) {
          console.error("[Auth] Failed to get Firebase ID token:", err);
          setSession(null);
          setUser(null);
        }
      } else {
        setSession(null);
        setUser(null);
      }
      setLoading(false);
    });

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      await auth.signOut();
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

