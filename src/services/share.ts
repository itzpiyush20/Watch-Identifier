import type { RefObject } from "react";
import type { View } from "react-native";
import { Alert } from "react-native";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";

/**
 * Captures the referenced view as a PNG and opens the native OS share sheet.
 * Works generically across WhatsApp, Instagram, etc. — no per-platform SDK.
 */
export async function captureAndShare(
  ref: RefObject<View>,
  filename: string
): Promise<void> {
  try {
    const uri = await captureRef(ref, {
      format: "png",
      quality: 1,
    });

    const available = await Sharing.isAvailableAsync();
    if (!available) {
      Alert.alert("Sharing Unavailable", "Sharing is not supported on this device.");
      return;
    }

    await Sharing.shareAsync(uri, {
      mimeType: "image/png",
      dialogTitle: filename,
    });
  } catch (err) {
    console.error("[share] Failed to capture and share:", err);
    Alert.alert("Error", "Failed to share. Please try again.");
  }
}
