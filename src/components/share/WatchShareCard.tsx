import React, { forwardRef } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import Constants from "expo-constants";
import { colors, spacing, typography, radius } from "@/theme";
import { formatCurrency } from "@/utils/format";
import type { Identification, MarketRange } from "@/types";

interface WatchShareCardProps {
  identification: Identification;
  market: MarketRange;
  imageUri: string | null;
}

const appName = (Constants.expoConfig?.name as string) ?? "The Watch Identifier";

/** Fixed-layout branded card, rendered off-screen and captured to PNG for sharing. */
export const WatchShareCard = forwardRef<View, WatchShareCardProps>(
  ({ identification, market, imageUri }, ref) => {
    return (
      <View ref={ref} style={styles.card} collapsable={false}>
        <View style={styles.imageWrap}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.image} />
          ) : (
            <View style={styles.placeholderImage}>
              <Text style={styles.placeholderEmoji}>🕒</Text>
            </View>
          )}
        </View>
        <Text style={styles.brand}>{identification.brand}</Text>
        <Text style={styles.model}>{identification.model_family}</Text>
        {identification.reference_number && (
          <Text style={styles.ref}>Ref. {identification.reference_number}</Text>
        )}
        {market.median_estimate != null && (
          <View style={styles.valueRow}>
            <Text style={styles.valueLabel}>ESTIMATED VALUE</Text>
            <Text style={styles.value}>
              {formatCurrency(market.median_estimate, market.currency)}
            </Text>
          </View>
        )}
        <Text style={styles.confidence}>
          {Math.round(identification.confidence_score * 100)}% confidence
        </Text>
        <Text style={styles.footer}>{appName}</Text>
      </View>
    );
  }
);
WatchShareCard.displayName = "WatchShareCard";

const styles = StyleSheet.create({
  card: {
    width: 360,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  imageWrap: {
    height: 200,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: "hidden",
    marginBottom: spacing.sm,
  },
  image: { width: "100%", height: "100%", resizeMode: "cover" },
  placeholderImage: { flex: 1, justifyContent: "center", alignItems: "center" },
  placeholderEmoji: { fontSize: 48 },
  brand: { ...typography.display, color: colors.textPrimary, fontSize: 24 },
  model: { ...typography.title, color: colors.textSecondary, fontSize: 16 },
  ref: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  valueRow: { marginTop: spacing.sm },
  valueLabel: { ...typography.label, color: colors.goldMuted, fontSize: 10, letterSpacing: 1 },
  value: { ...typography.display, color: colors.gold, fontSize: 28 },
  confidence: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  footer: {
    ...typography.label,
    color: colors.gold,
    fontSize: 12,
    marginTop: spacing.md,
    textAlign: "right",
  },
});
