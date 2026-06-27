import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Image,
  Linking,
  Alert,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";
import { useScanStore } from "@/store/scanStore";
import { useRemoteConfig } from "@/hooks/useRemoteConfig";
import { useAuth } from "@/hooks/useAuth";
import { usePortfolio } from "@/hooks/usePortfolio";
import { colors, spacing, typography, radius } from "@/theme";
import { formatCurrency } from "@/utils/format";
import { track } from "@/services/analytics";
import { WatchShareCard } from "@/components/share/WatchShareCard";
import { captureAndShare } from "@/services/share";

export default function ResultsScreen() {
  const router = useRouter();
  const { result, imageUri, savedEntryId, setSavedEntryId, clear } = useScanStore();
  const config = useRemoteConfig();
  const { session, user } = useAuth();
  const { entries, save: saveToPortfolio, remove: removeFromPortfolio } = usePortfolio(user?.id);
  const [rating, setRating] = React.useState<"up" | "down" | null>(null);
  const [savingState, setSavingState] = React.useState<"idle" | "saving">("idle");
  const [selectedDoc, setSelectedDoc] = React.useState<{ uri: string; title: string } | null>(null);
  const shareCardRef = React.useRef<View>(null);

  if (!result) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.empty}>No scan result. Go back and scan a watch.</Text>
      </SafeAreaView>
    );
  }

  const { identification, market, request_id } = result;
  const savedEntry = savedEntryId != null ? entries.find((e) => e.id === savedEntryId) : null;
  const bestFor = savedEntry?.best_for ?? null;

  const handleShare = async () => {
    await captureAndShare(shareCardRef, `${identification.brand}-${identification.model_family}`);
  };

  // Determine confidence color and label
  const getConfidenceLevel = (score: number) => {
    if (score >= 0.85) {
      return { label: "High Confidence", color: colors.success };
    } else if (score >= 0.6) {
      return { label: "Medium Confidence", color: colors.warning };
    } else {
      return { label: "Review Required", color: colors.danger };
    }
  };

  const confidence = getConfidenceLevel(identification.confidence_score);

  const handleTradeIn = () => {
    void track(
      "trade_in_clicked",
      { request_id, brand: identification.brand, model_family: identification.model_family },
      session?.access_token
    );

    const number = config.partner_whatsapp_number;
    if (!number) return;

    const message = `Hello, I identified a watch using the Watch Identifier app:\n*Brand*: ${
      identification.brand
    }\n*Model*: ${identification.model_family}\n*Ref*: ${
      identification.reference_number ?? "N/A"
    }\n*AI Confidence*: ${Math.round(
      identification.confidence_score * 100
    )}%\n\nI would like to request a trade-in quote/professional valuation.`;

    const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;

    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(url);
        } else {
          Alert.alert("WhatsApp Not Found", "WhatsApp is not installed on this device.");
        }
      })
      .catch((err) => console.error("[Results] Link error:", err));
  };

  const handleRate = (value: "up" | "down") => {
    if (rating) return; // one rating per results view, matches spec
    setRating(value);
    void track(
      "result_rated",
      {
        request_id,
        brand: identification.brand,
        model_family: identification.model_family,
        reference_number: identification.reference_number,
        confidence_score: identification.confidence_score,
        rating: value,
      },
      session?.access_token
    );
  };

  const handleToggleCollection = async () => {
    if (savingState === "saving") return;
    if (savedEntryId == null) {
      setSavingState("saving");
      try {
        const id = await saveToPortfolio(result, imageUri, user?.id ?? null);
        setSavedEntryId(id);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err) {
        console.error("[Results] Failed to save to collection:", err);
        Alert.alert("Error", "Failed to add to collection. Please try again.");
      } finally {
        setSavingState("idle");
      }
    } else {
      Alert.alert(
        "Remove from Collection",
        "This removes the watch from your collection. This cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              try {
                await removeFromPortfolio(savedEntryId);
                setSavedEntryId(null);
              } catch (err) {
                console.error("[Results] Failed to remove from collection:", err);
                Alert.alert("Error", "Failed to remove from collection. Please try again.");
              }
            },
          },
        ]
      );
    }
  };

  const hasCaution = identification.authenticity_caution.level !== "none";
  const isHighCaution = identification.authenticity_caution.level === "high_caution";

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Watch Image Header */}
        <View style={styles.imageCard}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.watchImage} />
          ) : (
            <View style={styles.placeholderWatchImage}>
              <Text style={styles.placeholderEmoji}>🕒</Text>
            </View>
          )}
        </View>

        {/* Brand & Model Details */}
        <View style={styles.detailsCard}>
          <Text style={styles.kicker}>IDENTIFIED TIMEPIECE</Text>
          <Text style={styles.brand}>{identification.brand}</Text>
          <Text style={styles.model}>{identification.model_family}</Text>

          {identification.reference_number && (
            <View style={styles.refBadge}>
              <Text style={styles.refText}>Ref. {identification.reference_number}</Text>
            </View>
          )}

          {bestFor && (
            <View style={styles.bestForPill}>
              <Text style={styles.bestForPillText}>{bestFor}</Text>
            </View>
          )}

          {/* Confidence Score Bar */}
          <View style={styles.confidenceRow}>
            <View style={[styles.indicatorDot, { backgroundColor: confidence.color }]} />
            <Text style={[styles.confidenceLabel, { color: confidence.color }]}>
              {confidence.label} ({Math.round(identification.confidence_score * 100)}%)
            </Text>
          </View>
        </View>

        {/* Authenticity Warning Card */}
        {hasCaution && config.feature_flags.authenticityCaution && (
          <View
            style={[
              styles.cautionCard,
              { borderColor: isHighCaution ? colors.danger : colors.warning },
            ]}
          >
            <Text
              style={[
                styles.cautionTitle,
                { color: isHighCaution ? colors.danger : colors.warning },
              ]}
            >
              ⚠️ {isHighCaution ? "High Authenticity Caution" : "Verification Recommended"}
            </Text>
            <Text style={styles.cautionBody}>
              {identification.authenticity_caution.note}
            </Text>
          </View>
        )}

        {/* Valuation Estimation Visualizer */}
        {market.median_estimate != null && (
          <View style={styles.valuationCard}>
            <Text style={styles.kicker}>ESTIMATED MARKET VALUE</Text>
            <Text style={styles.medianPrice}>
              {formatCurrency(market.median_estimate, market.currency)}
            </Text>

            {/* Custom Range Slider Track */}
            <View style={styles.rangeContainer}>
              <View style={styles.rangeTrack} />
              <View style={styles.rangePoints}>
                <View style={styles.pointItem}>
                  <View style={styles.pointDot} />
                  <Text style={styles.pointLabel}>Low</Text>
                  <Text style={styles.pointVal}>
                    {formatCurrency(market.low_estimate, market.currency)}
                  </Text>
                </View>
                <View style={styles.pointItem}>
                  <View style={[styles.pointDot, styles.activeDot]} />
                  <Text style={[styles.pointLabel, styles.activeLabel]}>Median</Text>
                  <Text style={[styles.pointVal, styles.activeVal]}>
                    {formatCurrency(market.median_estimate, market.currency)}
                  </Text>
                </View>
                <View style={styles.pointItem}>
                  <View style={styles.pointDot} />
                  <Text style={styles.pointLabel}>High</Text>
                  <Text style={styles.pointVal}>
                    {formatCurrency(market.high_estimate, market.currency)}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={styles.disclaimer}>{market.disclaimer}</Text>
          </View>
        )}

        {/* WhatsApp Trade-In Call to Action */}
        {config.feature_flags.tradeInCta && config.partner_whatsapp_number && (
          <Pressable style={styles.tradeInBtn} onPress={handleTradeIn}>
            <Text style={styles.tradeInBtnText}>Request Professional Valuation</Text>
            <Text style={styles.tradeInSubtext}>Via Partner WhatsApp Business</Text>
          </Pressable>
        )}

        {/* Suggested Additional Image */}
        {identification.additional_image_hint && (
          <View style={styles.hintCard}>
            <Text style={styles.hintTitle}>📷 Improve Accuracy</Text>
            <Text style={styles.hintBody}>{identification.additional_image_hint}</Text>
          </View>
        )}

        {/* Specifications */}
        {identification.visual_fingerprint && (
          <View style={styles.specsCard}>
            <Text style={styles.kicker}>SPECIFICATIONS</Text>
            {identification.visual_fingerprint.case.shape && (
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Case shape</Text>
                <Text style={styles.specValue}>{identification.visual_fingerprint.case.shape}</Text>
              </View>
            )}
            {identification.visual_fingerprint.case.material_appearance && (
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Case material</Text>
                <Text style={styles.specValue}>
                  {identification.visual_fingerprint.case.material_appearance}
                </Text>
              </View>
            )}
            {identification.visual_fingerprint.case.bezel_type && (
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Bezel type</Text>
                <Text style={styles.specValue}>{identification.visual_fingerprint.case.bezel_type}</Text>
              </View>
            )}
            {identification.visual_fingerprint.dial.primary_color && (
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Dial color</Text>
                <Text style={styles.specValue}>
                  {identification.visual_fingerprint.dial.primary_color}
                </Text>
              </View>
            )}
            {identification.visual_fingerprint.dial.texture_pattern && (
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Dial texture</Text>
                <Text style={styles.specValue}>
                  {identification.visual_fingerprint.dial.texture_pattern}
                </Text>
              </View>
            )}
            {identification.visual_fingerprint.dial.hour_markers_type && (
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Hour markers</Text>
                <Text style={styles.specValue}>
                  {identification.visual_fingerprint.dial.hour_markers_type}
                </Text>
              </View>
            )}
            {identification.visual_fingerprint.dial.hands_style && (
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Hands style</Text>
                <Text style={styles.specValue}>
                  {identification.visual_fingerprint.dial.hands_style}
                </Text>
              </View>
            )}
            {identification.visual_fingerprint.strap_or_bracelet.type && (
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Strap/bracelet</Text>
                <Text style={styles.specValue}>
                  {identification.visual_fingerprint.strap_or_bracelet.type}
                </Text>
              </View>
            )}
            {identification.visual_fingerprint.strap_or_bracelet.material && (
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Strap material</Text>
                <Text style={styles.specValue}>
                  {identification.visual_fingerprint.strap_or_bracelet.material}
                </Text>
              </View>
            )}
            {identification.visual_fingerprint.complications_visible.length > 0 && (
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Complications</Text>
                <Text style={styles.specValue}>
                  {identification.visual_fingerprint.complications_visible.join(", ")}
                </Text>
              </View>
            )}
            <Text style={styles.disclaimer}>
              AI-estimated from photos; verify before purchase or insurance decisions.
            </Text>
          </View>
        )}

        {/* Result Rating */}
        <View style={styles.ratingCard}>
          <Text style={styles.ratingTitle}>Was this identification correct?</Text>
          {rating ? (
            <Text style={styles.ratingThanks}>Thanks for the feedback.</Text>
          ) : (
            <View style={styles.ratingRow}>
              <Pressable
                style={styles.ratingBtn}
                onPress={() => handleRate("up")}
                accessibilityLabel="Rate identification as correct"
              >
                <Text style={styles.ratingBtnText}>👍 Yes</Text>
              </Pressable>
              <Pressable
                style={styles.ratingBtn}
                onPress={() => handleRate("down")}
                accessibilityLabel="Rate identification as incorrect"
              >
                <Text style={styles.ratingBtnText}>👎 No</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Alternative Possible Matches */}
        {identification.possible_matches && identification.possible_matches.length > 0 && (
          <View style={styles.matchesCard}>
            <Text style={styles.kicker}>POTENTIAL ALTERNATIVES</Text>
            {identification.possible_matches.map((match, idx) => (
              <View key={idx} style={styles.matchRow}>
                <View style={styles.matchInfo}>
                  <Text style={styles.matchBrand}>{match.brand}</Text>
                  <Text style={styles.matchModel}>
                    {match.model_family}
                    {match.reference_number ? ` (Ref: ${match.reference_number})` : ""}
                  </Text>
                </View>
                <Text style={styles.matchScore}>
                  {Math.round(match.confidence_score * 100)}% Match
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Documentation Vault Section */}
        {savedEntryId != null && savedEntry && (
          <View style={styles.vaultCard}>
            <View style={styles.vaultHeader}>
              <Ionicons name="folder-open" size={16} color={colors.gold} />
              <Text style={styles.vaultKicker}>DOCUMENTATION VAULT</Text>
            </View>

            <View style={styles.vaultRow}>
              {/* Receipt */}
              <View style={styles.vaultItem}>
                <Text style={styles.vaultLabel}>Purchase Receipt</Text>
                {savedEntry.receipt_image_uri ? (
                  <Pressable
                    style={styles.vaultThumbnailWrapper}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setSelectedDoc({ uri: savedEntry.receipt_image_uri!, title: "Purchase Receipt" });
                    }}
                  >
                    <Image source={{ uri: savedEntry.receipt_image_uri }} style={styles.vaultThumbnail} />
                    <View style={styles.zoomOverlay}>
                      <Ionicons name="eye-outline" size={18} color="#fff" />
                    </View>
                  </Pressable>
                ) : (
                  <Pressable
                    style={styles.vaultPlaceholder}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      router.push("/edit-watch");
                    }}
                  >
                    <Ionicons name="add-circle" size={24} color={colors.textTertiary} />
                    <Text style={styles.vaultPlaceholderText}>Add Receipt</Text>
                  </Pressable>
                )}
              </View>

              {/* Certificate */}
              <View style={styles.vaultItem}>
                <Text style={styles.vaultLabel}>Warranty / Cert</Text>
                {savedEntry.certificate_image_uri ? (
                  <Pressable
                    style={styles.vaultThumbnailWrapper}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setSelectedDoc({ uri: savedEntry.certificate_image_uri!, title: "Warranty Certificate" });
                    }}
                  >
                    <Image source={{ uri: savedEntry.certificate_image_uri }} style={styles.vaultThumbnail} />
                    <View style={styles.zoomOverlay}>
                      <Ionicons name="eye-outline" size={18} color="#fff" />
                    </View>
                  </Pressable>
                ) : (
                  <Pressable
                    style={styles.vaultPlaceholder}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      router.push("/edit-watch");
                    }}
                  >
                    <Ionicons name="add-circle" size={24} color={colors.textTertiary} />
                    <Text style={styles.vaultPlaceholderText}>Add Cert</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Footer controls */}
      <View style={styles.actions}>
        <Pressable style={styles.shareBtn} onPress={handleShare}>
          <Text style={styles.shareBtnText}>Share</Text>
        </Pressable>
        {savedEntryId != null && (
          <Pressable
            style={styles.editBtn}
            onPress={() => router.push("/edit-watch")}
          >
            <Text style={styles.editBtnText}>Edit Details</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.collectionBtn, savedEntryId != null && styles.collectionBtnSaved]}
          onPress={handleToggleCollection}
          disabled={savingState === "saving"}
        >
          <Text
            style={[
              styles.collectionBtnText,
              savedEntryId != null && styles.collectionBtnTextSaved,
            ]}
          >
            {savingState === "saving"
              ? "Saving…"
              : savedEntryId != null
                ? "Remove from Collection"
                : "Add to Collection"}
          </Text>
        </Pressable>
        <Pressable
          style={styles.scanBtn}
          onPress={() => {
            clear();
            router.back();
          }}
        >
          <Text style={styles.scanBtnText}>Scan Another</Text>
        </Pressable>
      </View>

      {/* Full-screen Document Viewer Modal */}
      {selectedDoc && (
        <Modal
          visible={!!selectedDoc}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setSelectedDoc(null)}
        >
          <View style={styles.modalContainer}>
            <Pressable style={styles.modalBackdrop} onPress={() => setSelectedDoc(null)} />
            <SafeAreaView style={styles.modalContent} edges={["top", "bottom"]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{selectedDoc.title}</Text>
                <Pressable onPress={() => setSelectedDoc(null)} style={styles.modalCloseBtn} hitSlop={12}>
                  <Ionicons name="close" size={24} color="#fff" />
                </Pressable>
              </View>
              <Image source={{ uri: selectedDoc.uri }} style={styles.modalImage} />
            </SafeAreaView>
          </View>
        </Modal>
      )}

      <View style={styles.offscreen} pointerEvents="none">
        <WatchShareCard
          ref={shareCardRef}
          identification={identification}
          market={market}
          imageUri={imageUri}
          bestFor={bestFor}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  empty: { ...typography.body, color: colors.textSecondary, margin: spacing.xl },

  // Image Header
  imageCard: {
    height: 240,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  watchImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  placeholderWatchImage: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderEmoji: {
    fontSize: 64,
  },

  // Details
  detailsCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  kicker: { ...typography.label, color: colors.goldMuted, fontSize: 10, letterSpacing: 1 },
  brand: { ...typography.display, color: colors.textPrimary, fontSize: 28 },
  model: { ...typography.title, color: colors.textSecondary, fontSize: 20 },
  refBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.xs,
  },
  refText: { ...typography.caption, color: colors.textSecondary, fontSize: 11 },
  bestForPill: {
    alignSelf: "flex-start",
    borderColor: colors.goldMuted,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginTop: spacing.xs,
  },
  bestForPillText: { ...typography.caption, color: colors.goldMuted, fontSize: 11 },
  confidenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  indicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  confidenceLabel: {
    ...typography.label,
    fontSize: 12,
  },

  // Caution Card
  cautionCard: {
    backgroundColor: "rgba(210,100,90,0.05)",
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cautionTitle: { ...typography.heading, fontSize: 15 },
  cautionBody: { ...typography.body, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },

  // Valuation Card
  valuationCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  medianPrice: { ...typography.display, color: colors.gold, fontSize: 32 },
  rangeContainer: {
    marginVertical: spacing.md,
    position: "relative",
    height: 60,
    justifyContent: "center",
  },
  rangeTrack: {
    height: 3,
    backgroundColor: colors.border,
    position: "absolute",
    left: spacing.sm,
    right: spacing.sm,
    top: 15,
  },
  rangePoints: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  pointItem: {
    alignItems: "center",
    width: 90,
  },
  pointDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.textTertiary,
    borderWidth: 2,
    borderColor: colors.surface,
    marginBottom: 4,
  },
  activeDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.gold,
    borderColor: colors.surface,
  },
  pointLabel: { ...typography.caption, color: colors.textTertiary, fontSize: 9 },
  activeLabel: { color: colors.gold, fontWeight: "600" },
  pointVal: { ...typography.caption, color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  activeVal: { color: colors.textPrimary, fontWeight: "600", fontSize: 12 },
  disclaimer: { ...typography.caption, color: colors.textTertiary, fontStyle: "italic", marginTop: spacing.xs },

  // Trade-In Button
  tradeInBtn: {
    backgroundColor: "transparent",
    borderColor: colors.gold,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  tradeInBtnText: { ...typography.label, color: colors.gold, fontSize: 16 },
  tradeInSubtext: { ...typography.caption, color: colors.goldMuted, fontSize: 10 },

  // Additional Image Hint Card
  hintCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  hintTitle: { ...typography.label, color: colors.textPrimary, fontSize: 13 },
  hintBody: { ...typography.body, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },

  // Rating Card
  ratingCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  ratingTitle: { ...typography.label, color: colors.textPrimary, fontSize: 13 },
  ratingThanks: { ...typography.body, color: colors.textSecondary, fontSize: 13 },
  ratingRow: { flexDirection: "row", gap: spacing.sm },
  ratingBtn: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  ratingBtnText: { ...typography.label, color: colors.textPrimary, fontSize: 14 },

  // Specifications Card
  specsCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  specRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.xs,
    marginBottom: spacing.xs,
  },
  specLabel: { ...typography.caption, color: colors.textTertiary, fontSize: 12 },
  specValue: { ...typography.body, color: colors.textPrimary, fontSize: 13, textAlign: "right", flex: 1, marginLeft: spacing.sm },

  // Alternatives Card
  matchesCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  matchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
    marginBottom: spacing.xs,
  },
  matchInfo: {
    gap: 2,
    flex: 1,
  },
  matchBrand: { ...typography.label, color: colors.textPrimary, fontSize: 13 },
  matchModel: { ...typography.caption, color: colors.textSecondary },
  matchScore: { ...typography.caption, color: colors.goldMuted },

  // Actions
  actions: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  scanBtn: {
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
  },
  scanBtnText: { ...typography.label, color: colors.textOnGold },
  collectionBtn: {
    backgroundColor: "transparent",
    borderColor: colors.gold,
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  collectionBtnSaved: {
    borderColor: colors.danger,
  },
  collectionBtnText: { ...typography.label, color: colors.gold },
  collectionBtnTextSaved: { color: colors.danger },
  shareBtn: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  shareBtnText: { ...typography.label, color: colors.textPrimary },
  editBtn: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  editBtnText: { ...typography.label, color: colors.gold },
  offscreen: {
    position: "absolute",
    top: -9999,
    left: -9999,
  },

  // ------------ Documentation Vault styles ---------------------------------
  vaultCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  vaultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingBottom: spacing.xs,
  },
  vaultKicker: {
    ...typography.label,
    color: colors.goldMuted,
    fontSize: 11,
    letterSpacing: 1,
  },
  vaultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  vaultItem: {
    flex: 1,
    alignItems: "center",
  },
  vaultLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    fontSize: 12,
  },
  vaultThumbnailWrapper: {
    width: "100%",
    height: 120,
    borderRadius: radius.sm,
    overflow: "hidden",
    position: "relative",
  },
  vaultThumbnail: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  zoomOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
  },
  vaultPlaceholder: {
    width: "100%",
    height: 120,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    backgroundColor: colors.surfaceElevated,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xs,
  },
  vaultPlaceholderText: {
    ...typography.caption,
    color: colors.textTertiary,
    fontSize: 11,
  },

  // ------------ Zoom Viewer Modal styles ------------------------------------
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.95)",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    width: "100%",
    height: "100%",
    justifyContent: "space-between",
    padding: spacing.md,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: spacing.md,
  },
  modalTitle: {
    ...typography.heading,
    color: "#fff",
  },
  modalCloseBtn: {
    padding: 8,
  },
  modalImage: {
    flex: 1,
    width: "100%",
    height: "100%",
    resizeMode: "contain",
    marginVertical: spacing.md,
  },
});
