import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

// Secure storage adapter for Supabase Auth in React Native
const secureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (e) {
      console.error("[SecureStoreAdapter] Error getting item:", e);
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (e) {
      console.error("[SecureStoreAdapter] Error setting item:", e);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (e) {
      console.error("[SecureStoreAdapter] Error removing item:", e);
    }
  },
};

const supabaseUrl: string =
  (Constants.expoConfig?.extra?.supabaseUrl as string) ||
  (process.env.EXPO_PUBLIC_SUPABASE_URL as string) ||
  "";

const supabaseAnonKey: string =
  (Constants.expoConfig?.extra?.supabaseAnonKey as string) ||
  (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string) ||
  "";

/**
 * A no-op stub that safely handles all Supabase calls when credentials
 * are not configured, instead of crashing the app on init.
 */
function createNoopClient(): SupabaseClient {
  // Return a minimal stub so the rest of the app doesn't crash
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: async () => ({ data: {}, error: { message: "Supabase not configured" } }),
      signUp: async () => ({ data: {}, error: { message: "Supabase not configured" } }),
      signOut: async () => ({ error: null }),
    },
    from: () => ({
      select: () => ({ data: [], error: null }),
      upsert: async () => ({ data: null, error: null }),
      insert: async () => ({ data: null, error: null }),
    }),
  } as unknown as SupabaseClient;
}

let _supabase: SupabaseClient;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[Supabase] Warning: Supabase URL or Anon Key is missing. Using no-op client."
  );
  _supabase = createNoopClient();
} else {
  try {
    _supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: secureStoreAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  } catch (err) {
    console.error("[Supabase] Failed to create client:", err);
    _supabase = createNoopClient();
  }
}

export const supabase = _supabase;
