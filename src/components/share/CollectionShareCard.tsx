import React, { forwardRef } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import Constants from "expo-constants";
import { colors, spacing, typography, radius } from "@/theme";
import { formatCurrency } from "@/utils/format";
import type { PortfolioEntry } from "@/types";

interface CollectionShareCardProps {
  entries: PortfolioEntry[];
  totalValue: number;
  currency: string;
}

const appName = (Constants.expoConfig?.name as string) ?? "The Watch Identifier";

/** Fixed-layout branded collection-summary card, rendered off-screen and captured to PNG. */
export const CollectionShareCard = forwardRef<View, CollectionShareCardProps>(
  ({ entries, totalValue, currency }, ref) => {
    const thumbnails = entries.slice(0, 6);
    return (
      <View ref={ref} style={styles.card} collapsable={false}>
        <Text style={styles.title}>My Collection</Text>
        <Text style={styles.subtitle}>
          {entries.length} timepiece{entries.length === 1 ? "" : "s"} · est.{" "}
          {formatCurrency(totalValue, currency)}
        </Text>
        <View style={styles.grid}>
          {thumbnails.map((entry) => (
            <View key={entry.id} style={styles.thumbWrap}>
              {entry.image_uri ? (
                <Image source={{ uri: entry.image_uri }} style={styles.thumb} />
              ) : (
                <View style={styles.thumbPlaceholder}>
                  <Text style={styles.thumbEmoji}>🕒</Text>
                </View>
              )}
            </View>
          ))}
        </View>
        <Text style={styles.footer}>{appName}</Text>
      </View>
    );
  }
);
CollectionShareCard.displayName = "CollectionShareCard";

const styles = StyleSheet.create({
  card: {
    width: 360,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { ...typography.display, color: colors.textPrimary, fontSize: 24 },
  subtitle: { ...typography.body, color: colors.gold, fontSize: 14 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  thumbWrap: {
    width: 104,
    height: 104,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  thumb: { width: "100%", height: "100%", resizeMode: "cover" },
  thumbPlaceholder: { flex: 1, justifyContent: "center", alignItems: "center" },
  thumbEmoji: { fontSize: 28 },
  footer: {
    ...typography.label,
    color: colors.gold,
    fontSize: 12,
    marginTop: spacing.md,
    textAlign: "right",
  },
});
