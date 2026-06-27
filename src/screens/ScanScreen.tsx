import React, { useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Alert,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { colors, spacing, typography, radius } from "@/theme";
import { ReticleOverlay } from "@/components/scanner/ReticleOverlay";
import { CaptureButton } from "@/components/scanner/CaptureButton";
import { FlashToggle } from "@/components/scanner/FlashToggle";
import { processImageForUpload } from "@/utils/imageUtils";
import { hashImageBase64 } from "@/utils/imageHash";
import { identifyWatch, ApiClientError } from "@/services/api";
import { track } from "@/services/analytics";
import { useScanCache } from "@/hooks/useScanCache";
import { useScanStore } from "@/store/scanStore";
import { useAuth } from "@/hooks/useAuth";
import { useCountryCode } from "@/hooks/useCountryCode";

const { height: SCREEN_H } = Dimensions.get("window");

type ScanStatus =
  | { kind: "idle" }
  | { kind: "processing"; label: string }
  | { kind: "error"; message: string; retryable: boolean; code?: string };

interface RawCapture {
  uri: string;
  width: number;
  height: number;
}

export function ScanScreen() {
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [flashOn, setFlashOn] = useState(false);
  const [status, setStatus] = useState<ScanStatus>({ kind: "idle" });
  // Two-step capture: front (dial) first, then case back for authenticity checks.
  const [stage, setStage] = useState<"front" | "back">("front");
  const [frontCapture, setFrontCapture] = useState<RawCapture | null>(null);
  const [showGuidelines, setShowGuidelines] = useState(true);

  const { session, user } = useAuth();
  const { countryCode } = useCountryCode();
  const scanCache = useScanCache();
  const setResult = useScanStore((s) => s.setResult);

  const isProcessing = status.kind === "processing";

  const resetCapture = useCallback(() => {
    setStage("front");
    setFrontCapture(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Core scan pipeline — runs once we have the front (and optionally back) shot.
  // ---------------------------------------------------------------------------
  const runPipeline = useCallback(
    async (front: RawCapture, back: RawCapture | null): Promise<void> => {
      void track("scan_started", { has_back_image: back != null }, session?.access_token);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      setStatus({ kind: "processing", label: "Optimizing images…" });
      let processedFront;
      let processedBack;
      try {
        processedFront = await processImageForUpload(front.uri, front.width, front.height);
        if (back) {
          processedBack = await processImageForUpload(back.uri, back.width, back.height);
        }
      } catch (err) {
        setStatus({
          kind: "error",
          message: (err as Error).message ?? "Image processing failed.",
          retryable: true,
        });
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        resetCapture();
        return;
      }

      setStatus({ kind: "processing", label: "Checking local cache…" });
      const hash = await hashImageBase64(processedFront.base64, processedBack?.base64);
      const cached = await scanCache.get(hash);
      if (cached) {
        setResult(cached, processedFront.uri);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.push("/results");
        setStatus({ kind: "idle" });
        resetCapture();
        return;
      }

      setStatus({ kind: "processing", label: "Identifying watch…" });
      try {
        const result = await identifyWatch({
          imageBase64: processedFront.base64,
          imageBase64Back: processedBack?.base64,
          countryCode,
          accessToken: session?.access_token,
          userId: user?.id,
        });
        await scanCache.set(hash, result);
        setResult(result, processedFront.uri);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.push("/results");
        setStatus({ kind: "idle" });
        resetCapture();
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Identification failed. Try again.";
        const code = err instanceof ApiClientError ? err.code : undefined;
        setStatus({ kind: "error", message, retryable: true, code });
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        if (code !== "IMAGE_QUALITY_BAD") {
          resetCapture();
        }
      }
    },
    [scanCache, setResult, router, session, user, resetCapture, countryCode]
  );

  /** Routes a freshly captured/picked image to the right step of the flow. */
  const handleRawCapture = useCallback(
    async (raw: RawCapture) => {
      if (stage === "front") {
        setFrontCapture(raw);
        setStage("back");
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      }
      // stage === "back"
      if (!frontCapture) {
        // Shouldn't happen, but fall back to treating this as the front shot.
        setFrontCapture(raw);
        return;
      }
      await runPipeline(frontCapture, raw);
    },
    [stage, frontCapture, runPipeline]
  );

  const handleSkipBack = useCallback(() => {
    if (!frontCapture || isProcessing) return;
    void runPipeline(frontCapture, null);
  }, [frontCapture, isProcessing, runPipeline]);

  // ---------------------------------------------------------------------------
  // Capture from camera
  // ---------------------------------------------------------------------------
  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || isProcessing) return;
    const photo = await cameraRef.current.takePictureAsync({
      quality: 0.85,
    });
    if (!photo) return;
    await handleRawCapture({ uri: photo.uri, width: photo.width, height: photo.height });
  }, [isProcessing, handleRawCapture]);

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
    await handleRawCapture({ uri: asset.uri, width: asset.width, height: asset.height });
  }, [isProcessing, handleRawCapture]);

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

      {/* Step Indicator Banner */}
      {!showGuidelines && status.kind !== "processing" && !(status.kind === "error" && status.code === "IMAGE_QUALITY_BAD") && (
        <SafeAreaView style={styles.stepBannerContainer} edges={["top"]}>
          <View style={styles.stepBanner}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>
                {stage === "front" ? "STEP 1 OF 2" : "STEP 2 OF 2"}
              </Text>
            </View>
            <Text style={styles.stepTitle}>
              {stage === "front" ? "Capture Dial / Front" : "Capture Case Back"}
            </Text>
            <Text style={styles.stepDesc}>
              {stage === "front"
                ? "Center the watch dial inside the circle. Avoid reflections."
                : "Flip watch over. Scan details, serial markings, or logo."}
            </Text>
          </View>
        </SafeAreaView>
      )}

      {/* Status label */}
      {status.kind === "processing" && (
        <View style={styles.statusBanner}>
          <Text style={styles.statusText}>{status.label}</Text>
        </View>
      )}

      {status.kind === "error" && status.code !== "IMAGE_QUALITY_BAD" && (
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
            disabled={isProcessing}
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
          {stage === "front"
            ? "Centre the watch dial within the circle"
            : "Now flip the watch and capture the case back for an authenticity check"}
        </Text>

        {stage === "back" && (
          <Pressable onPress={handleSkipBack} disabled={isProcessing} hitSlop={12}>
            <Text style={styles.skipText}>Skip — identify from front only</Text>
          </Pressable>
        )}
      </SafeAreaView>

      {/* Guidelines Modal Overlay */}
      {showGuidelines && (
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.guidelinesBackdrop} />
          <SafeAreaView style={styles.guidelinesContainer} edges={["top", "bottom"]}>
            <View style={styles.guidelinesCard}>
              <View style={styles.guidelinesHeader}>
                <Ionicons name="camera" size={28} color={colors.gold} />
                <Text style={styles.guidelinesTitle}>Watch Vault Scanner</Text>
              </View>
              
              <Text style={styles.guidelinesIntro}>
                Follow these essential tips for accurate watch identification and authenticity check:
              </Text>

              <View style={styles.guidelineItems}>
                <View style={styles.guidelineRow}>
                  <Ionicons name="sunny" size={20} color={colors.gold} style={styles.guidelineIcon} />
                  <View style={styles.guidelineText}>
                    <Text style={styles.guidelineLabel}>Avoid Glare & Shadow</Text>
                    <Text style={styles.guidelineDesc}>Capture in clean, indirect lighting. Tilt slightly to prevent bright reflections on the glass.</Text>
                  </View>
                </View>

                <View style={styles.guidelineRow}>
                  <Ionicons name="hand-right" size={20} color={colors.gold} style={styles.guidelineIcon} />
                  <View style={styles.guidelineText}>
                    <Text style={styles.guidelineLabel}>Hold Steady & Focus</Text>
                    <Text style={styles.guidelineDesc}>Hold your phone steady. Blur or haze makes text and dial details impossible to read.</Text>
                  </View>
                </View>

                <View style={styles.guidelineRow}>
                  <Ionicons name="albums" size={20} color={colors.gold} style={styles.guidelineIcon} />
                  <View style={styles.guidelineText}>
                    <Text style={styles.guidelineLabel}>Two Photos Required</Text>
                    <Text style={styles.guidelineDesc}>You must capture two images: Dial (Front) first, then Case Back (Back) to complete the verification.</Text>
                  </View>
                </View>
              </View>

              <Pressable style={styles.guidelinesBtn} onPress={() => setShowGuidelines(false)}>
                <Text style={styles.guidelinesBtnText}>Start Scanning</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      )}

      {/* Blurry / Quality Check Error Overlay */}
      {status.kind === "error" && status.code === "IMAGE_QUALITY_BAD" && (
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.guidelinesBackdrop} />
          <SafeAreaView style={styles.guidelinesContainer} edges={["top", "bottom"]}>
            <View style={[styles.guidelinesCard, { borderColor: colors.danger }]}>
              <View style={styles.guidelinesHeader}>
                <Ionicons name="alert-circle" size={32} color={colors.danger} />
                <Text style={[styles.guidelinesTitle, { color: colors.danger }]}>Image Unclear</Text>
              </View>

              <Text style={styles.qualityErrorMsg}>{status.message}</Text>
              
              <Text style={styles.qualityErrorHint}>
                Please hold the camera steady, wipe your lens, and ensure there is no direct light reflecting off the crystal watch glass.
              </Text>

              <Pressable
                style={[styles.guidelinesBtn, { backgroundColor: colors.danger }]}
                onPress={() => {
                  setStatus({ kind: "idle" });
                  resetCapture();
                }}
              >
                <Text style={styles.guidelinesBtnText}>Retake Photo</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      )}
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
  hint: { ...typography.caption, color: "rgba(255,255,255,0.5)", textAlign: "center" },
  skipText: { ...typography.label, color: colors.gold, textDecorationLine: "underline" },

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

  // ------------ Step indicator banner ----------------------------------------
  stepBannerContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: spacing.md,
    zIndex: 10,
  },
  stepBanner: {
    backgroundColor: "rgba(20, 20, 22, 0.95)",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
    marginTop: spacing.md,
  },
  stepBadge: {
    backgroundColor: "rgba(201, 162, 75, 0.15)",
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs - 2,
    marginBottom: spacing.xs,
  },
  stepBadgeText: {
    ...typography.label,
    color: colors.gold,
    fontSize: 10,
  },
  stepTitle: {
    ...typography.heading,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  stepDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
    fontSize: 11,
  },

  // ------------ guidelines overlay -------------------------------------------
  guidelinesBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(11, 11, 12, 0.9)",
  },
  guidelinesContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  guidelinesCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.goldMuted,
    padding: spacing.lg,
    width: "100%",
    maxWidth: 380,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  guidelinesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  guidelinesTitle: {
    ...typography.title,
    color: colors.textPrimary,
    fontSize: 20,
  },
  guidelinesIntro: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  guidelineItems: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  guidelineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  guidelineIcon: {
    marginTop: 2,
  },
  guidelineText: {
    flex: 1,
  },
  guidelineLabel: {
    ...typography.label,
    color: colors.textPrimary,
    fontSize: 13,
    marginBottom: 2,
  },
  guidelineDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  guidelinesBtn: {
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  guidelinesBtnText: {
    ...typography.label,
    color: colors.textOnGold,
    fontSize: 14,
  },

  // ------------ quality check error overlay ----------------------------------
  qualityErrorMsg: {
    ...typography.body,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.md,
    textAlign: "left",
  },
  qualityErrorHint: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: spacing.lg,
    textAlign: "left",
  },
});
