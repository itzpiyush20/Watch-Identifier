import { create } from "zustand";
import type { IdentifyResponse } from "@/types";

interface ScanStore {
  result: IdentifyResponse | null;
  imageUri: string | null;
  savedEntryId: string | null; // null = not yet saved to the collection
  setResult: (
    result: IdentifyResponse,
    imageUri: string | null,
    savedEntryId?: string | null
  ) => void;
  setSavedEntryId: (id: string | null) => void;
  clear: () => void;
}

/** Carries the current scan result across the scan→results navigation boundary.
 *  Cleared when the user leaves the results screen or starts a new scan. */
export const useScanStore = create<ScanStore>((set) => ({
  result: null,
  imageUri: null,
  savedEntryId: null,
  setResult: (result, imageUri, savedEntryId = null) =>
    set({ result, imageUri, savedEntryId }),
  setSavedEntryId: (id) => set({ savedEntryId: id }),
  clear: () => set({ result: null, imageUri: null, savedEntryId: null }),
}));
