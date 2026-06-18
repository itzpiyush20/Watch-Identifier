import { create } from "zustand";
import type { IdentifyResponse } from "@/types";

interface ScanStore {
  result: IdentifyResponse | null;
  imageUri: string | null;
  setResult: (result: IdentifyResponse, imageUri: string | null) => void;
  clear: () => void;
}

/** Carries the current scan result across the scan→results navigation boundary.
 *  Cleared when the user leaves the results screen or starts a new scan. */
export const useScanStore = create<ScanStore>((set) => ({
  result: null,
  imageUri: null,
  setResult: (result, imageUri) => set({ result, imageUri }),
  clear: () => set({ result: null, imageUri: null }),
}));
