import React, { useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Alert,
  Platform,
} from "react-native";
import { CameraView, useCameraPermissions, type CameraType } from "expo-camera";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, spacing, typography } from "@/theme";
import { ReticleOverlay } from "@/components/scanner/ReticleOverlay";
import { CaptureButton } from "@/components/scanner/CaptureButton";
import { FlashToggle } from "@/components/scanner/FlashToggle";
import { processImageForUpload } from "@/utils/imageUtils";
import { hashImageBase64 } from "@/utils/imageHash";
import { identifyWatch } from "@/services/api";
import { useScanCache } from "@/hooks/useScanCache";
import { useDatabase } from "@/hooks/useDatabase";
import { useScanStore } from "@/store/scanStore";

const { height: SCREEN_H } = Dimensions.get("window");

type ScanStatus =
  | { kind: "idle" }
  | { kind: "processing"; label: string }
  | { kind: "error"; message: string; retryable: boolean };

export function ScanScreen() {
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [flashOn, setFlashOn] = useState(false);
  const [status, setStatus] = useState<ScanStatus>({ kind: "idle" });

  const { ready: dbReady } = useDatabase();
  const scanCache = useScanCache();
  const setResult = useScanStore((s) => s.setResult);

  const isProcessing = status.kind === "processing";

  // ---------------------------------------------------------------------------
  // Core scan pipeline
  // ---------------------------------------------------------------------------
  const runPipeline = useCallback(
    async (
      sourceUri: string,
      sourceWidth: number,
      sourceHeight: number
    ): Promise<void> => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      setStatus({ kind: "processing", label: "Optimizing image…" });
      let processed;
      try {
        processed = await processImageForUpload(sourceUri, sourceWidth, sourceHeight);
      } catch (err) {
        setStatus({
          kind: "error",
          message: (err as Error).message ?? "Image processing failed.",
          retryable: true,
        });
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      setStatus({ kind: "processing", label: "Checking local cache…" });
      const hash = await hashImageBase64(processed.base64);
      const cached = await scanCache.get(hash);
      if (cached) {
        setResult(cached, processed.uri);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.push("/results");
        setStatus({ kind: "idle" });
        return;
      }

      setStatus({ kind: "processing", label: "Identifying watch…" });
      try {
        // TODO Phase 5: pass real accessToken from Supabase session.
        const result = await identifyWatch({
          imageBase64: processed.base64,
          countryCode: "IN", // TODO Phase 6: resolve from expo-localization
          userId: undefined, // TODO Phase 5: real userId
        });
        await scanCache.set(hash, result);
        setResult(result, processed.uri);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.push("/results");
        setStatus({ kind: "idle" });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Identification failed. Try again.";
        setStatus({ kind: "error", message, retryable: true });
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    [scanCache, setResult, router]
  );

  // ---------------------------------------------------------------------------
  // Capture from camera
  // ---------------------------------------------------------------------------
  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || isProcessing) return;
    const photo = await cameraRef.current.takePictureAsync({
      quality: 1, // max from camera; we compress ourselves
      skipProcessing: true, // faster on Android
    });
    if (!photo) return;
    await runPipeline(photo.uri, photo.width, photo.height);
  }, [isProcessing, runPipeline]);

  // ---------------------------------------------------------------------------
  // Gallery fallback
  // ---------------------------------------------------------------------------
  const handleGallery = useCallback(async () => {
    if (isProcessing) return;
    const { status: libStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (libStatus !== "granted") {
      Alert.alert("Permission needed", "Grant photo library access to upload a watch image.");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsEditing: false,
    });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    await runPipeline(asset.uri, asset.width, asset.height);
  }, [isProcessing, runPipeline]);

  // ---------------------------------------------------------------------------
  // Permission states
  // ---------------------------------------------------------------------------
  if (!permission) {
    return <View style={styles.fill} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionBody}>
          The Watch Identifier uses your camera to scan watches. Images are
          processed to generate an estimate and are never stored on our servers.
        </Text>
        <Pressable style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>Grant Camera Access</Text>
        </Pressable>
        <Pressable style={[styles.permissionBtn, styles.permissionBtnSecondary]} onPress={handleGallery}>
          <Text style={styles.permissionBtnText}>Upload from Gallery</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.fill}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        flash={flashOn ? "on" : "off"}
      />

      <ReticleOverlay active={isProcessing} />

      {/* Status label */}
      {status.kind === "processing" && (
        <View style={styles.statusBanner}>
          <Text style={styles.statusText}>{status.label}</Text>
        </View>
      )}

      {status.kind === "error" && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{status.message}</Text>
          {status.retryable && (
            <Pressable onPress={() => setStatus({ kind: "idle" })}>
              <Text style={styles.retryText}>Tap to retry</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Controls */}
      <SafeAreaView style={styles.controls} edges={["bottom"]}>
        {/* Flash toggle */}
        <View style={styles.controlRow}>
          <FlashToggle on={flashOn} onToggle={() => setFlashOn((v) => !v)} />

          <CaptureButton
            onPress={handleCapture}
            disabled={!dbReady || isProcessing}
            loading={isProcessing}
          />

          {/* Gallery button */}
          <Pressable
            onPress={handleGallery}
            disabled={isProcessing}
            hitSlop={12}
            style={styles.galleryBtn}
            accessibilityLabel="Upload from gallery"
          >
            <Text style={styles.galleryText}>Gallery</Text>
          </Pressable>
        </View>

        <Text style={styles.hint}>
          Centre the watch dial within the circle
        </Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },

  // ------------ status banners -----------------------------------------------
  statusBanner: {
    position: "absolute",
    bottom: SCREEN_H * 0.22,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 20,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  statusText: { ...typography.label, color: colors.gold },

  errorBanner: {
    position: "absolute",
    bottom: SCREEN_H * 0.22,
    alignSelf: "center",
    backgroundColor: "rgba(180,60,50,0.85)",
    borderRadius: 12,
    padding: spacing.md,
    maxWidth: "80%",
    alignItems: "center",
    gap: spacing.xs,
  },
  errorText: { ...typography.body, color: colors.textPrimary, textAlign: "center" },
  retryText: { ...typography.label, color: colors.gold },

  // ------------ bottom controls -----------------------------------------------
  controls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "75%",
  },
  galleryBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  galleryText: { ...typography.caption, color: colors.textSecondary },
  hint: { ...typography.caption, color: "rgba(255,255,255,0.5)" },

  // ------------ permission screen -----------------------------------------------
  permissionContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.lg,
  },
  permissionTitle: { ...typography.title, color: colors.textPrimary },
  permissionBody: { ...typography.body, color: colors.textSecondary, lineHeight: 24 },
  permissionBtn: {
    backgroundColor: colors.gold,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  permissionBtnSecondary: { backgroundColor: colors.surfaceElevated },
  permissionBtnText: { ...typography.label, color: colors.textOnGold },
});
