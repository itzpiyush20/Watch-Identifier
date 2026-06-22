import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEntitlement } from "@/hooks/useEntitlement";
import { purchaseTier, type PaidTier } from "@/services/billing";
import { colors, spacing, typography, radius } from "@/theme";

interface PlanInfo {
  tier: PaidTier;
  name: string;
  price: string;
  scansPerDay: string;
  historyNote: string;
}

const PLANS: PlanInfo[] = [
  { tier: "collector", name: "Collector", price: "₹99/mo", scansPerDay: "15 scans/day", historyNote: "Last 90 days of history" },
  { tier: "connoisseur", name: "Connoisseur", price: "₹199/mo", scansPerDay: "50 scans/day", historyNote: "Unlimited history" },
  { tier: "vault", name: "Vault ⭐", price: "₹399/mo", scansPerDay: "Unlimited scans", historyNote: "Unlimited history + early access" },
];

export default function SubscriptionScreen() {
  const { entitlement } = useEntitlement();

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Upgrade for more scans per day and longer portfolio history.
        </Text>
        {PLANS.map((plan) => {
          const isCurrent = entitlement?.tier === plan.tier;
          return (
            <View
              key={plan.tier}
              style={[styles.planCard, isCurrent && styles.planCardActive]}
            >
              <View style={styles.planHeader}>
                <Text style={styles.planName}>{plan.name}</Text>
                <Text style={styles.planPrice}>{plan.price}</Text>
              </View>
              <Text style={styles.planDetail}>{plan.scansPerDay}</Text>
              <Text style={styles.planDetail}>{plan.historyNote}</Text>
              {isCurrent ? (
                <View style={styles.currentBadge}>
                  <Text style={styles.currentBadgeText}>Current Plan</Text>
                </View>
              ) : (
                <Pressable
                  style={styles.subscribeBtn}
                  onPress={() => void purchaseTier(plan.tier)}
                >
                  <Text style={styles.subscribeBtnText}>Subscribe</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  intro: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.sm },
  planCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  planCardActive: { borderColor: colors.gold },
  planHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  planName: { ...typography.heading, color: colors.textPrimary },
  planPrice: { ...typography.heading, color: colors.gold },
  planDetail: { ...typography.body, color: colors.textSecondary, fontSize: 13 },
  subscribeBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.gold,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  subscribeBtnText: { ...typography.label, color: colors.textOnGold },
  currentBadge: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  currentBadgeText: { ...typography.caption, color: colors.gold },
});
