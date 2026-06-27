import auth from "@react-native-firebase/auth";
import firestore from "@react-native-firebase/firestore";

// Stub objects to prevent crashes on Expo Go or Web where native modules are not linked
const mockAuth = {
  currentUser: null,
  onAuthStateChanged: (callback: (user: any) => void) => {
    callback(null);
    return () => {};
  },
  signOut: async () => {},
  signInWithEmailAndPassword: async () => {
    throw new Error("Firebase Native Auth not linked (running in mock environment)");
  },
  createUserWithEmailAndPassword: async () => {
    throw new Error("Firebase Native Auth not linked (running in mock environment)");
  },
} as any;

const mockDb = {
  collection: () => ({
    doc: () => ({
      set: async () => {},
      delete: async () => {},
      get: async () => ({ exists: false, data: () => ({}) }),
    }),
  }),
  batch: () => ({
    set: () => {},
    commit: async () => {},
  }),
} as any;

let _auth: any;
let _db: any;

try {
  _auth = auth();
  _db = firestore();
} catch (err) {
  console.warn(
    "[Firebase] Native Firebase module not available (e.g. running in Expo Go or Web). Using mock fallback.",
    err
  );
  _auth = mockAuth;
  _db = mockDb;
}

export const firebaseAuth = _auth;
export const authInstance = _auth; // alias if needed
export const db = _db;
export const isConfigured = true; // Native SDK is configured via google-services.json
export { _auth as auth };
