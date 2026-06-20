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
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useScanStore } from "@/store/scanStore";
import { useRemoteConfig } from "@/hooks/useRemoteConfig";
import { colors, spacing, typography, radius } from "@/theme";
import { formatCurrency } from "@/utils/format";

export default function ResultsScreen() {
  const router = useRouter();
  const { result, imageUri, clear } = useScanStore();
  const config = useRemoteConfig();

  if (!result) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.empty}>No scan result. Go back and scan a watch.</Text>
      </SafeAreaView>
    );
  }

  const { identification, market } = result;

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
      </ScrollView>

      {/* Footer controls */}
      <View style={styles.actions}>
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
});
